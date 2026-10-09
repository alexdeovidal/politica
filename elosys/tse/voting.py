"""Ingest TSE candidate vote counts by polling section."""

from __future__ import annotations

import csv
import io
import os
import re
import sqlite3
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from curl_cffi import CurlError, requests

from ..log import get_logger
from ..provenance import download, get_source, record_collection, record_parse
from ..util import clean_tse, normalize_name, now_utc

log = get_logger("elosys.tse.voting")

PARSER_NAME = "tse.voting_sections"
PARSER_VERSION = "1.3"
URL_TEMPLATE = (
    "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/"
    "votacao_secao_{year}_{unit}.zip"
)

SUPPORTED_YEARS = (2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026)
PRESIDENTIAL_YEARS = {2014, 2018, 2022, 2026}
STATES = (
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
)

SOURCE = {
    "name": "TSE - votação por seção eleitoral",
    "agency": "Tribunal Superior Eleitoral",
    "type": "csv",
    "base_url": "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/",
    "legal_basis": "Resultados eleitorais públicos divulgados pelo TSE em dados abertos.",
    "notes": (
        "Votos nominais agregados por seção. Os arquivos de 2014 não identificam o local pelo nome; "
        "o número do local de votação e da seção permanecem disponíveis."
    ),
}

csv.field_size_limit(1 << 24)

_RANGE_SIZE = 16 * 1024 * 1024
_RANGE_WORKERS = 8
_HEADERS = {"Accept": "*/*", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"}


def _download_archive(url: str, dest: Path) -> tuple[int, str | None]:
    """Use parallel byte ranges when supported; fall back to the shared downloader otherwise."""
    try:
        probe = requests.get(
            url,
            headers={**_HEADERS, "Range": "bytes=0-0"},
            stream=True,
            timeout=300,
            impersonate="chrome",
        )
    except Exception:
        return download(url, dest)
    try:
        if probe.status_code == 403:
            raise RuntimeError(f"HTTP 403 for {url} — bloqueado pelo filtro de acesso do TSE")
        content_range = probe.headers.get("Content-Range", "")
        match = re.fullmatch(r"bytes 0-0/(\d+)", content_range)
        if probe.status_code != 206 or match is None:
            return download(url, dest)
        total = int(match.group(1))
        content_type = probe.headers.get("Content-Type")
    finally:
        probe.close()

    if total <= 1:
        return download(url, dest)

    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(f"{dest.name}.part")
    with partial.open("wb") as file:
        file.truncate(total)

    ranges = [
        (start, min(start + _RANGE_SIZE, total) - 1)
        for start in range(0, total, _RANGE_SIZE)
    ]

    def fetch(byte_range: tuple[int, int]) -> None:
        start, end = byte_range
        expected = end - start + 1
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                response = requests.get(
                    url,
                    headers={**_HEADERS, "Range": f"bytes={start}-{end}"},
                    stream=True,
                    timeout=300,
                    impersonate="chrome",
                )
                try:
                    if response.status_code == 403:
                        raise RuntimeError(f"HTTP 403 para o intervalo bytes={start}-{end}")
                    if response.status_code >= 500 or response.status_code == 429:
                        raise CurlError(f"HTTP {response.status_code} para bytes={start}-{end}")
                    expected_header = f"bytes {start}-{end}/{total}"
                    if response.status_code != 206 or response.headers.get("Content-Range") != expected_header:
                        raise CurlError(f"Resposta inesperada para bytes={start}-{end}")
                    chunk = bytearray()
                    for part in response.iter_content(1 << 20):
                        chunk.extend(part)
                    if len(chunk) != expected:
                        raise CurlError(f"Intervalo incompleto: esperados {expected}, recebidos {len(chunk)}")
                finally:
                    response.close()

                with partial.open("r+b") as file:
                    file.seek(start)
                    file.write(chunk)
                return
            except RuntimeError:
                raise
            except Exception as exc:
                last_error = exc
                if attempt < 3:
                    time.sleep(5 * (2 ** attempt))
        raise RuntimeError(f"falha ao baixar bytes={start}-{end}: {last_error}") from last_error

    with ThreadPoolExecutor(max_workers=min(_RANGE_WORKERS, len(ranges))) as pool:
        list(pool.map(fetch, ranges))
    os.replace(partial, dest)
    return 206, content_type

_INSERT = """
INSERT OR IGNORE INTO election_vote_section (
    history_id, tse_candidacy_id, year, round, state, municipality_code, municipality,
    office_code, office, candidate_number, votes, zone_number, section_number,
    polling_place_number, polling_place_name, polling_place_address, provenance_id, collected_at
) VALUES (
    :history_id, :tse_candidacy_id, :year, :round, :state, :municipality_code, :municipality,
    :office_code, :office, :candidate_number, :votes, :zone_number, :section_number,
    :polling_place_number, :polling_place_name, :polling_place_address, :provenance_id, :collected_at
)
"""

_SECTION_CATALOG_INSERT = """
INSERT OR IGNORE INTO election_vote_section_catalog (
    year, round, state, municipality_code, municipality, zone_number, section_number,
    polling_place_number, polling_place_name, polling_place_address
) VALUES (
    :year, :round, :state, :municipality_code, :municipality, :zone_number, :section_number,
    :polling_place_number, :polling_place_name, :polling_place_address
)
"""


def _unique_sections(rows: list[dict]) -> list[dict]:
    unique: dict[tuple, dict] = {}
    for row in rows:
        key = (
            row["year"], row["round"], row["state"], row["municipality_code"],
            row["zone_number"], row["section_number"],
        )
        unique.setdefault(key, row)
    return list(unique.values())


def _g(row: dict[str, str], name: str) -> str | None:
    return clean_tse(row.get(name))


def _integer(value: str | None, default: int | None = None) -> int | None:
    try:
        if value is None:
            return default
        return int(value.replace(".", "").replace(",", "").strip())
    except ValueError:
        return default


def _office(value: str | None) -> str:
    return normalize_name(value or "")


def _candidate_maps(con: sqlite3.Connection, year: int) -> tuple[dict, dict]:
    by_id: dict[tuple[str, int], int] = {}
    by_fallback: dict[tuple, list[int]] = {}
    rows = con.execute(
        "SELECT id, tse_candidacy_id, round, state, office, candidate_number, electoral_unit "
        "FROM politician_history WHERE year = ?",
        (year,),
    )
    for row in rows:
        candidacy_id = row["tse_candidacy_id"]
        round_number = row["round"] or 1
        if candidacy_id:
            by_id[(str(candidacy_id), int(round_number))] = int(row["id"])

        number = row["candidate_number"]
        if not number:
            continue
        office = _office(row["office"])
        if office == "PRESIDENTE":
            key = (office, str(number), int(round_number))
        elif office in {"PREFEITO", "VEREADOR"}:
            key = (
                row["state"], office, str(number), str(row["electoral_unit"] or ""), int(round_number),
            )
        else:
            key = (row["state"], office, str(number), int(round_number))
        by_fallback.setdefault(key, []).append(int(row["id"]))
    return by_id, by_fallback


def _match_history(
    row: dict[str, str],
    year: int,
    by_id: dict[tuple[str, int], int],
    by_fallback: dict[tuple, list[int]],
) -> int | None:
    round_number = _integer(_g(row, "NR_TURNO"), 1) or 1
    candidacy_id = _g(row, "SQ_CANDIDATO")
    if candidacy_id:
        found = by_id.get((candidacy_id, round_number))
        if found is not None:
            return found

    number = _g(row, "NR_VOTAVEL")
    office = _office(_g(row, "DS_CARGO"))
    if not number or not office:
        return None

    if office == "PRESIDENTE":
        key = (office, number, round_number)
    elif office in {"PREFEITO", "VEREADOR"}:
        key = (
            _g(row, "SG_UF"), office, number, _g(row, "CD_MUNICIPIO") or "", round_number,
        )
    else:
        key = (_g(row, "SG_UF"), office, number, round_number)
    matches = by_fallback.get(key, [])
    return matches[0] if len(matches) == 1 else None


def _csv_members(archive: zipfile.ZipFile, unit: str) -> list[str]:
    members = [name for name in archive.namelist() if name.lower().endswith(".csv")]
    suffix = f"_{unit}.csv".upper()
    matching = [name for name in members if name.upper().endswith(suffix)]
    return matching or members


def _ingest_csv(
    con: sqlite3.Connection,
    archive: zipfile.ZipFile,
    filename: str,
    year: int,
    parse_id: int,
    by_id: dict[tuple[str, int], int],
    by_fallback: dict[tuple, list[int]],
) -> tuple[int, int, int, int]:
    staged: list[dict] = []
    imported = 0
    rejected = 0
    ignored_without_candidate_id = 0
    ignored_non_candidate_votes = 0
    collected_at = now_utc()
    with archive.open(filename) as raw:
        reader = csv.DictReader(
            io.TextIOWrapper(raw, encoding="latin-1", newline=""), delimiter=";"
        )
        for source_row in reader:
            row = {key.strip().lstrip("\ufeff"): value for key, value in source_row.items() if key}
            votes = _integer(_g(row, "QT_VOTOS"), 0) or 0
            if votes <= 0:
                continue
            vote_label = normalize_name(_g(row, "NM_VOTAVEL") or "")
            if vote_label.startswith(("VOTO ", "PARTIDO ", "LEGENDA ")):
                # Older archives omit SQ_CANDIDATO and use special numbers that
                # can collide with a candidate number. Keep nominal votes only.
                ignored_non_candidate_votes += 1
                continue
            if not _g(row, "SQ_CANDIDATO") and year not in {2012, 2014}:
                ignored_without_candidate_id += 1
                continue
            history_id = _match_history(row, year, by_id, by_fallback)
            if history_id is None:
                rejected += 1
                continue
            section_number = _g(row, "NR_SECAO")
            zone_number = _g(row, "NR_ZONA")
            municipality_code = _g(row, "CD_MUNICIPIO")
            if not section_number or not zone_number:
                rejected += 1
                continue
            staged.append({
                "history_id": history_id,
                "tse_candidacy_id": _g(row, "SQ_CANDIDATO"),
                "year": _integer(_g(row, "ANO_ELEICAO"), year) or year,
                "round": _integer(_g(row, "NR_TURNO"), 1) or 1,
                "state": _g(row, "SG_UF"),
                "municipality_code": municipality_code,
                "municipality": _g(row, "NM_MUNICIPIO"),
                "office_code": _g(row, "CD_CARGO"),
                "office": _g(row, "DS_CARGO"),
                "candidate_number": _g(row, "NR_VOTAVEL"),
                "votes": votes,
                "zone_number": zone_number,
                "section_number": section_number,
                "polling_place_number": _g(row, "NR_LOCAL_VOTACAO"),
                "polling_place_name": _g(row, "NM_LOCAL_VOTACAO"),
                "polling_place_address": _g(row, "DS_LOCAL_VOTACAO_ENDERECO"),
                "provenance_id": parse_id,
                "collected_at": collected_at,
            })
            if len(staged) >= 5000:
                con.executemany(_INSERT, staged)
                con.executemany(_SECTION_CATALOG_INSERT, _unique_sections(staged))
                imported += len(staged)
                staged.clear()
        if staged:
            con.executemany(_INSERT, staged)
            con.executemany(_SECTION_CATALOG_INSERT, _unique_sections(staged))
            imported += len(staged)
    return imported, rejected, ignored_without_candidate_id, ignored_non_candidate_votes


def _ingest_archive(
    con: sqlite3.Connection,
    year: int,
    unit: str,
    tmp_dir: str | Path,
) -> dict:
    url = URL_TEMPLATE.format(year=year, unit=unit)
    zip_path = Path(tmp_dir) / f"votacao_secao_{year}_{unit}.zip"
    if zip_path.exists():
        status, content_type = None, "application/zip"
        notes = "Arquivo TSE fornecido localmente; URL canônica preservada."
        remove_after = False
    else:
        status, content_type = _download_archive(url, zip_path)
        notes = "Arquivo de votação por seção publicado no CDN oficial do TSE; baixado em intervalos paralelos."
        remove_after = True

    source_id = get_source(con, **SOURCE)
    collection_id, _is_new = record_collection(
        con,
        source_id=source_id,
        url=url,
        file=zip_path,
        http_status=status,
        content_type=content_type,
        notes=notes,
    )
    con.commit()

    previous_parse = con.execute(
        "SELECT id, rows_extracted FROM parse WHERE collection_id = ? AND parser_name = ? "
        "AND parser_version = ? ORDER BY id DESC LIMIT 1",
        (collection_id, PARSER_NAME, PARSER_VERSION),
    ).fetchone()
    if previous_parse:
        if remove_after:
            zip_path.unlink(missing_ok=True)
        return {"unit": unit, "already_collected": True, "rows": previous_parse["rows_extracted"]}

    by_id, by_fallback = _candidate_maps(con, year)
    try:
        with con:
            parse_id = record_parse(
                con,
                collection_id=collection_id,
                parser_name=PARSER_NAME,
                parser_version=PARSER_VERSION,
                rows_extracted=0,
                rows_rejected=0,
            )
            con.execute(
                "DELETE FROM election_vote_section WHERE provenance_id IN "
                "(SELECT pa.id FROM parse pa JOIN collection old ON old.id = pa.collection_id "
                "WHERE old.url = ? AND old.id != ?)",
                (url, collection_id),
            )
            con.execute(
                "DELETE FROM election_vote_section WHERE provenance_id IN "
                "(SELECT id FROM parse WHERE collection_id = ? AND parser_name = ? "
                "AND parser_version != ?)",
                (collection_id, PARSER_NAME, PARSER_VERSION),
            )
            with zipfile.ZipFile(zip_path) as archive:
                members = _csv_members(archive, unit)
                if len(members) != 1:
                    raise ValueError(f"Esperado um CSV de votação em {zip_path.name}; encontrados {len(members)}")
                imported, rejected, ignored_without_candidate_id, ignored_non_candidate_votes = _ingest_csv(
                    con, archive, members[0], year, parse_id, by_id, by_fallback
                )
            con.execute(
                "UPDATE parse SET rows_extracted = ?, rows_rejected = ? WHERE id = ?",
                (imported, rejected + ignored_without_candidate_id + ignored_non_candidate_votes, parse_id),
            )
        return {
            "unit": unit,
            "already_collected": False,
            "rows": imported,
            "unmatched": rejected,
            "ignored_without_candidate_id": ignored_without_candidate_id,
            "ignored_non_candidate_votes": ignored_non_candidate_votes,
        }
    finally:
        if remove_after:
            zip_path.unlink(missing_ok=True)
            zip_path.with_name(f"{zip_path.name}.part").unlink(missing_ok=True)


def run(
    con: sqlite3.Connection,
    *,
    years: list[int] | None = None,
    states: list[str] | None = None,
    tmp_dir: str | Path = "dados_tmp",
) -> dict:
    selected_years = years or list(SUPPORTED_YEARS)
    selected_states = [state.upper() for state in states] if states else list(STATES)
    invalid_years = sorted(set(selected_years) - set(SUPPORTED_YEARS))
    invalid_states = sorted(set(selected_states) - set(STATES))
    if invalid_years:
        raise ValueError(f"anos sem arquivo disponível: {', '.join(map(str, invalid_years))}")
    if invalid_states:
        raise ValueError(f"UF inválida: {', '.join(invalid_states)}")

    report: dict = {"years": {}, "states": selected_states}
    for year in selected_years:
        units = list(selected_states)
        if year in PRESIDENTIAL_YEARS:
            # These presidential archives contain every UF; import them whole even in a scoped run.
            units.append("BR")
        report["years"][year] = []
        log.info("%d: %d arquivo(s) TSE", year, len(units))
        for unit in units:
            try:
                result = _ingest_archive(con, year, unit, tmp_dir)
                report["years"][year].append(result)
                if result["already_collected"]:
                    log.info("  %s: arquivo já integrado (%s linhas)", unit, f"{result['rows']:,}")
                else:
                    log.info(
                        "  %s: %s votos nominais; %s sem vínculo; %s sem candidatura; %s votos não nominais ignorados",
                        unit,
                        f"{result['rows']:,}",
                        f"{result['unmatched']:,}",
                        f"{result['ignored_without_candidate_id']:,}",
                        f"{result['ignored_non_candidate_votes']:,}",
                    )
            except Exception as exc:
                log.error("  %s: %s", unit, exc)
                report["years"][year].append({"unit": unit, "error": str(exc)})
    return report
