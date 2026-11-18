import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";

export const municipalPath = "/contas-do-municipio/caldas-novas";
export const municipalOrgs: Record<string, string> = {
  "01787506000155": "Prefeitura de Caldas Novas",
  "00675468000186": "DEMAE",
  "10796854000180": "Caldas Prev",
};

export type MunicipalContract = {
  id: string; org: string; unit: string | null; supplier: string | null;
  supplier_cnpj: string | null; title: string; kind: string | null;
  amount_cents: number | null; signed: string | null; published: string;
  process: string | null; number: string | null; tender: string | null;
  official_url: string; collected: string;
};

function read<T>(query: (db: Database.Database) => T): T | null {
  const file = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(process.env.ELOSYS_DB_PATH ?? "../elosys.db"), "caldas-novas.db");
  if (!existsSync(file)) return null;
  const db = new Database(file, { readonly: true, fileMustExist: true, timeout: 250 });
  try {
    // Keep totals, coverage and rows on the same snapshot during a refresh.
    return db.transaction(() => query(db))();
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_BUSY") return null;
    throw error;
  } finally {
    db.close();
  }
}

export const municipalPageSize = 20;
export type MunicipalFilters = {
  q: string; org: string; from: string; to: string; min: number | null; max: number | null; page: number;
};

export function listMunicipalContracts(filters: MunicipalFilters) {
  return read(db => {
    const terms: string[] = [], params: (string | number)[] = [];
    if (filters.q) {
      const q = filters.q.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      terms.push("instr(search_text, ?) > 0");
      params.push(q);
    }
    if (filters.org) { terms.push("org = ?"); params.push(filters.org); }
    if (filters.from) { terms.push("published >= ?"); params.push(filters.from); }
    if (filters.to) { terms.push("published <= ?"); params.push(filters.to); }
    if (filters.min !== null) { terms.push("amount_cents >= ?"); params.push(filters.min); }
    if (filters.max !== null) { terms.push("amount_cents <= ?"); params.push(filters.max); }
    const where = terms.length ? "WHERE " + terms.join(" AND ") : "";
    const total = (db.prepare(`SELECT count(*) AS n FROM contract ${where}`).get(...params) as { n: number }).n;
    const totalPages = Math.max(1, Math.ceil(total / municipalPageSize));
    const page = Math.min(filters.page, totalPages);
    const rows = db.prepare(`SELECT * FROM contract ${where} ORDER BY published DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, municipalPageSize, (page - 1) * municipalPageSize) as MunicipalContract[];
    const coverage = db.prepare("SELECT org, count(*) AS months, min(month) AS start, max(month) AS end, max(checked) AS last FROM sync_window GROUP BY org")
      .all() as { org: string; months: number; start: string; end: string; last: string }[];
    return { rows, total, page, totalPages, coverage };
  });
}

export function getMunicipalContract(id: string) {
  return read(db => db.prepare("SELECT * FROM contract WHERE id = ?").get(id) as MunicipalContract | undefined);
}

export function concentrationSignals() {
  return read(db => db.prepare(`
    WITH totals AS (
      SELECT org, substr(published, 1, 4) AS year, count(*) AS contracts,
             count(DISTINCT supplier_cnpj) AS suppliers, sum(amount_cents) AS total
      FROM contract WHERE initial = 1 AND amount_cents > 0 GROUP BY org, year
    ), suppliers AS (
      SELECT org, substr(published, 1, 4) AS year, supplier_cnpj AS cnpj, max(supplier) AS supplier,
             sum(amount_cents) AS amount, count(*) AS contracts
      FROM contract WHERE initial = 1 AND amount_cents > 0 AND supplier_cnpj IS NOT NULL
      GROUP BY org, year, supplier_cnpj
    )
    SELECT s.*, t.total, t.contracts AS sample, t.suppliers, 1.0 * s.amount / t.total AS share
    FROM suppliers s JOIN totals t USING (org, year)
    WHERE t.contracts >= 5 AND t.suppliers >= 3 AND s.amount >= 0.5 * t.total
    ORDER BY s.year DESC, share DESC, s.amount DESC
  `).all() as { org: string; year: string; cnpj: string; supplier: string | null; amount: number; contracts: number; total: number; sample: number; suppliers: number; share: number }[]) ?? [];
}
