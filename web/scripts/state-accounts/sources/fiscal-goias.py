#!/usr/bin/env python3
"""Coleta e normaliza o RREO oficial de Goiás (id_ente=52), usando apenas stdlib.

Exemplo, a partir de web/:
  python3 scripts/state-accounts/sources/fiscal-goias.py \
    --output /tmp/goias-fiscal --years 2025 2026 --as-of 2026-11-18

Reprodução dos mesmos arquivos, sem consultar a rede:
  python3 scripts/state-accounts/sources/fiscal-goias.py \
    --output /tmp/goias-fiscal --years 2025 2026 --as-of 2026-11-18 --offline

Saída: goias-fiscal-normalized.json, fontes e respostas originais com SHA-256.
O arquivo normalizado só é substituído após a validação integral dos períodos.
Funções são conciliadas ao Anexo 01, sem operações intraorçamentárias. O Anexo
02 não oferece pago por função: essas células permanecem null. O total pago do
Anexo 01 não é distribuído por estimativa. A função Saúde não é cirurgias
eletivas e a função Comunicações não equivale a toda a publicidade estadual.

Não há execução automática deste script. O responsável pela atualização deve
conferir a saída antes de incorporá-la ao snapshot publicado do portal.
"""

import argparse
import calendar
import datetime
import hashlib
import json
import urllib.parse
import urllib.request
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--output', required=True, type=Path, help='Pasta de respostas originais e snapshot normalizado')
parser.add_argument('--years', nargs='+', type=int, help='Exercícios; padrão: ano anterior e ano corrente')
parser.add_argument('--as-of', type=datetime.date.fromisoformat, help='Data de referência ISO; padrão: hoje em Brasília')
parser.add_argument('--offline', action='store_true', help='Reproduz apenas respostas e metadados já existentes na pasta')
args = parser.parse_args()
as_of = args.as_of or datetime.datetime.now(ZoneInfo('America/Sao_Paulo')).date()
years = sorted(set(args.years or [as_of.year - 1, as_of.year]))
if any(year < 2000 or year > as_of.year for year in years):
    parser.error('Os exercícios devem estar entre 2000 e o ano da data de referência.')
ROOT = args.output.resolve()
ROOT.mkdir(parents=True, exist_ok=True)


def atomic_write(path, content):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_bytes(content if isinstance(content, bytes) else content.encode('utf-8'))
    temporary.replace(path)


def collect(year, period, annex):
    params = {'an_exercicio': str(year), 'nr_periodo': str(period), 'co_tipo_demonstrativo': 'RREO',
              'no_anexo': f'RREO-Anexo {annex}', 'id_ente': '52'}
    url = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?' + urllib.parse.urlencode(params)
    filename = f'goias-rreo-{year}-b{period}-anexo-{annex}.json'
    if args.offline:
        raw = (ROOT / filename).read_bytes()
        meta = json.loads((ROOT / (filename + '.meta.json')).read_text())
        if meta['url'] != url or meta['sha256'] != hashlib.sha256(raw).hexdigest():
            raise ValueError(f'URL/hash diverge dos metadados locais: {filename}')
    else:
        request = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(10 * 1024 * 1024 + 1)
        if len(raw) > 10 * 1024 * 1024:
            raise ValueError(f'Resposta excedeu o limite esperado: {filename}')
        data = json.loads(raw)
        meta = {'id': f'go-rreo-{year}-b{period}-{annex}',
                'label': f'Siconfi · Goiás · {year}/{period}º bimestre · Anexo {annex}',
                'url': url, 'kind': 'api', 'filename': filename,
                'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'sha256': hashlib.sha256(raw).hexdigest(),
                'count': len(data.get('items', [])), 'hasMore': data.get('hasMore')}
        if not isinstance(data.get('items'), list) or data.get('hasMore') is not False:
            raise ValueError(f'Resposta incompleta ou inesperada: {filename}')
        atomic_write(ROOT / filename, raw)
        atomic_write(ROOT / (filename + '.meta.json'), json.dumps(meta, ensure_ascii=False, indent=2))
    data = json.loads(raw)
    if data.get('hasMore') is not False or not isinstance(data.get('items'), list):
        raise ValueError(f'Resposta incompleta ou inesperada: {filename}')
    return meta, len(data['items'])


selected = []
sources = []
unavailable = []
for year in years:
    last_period = 6 if year < as_of.year else (as_of.month - 1) // 2
    for period in range(last_period, 0, -1):
        balance_meta, balance_count = collect(year, period, '01')
        function_meta, function_count = collect(year, period, '02')
        sources.extend([balance_meta, function_meta])
        if balance_count and function_count:
            selected.append((year, period))
            break
        unavailable.append({'year': year, 'period': period,
            'reason': 'Um ou ambos os anexos retornaram zero registros; consultado bimestre anterior.',
            'balanceCount': balance_count, 'functionCount': function_count})
    else:
        unavailable.append({'year': year, 'period': None, 'reason': 'Nenhum par completo de anexos disponível nos bimestres encerrados consultados.'})
        if last_period:
            raise ValueError(f'Nenhum período íntegro para {year}; o snapshot anterior foi preservado.')
if not selected:
    raise ValueError('Nenhum período íntegro encontrado; o snapshot anterior foi preservado.')

FUNCTIONS = {
    'Legislativa': '01', 'Judiciária': '02', 'Essencial à Justiça': '03', 'Administração': '04',
    'Defesa Nacional': '05', 'Segurança Pública': '06', 'Relações Exteriores': '07', 'Assistência Social': '08',
    'Previdência Social': '09', 'Saúde': '10', 'Trabalho': '11', 'Educação': '12', 'Cultura': '13',
    'Direitos da Cidadania': '14', 'Urbanismo': '15', 'Habitação': '16', 'Saneamento': '17',
    'Gestão Ambiental': '18', 'Ciência e Tecnologia': '19', 'Agricultura': '20', 'Organização Agrária': '21',
    'Indústria': '22', 'Comércio e Serviços': '23', 'Comunicações': '24', 'Energia': '25',
    'Transporte': '26', 'Desporto e Lazer': '27', 'Encargos Especiais': '28', 'Reserva de Contingência': '99',
}

def cents(value):
    amount = Decimal(str(value)) * 100
    if not amount.is_finite() or amount != amount.to_integral_value() or abs(amount) > 9007199254740991:
        raise ValueError(f'Invalid money {value}')
    return int(amount)

def load(year, period, annex):
    name = f'goias-rreo-{year}-b{period}-anexo-{annex}.json'
    raw = (ROOT / name).read_bytes()
    data = json.loads(raw, parse_float=Decimal)
    meta = json.loads((ROOT / (name + '.meta.json')).read_text())
    if data['hasMore'] or not data['items'] or meta['sha256'] != hashlib.sha256(raw).hexdigest():
        raise ValueError(f'Arquivo vazio, incompleto ou com hash divergente: {name}')
    for row in data['items']:
        if row['cod_ibge'] != 52 or row['uf'] != 'GO' or row['esfera'] != 'E' or row['exercicio'] != year or row['periodo'] != period or row['anexo'] != f'RREO-Anexo {annex}':
            raise ValueError(f'Entidade, exercício, período ou anexo inesperado: {name}')
    return data['items'], meta

def one(rows, **fields):
    matches = [(index + 1, row) for index, row in enumerate(rows) if all(row.get(k) == v for k, v in fields.items())]
    if len(matches) != 1:
        raise ValueError(f'Expected unique financial fact, got {len(matches)}: {fields}')
    index, row = matches[0]
    return cents(row['valor']), index

snapshots = []
for year, period in selected:
    balance, balance_meta = load(year, period, '01')
    functions, functions_meta = load(year, period, '02')
    totals = {}
    total_rows = {}
    for key, column in {
        'committedCents': 'DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)',
        'settledCents': 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)',
        'paidCents': 'DESPESAS PAGAS ATÉ O BIMESTRE (j)',
        'updatedBudgetCents': 'DOTAÇÃO ATUALIZADA (e)',
    }.items():
        totals[key], total_rows[key] = one(balance, rotulo='Padrão', cod_conta='DespesasExcetoIntraOrcamentarias', coluna=column)
    totals['revenueCents'], total_rows['revenueCents'] = one(balance, rotulo='Padrão', cod_conta='ReceitasExcetoIntraOrcamentarias', coluna='Até o Bimestre (c)')
    result = []
    for name, code in FUNCTIONS.items():
        candidates = [row for row in functions if row['rotulo'] == 'Total das Despesas Exceto Intra-Orçamentárias' and row['conta'] == name]
        if not candidates:
            continue
        normalized = {'code': code, 'name': name, 'paidCents': None, 'sourceRows': {}}
        for key, column in {
            'committedCents': 'DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)',
            'settledCents': 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)',
            'updatedBudgetCents': 'DOTAÇÃO ATUALIZADA (a)',
        }.items():
            if any(row['coluna'] == column for row in candidates):
                normalized[key], normalized['sourceRows'][key] = one(functions, rotulo='Total das Despesas Exceto Intra-Orçamentárias', conta=name, coluna=column)
            else:
                normalized[key], normalized['sourceRows'][key] = None, None
        result.append(normalized)
    reconciliation = {}
    for key in ['committedCents', 'settledCents', 'updatedBudgetCents']:
        function_sum = sum(row[key] for row in result if row[key] is not None)
        difference = function_sum - totals[key]
        if difference != 0:
            raise ValueError(f'Functions do not reconcile: {year} {key} {difference} centavos')
        reconciliation[key] = {'sumOfFunctions': function_sum, 'balanceTotal': totals[key], 'differenceCents': difference}
    period_end_month = period * 2
    snapshots.append({
        'uf': 'GO', 'ibgeCode': 52, 'institution': 'Governo do Estado de Goiás', 'year': year, 'period': period,
        'periodStart': f'{year}-01-01', 'periodEnd': f'{year}-{period_end_month:02d}-{calendar.monthrange(year, period_end_month)[1]:02d}',
        'scope': 'rreo-excluding-intra-budget', 'scopeLabel': 'RREO estadual consolidado, sem despesas intraorçamentárias',
        'availableFunctionStages': ['committed', 'settled', 'budgeted'],
        'totals': totals, 'totalSourceRows': total_rows,
        'functions': sorted(result, key=lambda row: (-(row['settledCents'] or 0), row['code'])),
        'reconciliation': reconciliation,
        'balanceSource': balance_meta, 'functionSource': functions_meta,
        'notes': [
            'Valores em centavos, acumulados desde janeiro até o bimestre informado.',
            'O Anexo 02 publica despesas empenhadas e liquidadas por função; não publica despesas pagas por função.',
            'Pago está disponível apenas no total consolidado do Anexo 01. paidCents é null em todas as funções.',
            'Células não publicadas permanecem null, inclusive a execução da Reserva de Contingência; não foram convertidas para zero.',
            'Função Saúde inclui toda a função orçamentária e não mede exclusivamente cirurgias eletivas.',
            'Função Comunicações não equivale a toda a publicidade estadual. A comparação temática usa a base documental própria.',
            'O universo consolidado do RREO é diferente do recorte de ordens de pagamento classificadas por descrição; os valores não devem ser somados.',
        ],
    })

payload = {
    'schemaVersion': 1,
    'collectedAt': max(s['functionSource']['retrievedAt'] for s in snapshots),
    'snapshots': snapshots,
    'unavailable': unavailable,
    'methodologyUrl': 'https://apidatalake.tesouro.gov.br/docs/siconfi/',
}
atomic_write(ROOT / 'sources.json', json.dumps(sources, ensure_ascii=False, indent=2))
atomic_write(ROOT / 'goias-fiscal-normalized.json', json.dumps(payload, ensure_ascii=False, indent=2))
for snapshot in snapshots:
    print(json.dumps({'year': snapshot['year'], 'period': snapshot['period'], 'totals': snapshot['totals'],
        'functions': len(snapshot['functions']), 'reconciliation': snapshot['reconciliation'],
        'keyFunctions': [{k: value for k, value in row.items() if k != 'sourceRows'} for row in snapshot['functions'] if row['name'] in ['Saúde', 'Educação', 'Segurança Pública', 'Comunicações']]}, ensure_ascii=False))
