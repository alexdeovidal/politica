#!/usr/bin/env python3
"""Apply reviewed documentary decisions to Goiás surgical payment candidates.

Candidate collection is deliberately broader than inclusion. New documents and
changed evidence stop the build until a review is recorded in the catalog.
The catalog identifies official documents, never a position in a downloaded CSV.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path


def evidence_hash(row):
    fields = ("id", "date", "amountCents", "agencyId", "commitment", "paymentOrder",
              "supplierDocument", "description", "budgetDescription", "sourceId", "sourceRow")
    payload = {field: row.get(field) for field in fields}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


def review_candidates(central, catalog):
    rows = [row for row in central["records"] if row["category"] == "elective-surgeries"]
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Duplicate surgical candidate identity")
    by_id = {item["id"]: item for item in catalog["decisions"]}
    if len(by_id) != len(catalog["decisions"]):
        raise ValueError("Duplicate document in surgical review catalog")
    decisions = []
    for index, row in enumerate(rows):
        known = by_id.get(row["id"])
        if known is None:
            raise ValueError(f"Surgical candidate requires documentary review: {row['id']}")
        if known["evidenceSha256"] != evidence_hash(row):
            raise ValueError(f"Surgical evidence changed; review again: {row['id']}")
        if known["decision"] not in ("keep", "exclude_from_strict_surgery_total"):
            raise ValueError(f"Unsupported surgical review decision: {row['id']}")
        decisions.append({**known, "indexReviewed": index})
    years = sorted({int(row["date"][:4]) for row in rows})
    annual = []
    for year in years:
        selected = [item for item in decisions if item["date"].startswith(str(year))]
        kept = [item for item in selected if item["decision"] == "keep"]
        excluded = [item for item in selected if item["decision"] != "keep"]
        annual.append({"year": year,
                       "inputAmountCents": sum(item["amountCents"] for item in selected),
                       "keptAmountCents": sum(item["amountCents"] for item in kept),
                       "excludedAmountCents": sum(item["amountCents"] for item in excluded),
                       "keptRows": len(kept), "excludedRows": len(excluded)})
    evidence = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return {
        "reviewedRows": len(decisions), "reviewedAllInputRows": True,
        "inputSha256": hashlib.sha256(evidence).hexdigest(),
        "recommendation": "Usar somente keep no total estrito. Novas identidades e alterações da evidência exigem revisão. Transferências não representam custo completo da rede.",
        "summary": annual, "decisions": decisions,
        "excludedIds": [item["id"] for item in decisions if item["decision"] != "keep"],
        "financialNatureCorrections": [
            {"id": item["id"], "financialNature": item["correctFinancialNature"], "reason": item["natureReason"]}
            for item in decisions if "correctFinancialNature" in item
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Normalized central candidate ledger")
    parser.add_argument("--output", required=True, help="Documentary audit consumed by snapshot builder")
    parser.add_argument("--review-catalog", default=str(Path(__file__).with_name("health-surgery-review.json")))
    args = parser.parse_args()
    result = review_candidates(json.loads(Path(args.input).read_text()), json.loads(Path(args.review_catalog).read_text()))
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"summary": result["summary"], "reviewedRows": result["reviewedRows"],
                      "reasons": dict(Counter(item["reasonCode"] for item in result["decisions"]))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
