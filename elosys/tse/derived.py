"""Recompute public rule outputs atomically after a successful TSE refresh."""
from __future__ import annotations
import argparse
import fcntl
import json
from pathlib import Path
from contextlib import closing
from ..db import connect
from ..rules import circular_donations, disproportionate_expense, candidate_supplier_partner
from .monitor import _read_state, _write_state
from ..util import now_utc

class AtomicConnection:
    """Rule helpers cannot publish intermediate resets by calling commit."""
    def __init__(self, connection): self.connection=connection
    def __getattr__(self,name): return getattr(self.connection,name)
    def commit(self): pass
    def __enter__(self):return self
    def __exit__(self,kind,value,traceback):return False

def run(db_path:Path,state_path:Path,force=False):
    state=_read_state(state_path)
    if not force and not state.get("derived_refresh_pending"):return {"status":"unchanged"}
    inputs={key:{"payload_sha256":value.get("payload_sha256"),"signature":value.get("signature"),"synced_at":value.get("synced_at")} for key,value in state.get("sources",{}).items()}
    with closing(connect(db_path,write=True)) as con:
        con.execute("PRAGMA busy_timeout=60000")
        try:
            con.execute("BEGIN IMMEDIATE")
            atomic=AtomicConnection(con)
            reports={module.__name__:module.run(atomic) for module in (candidate_supplier_partner,disproportionate_expense,circular_donations)}
            con.commit()
        except BaseException:
            con.rollback()
            raise
    # Serialize monitor-state writes, after releasing the database writer lock.
    with state_path.with_suffix(".lock").open("w") as state_lock:
        fcntl.flock(state_lock,fcntl.LOCK_EX)
        state=_read_state(state_path)
        latest={key:{"payload_sha256":value.get("payload_sha256"),"signature":value.get("signature"),"synced_at":value.get("synced_at")} for key,value in state.get("sources",{}).items()}
        state["derived_refresh_pending"]=latest!=inputs
        state["derived_synced_at"]=now_utc()
        state["derived_input_hashes"]=inputs
        _write_state(state_path,state)
    return {"status":"updated","reports":reports}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db",type=Path,default=Path("/data/elosys.db"))
    parser.add_argument("--state",type=Path,default=Path("/data/tse-source-monitor.json"))
    parser.add_argument("--force",action="store_true")
    args=parser.parse_args()
    lock=args.state.with_suffix(".derived.lock")
    lock.parent.mkdir(parents=True,exist_ok=True)
    with lock.open("w") as file:
        try:fcntl.flock(file,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return 0
        print(json.dumps(run(args.db,args.state,args.force),ensure_ascii=False))
    return 0
if __name__=="__main__":raise SystemExit(main())
