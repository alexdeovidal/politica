"""Import official TSE government proposal PDFs, linking only by candidacy identifier."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import io
import json
import re
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from curl_cffi import requests
from pypdf import PdfReader

BASE="https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/"
STATES="AC AL AM AP BA BR CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split()

def run(db_path:Path,store_path:Path,files_path:Path,years:list[int],units:list[str])->dict:
    primary=sqlite3.connect(f"file:{db_path}?mode=ro",uri=True)
    store=sqlite3.connect(store_path,timeout=60)
    store.executescript("""CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL,source_url TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS external_record(id TEXT PRIMARY KEY,source TEXT NOT NULL,entity_key TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,event_date TEXT,url TEXT NOT NULL,payload TEXT NOT NULL,collected_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ix_external_entity ON external_record(entity_key,source,event_date);
    CREATE TABLE IF NOT EXISTS sync_run(id INTEGER PRIMARY KEY,source TEXT NOT NULL,status TEXT NOT NULL,checked_at TEXT NOT NULL,changed_at TEXT,detail TEXT);""")
    files_path.mkdir(parents=True,exist_ok=True);report={"updated":0,"unchanged":0,"failed":[]}
    try:
        for year in years:
            candidate_people={str(row[0]):int(row[1]) for row in primary.execute("SELECT tse_candidacy_id,min(person_id) FROM politician_history WHERE year=? AND tse_candidacy_id IS NOT NULL GROUP BY tse_candidacy_id HAVING count(DISTINCT person_id)=1",(year,))}
            for unit in units:
                if unit not in STATES:raise ValueError("UF inválida")
                url=f"{BASE}proposta_governo_{year}_{unit}.zip"
                now=datetime.now(timezone.utc).isoformat()
                try:
                    head=requests.head(url,impersonate="chrome",timeout=45);head.raise_for_status()
                    signature={k:head.headers.get(k) for k in ("ETag","Last-Modified","Content-Length")}
                    saved=store.execute("SELECT payload FROM cache WHERE key=?",(url,)).fetchone()
                    if saved and any(signature.values()) and json.loads(saved[0])==signature:
                        report["unchanged"]+=1;continue
                    response=requests.get(url,impersonate="chrome",timeout=180);response.raise_for_status()
                    archive_hash=hashlib.sha256(response.content).hexdigest()
                    archive=zipfile.ZipFile(io.BytesIO(response.content))
                    pending=[];pdf_count=sum(entry.filename.lower().endswith(".pdf") for entry in archive.infolist());matched_count=0
                    for entry in archive.infolist():
                        match=re.fullmatch(rf"{year}{unit}(\d+)(?:_(\d+))?\.pdf",Path(entry.filename).name,re.IGNORECASE)
                        if not match or entry.file_size>100_000_000:continue
                        matched_count+=1
                        candidacy,version=match.groups();version=version or "1"
                        person_id=candidate_people.get(candidacy)
                        if person_id is None:continue
                        content=archive.read(entry);digest=hashlib.sha256(content).hexdigest()
                        filename=files_path/f"{digest}.pdf";filename.write_bytes(content)
                        reader=PdfReader(io.BytesIO(content));text="\n\n".join(page.extract_text() or "" for page in reader.pages)
                        payload={"year":year,"unit":unit,"candidacyId":candidacy,"version":version,"filename":filename.name,"text":text,"pages":len(reader.pages),"sha256":digest,"archiveSha256":archive_hash,"extracted":bool(text.strip())}
                        identifier=f"proposal:{year}:{candidacy}:{version}"
                        pending.append((identifier,"TSE propostas",str(person_id),"proposal",f"Proposta de governo {year} · {unit}",None,url,json.dumps(payload,ensure_ascii=False),now))
                    if pdf_count and not matched_count:raise ValueError("Formato dos nomes PDF desconhecido; registros publicados preservados")
                    store.execute("BEGIN IMMEDIATE")
                    # Publish the complete validated archive together, including withdrawn PDFs.
                    store.execute("DELETE FROM external_record WHERE source='TSE propostas' AND url=?",(url,))
                    store.executemany("INSERT INTO external_record VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,collected_at=excluded.collected_at,url=excluded.url,entity_key=excluded.entity_key",pending)
                    store.execute("INSERT INTO cache VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",(url,json.dumps(signature),now,url));store.commit();report["updated"]+=len(pending)
                except Exception as error:
                    store.rollback()
                    report["failed"].append({"year":year,"unit":unit,"error":str(error)})
                    store.execute("INSERT INTO sync_run(source,status,checked_at,detail) VALUES(?,?,?,?)",("TSE propostas","failed",now,json.dumps({"url":url,"error":str(error)})));store.commit()
        store.execute("INSERT INTO sync_run(source,status,checked_at,changed_at,detail) VALUES(?,?,?,?,?)",("TSE propostas","failed" if report["failed"] else "success",datetime.now(timezone.utc).isoformat(),datetime.now(timezone.utc).isoformat() if report["updated"] else None,json.dumps(report)));store.commit()
    finally:primary.close();store.close()
    return report

def available_units(year:int)->list[str]:
    url=f"https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-{year}"
    response=requests.get(url,impersonate="chrome",timeout=60);response.raise_for_status()
    payload=response.json()
    if not payload.get("success"):raise ValueError("Catálogo oficial do TSE indisponível")
    units=[]
    for resource in payload.get("result",{}).get("resources",[]):
        match=re.fullmatch(re.escape(BASE)+rf"proposta_governo_{year}_([A-Z]{{2}})\.zip",resource.get("url","") or "")
        if match and match.group(1) in STATES:units.append(match.group(1))
    return sorted(set(units))

def main()->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--db",type=Path,default=Path("/data/elosys.db"));p.add_argument("--store",type=Path,default=Path("/data/politica-platform.db"));p.add_argument("--files",type=Path,default=Path("/data/propostas"));p.add_argument("--years",type=int,nargs="+",default=[2026]);p.add_argument("--units",nargs="+");a=p.parse_args()
    a.store.parent.mkdir(parents=True,exist_ok=True)
    with a.store.with_suffix(".proposals.lock").open("w") as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return 0
        report={"updated":0,"unchanged":0,"failed":[]}
        for year in a.years:
            try:
                units=a.units or available_units(year)
                if not units:raise ValueError("Nenhum arquivo de propostas encontrado no catálogo oficial")
                part=run(a.db,a.store,a.files,[year],units)
                report["updated"]+=part["updated"];report["unchanged"]+=part["unchanged"];report["failed"].extend(part["failed"])
            except Exception as error:report["failed"].append({"year":year,"error":str(error)})
        print(json.dumps(report,ensure_ascii=False))
        return bool(report["failed"])
if __name__=="__main__":raise SystemExit(main())
