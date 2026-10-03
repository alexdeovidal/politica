import { db, hasTable } from "@/lib/db";
import { normalizeName, digitsOnly } from "@/lib/normalize";

export type PartnerRecord = {
  id: number; companyId: number; cnpj: string; companyName: string; partnerName: string;
  document: string | null; role: string | null; entryDate: string | null; collectedAt: string;
  sourceUrl: string; personId: number | null; personCpf: string | null;
  confidence: "documento" | "possivel" | "sem-correspondencia"; href: string;
};

export function resolvePartner(row: Omit<PartnerRecord, "personId" | "personCpf" | "confidence" | "href">): PartnerRecord {
  const document = digitsOnly(row.document ?? "");
  if (document.length === 14 && !(row.document ?? "").includes("*")) {
    return { ...row, personId: null, personCpf: null, confidence: "documento", href: `/cnpj/${document}` };
  }
  if (document.length === 8 && !(row.document ?? "").includes("*")) {
    return { ...row, personId: null, personCpf: null, confidence: "documento", href: `/socios/${row.id}` };
  }
  const normalized = normalizeName(row.partnerName);
  const masked = (row.document ?? "").replace(/[.\-/\s]/g, "");
  const visible = /^\*{3}(\d{6})\*{2}$/.exec(masked)?.[1];
  let matches: { id: number; cpf: string;cpfTrusted:number }[] = [];
  if (document.length === 11 && !masked.includes("*")) {
    matches = db().prepare("SELECT id, cpf,cpf_trusted AS cpfTrusted FROM people WHERE cpf = ? AND canonical_name = ?").all(document, normalized) as typeof matches;
  } else if (visible && normalized.length >= 8 && normalized.includes(" ")) {
    matches = db().prepare("SELECT id, cpf,cpf_trusted AS cpfTrusted FROM people WHERE canonical_name = ? AND substr(cpf,4,6) = ?").all(normalized, visible) as typeof matches;
  }
  const match = matches.length === 1 ? matches[0] : null;
  return { ...row, personId: match?.id ?? null, personCpf: match?.cpf ?? null,
    confidence: match ? visible || !match.cpfTrusted ? "possivel" : "documento" : "sem-correspondencia",
    href: match ? `/politico/${match.id}` : `/socios/${row.id}` };
}

const SELECT_PARTNER = `SELECT cp.id, cp.company_id AS companyId, cp.cnpj,
  coalesce(cr.legal_name,c.legal_name,cp.cnpj) AS companyName, cp.partner_name AS partnerName,
  cp.partner_doc_masked AS document, cp.role, cp.entry_date AS entryDate,
  cp.collected_at AS collectedAt, col.url AS sourceUrl
  FROM company_partner cp JOIN companies c ON c.id=cp.company_id
  LEFT JOIN company_registry cr ON cr.company_id=c.id
  JOIN parse pa ON pa.id=cp.provenance_id JOIN collection col ON col.id=pa.collection_id`;

export function companyPartners(cnpj: string): PartnerRecord[] {
  if (!hasTable("company_partner")) return [];
  return (db().prepare(`${SELECT_PARTNER} WHERE cp.cnpj=? ORDER BY cp.entry_date DESC`).all(cnpj) as Parameters<typeof resolvePartner>[0][]).map(resolvePartner);
}

export function partnerById(id: number): PartnerRecord | null {
  if (!hasTable("company_partner")) return null;
  const row = db().prepare(`${SELECT_PARTNER} WHERE cp.id=?`).get(id) as Parameters<typeof resolvePartner>[0] | undefined;
  return row ? resolvePartner(row) : null;
}

export function personCompanies(personId: number): PartnerRecord[] {
  if (!hasTable("company_partner")) return [];
  const person = db().prepare("SELECT canonical_name AS name FROM people WHERE id=?").get(personId) as { name: string } | undefined;
  if (!person?.name) return [];
  const rows = db().prepare(`${SELECT_PARTNER} WHERE normalize_public_name(cp.partner_name)=? ORDER BY cp.entry_date DESC`).all(person.name) as Parameters<typeof resolvePartner>[0][];
  return rows.map(resolvePartner).filter(row=>row.personId===personId);
}

export function partnerOtherCompanies(partner: PartnerRecord): PartnerRecord[] {
  if (!partner.document) return [partner];
  return (db().prepare(`${SELECT_PARTNER} WHERE normalize_public_name(cp.partner_name)=? AND cp.partner_doc_masked=? ORDER BY cp.entry_date DESC`).all(normalizeName(partner.partnerName),partner.document) as Parameters<typeof resolvePartner>[0][]).map(resolvePartner);
}

export function partnerNameCandidates(name: string) {
  return db().prepare("SELECT id,canonical_name AS name FROM people WHERE canonical_name=? LIMIT 20").all(normalizeName(name)) as { id: number; name: string }[];
}

export function partnerEstablishments(partner: PartnerRecord) {
 const document=digitsOnly(partner.document || "");
 if(![8,14].includes(document.length) || partner.document?.includes("*"))return [];
 return db().prepare("SELECT cnpj,legal_name AS name FROM companies WHERE cnpj LIKE ? ORDER BY cnpj").all(`${document.slice(0,8)}%`) as {cnpj:string;name:string|null}[];
}
