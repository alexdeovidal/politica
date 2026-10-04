"""Index public names for fast search and maintain them transactionally."""
from __future__ import annotations
import argparse
import sqlite3
from pathlib import Path
from ..util import now_utc

def ensure(db_path: Path):
    con=sqlite3.connect(str(db_path),timeout=60)
    try:
        version_row = con.execute("SELECT version FROM _politica_search_index WHERE id=1").fetchone() if con.execute("SELECT 1 FROM sqlite_master WHERE name='_politica_search_index'").fetchone() else None
        if version_row and version_row[0] >= 2:
            return {"status":"unchanged"}
        con.execute("BEGIN IMMEDIATE")
        con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS politician_name_search USING fts5(person_id UNINDEXED,ballot_name,tokenize='unicode61 remove_diacritics 2')")
        con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS people_name_search USING fts5(person_id UNINDEXED,canonical_name,tokenize='unicode61 remove_diacritics 2')")
        con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS company_name_search USING fts5(company_id UNINDEXED,company_name,tokenize='unicode61 remove_diacritics 2')")
        con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS company_partner_name_search USING fts5(partner_id UNINDEXED,partner_name,tokenize='unicode61 remove_diacritics 2')")
        con.execute("CREATE TABLE IF NOT EXISTS _politica_search_index(id INTEGER PRIMARY KEY,version INTEGER NOT NULL,built_at TEXT NOT NULL)")
        if not version_row:
            con.execute("DELETE FROM politician_name_search")
            con.execute("INSERT INTO politician_name_search(rowid,person_id,ballot_name) SELECT id,person_id,ballot_name FROM politician_history WHERE ballot_name IS NOT NULL")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_ballot_insert AFTER INSERT ON politician_history WHEN new.ballot_name IS NOT NULL BEGIN INSERT INTO politician_name_search(rowid,person_id,ballot_name) VALUES(new.id,new.person_id,new.ballot_name); END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_ballot_delete AFTER DELETE ON politician_history BEGIN DELETE FROM politician_name_search WHERE rowid=old.id; END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_ballot_update AFTER UPDATE OF ballot_name,person_id ON politician_history WHEN old.ballot_name IS NOT new.ballot_name OR old.person_id IS NOT new.person_id BEGIN DELETE FROM politician_name_search WHERE rowid=old.id; INSERT INTO politician_name_search(rowid,person_id,ballot_name) SELECT new.id,new.person_id,new.ballot_name WHERE new.ballot_name IS NOT NULL; END""")

        con.execute("DELETE FROM people_name_search")
        con.execute("INSERT INTO people_name_search(rowid,person_id,canonical_name) SELECT id,id,canonical_name FROM people WHERE canonical_name IS NOT NULL")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_people_insert AFTER INSERT ON people WHEN new.canonical_name IS NOT NULL BEGIN INSERT INTO people_name_search(rowid,person_id,canonical_name) VALUES(new.id,new.id,new.canonical_name); END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_people_delete AFTER DELETE ON people BEGIN DELETE FROM people_name_search WHERE rowid=old.id; END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_people_update AFTER UPDATE OF canonical_name ON people WHEN old.canonical_name IS NOT new.canonical_name BEGIN DELETE FROM people_name_search WHERE rowid=old.id; INSERT INTO people_name_search(rowid,person_id,canonical_name) SELECT new.id,new.id,new.canonical_name WHERE new.canonical_name IS NOT NULL; END""")

        company_name = "coalesce(cr.trade_name,'') || ' ' || coalesce(cr.legal_name,c.legal_name,'')"
        con.execute("DELETE FROM company_name_search")
        con.execute(f"INSERT INTO company_name_search(rowid,company_id,company_name) SELECT c.id,c.id,{company_name} FROM companies c LEFT JOIN company_registry cr ON cr.company_id=c.id")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_company_insert AFTER INSERT ON companies BEGIN
          INSERT INTO company_name_search(rowid,company_id,company_name) SELECT new.id,new.id,coalesce(cr.trade_name,'') || ' ' || coalesce(cr.legal_name,new.legal_name,'') FROM company_registry cr WHERE cr.company_id=new.id;
          INSERT INTO company_name_search(rowid,company_id,company_name) SELECT new.id,new.id,coalesce(cr.trade_name,'') || ' ' || coalesce(cr.legal_name,new.legal_name,'') FROM (SELECT 1) x LEFT JOIN company_registry cr ON cr.company_id=new.id WHERE cr.company_id IS NULL;
        END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_company_update AFTER UPDATE OF legal_name ON companies BEGIN
          DELETE FROM company_name_search WHERE rowid=old.id;
          INSERT INTO company_name_search(rowid,company_id,company_name) SELECT new.id,new.id,coalesce(cr.trade_name,'') || ' ' || coalesce(cr.legal_name,new.legal_name,'') FROM company_registry cr WHERE cr.company_id=new.id;
          INSERT INTO company_name_search(rowid,company_id,company_name) SELECT new.id,new.id,coalesce(cr.trade_name,'') || ' ' || coalesce(cr.legal_name,new.legal_name,'') FROM (SELECT 1) x LEFT JOIN company_registry cr ON cr.company_id=new.id WHERE cr.company_id IS NULL;
        END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_company_delete AFTER DELETE ON companies BEGIN DELETE FROM company_name_search WHERE rowid=old.id; END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_registry_insert AFTER INSERT ON company_registry BEGIN
          DELETE FROM company_name_search WHERE rowid=new.company_id;
          INSERT INTO company_name_search(rowid,company_id,company_name) SELECT c.id,c.id,coalesce(new.trade_name,'') || ' ' || coalesce(new.legal_name,c.legal_name,'') FROM companies c WHERE c.id=new.company_id;
        END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_registry_update AFTER UPDATE OF company_id,legal_name,trade_name ON company_registry BEGIN
          DELETE FROM company_name_search WHERE rowid=old.company_id;
          DELETE FROM company_name_search WHERE rowid=new.company_id;
          INSERT INTO company_name_search(rowid,company_id,company_name) SELECT c.id,c.id,coalesce(new.trade_name,'') || ' ' || coalesce(new.legal_name,c.legal_name,'') FROM companies c WHERE c.id=new.company_id;
        END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_registry_delete AFTER DELETE ON company_registry BEGIN
          DELETE FROM company_name_search WHERE rowid=old.company_id;
          INSERT INTO company_name_search(rowid,company_id,company_name) SELECT c.id,c.id,coalesce(c.legal_name,'') FROM companies c WHERE c.id=old.company_id;
        END""")

        con.execute("DELETE FROM company_partner_name_search")
        con.execute("INSERT INTO company_partner_name_search(rowid,partner_id,partner_name) SELECT id,id,partner_name FROM company_partner")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_partner_insert AFTER INSERT ON company_partner BEGIN INSERT INTO company_partner_name_search(rowid,partner_id,partner_name) VALUES(new.id,new.id,new.partner_name); END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_partner_delete AFTER DELETE ON company_partner BEGIN DELETE FROM company_partner_name_search WHERE rowid=old.id; END""")
        con.execute("""CREATE TRIGGER IF NOT EXISTS politica_partner_update AFTER UPDATE OF partner_name ON company_partner WHEN old.partner_name IS NOT new.partner_name BEGIN DELETE FROM company_partner_name_search WHERE rowid=old.id; INSERT INTO company_partner_name_search(rowid,partner_id,partner_name) VALUES(new.id,new.id,new.partner_name); END""")

        con.execute("INSERT OR REPLACE INTO _politica_search_index VALUES(1,2,?)",(now_utc(),))
        counts = {
            "ballots": con.execute("SELECT count(*) FROM politician_name_search").fetchone()[0],
            "people": con.execute("SELECT count(*) FROM people_name_search").fetchone()[0],
            "companies": con.execute("SELECT count(*) FROM company_name_search").fetchone()[0],
            "partners": con.execute("SELECT count(*) FROM company_partner_name_search").fetchone()[0],
        }
        con.commit()
        return {"status":"updated","rows":counts["ballots"],"indexed_rows":counts}
    except BaseException:
        con.rollback();raise
    finally:con.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--db',type=Path,default=Path('/data/elosys.db'))
    print(ensure(parser.parse_args().db))

if __name__=='__main__':main()
