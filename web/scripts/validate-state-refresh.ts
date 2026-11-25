import { readFileSync } from "node:fs";
import { getStateBySlug } from "../src/lib/state-accounts/registry";
import { validateNationalFiscal } from "../src/lib/state-accounts/national-fiscal";
import { validateSih } from "../src/lib/state-accounts/national-sih";

const [name, file] = process.argv.slice(2);
if (!name || !file) throw new Error("Informe tipo e arquivo");
const state = getStateBySlug(name.replace(/\.json$/, ""), false);
const candidate: unknown = JSON.parse(readFileSync(file, "utf8"));
if (name === "national-sih.json") validateSih(candidate);
else if (state && name === state.slug + ".json") validateNationalFiscal(candidate, state);
else throw new Error("Identificador de snapshot desconhecido.");
