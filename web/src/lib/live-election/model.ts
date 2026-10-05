// The TSE EA11, EA12, EA14/15 and EA20 layouts are the source of these fields.
export const TSE_RESULTS_BASE = "https://resultados.tse.jus.br/oficial";
export const LIVE_POLL_SECONDS = 30;
export const ELECTION_YEAR = 2026;
export const TSE_TECHNICAL_SOURCE = "https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados";

export type ElectionSelection = { turn: number; office: string; state: string; municipality: string; zone: string };
export type ElectionOffice = { code: string; name: string; proportional: boolean };
export type OfficialElection = { code: string; cycle: string; pleito: string; date: string; turn: number; offices: ElectionOffice[] };
export type Municipality = { code: string; name: string; zones: string[]; ibgeCode?: string };
export type ElectionState = { code: string; name: string; municipalities: Municipality[] };
export type LiveConfig = { elections: OfficialElection[]; states: ElectionState[]; sourceUrl: string; generatedAt: string | null; checkedAt: string; stale: boolean };
export type PublicConfig = Omit<LiveConfig, "states"> & { states: {code: string; name: string}[]; municipalities: Municipality[]; exteriorMunicipalities: Municipality[] };
export type LiveCandidate = {
  id: string; number: string; partyNumber: string; name: string; legalName: string; party: string; partyName: string;
  coalition: string; votes: number | null; percentage: number | null; destination: string;
  status: string; photoUrl: string | null; runningMates: {name: string; party: string; role: string}[];
};
export type LiveResult = {
  selection: ElectionSelection; election: OfficialElection; office: ElectionOffice;
  areaName: string; scope: string; sourceUrl: string; generationId: string;
  generatedAt: string | null; totalizedAt: string | null; checkedAt: string; completedAt?: string | null;
  stale: boolean; available: boolean; votingReleased: boolean;
  progress: "waiting" | "partial" | "counted" | "final";
  mathematicalDecision: string; noWinnersReason: string[]; seats: number | null;
  sections: {total: number; counted: number; percentage: number; pending: number | null; installed: number | null; tallied: number | null; notTallied: number | null; notInstalled: number | null};
  voters: {eligible: number | null; attendance: number | null; attendancePercentage: number | null; abstention: number | null; abstentionPercentage: number | null};
  votes: {total: number | null; valid: number | null; blank: number | null; null: number | null; nominal: number | null; party: number | null; annulled: number | null; subJudice: number | null; technicalNull: number | null; withoutCandidate: number | null};
  candidates: LiveCandidate[];
  parties: {number: string; name: string; abbreviation: string; nominal: number | null; legend: number | null; destination: string}[];
};
export type LiveTerritory = {code: string; name: string; state: string; municipality: string; progress: string; sections: number; counted: number; percentage: number; totalizedAt: string | null};
export type LiveOverview = {sourceUrl: string; generatedAt: string | null; checkedAt: string; stale: boolean; territories: LiveTerritory[]};

export function isLiveResultComplete(result: Pick<LiveResult, "progress" | "sections">) {
  return result.progress === "final" || (
    result.sections.total > 0 &&
    result.sections.counted >= result.sections.total &&
    result.sections.percentage >= 100
  );
}

type Json = Record<string, unknown>;
export function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formato inesperado na fonte oficial.");
  return value as Json;
}
export function list(value: unknown): Json[] { return Array.isArray(value) ? value.map(object) : []; }
export function str(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
export function officialCount(value: unknown): number | null {
  const text = str(value);
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
export function officialPercentage(value: unknown): number | null {
  const text = str(value).replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}
export function tseTimestamp(date: unknown, time: unknown): string | null {
  const d = str(date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/), t = str(time).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59 || Number(t[3]) > 59) return null;
  const calendar = new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1])));
  if (calendar.getUTCFullYear() !== Number(d[3]) || calendar.getUTCMonth() + 1 !== Number(d[2]) || calendar.getUTCDate() !== Number(d[1])) return null;
  return `${d[3]}-${d[2]}-${d[1]}T${t[1]}:${t[2]}:${t[3]}-03:00`;
}
export function normalizeLiveSearch(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim(); }
export function matchesLiveSearch(text: string, query: string) { const normalized = normalizeLiveSearch(text); return normalizeLiveSearch(query).split(" ").filter(Boolean).every(token => normalized.includes(token)); }
export function displayName(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/(^|[\s-])\p{L}/gu, letter => letter.toLocaleUpperCase("pt-BR")).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, word => word.toLowerCase());
}

export function parseElections(value: unknown): OfficialElection[] {
  const root = object(value);
  if (root.f !== "o") throw new Error("A configuração recebida não contém dados oficiais.");
  const elections: OfficialElection[] = [];
  for (const pleito of list(root.pl)) {
    const cycle = str(pleito.c);
    if (cycle !== `ele${ELECTION_YEAR}`) continue;
    const pleitoCode = str(pleito.cd);
    if (!/^\d{1,6}$/.test(pleitoCode)) continue;
    for (const election of list(pleito.e)) {
      const code = str(election.cd), turn = Number(election.t);
      if (!/^\d{1,6}$/.test(code) || ![1, 2].includes(turn)) continue;
      const offices = list(election.abr).flatMap(area => list(area.cp)).map(office => ({code: str(office.cd), name: str(office.ds), proportional: office.tp === "2"}));
      if (!offices.length) continue;
      elections.push({code, cycle, pleito: pleitoCode, date: str(pleito.dt), turn, offices: Array.from(new Map(offices.map(office => [office.code, office])).values())});
    }
  }
  if (!elections.length) throw new Error("O TSE ainda não publicou a configuração desta eleição.");
  return elections;
}

export function parseStates(value: unknown): ElectionState[] {
  const root = object(value);
  if (root.f !== "o") throw new Error("A lista de localidades recebida não contém dados oficiais.");
  const states = list(root.abr).map(area => ({code: str(area.cd).toLowerCase(), name: displayName(str(area.ds)), municipalities: list(area.mu).map(municipality => ({code: str(municipality.cd).padStart(5, "0"), name: displayName(str(municipality.nm)), ibgeCode: /^\d{7}$/.test(str(municipality.cdi)) ? str(municipality.cdi) : "", zones: Array.isArray(municipality.z) ? municipality.z.map(zone => str(zone).padStart(4, "0")) : []}))}));
  if (!states.length || states.some(state => !/^[a-z]{2}$/.test(state.code) || !state.name || state.municipalities.some(municipality => !/^\d{5}$/.test(municipality.code) || municipality.zones.some(zone => !/^\d{4}$/.test(zone))))) throw new Error("Localidades inválidas na configuração oficial.");
  return states.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function selectionFromParams(params: {get(name: string): string | null}): ElectionSelection {
  return {turn: Number(params.get("turno") || 1), office: params.get("cargo") || "1", state: (params.get("uf") || "br").toLowerCase(), municipality: params.get("municipio") || "", zone: params.get("zona") || ""};
}
export function historySelectionFromParams(params: {get(name: string): string | null}): ElectionSelection {
  const selection = selectionFromParams(params);
  if (![1, 2].includes(selection.turn) || !/^\d{1,4}$/.test(selection.office) || !/^(br|[a-z]{2})$/.test(selection.state) || selection.municipality && !/^\d{5}$/.test(selection.municipality) || selection.zone && !/^\d{4}$/.test(selection.zone) || selection.zone && !selection.municipality || selection.state === "br" && (selection.office !== "1" || selection.municipality || selection.zone)) throw new Error("Selecione um recorte eleitoral válido.");
  return selection;
}
export function findElection(elections: OfficialElection[], selection: ElectionSelection): OfficialElection {
  const election = elections.find(item => item.turn === selection.turn && item.offices.some(office => office.code === selection.office));
  if (!election) throw new Error("Este cargo ou turno ainda não está disponível na configuração do TSE.");
  return election;
}
export function validateSelection(selection: ElectionSelection, states: ElectionState[], election: OfficialElection) {
  if (election.turn !== selection.turn || !election.offices.some(office => office.code === selection.office)) throw new Error("Cargo ou turno inválido.");
  if (selection.state === "br") {
    if (selection.office !== "1" || selection.municipality || selection.zone) throw new Error("Escolha um estado para consultar este cargo.");
    return;
  }
  const state = states.find(item => item.code === selection.state);
  if (!state) throw new Error("Estado ou abrangência inválida.");
  if (selection.state === "zz" && selection.office !== "1") throw new Error("No exterior, a votação é para presidente.");
  if (selection.office === "8" && selection.state !== "df" || selection.office === "7" && selection.state === "df") throw new Error("Cargo indisponível nesta unidade da Federação.");
  const municipality = state.municipalities.find(item => item.code === selection.municipality);
  if (selection.municipality && !municipality) throw new Error("Município ou localidade inválida.");
  if (selection.zone && !municipality?.zones.includes(selection.zone)) throw new Error("Selecione uma zona eleitoral da localidade escolhida.");
  // Conselho distrital is a municipal contest in Fernando de Noronha, not in every city.
  if (selection.office === "25" && (selection.state !== "pe" || !municipality || normalizeLiveSearch(municipality.name) !== "fernando de noronha")) throw new Error("Selecione Fernando de Noronha/PE para o Conselho Distrital.");
}
export function resultUrl(election: OfficialElection, selection: ElectionSelection) {
  if (!/^ele\d{4}$/.test(election.cycle) || !/^\d{1,6}$/.test(election.code) || !/^(br|[a-z]{2})$/.test(selection.state) || !/^\d{1,4}$/.test(selection.office) || selection.municipality && !/^\d{5}$/.test(selection.municipality) || selection.zone && !/^\d{4}$/.test(selection.zone)) throw new Error("Identificadores inválidos.");
  const area = `${selection.state}${selection.municipality}${selection.zone ? `-z${selection.zone}` : ""}`;
  return `${TSE_RESULTS_BASE}/${election.cycle}/${election.code}/dados/${selection.state}/${area}-c${selection.office.padStart(4, "0")}-e${election.code.padStart(6, "0")}-u.json`;
}
export function areaName(selection: ElectionSelection, states: ElectionState[]) {
  if (selection.state === "br") return "Brasil e exterior";
  const state = states.find(item => item.code === selection.state);
  const municipality = state?.municipalities.find(item => item.code === selection.municipality);
  return `${municipality ? `${municipality.name}${selection.state === "zz" ? " · Exterior" : `/${selection.state.toUpperCase()}`}` : state?.name || selection.state.toUpperCase()}${selection.zone ? ` · Zona ${Number(selection.zone)}` : ""}`;
}

export function parseResult(value: unknown, election: OfficialElection, selection: ElectionSelection, states: ElectionState[]): Omit<LiveResult, "checkedAt" | "stale"> {
  const root = object(value), scope = selection.zone ? "zona" : selection.municipality ? "mu" : selection.state === "br" ? "br" : "uf";
  const areaCode = selection.zone || selection.municipality || selection.state;
  if (root.f !== "o" || str(root.ele) !== election.code || Number(root.t) !== selection.turn || root.tpabr !== scope || str(root.cdabr).toLowerCase() !== areaCode || !["n", "p", "f"].includes(str(root.and))) throw new Error("O arquivo recebido não corresponde à consulta oficial selecionada.");
  const office = election.offices.find(item => item.code === selection.office)!;
  const cargo = list(root.carg).find(item => str(item.cd) === selection.office);
  if (!cargo) throw new Error("O cargo selecionado não está no arquivo recebido.");
  const sections = object(root.s), voters = object(root.e), votes = object(root.v);
  const total = officialCount(sections.ts), counted = officialCount(sections.st);
  if (total === null || counted === null || counted > total) throw new Error("Totais de seções inválidos na fonte oficial.");
  const votingReleased = root.dv !== "n" && root.and !== "n";
  const voteCount = (value: unknown) => votingReleased ? officialCount(value) : null;
  const candidates: LiveCandidate[] = [], parties: LiveResult["parties"] = [];
  for (const coalition of list(cargo.agr)) for (const party of list(coalition.par)) {
    parties.push({number: str(party.n), name: str(party.nm), abbreviation: str(party.sg), nominal: voteCount(party.tvan), legend: voteCount(party.tval), destination: str(party.dvt)});
    for (const candidate of list(party.cand)) {
      const id = str(candidate.sqcand), number = str(candidate.n);
      if (!/^\d+$/.test(number) || id && !/^\d+$/.test(id)) throw new Error("Identificador de candidato inválido na fonte oficial.");
      if (votingReleased && officialCount(candidate.vap) === null) throw new Error("Votação de candidato inválida na fonte oficial.");
      candidates.push({id: id || `${party.n}-${number}`, number, partyNumber: str(party.n), name: str(candidate.nmu) || str(candidate.nm), legalName: str(candidate.nm), party: str(party.sg), partyName: str(party.nm), coalition: str(coalition.nm), votes: voteCount(candidate.vap), percentage: votingReleased ? officialPercentage(candidate.pvapn ?? candidate.pvap) : null, destination: str(candidate.dvt), status: votingReleased && root.tf === "s" ? str(candidate.st) : "", photoUrl: id ? `${TSE_RESULTS_BASE}/${election.cycle}/${election.code}/fotos/${selection.office === "1" ? "br" : selection.state}/${id}.jpeg` : null, runningMates: list(candidate.vs).map(mate => ({name: str(mate.nmu) || str(mate.nm), party: str(mate.sgp), role: mate.tp === "v" ? "Vice" : mate.tp === "s1" ? "1º suplente" : "2º suplente"}))});
    }
  }
  candidates.sort((a, b) => votingReleased ? (b.votes ?? 0) - (a.votes ?? 0) || a.name.localeCompare(b.name, "pt-BR") : a.name.localeCompare(b.name, "pt-BR"));
  return {selection, election, office, areaName: areaName(selection, states), scope, sourceUrl: resultUrl(election, selection), generationId: str(root.idg), generatedAt: tseTimestamp(root.dg, root.hg), totalizedAt: tseTimestamp(root.dt, root.ht), available: true, votingReleased, progress: !votingReleased ? "waiting" : root.tf === "s" ? "final" : root.and === "f" ? "counted" : "partial", mathematicalDecision: votingReleased && ["e", "s"].includes(str(root.md)) ? str(root.md) : "", noWinnersReason: root.esae === "s" && Array.isArray(root.mnae) ? root.mnae.map(str) : [], seats: officialCount(cargo.nv), sections: {total, counted, percentage: officialPercentage(sections.pstn ?? sections.pst) ?? (total ? counted / total * 100 : 0), pending: officialCount(sections.snt), installed: officialCount(sections.si), tallied: officialCount(sections.sa), notTallied: officialCount(sections.sna), notInstalled: officialCount(sections.sni)}, voters: {eligible: officialCount(voters.te), attendance: voteCount(voters.c), attendancePercentage: votingReleased ? officialPercentage(voters.pcn ?? voters.pc) : null, abstention: voteCount(voters.a), abstentionPercentage: votingReleased ? officialPercentage(voters.pan ?? voters.pa) : null}, votes: {total: voteCount(votes.tv), valid: voteCount(votes.vv), blank: voteCount(votes.vb), null: voteCount(votes.tvn), nominal: voteCount(votes.vnom), party: voteCount(votes.vl), annulled: voteCount(votes.van), subJudice: voteCount(votes.vansj), technicalNull: voteCount(votes.vnt), withoutCandidate: voteCount(votes.vscv)}, candidates, parties};
}

export function parseOverview(value: unknown, election: OfficialElection, stateCode: string, states: ElectionState[]): Omit<LiveOverview, "sourceUrl" | "checkedAt" | "stale"> {
  const root = object(value);
  if (root.f !== "o" || str(root.ele) !== election.code || Number(root.t) !== election.turn) throw new Error("Acompanhamento de outra eleição ou ambiente.");
  const territories = list(root.abr).filter(area => stateCode === "br" ? area.tpabr === "uf" : ["mun", "mu"].includes(str(area.tpabr))).map(area => {
    const code = str(area.cdabr).toLowerCase(), state = stateCode === "br" ? states.find(item => item.code === code) : states.find(item => item.code === stateCode);
    const municipality = stateCode === "br" ? null : state?.municipalities.find(item => item.code === code.padStart(5, "0"));
    if (!state || stateCode !== "br" && !municipality) return null;
    const sections = object(area.s), total = officialCount(sections.ts), counted = officialCount(sections.st);
    if (total === null || counted === null || counted > total) throw new Error("Acompanhamento de seções inconsistente.");
    return {code, name: municipality?.name || state.name, state: state.code, municipality: municipality?.code || "", progress: str(area.and), sections: total, counted, percentage: officialPercentage(sections.pstn ?? sections.pst) ?? (total ? counted / total * 100 : 0), totalizedAt: tseTimestamp(area.dt, area.ht)};
  }).filter((item): item is LiveTerritory => item !== null);
  return {generatedAt: tseTimestamp(root.dg, root.hg), territories};
}
