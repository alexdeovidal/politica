import type { BrazilianUf, ExpenseCategory, StateAccountRecord } from "./types";

export type LedgerId = "treasury" | "invoices" | "companies" | "pce";
export type EvidenceRecord = StateAccountRecord & {
  agency: string;
  ledger: LedgerId;
  commitment?: string;
  paymentOrder?: string;
  classificationRule?: string;
  budgetDescription?: string;
  vehicle?: string;
  campaign?: string;
  medium?: string;
  municipality?: string;
  grossCents?: number;
  netCents?: number | null;
  commissionCents?: number;
  qualityFlags?: string[];
};
export type EvidenceSource = {
  id: string; label: string; url: string; downloadUrl?: string; kind: string;
  retrievedAt: string; publishedAt?: string | null; sha256?: string; notes: string;
};
export type MonthlyCell = {
  month: string; agencyId: string; agency: string; category: ExpenseCategory;
  financialNature: string; amountCents: number; count: number;
};
export type InvoiceCell = { month: string; agency: string; count: number; grossCents: number; netCents: number; invalidNetCount: number };
export type FiscalFunction = { code: string; name: string; committedCents: number | null; settledCents: number | null; updatedBudgetCents: number | null; paidCents: null };
export type FiscalSnapshot = {
  year: number; period: number; periodStart: string; periodEnd: string; scopeLabel: string;
  totals: { committedCents: number; settledCents: number; paidCents: number; updatedBudgetCents: number; revenueCents: number };
  functions: FiscalFunction[];
  balanceSource: { url: string; sha256?: string }; functionSource: { url: string; sha256?: string };
  notes: string[];
};
export type CoverageItem = { id: string; name: string; status: "integrated" | "partial" | "reference"; detail: string; sourceUrl: string };
export type DashboardSnapshot = {
  schemaVersion: number; uf: BrazilianUf; name: string; collectedAt: string; version: string;
  scannedPayments: number; scannedAgencies: number; selectedPayments: number; agencyInvoices: number;
  years: number[]; windows: Record<string, { start: string; end: string; months: string[] }>;
  monthly: MonthlyCell[]; invoiceMonthly: InvoiceCell[]; companyMonthly: MonthlyCell[];
  fiscal: FiscalSnapshot[];
  surgery: {
    monthly: { month: string; procedures: number; partial: boolean }[];
    annual: { year: number; procedures: number; partial: boolean; specialties: { name: string; procedures: number }[] }[];
    sourceUrl: string; notes: string[];
    /** State-specific annual management reports; optional when that source is unavailable. */
    annualReports?: { year: number; count: number; url: string; page: number; label: string }[];
    /** Retained for the first Goiás snapshot; new adapters should use annualReports. */
    rag2025?: { count: number; url: string; page: number; label: string };
    production: { year: number; amountCents: number; periodStart: string; periodEnd: string; sourceUrl: string; notes: string[] }[];
    pceAnnual: { year: number; amountCents: number; transactions: number; municipalities: number; byMunicipality: { municipality: string; amountCents: number }[] }[];
  };
  coverage: CoverageItem[]; sources: EvidenceSource[];
  quality: { surgeryExcluded: number; mixedPurposeExcluded: number; invoiceFlags: number; classifiedCommitments: number; notes: string[] };
};
export type EvidenceQuery = {
  ledger: LedgerId; year: number; from: string; to: string; category: string; agency: string;
  q: string; page: number;
};
export type EvidencePage = { rows: EvidenceRecord[]; total: number; pages: number; page: number; amountCents: number; sources: EvidenceSource[] };
