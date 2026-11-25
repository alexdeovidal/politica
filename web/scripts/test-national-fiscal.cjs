const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");
const web = path.join(__dirname, "..");
process.chdir(web);
function load(name) {
  const output = esbuild.buildSync({ entryPoints: [path.join(web, "src/lib/state-accounts", name + ".ts")],
    bundle: true, format: "cjs", platform: "node", write: false, external: ["server-only"] }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function("module", "exports", "require", output)(mod, mod.exports, id => id === "server-only" ? {} : require(id));
  return mod.exports;
}
const { STATES, publishedStates, activeStates } = load("registry");
const { getNationalFiscal } = load("national-fiscal");
const { getSihProduction } = load("national-sih");
assert.equal(STATES.length, 27);
assert.equal(publishedStates().length, 27);
assert.deepEqual(activeStates().map(s => s.uf), ["GO"]);
for (const slug of ["goias", "../goias", "__proto__", "desconhecido", "DF"]) assert.equal(getNationalFiscal(slug), null);
let flagged = 0;
for (const state of STATES.filter(s => !s.active)) {
  const manifest = getNationalFiscal(state.slug);
  const production = getSihProduction(state.uf);
  assert.equal(production.group, "04");
  assert.equal(production.months.filter(r => r.month.startsWith("2025")).length, 12);
  assert.ok(production.months.filter(r => r.month.startsWith("2026")).length > 0);
  assert.equal(manifest.uf, state.uf);
  assert.deepEqual(manifest.snapshots.map(r => r.year).sort(), [2025, 2026]);
  assert.ok(manifest.snapshots.every(r => r.functions.some(f => f.code === "10")));
  assert.ok(manifest.snapshots.every(r => r.functions.every(f => f.paidCents === null)));
  flagged += manifest.snapshots.filter(r => Object.values(r.reconciliation)
    .some(line => line.differenceCents || line.breakdownDifferenceCents)).length;
}
assert.ok(flagged > 0, "conservar divergências em vez de alterar a fonte");
console.log("OK: 26 novos painéis fiscais, dois exercícios por UF; Goiás preservado. Divergências sinalizadas em " + flagged + " exercícios.");
