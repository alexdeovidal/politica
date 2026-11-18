from pathlib import Path
from decimal import Decimal
from datetime import datetime
from collections import defaultdict
import pandas as pd
import openpyxl,json,hashlib,re
import argparse
_parser=argparse.ArgumentParser(description=__doc__)
_parser.add_argument('--cache',required=True,help='Directory with downloaded source files and normalized output')
_parser.add_argument('--retrieved-at',required=True,help='Verified source retrieval date, YYYY-MM-DD')
_args=_parser.parse_args()
ROOT=Path(_args.cache).resolve()
ROOT.mkdir(parents=True,exist_ok=True)
RETRIEVED_AT=_args.retrieved_at
def cents(v):
 s=str(v).replace('R$','').strip()
 if ',' in s:s=s.replace('.','').replace(',','.')
 return int(round(Decimal(s)*100))
def text(v):
 if isinstance(v,float) and v.is_integer():return str(int(v))
 return str(v).strip()
rows=[]
tables=pd.read_html(ROOT/'ceasa.html')
df=next(t for t in tables if {'Pagamento','Exercício','Referência','Fornecedor','Veículo','Meio','NF','Valor pago'}.issubset(set(t.columns)))
official_total_table=next(t for t in tables if {'Tipo de serviço','Total pago'}.issubset(set(t.columns)))
official_total=next(cents(r['Total pago']) for r in official_total_table.to_dict(orient='records') if r['Tipo de serviço']=='Total')
for i,d in enumerate(df.to_dict(orient='records'),1):
 p=datetime.strptime(d['Pagamento'],'%d/%m/%Y').date().isoformat()
 r={'sourceId':'go-ceasa-publicidade','agency':'CEASA','uf':'GO','currency':'BRL','sourceRow':i,'sourceUrl':'https://goias.gov.br/ceasa/gastos-com-publicidade-e-propaganda-2/','periodPrecision':'day','paymentDate':p,'year':int(p[:4]),'reportedBudgetYear':int(d['Exercício']),'reportedMonth':d['Referência'],'provider':d['Fornecedor'],'vehicle':d['Veículo'],'medium':d['Meio'],'invoice':text(d['NF']),'amountCents':cents(d['Valor pago']),'stage':'paid','purpose':'publicidade_legal','collectedAt':RETRIEVED_AT}
 r['id']='go-legal-'+hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()[:20];rows.append(r)
assert sum(r['amountCents'] for r in rows)==official_total, 'CEASA rows do not reconcile with the published total'
months={'janeiro':1,'fevereiro':2,'março':3,'abril':4,'maio':5,'junho':6,'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12}
w=openpyxl.load_workbook(ROOT/'parcerias-current.xlsx',read_only=True,data_only=True)
for i,r in enumerate(w.active.values,1):
 if i==1 or not r[0] or not r[1] or r[6] is None:continue
 month=months.get(text(r[0]).lower());year=int(r[1])
 if not month:continue
 purpose='publicidade_legal' if re.search(r'publica|di.rio',text(r[5]),re.I) else 'finalidade_nao_classificada'
 d={'sourceId':'go-parcerias-publicidade','agency':'GOIÁS PARCERIAS','uf':'GO','currency':'BRL','sourceRow':i,'sourceUrl':'https://goias.gov.br/goiasparcerias/gastos-com-publicidade-e-propaganda/','periodPrecision':'month','paymentDate':None,'reportedPeriod':f'{year}-{month:02d}','year':year,'provider':text(r[2]),'vehicle':text(r[2]),'medium':text(r[3]),'invoice':text(r[4]),'amountCents':cents(r[6]),'stage':'reported_expense','purpose':purpose,'purposeOriginal':text(r[5]),'collectedAt':RETRIEVED_AT}
 d['id']='go-legal-'+hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()[:20];rows.append(d)
totals=[]
for agency in ['CEASA','GOIÁS PARCERIAS']:
 for year in range(2020,2027):
  rs=[r for r in rows if r['agency']==agency and r['year']==year]
  if rs:totals.append({'agency':agency,'year':year,'records':len(rs),'amountCents':sum(r['amountCents'] for r in rs),'stage':rs[0]['stage']})
result={'collectedAt':RETRIEVED_AT,'methodology':'CEASA: pagamentos da tabela HTML conciliados com o total oficial, classificados como publicidade legal pela própria fonte. Ano derivado da data de pagamento, podendo divergir do exercício informado. Goiás Parcerias: despesas por mês/ano, sem data de pagamento ou fase explícita; não somar a pagamentos confirmados. Registros genéricos sem finalidade explicitada permanecem não classificados. Fontes podem sobrepor-se ao portal central.','sources':[{'id':'go-ceasa-publicidade','url':'https://goias.gov.br/ceasa/gastos-com-publicidade-e-propaganda-2/','sourceUpdatedAt':'2026-08-12','sha256':hashlib.sha256((ROOT/'ceasa.html').read_bytes()).hexdigest(),'downloadLimitation':'Links CSV/XLSX/ODS na página são placeholders; extração da tabela HTML completa.'},{'id':'go-parcerias-publicidade','url':'https://goias.gov.br/goiasparcerias/gastos-com-publicidade-e-propaganda/','downloadUrl':'https://goias.gov.br/goiasparcerias/wp-content/uploads/sites/37/2020/01/OUTUBRO-2026-GASTOS-COM-PUBLICIDADE.xlsx','sourcePageUpdatedAt':'2026-11-12','lastDataPeriod':'2026-08','sha256':hashlib.sha256((ROOT/'parcerias-current.xlsx').read_bytes()).hexdigest()}],'summary':totals,'records':rows}
(ROOT/'legal-advertising.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(totals,ensure_ascii=False,indent=2))
