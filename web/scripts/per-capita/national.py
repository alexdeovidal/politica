#!/usr/bin/env python3
"""Collect closed annual Siconfi reports, one documented request per entity.
A missing/rejected response is not a zero. Snapshots are resumable and atomic.
"""
import argparse, concurrent.futures, fcntl, gzip, json, hashlib, re, threading, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from decimal import Decimal
from collect import extract, education_breakdown, read_pop, IBGE, RREO, YEAR

WEB=Path(__file__).resolve().parents[2]
BASE=WEB/"src/lib/per-capita-2025.json"
NATIONAL=WEB/"data/per-capita/national-2025.json.gz"
STATES=WEB/"src/lib/state-accounts/registry.ts"
CATALOG=WEB/"data/municipal-accounts/catalog"
LIMIT=4.0
last=0
hold=0
lock=threading.Lock()

def governments():
    states=re.findall(r'uf: "([A-Z]{2})", ibgeCode: (\d+), slug: "([^"]+)", name: "([^"]+)"',STATES.read_text())
    assert len(states)==27
    result=[("state",code,uf,name,"/contas-do-estado/"+slug) for uf,code,slug,name in states]
    for uf,_,_,_ in states:
        if uf=="DF": continue
        for code,name,slug in json.loads((CATALOG/(uf+".json")).read_text()):
            href="/contas-do-municipio/caldas-novas" if code=="5204508" else "/contas-do-municipio/"+uf.lower()+"/"+slug
            result.append(("city",code,uf,name,href))
    assert len(result)==len({i[1] for i in result})==5596
    return result

def write_json(path, obj):
    tmp=path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":"))+"\n")
    tmp.replace(path)

def fetch(item, population, cache, simplified_only=False):
    if not simplified_only:
        status=fetch_report(item,population,cache,"RREO")
        if status!="empty" or item[0]!="city":return status
    return fetch_report(item,population,cache,"RREO Simplificado")

def fetch_report(item, population, cache, report):
    global last,hold
    scope,code,uf,name,href=item
    path=cache/(code+".json")
    if path.is_file(): return "cached"
    query=dict(an_exercicio=YEAR,nr_periodo=6,co_tipo_demonstrativo=report,no_anexo="RREO-Anexo 02",id_ente=code)
    url=RREO+"?"+urlencode(query)
    for attempt in range(3):
        try:
            with lock:
                delay=max(0,last+1/LIMIT-time.monotonic(),hold-time.monotonic())
                if delay:time.sleep(delay)
                last=time.monotonic()
            with urlopen(Request(url,headers={"Accept":"application/json","Accept-Encoding":"gzip","User-Agent":"Politica007 public fiscal data collection"}),timeout=20) as r:
                raw=r.read(5_000_001)
                if r.headers.get("Content-Encoding")=="gzip": raw=gzip.decompress(raw)
            if len(raw)>5_000_000: raise ValueError("Resposta excessiva")
            data=json.loads(raw,parse_float=Decimal)
            if data.get("items")==[] and data.get("hasMore") is False:return "empty"
            # Consortia may share the host municipality's IBGE code. Ignore only explicitly
            # labeled consortium rows after confirming the report identity.
            if scope=="city" and data.get("hasMore") is False:
                vals=data["items"]
                if any((str(r["cod_ibge"]),r["uf"],r["exercicio"],r["periodo"],r["anexo"])!=(code,uf,YEAR,6,"RREO-Anexo 02") or r["esfera"] not in ("M","C") for r in vals):
                    raise ValueError("RREO com ente ou período diferente")
                data={**data,"items":[r for r in vals if r["esfera"]=="M"]}
                if not data["items"]:return "empty"
            if any(r["demonstrativo"]!=report or r["periodicidade"]!="B" for r in data["items"]):
                raise ValueError("Tipo ou periodicidade divergente no RREO")
            fn,total=extract(data,code,uf,scope)
            if total<=0:raise ValueError("Total inválido")
            row=dict(scope=scope,code=code,uf=uf,name=name,href=href,population=population,totalCents=total,functions=fn,
                     reconciliationCents=sum(fn.values())-total,source=url,sourceSha256=hashlib.sha256(raw).hexdigest(),
                     educationSubfunctions=education_breakdown(data))
            write_json(path,row)
            return "ok"
        except HTTPError as e:
            if e.code in (429,503):
                with lock: hold=max(hold,time.monotonic()+min(120,int(e.headers.get("Retry-After","30")) if e.headers.get("Retry-After","").isdigit() else 30))
            if e.code not in (429,500,502,503,504): return f"http_{e.code}"
        except ValueError as e: return "invalid:"+str(e)
        except OSError: pass
        time.sleep(2**attempt)
    return "retry"

def main():
    global LIMIT
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("ods",type=Path);p.add_argument("cache",type=Path)
    p.add_argument("--output",type=Path);p.add_argument("--states-only",action="store_true")
    p.add_argument("--export-only",action="store_true");p.add_argument("--limit",type=int)
    p.add_argument("--live",action="store_true",help="Use the repository’s verified 2025 denominator; positional ods is ignored")
    p.add_argument("--codes",type=Path,help="Only fetch the listed government codes, one per line")
    p.add_argument("--simplified-only",action="store_true",help="Recover municipal codes already verified absent in standard RREO")
    a=p.parse_args()
    only=set(a.codes.read_text().split()) if a.codes else None
    if a.simplified_only and only is None:p.error("--simplified-only requires --codes")
    if a.simplified_only:LIMIT=2.0
    gov=governments();a.cache.mkdir(parents=True,exist_ok=True)
    lockfile=(a.cache/"run.lock").open("a")
    try: fcntl.flock(lockfile,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        print("Coleta já em andamento",flush=True)
        return
    seed=json.loads(gzip.decompress(NATIONAL.read_bytes())) if a.live else None
    pop=read_pop(a.ods) if not a.live else {}
    seeded={r["code"] for r in seed["entities"]} if seed else set()
    outcome_path=a.cache/"outcomes.history"
    outcomes=json.loads(outcome_path.read_text()) if outcome_path.exists() else {}
    def population(row):
        return seed["populationSet"].get(row[1],0) if seed else pop.get((row[0],row[3] if row[0]=="state" else row[1]),0)
    if not a.export_only:
        tasks=sorted((g for g in gov if (not a.states_only or g[0]=="state") and (only is None or g[1] in only) and (not a.simplified_only or g[0]=="city") and population(g)>0),key=lambda g:(outcomes.get(g[1],{}).get("last",0),g[0]!="state",-population(g)))
        tasks=[g for g in tasks if g[1] not in seeded and not (a.cache/(g[1]+".json")).exists() and (not a.live or outcomes.get(g[1],{}).get("version")!=2 or time.time()-outcomes.get(g[1],{}).get("last",0)>86400)]
        if a.limit:tasks=tasks[:a.limit]
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            fs={pool.submit(fetch,g,population(g),a.cache,a.simplified_only):g for g in tasks}
            for f in concurrent.futures.as_completed(fs):
                g=fs[f]
                try: status=f.result()
                except Exception as e: status="error:"+type(e).__name__
                outcomes[g[1]]={"last":int(time.time()),"status":status,"version":2}
                print(g[1],status,flush=True)
            write_json(outcome_path,outcomes)
    if a.output:
        sample=json.loads(BASE.read_text())
        rows={} if a.live else {r["code"]:r for r in sample["entities"]}
        available={g[1]:g for g in gov}
        for path in a.cache.glob("*.json"):
            row=json.loads(path.read_text())
            if row["code"] not in available or row["population"]!=population(available[row["code"]]): raise ValueError("Cache inconsistente")
            rows[row["code"]]=row
        if a.live:
            dist={s:sum(1 for v in outcomes.values() if v["status"]==s) for s in sorted({v["status"] for v in outcomes.values()})}
            write_json(a.output,{"year":YEAR,"period":6,"populationSha256":seed["populationSha256"],"entities":list(rows.values()),"generatedAt":datetime.now(timezone.utc).isoformat(),"outcomes":dist})
            print("Complemento nacional:",len(rows),"resultados; respostas",dist,flush=True)
            return
        sample.update(generatedAt=datetime.now(timezone.utc).isoformat(),populationSha256=hashlib.sha256(a.ods.read_bytes()).hexdigest(),
             populationSet={g[1]:population(g) for g in gov if population(g)>0},entities=[rows[g[1]] for g in gov if g[1] in rows])
        a.output.parent.mkdir(parents=True,exist_ok=True)
        write_json(a.output,sample)

if __name__=="__main__":main()
