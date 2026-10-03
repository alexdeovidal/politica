"""Read-only reconciliation of published TSE records and provenance."""
from __future__ import annotations
import argparse
import json
from contextlib import closing
from pathlib import Path
from ..db import connect
from ..util import now_utc

def run(db_path:Path):
    with closing(connect(db_path)) as con:
        con.execute('PRAGMA busy_timeout=60000')
        sources=[dict(row) for row in con.execute('SELECT s.name,s.agency,max(c.accessed_at) AS last_collected_at,count(c.id) AS collections FROM source s LEFT JOIN collection c ON c.source_id=s.id GROUP BY s.id ORDER BY s.name')]
        years=[dict(row) for row in con.execute('SELECT year,count(*) AS candidacies,count(DISTINCT person_id) AS people FROM politician_history GROUP BY year ORDER BY year')]
        missing=[dict(row) for row in con.execute('SELECT year,count(*) AS missing_values FROM declared_assets WHERE value_cents IS NULL GROUP BY year')]
        cpf_duplicates=[dict(row) for row in con.execute('SELECT cpf,count(*) AS records FROM people WHERE cpf IS NOT NULL GROUP BY cpf HAVING count(*)>1 LIMIT 20')]
        provenance_mismatch=con.execute('SELECT count(*) FROM parse p JOIN collection_file f ON f.id=p.collection_file_id WHERE p.collection_id<>f.collection_id').fetchone()[0]
        account_mismatch=con.execute('SELECT count(*) FROM campaign_org co JOIN companies c ON c.id=co.company_id WHERE co.cnpj IS NOT NULL AND co.cnpj<>c.cnpj').fetchone()[0]
        financial=[dict(row) for row in con.execute('SELECT year,count(*) AS records,sum(amount_cents) AS contracted_cents FROM campaign_expense GROUP BY year ORDER BY year')]
        paid=[dict(row) for row in con.execute('SELECT year,count(*) AS installments,sum(amount_cents) AS reported_paid_cents FROM campaign_expense_payment GROUP BY year ORDER BY year')]
        votes=[dict(row) for row in con.execute('SELECT year,round,count(*) AS sections,sum(votes) AS votes FROM election_vote_section GROUP BY year,round ORDER BY year,round')]
        invalid_votes=con.execute('SELECT count(*) FROM election_vote_section WHERE votes<0').fetchone()[0]
        cases=[dict(row) for row in con.execute('SELECT source_dataset_year,count(*) AS cases FROM electoral_case GROUP BY source_dataset_year ORDER BY source_dataset_year')]
    return {'checked_at':now_utc(),'mode':'read_only','sources':sources,'candidacies':years,'assets_missing':missing,'contracted':financial,'paid_installments':paid,'votes':votes,'cases':cases,'flags':{'duplicate_public_cpfs':cpf_duplicates,'parse_file_collection_mismatches':provenance_mismatch,'campaign_cnpj_mismatches':account_mismatch,'negative_vote_records':invalid_votes},'limitations':'Reconciliation of collected records and source metadata; does not certify every original TSE row or unpublished record. Null asset values are not zero; contracted and paid amounts are separate.'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--db',type=Path,default=Path('/data/elosys.db'));p.add_argument('--output',type=Path);a=p.parse_args();result=run(a.db);content=json.dumps(result,ensure_ascii=False,indent=2)
    if a.output:a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(content+'\n')
    print(content);return 0
if __name__=='__main__':raise SystemExit(main())
