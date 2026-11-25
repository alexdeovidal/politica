import { readFileSync } from "node:fs";
import { getStateBySlug } from "../src/lib/state-accounts/registry";
import { validateNationalFiscal } from "../src/lib/state-accounts/national-fiscal";
import { allMunicipalities } from "../src/lib/municipal-catalog-server";
import { validateMunicipalFiscal, validateMunicipalProcurement } from "../src/lib/municipal-live";
import { validateSih } from "../src/lib/state-accounts/national-sih";

const [name, file] = process.argv.slice(2);
if (!name || !file) throw new Error("Informe tipo e arquivo");
const state = getStateBySlug(name.replace(/\.json$/, ""), false);
const candidate: unknown = JSON.parse(readFileSync(file, "utf8"));
if (name === "national-sih.json") validateSih(candidate);
else if (state && name === state.slug + ".json") validateNationalFiscal(candidate, state);
else {
  const match = /^(\d{7})-(fiscal|contracts)\.json$/.exec(name);
  const city = allMunicipalities().find(item => !item.existing && item.code === match?.[1]);
  if (!match || !city) throw new Error("Identificador de snapshot desconhecido.");
  if (match[2] === "fiscal") validateMunicipalFiscal(candidate, city);
  else validateMunicipalProcurement(candidate, city);
}
