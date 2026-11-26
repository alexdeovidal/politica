#!/usr/bin/env python3
"""Extract disjoint ages from IBGE 9514 (2022) without imputing missing municipalities."""
import argparse,json,hashlib
from collections import defaultdict
from pathlib import Path
SOURCE="https://apisidra.ibge.gov.br/values/t/9514/n6/all/v/93/p/2022/c287/100362,93070,93084,93085,93086,93087,93088/c2/6794"
AGES=("100362","93070","93084","93085","93086","93087","93088")
def build(raw):
    head,*rows=json.loads(raw)
    if (head.get("D4N"),head.get("D5N"),head.get("D6N"))!=("Idade","Sexo","Forma de declaração da idade"):raise ValueError("Dimensões do Censo alteradas")
    records=defaultdict(dict)
    for row in rows:
        code,age,num=(row[k] for k in ("D1C","D4C","V"))
        if (row["NC"],row["D2C"],row["D3C"],row["D5C"],row["D6C"])!=("6","93","2022","6794","113635") or not num.isdigit() or age not in AGES or age in records[code]:
            raise ValueError(f"Linha de idade inesperada: {code}/{age}")
        records[code][age]=int(num)
    if len(records)!=5570:raise ValueError("Cobertura de origem incompleta")
    result={}
    for code,values in sorted(records.items()):
        if set(values)!=set(AGES):raise ValueError("Grupos incompletos em "+code)
        kids=sum(values[k] for k in AGES[1:4]); young=sum(values[k] for k in AGES[4:])
        adults=values[AGES[0]]-kids-young
        if min(kids,young,adults)<0:raise ValueError("Grupos incompatíveis em "+code)
        result[code]=[kids,young,adults]
    return {"url":"https://sidra.ibge.gov.br/tabela/9514","source":SOURCE,"sha256":hashlib.sha256(raw).hexdigest(),"year":2022,"rows":result}
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("input",type=Path);p.add_argument("output",type=Path)
    a=p.parse_args();a.output.write_text(json.dumps(build(a.input.read_bytes()),ensure_ascii=False,separators=(",",":"))+"\n")
