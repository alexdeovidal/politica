import { getStateBySlug } from "@/lib/state-accounts/registry";
import { evidenceCsv, getStateDashboard, queryStateRecords } from "@/lib/state-accounts/data";
import { getSnapshotYearMonths } from "@/lib/state-accounts/availability";
import { getNationalFiscal } from "@/lib/state-accounts/national-fiscal";
import { categoryLabels, safeCsvCell, sumCents } from "@/lib/state-accounts/comparison";
import type { EvidenceQuery, LedgerId } from "@/lib/state-accounts/dashboard-model";

export const runtime = "nodejs";
const headers = { "Cache-Control": "public, max-age=300, s-maxage=1800", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ estado: string }> }) {
  const { estado } = await params;
  const state = getStateBySlug(estado, false);
  if (!state) return Response.json({ error: "Estado sem integração disponível." }, { status: 404 });
  const p = new URL(request.url).searchParams;
  try {
    if (!state.active) {
      const data = getNationalFiscal(state.slug);
      if (!data) return Response.json({ error: "Estado sem integração disponível." }, { status: 404 });
      const format = p.get("format") ?? "fiscal";
      if (format === "manifest" || format === "fiscal") return Response.json(data, { headers });
      if (format !== "fiscal-csv") return Response.json({ error: "Somente a base fiscal está integrada nesta UF." }, { status: 400 });
      const year = Number(p.get("year"));
      const report = data.snapshots.find(item => item.year === year);
      if (!report) return Response.json({ error: "Informe um exercício disponível." }, { status: 400 });
      const head = ["uf", "ano", "bimestre", "codigo_funcao", "funcao", "dotacao_centavos", "empenhado_centavos", "liquidado_centavos", "fonte"];
      const rows = report.functions.map(row => [data.uf, report.year, report.period, row.code, row.name,
        row.updatedBudgetCents, row.committedCents, row.settledCents, report.functionSource.url]);
      const csv = [head, ...rows].map(row => row.map(safeCsvCell).join(";")).join("\r\n") + "\r\n";
      return new Response("\uFEFF" + csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="politica007-' + state.slug + '-fiscal-' + year + '.csv"' } });
    }
    const snapshot = getStateDashboard(estado);
    if (p.get("format") === "manifest") return Response.json(snapshot, { headers });
    const ledger = p.get("ledger") ?? "treasury";
    const year = Number(p.get("year") ?? Math.min(...snapshot.years));
    const available = getSnapshotYearMonths(snapshot, year);
    const treasuryEnd = snapshot.windows[String(year)]?.end;
    const defaultEnd = ledger === "treasury" && treasuryEnd ? Number(treasuryEnd.slice(5, 7)) : Math.max(0, ...available);
    const fromMonth = Number(p.get("fromMonth") ?? Math.min(...available));
    const toMonth = Number(p.get("toMonth") ?? defaultEnd);
    const category = p.get("category") ?? (ledger === "treasury" ? "publicity" : "all");
    const page = Number(p.get("page") ?? 1);
    if (!["treasury", "invoices", "companies", "pce"].includes(ledger) || !snapshot.years.includes(year) ||
        !Number.isInteger(fromMonth) || !Number.isInteger(toMonth) || !available.includes(fromMonth) || !available.includes(toMonth) || fromMonth > toMonth ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000 ||
        (category !== "all" && !Object.hasOwn(categoryLabels, category)) ||
        (p.has("format") && !["json", "csv", "insights"].includes(p.get("format")!))) {
      return Response.json({ error: "Confira os filtros de período e categoria; use os anos e meses disponíveis nesta versão." }, { status: 400 });
    }
    const query: EvidenceQuery = { ledger: ledger as LedgerId, year, category,
      from: `${year}-${String(fromMonth).padStart(2, "0")}-01`,
      to: `${year}-${String(toMonth).padStart(2, "0")}-${new Date(Date.UTC(year, toMonth, 0)).getUTCDate()}`,
      agency: (p.get("agency") ?? "").slice(0, 100), q: (p.get("q") ?? "").trim().slice(0, 160), page };
    const csv = p.get("format") === "csv";
    const insights = p.get("format") === "insights";
    const result = queryStateRecords(estado, query, csv || insights);
    if (insights) {
      const group = p.get("group") ?? "vehicle";
      if (!["vehicle", "medium", "campaign", "supplier"].includes(group)) return Response.json({ error: "Agrupamento inválido." }, { status: 400 });
      const groups = new Map<string, { name: string; amountCents: number; count: number }>();
      for (const row of result.rows) {
        const name = row[group as "vehicle" | "medium" | "campaign" | "supplier"] || "Não informado na fonte";
        const current = groups.get(name) ?? { name, amountCents: 0, count: 0 };
        current.amountCents = sumCents([current.amountCents, row.amountCents]); current.count++; groups.set(name, current);
      }
      return Response.json({ rows: [...groups.values()].sort((a, b) => b.amountCents - a.amountCents).slice(0, 12),
        total: result.amountCents, totalGroups: groups.size, recordCount: result.total }, { headers });
    }
    if (csv) return new Response(evidenceCsv(result), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="politica007-${state.slug}-${ledger}-${year}.csv"` } });
    return Response.json(result, { headers });
  } catch (error) {
    console.error("State accounts unavailable", error);
    return Response.json({ error: "A base está temporariamente indisponível. Tente novamente." }, { status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
