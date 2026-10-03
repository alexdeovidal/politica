"""TSE monitor tracks only changed source archives and records successful sync state."""

from __future__ import annotations

from elosys.db import create_schema
from elosys.tse import monitor


def test_monitor_skips_unchanged_sources_and_persists_updated_signature(tmp_path, monkeypatch):
    db_path = tmp_path / "monitor.db"
    state_path = tmp_path / "monitor.json"
    manifest_path = tmp_path / "manifest.json"
    create_schema(db_path)
    current_signature = {"last_modified": "Sat, 03 Oct 2026 15:36:21 GMT", "etag": '"abc"', "content_length": "123"}
    calls: list[int] = []

    def fake_updater(con, year, *, tmp_dir):
        calls.append(year)
        cursor = con.execute(
            "INSERT INTO source (name, agency, type, base_url, created_at) "
            "VALUES ('TSE test', 'Tribunal Superior Eleitoral', 'csv', 'https://tse.example', 'now')"
        ) if not calls[:-1] else None
        source_id = cursor.lastrowid if cursor else con.execute(
            "SELECT id FROM source WHERE name = 'TSE test'"
        ).fetchone()[0]
        collection = con.execute(
            "INSERT INTO collection (source_id, url, accessed_at, payload_sha256, size_bytes) "
            "VALUES (?, 'https://tse.example/archive.zip', 'now', ?, 123)",
            (source_id, f"hash-{len(calls)}"),
        )
        con.commit()
        return {"collection_id": collection.lastrowid, "rows": 1, "source_rows": 1}

    monkeypatch.setattr(monitor, "remote_signature", lambda _url: current_signature)
    monkeypatch.setattr(monitor, "SOURCES", (("candidates_2026", "https://tse.example/archive.zip", fake_updater, "test.zip"),))

    first = monitor.sync_changed(
        db_path=db_path, tmp_dir=tmp_path / "tmp", state_path=state_path, manifest_path=manifest_path,
    )
    second = monitor.sync_changed(
        db_path=db_path, tmp_dir=tmp_path / "tmp", state_path=state_path, manifest_path=manifest_path,
    )
    current_signature = {**current_signature, "etag": '"def"'}
    third = monitor.sync_changed(
        db_path=db_path, tmp_dir=tmp_path / "tmp", state_path=state_path, manifest_path=manifest_path,
    )

    assert [row["status"] for row in (first[0], second[0], third[0])] == ["updated", "unchanged", "updated"]
    assert calls == [2026, 2026]
    assert state_path.exists() and manifest_path.exists()
