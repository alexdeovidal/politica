#!/usr/bin/env python3
"""Build the reviewed, versioned Goiás snapshot. Inputs remain independent ledgers."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path

SHORT_NAMES = {
    "1201": "SECOM", "2961": "DETRAN-GO", "2850": "Fundo Estadual de Saúde", "2801": "Secretaria da Saúde",
    "2401": "Secretaria da Educação", "4201": "Secretaria da Retomada", "1801": "Administração",
    "1261": "Agência Brasil Central", "4362": "AGEHAB", "3190": "IQUEGO", "3262": "EMATER",
    "3261": "AGRODEFESA", "4062": "UEG", "4361": "GOINFRA", "1863": "AGR", "4261": "Goiás Turismo",
    "2101": "Meio Ambiente", "3201": "Agricultura e Pecuária", "2601": "Esporte e Lazer", "3351": "FUNPRODUZIR",
    "3001": "Desenvolvimento Social", "2906": "Polícia Penal", "3362": "JUCEG", "2501": "Cultura",
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--research", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    root, out = Path(args.research), Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    load = lambda name: json.loads((root / name).read_text())
    central = load("central/normalized-payments-expanded.json")
    surgery_audit = load("cirurgias/auditoria-cirurgias-central.json")
    surgical_candidates = [row for row in central["records"] if row["category"] == "elective-surgeries"]
    surgical_input = json.dumps(surgical_candidates, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    if surgery_audit["inputSha256"] != hashlib.sha256(surgical_input).hexdigest():
        raise ValueError("Surgical documentary audit does not match the candidate ledger; review before building")
    ad_audit_path = root / "publicidade/central-commitment-audit.json"
    if ad_audit_path.exists():
        ad_audit = json.loads(ad_audit_path.read_text())
    else:
        # The published, versioned audit retains the reviewed commitment labels
        # and reasons. Its raw evidence cache is optional for reproduction.
        reviewed_path = Path(__file__).resolve().parents[2] / "data/state-accounts/goias/audit.json"
        if not reviewed_path.exists():
            raise FileNotFoundError("Reviewed publicity commitments are required; restore central-commitment-audit.json or the versioned audit.json")
        ad_audit = {"commitments": json.loads(reviewed_path.read_text())["publicityCommitments"]}
    ads = load("publicidade/advertising-summary.json")
    saneago = load("publicidade/saneago-advertising.json")
    legal = load("publicidade/legal-advertising.json")
    companies = load("publicidade/fomento-telecom-advertising.json")
    health = load("cirurgias/cirurgias-indicadores-normalizados.json")
    production = load("cirurgias/sus360-programa-cirurgico-normalizado.json")
    pce = load("cirurgias/pce-repasses-pagos-normalizados.json")
    fiscal = load("fiscal/goias-fiscal-normalized.json")
    commitments = {r["commitment"]: r for r in ad_audit["commitments"]}
    decisions = {r["id"]: r for r in surgery_audit["decisions"]}
    corrections = {r["id"]: r for r in surgery_audit["financialNatureCorrections"]}
    records = []
    for raw in central["records"]:
        row = dict(raw)
        row["ledger"] = "treasury"
        row["agency"] = SHORT_NAMES.get(row["agencyId"], row["agency"])
        if row["category"] == "elective-surgeries":
            decision = decisions.get(row["id"])
            if not decision:
                raise ValueError(f"Surgery record without documentary review: {row['id']}")
            if decision["decision"] != "keep":
                # Preserve the exclusion in audit.json, not a public medical-object ledger.
                continue
            else:
                row["classificationRule"] = decision["reason"]
                if decision.get("qualityFlags"):
                    row["qualityFlags"] = decision["qualityFlags"]
            if row["id"] in corrections:
                row["financialNature"] = corrections[row["id"]]["financialNature"]
        elif row["commitment"] in commitments:
            proof = commitments[row["commitment"]]
            row["category"] = proof["category"]
            row["classificationRule"] = proof["reason"]
        row["description"] = row["description"][:650]
        row["budgetDescription"] = row.get("budgetDescription", "")[:650]
        records.append(row)

    sources = [{**s, "notes": "Ordens de pagamento. Classificação temática por objeto e empenho; cobertura identificada, não total exaustivo por tema."} for s in central["sources"]]
    budget_package = load("central/empenhos-package.json")
    for resource in budget_package["resources"]:
        import re
        match = re.search(r"empenhos_(2026\d{2})\.csv$|empenhos_ano_(2025)\.zip$", resource["url"], re.I)
        if not match: continue
        period = match.group(1) or match.group(2)
        filename = root / "central" / f"empenhos-{period}{'.zip' if period == '2025' else '.csv'}"
        if not filename.exists(): continue
        sources.append({"id": f"go-economia-empenhos-{period}", "label": resource["name"],
            "url": "https://dadosabertos.go.gov.br/dataset/empenhos", "downloadUrl": resource["url"], "kind": "csv",
            "retrievedAt": central["retrievedAt"], "publishedAt": resource.get("last_modified"),
            "sha256": hashlib.sha256(filename.read_bytes()).hexdigest(),
            "notes": "Objeto do empenho usado para classificar as ordens de pagamento. Valor empenhado não é somado ao pago; união pela identidade do empenho."})
    sources += [{"id": s["id"], "label": f"{s['agency']} — pagamentos de agências e veículos", "url": s["url"],
                 "downloadUrl": s.get("downloadUrl"), "kind": "spreadsheet", "retrievedAt": s["collectedAt"],
                 "sha256": s.get("sha256"), "notes": "Bruto da nota, líquido, veículo e comissão são medidas relacionadas. Não somar novamente às ordens de pagamento."}
                for s in ads["sources"] if s["id"].startswith(("go-secom", "go-detran"))]
    source_ids = {s["id"] for s in sources}

    invoice_months = defaultdict(lambda: {"count": 0, "grossCents": 0, "netCents": 0, "invalidNetCount": 0})
    invoice_flags = 0
    for line in (root / "publicidade/advertising-records.ndjson").read_text().splitlines():
        r = json.loads(line)
        date = r.get("paymentDate")
        if not r.get("hasVerifiedPaymentDate") or not date or date[:4] not in ("2025", "2026"):
            continue
        valid_net = isinstance(r.get("netCents"), int) and 0 <= r["netCents"] <= r["grossCents"]
        flags = r.get("qualityFlags", [])
        invoice_flags += bool(flags)
        cell = invoice_months[(date[:7], r["agency"])]
        cell["count"] += 1
        cell["grossCents"] += r["grossCents"]
        if valid_net: cell["netCents"] += r["netCents"]
        else: cell["invalidNetCount"] += 1
        records.append({"id": r["id"], "uf": "GO", "ledger": "invoices", "agencyId": r["agency"], "agency": r["agency"],
            "category": "institutional-publicity", "stage": "paid", "amountCents": r["grossCents"], "date": date,
            "periodStart": f"{date[:4]}-01-01", "periodEnd": f"{date[:4]}-12-31", "supplier": r["advertisingAgency"],
            "vehicle": r.get("vehicle"), "campaign": r.get("campaign"), "medium": r.get("medium"),
            "municipality": r.get("municipality"), "description": r.get("campaign") or "Nota de serviços publicitários",
            "sourceId": r["sourceId"], "sourceRow": f"{r['sourceSheet']}:{r['sourceRow']}" if r.get("sourceSheet") else str(r["sourceRow"]),
            "dedupKey": r["id"], "coverage": "partial", "scope": "paid-invoice-face-value", "consolidationRole": "reference",
            "grossCents": r["grossCents"], "netCents": r["netCents"] if valid_net else None,
            "commissionCents": r.get("commissionCents"), "qualityFlags": flags, "commitment": r.get("commitment"),
            "classificationRule": "Valor bruto da nota com pagamento datado. Detalhamento de agência/veículo; não adicionar ao total do Tesouro."})

    sources.append({"id": saneago["sourceId"], "label": "SANEAGO — despesas com publicidade e propaganda",
        "url": saneago["sourceUrl"], "kind": "portal", "retrievedAt": saneago["collectedAt"], "publishedAt": saneago["sourceReloadedAt"],
        "notes": "Pagamentos da empresa, separados do Tesouro. A soma dos valores apresentados por linha difere um centavo do total arredondado do painel."})
    for r in saneago["records"]:
        if r["paymentDate"][:4] not in ("2025", "2026"): continue
        records.append({"id": r["id"], "uf": "GO", "ledger": "companies", "agencyId": "SANEAGO", "agency": "SANEAGO",
            "category": "legal-publicity" if r["purpose"] == "publicidade_legal" else "institutional-publicity", "stage": "paid",
            "amountCents": r["amountCents"], "date": r["paymentDate"], "periodStart": f"{r['year']}-01-01", "periodEnd": f"{r['year']}-12-31",
            "supplier": r["provider"], "vehicle": r["vehicle"], "medium": r["medium"], "description": r["purposeOriginal"],
            "sourceId": r["sourceId"], "sourceRow": r["sourceRow"], "dedupKey": r["id"], "coverage": "partial",
            "scope": "state-company", "classificationRule": "Finalidade e pagamento conforme tabela oficial da SANEAGO; sem soma ao Tesouro."})
    for source in legal["sources"]:
        if source["id"] not in source_ids:
            sources.append({"id": source["id"], "label": "Publicidade legal — " + ("CEASA" if "ceasa" in source["id"] else "Goiás Parcerias"),
                "url": source["url"], "kind": "spreadsheet", "retrievedAt": legal["collectedAt"], "sha256": source.get("sha256"),
                "notes": "CEASA informa pagamentos; Goiás Parcerias informa despesas sem etapa financeira explícita, fora das somas comparáveis."})
    for r in legal["records"]:
        date = r.get("paymentDate")
        if r["stage"] != "paid" or not date or date[:4] not in ("2025", "2026"): continue
        records.append({"id": r["id"], "uf": "GO", "ledger": "companies", "agencyId": r["agency"], "agency": r["agency"],
            "category": "legal-publicity", "stage": "paid", "amountCents": r["amountCents"], "date": date,
            "periodStart": f"{date[:4]}-01-01", "periodEnd": f"{date[:4]}-12-31", "supplier": r["provider"],
            "vehicle": r.get("vehicle"), "medium": r.get("medium"), "description": "Publicação legal / ato oficial",
            "sourceId": r["sourceId"], "sourceRow": r["sourceRow"], "dedupKey": r["id"], "coverage": "partial", "scope": "state-company"})
    for source in companies["sources"]:
        sources.append({"id": source["id"], "label": "GoiásFomento — pagamentos de publicações" if "fomento" in source["id"] else "GoiásTelecom — despesas históricas",
            "url": source["url"], "downloadUrl": source.get("downloadUrl"), "kind": "csv", "retrievedAt": companies["collectedAt"],
            "sha256": source.get("sha256"), "notes": "GoiásFomento informa pagamentos. GoiásTelecom possui registros históricos sem etapa confirmada, fora das somas desta versão."})
    for r in companies["records"]:
        day = r.get("paymentDate")
        if r.get("stage") != "paid" or not day or day[:4] not in ("2025", "2026"): continue
        records.append({"id": r["id"], "uf": "GO", "ledger": "companies", "agencyId": r["agency"], "agency": r["agency"],
            "category": "legal-publicity" if r["purpose"] == "publicidade_legal" else "institutional-publicity", "stage": "paid",
            "amountCents": r["amountCents"], "date": day, "periodStart": f"{day[:4]}-01-01", "periodEnd": f"{day[:4]}-12-31",
            "supplier": r["provider"], "vehicle": r.get("vehicle"), "medium": r.get("medium"), "description": r.get("purposeOriginal", "Publicidade"),
            "sourceId": r["sourceId"], "sourceRow": r["sourceRow"], "dedupKey": r["id"], "coverage": "partial", "scope": "state-company",
            "classificationRule": "Pagamento informado em planilha da empresa; retenções identificadas na descrição, sem soma ao Tesouro."})
    for source in pce["sources"]:
        sources.append({"id": source["id"], "label": source["title"], "url": source["landingUrl"], "downloadUrl": source["url"],
            "kind": "spreadsheet", "retrievedAt": source["retrievedAt"], "sha256": source["sha256"],
            "notes": "Filtro da fonte é competência. No portal, as parcelas são filtradas pela data do pagamento. Não somar às OPs conciliadas."})
    for r in pce["records"]:
        if r["paymentYear"] not in (2025, 2026): continue
        records.append({"id": r["id"], "uf": "GO", "ledger": "pce", "agencyId": "2850", "agency": "Fundo Estadual de Saúde",
            "category": "elective-surgeries", "stage": "paid", "financialNature": "transfer", "amountCents": r["amountCents"],
            "date": r["paymentDate"], "periodStart": f"{r['paymentYear']}-01-01", "periodEnd": f"{r['paymentYear']}-12-31",
            "supplier": r["payee"], "supplierDocument": r["payeeCnpj"], "municipality": r["municipality"], "commitment": r["commitment"],
            "description": "PCE — contraparte estadual para procedimentos cirúrgicos eletivos", "sourceId": r["sourceId"], "sourceRow": r["sourceRow"],
            "dedupKey": r["id"], "coverage": "partial", "scope": "pce-transfer-detail", "consolidationRole": "reference",
            "classificationRule": "As 17 parcelas de 2025 conciliam com duas ordens de pagamento. Detalhamento, sem soma adicional."})

    def monthly(ledger):
        groups = {}
        for r in records:
            if r["ledger"] != ledger: continue
            key = (r["date"][:7], r["agencyId"], r["category"], r.get("financialNature", "direct-payment"))
            if key not in groups:
                groups[key] = {"month": key[0], "agencyId": key[1], "agency": r["agency"], "category": key[2],
                               "financialNature": key[3], "amountCents": 0, "count": 0}
            groups[key]["amountCents"] += r["amountCents"]
            groups[key]["count"] += r["amountCents"] != 0
        return sorted(groups.values(), key=lambda r: (r["month"], r["agencyId"], r["category"]))

    for f in fiscal["snapshots"]:
        for label, field in [("Balanço orçamentário", "balanceSource"), ("Despesa por função", "functionSource")]:
            s = f[field]
            sources.append({"id": f"go-rreo-{f['year']}-{field}", "label": f"Siconfi / RREO {f['year']} — {label}",
                "url": s["url"], "kind": "api", "retrievedAt": s["retrievedAt"], "sha256": s["sha256"],
                "notes": f"{f['period']}º bimestre. Funções conciliadas ao total sem despesas intraorçamentárias; pago por função não informado."})
    sources.append({"id": "go-ses-surgery-indicators", "label": "SES — Indicadores de cirurgia", "url": health["source"]["url"],
        "downloadUrl": health["source"]["downloadUrl"], "kind": "csv", "retrievedAt": health["retrievedAt"],
        "sha256": health["source"]["sha256"], "notes": "Procedimentos registrados no CSV. Não representa pacientes únicos nem gasto financeiro."})
    rag_url = "https://goias.gov.br/saude/wp-content/uploads/sites/34/instrumentos-de-planejamento/RAG/RAG-2025.pdf#page=150"
    sources.append({"id": "go-rag-2025", "label": "SES — Relatório Anual de Gestão 2025", "url": rag_url, "kind": "pdf",
                    "retrievedAt": central["retrievedAt"], "notes": "Meta 1.4.2, resultado anual: 66.608 cirurgias eletivas; página física 150, impressa 151."})
    for r in production["records"]:
        sources.append({"id": r["id"], "label": f"SUS360 — produção financeira cirúrgica, foto {r['snapshot']}", "url": r["sourcePage"],
            "downloadUrl": r["sourceUrl"], "kind": "api", "retrievedAt": production["retrievedAt"], "sha256": r["sha256"],
            "notes": "Produção informada do programa federal; não é desembolso do Tesouro Estadual."})
    central_monthly = monthly("treasury")
    ad_orgs = {r["agencyId"] for r in central_monthly if r["category"] in ("institutional-publicity", "legal-publicity")}
    coverage = [
        {"id": "secom", "name": "SECOM", "status": "integrated", "detail": "Ordens de pagamento identificadas por empenho e planilha de agências/veículos. Planilha com pagamentos até 12/11/2026.", "sourceUrl": "https://goias.gov.br/comunicacao/pagamento-contratos/"},
        {"id": "detran", "name": "DETRAN-GO", "status": "integrated", "detail": "Ordens de pagamento, publicidade legal e planilhas de agências/veículos. Planilha com pagamentos até 06/09/2026; datas não provam encerramento do mês.", "sourceUrl": "https://goias.gov.br/detran/pagamento-de-agencias-e-veiculos/"},
        {"id": "saneago", "name": "SANEAGO", "status": "integrated", "detail": "Tabela oficial completa exportada: institucional e legal, com pagamentos até 22/10/2026. Universo empresarial separado do Tesouro.", "sourceUrl": saneago["sourceUrl"]},
        {"id": "ses", "name": "Saúde / FES", "status": "partial", "detail": "Publicidade classificada pelo objeto dos empenhos; repasses cirúrgicos com revisão documental. O custo integral das cirurgias na rede não foi isolado.", "sourceUrl": "https://dadosabertos.go.gov.br/dataset/pagamentos"},
        {"id": "educacao", "name": "Educação", "status": "partial", "detail": "Pagamentos e objetos de empenho incluídos na varredura geral. Ausência de campanha identificada em um recorte não comprova gasto zero com publicidade.", "sourceUrl": "https://dadosabertos.go.gov.br/dataset/empenhos"},
        {"id": "others", "name": "Demais órgãos e autarquias", "status": "partial", "detail": f"Publicidade identificada em {len(ad_orgs)} órgãos/unidades na base central. Inclui Retomada, AGEHAB, AGRODEFESA e outras unidades, conforme o período.", "sourceUrl": "https://dadosabertos.go.gov.br/dataset/pagamentos"},
        {"id": "ceasa", "name": "CEASA", "status": "integrated", "detail": "Tabela oficial de pagamentos de publicidade legal. Mostrada no universo das empresas estaduais, separadamente.", "sourceUrl": "https://goias.gov.br/ceasa/gastos-com-publicidade-e-propaganda-2/"},
        {"id": "parcerias", "name": "Goiás Parcerias", "status": "reference", "detail": "Planilha localizada e examinada. A etapa financeira não é explícita; valores fora do comparativo de pagamentos.", "sourceUrl": "https://goias.gov.br/goiasparcerias/gastos-com-publicidade-e-propaganda/"},
        {"id": "telecom", "name": "Goiás Telecom", "status": "reference", "detail": "Catálogo próprio localizado; sem conciliação financeira do período deste comparativo. Não tratado como zero.", "sourceUrl": "https://dadosabertos.go.gov.br/dataset/despesas-com-publicidade-e-propaganda-goiastelecom"},
        {"id": "fomento", "name": "GoiásFomento", "status": "integrated", "detail": "Planilha oficial de pagamentos de publicações, com dados até 29/10/2026. Incluída no universo empresarial separado do Tesouro.", "sourceUrl": "https://www.goiasfomento.com/acesso-a-informacao/gastos-com-publicidade-e-propaganda/"},
    ]
    summary = {"schemaVersion": 1, "uf": "GO", "name": "Goiás", "collectedAt": central["retrievedAt"], "version": "2026-11-18",
        "scannedPayments": central["quality"]["scannedRows"], "scannedAgencies": len(central["agencies"]),
        "selectedPayments": sum(r["ledger"] == "treasury" for r in records), "agencyInvoices": sum(r["ledger"] == "invoices" for r in records),
        "years": [2025, 2026], "windows": central["windows"], "monthly": central_monthly,
        "invoiceMonthly": [{"month": m, "agency": a, **v} for (m, a), v in sorted(invoice_months.items())],
        "companyMonthly": monthly("companies"), "fiscal": fiscal["snapshots"],
        "surgery": {"monthly": health["monthly"], "annual": health["annual"], "sourceUrl": health["source"]["url"], "notes": health["limitations"],
            "rag2025": {"count": 66608, "url": rag_url, "page": 150, "label": "Cirurgias eletivas informadas no RAG 2025"},
            "production": [{"year": int(r["snapshot"][:4]), "amountCents": r["amountCents"], "periodStart": r["periodStart"], "periodEnd": r["periodEnd"],
                "sourceUrl": r["sourcePage"], "notes": r["limitations"]} for r in production["records"]], "pceAnnual": pce["annual"]},
        "coverage": coverage, "sources": sources,
        "quality": {"surgeryExcluded": len(surgery_audit["excludedIds"]), "mixedPurposeExcluded": len(central["quality"]["excludedMixedPurposeSurgery"]),
            "invoiceFlags": invoice_flags, "classifiedCommitments": len(commitments),
            "notes": ["Dados da base central de pagamentos: janeiro–dezembro/2025 e janeiro–outubro/2026.",
                "Cobertura temática identificada. O total de publicidade de todos os órgãos e o custo integral da rede cirúrgica não estão certificados.",
                "Planilhas de notas e detalhamento PCE não são somados novamente às ordens de pagamento.",
                "Empresas estaduais permanecem em universo separado. Valores sem etapa financeira explícita não entram nas comparações.",
                "Produção SUS, procedimentos e dinheiro pago são medidas distintas. Não é calculado custo médio de cirurgia com fontes incompatíveis.",
                "Fila Zero: repasse de R$600.000,00 ao HCN em 03/09/2025 incluído pela destinação explícita da OP. Divergência no número do aditivo preservada na auditoria.",
                "Pagamento de R$273.134,07 ao Hospital Padre Tiago em 12/03/2026 fora do total estrito: o histórico da OP e o objeto do empenho divergem sobre o quadro do programa."]}}
    packed = json.dumps(records, ensure_ascii=False, separators=(",", ":")).encode()
    summary["version"] += "-" + hashlib.sha256(packed).hexdigest()[:12]
    (out / "records.json.gz").write_bytes(gzip.compress(packed, compresslevel=9, mtime=0))
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, separators=(",", ":")))
    audits = {"publicityCommitments": [{k: v for k, v in r.items() if k != "evidence"} for r in ad_audit["commitments"]],
              "surgery": surgery_audit, "recordsSha256": hashlib.sha256(packed).hexdigest()}
    (out / "audit.json").write_text(json.dumps(audits, ensure_ascii=False, separators=(",", ":")))
    totals = defaultdict(int)
    for r in records:
        if r["ledger"] == "treasury": totals[(r["date"][:4], r["category"])] += r["amountCents"]
    print(json.dumps({"records": len(records), "gzBytes": (out / "records.json.gz").stat().st_size,
                      "summaryBytes": (out / "summary.json").stat().st_size, "totalsCents": {str(k): v for k, v in totals.items()}}, ensure_ascii=False))


if __name__ == "__main__": main()
