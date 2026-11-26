// ProPublica Nonprofit Explorer API v2 adapter (free, keyless, read-only).
//   Docs:  https://projects.propublica.org/nonprofits/api   (verified 2026-11)
//   GET /nonprofits/api/v2/search.json?q=&page=&state[id]=NM&ntee[id]=1..10&c_code[id]=3
//       -> { total_results, num_pages, cur_page, per_page, organizations: [{ ein, strein, name,
//            sub_name, city, state, ntee_code, raw_ntee_code, subseccd, ... }] }   (25 per page)
//   GET /nonprofits/api/v2/organizations/{ein}.json
//       -> { organization: { ein, name, city, state, ntee_code, subsection_code, foundation_code,
//            pf_filing_requirement_code, asset_amount, ... }, filings_with_data: [{ tax_prd,
//            tax_prd_yr, formtype, pdf_url, totrevenue, totfuncexpns, totassetsend, <IRS SOI
//            element names> }], filings_without_data: [{ tax_prd, tax_prd_yr, formtype, pdf_url }],
//            data_source, api_version }
//   formtype: 0 = 990, 1 = 990-EZ, 2 = 990-PF. Amounts are whole US dollars.
//   990-PF element names (IRS SOI annual extract documentation, 24eofinextractdoc.xlsx):
//     contrpdpbks    "Contributions, gifts, grants paid"  (990-PF Pt I-25, col (a))
//     fairmrktvalamt "Total assets - e-o-y fair market value" (990-PF header, item I)
//     totassetsend   "Total assets - e-o-y book value"   (990-PF Pt II-16, col (b))
//     operatingcd    "Operating foundation code" (Y/N); distribamt "Distributable amount"
//   EO BMF foundation_code: 02/03 = private operating foundation, 04 = private non-operating
//   foundation, 00 = not 501(c)(3), 10-24 = public charity types.
//
// Terms: use of the API "constitutes agreement" to ProPublica's Data Terms of Use
// (https://www.propublica.org/about/propublica-data-terms-of-use): cite ProPublica when the data is
// published, don't republish the raw data in its entirety or resell it, and accuracy is not
// guaranteed. We therefore show per-funder summaries with an attribution link (never a bulk dump),
// keep the raw JSON only as an internal cache, and call the API politely: at most 1 request/second
// (per isolate) and every response cached in R2 for 30 days. The API is "a work in progress and
// subject to change", so parsers are tolerant (nullish + passthrough).
import { z } from "zod";
import type { AppContext } from "../../context";
import type { FoundationType } from "../../db/schema/prospects";
import { sha256Hex } from "../../lib/hash";

export const PROPUBLICA_API = "https://projects.propublica.org/nonprofits/api/v2";
export const PROPUBLICA_DOCS_URL = "https://projects.propublica.org/nonprofits/api";
export const PROPUBLICA_TERMS_URL = "https://www.propublica.org/about/propublica-data-terms-of-use";
export const PROPUBLICA_ATTRIBUTION =
  "Data: ProPublica Nonprofit Explorer (IRS Form 990 data). ProPublica does not guarantee its accuracy or completeness.";
/** Upstream sources ProPublica cites in its `data_source` field. */
export const PROPUBLICA_DATA_SOURCES = [
  { name: "ProPublica Nonprofit Explorer API", url: PROPUBLICA_DOCS_URL },
  {
    name: "IRS Exempt Organizations Business Master File Extract (EO BMF)",
    url: "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf",
  },
  {
    name: "IRS Annual Extract of Tax-Exempt Organization Financial Data",
    url: "https://www.irs.gov/uac/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data",
  },
] as const;

export const CACHE_TTL_MS = 30 * 86_400_000;
export const MIN_REQUEST_INTERVAL_MS = 1_000;
const CACHE_PREFIX = "catalog/propublica/v2";

export const propublicaOrgPageUrl = (ein: string) =>
  `https://projects.propublica.org/nonprofits/organizations/${ein}`;

export interface SearchParams {
  q: string;
  state?: string;
  /** NTEE major group 1-10 (ProPublica numbering, e.g. 7 = Public, Societal Benefit incl. T grantmakers). */
  nteeMajor?: number;
  /** 501(c) subsection; 3 = 501(c)(3). */
  cCode?: number;
  page?: number;
}

export function searchUrl(p: SearchParams): string {
  const qs = new URLSearchParams();
  qs.set("q", p.q);
  if (p.state) qs.set("state[id]", p.state.toUpperCase());
  if (p.nteeMajor != null) qs.set("ntee[id]", String(p.nteeMajor));
  if (p.cCode != null) qs.set("c_code[id]", String(p.cCode));
  if (p.page) qs.set("page", String(p.page));
  return `${PROPUBLICA_API}/search.json?${qs.toString()}`;
}

export const organizationUrl = (ein: string) => `${PROPUBLICA_API}/organizations/${ein}.json`;

// ---------------------------------------------------------------------------------------------
// Parsers (tolerant)

const num = z.union([z.number(), z.string()]).nullish();
const strOrNull = z.string().nullish();

export const SearchOrganization = z
  .object({
    ein: z.union([z.number(), z.string()]),
    strein: strOrNull,
    name: strOrNull,
    sub_name: strOrNull,
    city: strOrNull,
    state: strOrNull,
    ntee_code: strOrNull,
    subseccd: num,
  })
  .passthrough();

export const SearchResponse = z
  .object({
    total_results: num,
    num_pages: num,
    cur_page: num,
    per_page: num,
    organizations: z.array(z.unknown()).nullish(),
  })
  .passthrough();

const Filing = z
  .object({
    tax_prd: num,
    tax_prd_yr: num,
    formtype: num,
    formtype_str: strOrNull,
    pdf_url: strOrNull,
    totrevenue: num,
    totfuncexpns: num,
    totassetsend: num,
    fairmrktvalamt: num,
    contrpdpbks: num,
    distribamt: num,
    operatingcd: strOrNull,
  })
  .passthrough();
export type RawFiling = z.infer<typeof Filing>;

export const OrganizationResponse = z
  .object({
    organization: z
      .object({
        ein: z.union([z.number(), z.string()]),
        name: strOrNull,
        city: strOrNull,
        state: strOrNull,
        ntee_code: strOrNull,
        subsection_code: num,
        foundation_code: num,
        pf_filing_requirement_code: num,
        asset_amount: num,
      })
      .passthrough(),
    filings_with_data: z.array(z.unknown()).nullish(),
    filings_without_data: z.array(z.unknown()).nullish(),
  })
  .passthrough();

/** EIN as 9 digits without dash ("85-0457010" | 30466957 -> "030466957"); null if invalid. */
export function normalizeEin(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  const digits = String(v).replace(/\D/g, "");
  if (!digits || digits.length > 9) return null;
  return digits.padStart(9, "0");
}

export const formatEin = (ein: string) => `${ein.slice(0, 2)}-${ein.slice(2)}`;

function toInt(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Whole dollars -> cents; null for missing / negative. Zero stays zero (a reported zero). */
export function dollarsToCents(v: string | number | null | undefined): number | null {
  const n = toInt(v);
  return n == null || n < 0 ? null : n * 100;
}

export interface SearchHit {
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  subsectionCode: number | null;
}

export interface SearchPage {
  totalResults: number;
  numPages: number;
  hits: SearchHit[];
}

export function parseSearchResponse(raw: unknown): SearchPage {
  const res = SearchResponse.parse(raw);
  const hits: SearchHit[] = [];
  for (const o of res.organizations ?? []) {
    const p = SearchOrganization.safeParse(o);
    if (!p.success) continue;
    const ein = normalizeEin(p.data.ein);
    const name = (p.data.name ?? p.data.sub_name ?? "").trim();
    if (!ein || !name) continue;
    hits.push({
      ein,
      name,
      city: p.data.city?.trim() || null,
      state: p.data.state?.trim().toUpperCase() || null,
      nteeCode: p.data.ntee_code?.trim() || null,
      subsectionCode: toInt(p.data.subseccd),
    });
  }
  return {
    totalResults: toInt(res.total_results) ?? hits.length,
    numPages: toInt(res.num_pages) ?? 1,
    hits,
  };
}

export interface FilingSummary {
  taxYear: number | null;
  /** YYYYMM end of the tax period. */
  taxPeriod: number | null;
  formType: number | null;
  formLabel: string;
  hasData: boolean;
  totalAssetsCents: number | null;
  fairMarketValueCents: number | null;
  totalGivingCents: number | null;
  totalRevenueCents: number | null;
  totalExpensesCents: number | null;
  pdfUrl: string | null;
}

export interface OrganizationDetail {
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  subsectionCode: number | null;
  foundationCode: number | null;
  foundationType: FoundationType;
  isPrivateFoundation: boolean;
  /** Newest first: filings with extracted data, then the rest (PDF only). */
  filings: FilingSummary[];
  latest: FilingSummary | null;
}

export const FORM_LABELS: Record<number, string> = { 0: "990", 1: "990-EZ", 2: "990-PF" };

function summarizeFiling(raw: unknown, hasData: boolean): FilingSummary | null {
  const p = Filing.safeParse(raw);
  if (!p.success) return null;
  const f = p.data;
  const formType = toInt(f.formtype);
  const isPf = formType === 2;
  return {
    taxYear: toInt(f.tax_prd_yr),
    taxPeriod: toInt(f.tax_prd),
    formType,
    formLabel: (formType != null ? FORM_LABELS[formType] : undefined) ?? f.formtype_str ?? "990",
    hasData,
    totalAssetsCents: hasData ? dollarsToCents(f.totassetsend) : null,
    fairMarketValueCents: hasData && isPf ? dollarsToCents(f.fairmrktvalamt) : null,
    // Grants paid is a 990-PF element; other forms report giving elsewhere (not in this extract).
    totalGivingCents: hasData && isPf ? dollarsToCents(f.contrpdpbks) : null,
    totalRevenueCents: hasData ? dollarsToCents(f.totrevenue) : null,
    totalExpensesCents: hasData ? dollarsToCents(f.totfuncexpns) : null,
    pdfUrl: f.pdf_url && /^https:\/\//.test(f.pdf_url) ? f.pdf_url : null,
  };
}

export function foundationTypeOf(
  foundationCode: number | null,
  latestFormType: number | null,
  pfFilingRequirement: number | null,
): FoundationType {
  if (foundationCode === 4) return "private_non_operating";
  if (foundationCode === 2 || foundationCode === 3) return "private_operating";
  if (foundationCode != null && foundationCode >= 10 && foundationCode <= 24)
    return "public_charity";
  if (latestFormType === 2 || pfFilingRequirement === 1) return "private_foundation";
  return "unknown";
}

export const isPrivateFoundationType = (t: FoundationType) =>
  t === "private_non_operating" || t === "private_operating" || t === "private_foundation";

const byPeriodDesc = (a: FilingSummary, b: FilingSummary) =>
  (b.taxPeriod ?? (b.taxYear ?? 0) * 100) - (a.taxPeriod ?? (a.taxYear ?? 0) * 100);

export function parseOrganizationResponse(raw: unknown): OrganizationDetail | null {
  const p = OrganizationResponse.safeParse(raw);
  if (!p.success) return null;
  const o = p.data.organization;
  const ein = normalizeEin(o.ein);
  const name = o.name?.trim();
  if (!ein || !name) return null;
  const withData = (p.data.filings_with_data ?? [])
    .map((f) => summarizeFiling(f, true))
    .filter((f): f is FilingSummary => f != null)
    .sort(byPeriodDesc);
  const withoutData = (p.data.filings_without_data ?? [])
    .map((f) => summarizeFiling(f, false))
    .filter((f): f is FilingSummary => f != null)
    .sort(byPeriodDesc);
  const latest = withData[0] ?? null;
  const foundationCode = toInt(o.foundation_code);
  const foundationType = foundationTypeOf(
    foundationCode,
    latest?.formType ?? withoutData[0]?.formType ?? null,
    toInt(o.pf_filing_requirement_code),
  );
  return {
    ein,
    name,
    city: o.city?.trim() || null,
    state: o.state?.trim().toUpperCase() || null,
    nteeCode: o.ntee_code?.trim() || null,
    subsectionCode: toInt(o.subsection_code),
    foundationCode,
    foundationType,
    isPrivateFoundation: isPrivateFoundationType(foundationType),
    filings: [...withData, ...withoutData],
    latest,
  };
}

// ---------------------------------------------------------------------------------------------
// Polite, cached client

export interface ClientOptions {
  /** Minimum gap between network requests (default 1 s). Tests pass 0. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Cache freshness window (default 30 days). */
  cacheTtlMs?: number;
}

export interface CachedJson {
  key: string;
  body: unknown;
  fetchedAt: Date;
  fromCache: boolean;
}

interface CacheEnvelope {
  url: string;
  fetchedAt: string;
  body: unknown;
}

const defaultSleep = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

export const searchCacheKey = async (url: string) =>
  `${CACHE_PREFIX}/search/${(await sha256Hex(url)).slice(0, 32)}.json`;
export const organizationCacheKey = (ein: string) => `${CACHE_PREFIX}/organizations/${ein}.json`;

/**
 * Read-through R2 cache in front of `ctx.web.fetchJson`. Network calls are spaced at least
 * `minIntervalMs` apart (per client instance / run); cache hits are free.
 */
export class ProPublicaClient {
  private lastRequestAt = 0;
  readonly stats = { network: 0, cacheHits: 0 };
  private readonly minIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly ttl: number;

  constructor(
    private readonly ctx: AppContext,
    opts: ClientOptions = {},
  ) {
    this.minIntervalMs = opts.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS;
    this.sleep = opts.sleep ?? defaultSleep;
    this.ttl = opts.cacheTtlMs ?? CACHE_TTL_MS;
  }

  async search(p: SearchParams): Promise<SearchPage> {
    const url = searchUrl(p);
    const res = await this.getJson(url, await searchCacheKey(url));
    return parseSearchResponse(res.body);
  }

  async organization(ein: string): Promise<{ detail: OrganizationDetail | null } & CachedJson> {
    const res = await this.getJson(organizationUrl(ein), organizationCacheKey(ein));
    return { ...res, detail: parseOrganizationResponse(res.body) };
  }

  private async getJson(url: string, key: string): Promise<CachedJson> {
    const now = this.ctx.now();
    const cached = await this.readCache(key);
    if (cached && now.getTime() - cached.fetchedAt.getTime() < this.ttl) {
      this.stats.cacheHits++;
      return { key, body: cached.body, fetchedAt: cached.fetchedAt, fromCache: true };
    }
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (this.lastRequestAt > 0 && wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();
    this.stats.network++;
    const body = await this.ctx.web.fetchJson(url, { headers: { Accept: "application/json" } });
    const envelope: CacheEnvelope = { url, fetchedAt: now.toISOString(), body };
    try {
      await this.ctx.env.FILES.put(key, JSON.stringify(envelope), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { fetchedAt: envelope.fetchedAt, source: "propublica" },
      });
    } catch (e) {
      this.ctx.logger.warn("prospecting.cache_write_failed", { error: String(e) });
    }
    return { key, body, fetchedAt: now, fromCache: false };
  }

  private async readCache(key: string): Promise<{ body: unknown; fetchedAt: Date } | null> {
    return readCachedEnvelope(this.ctx, key);
  }
}

/** The cached raw response at `key` (any age), or null. */
export async function readCachedEnvelope(
  ctx: AppContext,
  key: string,
): Promise<{ body: unknown; fetchedAt: Date } | null> {
  try {
    const obj = await ctx.env.FILES.get(key);
    if (!obj) return null;
    const env = JSON.parse(await obj.text()) as Partial<CacheEnvelope>;
    const fetchedAt = new Date(env.fetchedAt ?? 0);
    if (Number.isNaN(fetchedAt.getTime())) return null;
    return { body: env.body, fetchedAt };
  } catch {
    return null;
  }
}
