#!/usr/bin/env python3
"""Refresh the documented Goiás advertising source adapters (read-only).

Raw material belongs in an external cache, not the application repository.
No authentication token, browser session or private endpoint is used.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.request import Request, urlopen

SOURCES = {
    'secom-current-xlsx.xlsx': 'https://docs.google.com/spreadsheets/d/1YvvxWdJg5CyoVr3qhJr7ME-8rdHnsNirjqATmHbli5c/export?format=xlsx',
    'detran-2024.csv': 'https://docs.google.com/spreadsheets/d/1B8752DrGpFcJ8YsJJ9M0HWGN6Ak9Xj18vOsdQ00ISXQ/export?format=csv',
    'detran-2025.csv': 'https://docs.google.com/spreadsheets/d/1Of0b0z56Xn2HCTXhgLAanX1IYDhrxfkA3zVifSx8IOM/export?format=csv',
    'detran-2026.csv': 'https://docs.google.com/spreadsheets/d/1PsPr3nDG74oxxPrMNXP2PjHQThj18dv4w5u66TN527o/export?format=csv',
    'ceasa.html': 'https://goias.gov.br/ceasa/gastos-com-publicidade-e-propaganda-2/',
    'parcerias-current.xlsx': 'https://goias.gov.br/goiasparcerias/wp-content/uploads/sites/37/2020/01/OUTUBRO-2026-GASTOS-COM-PUBLICIDADE.xlsx',
    'fomento-live.csv': 'https://www.goiasfomento.com/arquivos/lai/anexos/planilhas_bi/lai_planilha_despesas_publicacoes.csv',
    'Despesas com Publicidade e Propaganda 2015-2023': 'https://dadosabertos.go.gov.br/dataset/693927b5-cb64-4123-bb48-e09298a69b0b/resource/cfc50391-49f5-4ca0-b1f2-7c16f3196695/download/despesas_publicidade_2015_2023.csv',
}
OUTPUTS = ['advertising-records.ndjson', 'advertising-summary.json', 'saneago-advertising.json', 'legal-advertising.json', 'fomento-telecom-advertising.json']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', required=True, help='External source-cache directory')
    parser.add_argument('--output', required=True, help='Normalized output directory')
    parser.add_argument('--retrieved-at', required=True, help='Verified source retrieval date, YYYY-MM-DD')
    parser.add_argument('--offline', action='store_true', help='Use the complete existing snapshot, without any network call')
    parser.add_argument('--refresh', action='store_true', help='Replace existing raw cache files with current downloads')
    args = parser.parse_args()
    cache, output = Path(args.cache).resolve(), Path(args.output).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)

    def fetch(item):
        name, url = item
        target = cache / name
        if args.offline:
            if not target.exists():
                raise FileNotFoundError(f'Incomplete offline snapshot: {target.name}')
        elif args.refresh or not target.exists():
            request = Request(url, headers={'User-Agent': 'Politica007-public-data-audit/1.0'})
            with urlopen(request, timeout=90) as response:
                data = response.read()
            if name.endswith('.xlsx') and not data.startswith(b'PK'):
                raise ValueError(f'Expected XLSX from documented public source: {name}')
            if name.endswith('.csv') and b'<html' in data[:200].lower():
                raise ValueError(f'Unexpected HTML instead of CSV: {name}')
            temporary = target.with_name(target.name + '.download')
            temporary.write_bytes(data)
            temporary.replace(target)
        return {'file': name, 'url': url, 'retrievedAt': args.retrieved_at,
                'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size}

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        manifest = list(pool.map(fetch, SOURCES.items()))
    scripts = Path(__file__).resolve().parent
    for script in ['advertising_agencies.py', 'advertising_legal.py', 'advertising_companies.py']:
        subprocess.run([sys.executable, str(scripts / script), '--cache', str(cache), '--retrieved-at', args.retrieved_at], check=True)
    if args.offline:
        if not (cache / 'saneago-advertising.json').exists():
            raise FileNotFoundError('Offline mode requires a previously exported SANEAGO snapshot')
    else:
        subprocess.run([sys.executable, str(scripts / 'advertising_saneago.py'), '--cache', str(cache), '--retrieved-at', args.retrieved_at], check=True)
    (cache / 'advertising-download-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    for name in OUTPUTS + ['advertising-download-manifest.json']:
        source = cache / name
        if output != cache:
            shutil.copyfile(source, output / name)
    print(json.dumps({'output': str(output), 'files': OUTPUTS, 'offline': args.offline}, ensure_ascii=False))


if __name__ == '__main__':
    main()
