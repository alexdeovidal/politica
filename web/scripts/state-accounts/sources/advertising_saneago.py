"""Read-only export of the public SANEAGO Qlik table, with provenance."""
import asyncio,json,hashlib
from pathlib import Path
from datetime import datetime
from decimal import Decimal,ROUND_HALF_UP
from collections import defaultdict
import websockets
import argparse
_parser=argparse.ArgumentParser(description=__doc__)
_parser.add_argument('--cache',required=True,help='Directory with downloaded source files and normalized output')
_parser.add_argument('--retrieved-at',required=True,help='Verified source retrieval date, YYYY-MM-DD')
_args=_parser.parse_args()
ROOT=Path(_args.cache).resolve()
ROOT.mkdir(parents=True,exist_ok=True)
RETRIEVED_AT=_args.retrieved_at
APP='347393f8-b814-42a4-9fe7-0c79a39a266a'
URL='https://qliksense-qap.saneago.com.br/extensions/AAI004-DespesasPublicidadePropaganda/AAI004-DespesasPublicidadePropaganda.html'
def amount_cents(s):
 s=s.replace('R$','').strip().replace('.','').replace(',','.')
 return int((Decimal(s)*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
async def main():
 async with websockets.connect('wss://qliksense-qap.saneago.com.br/app/'+APP,origin='https://qliksense-qap.saneago.com.br',open_timeout=20,max_size=10000000) as ws:
  seq=0
  async def rpc(handle,method,params=[]):
   nonlocal seq
   seq+=1;n=seq
   await ws.send(json.dumps({'jsonrpc':'2.0','id':n,'handle':handle,'method':method,'params':params}))
   while True:
    r=json.loads(await asyncio.wait_for(ws.recv(),30))
    if r.get('id')==n:
     if 'error' in r:raise RuntimeError(r)
     return r['result']
  d=await rpc(-1,'OpenDoc',[APP]);app=d['qReturn']['qHandle']
  app_layout=(await rpc(app,'GetAppLayout'))['qLayout'];raw={};tables={}
  for obj in ['DtBJTP','TxmJ','dqJAf']:
   d=await rpc(app,'GetObject',[obj]);handle=d['qReturn']['qHandle']
   layout=(await rpc(handle,'GetLayout'))['qLayout'];cube=layout['qHyperCube'];matrix=[]
   for top in range(0,cube['qSize']['qcy'],1000):
    d=await rpc(handle,'GetHyperCubeData',['/qHyperCubeDef',[{'qLeft':0,'qTop':top,'qWidth':cube['qSize']['qcx'],'qHeight':min(1000,cube['qSize']['qcy']-top)}]])
    for page in d['qDataPages']:matrix+=page['qMatrix']
   raw[obj]={'layout':layout,'matrix':matrix};tables[obj]=[[cell['qText'] for cell in row] for row in matrix]
   print(obj,len(matrix),tables[obj][:2],flush=True)
  (ROOT/'saneago-export-raw.json').write_text(json.dumps({'app':app_layout,'objects':raw},ensure_ascii=False))
  records=[]
  for row,cells in zip(tables['DtBJTP'],raw['DtBJTP']['matrix']):
   ordinal,paydate,provider,vehicle,purpose,medium,value=row
   day=datetime.strptime(paydate,'%d/%m/%Y').date().isoformat()
   purpose_code='publicidade_legal' if 'LEGAL' in purpose.upper() else 'propaganda_institucional' if 'INSTITUCIONAL' in purpose.upper() else 'finalidade_nao_classificada'
   records.append({'id':'go-saneago-'+ordinal,'sourceId':'go-saneago-publicidade','agency':'SANEAGO','uf':'GO','currency':'BRL','sourceRow':ordinal,'sourceUrl':URL,'paymentDate':day,'year':int(day[:4]),'provider':provider,'vehicle':vehicle,'purpose':purpose_code,'purposeOriginal':purpose,'medium':medium,'amountCents':amount_cents(value),'sourceAmountNumeric':str(cells[-1].get('qNum')),'stage':'paid','collectedAt':RETRIEVED_AT})
  # Use source display values, preserve exact numeric values for reconciliation.
  summary=[]
  for year in sorted(set(r['year'] for r in records)):
   rs=[r for r in records if r['year']==year]
   summary.append({'year':year,'records':len(rs),'amountCents':sum(r['amountCents'] for r in rs),'institutionalCents':sum(r['amountCents'] for r in rs if r['purpose']=='propaganda_institucional'),'legalCents':sum(r['amountCents'] for r in rs if r['purpose']=='publicidade_legal')})
  official_total=raw['TxmJ']['layout']['qHyperCube']['qGrandTotalRow'][0]['qText']
  result={'sourceId':'go-saneago-publicidade','sourceUrl':URL,'landingUrl':'https://www.saneago.com.br/lai/#/gastos-publicidade','sourceReloadedAt':app_layout['qLastReloadTime'],'collectedAt':RETRIEVED_AT,'currency':'BRL','amountUnit':'integer_cents','methodology':'Exportação somente leitura da tabela oficial DtBJTP em sessão pública anônima da API Qlik. Nenhum filtro aplicado. Valores em centavos reproduzem a apresentação da fonte por linha; original numérico preservado. Finalidade legal e institucional conforme classificação da fonte. Não agregar ao portal central sem conciliar sobreposição.','firstPayment':min(r['paymentDate'] for r in records),'lastPayment':max(r['paymentDate'] for r in records),'officialTotalDisplay':official_total,'officialTotalCents':amount_cents(official_total),'sumOfDisplayedRowsCents':sum(r['amountCents'] for r in records),'roundingDifferenceCents':sum(r['amountCents'] for r in records)-amount_cents(official_total),'summary':summary,'byPurpose':tables['TxmJ'],'byMedium':tables['dqJAf'],'records':records}
  (ROOT/'saneago-advertising.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  print(json.dumps({k:v for k,v in result.items() if k not in ['records','byMedium','methodology']},ensure_ascii=False,indent=2),flush=True)
asyncio.run(main())
