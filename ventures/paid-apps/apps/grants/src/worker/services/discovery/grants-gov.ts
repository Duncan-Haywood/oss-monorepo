// Grants.gov public REST API adapter (keyless): https://www.grants.gov/api/api-guide
//   POST https://api.grants.gov/v1/api/search2           { keyword, oppStatuses, eligibilities, fundingCategories, cfda, rows, startRecordNum }
//   POST https://api.grants.gov/v1/api/fetchOpportunity  { opportunityId }
// Parsers are deliberately tolerant (optional fields + passthrough): the API adds/renames fields and
// returns numbers as strings ("none", "0", "2,900,000").
// Verified API quirks (live calls, 2026-11-19):
//  - The Assistance Listing filter is `cfda` (echoed in data.searchParams); `aln` and other unknown
//    fields are silently ignored. Pipe-joined cfda values ("93.967|10.310") return 0 hits, so we
//    send ONE listing per request. eligibilities / fundingCategories are pipe-joined ORs.
//  - Ids are strings in search hits and numbers in fetchOpportunity: normalized to strings.
//  - Posted details live in `synopsis`, forecasts in `forecast`; descriptions are HTML.
//  - `synopsis.agencyName` can be a contact person: the funder comes from agencyDetails.
//  - Forecasts have no close date (search returns ""); the detail has estimates only.
import type { FunderType, OpportunityStatus, SubmissionMethodHint } from "@shared/enums";
import { z } from "zod";
import type { WebFetcher } from "../../ports/web-fetcher";

export const GRANTS_GOV_API = "https://api.grants.gov/v1/api";
export const GRANTS_GOV_SEARCH_URL = `${GRANTS_GOV_API}/search2`;
export const GRANTS_GOV_FETCH_URL = `${GRANTS_GOV_API}/fetchOpportunity`;

/**
 * Grants.gov eligibility codes relevant to our tenants (verified against search2 facets):
 *  12 = Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education
 *  13 = Nonprofits that do not have a 501(c)(3) status with the IRS, other than IHEs
 *  07 = Native American tribal governments (Federally recognized)
 *  11 = Native American tribal organizations (other than Federally recognized tribal governments)
 *  25 = Others (see "Additional Information on Eligibility")
 *  99 = Unrestricted (open to any type of entity)
 */
export const NONPROFIT_ELIGIBILITY_CODES = ["12", "13", "07", "11", "25", "99"] as const;

const str = z.union([z.string(), z.number()]).nullish();
const codeDesc = z.object({ id: str, description: z.string().nullish() }).passthrough();

export const SearchHit = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    number: z.string().nullish(),
    title: z.string().nullish(),
    agencyCode: z.string().nullish(),
    agency: z.string().nullish(),
    agencyName: z.string().nullish(),
    openDate: z.string().nullish(),
    closeDate: z.string().nullish(),
    oppStatus: z.string().nullish(),
    docType: z.string().nullish(),
    cfdaList: z.array(z.string()).nullish(),
  })
  .passthrough();
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchResponse = z
  .object({
    errorcode: z.number().nullish(),
    msg: z.string().nullish(),
    data: z
      .object({
        hitCount: z.number().nullish(),
        startRecord: z.number().nullish(),
        oppHits: z.array(z.unknown()).nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const Synopsis = z
  .object({
    agencyCode: z.string().nullish(),
    agencyName: z.string().nullish(),
    agencyDetails: z.object({ agencyName: z.string().nullish() }).passthrough().nullish(),
    synopsisDesc: z.string().nullish(),
    forecastDesc: z.string().nullish(),
    responseDate: z.string().nullish(),
    responseDateStr: z.string().nullish(),
    responseDateDesc: z.string().nullish(),
    estApplicationResponseDate: z.string().nullish(),
    estApplicationResponseDateStr: z.string().nullish(),
    estApplicationResponseDateDesc: z.string().nullish(),
    postingDate: z.string().nullish(),
    postingDateStr: z.string().nullish(),
    estSynopsisPostingDate: z.string().nullish(),
    estSynopsisPostingDateStr: z.string().nullish(),
    archiveDateStr: z.string().nullish(),
    costSharing: z.union([z.boolean(), z.string()]).nullish(),
    awardCeiling: str,
    awardFloor: str,
    estimatedFunding: str,
    numberOfAwards: str,
    applicantEligibilityDesc: z.string().nullish(),
    applicantTypes: z.array(codeDesc).nullish(),
    fundingInstruments: z.array(codeDesc).nullish(),
    fundingActivityCategories: z.array(codeDesc).nullish(),
    fundingDescLinkUrl: z.string().nullish(),
    agencyContactEmail: z.string().nullish(),
    agencyContactName: z.string().nullish(),
    lastUpdatedDate: z.string().nullish(),
  })
  .passthrough();
export type Synopsis = z.infer<typeof Synopsis>;

export const OpportunityDetail = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    opportunityNumber: z.string().nullish(),
    opportunityTitle: z.string().nullish(),
    owningAgencyCode: z.string().nullish(),
    docType: z.string().nullish(),
    agencyDetails: z.object({ agencyName: z.string().nullish() }).passthrough().nullish(),
    topAgencyDetails: z.object({ agencyName: z.string().nullish() }).passthrough().nullish(),
    synopsis: Synopsis.nullish(),
    forecast: Synopsis.nullish(),
    cfdas: z
      .array(
        z
          .object({ cfdaNumber: z.string().nullish(), programTitle: z.string().nullish() })
          .passthrough(),
      )
      .nullish(),
    opportunityPkgs: z.array(z.unknown()).nullish(),
  })
  .passthrough();
export type OpportunityDetail = z.infer<typeof OpportunityDetail>;

export const FetchResponse = z
  .object({ errorcode: z.number().nullish(), msg: z.string().nullish(), data: z.unknown() })
  .passthrough();

export interface SearchParams {
  /** May be "" for a filter-only search (e.g. one Assistance Listing). */
  keyword: string;
  oppStatuses?: string; // "forecasted|posted"
  /** Grants.gov eligibility codes (default: NONPROFIT_ELIGIBILITY_CODES). */
  eligibilities?: readonly string[];
  /** Grants.gov funding category codes, OR-ed. Omit for all categories. */
  fundingCategories?: readonly string[];
  /** One Assistance Listing Number ("17.268"), sent as `cfda`. */
  aln?: string | null;
  rows?: number;
  startRecordNum?: number;
}

export interface SearchPage {
  hitCount: number;
  hits: SearchHit[];
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function searchGrantsGov(web: WebFetcher, p: SearchParams): Promise<SearchPage> {
  const raw = await web.fetchJson(GRANTS_GOV_SEARCH_URL, postJson(buildSearchBody(p)));
  return parseSearchResponse(raw);
}

export function buildSearchBody(p: SearchParams): Record<string, unknown> {
  const eligibilities = p.eligibilities?.length ? p.eligibilities : NONPROFIT_ELIGIBILITY_CODES;
  return {
    keyword: p.keyword,
    oppStatuses: p.oppStatuses ?? "forecasted|posted",
    eligibilities: eligibilities.join("|"),
    ...(p.fundingCategories?.length ? { fundingCategories: p.fundingCategories.join("|") } : {}),
    ...(p.aln ? { cfda: p.aln } : {}),
    rows: p.rows ?? 25,
    startRecordNum: p.startRecordNum ?? 0,
  };
}

export function parseSearchResponse(raw: unknown): SearchPage {
  const res = SearchResponse.parse(raw);
  if (res.errorcode && res.errorcode !== 0) {
    throw new Error(`grants.gov search2 error ${res.errorcode}: ${res.msg ?? ""}`);
  }
  const hits: SearchHit[] = [];
  for (const h of res.data?.oppHits ?? []) {
    const parsed = SearchHit.safeParse(h);
    if (parsed.success && parsed.data.id) hits.push(parsed.data);
  }
  return { hitCount: res.data?.hitCount ?? hits.length, hits };
}

export async function fetchGrantsGovOpportunity(
  web: WebFetcher,
  opportunityId: string,
): Promise<OpportunityDetail | null> {
  const idNum = Number(opportunityId);
  const raw = await web.fetchJson(
    GRANTS_GOV_FETCH_URL,
    postJson({ opportunityId: Number.isFinite(idNum) ? idNum : opportunityId }),
  );
  return parseFetchResponse(raw);
}

export function parseFetchResponse(raw: unknown): OpportunityDetail | null {
  const res = FetchResponse.parse(raw);
  if (res.errorcode && res.errorcode !== 0) return null;
  const parsed = OpportunityDetail.safeParse(res.data);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------------------------
// Normalization (pure)

const PLACEHOLDER_RE =
  /^(?:n\/?a|none|null|nil|tbd|tba|tbd\/tba|unknown|not applicable|not available|not specified|-+)$/i;

/** "tbd", "none", "N/A", "-", "" and friends mean "no value". */
export function isPlaceholder(v: string | null | undefined): boolean {
  if (v == null) return true;
  const s = v.trim().replace(/[.\s]+$/, "");
  return s === "" || PLACEHOLDER_RE.test(s);
}

/** Trimmed text, or "" for placeholders. */
export const cleanText = (v: string | null | undefined): string =>
  isPlaceholder(v) ? "" : (v ?? "").trim();

const MONEY_MULTIPLIERS: Record<string, number> = {
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  million: 1e6,
  mil: 1e6,
  m: 1e6,
  thousand: 1e3,
  k: 1e3,
};

/**
 * Dollar amounts -> cents, or null when unknown. Accepts numbers and strings in every shape the
 * sources use: "5000000", "$1,250.50", "2,900,000", "Up to $500,000", "$1.5M", "2 million".
 * "0" / 0 means "not specified" on Grants.gov (never $0); placeholders ("none", "TBD") are null.
 */
export function parseMoneyCents(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  let n: number;
  if (typeof v === "number") n = v;
  else {
    if (isPlaceholder(v)) return null;
    const m = /(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mil|b|m|k)?\b/i.exec(
      v.replace(/\$/g, ""),
    );
    if (!m?.[1]) return null;
    n = Number(m[1].replace(/,/g, "")) * (MONEY_MULTIPLIERS[(m[2] ?? "").toLowerCase()] ?? 1);
  }
  // Anything >= $1T is a data error, not a grant.
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) return null;
  return Math.round(n * 100);
}

/** Floor/ceiling sanity: a floor above the ceiling is a swapped pair. */
export function normalizeAwardRange(
  floor: number | null,
  ceiling: number | null,
): { floor: number | null; ceiling: number | null } {
  if (floor != null && ceiling != null && floor > ceiling)
    return { floor: ceiling, ceiling: floor };
  return { floor, ceiling };
}

export function parseIntOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "string" && isPlaceholder(v)) return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v).replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function ymdOf(s: string): [number, number, number] | null {
  // 1. "MM/DD/YYYY" (search2 hits)
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s);
  if (mdy) return [Number(mdy[3]), Number(mdy[1]), Number(mdy[2])];
  // 2. "YYYY-MM-DD-HH-mm-ss" (*DateStr fields) and ISO "YYYY-MM-DD[THH:mm...]" (Simpler)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s-])/.exec(s);
  if (ymd) return [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  // 3. "Jan 15, 2027 12:00:00 AM EST" (responseDate, postingDate) and "January 15, 2027"
  const named = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  const month = named?.[1] ? MONTHS[named[1].slice(0, 3).toLowerCase()] : undefined;
  if (named && month) return [Number(named[3]), month, Number(named[2])];
  // 4. "MMDDYYYY" (Grants.gov XML extract)
  const packed = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (packed) return [Number(packed[3]), Number(packed[1]), Number(packed[2])];
  return null;
}

/**
 * Grants.gov / Simpler dates -> the calendar date as written (US Eastern for Grants.gov values
 * without a zone; deadlines show as "12:00 AM" and the real cutoff time is free text in
 * responseDateDesc, kept in the description). Stored as 23:59 UTC of that date so the date reads
 * the same in every US time zone. Invalid dates (02/30) and placeholders ("TBD") -> null.
 */
export function parseGrantsGovDate(v: string | null | undefined): Date | null {
  if (isPlaceholder(v)) return null;
  const parts = ymdOf((v ?? "").trim());
  if (!parts) return null;
  const [y, m, d] = parts;
  if (y < 1990 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 23, 59, 0));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function mapStatus(v: string | null | undefined): OpportunityStatus {
  switch ((v ?? "").toLowerCase()) {
    case "forecasted":
      return "forecasted";
    case "closed":
      return "closed";
    case "archived":
      return "archived";
    default:
      return "posted";
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: "-",
  mdash: "-",
};

/** Grants.gov descriptions are HTML fragments; convert to readable plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e.startsWith("#x")) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCodePoint(Number.parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function grantsGovDetailUrl(id: string) {
  return `https://www.grants.gov/search-results-detail/${encodeURIComponent(id)}`;
}

/** Normalized catalog record (the subset of `opportunities` columns an adapter fills). */
export interface CatalogRecord {
  source: "grants_gov" | "simpler_grants" | "manual";
  sourceId: string;
  sourceUrl: string | null;
  funder: {
    name: string;
    type: FunderType;
    agencyCode?: string | null;
    websiteUrl?: string | null;
  };
  title: string;
  opportunityNumber: string | null;
  summary: string;
  description: string;
  eligibilityText: string;
  applicantTypes: string[];
  categories: string[];
  geographicScope: string | null;
  awardFloorCents: number | null;
  awardCeilingCents: number | null;
  totalFundingCents: number | null;
  expectedAwards: number | null;
  costSharingRequired: boolean | null;
  openDate: Date | null;
  /** Application deadline. Always null for forecasts (only estimates exist). */
  closeDate: Date | null;
  /** Forecasts only. */
  estimatedPostDate: Date | null;
  estimatedCloseDate: Date | null;
  status: OpportunityStatus;
  submissionMethod: SubmissionMethodHint;
  submissionEmail: string | null;
  submissionUrl: string | null;
}

const descs = (xs: z.infer<typeof codeDesc>[] | null | undefined) =>
  (xs ?? []).map((x) => cleanText(x.description)).filter(Boolean);

export const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Merge a search hit with its (optional) fetchOpportunity detail into a catalog record. */
export function toCatalogRecord(hit: SearchHit, detail: OpportunityDetail | null): CatalogRecord {
  const hitStatus = cleanText(hit.oppStatus).toLowerCase();
  const isForecast =
    hitStatus === "forecasted" || (!hitStatus && !detail?.synopsis && !!detail?.forecast);
  const syn = (isForecast ? detail?.forecast : detail?.synopsis) ?? null;
  // synopsis.agencyName can be a contact person: never use it for the funder.
  const agencyName =
    [
      syn?.agencyDetails?.agencyName,
      detail?.agencyDetails?.agencyName,
      hit.agency,
      hit.agencyName,
      detail?.topAgencyDetails?.agencyName,
      hit.agencyCode,
    ]
      .map(cleanText)
      .find(Boolean) ?? "Unknown federal agency";
  const descriptionText = htmlToText(syn?.synopsisDesc ?? syn?.forecastDesc);
  const applicantTypes = descs(syn?.applicantTypes);
  const eligibilityParts = [
    applicantTypes.length ? `Eligible applicants: ${applicantTypes.join("; ")}.` : "",
    cleanText(htmlToText(syn?.applicantEligibilityDesc)),
  ].filter(Boolean);
  const closeDate = isForecast
    ? null
    : (parseGrantsGovDate(syn?.responseDateStr) ??
      parseGrantsGovDate(syn?.responseDate) ??
      parseGrantsGovDate(hit.closeDate));
  const openDate = isForecast
    ? null
    : (parseGrantsGovDate(syn?.postingDateStr) ??
      parseGrantsGovDate(syn?.postingDate) ??
      parseGrantsGovDate(hit.openDate));
  const estimatedCloseDate = isForecast
    ? (parseGrantsGovDate(syn?.estApplicationResponseDateStr) ??
      parseGrantsGovDate(syn?.estApplicationResponseDate))
    : null;
  const estimatedPostDate = isForecast
    ? (parseGrantsGovDate(syn?.estSynopsisPostingDateStr) ??
      parseGrantsGovDate(syn?.estSynopsisPostingDate))
    : null;
  const costSharing =
    typeof syn?.costSharing === "boolean"
      ? syn.costSharing
      : typeof syn?.costSharing === "string" && !isPlaceholder(syn.costSharing)
        ? /^(y|yes|true)$/i.test(syn.costSharing.trim())
        : null;
  const deadlineNote = cleanText(
    htmlToText(isForecast ? syn?.estApplicationResponseDateDesc : syn?.responseDateDesc),
  );
  const cfdaTitles = (detail?.cfdas ?? [])
    .map((c) => [cleanText(c.cfdaNumber), cleanText(c.programTitle)].filter(Boolean).join(" "))
    .filter(Boolean);
  const description = [
    descriptionText,
    deadlineNote ? `Deadline note: ${deadlineNote}` : "",
    cfdaTitles.length ? `Assistance listings: ${cfdaTitles.join("; ")}` : "",
    cleanText(syn?.fundingDescLinkUrl) ? `Full announcement: ${syn?.fundingDescLinkUrl}` : "",
    isForecast
      ? [
          "This is a forecast; the full notice of funding opportunity is not yet posted.",
          estimatedPostDate ? `Estimated posting date: ${isoDay(estimatedPostDate)}.` : "",
          estimatedCloseDate
            ? `Estimated application due date: ${isoDay(estimatedCloseDate)}.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const range = normalizeAwardRange(
    parseMoneyCents(syn?.awardFloor),
    parseMoneyCents(syn?.awardCeiling),
  );
  return {
    source: "grants_gov",
    sourceId: hit.id,
    sourceUrl: grantsGovDetailUrl(hit.id),
    funder: {
      name: agencyName,
      type: "federal",
      agencyCode:
        cleanText(syn?.agencyCode) ||
        cleanText(hit.agencyCode) ||
        cleanText(detail?.owningAgencyCode) ||
        null,
    },
    title: (
      cleanText(detail?.opportunityTitle) ||
      cleanText(hit.title) ||
      `Grants.gov opportunity ${hit.id}`
    ).replace(/\s+/g, " "),
    opportunityNumber: cleanText(detail?.opportunityNumber) || cleanText(hit.number) || null,
    summary: truncate(descriptionText, 600),
    description: truncate(description, 20_000),
    eligibilityText: truncate(eligibilityParts.join("\n"), 4_000),
    applicantTypes,
    categories: descs(syn?.fundingActivityCategories),
    geographicScope: "United States (national)",
    awardFloorCents: range.floor,
    awardCeilingCents: range.ceiling,
    totalFundingCents: parseMoneyCents(syn?.estimatedFunding),
    expectedAwards: parseIntOrNull(syn?.numberOfAwards),
    costSharingRequired: costSharing,
    openDate,
    closeDate,
    estimatedPostDate,
    estimatedCloseDate,
    status: isForecast ? "forecasted" : mapStatus(hitStatus || "posted"),
    submissionMethod: "grants_gov",
    submissionEmail: null,
    submissionUrl: grantsGovDetailUrl(hit.id),
  };
}

/** Fields of the search hit that, if unchanged, mean the listing itself has not changed. */
export function listingFingerprint(hit: SearchHit): string {
  return JSON.stringify([
    hit.id,
    hit.number ?? "",
    hit.title ?? "",
    hit.openDate ?? "",
    hit.closeDate ?? "",
    hit.oppStatus ?? "",
    hit.docType ?? "",
  ]);
}
