const text = value => typeof value === "string" ? value.trim() : "";
const fold = value => text(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const money = value => typeof value === "number" && Number.isSafeInteger(Math.round(value * 10000)) ? Math.round(value * 10000) : null;

export function parseTerm(row) {
  if (!Number.isSafeInteger(row?.sequencialTermoContrato) || row.sequencialTermoContrato < 1 || !text(row.tipoTermoContratoNome)) {
    throw new Error("Termo do PNCP sem sequência ou tipo");
  }
  const name = text(row.tipoTermoContratoNome);
  const changed = money(row.valorAcrescido);
  const flags = [row.qualificacaoAcrescimoSupressao, row.qualificacaoVigencia, row.qualificacaoReajuste, row.qualificacaoFornecedor];
  const numeric = flags[0] === true;
  const mixed = numeric && flags.slice(1).some(flag => flag === true);
  const aditivo = fold(name) === "termo aditivo";
  const complete = flags.every(flag => typeof flag === "boolean");
  const contractChange = aditivo && numeric && complete && !mixed && changed !== null && changed !== 0;
  const pending = numeric && !contractChange || aditivo && (
    !complete || !numeric && !flags.slice(1).some(Boolean) || mixed || (numeric && !changed)
  );
  return {
    seq: row.sequencialTermoContrato, number: text(row.numeroTermoContrato), name,
    signed: text(row.dataAssinatura), published: text(row.dataPublicacaoPncp),
    description: text(row.objetoTermoContrato).slice(0, 1800),
    legal: text(row.fundamentoLegal).slice(0, 600),
    changed, global: money(row.valorGlobal), days: Number.isSafeInteger(row.prazoAditadoDias) ? row.prazoAditadoDias : null,
    labels: ["Acréscimo ou supressão", "Vigência", "Reajuste", "Fornecedor"].filter((_, i) => flags[i] === true),
    direction: contractChange ? (changed > 0 ? "increase" : "decrease") : null,
    pending,
  };
}

export function analyzeTerms(contract, terms) {
  const base = money(contract.valorInicial);
  const object = fold(contract.objetoContrato);
  const reform = /\breforma\b|\breformas\b/.test(object);
  const increases = terms.reduce((sum, t) => sum + (t.direction === "increase" ? t.changed : 0), 0);
  const decreases = terms.reduce((sum, t) => sum + (t.direction === "decrease" ? -t.changed : 0), 0);
  const validBase = base !== null && base > 0;
  const increasesPct = validBase ? 100 * (increases / base) : null;
  const decreasesPct = validBase ? 100 * (decreases / base) : null;
  // Use integer cross multiplication to keep the exact 25% and 50% boundaries.
  const above25 = validBase && BigInt(increases) * 4n > BigInt(base);
  const above50 = validBase && BigInt(increases) * 2n > BigInt(base);
  const aboveDecrease = validBase && BigInt(decreases) * 4n > BigInt(base);
  // The text is a clue, not a legal classification of the original object.
  return {
    base: validBase ? base : null, increases, decreases, increasesPct, decreasesPct, reform,
    severity: aboveDecrease || above50 || (above25 && !reform) ? "review" : above25 ? "reform" : "none",
    above25, above50, aboveDecrease,
    pending: terms.filter(term => term.pending).length,
  };
}
