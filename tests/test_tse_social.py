"""TSE declared social URLs: incremental refresh retains unrelated election years."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from elosys.db import connect, create_schema
from elosys.tse import social

_TIMESTAMP = "2026-01-01T00:00:00Z"
_HEADER = "ANO_ELEICAO;SG_UF;SQ_CANDIDATO;NR_ORDEM_REDE_SOCIAL;DS_URL"


def _archive(rows: list[str]) -> bytes:
    csv_text = (_HEADER + "\n" + "\n".join(rows) + "\n").encode("latin-1")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("rede_social_candidato_2022_BRASIL.csv", csv_text)
    return buffer.getvalue()


def test_refresh_updates_current_year_and_preserves_other_years(tmp_path, monkeypatch):
    path = tmp_path / "social.db"
    create_schema(path)
    original = _archive(["2022;SP;SQ1;1;https://x.com/exemplo"])

    def fake_download(url, dest):
        Path(dest).write_bytes(original)
        return 200, "application/zip"

    monkeypatch.setattr(social, "download", fake_download)
    con = connect(path, write=True)
    con.execute(
        "INSERT INTO people (cpf_trusted, canonical_name, created_at) VALUES (0, 'PESSOA', ?)",
        (_TIMESTAMP,),
    )
    person_id = con.execute("SELECT id FROM people").fetchone()["id"]
    con.execute(
        "INSERT INTO source (name, agency, type, base_url, created_at) VALUES ('seed', 'x', 'x', 'x', ?)",
        (_TIMESTAMP,),
    )
    con.execute(
        "INSERT INTO collection (source_id, url, accessed_at, payload_sha256, size_bytes) VALUES (1, 'seed', ?, 'seed', 0)",
        (_TIMESTAMP,),
    )
    con.execute(
        "INSERT INTO parse (collection_id, parser_name, parser_version, run_at) VALUES (1, 'seed', '1', ?)",
        (_TIMESTAMP,),
    )
    con.execute(
        "INSERT INTO politician_history (person_id, cpf_trusted, tse_candidacy_id, year, provenance_id, collected_at) "
        "VALUES (?, 0, 'SQ1', 2022, 1, ?)", (person_id, _TIMESTAMP),
    )
    con.commit()
    social.run(con, years=[2022], tmp_dir=tmp_path)
    old = con.execute("SELECT id FROM social_media WHERE year = 2022 AND url = 'https://x.com/exemplo'").fetchone()
    con.execute(
        "INSERT INTO social_media (person_id, tse_candidacy_id, year, platform, url, provenance_id, collected_at) "
        "VALUES (?, 'SQ2', 2024, 'website', 'https://site-antigo.example', 1, ?)", (person_id, _TIMESTAMP),
    )
    con.commit()
    con.close()

    changed = _archive([
        "2022;SP;SQ1;2;https://x.com/exemplo",
        "2022;SP;SQ1;3;https://instagram.com/exemplo",
    ])

    def changed_download(url, dest):
        Path(dest).write_bytes(changed)
        return 200, "application/zip"

    monkeypatch.setattr(social, "download", changed_download)
    con = connect(path, write=True)
    report = social.refresh_year(con, 2022, tmp_dir=tmp_path)

    current = con.execute(
        "SELECT id, order_in_source FROM social_media WHERE year = 2022 AND url = 'https://x.com/exemplo'"
    ).fetchone()
    assert current["id"] == old["id"] and current["order_in_source"] == 2
    assert con.execute("SELECT count(*) FROM social_media WHERE year = 2022").fetchone()[0] == 2
    assert con.execute("SELECT url FROM social_media WHERE year = 2024").fetchone()[0] == "https://site-antigo.example"
    assert report["kept_other_years"] is True
    con.close()
