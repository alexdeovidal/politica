import snapshot from "./per-capita-2025.json";

export type Entity = {
  scope: "state" | "city"; code: string; uf: string; name: string; href: string; population: number;
  educationSubfunctions?: Record<string, number | undefined>; totalCents: number; functions: Record<string, number | undefined> & { Saúde: number; Educação: number }; reconciliationCents: number; source: string; sourceSha256: string;
};
const entities: Entity[] = snapshot.entities.map(row => {
  if (row.scope !== "state" && row.scope !== "city") throw new Error("Recorte do piloto inválido");
  return { ...row, scope: row.scope };
});
export const fiscalPilot = { ...snapshot, entities };
export const rankingPath = "/gasto-por-morador";
export const educationPilot: Record<string, { enrollment: number; network: string; source: string }> = {
  "52": { enrollment: 524994, network: "Rede estadual de Goiás", source: "https://pee.goias.gov.br/diagnostico/base-dados/?indicator=ED_BASICA_MATRICULAS&dependency=Estadual" },
  "5204508": { enrollment: 11212, network: "Rede municipal de Caldas Novas", source: "https://pee.goias.gov.br/diagnostico/base-dados/?indicator=ED_BASICA_MATRICULAS&municipality=5204508&dependency=Municipal" },
};
export const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const number = new Intl.NumberFormat("pt-BR");
export const reais = (cents: number) => currency.format(cents / 100);
export const pilotEntity = (code: string) => fiscalPilot.entities.find(row => row.code === code)!;
export const resourceAmount = (entity: Entity, area: string) =>
  area === "Total" ? entity.totalCents : entity.functions[area] ?? null;

export function ranked(entities: Entity[], scope: Entity["scope"], area: string) {
  const rows = entities.filter(entity => entity.scope === scope && resourceAmount(entity, area) !== null)
    .map(entity => ({ entity, amount: resourceAmount(entity, area)! }));
  rows.sort((a,b) => {
    const left = BigInt(a.amount) * BigInt(b.entity.population);
    const right = BigInt(b.amount) * BigInt(a.entity.population);
    return left === right ? a.entity.name.localeCompare(b.entity.name, "pt-BR") : left > right ? -1 : 1;
  });
  return rows;
}
