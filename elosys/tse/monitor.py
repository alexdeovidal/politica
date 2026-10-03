"""Check official TSE 2026 archives and safely merge updates into the live database."""

from __future__ import annotations

import argparse
import fcntl
import json
import logging
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from curl_cffi import requests

from ..db import connect
from ..provenance import write_manifest
from . import accounts, assets, candidates, social

log = logging.getLogger("elosys.tse.monitor")
HEADERS = {"Accept": "*/*", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"}

SOURCES = (
    ("candidates_2026", candidates.URL_TEMPLATE.format(year=2026), candidates.refresh_year,
     "consulta_cand_2026.zip"),
    ("finance_2026", accounts.URL_TEMPLATE.format(year=2026), accounts.refresh_year,
     "prestacao_contas_candidatos_2026.zip"),
    ("assets_2026", assets.URL_TEMPLATE.format(year=2026), assets.refresh_year,
     "bem_candidato_2026.zip"),
    ("social_2026", social.URL_TEMPLATE.format(year=2026), social.refresh_year,
     "rede_social_candidato_2026.zip"),
)


def remote_signature(url: str) -> dict[str, str | None]:
    response = requests.head(url, headers=HEADERS, timeout=45, impersonate="chrome")
    try:
        if response.status_code == 403:
            raise RuntimeError(f"TSE recusou a verificação HEAD para {url}")
        response.raise_for_status()
        return {
            "last_modified": response.headers.get("Last-Modified"),
            "etag": response.headers.get("ETag"),
            "content_length": response.headers.get("Content-Length"),
        }
    finally:
        response.close()


def _read_state(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {"sources": {}}
    except FileNotFoundError:
        return {"sources": {}}
    except (json.JSONDecodeError, OSError) as error:
        raise RuntimeError(f"não foi possível ler o estado de monitoramento {path}: {error}") from error


def _write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync_changed(*, db_path: Path, tmp_dir: Path, state_path: Path,
                 manifest_path: Path, force: bool = False) -> list[dict]:
    state = _read_state(state_path)
    known = state.setdefault("sources", {})
    results: list[dict] = []
    tmp_dir.mkdir(parents=True, exist_ok=True)

    with closing(connect(db_path, write=True)) as con:
        for name, url, updater, archive_name in SOURCES:
            signature = remote_signature(url)
            previous = known.get(name, {})
            if not force and previous.get("signature") == signature:
                log.info("sem mudança no TSE: %s", name)
                results.append({"source": name, "status": "unchanged", "signature": signature})
                continue

            log.info("fonte TSE alterada; atualizando apenas os registros de 2026: %s", name)
            # This directory belongs exclusively to this monitor; do not ingest an archive
            # left behind by a previous interrupted attempt.
            (tmp_dir / archive_name).unlink(missing_ok=True)
            report = updater(con, 2026, tmp_dir=tmp_dir)
            collection = con.execute(
                "SELECT payload_sha256, size_bytes FROM collection WHERE id = ?",
                (report["collection_id"],),
            ).fetchone()
            if not collection or report.get("rows", report.get("source_rows", 0)) == 0:
                raise RuntimeError(f"a atualização de {name} não gerou linhas verificáveis")

            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            known[name] = {
                "url": url,
                "signature": signature,
                "payload_sha256": collection["payload_sha256"],
                "size_bytes": collection["size_bytes"],
                "synced_at": now,
            }
            state["generated_at"] = now
            write_manifest(con, manifest_path)
            _write_state(state_path, state)
            results.append({"source": name, "status": "updated", **report,
                            "payload_sha256": collection["payload_sha256"]})
            log.info("fonte atualizada: %s (%s linhas)", name,
                     report.get("rows", report.get("source_rows", "n/d")))

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("/data/elosys.db"))
    parser.add_argument("--tmp", type=Path, default=Path("/data/tse-refresh-tmp"))
    parser.add_argument("--state", type=Path, default=Path("/data/tse-source-monitor.json"))
    parser.add_argument("--manifest", type=Path, default=Path("/data/manifest.json"))
    parser.add_argument("--lock", type=Path, default=Path("/data/tse-source-monitor.lock"))
    parser.add_argument("--force", action="store_true", help="reprocessar as quatro fontes")
    args = parser.parse_args()

    args.lock.parent.mkdir(parents=True, exist_ok=True)
    with args.lock.open("w", encoding="utf-8") as lock_file:
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log.info("uma sincronização TSE já está em execução; esta execução será ignorada")
            return 0
        results = sync_changed(db_path=args.db, tmp_dir=args.tmp, state_path=args.state,
                               manifest_path=args.manifest, force=args.force)
        print(json.dumps({"checked_at": datetime.now(timezone.utc).isoformat(),
                          "results": results}, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    raise SystemExit(main())
