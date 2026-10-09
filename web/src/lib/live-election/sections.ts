import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {findElection, list, object, str, validateSelection, type ElectionSelection, type LiveCandidate} from "./model";
import {cleanupLiveSectionCache, getLiveConfig, getLiveResult, officialBinaryFile, officialJsonFile, SourceUnavailable} from "./service";

const SECTION_PAGE_SIZE = 3;
const SECTION_REFRESH_MS = 60000;
const LOCATION_SOURCE = "https://dadosabertos.tse.jus.br/dataset/eleitorado-2026/resource/300626b4-2b24-4d2e-b4fc-46b569cfffe5";
type Json = Record<string, unknown>;
type PollingSection = {zone: string; number: string; merged: string[]; date: string; time: string};
export type LiveSectionVote = {
  zone: string;
  number: string;
  mergedSections: string[];
  localCode: string | null;
  localName: string | null;
  address: string | null;
  votes: number | null;
  status: "totalized" | "waiting" | "unavailable";
  buGeneratedAt: string | null;
  sourceUrl: string | null;
  checkedAt: string;
};
export type LiveSectionVotePage = {
  electionYear: number;
  candidate: Pick<LiveCandidate, "id" | "name" | "number" | "party" | "partyNumber">;
  selection: ElectionSelection;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  checkedAt: string;
  refreshSeconds: number;
  locationSource: string;
  rows: LiveSectionVote[];
};

type BerNode = {cls: number; tag: number; constructed: boolean; value: Buffer; children: BerNode[]};
type BerBudget = {nodes: number};

function parseBerNode(bytes: Buffer, cursor: {offset: number}, budget: BerBudget, depth = 0): BerNode {
  if (depth > 32 || ++budget.nodes > 250000 || cursor.offset + 2 > bytes.length) throw new Error("Boletim inválido.");
  const first = bytes[cursor.offset++], cls = first >> 6, constructed = Boolean(first & 0x20);
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let count = 0, octet: number;
    do {
      if (cursor.offset >= bytes.length || ++count > 5) throw new Error("Boletim inválido.");
      octet = bytes[cursor.offset++];
      tag = (tag << 7) | (octet & 0x7f);
    } while (octet & 0x80);
  }
  const firstLength = bytes[cursor.offset++];
  let length: number;
  if (firstLength < 0x80) length = firstLength;
  else {
    const octets = firstLength & 0x7f;
    if (octets === 0 || octets > 4 || cursor.offset + octets > bytes.length) throw new Error("Boletim inválido.");
    length = 0;
    for (let index = 0; index < octets; index++) length = (length * 256) + bytes[cursor.offset++];
  }
  const end = cursor.offset + length;
  if (end > bytes.length) throw new Error("Boletim incompleto.");
  const value = bytes.subarray(cursor.offset, end), children: BerNode[] = [];
  if (constructed) {
    while (cursor.offset < end) children.push(parseBerNode(bytes, cursor, budget, depth + 1));
    if (cursor.offset !== end) throw new Error("Boletim incompleto.");
  } else cursor.offset = end;
  return {cls, tag, constructed, value, children};
}

function parseBer(bytes: Buffer): BerNode {
  const cursor = {offset: 0}, root = parseBerNode(bytes, cursor, {nodes: 0});
  if (cursor.offset !== bytes.length) throw new Error("Boletim com conteúdo excedente.");
  return root;
}
function integer(node: BerNode | undefined): number | null {
  if (!node || node.constructed || ![0, 2].includes(node.cls) || ![2, 10].includes(node.tag) || !node.value.length || node.value.length > 6) return null;
  const result = Number.parseInt(node.value.toString("hex"), 16);
  return Number.isSafeInteger(result) ? result : null;
}
function contextInteger(node: BerNode | undefined, tag: number): number | null {
  return node?.cls === 2 && node.tag === tag ? integer({...node, cls: 0, tag: 2}) : null;
}
function enumValue(node: BerNode | undefined) {
  return node?.cls === 0 && node.tag === 10 && node.value.length === 1 ? node.value[0] : null;
}
function formatSection(value: unknown) {
  const text = str(value);
  return /^\d{1,4}$/.test(text) ? text.padStart(4, "0") : "";
}
function parseSections(value: unknown, state: string, municipality: string, zone: string): PollingSection[] {
  const root = object(value);
  if (root.f !== "o") throw new Error("Configuração de seções inválida.");
  const area = list(root.abr).find(item => str(item.cd).toLowerCase() === state);
  const city = list(area?.mu).find(item => str(item.cd).padStart(5, "0") === municipality);
  const pollingZones = list(city?.zon)
    .map(pollingZone => ({pollingZone, zone: formatSection(pollingZone.cd)}))
    .filter(item => item.zone && (!zone || item.zone === zone));
  if (!area || !city || !pollingZones.length) throw new Error(zone ? "A zona eleitoral não existe na configuração oficial." : "O município não tem zonas eleitorais na configuração oficial.");
  const rows = pollingZones.flatMap(({pollingZone, zone: pollingZoneCode}) => list(pollingZone.sec).flatMap(item => {
    if (str(item.nsp)) return [];
    const number = formatSection(item.ns);
    if (!number) return [];
    const merged = Array.isArray(item.nsa) ? item.nsa.map(formatSection).filter(Boolean) : [];
    return [{zone: pollingZoneCode, number, merged, date: str(item.da), time: str(item.ha)}];
  }));
  return rows.sort((a, b) => a.zone.localeCompare(b.zone) || a.number.localeCompare(b.number));
}

function sectionConfigUrl(cycle: string, pleito: string, state: string) {
  return `https://resultados.tse.jus.br/oficial/${cycle}/arquivo-urna/${pleito}/config/${state}/${state}-p${pleito.padStart(6, "0")}-cs.json`;
}
function sectionAuxUrl(cycle: string, pleito: string, state: string, municipality: string, zone: string, section: string) {
  const file = `p${pleito.padStart(6, "0")}-${state}-m${municipality}-z${zone}-s${section}-aux.json`;
  return `https://resultados.tse.jus.br/oficial/${cycle}/arquivo-urna/${pleito}/dados/${state}/${municipality}/${zone}/${section}/${file}`;
}
function buTime(date: unknown, time: unknown) {
  const d = str(date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/), t = str(time).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59 || Number(t[3]) > 59) return null;
  return `${d[3]}-${d[2]}-${d[1]}T${t[1]}:${t[2]}:${t[3]}-03:00`;
}
function timestampOrder(date: unknown, time: unknown) {
  const parsed = buTime(date, time);
  return parsed ? Date.parse(parsed) : 0;
}
function availableBu(hash: Json | undefined) {
  if (!hash || str(hash.st) !== "Totalizado" || !/^[A-Za-z0-9+/_=-]{12,200}$/.test(str(hash.hash))) return null;
  const bu = list(hash.arq).find(item => item.tp === "bu" && /^[A-Za-z0-9_.-]{1,180}$/.test(str(item.nm)));
  return bu ? {hash: str(hash.hash), filename: str(bu.nm), date: hash.dr, time: hash.hr} : null;
}

function decodeCandidateVotes(
  bytes: Buffer,
  expected: {municipality: string; zone: string; section: string; electionCode: string; office: string; party: string; number: string},
) {
  const outer = parseBer(bytes), outerFields = outer.children;
  if (outer.cls !== 0 || outer.tag !== 16 || !outer.constructed || enumValue(outerFields[1]) !== 2 || outerFields[4]?.cls !== 0 || outerFields[4]?.tag !== 4) throw new Error("Boletim oficial não validado.");
  const inner = parseBer(outerFields[4].value), fields = inner.children;
  if (inner.cls !== 0 || inner.tag !== 16 || enumValue(fields[1]) !== 2) throw new Error("Boletim ainda não oficial.");
  const identity = fields[3], identityFields = identity?.children || [], cityZone = identityFields[0]?.children || [];
  const municipality = integer(cityZone[0]), zone = integer(cityZone[1]), section = integer(identityFields[2]);
  if (String(municipality).padStart(5, "0") !== expected.municipality || String(zone).padStart(4, "0") !== expected.zone || String(section).padStart(4, "0") !== expected.section) throw new Error("A seção do boletim não corresponde ao local consultado.");
  const electionRows = fields[8]?.children || [];
  const election = electionRows.find(item => String(integer(item.children[0])) === expected.electionCode);
  if (!election || election.children[4]?.cls !== 0 || election.children[4]?.tag !== 16) throw new Error("Boletim sem votação deste pleito.");
  const sectionGroups = election.children[4].children;
  let matched = false, total = 0;
  for (const group of sectionGroups) {
    const offices = group.children[2]?.children || [];
    for (const officeResult of offices) {
      if (contextInteger(officeResult.children[0], 1) !== Number(expected.office)) continue;
      for (const voteRow of officeResult.children[2]?.children || []) {
        const parts = voteRow.children;
        const type = contextInteger(parts[0], 1), votes = contextInteger(parts[1], 2), identity = parts[2];
        if (type === null || votes === null || identity?.cls !== 2 || identity.tag !== 3 || !identity.constructed) continue;
        const identifiers = identity.children, party = integer(identifiers[0]), number = integer(identifiers[1]);
        if (String(party) !== expected.party || String(number) !== expected.number) continue;
        matched = true;
        if (type === 1) total += votes;
      }
    }
  }
  return matched ? total : 0;
}

let locations: Map<string, [string, string]> | null = null;
function pollingLocations() {
  if (locations) return locations;
  const asset = join(process.cwd(), "public", "data", "tse-election-locations-2026.json.gz");
  const payload = JSON.parse(gunzipSync(readFileSync(asset)).toString("utf8")) as {locations?: Record<string, [string, string]>};
  if (!payload.locations || Object.keys(payload.locations).length < 50000) throw new Error("Cadastro de locais eleitorais inválido.");
  locations = new Map(Object.entries(payload.locations));
  return locations;
}

function pollingPlace(state: string, municipality: string, zone: string, localCode: string | null) {
  if (!localCode || !/^\d{1,5}$/.test(localCode)) return {name: null, address: null};
  const values = pollingLocations().get(`${state}:${municipality}:${zone}:${String(Number(localCode))}`);
  return {name: values?.[0] || null, address: values?.[1] || null};
}

async function sectionVote(
  election: {cycle: string; pleito: string; code: string},
  selection: ElectionSelection,
  section: PollingSection,
  candidate: LiveCandidate,
): Promise<LiveSectionVote> {
  const sectionSelection = {...selection, zone: section.zone};
  const checkedAt = new Date().toISOString(), baseRow = {
    zone: section.zone,
    number: section.number,
    mergedSections: section.merged,
  };
  const auxUrl = sectionAuxUrl(election.cycle, election.pleito, selection.state, selection.municipality, section.zone, section.number);
  const pendingRow = (status: LiveSectionVote["status"], localCode: string | null = null, sourceUrl: string | null = auxUrl): LiveSectionVote => {
    const place = pollingPlace(selection.state, selection.municipality, section.zone, localCode);
    return {...baseRow, localCode, localName: place.name, address: place.address, votes: null, status, buGeneratedAt: null, sourceUrl, checkedAt};
  };
  if (!section.date || !section.time) return pendingRow("waiting");
  let aux: Json;
  try {
    const file = await officialJsonFile(auxUrl, SECTION_REFRESH_MS, value => {
      const root = object(value);
      if (root.f !== "o" || !Array.isArray(root.hashes)) throw new Error("Boletim auxiliar inválido.");
      return value;
    });
    aux = object(file.data);
  } catch (error) {
    if (error instanceof SourceUnavailable && ["not-published", "connection", "upstream", "rate-limit", "busy"].includes(error.kind)) return pendingRow("waiting", null, auxUrl);
    return pendingRow("unavailable");
  }
  const selectedHash = list(aux.hashes)
    .filter(item => availableBu(item))
    .sort((a, b) => timestampOrder(b.dr, b.hr) - timestampOrder(a.dr, a.hr))[0];
  const bu = availableBu(selectedHash);
  if (!bu) return pendingRow("waiting");
  const buUrl = `https://resultados.tse.jus.br/oficial/${election.cycle}/arquivo-urna/${election.pleito}/dados/${selection.state}/${selection.municipality}/${section.zone}/${section.number}/${encodeURIComponent(bu.hash)}/${encodeURIComponent(bu.filename)}`;
  try {
    const file = await officialBinaryFile(buUrl);
    const header = parseBer(file.data).children;
    const inner = header[4] && parseBer(header[4].value);
    const localCode = inner?.children[3]?.children[1] ? integer(inner.children[3].children[1]) : null;
    if (localCode === null) throw new Error("Local de votação ausente no boletim.");
    const votes = decodeCandidateVotes(file.data, {municipality: selection.municipality, zone: sectionSelection.zone, section: section.number, electionCode: election.code, office: selection.office, party: candidate.partyNumber, number: candidate.number});
    const place = pollingPlace(selection.state, selection.municipality, section.zone, String(localCode));
    return {...baseRow, localCode: String(localCode), localName: place.name, address: place.address, votes, status: "totalized", buGeneratedAt: buTime(selectedHash?.dr, selectedHash?.hr), sourceUrl: buUrl, checkedAt: file.checkedAt};
  } catch (error) {
    if (error instanceof SourceUnavailable && ["not-published", "connection", "upstream", "rate-limit", "busy"].includes(error.kind)) return pendingRow("waiting", null, buUrl);
    return pendingRow("unavailable", null, buUrl);
  }
}

export async function getLiveSectionVotePage(selection: ElectionSelection, candidateId: string, page: number, sectionQuery = ""): Promise<LiveSectionVotePage> {
  if (selection.state === "br" || !selection.municipality) throw new Error("Escolha um estado e um município para ver os votos por seção.");
  cleanupLiveSectionCache();
  const config = await getLiveConfig(selection.turn), election = findElection(config.elections, selection);
  validateSelection(selection, config.states, election);
  const result = await getLiveResult(selection);
  if (!result.votingReleased) throw new SourceUnavailable("not-published", 60);
  const candidate = result.candidates.find(item => item.id === candidateId);
  if (!candidate || !/^\d+$/.test(candidate.partyNumber) || !/^\d+$/.test(candidate.number)) throw new Error("A candidatura não corresponde ao resultado oficial deste recorte.");
  const configUrl = sectionConfigUrl(election.cycle, election.pleito, selection.state);
  const configFile = await officialJsonFile(configUrl, SECTION_REFRESH_MS, value => {
    const root = object(value);
    if (root.f !== "o" || !Array.isArray(root.abr)) throw new Error("Configuração de seções inválida.");
    return value;
  });
  let sections = parseSections(configFile.data, selection.state, selection.municipality, selection.zone);
  const normalizedQuery = sectionQuery.replace(/\D/g, "").slice(-4);
  if (normalizedQuery) {
    const target = formatSection(normalizedQuery);
    sections = sections.filter(section => section.number === target || section.merged.includes(target));
  }
  if (!sections.length) return {electionYear: Number(election.cycle.slice(3)), candidate: {id: candidate.id, name: candidate.name, number: candidate.number, party: candidate.party, partyNumber: candidate.partyNumber}, selection, page, pageSize: SECTION_PAGE_SIZE, total: 0, totalPages: 0, checkedAt: configFile.checkedAt, refreshSeconds: SECTION_REFRESH_MS / 1000, locationSource: LOCATION_SOURCE, rows: []};
  const totalPages = Math.ceil(sections.length / SECTION_PAGE_SIZE), safePage = Math.max(1, Math.min(totalPages, page));
  const selectedSections = sections.slice((safePage - 1) * SECTION_PAGE_SIZE, safePage * SECTION_PAGE_SIZE);
  const rows = await Promise.all(selectedSections.map(section => sectionVote(election, selection, section, candidate)));
  return {electionYear: Number(election.cycle.slice(3)), candidate: {id: candidate.id, name: candidate.name, number: candidate.number, party: candidate.party, partyNumber: candidate.partyNumber}, selection, page: safePage, pageSize: SECTION_PAGE_SIZE, total: sections.length, totalPages, checkedAt: configFile.checkedAt, refreshSeconds: SECTION_REFRESH_MS / 1000, locationSource: LOCATION_SOURCE, rows};
}
