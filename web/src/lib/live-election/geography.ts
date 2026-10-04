import type {ElectionSelection, Municipality} from "./model";

export type Point = [number, number];
export type Bounds = [number, number, number, number];
export type MapShape = {code: string; name?: string; d: string; bounds: Bounds; point: Point};
export type MapFile = {source: string; date: string; shapes: MapShape[]};
export type ExteriorCity = {code: string; name: string; country: string; countryName: string; point: Point; geonamesId: string};
export type ExteriorFile = {source: string; tseSource: string; date: string; cities: ExteriorCity[]};
export type LocatedShape = MapShape & {municipality: Municipality};

export function municipalityShapes(shapes: MapShape[], municipalities: Municipality[]): LocatedShape[] {
  // EA12 supplies the IBGE code. Never guess an electoral city from a name.
  const byIbge = new Map(municipalities.filter(city => city.ibgeCode).map(city => [city.ibgeCode, city]));
  return shapes.flatMap(shape => {
    const municipality = byIbge.get(shape.code);
    return municipality ? [{...shape, municipality}] : [];
  });
}
export function combinedBounds(shapes: {bounds: Bounds}[]): Bounds {
  if (!shapes.length) return [-180, -84, 180, 60];
  return shapes.reduce<Bounds>((box, shape) => [Math.min(box[0], shape.bounds[0]), Math.min(box[1], shape.bounds[1]), Math.max(box[2], shape.bounds[2]), Math.max(box[3], shape.bounds[3])], [...shapes[0].bounds]);
}
export function paddedBox(bounds: Bounds, minimum = .08): Bounds {
  const width = Math.max(minimum, bounds[2] - bounds[0]), height = Math.max(minimum, bounds[3] - bounds[1]);
  const padding = Math.max(width, height) * .10;
  return [(bounds[0] + bounds[2] - width) / 2 - padding, (bounds[1] + bounds[3] - height) / 2 - padding, width + padding * 2, height + padding * 2];
}
export function changeElectionSelection(current: ElectionSelection, change: Partial<ElectionSelection>): ElectionSelection {
  const next = {...current, ...change};
  if (change.state !== undefined && change.state !== current.state) {
    next.municipality = change.municipality ?? "";
    next.zone = change.zone ?? "";
    if (next.state === "zz") next.office = "1";
    else if (next.office === "8" && next.state !== "df") next.office = "7";
    else if (next.office === "7" && next.state === "df") next.office = "8";
    else if (next.office === "25") next.office = "1";
  }
  if (change.municipality !== undefined && change.municipality !== current.municipality) next.zone = change.zone ?? "";
  if (next.office === "25" && (!next.municipality || change.municipality !== undefined && next.municipality !== current.municipality)) next.office = "1";
  return next;
}
