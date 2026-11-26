from copy import deepcopy
from decimal import Decimal
import unittest
from collect import COLUMN, SCOPE, extract

def row(name,value):
 return dict(cod_ibge=5204508,uf="GO",esfera="M",exercicio=2025,periodo=6,anexo="RREO-Anexo 02",
             rotulo=SCOPE,coluna=COLUMN,conta=name,valor=Decimal(value))

class AnnualFiscalTest(unittest.TestCase):
 def setUp(self):
  self.data={"hasMore":False,"items":[row("Saúde","100.01"),row("Educação","200.02"),
             row("DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)","300.03")]}
 def test_takes_official_total_in_cents(self):
  self.assertEqual(extract(self.data,"5204508","GO","city"),({"Saúde":10001,"Educação":20002},30003))
 def test_refuses_different_stage_scope_and_period(self):
  for field,value in {"periodo":5,"esfera":"E","uf":"SP","coluna":"Outra coluna"}.items():
   d=deepcopy(self.data)
   d["items"][0][field]=value
   with self.assertRaises(ValueError):extract(d,"5204508","GO","city")
 def test_rejects_pagination_and_duplicate_function(self):
  for more in (True,False):
   d=deepcopy(self.data)
   d["hasMore"]=more
   d["items"].append(row("Saúde","100.01"))
   with self.assertRaises(ValueError): extract(d,"5204508","GO","city")
