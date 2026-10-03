"""Monitor historical TSE sources and results, applying a bounded number per run."""
from __future__ import annotations
import argparse
import fcntl
import json
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
from . import assets,candidates,accounts,social,processual,voting
from .monitor import remote_signature,_read_state,_write_state
from ..db import connect
from ..provenance import write_manifest

def sources():
    result=[]
    for year in (2026,2024,2022,2020,2018,2016,2014):
        if year in processual.SUPPORTED_YEARS:
            result.append((f"processes_{year}",year,[processual.BASE_URL+t.format(year=year) for t in processual._RESOURCES.values()],processual.refresh_year,None))
        if year!=2026:
            for name,module,filename in (("candidates",candidates,"consulta_cand_{year}.zip"),("finance",accounts,"prestacao_contas_candidatos_{year}.zip"),("assets",assets,"bem_candidato_{year}.zip"),("social",social,"rede_social_candidato_{year}.zip")):
                if year in module.SUPPORTED_YEARS:result.append((f"{name}_{year}",year,[module.URL_TEMPLATE.format(year=year)],module.refresh_year,filename.format(year=year)))
        if year in voting.SUPPORTED_YEARS:
            units=[unit for unit in voting.STATES if unit!='DF' or year in voting.PRESIDENTIAL_YEARS]+(["BR"] if year in voting.PRESIDENTIAL_YEARS else [])
            for unit in units:
                result.append((f"votes_{year}_{unit}",year,[voting.URL_TEMPLATE.format(year=year,unit=unit)],unit,None))
    return result

def run(db_path:Path,state_path:Path,tmp:Path,manifest:Path,max_updates=1):
    state=_read_state(state_path);known=state.setdefault("sources",{})
    # The Federal District has no municipal elections or corresponding section archives.
    for year in (2016,2020,2024):known.pop(f"votes_{year}_DF",None)
    items=sources();cursor=int(state.get("archive_cursor",0))%len(items);updated=0;results=[]
    tmp.mkdir(parents=True,exist_ok=True)
    urls_to_check=list(dict.fromkeys(url for item in items for url in item[2]))
    def signature_result(url):
        try:return remote_signature(url)
        except Exception as error:return error
    with ThreadPoolExecutor(max_workers=6) as pool:headers=dict(zip(urls_to_check,pool.map(signature_result,urls_to_check)))
    with closing(connect(db_path,write=True)) as con:
        con.execute("PRAGMA busy_timeout=60000")
        for offset in range(len(items)):
            index=(cursor+offset)%len(items);name,year,urls,updater,filename=items[index];now=datetime.now(timezone.utc).isoformat(timespec="seconds");previous=known.get(name,{})
            try:
                signatures={url:headers[url] for url in urls}
                for signature in signatures.values():
                    if isinstance(signature,Exception):raise signature
                previous.update({"url":urls[0],"urls":urls,"checked_at":now,"error":None})
                unchanged=any(any(value for value in signature.values()) for signature in signatures.values()) and previous.get("signature")==signatures and previous.get("synced_at")
                if unchanged:previous["status"]="unchanged"
                elif updated>=max_updates:previous["status"]="pending"
                else:
                    if filename:(tmp/filename).unlink(missing_ok=True)
                    if name.startswith(("candidates_","finance_")):
                        state["derived_refresh_pending"]=True;_write_state(state_path,state)
                    if isinstance(updater,str):report=voting._ingest_archive(con,year,updater,tmp)
                    else:report=updater(con,year,tmp_dir=tmp)
                    if not report.get("rows",report.get("source_rows",0)):raise ValueError("Arquivo sem linhas verificáveis; sincronização não declarada")
                    synced=datetime.now(timezone.utc).isoformat(timespec="seconds")
                    previous.update({"signature":signatures,"synced_at":synced,"status":"updated"})
                    state["generated_at"]=synced;state["archive_cursor"]=(index+1)%len(items);updated+=1
                    if name.startswith(("candidates_","finance_")):state["derived_refresh_pending"]=True
                    write_manifest(con,manifest)
                known[name]=previous;state["checked_at"]=now
                results.append({"source":name,"status":previous["status"]})
            except Exception as error:
                previous.update({"url":urls[0],"checked_at":now,"status":"failed","error":str(error)});known[name]=previous;results.append({"source":name,"status":"failed","error":str(error)})
            state.setdefault("history",[]).append({"source":name,"status":previous["status"],"checked_at":now,"synced_at":previous.get("synced_at")});state["history"]=state["history"][-500:];_write_state(state_path,state)
    return results

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--db",type=Path,default=Path("/data/elosys.db"));p.add_argument("--state",type=Path,default=Path("/data/tse-source-monitor.json"));p.add_argument("--tmp",type=Path,default=Path("/data/tse-history-tmp"));p.add_argument("--manifest",type=Path,default=Path("/data/manifest.json"));p.add_argument("--max-updates",type=int,default=1);a=p.parse_args()
    a.state.parent.mkdir(parents=True,exist_ok=True)
    with a.state.with_suffix(".lock").open("w") as lock,a.state.with_suffix(".ingest.lock").open("w") as ingest_lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            fcntl.flock(ingest_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return 0
        from .search_index import ensure
        ensure(a.db)
        results=run(a.db,a.state,a.tmp,a.manifest,max(1,a.max_updates));print(json.dumps(results,ensure_ascii=False))
    return int(any(r["status"]=="failed" for r in results))
if __name__=="__main__":raise SystemExit(main())
