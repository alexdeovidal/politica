import type { StateDefinition } from "./types";

/** Registry is national; active means a published integration, never merely a known UF. */
export const STATES: readonly StateDefinition[] = [
  { uf: "AC", ibgeCode: 12, slug: "acre", name: "Acre", active: false },
  { uf: "AL", ibgeCode: 27, slug: "alagoas", name: "Alagoas", active: false },
  { uf: "AP", ibgeCode: 16, slug: "amapa", name: "Amapá", active: false },
  { uf: "AM", ibgeCode: 13, slug: "amazonas", name: "Amazonas", active: false },
  { uf: "BA", ibgeCode: 29, slug: "bahia", name: "Bahia", active: false },
  { uf: "CE", ibgeCode: 23, slug: "ceara", name: "Ceará", active: false },
  { uf: "DF", ibgeCode: 53, slug: "distrito-federal", name: "Distrito Federal", active: false },
  { uf: "ES", ibgeCode: 32, slug: "espirito-santo", name: "Espírito Santo", active: false },
  { uf: "GO", ibgeCode: 52, slug: "goias", name: "Goiás", active: true },
  { uf: "MA", ibgeCode: 21, slug: "maranhao", name: "Maranhão", active: false },
  { uf: "MT", ibgeCode: 51, slug: "mato-grosso", name: "Mato Grosso", active: false },
  { uf: "MS", ibgeCode: 50, slug: "mato-grosso-do-sul", name: "Mato Grosso do Sul", active: false },
  { uf: "MG", ibgeCode: 31, slug: "minas-gerais", name: "Minas Gerais", active: false },
  { uf: "PA", ibgeCode: 15, slug: "para", name: "Pará", active: false },
  { uf: "PB", ibgeCode: 25, slug: "paraiba", name: "Paraíba", active: false },
  { uf: "PR", ibgeCode: 41, slug: "parana", name: "Paraná", active: false },
  { uf: "PE", ibgeCode: 26, slug: "pernambuco", name: "Pernambuco", active: false },
  { uf: "PI", ibgeCode: 22, slug: "piaui", name: "Piauí", active: false },
  { uf: "RJ", ibgeCode: 33, slug: "rio-de-janeiro", name: "Rio de Janeiro", active: false },
  { uf: "RN", ibgeCode: 24, slug: "rio-grande-do-norte", name: "Rio Grande do Norte", active: false },
  { uf: "RS", ibgeCode: 43, slug: "rio-grande-do-sul", name: "Rio Grande do Sul", active: false },
  { uf: "RO", ibgeCode: 11, slug: "rondonia", name: "Rondônia", active: false },
  { uf: "RR", ibgeCode: 14, slug: "roraima", name: "Roraima", active: false },
  { uf: "SC", ibgeCode: 42, slug: "santa-catarina", name: "Santa Catarina", active: false },
  { uf: "SP", ibgeCode: 35, slug: "sao-paulo", name: "São Paulo", active: false },
  { uf: "SE", ibgeCode: 28, slug: "sergipe", name: "Sergipe", active: false },
  { uf: "TO", ibgeCode: 17, slug: "tocantins", name: "Tocantins", active: false },
];

/** Route handlers should retain the default to return 404 for planned states. */
export function getStateBySlug(slug: string, activeOnly = true): StateDefinition | null {
  return STATES.find(state => state.slug === slug && (!activeOnly || state.active)) ?? null;
}

export function getStateByUf(uf: string): StateDefinition | null {
  return STATES.find(state => state.uf === uf.toUpperCase()) ?? null;
}

export const activeStates = () => STATES.filter(state => state.active);
