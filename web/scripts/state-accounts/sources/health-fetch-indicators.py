#!/usr/bin/env python3
"""Collect public SES-GO and SUS360 sources without authentication.

Usage: python health-fetch-indicators.py --cache /absolute/research/directory
No patient-level records are requested. Production, transfers, and payments
remain separate in the accompanying normalizer.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", required=True)
args = parser.parse_args()
cache = Path(args.cache)
cache.mkdir(parents=True, exist_ok=True)

catalogue = "https://dadosabertos.go.gov.br/api/3/action/package_show?id=transparencia-regulacao-indicadores"
package_bytes = urlopen(catalogue, timeout=55).read()
(cache / "regulacao-package.json").write_bytes(package_bytes)
package = json.loads(package_bytes)["result"]
resource = next(r for r in package["resources"] if r["id"] == "cd5cf02c-d01d-41ed-a503-d24352d33d3a")
urls = {
    "indicadores-cirurgia.csv": resource["url"],
    "RAG-2025.pdf": "https://goias.gov.br/saude/wp-content/uploads/sites/34/instrumentos-de-planejamento/RAG/RAG-2025.pdf",
}
base = "https://sus360.saude.gov.br/painel/saldo-gestor/agora-tem-especialistas/api/"
for snapshot in ("202512", "202608"):
    for name, endpoint in (
        ("gestor", "gestor/520000"),
        ("fluxo", "fluxo-financeiro?gestor=520000"),
        ("mensal", "producao-mensal?gestor=520000"),
    ):
        urls[f"sus360-go-estadual-{snapshot}-{name}.json"] = base + snapshot + "/" + endpoint


def collect(item):
    name, url = item
    response = urlopen(url, timeout=55)
    contents = response.read()
    if name.endswith(".json"):
        json.loads(contents)
    if name.endswith(".pdf") and not contents.startswith(b"%PDF"):
        raise ValueError("Expected official PDF, received a different document")
    if name.endswith(".csv") and not contents.decode("utf-8-sig").startswith("Mês;Especialidade;"):
        raise ValueError("Unexpected indicator CSV schema")
    (cache / name).write_bytes(contents)
    return {
        "file": name,
        "url": url,
        "responseUrl": response.geturl(),
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sha256": hashlib.sha256(contents).hexdigest(),
        "bytes": len(contents),
        "contentType": response.headers.get("Content-Type"),
    }


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    sources = list(pool.map(collect, urls.items()))
(cache / "health-source-downloads.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"files": len(sources), "bytes": sum(s["bytes"] for s in sources)}))
