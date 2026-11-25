#!/usr/bin/env python3
"""Registra relatórios estaduais do Siconfi coletados e validados pelo fiscal-uf.py."""
import argparse
import hashlib
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('cache', type=Path)
args = parser.parse_args()
web = Path(__file__).resolve().parents[2]
root = web / 'data/state-accounts'
slug_re = r'uf: "([A-Z]{2})", ibgeCode: (\d+), slug: "([^"]+)", name: "([^"]+)"'
entries = re.findall(slug_re, (web / 'src/lib/state-accounts/registry.ts').read_text())
bundles = []
for uf, ibge, slug, name in entries:
    if uf == 'GO':
        continue
    folder = args.cache / uf
    dataset = json.loads((folder / f'{slug}-fiscal-normalized.json').read_text())
    if dataset['schemaVersion'] != 1 or not dataset['snapshots']:
        raise ValueError(f'Base sem relatórios: {uf}')
    for report in dataset['snapshots']:
        if report['uf'] != uf or report['ibgeCode'] != int(ibge):
            raise ValueError(f'UF divergente: {uf}')
        for key in ['balanceSource', 'functionSource']:
            source = report[key]
            raw = (folder / source['filename']).read_bytes()
            if hashlib.sha256(raw).hexdigest() != source['sha256']:
                raise ValueError(f'Hash divergente: {source["filename"]}')
    bundles.append((slug, {"schemaVersion": 1, "uf": uf, "name": name, **dataset}))
if len(bundles) != 26:
    raise ValueError('A expansão fiscal exige os 25 estados restantes e o DF.')
for slug, data in bundles:
    path = root / slug / 'fiscal.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
(web / 'src/lib/state-accounts/fiscal-coverage.json').write_text(
    json.dumps([slug for slug, _ in bundles], indent=2) + '\n')
