const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const esbuild = require("esbuild");

const webRoot = path.join(__dirname, "..");
process.chdir(webRoot);
const dataRoot = path.join(webRoot, "data/state-accounts/goias");
const compressed = fs.readFileSync(path.join(dataRoot, "records.json.gz"));
const raw = zlib.gunzipSync(compressed);
const records = JSON.parse(raw.toString("utf8"));
const summary = JSON.parse(fs.readFileSync(path.join(dataRoot, "summary.json"), "utf8"));

function load(name) {
  const output = esbuild.buildSync({ entryPoints: [path.join(webRoot, `src/lib/state-accounts/${name}.ts`)],
    bundle: true, format: "cjs", platform: "node", write: false, external: ["server-only"] }).outputFiles[0].text;
  const module = { exports: {} };
  new Function("module", "exports", "require", output)(module, module.exports, id => id === "server-only" ? {} : require(id));
  return module.exports;
}
const { isISODate, validateFinancialRecord, sumCents } = load("comparison");
const { queryStateRecords, evidenceCsv, getStateDashboard } = load("data");
const { assertDashboardSnapshot, assertEvidenceRecords } = load("validation");
const { getSnapshotYearMonths, getTreasuryMonths, getKnownAmount } = load("availability");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
const total = rows => sumCents(rows.map(row => row.amountCents));
const ledgerRows = name => records.filter(row => row.ledger === name);
function grouped(rows, key, values) {
  const out = new Map();
  for (const row of rows) {
    const id = key(row);
    const before = out.get(id) ?? Object.fromEntries(Object.keys(values(row)).map(k => [k, 0]));
    for (const [field, value] of Object.entries(values(row))) before[field] += value;
    out.set(id, before);
  }
  return [...out].sort((a, b) => a[0].localeCompare(b[0]));
}

test("both runtime files exist, gzip is readable, and the version identifies a Goiás snapshot", () => {
  assert.equal(compressed[0], 0x1f); assert.equal(compressed[1], 0x8b);
  assert.equal(summary.schemaVersion, 1); assert.equal(summary.uf, "GO");
  assert.ok(typeof summary.version === "string" && summary.version.length >= 6);
  assert.ok(summary.version.endsWith(crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12)), "summary and records must belong to the same content version");
  assert.ok(Number.isFinite(Date.parse(summary.collectedAt)));
  assert.ok(Array.isArray(records) && records.length > 0);
});

test("all records preserve safe cents, valid dates, document identity and a known source", () => {
  const sources = new Map(summary.sources.map(source => [source.id, source]));
  assert.equal(sources.size, summary.sources.length, "source ids must be unique");
  assert.equal(new Set(records.map(row => row.id)).size, records.length, "record ids must be unique");
  const monetary = ["amountCents", "grossCents", "netCents", "commissionCents"];
  const identity = new Set();
  for (const row of records) {
    assert.deepEqual(validateFinancialRecord(row), [], row.id);
    assert.equal(row.uf, "GO");
    assert.ok(sources.has(row.sourceId), `unknown source: ${row.id}`);
    assert.ok(String(row.sourceRow ?? "").length, `missing source row: ${row.id}`);
    assert.ok(row.date <= summary.collectedAt.slice(0, 10), `future payment: ${row.id}`);
    for (const field of monetary) if (row[field] != null) assert.ok(Number.isSafeInteger(row[field]), `${row.id}.${field}`);
    const key = JSON.stringify([row.ledger, row.uf, row.agencyId, row.stage, row.dedupKey]);
    assert.ok(!identity.has(key), `duplicate financial identity: ${row.id}`); identity.add(key);
  }
  for (const source of sources.values()) assert.equal(new URL(source.url).protocol, "https:");
});

test("the loader rejects inactive states and route traversal before reading a data file", () => {
  for (const slug of ["sao-paulo", "../goias", "goias/../../", "__proto__", "GO", "missing-state"])
    assert.throws(() => getStateDashboard(slug), /sem integração/);
  assert.equal(getStateDashboard("goias").uf, "GO");
});

test("manifest and ledger validation reject mismatched states, false precision and ambiguous document identity", () => {
  assert.doesNotThrow(() => assertDashboardSnapshot(summary, "GO"));
  assert.throws(() => assertDashboardSnapshot(summary, "SP"), /UF divergente/);
  const duplicateYear = structuredClone(summary); duplicateYear.years.push(duplicateYear.years[0]);
  assert.throws(() => assertDashboardSnapshot(duplicateYear, "GO"), /anos inválidos/);
  const badWindow = structuredClone(summary); badWindow.windows[String(badWindow.years[0])].end = "2025-02-31";
  assert.throws(() => assertDashboardSnapshot(badWindow, "GO"), /janela temporal/);
  const row = records.find(row => row.ledger === "treasury" && row.paymentOrder);
  assert.ok(row);
  for (const changes of [{ uf: "SP" }, { sourceId: "unknown" }, { amountCents: 0.001 }, { ledger: "invoices" }, { consolidationRole: "reference" }])
    assert.throws(() => assertEvidenceRecords([{ ...row, ...changes }], summary), /Snapshot estadual inválido/);
  // A copy with a new display id and dedup key must still not double one official OP.
  assert.throws(() => assertEvidenceRecords([row, { ...row, id: `${row.id}-copy`, dedupKey: `${row.dedupKey}-copy` }], summary), /ordem de pagamento/);
  const audit = JSON.parse(fs.readFileSync(path.join(dataRoot, "audit.json"), "utf8"));
  assert.equal(audit.recordsSha256, crypto.createHash("sha256").update(raw).digest("hex"));
});

test("available years and months come from the snapshot, and explicit zero slices remain known", () => {
  assert.ok(getSnapshotYearMonths(summary, 2026).includes(11));
  assert.equal(getTreasuryMonths(summary, 2026).at(-1), 10);
  assert.deepEqual(getSnapshotYearMonths(summary, 2099), []);
  const future = { ...summary, years: [2030], windows: { 2030: { start: "2030-03-01", end: "2030-04-30", months: ["2030-03", "2030-04"] } },
    monthly: [], invoiceMonthly: [], companyMonthly: [], surgery: { ...summary.surgery, monthly: [] } };
  assert.deepEqual(getSnapshotYearMonths(future, 2030), [3, 4]);
  const zero = queryStateRecords("goias", { ledger: "treasury", year: 2026, from: "2026-05-01", to: "2026-05-31", category: "legal-publicity", agency: "2601", q: "", page: 1 }, true);
  assert.ok(zero.rows.length > 0); assert.equal(getKnownAmount(zero.rows), 0);
  assert.equal(getKnownAmount(queryStateRecords("goias", { ledger: "treasury", year: 2026, from: "2026-05-01", to: "2026-05-31", category: "legal-publicity", agency: "missing", q: "", page: 1 }, true).rows), null);
});

test("monthly treasury totals and counts reconcile to every original classified record", () => {
  const rows = ledgerRows("treasury");
  assert.equal(rows.length, summary.selectedPayments);
  for (const row of rows) {
    assert.equal(row.stage, "paid"); assert.equal(row.scope, "state-disbursement");
    assert.equal(row.coverage, "partial");
    assert.ok(!row.consolidationRole || row.consolidationRole === "primary");
  }
  const key = row => JSON.stringify([row.month ?? row.date.slice(0, 7), row.agencyId, row.agency, row.category, row.financialNature ?? "direct-payment"]);
  // The UI labels this count as "ordens com valor"; zero-value rows remain in the evidence table.
  const expected = grouped(rows, key, row => ({ amountCents: row.amountCents, count: Number(row.amountCents !== 0) }));
  const actual = summary.monthly.map(row => [key(row), { amountCents: row.amountCents, count: row.count }]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(actual, expected);
  assert.equal(total(rows), sumCents(summary.monthly.map(row => row.amountCents)));
});

test("agency invoices preserve gross and valid net sums without being added to treasury", () => {
  const rows = ledgerRows("invoices");
  assert.equal(rows.length, summary.agencyInvoices);
  const key = row => JSON.stringify([row.month ?? row.date.slice(0, 7), row.agency]);
  for (const row of rows) {
    assert.equal(row.scope, "paid-invoice-face-value"); assert.equal(row.consolidationRole, "reference");
    assert.equal(row.amountCents, row.grossCents);
  }
  const expected = grouped(rows, key, row => ({ count: 1, grossCents: row.grossCents, netCents: row.netCents ?? 0, invalidNetCount: row.netCents == null ? 1 : 0 }));
  const actual = summary.invoiceMonthly.map(row => [key(row), { count: row.count, grossCents: row.grossCents, netCents: row.netCents, invalidNetCount: row.invalidNetCount }]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(actual, expected);
});

test("state-company amounts reconcile separately from state-budget disbursements", () => {
  const rows = ledgerRows("companies");
  const key = row => JSON.stringify([row.month ?? row.date.slice(0, 7), row.agencyId, row.agency, row.category, row.financialNature ?? "direct-payment"]);
  for (const row of rows) assert.equal(row.scope, "state-company");
  const expected = grouped(rows, key, row => ({ amountCents: row.amountCents, count: Number(row.amountCents !== 0) }));
  const actual = summary.companyMonthly.map(row => [key(row), { amountCents: row.amountCents, count: row.count }]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(actual, expected);
});

test("PCE detail is marked as reference and reconciles to its own annual source total", () => {
  const rows = ledgerRows("pce");
  for (const row of rows) {
    assert.equal(row.consolidationRole, "reference"); assert.equal(row.scope, "pce-transfer-detail");
    assert.equal(row.financialNature, "transfer");
  }
  for (const year of summary.years) {
    const selected = rows.filter(row => row.date.startsWith(String(year)));
    const annual = summary.surgery.pceAnnual.find(row => row.year === year);
    if (selected.length) { assert.ok(annual); assert.equal(total(selected), annual.amountCents); assert.equal(selected.length, annual.transactions); }
    else assert.ok(!annual || annual.transactions === 0);
  }
  const details2025 = rows.filter(row => row.date.startsWith("2025"));
  const commitments = new Set(details2025.map(row => row.commitment.replace(/\D/g, "")));
  const central2025 = ledgerRows("treasury").filter(row => row.date.startsWith("2025") && commitments.has((row.commitment ?? "").replace(/\D/g, "")));
  assert.equal(central2025.length, 2, "the interface's two-OP reconciliation must remain true");
  assert.ok(central2025.every(row => row.category === "elective-surgeries"));
  assert.equal(total(central2025), total(details2025), "PCE detail must reconcile to the same commitment in treasury, not an additional expense");
});

test("fiscal function sums reconcile to totals and unavailable paid/function cells stay null", () => {
  for (const report of summary.fiscal) {
    assert.ok(isISODate(report.periodStart) && isISODate(report.periodEnd));
    assert.equal(new Set(report.functions.map(row => row.code)).size, report.functions.length);
    for (const metric of ["committedCents", "settledCents", "updatedBudgetCents"]) {
      const values = report.functions.map(row => row[metric]).filter(value => value !== null);
      assert.equal(sumCents(values), report.totals[metric], `${report.year}/${metric}`);
    }
    for (const row of report.functions) assert.equal(row.paidCents, null);
    const reserve = report.functions.find(row => row.code === "99");
    assert.equal(reserve?.committedCents, null); assert.equal(reserve?.settledCents, null);
  }
});

test("procedure counts are separately consistent across month, annual and specialty tables", () => {
  for (const annual of summary.surgery.annual) {
    const months = summary.surgery.monthly.filter(row => row.month.startsWith(String(annual.year)));
    assert.equal(months.reduce((sum, row) => sum + row.procedures, 0), annual.procedures);
    assert.equal(annual.specialties.reduce((sum, row) => sum + row.procedures, 0), annual.procedures);
    assert.ok(months.every(row => Number.isSafeInteger(row.procedures) && row.procedures >= 0));
    if (months.some(row => row.partial) || months.length < 12) assert.equal(annual.partial, true);
  }
});

test("the runtime query respects the requested ledger, year, window and pagination", () => {
  const base = { ledger: "treasury", year: 2025, from: "2025-01-01", to: "2025-12-31", category: "publicity", agency: "", q: "", page: 1 };
  const result = queryStateRecords("goias", base);
  const monthly = summary.monthly.filter(row => row.month.startsWith("2025") && ["institutional-publicity", "legal-publicity"].includes(row.category));
  assert.equal(result.amountCents, sumCents(monthly.map(row => row.amountCents)));
  const zeroRows = ledgerRows("treasury").filter(row => row.date.startsWith("2025") && row.amountCents === 0 && ["institutional-publicity", "legal-publicity"].includes(row.category));
  assert.equal(result.total, monthly.reduce((sum, row) => sum + row.count, 0) + zeroRows.length);
  assert.equal(result.rows.length, 25);
  const next = queryStateRecords("goias", { ...base, page: 2 });
  assert.ok(next.rows.every(row => !result.rows.some(previous => previous.id === row.id)));
  const narrowed = queryStateRecords("goias", { ...base, year: 2026, from: "2026-01-01", to: "2026-01-31", category: "elective-surgeries" }, true);
  assert.ok(narrowed.rows.every(row => row.date.startsWith("2026-01") && row.category === "elective-surgeries" && row.ledger === "treasury"));
  const absent = queryStateRecords("goias", { ...base, agency: "not-an-agency" });
  assert.equal(absent.total, 0); assert.equal(absent.rows.length, 0);
});

test("CSV uses the complete filtered result and retains a source for each row", () => {
  const result = queryStateRecords("goias", { ledger: "pce", year: 2025, from: "2025-01-01", to: "2025-12-31", category: "elective-surgeries", agency: "", q: "", page: 1 }, true);
  const csv = evidenceCsv(result);
  assert.ok(csv.startsWith("\uFEFF"));
  for (const row of result.rows) {
    assert.ok(csv.includes(`"${row.id}"`)); assert.ok(csv.includes(`;${row.amountCents};`));
    const source = result.sources.find(source => source.id === row.sourceId);
    assert.ok(source && csv.includes(source.url));
  }
});

async function checkApi() {
  const output = esbuild.buildSync({ entryPoints: [path.join(webRoot, "src/app/api/contas-do-estado/[estado]/route.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, external: ["server-only"] }).outputFiles[0].text;
  const module = { exports: {} };
  new Function("module", "exports", "require", output)(module, module.exports, id => id === "server-only" ? {} : require(id));
  const get = (slug, query) => module.exports.GET(new Request(`https://example.test/api/contas-do-estado/${slug}?${query}`), { params: Promise.resolve({ estado: slug }) });
  for (const slug of ["sao-paulo", "not-a-state", "../goias"]) assert.equal((await get(slug, "")).status, 404);
  for (const query of ["year=2099", "year=2026&fromMonth=1&toMonth=12", "year=2025&fromMonth=0", "year=2025&fromMonth=4&toMonth=3", "year=2025&page=1.5", "ledger=invalid", "category=invalid"])
    assert.equal((await get("goias", query)).status, 400, query);
  const manifest = await get("goias", "format=manifest");
  assert.equal(manifest.status, 200); assert.equal((await manifest.json()).version, summary.version);
  const response = await get("goias", "year=2026&fromMonth=5&toMonth=5&agency=2601&category=legal-publicity");
  assert.equal(response.status, 200);
  const zero = await response.json(); assert.ok(zero.total > 0); assert.equal(zero.amountCents, 0);
  passed++; console.log(`ok ${passed} - API rejects invalid states, years and periods while preserving documented zero`);
  console.log(`State snapshot: ${passed} invariants passed; ${records.length} records, ${compressed.length} compressed bytes, ${raw.length} JSON bytes.`);
}
checkApi().catch(error => { console.error(error); process.exitCode = 1; });
