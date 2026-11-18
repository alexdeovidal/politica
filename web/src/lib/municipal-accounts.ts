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
  q: string; org: string; unit: string; from: string; to: string; min: number | null; max: number | null; page: number;
};

export type FiscalValue = { name: string; amount: number | null };
export type FiscalSnapshot = {
  year: number; period: number; revenue: number; committed: number; settled: number; paid: number;
  origins: FiscalValue[]; areas: FiscalValue[]; balanceUrl: string; executionUrl: string; collected: string;
};
export type ContractGroup = {
  org: string; unit: string; name: string; cnpj: string | null; amount: number; count: number;
};

export function municipalFiscalReports() {
  return read(db => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fiscal_snapshot'").get()) return [];
    const rows = db.prepare("SELECT payload FROM fiscal_snapshot ORDER BY year DESC").all() as { payload: string }[];
    return rows.map(row => JSON.parse(row.payload) as FiscalSnapshot);
  }) ?? [];
}

export function listMunicipalContracts(filters: MunicipalFilters) {
  return read(db => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='contract'").get()) return null;
    const terms: string[] = [], params: (string | number)[] = [];
    if (filters.q) {
      const q = filters.q.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      terms.push("instr(search_text, ?) > 0");
      params.push(q);
    }
    if (filters.org) { terms.push("org = ?"); params.push(filters.org); }
    if (filters.unit) { terms.push("unit = ?"); params.push(filters.unit); }
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
    const groups = db.prepare(`
      SELECT org, coalesce(unit, '') AS unit, supplier_cnpj AS cnpj,
             coalesce(max(supplier), 'Fornecedor sem nome empresarial exibido') AS name,
             sum(amount_cents) AS amount, count(*) AS count
      FROM contract ${where ? where + " AND" : "WHERE"} initial = 1 AND amount_cents > 0
      GROUP BY org, coalesce(unit, ''), supplier_cnpj
      ORDER BY amount DESC, org, unit, cnpj
    `).all(...params) as ContractGroup[];
    const coverage = db.prepare("SELECT org, count(*) AS months, min(month) AS start, max(month) AS end, max(checked) AS last FROM sync_window GROUP BY org")
      .all() as { org: string; months: number; start: string; end: string; last: string }[];
    return { rows, total, page, totalPages, coverage, groups };
  });
}

export function getMunicipalContract(id: string) {
  return read(db => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='contract'").get()) return null;
    return db.prepare("SELECT * FROM contract WHERE id = ?").get(id) as MunicipalContract | undefined;
  });
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

export function repeatedContractSignals() {
  return read(db => db.prepare(`
    WITH ordered AS (
      SELECT id, org, unit, supplier, supplier_cnpj, title, amount_cents, published, number,
        lag(id) OVER context AS previousId,
        lag(published) OVER context AS previousDate,
        lag(number) OVER context AS previousNumber
      FROM contract
      WHERE initial = 1 AND amount_cents > 0 AND supplier_cnpj IS NOT NULL AND length(trim(title)) >= 25
      WINDOW context AS (
        PARTITION BY org, unit, supplier_cnpj, lower(trim(title)), amount_cents
        ORDER BY published, id
      )
    )
    SELECT * FROM ordered WHERE previousId IS NOT NULL AND number IS NOT NULL AND previousNumber IS NOT NULL
      AND number <> previousNumber AND julianday(published) - julianday(previousDate) <= 30
    ORDER BY published DESC, id DESC LIMIT 20
  `).all() as (Pick<MunicipalContract, "id" | "org" | "unit" | "supplier" | "supplier_cnpj" | "title" | "published" | "number"> & {
    amount_cents: number; previousId: string; previousDate: string; previousNumber: string;
  })[]) ?? [];
}

type Partner = { key: string; name: string; role: string | null; entry: string | null; corporate: string | null };
type Registration = {
  name: string; tradeName: string | null; nature: string | null; city: string | null; state: string | null;
  status: string | null; statusDate: string | null; capital: number | null; partners: Partner[];
};
type RegistrationVersion = { observed: string; registration: Registration };
export type KinshipEvidence = {
  contract_id: string; partner: string; official: string; office: string;
  relationship: string; source_url: string; document_date: string; evidence: string;
};

export const kinshipLabels: Record<string, string> = {
  conjuge: "Cônjuge", companheiro: "Companheiro(a)",
  "pai-mae-filho": "Pais ou filhos · 1º grau em linha reta",
  "avo-neto": "Avós ou netos · 2º grau em linha reta",
  irmao: "Irmãos · 2º grau colateral",
  "bisavo-bisneto": "Bisavós ou bisnetos · 3º grau em linha reta",
  "tio-sobrinho": "Tios ou sobrinhos · 3º grau colateral",
  primo: "Primos · 4º grau colateral",
  "afinidade-1": "Afinidade · 1º grau", "afinidade-2": "Afinidade · 2º grau", "afinidade-3": "Afinidade · 3º grau",
};

export function supplierProfile(cnpj: string, contractId: string) {
  return read(db => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='supplier_snapshot'").get()) return null;
    const rows = db.prepare("SELECT observed, payload FROM supplier_snapshot WHERE cnpj=? ORDER BY id DESC LIMIT 21")
      .all(cnpj) as { observed: string; payload: string }[];
    const versions: RegistrationVersion[] = rows.map(row => ({ observed: row.observed, registration: JSON.parse(row.payload) }));
    const check = db.prepare("SELECT successful FROM supplier_check WHERE cnpj=?").get(cnpj) as { successful: string | null } | undefined;
    const kinship = db.prepare("SELECT * FROM supplier_kinship WHERE contract_id=? AND cnpj=? ORDER BY document_date DESC")
      .all(contractId, cnpj) as KinshipEvidence[];
    return { versions, checked: check?.successful, kinship };
  });
}

export function supplierInvestigationSignals() {
  return read(db => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='supplier_snapshot'").get()) return null;
    const versions = db.prepare(`
      WITH recent AS (
        SELECT cnpj, observed, payload, lag(observed) OVER snapshot AS prior,
          lag(payload) OVER snapshot AS before
        FROM supplier_snapshot WINDOW snapshot AS (PARTITION BY cnpj ORDER BY id)
      ), changes AS (
        SELECT cnpj, max(observed) AS observed FROM recent
        WHERE prior IS NOT NULL AND json_extract(payload,'$.partners') <> json_extract(before,'$.partners')
        GROUP BY cnpj
        ORDER BY observed DESC LIMIT 12
      )
      SELECT r.cnpj, r.observed, c.supplier, c.id AS contractId
      FROM changes r JOIN contract c ON c.id=(
        SELECT t.id FROM contract t WHERE t.supplier_cnpj=r.cnpj
        ORDER BY t.published DESC,t.id DESC LIMIT 1
      )
      ORDER BY r.observed DESC
    `).all() as { cnpj: string; observed: string; supplier: string | null; contractId: string }[];
    const kinship = db.prepare(`SELECT k.* FROM supplier_kinship k JOIN contract c ON c.id=k.contract_id AND c.supplier_cnpj=k.cnpj
      ORDER BY k.document_date DESC LIMIT 20`).all() as KinshipEvidence[];
    return { versions, kinship };
  });
}
