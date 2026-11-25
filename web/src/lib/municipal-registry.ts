import registry from "./municipal-registry.json";

export type Municipality = typeof registry[number];
export const municipalities: readonly Municipality[] = registry;
export const municipalHref = (city: Municipality) => city.existing
  ? `/contas-do-municipio/${city.slug}`
  : `/contas-do-municipio/${city.uf.toLowerCase()}/${city.slug}`;
export const findMunicipality = (uf: string, city: string) =>
  municipalities.find(item => !item.existing && item.uf.toLowerCase() === uf && item.slug === city);
