import {runDatabaseWorker} from "@/lib/database-worker";
import {ELECTION_YEAR, type ElectionSelection, type LiveCandidate} from "./model";

const SECTION_PAGE_SIZE = 3;
const VOTE_SECTION_SOURCE = "https://dadosabertos.tse.jus.br/dataset/resultados-2026/resource/01ea4ccd-f443-469c-9f29-c69ff97f7d4c";

export type LiveSectionVote = {
  zone: string;
  number: string;
  mergedSections: string[];
  localCode: string | null;
  localName: string | null;
  address: string | null;
  municipality?: string | null;
  state?: string | null;
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
  sourceLabel: string;
  ready: boolean;
  ranked: true;
  rows: LiveSectionVote[];
};

type ArchivedSectionVotePage = {
  ready: boolean;
  candidate: {id: string; name: string; number: string; party: string; partyNumber: string} | null;
  rows: Array<{state: string | null; municipality: string | null; zone: string; number: string; localCode: string | null; localName: string | null; address: string | null; votes: number}>;
  total: number;
  page: number;
  pageSize: number;
  checkedAt: string;
};

export class LocalSectionDatabaseUnavailable extends Error {
  constructor() { super("O banco local de votação por seção está temporariamente indisponível. Tente novamente em instantes."); }
}

function validateLocalSelection(selection: ElectionSelection) {
  const offices = new Set(["1", "3", "5", "6", "7", "8", "25"]);
  if (![1, 2].includes(selection.turn) || !offices.has(selection.office) || !/^(br|zz|[a-z]{2})$/.test(selection.state)
    || selection.municipality && !/^\d{5}$/.test(selection.municipality)
    || selection.zone && !/^\d{4}$/.test(selection.zone)
    || selection.zone && !selection.municipality
    || selection.state === "br" && (selection.office !== "1" || selection.municipality || selection.zone)
    || selection.state === "zz" && selection.office !== "1"
    || selection.office === "8" && selection.state !== "df"
    || selection.office === "7" && selection.state === "df") {
    throw new Error("Selecione um recorte eleitoral válido.");
  }
}

export async function getLiveSectionVotePage(selection: ElectionSelection, candidateId: string, page: number, sectionQuery = "", sectionFilter = ""): Promise<LiveSectionVotePage> {
  validateLocalSelection(selection);
  if (!/^\d+$/.test(candidateId) || !Number.isSafeInteger(page) || page < 1 || page > 10000 || sectionQuery.length > 100 || sectionFilter && !/^\d{1,4}$/.test(sectionFilter)) {
    throw new Error("Pesquise pelo nome da escola, endereço ou número da seção.");
  }

  let archived: ArchivedSectionVotePage;
  try {
    archived = await runDatabaseWorker<ArchivedSectionVotePage>("live-section-votes-worker.cjs", {
      query: {
        year: ELECTION_YEAR,
        round: selection.turn,
        officeCode: selection.office,
        candidateId,
        state: selection.state === "br" ? "BR" : selection.state,
        municipalityCode: selection.municipality,
        zone: selection.zone,
        sectionNumber: sectionFilter,
        search: sectionQuery.trim(),
        page,
      },
    }, {lane: "interactive", priority: 10});
  } catch (error) {
    console.error("Unable to query the local section vote database:", error);
    throw new LocalSectionDatabaseUnavailable();
  }

  if (archived.ready && !archived.candidate) throw new Error("Esta candidatura ainda não está vinculada ao acervo local de votação por seção.");
  const totalPages = Math.ceil(archived.total / SECTION_PAGE_SIZE);
  const safePage = totalPages ? Math.min(archived.page, totalPages) : 1;
  const rows: LiveSectionVote[] = archived.rows.map(row => ({
    zone: String(row.zone),
    number: String(row.number),
    mergedSections: [],
    localCode: row.localCode === null ? null : String(row.localCode),
    localName: row.localName || null,
    address: row.address || null,
    municipality: row.municipality || null,
    state: row.state || null,
    votes: row.votes,
    status: "totalized",
    buGeneratedAt: null,
    sourceUrl: VOTE_SECTION_SOURCE,
    checkedAt: archived.checkedAt,
  }));

  return {
    electionYear: ELECTION_YEAR,
    candidate: archived.candidate || {id: candidateId, name: "", number: "", party: "", partyNumber: ""},
    selection,
    page: safePage,
    pageSize: SECTION_PAGE_SIZE,
    total: archived.total,
    totalPages,
    checkedAt: archived.checkedAt,
    refreshSeconds: archived.ready ? 0 : 60,
    locationSource: VOTE_SECTION_SOURCE,
    sourceLabel: "Acervo local · dados oficiais do TSE",
    ready: archived.ready,
    ranked: true,
    rows,
  };
}
