#!/usr/bin/env python3
"""Atualiza cópias verificadas de RREO e SIH, isoladas dos dados eleitorais e temáticos."""

import argparse
import concurrent.futures
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[1]
BUNDLED = WEB / "data/state-accounts"
ENTRY = r'uf: "([A-Z]{2})", ibgeCode: (\d+), slug: "([^"]+)", name: "([^"]+)"'
STATES = re.findall(ENTRY, (WEB / "src/lib/state-accounts/registry.ts").read_text())
SIH_BASE = ('https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/saes/drac/'
            'SIH_Pprocedimento_Hosp/csv/sih_procedimentos_hospitalares_sus_{}_csv.zip')


def load(path):
    return json.loads(path.read_text()) if path.is_file() else None


def publish(root, name, data, dry_run=False):
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=root, delete=False) as f:
        tmp = Path(f.name)
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
        os.fchmod(f.fileno(), 0o644)
    try:
        subprocess.run(['node', str(WEB / 'scripts/validate-state-refresh.cjs'), name, str(tmp)],
                       check=True, timeout=15)
        if not dry_run:
            tmp.replace(root / name)
    finally:
        tmp.unlink(missing_ok=True)


def report_content(report):
    return {k: v for k, v in report.items() if k not in ('balanceSource', 'functionSource', 'totalSourceRows')} | {
        'functions': [{k: v for k, v in row.items() if k != 'sourceRows'} for row in report['functions']]
    }


def check_fiscal(old, incoming):
    previous = {report['year']: report for report in (old or {}).get('snapshots', [])}
    new = {report['year']: report for report in incoming['snapshots']}
    for year, report in new.items():
        if year in previous:
            prior = previous[year]
            if report['period'] < prior['period']:
                raise ValueError('Bimestre menor que o já publicado')
            if (report['period'] == prior['period']
                    and report_content(report) == report_content(prior)):
                continue
        previous[year] = report
    incoming['snapshots'] = [previous[year] for year in sorted(previous)]
    return incoming if not old or incoming['snapshots'] != old['snapshots'] else None


def fiscal_one(root, cache, as_of, state, dry_run):
    uf, _, slug, name = state
    folder = cache / uf
    command = [sys.executable, str(HERE / 'sources/fiscal-uf.py'), '--uf', uf,
               '--output', str(folder), '--as-of', str(as_of), '--years', str(as_of.year - 1), str(as_of.year)]
    subprocess.run(command, check=True, timeout=330, stdout=subprocess.DEVNULL)
    source = load(folder / (slug + '-fiscal-normalized.json'))
    source.update(uf=uf, name=name)
    old = load(root / (slug + '.json')) or load(BUNDLED / slug / 'fiscal.json')
    for report in source['snapshots']:
        for key in ('balanceSource', 'functionSource'):
            meta = report[key]
            if hashlib.sha256((folder / meta['filename']).read_bytes()).hexdigest() != meta['sha256']:
                raise ValueError('Hash do relatório oficial não confere')
    data = check_fiscal(old, source)
    if data:
        publish(root, slug + '.json', data, dry_run)
    return f"{uf}: {('mudança validada' if dry_run else 'atualizado') if data else 'sem alteração'}"


def download(url, target):
    req = urllib.request.Request(url, headers={'Accept': 'application/zip'})
    with urllib.request.urlopen(req, timeout=45) as response, target.open('wb') as out:
        if response.geturl() != url:
            raise ValueError('Redirecionamento inesperado do arquivo SIH')
        size = 0
        for chunk in iter(lambda: response.read(1024 * 1024), b''):
            size += len(chunk)
            if size > 500_000_000:
                raise ValueError('Arquivo SIH acima do limite')
            out.write(chunk)


def sih(root, cache, dry_run):
    old = load(root / 'national-sih.json') or load(BUNDLED / 'national-sih.json')
    # Object ETags are used only to avoid repeating downloads. The parser still checks SHA-256.
    markers = {}
    for year in old['sources']:
        url = SIH_BASE.format(year)
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30) as response:
            if response.geturl() != url:
                raise ValueError('Redirecionamento inesperado do arquivo SIH')
            etag = response.headers.get('ETag')
            if not etag:
                raise ValueError('Origem do SIH não informou ETag')
            markers[year] = etag
    check = root / '.sih-etags.json'
    if load(check) == markers:
        print('SIH/SUS: origens inalteradas', flush=True)
        return
    for year in markers:
        download(SIH_BASE.format(year), cache / (year + '.zip'))
    output = cache / 'sih.json'
    subprocess.run([sys.executable, str(HERE / 'sources/sih-national.py'), str(cache),
                    '--workers', '1', '--output', str(output)], check=True, timeout=1_200)
    new = load(output)
    for uf, rows in old['byUf'].items():
        if not {r['month'] for r in rows} <= {r['month'] for r in new['byUf'][uf]}:
            raise ValueError(f'SIH reduziria a cobertura já publicada de {uf}')
    if new['byUf'] != old['byUf'] or new['sources'] != old['sources']:
        publish(root, 'national-sih.json', new, dry_run)
        print('SIH/SUS: atualização disponível' if dry_run else 'SIH/SUS: atualizado', flush=True)
    else:
        print('SIH/SUS: sem alteração de conteúdo', flush=True)
    if not dry_run:
        marker_tmp = check.with_suffix('.tmp')
        marker_tmp.write_text(json.dumps(markers))
        marker_tmp.replace(check)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', choices=['fiscal', 'sih'])
    parser.add_argument('--root', default=os.environ.get('STATE_ACCOUNTS_REFRESH_DIR', '/data/state-accounts-refresh'), type=Path)
    parser.add_argument('--uf', choices=[state[0] for state in STATES])
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    root = args.root
    root.mkdir(parents=True, exist_ok=True)
    with (root / f'.{args.dataset}.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(f'{args.dataset}: atualização já em andamento')
            return 0
        with tempfile.TemporaryDirectory(prefix='politica-coleta-') as scratch:
            cache = Path(scratch)
            if args.dataset == 'sih':
                sih(root, cache, args.dry_run)
                return 0
            as_of = dt.datetime.now(ZoneInfo('America/Sao_Paulo')).date()
            states = [state for state in STATES if not args.uf or state[0] == args.uf]
            failures = 0
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                pending = {pool.submit(fiscal_one, root, cache, as_of, state, args.dry_run): state[0]
                           for state in states}
                for job in concurrent.futures.as_completed(pending):
                    try:
                        print(job.result(), flush=True)
                    except Exception as error:
                        failures += 1
                        print(f'{pending[job]}: versão anterior preservada ({error})', file=sys.stderr, flush=True)
            return bool(failures)


if __name__ == '__main__':
    sys.exit(main())
