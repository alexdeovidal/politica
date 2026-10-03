"""Platform refreshes preserve published data on failures and avoid guessed identity."""
import io
import json
import sqlite3
import zipfile
import pytest
from pypdf import PdfWriter
from elosys.db import create_schema,connect
from elosys.tse import monitor,derived,proposals,processual

def test_ballot_index_tracks_refresh_and_rollback(tmp_path):
    from elosys.tse.search_index import ensure
    primary=tmp_path/'primary.db';create_schema(primary);con=connect(primary,write=True)
    con.execute("INSERT INTO source(name,agency,type,base_url,created_at) VALUES('fixture','TSE','csv','https://tse.example','now')")
    con.execute("INSERT INTO collection(source_id,url,accessed_at,payload_sha256,size_bytes) VALUES(1,'https://tse.example','now','hash',1)")
    con.execute("INSERT INTO parse(collection_id,parser_name,parser_version,run_at) VALUES(1,'fixture','1','now')")
    con.execute("INSERT INTO people(id,canonical_name,created_at) VALUES(1,'PESSOA FICTICIA','now')")
    con.execute("INSERT INTO politician_history(id,person_id,cpf_trusted,ballot_name,year,provenance_id,collected_at) VALUES(1,1,1,'Flávio Exemplo',2022,1,'now')");con.commit()
    assert ensure(primary)['rows']==1
    assert con.execute("SELECT person_id FROM politician_name_search WHERE politician_name_search MATCH '\"FLAVIO\"* \"EXEMPLO\"*'").fetchone()[0]==1
    con.execute("UPDATE politician_history SET ballot_name='Nome Novo' WHERE id=1");con.rollback()
    assert con.execute("SELECT count(*) FROM politician_name_search WHERE politician_name_search MATCH 'FLAVIO'").fetchone()[0]==1
    con.execute("UPDATE politician_history SET ballot_name='Nome Novo' WHERE id=1");con.commit()
    assert con.execute("SELECT count(*) FROM politician_name_search WHERE politician_name_search MATCH 'FLAVIO'").fetchone()[0]==0
    assert con.execute("SELECT person_id FROM politician_name_search WHERE politician_name_search MATCH 'NOVO'").fetchone()[0]==1
    con.execute("UPDATE politician_history SET ballot_name=NULL WHERE id=1");con.commit()
    assert con.execute("SELECT count(*) FROM politician_name_search").fetchone()[0]==0
    con.execute("INSERT INTO politician_history(id,person_id,cpf_trusted,ballot_name,year,provenance_id,collected_at) VALUES(2,1,1,'Nova Candidatura',2026,1,'now')");con.commit()
    assert con.execute("SELECT count(*) FROM politician_name_search").fetchone()[0]==1
    con.execute("DELETE FROM politician_history WHERE id=2");con.commit()
    assert con.execute("SELECT count(*) FROM politician_name_search").fetchone()[0]==0
    assert ensure(primary)['status']=='unchanged';con.close()

def test_monitor_failure_preserves_last_success(tmp_path,monkeypatch):
    path=tmp_path/'test.db';create_schema(path);state=tmp_path/'state.json'
    state.write_text(json.dumps({'sources':{'candidates_2026':{'synced_at':'2026-01-01','signature':{'etag':'old'}}}}))
    monkeypatch.setattr(monitor,'SOURCES',(('candidates_2026','https://tse.example/test.zip',None,'test.zip'),))
    def fail(url):raise RuntimeError('simulated upstream failure')
    monkeypatch.setattr(monitor,'remote_signature',fail)
    rows=monitor.sync_changed(db_path=path,tmp_dir=tmp_path/'tmp',state_path=state,manifest_path=tmp_path/'manifest.json')
    saved=json.loads(state.read_text());assert rows[0]['status']=='failed';assert saved['sources']['candidates_2026']['synced_at']=='2026-01-01';assert saved['sources']['candidates_2026']['signature']=={'etag':'old'}

def test_derived_reset_is_rolled_back_on_error(tmp_path,monkeypatch):
    path=tmp_path/'test.db';create_schema(path);state=tmp_path/'state.json';state.write_text('{"derived_refresh_pending":true}')
    con=connect(path,write=True);con.execute("INSERT INTO people(canonical_name,created_at) VALUES('DADOS ANTERIORES','now')");con.commit();con.close()
    def failing(connection):
        connection.execute('DELETE FROM people');connection.commit();raise RuntimeError('simulated rule failure')
    monkeypatch.setattr(derived.candidate_supplier_partner,'run',failing)
    with pytest.raises(RuntimeError):derived.run(path,state)
    con=connect(path);assert con.execute('SELECT count(*) FROM people').fetchone()[0]==1;con.close()
    assert json.loads(state.read_text())['derived_refresh_pending']

def test_nonfinancial_monitor_progress_does_not_reset_valid_signals(tmp_path,monkeypatch):
    state=tmp_path/'state.json';source={'synced_at':'2026-01-01','signature':{'etag':'same'},'payload_sha256':'same'}
    inputs={'finance_2026':source,'assets_2026':{'synced_at':'old'}}
    state.write_text(json.dumps({'derived_refresh_pending':True,'derived_synced_at':'2026-01-02','derived_input_hashes':inputs,'sources':{'finance_2026':source,'assets_2026':{'synced_at':'new'},'votes_2024_SP':{'status':'pending'},'candidates_2024':{'status':'pending'}}}))
    def forbidden(*args):raise AssertionError('unchanged financial data must not be recomputed')
    monkeypatch.setattr(derived.candidate_supplier_partner,'run',forbidden)
    assert derived.run(tmp_path/'unused.db',state)['status']=='unchanged'
    assert not json.loads(state.read_text())['derived_refresh_pending']

def test_workers_share_one_ingestion_lock(tmp_path,monkeypatch):
    import fcntl,sys
    from elosys.tse import archive_monitor,search_index
    state=tmp_path/'state.json'
    def forbidden(*args,**kwargs):raise AssertionError('must not run during another database writer')
    monkeypatch.setattr(search_index,'ensure',forbidden);monkeypatch.setattr(derived,'run',forbidden)
    with state.with_suffix('.ingest.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        for module in (monitor,archive_monitor,derived):
            argv=['worker','--state',str(state),'--db',str(tmp_path/'unused.db')]
            if module is monitor:argv+=['--lock',str(state.with_suffix('.lock'))]
            monkeypatch.setattr(sys,'argv',argv);assert module.main()==0

def test_archive_uses_only_existing_df_elections():
    from elosys.tse.archive_monitor import sources
    names={row[0] for row in sources()}
    assert 'votes_2022_DF' in names
    assert not names.intersection({'votes_2016_DF','votes_2020_DF','votes_2024_DF'})

def test_process_failed_download_does_not_reset_other_elections(tmp_path,monkeypatch):
    path=tmp_path/'test.db';create_schema(path);con=connect(path,write=True)
    con.execute("INSERT INTO source(name,agency,type,base_url,created_at) VALUES('fixture','TSE','csv','https://tse.example','now')")
    con.execute("INSERT INTO collection(source_id,url,accessed_at,payload_sha256,size_bytes) VALUES(1,'https://tse.example','now','hash',1)")
    con.execute("INSERT INTO parse(collection_id,parser_name,parser_version,run_at) VALUES(1,'fixture','1','now')")
    con.execute("INSERT INTO electoral_case(case_number,source_dataset_year,provenance_id,collected_at) VALUES('FIXTURE-2022',2022,1,'now')");con.commit()
    def fail(*args):raise RuntimeError('upstream unavailable')
    monkeypatch.setattr(processual,'download',fail)
    with pytest.raises(RuntimeError):processual.refresh_year(con,2026,tmp_dir=tmp_path/'tmp')
    assert con.execute('SELECT case_number FROM electoral_case').fetchone()[0]=='FIXTURE-2022';con.close()

class Response:
    def __init__(self,data=b''):self.content=data;self.headers={'ETag':'fixture1'}
    def raise_for_status(self):pass

def test_proposal_only_associates_unique_official_candidate_id(tmp_path,monkeypatch):
    primary=tmp_path/'primary.db';create_schema(primary);con=connect(primary,write=True)
    con.execute("INSERT INTO source(name,agency,type,base_url,created_at) VALUES('fixture','TSE','csv','https://tse.example','now')")
    con.execute("INSERT INTO collection(source_id,url,accessed_at,payload_sha256,size_bytes) VALUES(1,'https://tse.example','now','hash',1)")
    con.execute("INSERT INTO parse(collection_id,parser_name,parser_version,run_at) VALUES(1,'fixture','1','now')")
    con.execute("INSERT INTO people(id,canonical_name,created_at) VALUES(1,'PESSOA FICTICIA','now')")
    con.execute("INSERT INTO politician_history(person_id,cpf_trusted,tse_candidacy_id,year,provenance_id,collected_at) VALUES(1,1,'123',2026,1,'now')");con.commit();con.close()
    pdf=io.BytesIO();writer=PdfWriter();writer.add_blank_page(width=612,height=792);writer.write(pdf);archive=io.BytesIO()
    with zipfile.ZipFile(archive,'w') as z:z.writestr('2026BR123_01.pdf',pdf.getvalue());z.writestr('2026BR999_01.pdf',pdf.getvalue())
    monkeypatch.setattr(proposals.requests,'head',lambda *a,**k:Response())
    monkeypatch.setattr(proposals.requests,'get',lambda *a,**k:Response(archive.getvalue()))
    result=proposals.run(primary,tmp_path/'platform.db',tmp_path/'pdf',[2026],['BR'])
    assert result['updated']==1 and not result['failed'];store=sqlite3.connect(tmp_path/'platform.db');assert store.execute('SELECT entity_key FROM external_record').fetchone()[0]=='1';store.close()
    assert proposals.run(primary,tmp_path/'platform.db',tmp_path/'pdf',[2026],['BR'])['unchanged']==1
    original_reader=proposals.PdfReader
    def partial_reader(content):
        reader=original_reader(content)
        def fail_extract():raise ValueError('invalid font encoding')
        for page in reader.pages:page.extract_text=fail_extract
        return reader
    def changed_head(*args,**kwargs):r=Response();r.headers={'ETag':'fixture2'};return r
    monkeypatch.setattr(proposals,'PdfReader',partial_reader)
    monkeypatch.setattr(proposals.requests,'head',changed_head)
    assert not proposals.run(primary,tmp_path/'platform.db',tmp_path/'pdf',[2026],['BR'])['failed']
    store=sqlite3.connect(tmp_path/'platform.db');payload=json.loads(store.execute('SELECT payload FROM external_record').fetchone()[0]);store.close()
    assert payload['missingTextPages']==[1] and not payload['textComplete']

def test_archive_monitor_does_not_treat_missing_headers_as_unchanged(tmp_path,monkeypatch):
    from elosys.tse import archive_monitor
    path=tmp_path/'db.sqlite';create_schema(path);state=tmp_path/'state.json'
    state.write_text(json.dumps({'sources':{'assets_2022':{'signature':{'https://tse.example/one.zip':{'etag':None}},'synced_at':'old'}}}))
    calls=[]
    def update(*args,**kwargs):calls.append(True);return {'rows':1}
    monkeypatch.setattr(archive_monitor,'sources',lambda:[('assets_2022',2022,['https://tse.example/one.zip'],update,'assets.zip')])
    monkeypatch.setattr(archive_monitor,'remote_signature',lambda url:{'etag':None})
    monkeypatch.setattr(archive_monitor,'write_manifest',lambda *args:None)
    rows=archive_monitor.run(path,state,tmp_path/'tmp',tmp_path/'manifest',1)
    assert calls and rows[0]['status']=='updated'

def test_archive_monitor_keeps_pending_sources_and_advances_cursor(tmp_path,monkeypatch):
    from elosys.tse import archive_monitor
    path=tmp_path/'db.sqlite';create_schema(path);state=tmp_path/'state.json'
    calls=[]
    def update(con,year,**kwargs):calls.append(year);return {'rows':1}
    monkeypatch.setattr(archive_monitor,'sources',lambda:[('assets_2022',2022,['https://tse.example/1'],update,'1.zip'),('assets_2024',2024,['https://tse.example/2'],update,'2.zip')])
    monkeypatch.setattr(archive_monitor,'remote_signature',lambda url:{'etag':url})
    monkeypatch.setattr(archive_monitor,'write_manifest',lambda *args:None)
    archive_monitor.run(path,state,tmp_path/'tmp',tmp_path/'manifest',1)
    saved=json.loads(state.read_text());assert saved['sources']['assets_2024']['status']=='pending' and saved['archive_cursor']==1
    archive_monitor.run(path,state,tmp_path/'tmp',tmp_path/'manifest',1)
    assert calls==[2022,2024]

def test_process_refresh_imports_current_year_without_erasing_older_case(tmp_path,monkeypatch):
    path=tmp_path/'test.db';create_schema(path);con=connect(path,write=True)
    con.execute("INSERT INTO source(name,agency,type,base_url,created_at) VALUES('fixture','TSE','csv','https://tse.example','now')")
    con.execute("INSERT INTO collection(source_id,url,accessed_at,payload_sha256,size_bytes) VALUES(1,'https://tse.example','now','hash',1)")
    con.execute("INSERT INTO parse(collection_id,parser_name,parser_version,run_at) VALUES(1,'fixture','1','now')")
    con.execute("INSERT INTO people(id,canonical_name,created_at) VALUES(1,'PESSOA FICTICIA','now')")
    con.execute("INSERT INTO politician_history(person_id,cpf_trusted,tse_candidacy_id,year,provenance_id,collected_at) VALUES(1,1,'123',2026,1,'now')")
    con.execute("INSERT INTO electoral_case(case_number,source_dataset_year,provenance_id,collected_at) VALUES('FIXTURE-2022',2022,1,'now')");con.commit()
    def download(url,target):
        header='NR_PROCESSO;ST_CANDIDATO;SQ_CANDIDATO;DS_POLO;NM_PARTE;DS_CLASSE;DS_ASSUNTO;SQ_DECISAO;DS_TIPO_DECISAO\n'
        row='FIXTURE-2026;S;123;ATIVO;PESSOA FICTICIA;Prestacao;Assunto;1;Decisao\n'
        with zipfile.ZipFile(target,'w') as z:z.writestr('fixture.csv',(header+row).encode('latin-1'))
        return 200,'application/zip'
    monkeypatch.setattr(processual,'download',download)
    result=processual.refresh_year(con,2026,tmp_dir=tmp_path/'tmp')
    assert result['rows']==1 and {r[0] for r in con.execute('SELECT case_number FROM electoral_case')}=={'FIXTURE-2022','FIXTURE-2026'}
    assert con.execute('SELECT count(*) FROM electoral_case_candidate').fetchone()[0]==1
    def fail(*args):raise RuntimeError('failure during decision import')
    monkeypatch.setattr(processual,'_import_decision',fail)
    with pytest.raises(RuntimeError):processual.refresh_year(con,2026,tmp_dir=tmp_path/'tmp')
    assert con.execute('SELECT count(*) FROM electoral_case_candidate').fetchone()[0]==1
    assert con.execute('SELECT count(*) FROM electoral_case_decision').fetchone()[0]==1
    con.close()

def test_proposal_archive_failure_preserves_previous_published_records(tmp_path,monkeypatch):
    primary=tmp_path/'primary.db';create_schema(primary);store_path=tmp_path/'platform.db'
    con=connect(primary,write=True)
    con.execute("INSERT INTO source(name,agency,type,base_url,created_at) VALUES('fixture','TSE','csv','https://tse.example','now')")
    con.execute("INSERT INTO collection(source_id,url,accessed_at,payload_sha256,size_bytes) VALUES(1,'https://tse.example','now','hash',1)")
    con.execute("INSERT INTO parse(collection_id,parser_name,parser_version,run_at) VALUES(1,'fixture','1','now')")
    con.execute("INSERT INTO people(id,canonical_name,created_at) VALUES(1,'PESSOA FICTICIA','now')")
    con.execute("INSERT INTO politician_history(person_id,cpf_trusted,tse_candidacy_id,year,provenance_id,collected_at) VALUES(1,1,'123',2022,1,'now')");con.commit();con.close()
    pdf=io.BytesIO();writer=PdfWriter();writer.add_blank_page(width=612,height=792);writer.write(pdf)
    archive=io.BytesIO()
    with zipfile.ZipFile(archive,'w') as z:z.writestr('BR/2022BR123.pdf',pdf.getvalue())
    monkeypatch.setattr(proposals.requests,'head',lambda *a,**k:Response())
    monkeypatch.setattr(proposals.requests,'get',lambda *a,**k:Response(archive.getvalue()))
    assert proposals.run(primary,store_path,tmp_path/'pdf',[2022],['BR'])['updated']==1
    broken=io.BytesIO()
    with zipfile.ZipFile(broken,'w') as z:z.writestr('BR/2022BR123_02.pdf',pdf.getvalue());z.writestr('BR/2022BR123_03.pdf',b'not a PDF')
    def changed(*args,**kwargs):r=Response();r.headers={'ETag':'fixture2'};return r
    monkeypatch.setattr(proposals.requests,'head',changed)
    monkeypatch.setattr(proposals.requests,'get',lambda *a,**k:Response(broken.getvalue()))
    report=proposals.run(primary,store_path,tmp_path/'pdf',[2022],['BR'])
    assert report['failed'] and report['updated']==0
    con=sqlite3.connect(store_path);assert con.execute('SELECT id FROM external_record').fetchall()==[('proposal:2022:123:1',)];con.close()
