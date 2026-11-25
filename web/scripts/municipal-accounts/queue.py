#!/usr/bin/env python3
"""Expand municipal fiscal coverage in bounded runs, resuming on the persistent volume."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sqlite3
import time
from urllib.error import HTTPError
import refresh

PRIORITY = ['3550308','3304557','3106200','4106902','4314902','2927408','2611606','2304400',
            '1302603','1501402','2111300','2211001','2408102','2507507','2704302','2800308',
            '3205309','4205407','5002704','5103403','1200401','1100205','1400100','1600303','1721000']


def candidates():
    known = {c['code'] for c in refresh.REGISTRY}
    groups = {}
    for f in sorted((refresh.BASE/'catalog').glob('[A-Z][A-Z].json')):
        uf=f.stem
        groups[uf]=[dict(code=code,uf=uf,name=name) for code,name,slug in json.loads(f.read_text()) if code not in known]
    ordered=[]
    by_code={c['code']:c for rows in groups.values() for c in rows}
    capitals=set(PRIORITY)
    ordered.extend(by_code[code] for code in PRIORITY if code in by_code)
    for i in range(max(map(len,groups.values()))):
        for rows in groups.values():
            if i<len(rows) and rows[i]['code'] not in capitals: ordered.append(rows[i])
    if len(by_code)!=len(ordered): raise ValueError('Catálogo contém município duplicado')
    return ordered


def run(root,limit,seconds,city_code):
    cities=candidates()
    if city_code:
        cities=[c for c in cities if c['code']==city_code]
        if not cities: raise ValueError('Município sem cadastro no catálogo nacional pendente')
    root.mkdir(parents=True,exist_ok=True)
    with (root/'.refresh.lock').open('a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('Coleta municipal ocupada; próximo ciclo retoma a fila.',flush=True)
            return 0
        with sqlite3.connect(root/'fiscal-queue.sqlite',timeout=5) as db:
            db.execute('CREATE TABLE IF NOT EXISTS queue (code TEXT PRIMARY KEY, due INTEGER NOT NULL, retry INTEGER NOT NULL, status TEXT NOT NULL)')
            state={c:(due,r) for c,due,r in db.execute('SELECT code,due,retry FROM queue')}
            stamp=int(time.time())
            due=[c for c in cities if city_code or state.get(c['code'],(0,0))[0]<=stamp]
            # Stable sort preserves the order across states within each class.
            due.sort(key=lambda c: (root/(c['code']+'-fiscal.json')).is_file())
            deadline=time.monotonic()+seconds
            counts={'published':0,'updated':0,'unchanged':0,'deferred':0}
            attempted=0
            for city in due[:limit]:
                if time.monotonic()>=deadline: break
                attempted+=1
                code=city['code']
                file=root/(code+'-fiscal.json')
                next_due=stamp+7*86400
                attempts=0
                cooldown=False
                try:
                    prior=refresh.read(file)
                    data=refresh.fiscal(city,prior,fast_start=prior is None and not city_code)
                    if data: refresh.replace(file,data)
                    status='updated' if data and prior else 'published' if data else 'unchanged'
                except Exception as error:
                    attempts=state.get(code,(0,0))[1]+1
                    next_due=stamp+min(7*86400,3600*4**min(attempts,4))
                    cooldown=isinstance(error,HTTPError) and error.code in {429,503}
                    status='deferred'
                    print(f'{code} {city["name"]}: preservado/pending ({error})',flush=True)
                counts[status]+=1
                db.execute('INSERT OR REPLACE INTO queue VALUES(?,?,?,?)',(code,next_due,attempts,status))
                db.commit()
                if cooldown:
                    print('Limite/indisponibilidade do Tesouro. Restante adiado para o próximo ciclo.',flush=True)
                    break
            print(json.dumps(dict(attempted=attempted,due=len(due),catalog=len(cities),**counts),ensure_ascii=False),flush=True)
            return 0 if counts['deferred']<attempted or not attempted else 1


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=Path,default=Path(os.environ.get('MUNICIPAL_REFRESH_DIR','/data/municipal-accounts-refresh')))
    p.add_argument('--limit',type=int,default=60)
    p.add_argument('--seconds',type=int,default=780)
    p.add_argument('--city')
    a=p.parse_args()
    if not 1<=a.limit<=100 or not 30<=a.seconds<=900: p.error('Limites permitidos: 1–100 cidades e 30–900 segundos por execução.')
    return run(a.root,a.limit,a.seconds,a.city)


if __name__=='__main__':
    raise SystemExit(main())
