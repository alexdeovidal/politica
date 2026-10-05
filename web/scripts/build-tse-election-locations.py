#!/usr/bin/env python3
"""Build a compact polling-place lookup from the TSE's 2026 public CSVs.

Source: https://dadosabertos.tse.jus.br/dataset/eleitorado-2026/resource/300626b4-2b24-4d2e-b4fc-46b569cfffe5
The nationwide CSV is intentionally skipped; per-UF CSVs contain the same records.
"""
import csv
import gzip
import io
import json
import urllib.request
import zipfile
from pathlib import Path

URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip"
OUTPUT = Path(__file__).resolve().parents[1] / "public/data/tse-election-locations-2026.json.gz"

request = urllib.request.Request(URL, headers={"User-Agent": "Politica007/1.0 (+https://politica007.com.br)"})
with urllib.request.urlopen(request, timeout=180) as response:
    archive_bytes = response.read()
    last_modified = response.headers.get("Last-Modified")
archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
locations: dict[str, list[str]] = {}
for filename in archive.namelist():
    if not filename.endswith(".csv") or "_BRASIL.csv" in filename:
        continue
    state = filename.removesuffix(".csv").rsplit("_", 1)[-1].lower()
    with archive.open(filename) as raw:
        text = io.TextIOWrapper(raw, encoding="iso-8859-1", newline="")
        rows = csv.DictReader(text, delimiter=";", quotechar='"')
        for row in rows:
            municipality = str(row.get("CD_MUNICIPIO", "")).strip().strip('"').zfill(5)
            zone = str(row.get("NR_ZONA", "")).strip().strip('"').zfill(4)
            local = str(row.get("NR_LOCAL_VOTACAO", "")).strip().strip('"')
            if not (municipality.isdigit() and zone.isdigit() and local.isdigit()):
                continue
            local = str(int(local))
            name = str(row.get("NM_LOCAL_VOTACAO", "")).strip().strip('"')
            address = str(row.get("DS_ENDERECO", "")).strip().strip('"')
            key = f"{state}:{municipality}:{zone}:{local}"
            value = [name, address]
            if name and (key not in locations or len(name) > len(locations[key][0])):
                locations[key] = value

payload = {"source": URL, "lastModified": last_modified, "locations": locations}
# Keep the data self-contained and compact; preserve the official source file time.
with gzip.open(OUTPUT, "wt", encoding="utf-8", compresslevel=9) as compressed:
    json.dump(payload, compressed, ensure_ascii=False, separators=(",", ":"))
print(f"saved {OUTPUT} ({len(locations):,} places)")
