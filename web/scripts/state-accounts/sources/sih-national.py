#!/usr/bin/env python3
"""Resume somente o grupo SIGTAP 04 das tabelas nacionais SIH/SUS por UF e mês."""
import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
import csv
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

RESOURCE = {
    2025: 'https://dadosabertos.saude.gov.br/dataset/sih_producao_hospitalar/resource/d4d6b28a-012b-4568-bf8a-4322efbf0a18',
    2026: 'https://dadosabertos.saude.gov.br/dataset/sih_producao_hospitalar/resource/dcc08504-3c8a-410a-b429-8eb6bf2ae061',
}
MONTH = {m: i for i, m in enumerate('jan fev mar abr mai jun jul ago set out nov dez'.split(), 1)}
VALID_UF = set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split())
SAFE = 9007199254740991


def number(text, factor):
    v = Decimal(text.replace(',', '.')) * factor
    if not v.is_finite() or v != v.to_integral_value() or abs(v) > SAFE:
        raise ValueError(f'Precisão inesperada: {text!r}')
    return int(v)


def summarize(job):
    archive, member, period = job
    result = defaultdict(lambda: [0, 0, 0])
    group = re.compile(r'^(\d{10})\s*-')
    with zipfile.ZipFile(archive) as bundle, bundle.open(member) as binary, \
         io.TextIOWrapper(binary, encoding='utf-8-sig', newline='') as fh:
        reader = csv.reader(fh, delimiter=';', strict=True)
        header = next(reader)
        fields = ['ANO_MES', 'UF', 'PROCEDIMENTO', 'QUANTIDADE', 'VALOR']
        indexes = [header.index(key) for key in fields]
        for row in reader:
            if len(row) != len(header):
                raise ValueError(f'Colunas divergentes em {member}, linha {reader.line_num}')
            month, uf, procedure, quantity, value = (row[i].strip() for i in indexes)
            if not procedure.startswith('04'):
                continue
            if not group.match(procedure) or month != period or uf not in VALID_UF:
                raise ValueError(f'Classificação ou período inválido em {member}, linha {reader.line_num}')
            current = result[uf]
            current[0] += number(quantity, 1)
            current[1] += number(value, 100)
            current[2] += 1
    return period, dict(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache', type=Path)
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args()
    web = Path(__file__).resolve().parents[3]
    jobs = []
    sources = {}
    for year, resource in RESOURCE.items():
        archive = args.cache / f'{year}.zip'
        with archive.open('rb') as raw:
            digest = hashlib.file_digest(raw, 'sha256').hexdigest()
        with zipfile.ZipFile(archive) as bundle:
            months = set()
            for m in bundle.infolist():
                match = re.fullmatch(r'sih_procedimentos_hospitalares_sus_([a-z]{3})_(\d{4})\.csv', m.filename)
                if not match or int(match[2]) != year or m.file_size > 300_000_000:
                    raise ValueError(f'Arquivo inesperado: {m.filename}')
                month = MONTH[match[1]]
                if month in months:
                    raise ValueError(f'Mês duplicado para {year}: {month}')
                months.add(month)
                jobs.append((archive, m.filename, f'{year}{month:02}'))
            if not months or (year == min(RESOURCE) and months != set(range(1, 13))):
                raise ValueError(f'Cobertura inesperada para {year}')
            sources[year] = {'url': resource, 'sha256': digest, 'months': sorted(months)}

    result = {uf: [] for uf in VALID_UF}
    with ProcessPoolExecutor(max_workers=args.workers) as workers:
        for period, aggregates in workers.map(summarize, jobs):
            for uf, (qty, value, rows) in aggregates.items():
                if not (0 <= qty <= SAFE and abs(value) <= SAFE and rows > 0):
                    raise ValueError(f'Total inesperado para {uf}/{period}')
                result[uf].append({'month': period[:4] + '-' + period[4:], 'quantity': qty,
                    'approvedCents': value, 'rows': rows})
            print('OK', period, len(aggregates), flush=True)
    if any(not entries for entries in result.values()):
        raise ValueError('UF sem linhas no conjunto de produção nacional')
    out = {'schemaVersion': 1, 'group': '04', 'collectedAt': datetime.now(timezone.utc).isoformat(),
        'sources': sources, 'byUf': {uf: sorted(items, key=lambda row: row['month']) for uf, items in sorted(result.items())}}
    target = web / 'data/state-accounts/national-sih.json'
    tmp = target.with_suffix('.tmp')
    tmp.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    tmp.replace(target)


if __name__ == '__main__':
    main()
