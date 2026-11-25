#!/usr/bin/env python3
"""Collect official municipal data, publishing each source independently and atomically."""
import argparse
import calendar
import datetime as dt
from decimal import Decimal
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

WEB = Path(__file__).resolve().parents[2]
REGISTRY = json.loads((WEB / 'src/lib/municipal-registry.json').read_text())
BASE = WEB / 'data/municipal-accounts'
RREO = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo'
PNCP = 'https://pncp.gov.br/api/consulta/v1/contratos'
TODAY = dt.datetime.now(ZoneInfo('America/Sao_Paulo')).date()
LIMIT = 9_007_199_254_740_991
AREAS = set('Legislativa|Judiciária|Essencial à Justiça|Administração|Defesa Nacional|Segurança Pública|Relações Exteriores|Assistência Social|Previdência Social|Saúde|Trabalho|Educação|Cultura|Direitos da Cidadania|Urbanismo|Habitação|Saneamento|Gestão Ambiental|Ciência e Tecnologia|Agricultura|Organização Agrária|Indústria|Comércio e Serviços|Comunicações|Energia|Transporte|Desporto e Lazer|Encargos Especiais|Reserva de Contingência'.split('|'))


def get_json(url, allow_empty=False):
    time.sleep(1.1)
    with urlopen(Request(url, headers={'Accept':'application/json'}), timeout=25) as response:
        if response.status == 204 and allow_empty:
            return None, None
        raw = response.read(10_000_001)
    if len(raw) > 10_000_000:
        raise ValueError('Resposta da fonte grande demais')
    return json.loads(raw, parse_float=Decimal), hashlib.sha256(raw).hexdigest()


def cents(value):
    n = Decimal(value) * 100
    if not n.is_finite() or n != n.to_integral_value() or abs(n) > LIMIT:
        raise ValueError('Valor monetário inválido')
    return int(n)


def fact(rows, **criteria):
    matched = [r['valor'] for r in rows if all(r.get(k) == v for k,v in criteria.items())]
    if len(matched) != 1:
        raise ValueError('Fato fiscal ausente ou duplicado: ' + str(criteria))
    return cents(matched[0])


def annex(city, year, period, number):
    label = 'RREO-Anexo ' + number
    url = RREO + '?' + urlencode(dict(an_exercicio=year,nr_periodo=period,
        co_tipo_demonstrativo='RREO',no_anexo=label,id_ente=city['code']))
    data, sha = get_json(url)
    rows = data.get('items')
    if not isinstance(rows,list) or data.get('hasMore') is not False or any(
        (str(r['cod_ibge']),r['uf'],r['esfera'],r['exercicio'],r['periodo'],r['anexo'])
        != (city['code'],city['uf'],'M',year,period,label) for r in rows):
        raise ValueError('RREO incompleto ou não pertence ao ente municipal')
    return rows, {'url':url,'sha256':sha}


def fiscal(city, prior):
    records = {r['year']:r for r in (prior or {}).get('reports',[])}
    changed = False
    for year,last in ((TODAY.year - 1,6),(TODAY.year,(TODAY.month - 1)//2)):
        for period in range(last,records.get(year,{}).get('period',1)-1,-1):
            a, source_a = annex(city,year,period,'01')
            if not a: continue
            b, source_b = annex(city,year,period,'02')
            if not b: continue
            expense = 'DespesasExcetoIntraOrcamentarias'
            totals = {key: fact(a,rotulo='Padrão',cod_conta=account,coluna=column) for key,account,column in (
                ('revenue','ReceitasExcetoIntraOrcamentarias','Até o Bimestre (c)'),
                ('committed',expense,'DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)'),
                ('settled',expense,'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)'),
                ('paid',expense,'DESPESAS PAGAS ATÉ O BIMESTRE (j)'))}
            column = 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)'
            scope = 'Total das Despesas Exceto Intra-Orçamentárias'
            areas = [{'name':r['conta'],'cents':cents(r['valor'])} for r in b
                     if r['rotulo']==scope and r['coluna']==column and r['conta'] in AREAS]
            if not areas or len({r['name'] for r in areas}) != len(areas):
                raise ValueError('Despesas por função ausentes ou duplicadas')
            area_total = fact(b,rotulo=scope,coluna=column,conta='DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)')
            report = dict(year=year,period=period,end=f'{year}-{period*2:02}-{calendar.monthrange(year,period*2)[1]:02}',
                totals=totals,areas=sorted(areas,key=lambda r:(-r['cents'],r['name'])),annex02Total=area_total,
                balance=source_a,functions=source_b)
            old = records.get(year,{})
            fields = ['period','totals','areas','annex02Total']
            if not old or any(report[k]!=old[k] for k in fields):
                records[year]=report
                changed=True
            break
    if not records: raise ValueError('Nenhum bimestre municipal válido')
    return dict(schema=1,code=city['code'],collected=stamp(),reports=sorted(records.values(),key=lambda r:-r['year'])) if changed else None


def contracts(city, prior):
    org=city['pncpOrg']
    if not re.fullmatch(r'\d{14}',org): raise ValueError('CNPJ do órgão inválido')
    start=TODAY-dt.timedelta(days=29)
    params=dict(cnpjOrgao=org,dataInicial=start.strftime('%Y%m%d'),dataFinal=TODAY.strftime('%Y%m%d'),tamanhoPagina=100)
    rows={}
    for page in range(1,16):
        url=PNCP+'?'+urlencode(dict(params,pagina=page))
        data,_=get_json(url,allow_empty=page==1)
        if data is None: break
        if not isinstance(data.get('data'),list) or not isinstance(data.get('totalPaginas'),int):
            raise ValueError('Paginação inesperada do PNCP')
        for r in data['data']:
            m=re.fullmatch(r'(\d{14})-2-(\d+)/(\d{4})',r.get('numeroControlePNCP',''))
            entity=r.get('orgaoEntidade') or {}
            published=dt.date.fromisoformat(r['dataPublicacaoPncp'][:10])
            if not m or m[1]!=org or entity.get('cnpj')!=org or entity.get('esferaId')!='M' or not start<=published<=TODAY:
                raise ValueError('Registro PNCP fora do município, órgão ou período')
            if m[0] in rows: raise ValueError('Contrato duplicado na paginação')
            amount=r.get('valorGlobal')
            rows[m[0]]=dict(id=m[0],title=' '.join((r.get('objetoContrato') or 'Objeto não informado').split())[:600],
                published=str(published),amount=cents(amount) if amount is not None else None,
                url=f'https://pncp.gov.br/app/contratos/{org}/{m[3]}/{int(m[2])}')
        if page>=data['totalPaginas']: break
    else: raise ValueError('Limite de páginas do PNCP excedido')
    if not rows and prior and prior['records'] and prior['end']>=str(start):
        raise ValueError('Consulta vazia com janela ainda sobreposta ao acervo anterior')
    normalized=dict(schema=1,code=city['code'],org=org,start=str(start),end=str(TODAY),total=len(rows),
        records=sorted(rows.values(),key=lambda r:(r['published'],r['id']),reverse=True)[:100])
    if prior and all(prior.get(k)==v for k,v in normalized.items()): return None
    return dict(normalized,collected=stamp())


def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat()


def read(file): return json.loads(file.read_text()) if file.is_file() else None


def replace(file,data):
    with tempfile.NamedTemporaryFile(dir=file.parent,mode='w',encoding='utf8',delete=False) as out:
        tmp=Path(out.name)
        json.dump(data,out,ensure_ascii=False,separators=(',',':'))
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())
        os.fchmod(out.fileno(),0o644)
    try:
        subprocess.run(['node',str(WEB/'scripts/validate-state-refresh.cjs'),file.name,str(tmp)],
                       check=True,timeout=15)
        tmp.replace(file)
    finally: tmp.unlink(missing_ok=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path(os.environ.get('MUNICIPAL_REFRESH_DIR','/data/municipal-accounts-refresh')))
    parser.add_argument('--city')
    parser.add_argument('--source',choices=('fiscal','contracts'))
    args=parser.parse_args()
    cities=[c for c in REGISTRY if not c['existing'] and (not args.city or args.city==c['code'])]
    if not cities: parser.error('Nenhum município habilitado')
    root=args.root
    root.mkdir(parents=True,exist_ok=True)
    failures=0
    with (root/'.refresh.lock').open('a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('Rotina municipal já em execução')
            return 0
        for city in cities:
            for key,collect in [('fiscal',fiscal),('contracts',contracts)]:
                if args.source and args.source!=key: continue
                filename=city['code']+'-'+key+'.json'
                try:
                    old=read(root/filename) or read(BASE/filename)
                    result=collect(city,old)
                    if result: replace(root/filename,result)
                    print(f'{city["name"]}/{key}: '+('atualizado' if result else 'sem alteração'),flush=True)
                except Exception as error:
                    print(f'{city["name"]}/{key}: versão anterior mantida ({error})',flush=True)
                    failures+=1
    return bool(failures)


if __name__=='__main__':
    raise SystemExit(main())
