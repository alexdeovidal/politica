import urllib.request,urllib.parse,pathlib,concurrent.futures,json,argparse,sys,datetime,hashlib
parser=argparse.ArgumentParser(description='Download official SES-GO PCE paid transfer exports by competence year.')
parser.add_argument('--cache',required=True)
parser.add_argument('--years',default='2021,2022,2023,2024,2025,2026')
args=parser.parse_args()
p=pathlib.Path(args.cache);p.mkdir(parents=True,exist_ok=True)
base='https://extranet.saude.go.gov.br/saf/Relatorio/RelatorioPagamentoFundoExcel'
def fetch(year):
 params={'idProgramaSaude':'51','ano':str(year),'idFundo':'','mes':'','parcelas':'0','idRegiao':'','pago':'T','dataInicial':'','dataFinal':'','valorIdProgramaSaude':'PCE-PROCEDIMENTOS CIRURGICOS ELETIVOS','valorIdRegiao':':: TODAS ::','valorNomeRazaoSocialFundoConsultaHidden':''}
 url=base+'?'+urllib.parse.urlencode(params)
 try:
  r=urllib.request.urlopen(url,timeout=55);data=r.read();p.joinpath(f'pce-pagos-{year}.xls').write_bytes(data)
  p.joinpath(f'pce-pagos-{year}.metadata.json').write_text(json.dumps({'url':url,'status':r.status,'contentType':r.headers.get('content-type'),'contentDisposition':r.headers.get('content-disposition'),'bytes':len(data),'responseUrl':r.geturl(),'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(data).hexdigest()},ensure_ascii=False,indent=2))
  return year,r.status,len(data),r.headers.get('content-type')
 except Exception as e:return year,str(e)
if __name__=='__main__':
 results=list(concurrent.futures.ThreadPoolExecutor(3).map(fetch,[int(y) for y in args.years.split(',')]))
 for r in results:print(r,flush=True)
 if any(not isinstance(r[1], int) or r[1] != 200 for r in results):sys.exit(1)
