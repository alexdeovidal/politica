export type BrazilianUf =
  | "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO"
  | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI"
  | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";

export type FinancialStage = "paid" | "settled" | "committed" | "contracted" | "budgeted" | "transferred" | "announced";
export type ExpenseCategory = "publicity" | "institutional-publicity" | "legal-publicity" | "elective-surgeries" | "health" | "education" | "sanitation" | "security" | "transport" | "other";
export type Coverage = "partial" | "complete";
export type SourceKind = "portal" | "spreadsheet" | "csv" | "json" | "api" | "pdf" | "report";

export type Source = {
  id: string;
  label: string;
  url: string;
  kind: SourceKind;
  retrievedAt: string;
  publishedAt?: string;
  sha256?: string;
  notes: string;
};

/** Monetary values are integer centavos. A negative value is an adjustment/estorno. */
export type StateAccountRecord = {
  id: string;
  uf: BrazilianUf;
  agencyId: string;
  category: ExpenseCategory;
  stage: FinancialStage;
  amountCents: number;
  /** Date of the financial event, not the collector's date. YYYY-MM-DD. */
  date: string;
  /** Declared coverage window of the source/extraction; not individual payment dates. */
  periodStart: string;
  periodEnd: string;
  supplier?: string;
  supplierDocument?: string;
  description: string;
  sourceId: string;
  sourceRow?: string | number;
  /** Stable official document identity, shared across duplicate copies of a record. */
  dedupKey: string;
  coverage: Coverage;
  /** Comparable accounting universe, e.g. state-disbursement or state-company. */
  scope: string;
  financialNature?: "direct-payment" | "transfer" | "other";
  /** Detail and reference rows remain inspectable but cannot inflate consolidated totals. */
  consolidationRole?: "primary" | "breakdown" | "reference";
  parentRecordId?: string;
};
export type ExpenseRecord = StateAccountRecord;
export type FinancialRecord = StateAccountRecord;

/** Production is not a financial disbursement and is never fed into expense sums. */
export type SurgeryStats = {
  id: string;
  uf: BrazilianUf;
  label: string;
  count: number;
  periodStart: string;
  periodEnd: string;
  sourceId: string;
  scope: string;
  notes: string;
};

export type StateDefinition = {
  uf: BrazilianUf;
  ibgeCode: number;
  slug: string;
  name: string;
  active: boolean;
};

export type RecordFilters = {
  uf?: BrazilianUf;
  agencyIds?: readonly string[];
  categories?: readonly ExpenseCategory[];
  stages?: readonly FinancialStage[];
  from?: string;
  to?: string;
  q?: string;
};

/** An explicit filtered window. It never upgrades the coverage declared by records. */
export type ComparisonContext = {
  periodStart: string;
  periodEnd: string;
  stage: FinancialStage;
  scope: string;
  coverage?: Coverage;
};

export type ComparisonOptions = {
  leftContext?: ComparisonContext;
  rightContext?: ComparisonContext;
};

export type ComparisonResult = {
  status: "comparable" | "partial" | "incompatible" | "missing";
  leftCents: number | null;
  rightCents: number | null;
  /** Left minus right, only when the comparison is eligible. */
  differenceCents: number | null;
  /** Left / right, only when the comparison is eligible and right is positive. */
  ratio: number | null;
  reasons: string[];
  leftCount: number;
  rightCount: number;
  duplicateCount: number;
  excludedCount: number;
  leftContext: ComparisonContext | null;
  rightContext: ComparisonContext | null;
};
