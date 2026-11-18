"""Extract public PCE transfers; classify by payment date, not competence year."""
from pathlib import Path
import xlrd,json,hashlib,datetime,collections,argparse
from decimal import Decimal
parser=argparse.ArgumentParser(description='Normalize official PCE transfers using actual payment dates.')
parser.add_argument('--cache',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--years',default='2021,2022,2023,2024,2025,2026')
args=parser.parse_args()
P=Path(args.cache)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
records=[];sources=[]
for year in [int(y) for y in args.years.split(',')]:
 src=P/f'pce-pagos-{year}.xls';meta=json.loads(P.joinpath(f'pce-pagos-{year}.metadata.json').read_text());b=src.read_bytes()
 sid=f'go-ses-pce-competencia-{year}'
 s={'id':sid,'publisher':'Secretaria de Estado da Saúde de Goiás','title':f'Repasses Fundo a Fundo — PCE — competência {year}','url':meta['url'],'landingUrl':'https://extranet.saude.go.gov.br/saf/ManterRelatorioPagamentoFundoExterno.jsf','competenceYear':year,'retrievedAt':now,'sha256':hashlib.sha256(b).hexdigest(),'status':'extracted' if b.startswith(bytes.fromhex('d0cf11e0')) else 'no_records_returned','records':0}
 if s['status']=='extracted':
  sheet=xlrd.open_workbook(file_contents=b).sheet_by_index(0);header=sheet.row_values(0)
  for i in range(1,sheet.nrows):
   r=dict(zip(header,sheet.row_values(i)))
   assert r['STATUS']=='PAGO' and r['SIGLA_PROGRAMA']=='PCE'
   paid=int((Decimal(str(r['VALOR_PAGO']))*100).quantize(Decimal('1')))
   paidat=datetime.datetime.strptime(r['DATA_PAGAMENTO'],'%d/%m/%Y').date().isoformat()
   key='|'.join(str(r[k]) for k in ['CNPJ','PROCESSO','EMPENHO','PARCELA','MES','ANO','DATA_PAGAMENTO','VALOR_PAGO'])
   records.append({'id':'go-pce-'+hashlib.sha256(key.encode()).hexdigest()[:20],'uf':'GO','payerAgencyCode':'2850','payerAgency':'Fundo Estadual de Saúde de Goiás','category':'cirurgias_eletivas','subcategory':'repasses_pce','financialStage':'paid','transactionType':'intergovernmental_transfer','budgetClassification':r['CLASSIFICACAO'],'fundingClassification':r['SUBCLASSIFICACAO'],'program':'PCE — Procedimentos Cirúrgicos Eletivos','payee':r['FUNDO'],'payeeCnpj':r['CNPJ'],'municipality':r['FUNDO'].removeprefix('FUNDO MUNICIPAL DE SAUDE DE '),'process':r['PROCESSO'],'commitment':r['EMPENHO'],'installment':int(r['PARCELA']),'competenceYear':int(r['ANO']),'competenceMonth':int(r['MES']),'paymentDate':paidat,'paymentYear':int(paidat[:4]),'amountCents':paid,'currency':'BRL','sourceId':sid,'sourceRow':i+1})
  s['records']=sheet.nrows-1
 else:
  from urllib.parse import urlparse,parse_qs
  s['message']=parse_qs(urlparse(meta.get('responseUrl','')).query).get('mensagem',['Consulta não retornou planilha'])[0]
  if s['message'] != 'Não existem registros para esta consulta.':
   raise ValueError(f'Unexpected application response for competence {year}; do not interpret as zero')
 sources.append(s)
assert len(records)==len({r['id'] for r in records})
byyear=collections.defaultdict(list)
for r in records:byyear[r['paymentYear']].append(r)
annual=[]
for y,rr in sorted(byyear.items()):
 months=collections.Counter();municipalities=collections.Counter()
 for r in rr:months[r['paymentDate'][:7]]+=r['amountCents'];municipalities[r['municipality']]+=r['amountCents']
 annual.append({'year':y,'amountCents':sum(r['amountCents'] for r in rr),'transactions':len(rr),'municipalities':len(municipalities),'firstPaymentDate':min(r['paymentDate'] for r in rr),'lastPaymentDate':max(r['paymentDate'] for r in rr),'monthly':[{'month':m,'amountCents':v} for m,v in sorted(months.items())],'byMunicipality':[{'municipality':m,'amountCents':v} for m,v in municipalities.most_common()]})
d={'schemaVersion':1,'uf':'GO','retrievedAt':now,'label':'Repasses pagos no programa PCE — Procedimentos Cirúrgicos Eletivos','financialStage':'paid','transactionType':'intergovernmental_transfer','coverageStatus':'partial','coverage':f'Programa PCE do Fundo Estadual de Saúde. Competências consultadas: {args.years}. Agrupamento por DATA_PAGAMENTO. Não inclui todos os hospitais, contratos de gestão, outros programas de fortalecimento ou execução municipal posterior.','limitations':['Transferência paga a fundos municipais; não comprova despesa final dos hospitais ou quantidade de cirurgias.','Os anos selecionados na consulta são competências. Há parcelas de 2024 pagas em 2025. Comparações de desembolso devem usar paymentDate.','Nenhum registro retornado para competências 2025/2026 não equivale a gasto estadual zero com cirurgias.','Não somar estes repasses novamente aos pagamentos do órgão FES de uma base estadual consolidada.','Não usar este recorte como total gasto pelo Governo de Goiás com cirurgias eletivas.'],'sources':sources,'records':sorted(records,key=lambda r:(r['paymentDate'],r['municipality'],r['id'])),'annual':annual}
Path(args.output).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'records':len(records),'annual':[{k:v for k,v in r.items() if k not in ('monthly','byMunicipality')} for r in annual]},ensure_ascii=False,indent=2))
