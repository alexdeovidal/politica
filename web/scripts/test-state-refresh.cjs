const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "politica-refresh-"));
const now = Date.now, originalError = console.error;
let time = now();
Date.now = () => time;
console.error = () => {};
process.env.STATE_ACCOUNTS_REFRESH_DIR = dir;
try {
  const { getNationalFiscal } = load("national-fiscal");
  const { getSihProduction } = load("national-sih");
  const original = getNationalFiscal("distrito-federal");
  const target = path.join(dir, "distrito-federal.json");
  const replacement = structuredClone(original);
  replacement.collectedAt = "2026-11-26T00:00:00Z";
  fs.writeFileSync(target, JSON.stringify(replacement));
  time += 61_000;
  assert.equal(getNationalFiscal("distrito-federal").collectedAt, replacement.collectedAt);
  fs.writeFileSync(target, JSON.stringify({...replacement, uf:"GO"}));
  time += 61_000;
  assert.equal(getNationalFiscal("distrito-federal").collectedAt, replacement.collectedAt);
  fs.writeFileSync(target, JSON.stringify({...replacement, snapshots:replacement.snapshots.slice(1)}));
  time += 61_000;
  assert.deepEqual(getNationalFiscal("distrito-federal").snapshots, replacement.snapshots);
  fs.unlinkSync(target);
  time += 61_000;
  assert.equal(getNationalFiscal("distrito-federal").collectedAt, replacement.collectedAt);

  const sih = getSihProduction("DF");
  const sihRaw = JSON.parse(fs.readFileSync("data/state-accounts/national-sih.json","utf8"));
  const sihPath = path.join(dir,"national-sih.json");
  sihRaw.collectedAt = "2026-11-26T00:00:00Z";
  fs.writeFileSync(sihPath, JSON.stringify(sihRaw));
  time += 61_000;
  assert.equal(getSihProduction("DF").collectedAt, sihRaw.collectedAt);
  sihRaw.byUf.DF.pop();
  fs.writeFileSync(sihPath, JSON.stringify(sihRaw));
  time += 61_000;
  assert.deepEqual(getSihProduction("DF").months, sih.months);
  assert.equal(getNationalFiscal("../../../etc/passwd"), null);
  console.log("OK: volume atualizado, versão anterior preservada em falha/regressão, fallback e caminhos controlados.");
} finally {
  Date.now = now;
  console.error = originalError;
  fs.rmSync(dir,{recursive:true,force:true});
}
