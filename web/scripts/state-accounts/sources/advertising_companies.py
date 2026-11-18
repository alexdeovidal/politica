from pathlib import Path
from datetime import datetime
from decimal import Decimal,ROUND_HALF_UP
from collections import Counter
import csv,json,hashlib,re
import argparse
_parser=argparse.ArgumentParser(description=__doc__)
_parser.add_argument('--cache',required=True,help='Directory with downloaded source files and normalized output')
_parser.add_argument('--retrieved-at',required=True,help='Verified source retrieval date, YYYY-MM-DD')
_args=_parser.parse_args()
ROOT=Path(_args.cache).resolve()
ROOT.mkdir(parents=True,exist_ok=True)
RETRIEVED_AT=_args.retrieved_at
def cents(v):return int((Decimal(v)*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
records=[]
for n,r in enumerate(csv.DictReader((ROOT/'fomento-live.csv').open('r',encoding='utf-8-sig'),delimiter=';'),2):
 d={k:v.strip() for k,v in r.items()};date=datetime.strptime(d['DATA_PAGAMENTO'],'%d/%m/%Y').date().isoformat()
 record={'sourceId':'go-fomento-publicidade','agency':'GOIÁSFOMENTO','uf':'GO','sourceRow':n,'sourceUrl':'https://www.goiasfomento.com/acesso-a-informacao/gastos-com-publicidade-e-propaganda/','currency':'BRL','paymentDate':date,'year':int(date[:4]),'provider':d['BENEFICIARIO'],'vehicle':d['VEICULO_DIVULGACAO'],'medium':None,'purpose':'publicidade_legal' if 'Legal' in d['FINALIDADE'] else 'finalidade_nao_classificada','purposeOriginal':d['FINALIDADE'],'amountCents':cents(d['VALOR']),'stage':'paid','isWithholding':bool(re.search(r'ISS|IRRF|INSS|RETIDO',d['BENEFICIARIO'])),'collectedAt':RETRIEVED_AT}
 record['id']='go-fomento-'+hashlib.sha256(json.dumps(record,sort_keys=True).encode()).hexdigest()[:20];records.append(record)
fomento_count=len(records)
for n,r in enumerate(csv.DictReader((ROOT/'Despesas com Publicidade e Propaganda 2015-2023').open('r',encoding='utf-8-sig')),2):
 try:date=datetime.strptime(r['date'],'%d/%m/%Y').date().isoformat()
 except ValueError:
  try:date=datetime.strptime(r['date'],'%d/%m/%y').date().isoformat()
  except ValueError:date=None
 records.append({'id':'go-telecom-'+r['id'],'sourceId':'go-telecom-publicidade-historico','agency':'GOIÁSTELECOM','uf':'GO','sourceRow':n,'sourceUrl':'https://dadosabertos.go.gov.br/dataset/despesas-com-publicidade-e-propaganda-goiastelecom','currency':'BRL','reportedDate':date,'paymentDate':None,'year':int(r['year']),'provider':r['companyName'],'providerCnpj':re.sub(r'\D','',r['cnpj']),'vehicle':None,'medium':None,'purpose':'publicidade_legal' if re.search(r'publica|edital|jornal',r['goal'],re.I) else 'finalidade_nao_classificada','purposeOriginal':r['goal'],'amountCents':cents(r['valor']),'stage':'reported_expense','reportedReference':r['reference'],'collectedAt':RETRIEVED_AT})
summary=[]
for agency in sorted(set(r['agency'] for r in records)):
 for year in sorted(set(r['year'] for r in records if r['agency']==agency)):
  rs=[r for r in records if r['agency']==agency and r['year']==year]
  summary.append({'agency':agency,'year':year,'records':len(rs),'amountCents':sum(r['amountCents'] for r in rs),'stage':rs[0]['stage'],'taxWithholdingCents':sum(r['amountCents'] for r in rs if r.get('isWithholding'))})
result={'collectedAt':RETRIEVED_AT,'sources':[{'id':'go-fomento-publicidade','url':'https://www.goiasfomento.com/acesso-a-informacao/gastos-com-publicidade-e-propaganda/','downloadUrl':'https://www.goiasfomento.com/arquivos/lai/anexos/planilhas_bi/lai_planilha_despesas_publicacoes.csv','sha256':hashlib.sha256((ROOT/'fomento-live.csv').read_bytes()).hexdigest(),'firstPayment':min(r['paymentDate'] for r in records[:fomento_count]),'lastPayment':max(r['paymentDate'] for r in records[:fomento_count])},{'id':'go-telecom-publicidade-historico','url':'https://dadosabertos.go.gov.br/dataset/despesas-com-publicidade-e-propaganda-goiastelecom','downloadUrl':'https://dadosabertos.go.gov.br/dataset/693927b5-cb64-4123-bb48-e09298a69b0b/resource/cfc50391-49f5-4ca0-b1f2-7c16f3196695/download/despesas_publicidade_2015_2023.csv','sha256':hashlib.sha256((ROOT/'Despesas com Publicidade e Propaganda 2015-2023').read_bytes()).hexdigest(),'coverageNote':'Arquivo rotulado2015/2023; registros efetivamente presentes cobrem2015–2023. Não presumir zero para os demais anos. Fonte atual2021+ é painel central.'}],'methodology':'GoiásFomento: CSV atual completo, usando somente esta versão; arquivos mensais CKAN são cumulativos e não foram somados. Linhas de retenções tributárias identificadas; não equivalem a receita de veículo de mídia. GoiásTelecom: histórico com estágio financeiro não explicitado, mantido como despesa informada. Não agregar a outras fontes sem conciliação de sobreposição.','summary':summary,'records':records}
(ROOT/'fomento-telecom-advertising.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
