import { db,dataVersion,databaseFingerprint,databaseFingerprintsMatch } from "./db";
import { cached,cacheResult } from "./platform/store";
import {
  getCircularDonationSummary,
  getSupplierPartnerSummary,
  getAiReviewSummary,
  getDiscourseSummary,
  getDisproportionateExpenseCount,
} from "./queries";

export type HomeStats = {
  people: number;
  candidacies: number;
  campaignOrgs: number;
  socialMedia: number;
  donationsTotalCents: number;
  expensesTotalCents: number;
  years: string;
};

// The .db is rewrite-only, so these full-table sums are cached per process.
const cache = new Map<number, HomeStats>();
let homeVersion=0;
const PERSISTENT_STATS_TTL_MS=365*24*60*60*1000;
type StoredAggregate<T>={fingerprint:string;value:T};

function readAggregate<T>(key:string,fingerprint:string):T|null{
  const row=cached<StoredAggregate<T>>(key,PERSISTENT_STATS_TTL_MS);
  return row&&databaseFingerprintsMatch(row.fingerprint,fingerprint)?row.value:null;
}
function writeAggregate<T>(key:string,value:T,fingerprint:string){
  cacheResult(key,{fingerprint,value} satisfies StoredAggregate<T>,"local database aggregate snapshot");
}

export function getHomeStats(year?: number): HomeStats {
  const version=dataVersion();if(version!==homeVersion){cache.clear();homeVersion=version;}
  const key = year ?? 0;
  const hit = cache.get(key);
  if (hit) return hit;
  const fingerprint=databaseFingerprint();
  const persistent=readAggregate<HomeStats>(`derived:home-stats:v1:${key}`,fingerprint);
  if(persistent){cache.set(key,persistent);return persistent;}

  const yearFilter = year != null ? " WHERE year = ?" : "";
  const args = year != null ? [year] : [];
  const c = (sql: string) => (db().prepare(sql).get(...args) as { n: number }).n;
  const sum = (sql: string) => (db().prepare(sql).get(...args) as { n: number }).n ?? 0;
  const years = db()
    .prepare("SELECT min(year) lo, max(year) hi FROM politician_history")
    .get() as { lo: number; hi: number };

  const result: HomeStats = {
    people:
      year != null
        ? c("SELECT count(DISTINCT person_id) n FROM politician_history WHERE year = ?")
        : c("SELECT count(*) n FROM people"),
    candidacies: c(`SELECT count(*) n FROM politician_history${yearFilter}`),
    campaignOrgs: c(`SELECT count(*) n FROM campaign_org${yearFilter}`),
    socialMedia: c(`SELECT count(*) n FROM social_media${yearFilter}`),
    donationsTotalCents: sum(`SELECT coalesce(sum(amount_cents),0) n FROM campaign_donation${yearFilter}`),
    expensesTotalCents: sum(`SELECT coalesce(sum(amount_cents),0) n FROM campaign_expense${yearFilter}`),
    years: year != null ? String(year) : years.lo && years.hi ? `${years.lo}–${years.hi}` : "—",
  };
  cache.set(key, result);
  writeAggregate(`derived:home-stats:v1:${key}`,result,fingerprint);
  return result;
}

export type SidebarCounts = {
  circularDonations: number;
  supplierPartner: number;
  aiReview: number;
  discourse: number;
  disproportionateExpense: number;
};

let cachedCounts: SidebarCounts | null = null;
let countsVersion=0;

export function getSidebarCounts(): SidebarCounts {
  const version=dataVersion();if(version!==countsVersion){cachedCounts=null;countsVersion=version;}
  if (cachedCounts) return cachedCounts;
  const fingerprint=databaseFingerprint();
  const persistent=readAggregate<SidebarCounts>("derived:sidebar-counts:v1",fingerprint);
  if(persistent){cachedCounts=persistent;return cachedCounts;}
  cachedCounts = {
    circularDonations: getCircularDonationSummary().total,
    supplierPartner: getSupplierPartnerSummary().total,
    aiReview: getAiReviewSummary().total,
    discourse: getDiscourseSummary().total,
    disproportionateExpense: getDisproportionateExpenseCount(),
  };
  writeAggregate("derived:sidebar-counts:v1",cachedCounts,fingerprint);
  return cachedCounts;
}
