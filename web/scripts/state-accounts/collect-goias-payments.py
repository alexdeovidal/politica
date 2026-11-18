#!/usr/bin/env python3
"""Reproduce Goiás payment evidence from the public CKAN catalogue.

Official files are cached outside the repository. Only selected, redacted
business/government records are exported. Payments are never added to agency
invoice ledgers: those ledgers supply documentary classification only.
"""
import argparse
import calendar
import concurrent.futures
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import unicodedata
from decimal import Decimal
from urllib.request import urlopen
import zipfile

CATALOGUE = "https://dadosabertos.go.gov.br/api/3/action/package_show?id=pagamentos"
SOURCE_PAGE = "https://dadosabertos.go.gov.br/dataset/pagamentos"


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(c))


def digits(value):
    return re.sub(r"\D", "", value or "")


def redact(value):
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b", "[CPF omitido]", value)
    value = re.sub(r"(?i)(?:conta(?: corrente)?|ag[eê]ncia banc[aá]ria|chave pix|banco para dep[oó]sito)\s*[:nº.\-]*\s*[\d.\-/ ]+", "[dados bancários omitidos]", value)
    return value[:900]


def register_payment_identity(seen, agency_id, commitment, payment_order, date, amount):
    """Deduplicate the official OP, and stop if a repeated OP changes its cash data.

    Date and amount remain in the historical record hash for stable reviewed IDs,
    but are not part of the official document identity used for deduplication.
    """
    identity = (agency_id, commitment, payment_order)
    values = (date, amount)
    previous = seen.get(identity)
    if previous is not None:
        if previous != values:
            raise ValueError(
                "Conflicting official payment identity "
                f"{agency_id}/{commitment}/{payment_order}: "
                f"{previous!r} differs from {values!r}; reconcile before publication"
            )
        return False
    seen[identity] = values
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True)
    parser.add_argument("--agency-ledger", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--retrieved-at", required=True)
    parser.add_argument("--years", default="2025,2026")
    args = parser.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    years = [int(y) for y in args.years.split(",")]
    package_path = cache / "pagamentos-package.json"
    if package_path.exists():
        package = json.loads(package_path.read_text())
    else:
        package = json.load(urlopen(CATALOGUE, timeout=60))["result"]
        package_path.write_text(json.dumps(package))
    commitments = {}
    for line in Path(args.agency_ledger).read_text().splitlines():
        record = json.loads(line)
        code = digits(record.get("commitment", ""))
        if code:
            commitments[code] = record["agency"]

    budget_objects = {}
    for filename in sorted(cache.glob("empenhos-*")):
        if filename.suffix == ".zip":
            archive = zipfile.ZipFile(filename)
            contents = [archive.read(info) for info in archive.infolist() if info.filename.lower().endswith(".csv")]
        elif filename.suffix == ".csv" and "sample" not in filename.name:
            contents = [filename.read_bytes()]
        else:
            continue
        for raw in contents:
            for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"):
                budget_objects[digits(row["NUMR_EMPENHO"])] = row.get("DESCRICAO_EMPENHO", "")

    resources = []
    for year in years:
        annual = [r for r in package["resources"] if re.search(rf"pagamentos_ano_{year}\.zip$", r["url"], re.I)]
        if annual:
            resources.append((str(year), annual[0], cache / f"pagamentos-{year}.zip"))
        else:
            for r in package["resources"]:
                match = re.search(rf"pagamentos_({year}\d{{2}})\.csv$", r["url"], re.I)
                if match:
                    resources.append((match[1], r, cache / f"pagamentos-{match[1]}.csv"))

    def download(item):
        _, resource, target = item
        if not target.exists():
            target.write_bytes(urlopen(resource["url"], timeout=90).read())
        return item

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        resources = list(executor.map(download, resources))
    records, sources, months, agencies = [], [], set(), {}
    seen, duplicates, scanned = {}, 0, 0
    excluded_mixed = []
    for period, resource, filename in resources:
        raw = filename.read_bytes()
        source_id = f"go-economia-pagamentos-{period}"
        sources.append({"id": source_id, "label": resource["name"], "url": SOURCE_PAGE,
                        "downloadUrl": resource["url"], "kind": "csv", "retrievedAt": args.retrieved_at,
                        "publishedAt": resource.get("last_modified"), "sha256": hashlib.sha256(raw).hexdigest()})
        if filename.suffix == ".zip":
            archive = zipfile.ZipFile(io.BytesIO(raw))
            files = [(info.filename, archive.read(info)) for info in archive.infolist() if info.filename.lower().endswith(".csv")]
        else:
            files = [(filename.name, raw)]
        for member, contents in files:
            for line_number, row in enumerate(csv.DictReader(io.StringIO(contents.decode("utf-8-sig")), delimiter=";"), 2):
                scanned += 1
                date = row["DATA_COMPLETA"][:10]
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) or int(date[:4]) not in years:
                    raise ValueError("Unexpected date in official payment file")
                months.add(date[:7])
                agency_id, agency_name = row["CODG_ORGAO"], row["NOME_ORGAO"].strip()
                agencies[agency_id] = agency_name
                # The requested executive scope excludes independent state powers.
                if re.search(r"tribunal|assembleia|ministerio publico|defensoria publica", normalized(agency_name)):
                    continue
                description = normalized(row["DESCRICAO"])
                commitment = digits(row["NUMR_EMPENHO"])
                publicity_evidence = description + " " + normalized(budget_objects.get(commitment, ""))
                amount = int(Decimal(row["VALR_OP"]) * 100)
                key = "|".join([agency_id, commitment, row["NUMR_SEQUENCIAL_OP"], date, str(amount)])
                if not register_payment_identity(seen, agency_id, commitment, row["NUMR_SEQUENCIAL_OP"], date, amount):
                    duplicates += 1
                    continue
                category, rule, nature = None, None, "direct-payment"
                if commitment in commitments:
                    category, rule = "institutional-publicity", "Empenho presente na planilha oficial de pagamentos de publicidade do órgão"
                elif re.search(r"publicidade|propaganda|veiculacao", publicity_evidence):
                    if re.search(r"clipping|monitoramento de (midia|noticias)|assessoria de imprensa", publicity_evidence):
                        category, rule = "other", "Serviço de comunicação identificado no objeto; fora do total de publicidade"
                    elif re.search(r"atos oficiais|publicidade legal|avisos de licita|publica.{0,40}(edital|ato oficial|jornal de grande)|diario oficial", publicity_evidence):
                        category, rule = "legal-publicity", "Objeto explícito de publicação legal ou de atos oficiais"
                    elif re.search(r"servicos de publicidade|campanha|propaganda|veiculacao.{0,50}(radio|televis|midia|publicit)|acoes publicit", publicity_evidence):
                        category, rule = "institutional-publicity", "Objeto explícito de campanha, publicidade ou propaganda"
                    else:
                        category, rule = "other", "Menção a publicidade ainda sem classificação suficiente; fora do total comparável"
                # Payment text can abbreviate the programme to Fila Zero. The
                # linked commitment is documentary evidence too; neither a
                # match nor a generic hospital object is a reviewed allocation.
                surgery_evidence = description + " " + normalized(budget_objects.get(commitment, ""))
                if category is None and re.search(r"cirurg.{0,45}eletiv|eletiv.{0,45}cirurg|fila\s+zero", surgery_evidence):
                    if re.search(r"paciente|demanda judicial|mandado de seguranca", description):
                        continue
                    # A mixed-purpose transfer cannot be wholly attributed to surgery.
                    if re.search(r"insumos.{0,80}cirurg|exames.{0,50}cirurg|cirurg.{0,70}(combustive|medicamento|exames|equipamento)|consultas.{0,50}cirurg", description):
                        excluded_mixed.append({"id": hashlib.sha256(key.encode()).hexdigest()[:20], "amountCents": amount, "date": date, "sourceId": source_id, "commitment": commitment})
                        continue
                    category, rule = "elective-surgeries", "Candidato identificado no pagamento, empenho ou programa Fila Zero; inclusão no total exige revisão documental"
                    nature = "transfer" if re.search(r"transfer|fundo municipal|emenda|repasse|convenio|plano de fortalecimento", description) else "direct-payment"
                if category is None:
                    continue
                document = digits(row.get("CPF_CNPJ_CREDOR", ""))
                if len(document) != 14:
                    continue
                records.append({"id": "go-op-" + hashlib.sha256(key.encode()).hexdigest()[:20], "uf": "GO",
                    "agencyId": agency_id, "agency": agency_name, "category": category, "stage": "paid",
                    "amountCents": amount, "date": date, "periodStart": f"{date[:4]}-01-01", "periodEnd": f"{date[:4]}-12-31",
                    "supplier": row["NOME_CREDOR"].strip(), "supplierDocument": document,
                    "description": redact(row["DESCRICAO"]), "sourceId": source_id, "sourceRow": f"{member}:{line_number}",
                    "dedupKey": key, "coverage": "partial", "scope": "state-disbursement",
                    "financialNature": nature, "classificationRule": rule, "commitment": commitment,
                    "budgetDescription": redact(budget_objects.get(commitment, "")),
                    "paymentOrder": row["NUMR_SEQUENCIAL_OP"]})
    windows = {}
    for year in years:
        year_months = sorted(m for m in months if m.startswith(str(year)))
        if year_months:
            last = year_months[-1]
            end = f"{last}-{calendar.monthrange(year, int(last[5:]))[1]:02d}"
            windows[str(year)] = {"start": f"{year}-01-01", "end": end, "months": year_months}
            for record in records:
                if record["date"].startswith(str(year)):
                    record["periodEnd"] = end
    output = {"schemaVersion": 1, "uf": "GO", "retrievedAt": args.retrieved_at, "sources": sources,
              "windows": windows, "agencies": agencies, "records": records,
              "quality": {"scannedRows": scanned, "deduplicatedRows": duplicates, "excludedMixedPurposeSurgery": excluded_mixed},
              "methodology": ["Base única de ordens de pagamento da Secretaria da Economia; valores assinados, incluindo estornos.",
                              "Empenhos das planilhas de agências servem para identificar a despesa, sem somar notas e ordens de pagamento.",
                              "Publicidade identificada por empenho documentado ou objeto explícito. Outros serviços de comunicação ficam separados.",
                              "Cirurgias são um recorte de pagamentos com destinação explícita. Transferências com objeto misto ficam fora; não é o custo completo dos hospitais.",
                              "SANEAGO e outros demonstrativos corporativos são apresentados separadamente, sem soma automática ao Tesouro."]}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    totals = {}
    for row in records:
        key = f"{row['date'][:4]}:{row['category']}"
        totals[key] = totals.get(key, 0) + row["amountCents"]
    print(json.dumps({"scanned": scanned, "selected": len(records), "agencies": len(agencies), "windows": windows, "totalsCents": totals, "excludedMixed": len(excluded_mixed)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
