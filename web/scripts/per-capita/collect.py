#!/usr/bin/env python3
"""Build an explicitly scoped 2025 comparison from the IBGE revision and RREO Anexo 02."""
from datetime import datetime, timezone
from decimal import Decimal
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile
import time

YEAR=2025
IBGE="https://ftp.ibge.gov.br/Estimativas_de_Populacao/Estimativas_2025/POP2025_20260828.ods"
RREO="https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo"
SCOPE="Total das Despesas Exceto Intra-Orçamentárias"
COLUMN="DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)"
T="{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
P="{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
AREAS="Legislativa|Judiciária|Essencial à Justiça|Administração|Defesa Nacional|Segurança Pública|Relações Exteriores|Assistência Social|Previdência Social|Saúde|Trabalho|Educação|Cultura|Direitos da Cidadania|Urbanismo|Habitação|Saneamento|Gestão Ambiental|Ciência e Tecnologia|Agricultura|Organização Agrária|Indústria|Comércio e Serviços|Comunicações|Energia|Transporte|Desporto e Lazer|Encargos Especiais|Reserva de Contingência".split("|")
EDUCATION_SUBFUNCTIONS=("Educação Infantil","Ensino Fundamental","Ensino Médio","Ensino Profissional","Ensino Superior",
                        "Educação de Jovens e Adultos","Educação Especial","Educação Básica")
ENTITIES=[
 ("state","52","GO","Goiás","/contas-do-estado/goias"),
 ("state","31","MG","Minas Gerais","/contas-do-estado/minas-gerais"),
 ("state","35","SP","São Paulo","/contas-do-estado/sao-paulo"),
 ("city","5204508","GO","Caldas Novas","/contas-do-municipio/caldas-novas"),
 ("city","5208707","GO","Goiânia","/contas-do-municipio/go/goiania"),
 ("city","5201405","GO","Aparecida de Goiânia","/contas-do-municipio/go/aparecida-de-goiania"),
 ("city","5201108","GO","Anápolis","/contas-do-municipio/go/anapolis"),
 ("city","5218805","GO","Rio Verde","/contas-do-municipio/go/rio-verde"),
 ("city","3550308","SP","São Paulo","/contas-do-municipio/sp/sao-paulo"),
 ("city","3304557","RJ","Rio de Janeiro","/contas-do-municipio/rj/rio-de-janeiro"),
 ("city","3106200","MG","Belo Horizonte","/contas-do-municipio/mg/belo-horizonte"),
 ("city","4106902","PR","Curitiba","/contas-do-municipio/pr/curitiba"),
 ("city","2304400","CE","Fortaleza","/contas-do-municipio/ce/fortaleza"),
]

def money(value):
 n=Decimal(value)*100
 if not n.is_finite() or n != n.to_integral_value() or abs(n) > 9007199254740991:
  raise ValueError("Valor sem precisão em centavos")
 return int(n)

def read_pop(path):
 with ZipFile(path) as z:
  root=ET.fromstring(z.read("content.xml"))
 out={}
 for table in root.iter(T+"table"):
  name=table.get(T+"name")
  for n,row in enumerate(table.iter(T+"table-row")):
   if n<2: continue
   v=["".join(t.itertext()).strip() for c in row.findall(T+"table-cell") for t in c.findall(P+"p")]
   if name=="BRASIL_E_UFs" and len(v)>=2: key=("state",v[0])
   elif name=="Municípios" and len(v)>=5 and v[1].isdigit() and v[2].isdigit(): key=("city",v[1]+v[2].zfill(5))
   else: continue
   token=(v[1] if key[0]=="state" else v[4]).replace(".","").split()[0]
   if token.isdigit(): out[key]=int(token)
 return out

def extract(payload,code,uf,scope):
 rows=payload.get("items")
 if payload.get("hasMore") is not False or not isinstance(rows,list) or not rows:
  raise ValueError("Resposta RREO incompleta")
 identity=(code,uf,"E" if scope=="state" else "M",YEAR,6,"RREO-Anexo 02")
 if any((str(r["cod_ibge"]),r["uf"],r["esfera"],r["exercicio"],r["periodo"],r["anexo"])!=identity for r in rows):
  raise ValueError("RREO com ente ou período diferente")
 output={}
 for r in rows:
  if (r["rotulo"],r["coluna"])!=(SCOPE,COLUMN): continue
  name=r["conta"]
  if name not in AREAS: continue
  if name in output: raise ValueError(f"Função duplicada: {name}")
  output[name]=money(r["valor"])
 if "Saúde" not in output or "Educação" not in output:
  raise ValueError("Função-chave não publicada")
 values=[money(r["valor"]) for r in rows if (r["rotulo"],r["coluna"],r["conta"])==(SCOPE,COLUMN,"DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)")]
 if len(values)!=1: raise ValueError("Total oficial ausente ou duplicado")
 return output,values[0]

def education_breakdown(payload):
 out={}
 for r in payload["items"]:
  if (r["rotulo"],r["coluna"])!=(SCOPE,COLUMN) or r["conta"] not in EDUCATION_SUBFUNCTIONS: continue
  name=r["conta"]
  if name in out: raise ValueError(f"Subfunção duplicada: {name}")
  out[name]=money(r["valor"])
 return out

def main():
 p=argparse.ArgumentParser(__doc__)
 p.add_argument("ods",type=Path)
 p.add_argument("cache",type=Path)
 p.add_argument("output",type=Path)
 a=p.parse_args()
 a.cache.mkdir(parents=True,exist_ok=True)
 pop=read_pop(a.ods)
 result=[]
 for scope,code,uf,name,href in ENTITIES:
  path=a.cache/f"{code}.json"
  url=RREO+"?"+urlencode(dict(an_exercicio=YEAR,nr_periodo=6,co_tipo_demonstrativo="RREO",no_anexo="RREO-Anexo 02",id_ente=code))
  if path.is_file():
   raw=path.read_bytes()
   functions,total=extract(json.loads(raw,parse_float=Decimal),code,uf,scope)
  else:
   time.sleep(1.2)
   with urlopen(Request(url,headers={"Accept":"application/json"}),timeout=35) as response:
    raw=response.read(5_000_001)
   if len(raw)>5_000_000: raise ValueError("Resposta excessiva")
   functions,total=extract(json.loads(raw,parse_float=Decimal),code,uf,scope)
   path.write_bytes(raw)
  population=pop[(scope,name if scope=="state" else code)]
  if population<=0: raise ValueError("População inválida")
  result.append(dict(scope=scope,code=code,uf=uf,name=name,href=href,population=population,totalCents=total,functions=functions,
                     reconciliationCents=sum(functions.values())-total,source=url,sourceSha256=hashlib.sha256(raw).hexdigest(),
                     **({"educationSubfunctions":education_breakdown(json.loads(raw,parse_float=Decimal))} if code in {"52","5204508"} else {})))
  print(code,name,population,functions["Saúde"],functions["Educação"],flush=True)
 data=dict(year=YEAR,period=6,end=f"{YEAR}-12-31",populationDate=f"{YEAR}-07-01",populationUrl=IBGE,
           populationSha256=hashlib.sha256(a.ods.read_bytes()).hexdigest(),generatedAt=datetime.now(timezone.utc).isoformat(),entities=result)
 a.output.parent.mkdir(parents=True,exist_ok=True)
 tmp=a.output.with_suffix(".tmp")
 tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
 tmp.replace(a.output)
if __name__=="__main__": main()
