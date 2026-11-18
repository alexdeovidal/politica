"""Normalize official public health indicators; never label production as payments."""
import csv,json,hashlib,datetime,collections,argparse
from pathlib import Path
parser=argparse.ArgumentParser(description='Normalize official SES-GO indicators and SUS360 financial production, keeping stages separate.')
parser.add_argument('--cache',required=True)
parser.add_argument('--output-dir',required=True)
args=parser.parse_args()
P=Path(args.cache)
OUT=Path(args.output_dir);OUT.mkdir(parents=True,exist_ok=True)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
base='https://sus360.saude.gov.br/painel/saldo-gestor/agora-tem-especialistas/api/'
raw=(P/'indicadores-cirurgia.csv').read_bytes()
rows=list(csv.DictReader(raw.decode('utf-8-sig').splitlines(),delimiter=';'))
assert len({(r['Mês'],r['Especialidade']) for r in rows})==len(rows)
months=collections.defaultdict(lambda:{'procedures':0,'rows':0})
specialties=collections.defaultdict(lambda:collections.Counter())
for row in rows:
 month=row['Mês'].replace('/','-');count=int(row['Procedimentos realizados'])
 assert count>=0
 months[month]['procedures']+=count;months[month]['rows']+=1
 specialties[month[:4]][row['Especialidade']]+=count
series=[{'month':m,'procedures':r['procedures'],'sourceRows':r['rows'],'partial':m==now[:7]} for m,r in sorted(months.items())]
years=[]
for y in sorted(specialties):
 points=[r for r in series if r['month'].startswith(y)]
 years.append({'year':int(y),'procedures':sum(r['procedures'] for r in points),'months':len(points),'partial':len(points)<12 or any(r['partial'] for r in points),'specialties':[{'name':s,'procedures':n} for s,n in specialties[y].most_common() if n>0]})
package=json.loads((P/'regulacao-package.json').read_text())['result']
resource=next(r for r in package['resources'] if r['id']=='cd5cf02c-d01d-41ed-a503-d24352d33d3a')
data={'schemaVersion':1,'uf':'GO','retrievedAt':now,'source':{'name':'SES-GO — Indicadores de Cirurgia','url':'https://dadosabertos.go.gov.br/pt_BR/dataset/transparencia-regulacao-indicadores','downloadUrl':resource['url'],'resourceId':resource['id'],'lastModified':resource.get('last_modified'),'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(rows)},'classification':'production_count','unit':'procedures','coverage':'Registros do CSV Indicadores de Cirurgia da SES-GO; não representa necessariamente toda a produção cirúrgica do SUS em Goiás.','limitations':['Sem valores financeiros: esta base não determina gasto pago com cirurgias eletivas.','Contagem de procedimentos, não de pacientes únicos.','Não somar as filas mensais: o dicionário não esclarece se os registros são coortes, posições ou fluxos.','Resultado 2025 nesta base (48.380) diverge do indicador anual do RAG 2025 (66.608). As fontes têm escopos ou processamento distintos e não foram conciliadas.','O mês corrente é parcial; anos com menos de doze meses não representam ano completo.'],'monthly':series,'annual':years}
(OUT/'cirurgias-indicadores-normalizados.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
program=[]
for vintage in ['202512','202608']:
 src=P/f'sus360-go-estadual-{vintage}-gestor.json';raw2=src.read_bytes();d=json.loads(raw2)
 monthly=json.loads((P/f'sus360-go-estadual-{vintage}-mensal.json').read_text())
 program.append({'id':f'go-sus360-pate-estadual-{vintage}','uf':'GO','agencyCode':'520000','agency':'Goiás — gestor estadual SUS','scope':'Programa Agora Tem Especialistas — componente cirúrgico — gestão estadual','financialStage':'reported_production','financialStageLabel':'Produção financeira registrada','currency':'BRL','amountCents':round(d['producao']['cirurgico']*100),'periodStart':d['competenciaInicio'],'periodEnd':d['competenciaFim'],'snapshot':vintage,'sourceUrl':base+vintage+'/gestor/520000','sourcePage':'https://sus360.saude.gov.br/painel/saldo-gestor/agora-tem-especialistas/go/520000','sha256':hashlib.sha256(raw2).hexdigest(),'includesMunicipalManagers':False,'reportedProceduresRawApi':sum(x['qtdCirurgico'] for x in monthly['meses']),'monthlyProductionRawApi':[{'month':x['competencia'],'procedures':x['qtdCirurgico']} for x in monthly['meses']],'limitations':['Produção financeira do programa federal; não é comprovação de desembolso do Tesouro Estadual nem o gasto total da SES com cirurgias.','Não somar esta produção a pagamentos estaduais: pode representar financiamento das mesmas atividades.','A API mensal não foi conciliada com AIH e APAC. Seu acumulado cirúrgico jan–jun 2025 é 834, igual às APACs da ata CIB, que também registra 4.053 AIHs. Não usar essa contagem como total de cirurgias ou para custo unitário.','Não calcular razão equivalente de gasto pago versus produção sem deixar explícita a diferença de estágio.']+(['O endpoint 202608 informa competenciaFim 202607, embora a interface indique ago/2026; usar o período declarado no JSON e não subtrair vintages para estimar gasto de 2026.'] if vintage=='202608' else [])})
(OUT/'sus360-programa-cirurgico-normalizado.json').write_text(json.dumps({'schemaVersion':1,'retrievedAt':now,'records':program},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'indicatorYears':[(r['year'],r['procedures']) for r in years],'program':[(r['id'],r['amountCents'],r['reportedProceduresRawApi']) for r in program]},ensure_ascii=False))
