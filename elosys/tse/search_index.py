"""Index official ballot names once and maintain them transactionally on refresh."""
from __future__ import annotations
import argparse
import sqlite3
from pathlib import Path
from ..util import now_utc

def ensure(db_path: Path):
    con=sqlite3.connect(str(db_path),timeout=60)
    try:
        if con.execute("SELECT 1 FROM sqlite_master WHERE name='_politica_search_index'").fetchone():
            if con.execute("SELECT version FROM _politica_search_index WHERE id=1").fetchone()==(1,):return {"status":"unchanged"}
        con.execute("BEGIN IMMEDIATE")
        con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS politician_name_search USING fts5(person_id UNINDEXED,ballot_name,tokenize='unicode61 remove_diacritics 2')")
        con.execute("CREATE TABLE IF NOT EXISTS _politica_search_index(id INTEGER PRIMARY KEY,version INTEGER NOT NULL,built_at TEXT NOT NULL)")
        con.execute("DELETE FROM politician_name_search")
        con.execute("INSERT INTO politician_name_search(rowid,person_id,ballot_name) SELECT id,person_id,ballot_name FROM politician_history WHERE ballot_name IS NOT NULL")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_ballot_insert AFTER INSERT ON politician_history WHEN new.ballot_name IS NOT NULL BEGIN INSERT INTO politician_name_search(rowid,person_id,ballot_name) VALUES(new.id,new.person_id,new.ballot_name); END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_ballot_delete AFTER DELETE ON politician_history BEGIN DELETE FROM politician_name_search WHERE rowid=old.id; END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_ballot_update AFTER UPDATE OF ballot_name,person_id ON politician_history WHEN old.ballot_name IS NOT new.ballot_name OR old.person_id IS NOT new.person_id BEGIN DELETE FROM politician_name_search WHERE rowid=old.id; INSERT INTO politician_name_search(rowid,person_id,ballot_name) SELECT new.id,new.person_id,new.ballot_name WHERE new.ballot_name IS NOT NULL; END""")
        con.execute("INSERT OR REPLACE INTO _politica_search_index VALUES(1,1,?)",(now_utc(),))
        count=con.execute("SELECT count(*) FROM politician_name_search").fetchone()[0]
        con.commit()
        return {"status":"updated","rows":count}
    except BaseException:
        con.rollback();raise
    finally:con.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--db',type=Path,default=Path('/data/elosys.db'))
    print(ensure(parser.parse_args().db))

if __name__=='__main__':main()
