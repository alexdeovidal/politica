"""Ingest public TSE electoral proceedings and link candidates by SQ_CANDIDATO."""

from __future__ import annotations

import csv
import hashlib
import sqlite3
import zipfile
from pathlib import Path
from typing import Callable

from ..log import RowCounter, get_logger, step
from ..provenance import (
    download,
    get_source,
    record_collection,
    record_file,
    record_parse,
    reset_source,
)
from ..util import clean_tse, iso_date, now_utc

log = get_logger("elosys.tse.processual")

PARSER_VERSION = "1.0"
BASE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/processual/"
SUPPORTED_YEARS = (2018, 2020, 2022, 2024, 2026)

SOURCE = {
    "name": "TSE - processos eleitorais públicos",
    "agency": "Tribunal Superior Eleitoral",
    "type": "csv",
    "base_url": BASE_URL,
    "legal_basis": (
        "Conjuntos Processual publicados no Portal de Dados Abertos do TSE, sob licença "
        "Creative Commons Atribuição."
    ),
    "notes": (
        "A associação de pessoas usa exclusivamente o SQ_CANDIDATO informado pelo TSE; "
        "não há vinculação por semelhança de nome. A fonte cobre processos eleitorais públicos."
    ),
}

_RESOURCES = {
    "partes": "processos_eleitorais_partes_{year}.zip",
    "processos": "processo_eleitoral_{year}.zip",
    "assuntos": "processos_eleitorais_assuntos_{year}.zip",
    "decisoes": "processos_eleitorais_decisoes_{year}.zip",
    "recursos": "recursos_eleitorais_{year}.zip",
}

_OWNED_TABLES = [
    "electoral_case_candidate",
    "electoral_case_subject",
    "electoral_case_decision",
    "electoral_case_appeal",
    "electoral_case",
]

_STAGING_DDL = """
CREATE TEMP TABLE IF NOT EXISTS stg_electoral_case_candidate (
    row_key TEXT PRIMARY KEY,
    case_number TEXT NOT NULL,
    person_id INTEGER NOT NULL,
    tse_candidacy_id TEXT NOT NULL,
    candidacy_year INTEGER NOT NULL,
    pole TEXT,
    party_type TEXT,
    party_name TEXT,
    social_name TEXT,
    is_main_party INTEGER,
    provenance_id INTEGER NOT NULL,
    collected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS temp.ix_stg_electoral_case_number
    ON stg_electoral_case_candidate (case_number);
"""


def _g(row: dict[str, str], name: str) -> str | None:
    return clean_tse(row.get(name))


def _int(value: str | None) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _key(*values: str | int | None) -> str:
    raw = "\x1f".join("" if value is None else str(value) for value in values)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _csv_member(archive: zipfile.ZipFile) -> str:
    members = sorted(name for name in archive.namelist() if name.lower().endswith(".csv"))
    if len(members) != 1:
        raise ValueError(f"Esperado um CSV no arquivo TSE; encontrados {len(members)}: {members[:4]}")
    return members[0]


def _read_csv(
    archive: zipfile.ZipFile,
    member: str,
    consume: Callable[[dict[str, str]], None],
) -> tuple[int, str, int]:
    digest = hashlib.sha256()
    byte_count = 0

    with archive.open(member) as raw:
        def lines():
            nonlocal byte_count
            for line in raw:
                digest.update(line)
                byte_count += len(line)
                yield line.decode("latin-1")

        reader = csv.DictReader(lines(), delimiter=";")
        count = 0
        for row in reader:
            consume(row)
            count += 1

    return count, digest.hexdigest(), byte_count


def _prepare_archive(
    con: sqlite3.Connection,
    *,
    year: int,
    resource: str,
    tmp_dir: Path,
    source_id: int,
) -> tuple[Path, int, bool]:
    filename = _RESOURCES[resource].format(year=year)
    url = BASE_URL + filename
    zip_path = tmp_dir / filename
    if zip_path.exists():
        status, content_type, remove_after = None, "application/zip", False
        notes = "Arquivo TSE fornecido localmente; URL canônica preservada."
    else:
        status, content_type = download(url, zip_path)
        remove_after = True
        notes = "Arquivo público do conjunto Processual do TSE; pode ser republicado na mesma URL."

    collection_id, _ = record_collection(
        con,
        source_id=source_id,
        url=url,
        file=zip_path,
        http_status=status,
        content_type=content_type,
        notes=notes,
    )
    con.commit()
    return zip_path, collection_id, remove_after


def _run_file(
    con: sqlite3.Connection,
    *,
    year: int,
    resource: str,
    tmp_dir: Path,
    source_id: int,
    consume: Callable[[dict[str, str], int], None],
) -> int:
    filename = _RESOURCES[resource].format(year=year)
    zip_path, collection_id, remove_after = _prepare_archive(
        con, year=year, resource=resource, tmp_dir=tmp_dir, source_id=source_id
    )
    parser_name = f"tse.processual.{resource}"
    try:
        with zipfile.ZipFile(zip_path) as archive:
            member = _csv_member(archive)
            with con:
                parse_id = record_parse(
                    con,
                    collection_id=collection_id,
                    collection_file_id=None,
                    parser_name=parser_name,
                    parser_version=PARSER_VERSION,
                    rows_extracted=0,
                    rows_rejected=0,
                )
                count, file_sha, file_size = _read_csv(
                    archive, member, lambda row: consume(row, parse_id)
                )
                collection_file_id = record_file(
                    con,
                    collection_id=collection_id,
                    filename=member,
                    sha256=file_sha,
                    size=file_size,
                )
                con.execute(
                    "UPDATE parse SET collection_file_id = ?, rows_extracted = ? WHERE id = ?",
                    (collection_file_id, count, parse_id),
                )
        return count
    finally:
        if remove_after:
            zip_path.unlink(missing_ok=True)


def _candidate_map(con: sqlite3.Connection, year: int) -> dict[str, int]:
    rows = con.execute(
        "SELECT tse_candidacy_id, MIN(person_id) AS person_id "
        "FROM politician_history WHERE year = ? AND tse_candidacy_id IS NOT NULL "
        "GROUP BY tse_candidacy_id HAVING COUNT(DISTINCT person_id) = 1",
        (year,),
    )
    return {str(row["tse_candidacy_id"]): int(row["person_id"]) for row in rows}


def _stage_parties(
    con: sqlite3.Connection,
    row: dict[str, str],
    parse_id: int,
    year: int,
    candidate_people: dict[str, int],
) -> None:
    if (_g(row, "ST_CANDIDATO") or "").upper() != "S":
        return
    candidacy_id = _g(row, "SQ_CANDIDATO")
    case_number = _g(row, "NR_PROCESSO")
    if not candidacy_id or candidacy_id not in candidate_people or not case_number:
        return

    pole = _g(row, "DS_POLO")
    party_type = _g(row, "TP_PARTE")
    party_name = _g(row, "NM_PARTE")
    social_name = _g(row, "NM_SOCIAL_PARTE")
    main_party = _g(row, "ST_PARTE_PRINCIPAL")
    row_key = _key(case_number, candidacy_id, year, pole, party_type, party_name)
    con.execute(
        "INSERT OR IGNORE INTO stg_electoral_case_candidate "
        "(row_key, case_number, person_id, tse_candidacy_id, candidacy_year, pole, party_type, "
        "party_name, social_name, is_main_party, provenance_id, collected_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            row_key,
            case_number,
            candidate_people[candidacy_id],
            candidacy_id,
            year,
            pole,
            party_type,
            party_name,
            social_name,
            1 if main_party == "S" else (0 if main_party == "N" else None),
            parse_id,
            now_utc(),
        ),
    )


def _import_cases(
    con: sqlite3.Connection,
    row: dict[str, str],
    parse_id: int,
    year: int,
    case_numbers: set[str],
) -> None:
    case_number = _g(row, "NR_PROCESSO")
    if not case_number or case_number not in case_numbers:
        return
    values = {
        "case_number": case_number,
        "source_dataset_year": year,
        "filed_at": iso_date(_g(row, "DT_AUTUACAO")),
        "closed_at": iso_date(_g(row, "DT_BAIXA")),
        "origin_state": _g(row, "SG_UF_TRIBUNAL_ORIGEM"),
        "origin_instance": _int(_g(row, "NR_INSTANCIA_ORIGEM")),
        "court_state": _g(row, "SG_UF_TRIBUNAL"),
        "instance": _int(_g(row, "NR_INSTANCIA")),
        "distributed_at": iso_date(_g(row, "DT_DISTRIBUICAO")),
        "distribution_type": _g(row, "DS_TIPO_DISTRIBUICAO"),
        "reporter_name": _g(row, "NM_RELATOR"),
        "class_code": _g(row, "CD_CLASSE"),
        "class_abbr": _g(row, "SG_CLASSE"),
        "class_name": _g(row, "DS_CLASSE"),
        "main_subject_code": _g(row, "CD_ASSUNTO_PRINCIPAL"),
        "main_subject": _g(row, "DS_ASSUNTO_PRINCIPAL"),
        "is_appeal": _int(_g(row, "ST_RECURSAL")),
        "decision_count": _int(_g(row, "QT_DECISOES")),
        "last_decision_at": iso_date(_g(row, "DT_ULTIMA_DECISAO")),
        "last_decision_type": _g(row, "TP_ULTIMA_DECISAO"),
        "source_url": _g(row, "DS_URL_PROCESSO"),
        "provenance_id": parse_id,
        "collected_at": now_utc(),
    }
    con.execute(
        "INSERT INTO electoral_case (case_number, source_dataset_year, filed_at, closed_at, "
        "origin_state, origin_instance, court_state, instance, distributed_at, distribution_type, "
        "reporter_name, class_code, class_abbr, class_name, main_subject_code, main_subject, "
        "is_appeal, decision_count, last_decision_at, last_decision_type, source_url, provenance_id, collected_at) "
        "VALUES (:case_number, :source_dataset_year, :filed_at, :closed_at, :origin_state, :origin_instance, "
        ":court_state, :instance, :distributed_at, :distribution_type, :reporter_name, :class_code, "
        ":class_abbr, :class_name, :main_subject_code, :main_subject, :is_appeal, :decision_count, "
        ":last_decision_at, :last_decision_type, :source_url, :provenance_id, :collected_at) "
        "ON CONFLICT(case_number) DO UPDATE SET "
        "source_dataset_year=excluded.source_dataset_year, filed_at=excluded.filed_at, "
        "closed_at=excluded.closed_at, origin_state=excluded.origin_state, "
        "origin_instance=excluded.origin_instance, court_state=excluded.court_state, "
        "instance=excluded.instance, distributed_at=excluded.distributed_at, "
        "distribution_type=excluded.distribution_type, reporter_name=excluded.reporter_name, "
        "class_code=excluded.class_code, class_abbr=excluded.class_abbr, class_name=excluded.class_name, "
        "main_subject_code=excluded.main_subject_code, main_subject=excluded.main_subject, "
        "is_appeal=excluded.is_appeal, decision_count=excluded.decision_count, "
        "last_decision_at=excluded.last_decision_at, last_decision_type=excluded.last_decision_type, "
        "source_url=excluded.source_url, provenance_id=excluded.provenance_id, "
        "collected_at=excluded.collected_at "
        "WHERE excluded.source_dataset_year >= electoral_case.source_dataset_year",
        values,
    )


def _import_subject(
    con: sqlite3.Connection,
    row: dict[str, str],
    parse_id: int,
    cases: dict[str, int],
) -> None:
    case_number = _g(row, "NR_PROCESSO")
    subject = _g(row, "DS_ASSUNTO")
    if not case_number or case_number not in cases or not subject:
        return
    con.execute(
        "INSERT OR IGNORE INTO electoral_case_subject "
        "(case_id, subject_code, subject, provenance_id, collected_at) VALUES (?, ?, ?, ?, ?)",
        (cases[case_number], _g(row, "CD_ASSUNTO"), subject, parse_id, now_utc()),
    )


def _import_decision(
    con: sqlite3.Connection,
    row: dict[str, str],
    parse_id: int,
    cases: dict[str, int],
) -> None:
    case_number = _g(row, "NR_PROCESSO")
    if not case_number or case_number not in cases:
        return
    con.execute(
        "INSERT OR IGNORE INTO electoral_case_decision "
        "(case_id, decision_sequence, decided_at, author_name, decision_type, provenance_id, collected_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            cases[case_number],
            _g(row, "SQ_DECISAO"),
            iso_date(_g(row, "DT_DECISAO")),
            _g(row, "NM_AUTOR_DECISAO"),
            _g(row, "DS_TIPO_DECISAO"),
            parse_id,
            now_utc(),
        ),
    )


def _import_appeal(
    con: sqlite3.Connection,
    row: dict[str, str],
    parse_id: int,
    cases: dict[str, int],
) -> None:
    origin_number = _g(row, "NR_PROCESSO_ORIGEM")
    appeal_id = _g(row, "SQ_RECURSO")
    if not origin_number or origin_number not in cases or not appeal_id:
        return
    con.execute(
        "INSERT OR IGNORE INTO electoral_case_appeal "
        "(case_id, appeal_id, filed_at, closed_at, court_state, instance, class_name, appeal_type, "
        "appeal_nature, last_decision_at, last_decision_type, reporter_name, provenance_id, collected_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            cases[origin_number],
            appeal_id,
            iso_date(_g(row, "DT_AUTUACAO")),
            iso_date(_g(row, "DT_BAIXA")),
            _g(row, "SG_UF_TRIBUNAL"),
            _int(_g(row, "NR_INSTANCIA")),
            _g(row, "DS_CLASSE"),
            _g(row, "DS_TIPO_RECURSO"),
            _g(row, "DS_NATUREZA_RECURSO"),
            iso_date(_g(row, "DT_ULTIMA_DECISAO")),
            _g(row, "DS_ULTIMA_DECISAO"),
            _g(row, "NM_RELATOR"),
            parse_id,
            now_utc(),
        ),
    )


def _cases_for_year(con: sqlite3.Connection, year: int) -> dict[str, int]:
    return {
        str(row["case_number"]): int(row["id"])
        for row in con.execute(
            "SELECT ec.id, ec.case_number FROM electoral_case ec WHERE ec.case_number IN "
            "(SELECT case_number FROM stg_electoral_case_candidate)",
        )
    }


def _attach_candidates(con: sqlite3.Connection) -> int:
    before = con.total_changes
    con.execute(
        "INSERT OR IGNORE INTO electoral_case_candidate "
        "(case_id, person_id, tse_candidacy_id, candidacy_year, pole, party_type, party_name, "
        "social_name, is_main_party, provenance_id, collected_at) "
        "SELECT ec.id, st.person_id, st.tse_candidacy_id, st.candidacy_year, st.pole, "
        "st.party_type, st.party_name, st.social_name, st.is_main_party, st.provenance_id, st.collected_at "
        "FROM stg_electoral_case_candidate st JOIN electoral_case ec ON ec.case_number = st.case_number"
    )
    return con.total_changes - before


def _ingest_year(
    con: sqlite3.Connection,
    year: int,
    tmp_dir: Path,
    source_id: int,
) -> dict:
    con.execute("DELETE FROM stg_electoral_case_candidate")
    candidate_people = _candidate_map(con, year)
    if not candidate_people:
        log.warning("  %d: nenhuma candidatura local; rode `elosys tse-candidates` antes", year)
        return {"candidate_links": 0, "cases": 0, "skipped": "no candidate map"}

    with step(log, f"partes processuais {year}"):
        rows = _run_file(
            con,
            year=year,
            resource="partes",
            tmp_dir=tmp_dir,
            source_id=source_id,
            consume=lambda row, parse_id: _stage_parties(con, row, parse_id, year, candidate_people),
        )
    staged = con.execute("SELECT COUNT(*) FROM stg_electoral_case_candidate").fetchone()[0]
    case_numbers = {str(row[0]) for row in con.execute(
        "SELECT DISTINCT case_number FROM stg_electoral_case_candidate"
    )}
    log.info("  partes: %s linhas; %s vínculos de candidatura exatos em %s processos",
             f"{rows:,}", f"{staged:,}", f"{len(case_numbers):,}")

    case_counter = RowCounter(log, f"processos {year}")
    with step(log, f"processos eleitorais {year}"):
        process_rows = _run_file(
            con,
            year=year,
            resource="processos",
            tmp_dir=tmp_dir,
            source_id=source_id,
            consume=lambda row, parse_id: (
                _import_cases(con, row, parse_id, year, case_numbers), case_counter.tick()
            ),
        )
    case_counter.done()
    cases = _cases_for_year(con, year)
    linked = _attach_candidates(con)

    detail_counts: dict[str, int] = {}
    for resource, consumer in (
        ("assuntos", lambda row, parse_id: _import_subject(con, row, parse_id, cases)),
        ("decisoes", lambda row, parse_id: _import_decision(con, row, parse_id, cases)),
        ("recursos", lambda row, parse_id: _import_appeal(con, row, parse_id, cases)),
    ):
        with step(log, f"{resource} processuais {year}"):
            detail_counts[resource] = _run_file(
                con,
                year=year,
                resource=resource,
                tmp_dir=tmp_dir,
                source_id=source_id,
                consume=consumer,
            )

    rejected = con.execute(
        "SELECT COUNT(*) FROM stg_electoral_case_candidate st "
        "LEFT JOIN electoral_case ec ON ec.case_number = st.case_number "
        "WHERE ec.id IS NULL"
    ).fetchone()[0]
    return {
        "parties_rows": rows,
        "staged_candidate_parties": staged,
        "cases_for_candidates": len(cases),
        "candidate_links_inserted": linked,
        "candidate_rows_without_case_record": rejected,
        "detail_file_rows": detail_counts,
    }


def run(
    con: sqlite3.Connection,
    *,
    years: list[int] | None = None,
    tmp_dir: str | Path = "dados_tmp",
) -> dict:
    selected_years = sorted(set(years or SUPPORTED_YEARS))
    invalid = sorted(set(selected_years) - set(SUPPORTED_YEARS))
    if invalid:
        raise ValueError(f"sem conjunto processual TSE para: {', '.join(map(str, invalid))}")

    log.info("rewrite-only: processos eleitorais conterão exatamente estes pleitos: %s",
             ", ".join(map(str, selected_years)))
    with step(log, "resetar dados processuais eleitorais TSE"):
        reset_source(con, SOURCE["name"], _OWNED_TABLES)
        con.executescript(_STAGING_DDL)
        con.commit()

    source_id = get_source(con, **SOURCE)
    report: dict = {"years": {}}
    temp = Path(tmp_dir)
    temp.mkdir(parents=True, exist_ok=True)
    for year in selected_years:
        with step(log, f"conjunto processual TSE {year}"):
            report["years"][year] = _ingest_year(con, year, temp, source_id)

    for table in _OWNED_TABLES:
        report[table] = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    report["linked_people"] = con.execute(
        "SELECT COUNT(DISTINCT person_id) FROM electoral_case_candidate"
    ).fetchone()[0]
    log.info("done: %s processos, %s vínculos e %s pessoas com processo eleitoral",
             f"{report['electoral_case']:,}", f"{report['electoral_case_candidate']:,}",
             f"{report['linked_people']:,}")
    return report


def refresh_year(con:sqlite3.Connection,year:int,*,tmp_dir:str|Path="dados_tmp")->dict:
    """Replace only this election's process provenance in one atomic transaction."""
    from .derived import AtomicConnection
    if year not in SUPPORTED_YEARS:raise ValueError("Pleito processual não suportado")
    temp=Path(tmp_dir);temp.mkdir(parents=True,exist_ok=True)
    urls=[]
    # Complete every inbound download before changing the published records.
    for template in _RESOURCES.values():
        filename=template.format(year=year);url=BASE_URL+filename;urls.append(url)
        file=temp/filename
        file.unlink(missing_ok=True)
        download(url,file)
        with zipfile.ZipFile(file) as archive:_csv_member(archive)
    source_id=get_source(con,**SOURCE);con.executescript(_STAGING_DDL);con.commit()
    try:
        con.execute("BEGIN IMMEDIATE")
        placeholders=",".join("?" for _ in urls)
        for table in _OWNED_TABLES[:-1]:
            con.execute(f"DELETE FROM {table} WHERE provenance_id IN (SELECT p.id FROM parse p JOIN collection c ON c.id=p.collection_id WHERE c.url IN ({placeholders}))",urls)
        result=_ingest_year(AtomicConnection(con),year,temp,source_id)
        if not result.get("parties_rows") or not result.get("cases_for_candidates"):raise ValueError("Atualização processual sem registros verificáveis")
        con.execute("DELETE FROM electoral_case WHERE source_dataset_year=? AND NOT EXISTS(SELECT 1 FROM electoral_case_candidate cc WHERE cc.case_id=electoral_case.id)",(year,))
        con.commit()
        result["rows"]=result["cases_for_candidates"]
        result["collection_id"]=con.execute("SELECT id FROM collection WHERE url=? ORDER BY id DESC LIMIT 1",(BASE_URL+_RESOURCES["processos"].format(year=year),)).fetchone()[0]
        return result
    except BaseException:
        con.rollback();raise
    finally:
        for template in _RESOURCES.values():(temp/template.format(year=year)).unlink(missing_ok=True)
