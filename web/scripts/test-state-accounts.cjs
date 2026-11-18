const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

function load(name) {
  const output = esbuild.buildSync({ entryPoints: [path.join(__dirname, `../src/lib/state-accounts/${name}.ts`)],
    bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
  const module = { exports: {} };
  new Function("module", "exports", "require", output)(module, module.exports, require);
  return module.exports;
}
const { STATES, getStateBySlug, getStateByUf } = load("registry");
const { parseBRLCents, parseDecimalCents, isISODate, validateFinancialRecord, filterRecords, deduplicateRecords,
  aggregateRecords, sumCents, groupRecords, compareRecords, safeCsvCell, buildCsv } = load("comparison");
const { getKnownAmount, getComparisonRatio } = load("availability");

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
function record(id, amountCents, category = "publicity", extra = {}) {
  return { id, uf: "GO", agencyId: category === "elective-surgeries" ? "ses" : "secom", category,
    stage: "paid", amountCents, date: "2025-02-14", periodStart: "2025-01-01", periodEnd: "2025-12-31",
    supplier: "Fornecedor oficial", description: "Pagamento identificado", sourceId: "goias-op-2025", sourceRow: 10,
    dedupKey: id, coverage: "partial", scope: "state-disbursement", financialNature: "direct-payment", ...extra };
}

test("national registry is unique and only Goiás can resolve to a published route", () => {
  assert.equal(STATES.length, 27);
  for (const key of ["uf", "slug", "ibgeCode"]) assert.equal(new Set(STATES.map(row => row[key])).size, 27);
  assert.deepEqual(STATES.filter(row => row.active).map(row => row.uf), ["GO"]);
  assert.equal(getStateBySlug("goias").ibgeCode, 52);
  assert.equal(getStateBySlug("sao-paulo"), null);
  assert.equal(getStateBySlug("sao-paulo", false).uf, "SP");
  assert.equal(getStateBySlug("__proto__"), null);
  assert.equal(getStateByUf("go").slug, "goias");
});

test("Brazilian money preserves cents and rejects malformed/ambiguous input", () => {
  for (const [input, cents] of [["R$ 1.234.567,89", 123456789], ["0,01", 1], ["1,2", 120], ["-1.000,35", -100035], ["12.345", 1234500], ["R$ 12,34", 1234], [1234.56, 123456], [0, 0]]) assert.equal(parseBRLCents(input), cents, String(input));
  for (const input of ["", "—", null, "12.34", "1,234", "1.23.456,78", "1e3", "NaN", Infinity, 1.005, "R$ 5 cinco", "R$ 90071992547409,92"]) assert.equal(parseBRLCents(input), null, String(input));
  assert.equal(parseDecimalCents("1234.56"), 123456);
  assert.equal(parseDecimalCents("1.234"), null);
  assert.equal(parseDecimalCents("90071992547409.91"), Number.MAX_SAFE_INTEGER);
});

test("calendar validation rejects rolled dates and financial events outside the declared coverage", () => {
  assert.equal(isISODate("2024-02-29"), true);
  for (const value of ["2025-02-29", "2025-04-31", "2025-13-01", "2025-1-01"]) assert.equal(isISODate(value), false);
  assert.ok(validateFinancialRecord(record("op1", 100, "publicity", { date: "2026-01-01" })).length);
  assert.ok(validateFinancialRecord(record("op1", 100, "publicity", { uf: "ZZ" })).length);
  assert.ok(validateFinancialRecord(record("op1", 0.5)).length);
});

test("exact totals include estornos and reject overflow", () => {
  assert.equal(sumCents([10001, 20002, -333]), 29670);
  assert.equal(sumCents([Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1]), 1);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1]), /precisão/);
  assert.throws(() => sumCents([1.1]), /centavos/);
});

test("same payment published twice counts once, but conflicting monetary versions stop aggregation", () => {
  const payment = record("op-17", 10000);
  const copy = { ...payment, id: "sheet-row-4", sourceId: "secom-sheet", sourceRow: 4 };
  assert.equal(aggregateRecords([payment, copy]).amountCents, 10000);
  assert.equal(deduplicateRecords([payment, copy]).duplicateCount, 1);
  assert.throws(() => aggregateRecords([payment, { ...copy, amountCents: 20000 }]), /divergentes/);
  const refund = record("op-17-estorno", -1000);
  assert.equal(aggregateRecords([payment, refund]).amountCents, 9000);
});

test("agency payment and vehicle detail never double the consolidated amount", () => {
  const agency = record("agency-op", 10000);
  const vehicle = record("vehicle-1", 8000, "publicity", { parentRecordId: "agency-op", consolidationRole: "breakdown" });
  const contract = record("contract", 80000, "publicity", { stage: "contracted", consolidationRole: "reference" });
  const result = aggregateRecords([agency, vehicle, contract]);
  assert.equal(result.amountCents, 10000);
  assert.equal(result.count, 1);
  assert.equal(result.excludedCount, 2);
});

test("partial identified disbursements compare to paid surgery transfers without relabeling their nature", () => {
  const left = [record("media-1", 15000)];
  const right = [record("surgery-1", 6000, "elective-surgeries", { financialNature: "transfer" })];
  const result = compareRecords(left, right);
  assert.equal(result.status, "partial");
  assert.equal(result.ratio, 2.5);
  assert.equal(result.differenceCents, 9000);
  assert.match(result.reasons.join(" "), /não representa o total/);
  assert.equal(right[0].financialNature, "transfer");
});

test("different stages, windows, accounting scopes and UFs block ratios", () => {
  for (const changes of [
    { stage: "contracted" },
    { periodEnd: "2025-10-31" },
    { scope: "state-company" },
    { uf: "SP" },
  ]) {
    const result = compareRecords([record("media", 10000)], [record("surgery", 5000, "elective-surgeries", changes)]);
    assert.equal(result.status, "incompatible", JSON.stringify(changes));
    assert.equal(result.ratio, null);
    assert.equal(result.differenceCents, null);
    assert.ok(result.reasons.length);
  }
});

test("no source rows is missing, while an explicit zero denominator does not yield infinity", () => {
  const missing = compareRecords([record("media", 10000)], []);
  assert.equal(missing.status, "missing");
  assert.equal(missing.rightCents, null);
  assert.equal(missing.ratio, null);
  const zero = compareRecords([record("media", 10000)], [record("surgery", 0, "elective-surgeries")]);
  assert.equal(zero.rightCents, 0);
  assert.equal(zero.ratio, null);
  assert.equal(zero.status, "incompatible");
});

test("dashboard amount and ratio guards distinguish missing records, documented zero, negative adjustments and invalid cents", () => {
  assert.equal(getKnownAmount([]), null);
  assert.equal(getKnownAmount([{ amountCents: 0 }]), 0);
  assert.equal(getKnownAmount([{ amountCents: 100 }, { amountCents: -100 }]), 0);
  assert.equal(getComparisonRatio(0, 200), 0);
  assert.equal(getComparisonRatio(500, 200), 2.5);
  for (const [left, right] of [[null, 200], [200, null], [200, 0], [-100, 200], [200, -100], [NaN, 200], [100.5, 200], [Number.MAX_SAFE_INTEGER + 1, 200]])
    assert.equal(getComparisonRatio(left, right), null);
  assert.throws(() => getKnownAmount([{ amountCents: Number.MAX_SAFE_INTEGER }, { amountCents: 1 }]), /precisão/);
});

test("overlapping categories cannot compare a payment with itself", () => {
  const payment = record("same-op", 10000);
  const result = compareRecords([payment], [{ ...payment, category: "health" }]);
  assert.equal(result.status, "incompatible");
  assert.equal(result.ratio, null);
  assert.match(result.reasons.join(" "), /mesmo documento/);
});

test("a monthly filter can narrow a source window but cannot upgrade partial coverage", () => {
  const context = { periodStart: "2025-02-01", periodEnd: "2025-02-28", stage: "paid", scope: "state-disbursement", coverage: "complete" };
  const result = compareRecords([record("media", 10000)], [record("surgery", 5000, "elective-surgeries")], { leftContext: context, rightContext: context });
  assert.equal(result.status, "partial");
  assert.equal(result.ratio, 2);
  assert.equal(result.leftContext.coverage, "partial");
  assert.equal(compareRecords([record("media", 10000)], [record("surgery", 5000, "elective-surgeries")],
    { leftContext: { ...context, periodStart: "2025-03-01", periodEnd: "2025-03-31" }, rightContext: context }).status, "incompatible");
});

test("filters are inclusive, accent-insensitive and respect UF, category, stage and agency", () => {
  const rows = [record("a", 500, "publicity", { description: "Serviços de comunicação" }),
    record("b", 900, "elective-surgeries", { date: "2025-03-01" })];
  assert.deepEqual(filterRecords(rows, { q: "comunicacao", from: "2025-02-14", to: "2025-02-14" }).map(row => row.id), ["a"]);
  assert.equal(filterRecords(rows, { agencyIds: ["ses"], categories: ["elective-surgeries"], stages: ["paid"], uf: "GO" }).length, 1);
  assert.equal(filterRecords(rows, { from: "2025-03-01", to: "2025-02-01" }).length, 0);
  assert.equal(filterRecords(rows, { from: "2025-02-31" }).length, 0);
  assert.deepEqual(groupRecords(rows, "agencyId").map(group => [group.key, group.amountCents]), [["ses", 900], ["secom", 500]]);
});

test("CSV preserves exact cents, source provenance and transfer nature, while neutralizing formulas", () => {
  assert.equal(safeCsvCell("=HYPERLINK(\"evil\")"), '"\'=HYPERLINK(""evil"")"');
  assert.equal(safeCsvCell("  +cmd"), '"\'  +cmd"');
  assert.equal(safeCsvCell(-123), "-123");
  const csv = buildCsv([record("op-export", 12345, "elective-surgeries", { supplier: "=1+1", financialNature: "transfer", description: "a;b\nlinha 2" })], [{ id: "goias-op-2025", url: "https://transparencia.go.gov.br/fonte.csv" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /;12345;/);
  assert.match(csv, /"transfer"/);
  assert.match(csv, /"paid"/);
  assert.match(csv, /transparencia\.go\.gov\.br\/fonte\.csv/);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"a;b\nlinha 2"/);
});

console.log(`State accounts: ${passed} financial invariants passed.`);
