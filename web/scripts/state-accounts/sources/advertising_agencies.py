"""Reproduce normalized advertising ledgers from downloaded official sources.
Run with the primary runtime Python (openpyxl and bs4).
Gross invoices include agency commission and vehicle; NEVER add all three.
Paid-net is only included with an explicit valid payment date <= collection date.
"""
from pathlib import Path
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime, date
from collections import Counter, defaultdict
import csv, json, re, hashlib
import openpyxl


import argparse
_parser=argparse.ArgumentParser(description=__doc__)
_parser.add_argument('--cache',required=True,help='Directory with downloaded source files and normalized output')
_parser.add_argument('--retrieved-at',required=True,help='Verified source retrieval date, YYYY-MM-DD')
_args=_parser.parse_args()
ROOT=Path(_args.cache).resolve()
ROOT.mkdir(parents=True,exist_ok=True)
RETRIEVED_AT=_args.retrieved_at
CUTOFF=date.fromisoformat(RETRIEVED_AT)
SHEET_ID='1YvvxWdJg5CyoVr3qhJr7ME-8rdHnsNirjqATmHbli5c'
SOURCES={
 'secom': {'id':'go-secom-agencias','agency':'SECOM','url':'https://goias.gov.br/comunicacao/pagamento-contratos/','downloadUrl':f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx','file':'secom-current-xlsx.xlsx'},
 'detran-2024': {'id':'go-detran-2024','agency':'DETRAN','url':'https://goias.gov.br/detran/pagamento-de-agencias-e-veiculos/','downloadUrl':'https://docs.google.com/spreadsheets/d/1B8752DrGpFcJ8YsJJ9M0HWGN6Ak9Xj18vOsdQ00ISXQ/export?format=csv','file':'detran-2024.csv'},
 'detran-2025': {'id':'go-detran-2025','agency':'DETRAN','url':'https://goias.gov.br/detran/pagamento-de-agencias-e-veiculos/','downloadUrl':'https://docs.google.com/spreadsheets/d/1Of0b0z56Xn2HCTXhgLAanX1IYDhrxfkA3zVifSx8IOM/export?format=csv','file':'detran-2025.csv'},
 'detran-2026': {'id':'go-detran-2026','agency':'DETRAN','url':'https://goias.gov.br/detran/pagamento-de-agencias-e-veiculos/','downloadUrl':'https://docs.google.com/spreadsheets/d/1PsPr3nDG74oxxPrMNXP2PjHQThj18dv4w5u66TN527o/export?format=csv','file':'detran-2026.csv'},
 'ceasa': {'id':'go-ceasa-publicidade','agency':'CEASA','url':'https://goias.gov.br/ceasa/gastos-com-publicidade-e-propaganda-2/','file':'ceasa.html'},
 'parcerias': {'id':'go-parcerias-publicidade','agency':'GOIÁS PARCERIAS','url':'https://goias.gov.br/goiasparcerias/gastos-com-publicidade-e-propaganda/','downloadUrl':'https://goias.gov.br/goiasparcerias/wp-content/uploads/sites/37/2020/01/OUTUBRO-2026-GASTOS-COM-PUBLICIDADE.xlsx','file':'parcerias-current.xlsx'}
}

def txt(v):
 if v is None:return ''
 if isinstance(v,float) and v.is_integer():return str(int(v))
 return str(v).strip()

def cents(v):
 if v is None:return None
 if isinstance(v,(int,float,Decimal)):return int((Decimal(str(v))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
 s=re.sub(r'[R$\s\u00a0]','',str(v)).strip()
 if s in ('','-'):return 0 if s=='-' else None
 if ',' in s:s=s.replace('.','').replace(',','.')
 try:return int((Decimal(s)*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
 except InvalidOperation:return None

def dt(v):
 if isinstance(v,datetime):return v.date().isoformat()
 if isinstance(v,date):return v.isoformat()
 s=txt(v)
 for fmt in ('%d/%m/%Y','%d/%m/%y','%Y-%m-%d'):
  try:return datetime.strptime(s,fmt).date().isoformat()
  except ValueError:pass
 return None

def rowmap(h,r):
 d={}
 for k,v in zip(h,r):
  k=txt(k)
  if k not in d:d[k]=v
 return d

records=[];quality=[];duplicate_keys={}
def add(r):
 r['uf']='GO'
 r['currency']='BRL'
 r['collectedAt']=RETRIEVED_AT
 r['qualityFlags']=r.get('qualityFlags',[])
 p=r.get('paymentDate')
 r['hasVerifiedPaymentDate']=bool(p and '2021-01-01' <= p <= CUTOFF.isoformat())
 if p and not r['hasVerifiedPaymentDate']:r['qualityFlags'].append('payment_date_outside_valid_window')
 if r.get('status','').upper() in ('CANCELADO','CANCELADA','INATIVO','INATIVA'):
  r['qualityFlags'].append('cancelled_or_inactive');r['hasVerifiedPaymentDate']=False
 gross=r.get('grossCents');vehicle=r.get('vehicleCents');commission=r.get('commissionCents')
 if gross is not None and vehicle is not None and commission is not None and abs(gross-vehicle-commission)>1:r['qualityFlags'].append('gross_vehicle_commission_mismatch')
 if r.get('netCents') is not None and gross is not None and (r['netCents']<0 or r['netCents']>gross+1):r['qualityFlags'].append('net_outside_gross_range')
 if not r.get('advertisingAgency') or gross is None or gross<=0:return
 key='|'.join(txt(r.get(k)) for k in ('agency','commitment','advertisingAgency','invoiceAgency','vehicle','invoiceVehicle','grossCents','paymentDate'))
 if key in duplicate_keys:
  quality.append({'issue':'duplicate_record','kept':duplicate_keys[key],'excluded':r['sourceRow'],'sourceId':r['sourceId']});return
 r['id']='go-ad-'+hashlib.sha256(key.encode()).hexdigest()[:20]
 duplicate_keys[key]=r['sourceRow'];records.append(r)

wb=openpyxl.load_workbook(ROOT/SOURCES['secom']['file'],read_only=True,data_only=True)
for sheet in ['2023','2024','2025','2026','2026II']:
 rows=wb[sheet].values;h=next(rows)
 for n,row in enumerate(rows,2):
  d=rowmap(h,row)
  if not re.match(r'^20\d\d\.',txt(d.get('EMPENHO'))):continue
  net=d.get('LÍQUIDO GERAL NOVA REGRA')
  if net in (None,''):net=d.get('LÍQUIDO GERAL')
  add({'sourceId':'go-secom-agencias','sourceSheet':sheet,'sourceRow':n,'agency':'SECOM','budgetYear':int(txt(d['EMPENHO'])[:4]),'commitment':txt(d['EMPENHO']),'process':txt(d.get('PROCESSO')),'advertisingAgency':txt(d.get('AGÊNCIA')),'invoiceAgency':txt(d.get('NOTA FISCAL - AGÊNCIA')),'vehicle':txt(d.get('VEÍCULO')),'vehicleCnpj':re.sub(r'\D','',txt(d.get('CNPJ VEÍCULO'))).zfill(14) if d.get('CNPJ VEÍCULO') else None,'invoiceVehicle':txt(d.get('NOTA FISCAL - VEÍCULO')),'grossCents':cents(d.get('VALOR AGÊNCIA')),'vehicleCents':cents(d.get('VALOR VEÍCULO')),'commissionCents':cents(d.get('VALOR DA COMISSÃO')),'netCents':cents(net),'paymentDate':dt(d.get('PAGAMENTO DO LÍQUIDO')),'paymentDateRaw':txt(d.get('PAGAMENTO DO LÍQUIDO')),'liquidationDate':dt(d.get('DATA LIQUIDAÇÃO')),'competence':txt(d.get('DATA DE COMPETÊNCIA')),'campaign':txt(d.get('NOME DA CAMPANHA')),'medium':txt(d.get('TIPO')),'municipality':txt(d.get('MUN')),'status':txt(d.get('SITUAÇÃO')),'purpose':'campanhas_e_servicos_publicitarios'})

for key in ['detran-2024','detran-2025','detran-2026']:
 rows=list(csv.reader((ROOT/(key+'.csv')).open()))
 j=next(i for i,r in enumerate(rows) if r[0]=='SEQ.')
 h=rows[j]
 for n,row in enumerate(rows[j+1:],j+2):
  d=rowmap(h,row)
  if not re.match(r'^20\d\d\.',txt(d.get('EMPENHO'))):continue
  vehicle=txt(d.get('VEÍCULO') or d.get('FORNECEDOR 2'))
  add({'sourceId':SOURCES[key]['id'],'sourceSheet':key,'sourceRow':n,'agency':'DETRAN','budgetYear':int(txt(d['EMPENHO'])[:4]),'commitment':txt(d['EMPENHO']),'advertisingAgency':txt(d.get('AGÊNCIA') or d.get('FORNECEDOR')),'invoiceAgency':txt(d.get('NOTA FISCAL') or d.get('NOTA FISCAL / FATURA')),'vehicle':vehicle,'vehicleCnpj':None,'invoiceVehicle':txt(d.get('NF 2')),'grossCents':cents(d.get('VALOR')),'vehicleCents':cents(d.get('VALOR 2')),'commissionCents':cents(d.get('BASE DE CÁLCULO')),'netCents':cents(d.get('TOTAL LÍQUIDO')),'paymentDate':dt(d.get('DATA DE PAGTO LÍQUIDO')),'paymentDateRaw':txt(d.get('DATA DE PAGTO LÍQUIDO')),'liquidationDate':dt(d.get('DATA DA LIQUIDAÇÃO')),'competence':txt(d.get('MÊS DE COMPETÊNCIA')),'campaign':None,'medium':None,'status':txt(d.get('SITUAÇÃO') or (row[-1] if key=='detran-2025' else '')),'purpose':'campanhas_e_servicos_publicitarios'})

with (ROOT/'advertising-records.ndjson').open('w') as f:
 for r in records:f.write(json.dumps(r,ensure_ascii=False)+'\n')

def totals(rs):
 return {'records':len(rs),'invoiceGrossCents':sum(r['grossCents'] for r in rs),'paidRecords':sum(r['hasVerifiedPaymentDate'] for r in rs),'paidInvoiceGrossCents':sum(r['grossCents'] for r in rs if r['hasVerifiedPaymentDate']),'paidNetCents':sum(r['netCents'] or 0 for r in rs if r['hasVerifiedPaymentDate'] and 'net_outside_gross_range' not in r['qualityFlags']),'excludedInvalidNetRecords':sum(r['hasVerifiedPaymentDate'] and 'net_outside_gross_range' in r['qualityFlags'] for r in rs),'vehicleGrossCents':sum(r['vehicleCents'] or 0 for r in rs),'commissionCents':sum(r['commissionCents'] or 0 for r in rs),'recordsWithQualityFlags':sum(bool(r['qualityFlags']) for r in rs)}

by_agency={};monthly=[];by_year=[]
for agency in ['SECOM','DETRAN']:
 rs=[r for r in records if r['agency']==agency];by_agency[agency]=totals(rs)
 for year in range(2023,CUTOFF.year+1):
  paid=[r for r in rs if r['hasVerifiedPaymentDate'] and r['paymentDate'].startswith(str(year))]
  if not paid:continue # no records is not proof of zero expenditure
  by_year.append({'agency':agency,'paymentYear':year,**totals(paid)})
  for month in range(1,13):
   ms=[r for r in paid if r['paymentDate'].startswith(f'{year}-{month:02d}')]
   if ms:monthly.append({'agency':agency,'month':f'{year}-{month:02d}',**totals(ms)})
source_meta=[]
for src in SOURCES.values():
 source_meta.append({**src,'collectedAt':RETRIEVED_AT,'sha256':hashlib.sha256((ROOT/src['file']).read_bytes()).hexdigest()})

summary={'collectedAt':RETRIEVED_AT,'currency':'BRL','amountUnit':'integer_cents','sources':source_meta,'methodology':{'gross':'Valor da nota da agência. Inclui veículo e comissão; estes são componentes, não despesas adicionais.','paidInvoiceGross':'Valor bruto de notas com data explícita de pagamento do líquido até a coleta. Não equivale à soma dos desembolsos de tributos em caixa.','paidNet':'Valor líquido de notas com data explícita de pagamento. Exclui retenções tributárias; conciliar com portal central antes de agregar.','period':'Ano/mês da data de pagamento, não da aba ou do empenho. Há restos a pagar em anos posteriores.','coverage':'Recorte das planilhas oficiais publicadas; não é total consolidado de publicidade de Goiás. SECOM e DETRAN podem se sobrepor à execução do portal central. Não somar esses ledgers ao consolidado sem conciliação.','dedup':'chave órgão + empenho + agência + NF agência + veículo + NF veículo + bruto + data pagamento. Abas resumo, colunas linkadas e cadastro de veículos excluídas.'},'byAgency':by_agency,'byPaymentYear':by_year,'monthly':monthly,'qualityCounts':Counter(f for r in records for f in r['qualityFlags']),'deduplicatedRows':quality,'dateRanges':{a:{'firstPayment':min([r['paymentDate'] for r in records if r['agency']==a and r['hasVerifiedPaymentDate']],default=None),'lastPayment':max([r['paymentDate'] for r in records if r['agency']==a and r['hasVerifiedPaymentDate']],default=None)} for a in by_agency}}
(ROOT/'advertising-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in summary.items() if k in ['byAgency','byPaymentYear','qualityCounts','dateRanges']},ensure_ascii=False,indent=2))
