// searchFoundations: ProPublica search -> private-foundation candidates enriched with their latest
// filing totals. ProPublica's `q` matches organization name / alternate name / city only (not giving
// interests), so callers pass place names and distinctive focus words; we then keep only private
// foundations (EO BMF foundation code / Form 990-PF), which needs one detail call per candidate.
import type { AppContext } from "../../context";
import type { FoundationType, FunderProfileSource } from "../../db/schema/prospects";
import { isFake } from "../../env";
import {
  type ClientOptions,
  type FilingSummary,
  type OrganizationDetail,
  ProPublicaClient,
  propublicaOrgPageUrl,
  type SearchHit,
} from "./propublica";
import { SAMPLE_FOUNDATIONS } from "./sample-foundations";

export interface SearchFoundationsParams {
  /** Two-letter state, e.g. "NM". */
  state: string;
  /** Search terms (each one ProPublica query). Empty = a generic "foundation" query. */
  keywords: string[];
  /** ProPublica NTEE major group (1-10) of the foundation itself; omit to keep unclassified ones. */
  nteeMajor?: number;
}

export interface SearchFoundationsOptions extends ClientOptions {
  /** "sample" = fictional offline fixtures. Default: sample when FAKE_EXTERNALS, else ProPublica. */
  source?: FunderProfileSource;
  client?: ProPublicaClient;
  /** Cap on /organizations/{ein}.json calls (each is a request when not cached). Default 25. */
  maxDetailFetches?: number;
  maxQueries?: number;
}

export interface FoundationCandidate {
  source: FunderProfileSource;
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  subsectionCode: number | null;
  foundationType: FoundationType;
  latestFilingYear: number | null;
  latestFormType: number | null;
  totalAssetsCents: number | null;
  totalGivingCents: number | null;
  website: string | null;
  propublicaUrl: string | null;
  rawR2Key: string | null;
  fetchedAt: Date;
  /** Queries that surfaced this organization. */
  matchedQueries: string[];
  filings: FilingSummary[];
}

export interface SearchFoundationsResult {
  candidates: FoundationCandidate[];
  stats: {
    queries: number;
    hits: number;
    detailFetched: number;
    privateFoundations: number;
    network: number;
    cacheHits: number;
    errors: number;
  };
}

export const DEFAULT_MAX_DETAIL_FETCHES = 25;
const GRANTMAKER_NAME = /\b(foundation|fund|trust|endowment|charitable)\b/i;

/** Higher = fetch details first. Grantmaker-looking names and T2x/T9x NTEE codes first. Pure. */
export function hitPriority(hit: SearchHit, matchedQueries: number): number {
  let p = matchedQueries * 2;
  if (GRANTMAKER_NAME.test(hit.name)) p += 5;
  if (hit.nteeCode && /^T(2|9)/.test(hit.nteeCode)) p += 4;
  if (hit.nteeCode && /^T(30|31)/.test(hit.nteeCode)) p += 2; // public/community foundations
  if (hit.subsectionCode != null && hit.subsectionCode !== 3) p -= 10;
  return p;
}

export function toCandidate(
  detail: OrganizationDetail,
  extra: {
    source: FunderProfileSource;
    rawR2Key: string | null;
    fetchedAt: Date;
    website?: string | null;
    matchedQueries: string[];
  },
): FoundationCandidate {
  const latest = detail.latest;
  return {
    source: extra.source,
    ein: detail.ein,
    name: detail.name,
    city: detail.city,
    state: detail.state,
    nteeCode: detail.nteeCode,
    subsectionCode: detail.subsectionCode,
    foundationType: detail.foundationType,
    latestFilingYear: latest?.taxYear ?? null,
    latestFormType: latest?.formType ?? null,
    totalAssetsCents: latest?.totalAssetsCents ?? null,
    totalGivingCents: latest?.totalGivingCents ?? null,
    website: extra.website ?? null,
    propublicaUrl: extra.source === "propublica" ? propublicaOrgPageUrl(detail.ein) : null,
    rawR2Key: extra.rawR2Key,
    fetchedAt: extra.fetchedAt,
    matchedQueries: extra.matchedQueries,
    filings: detail.filings,
  };
}

function cleanKeywords(keywords: string[], max: number): string[] {
  const seen = new Map<string, string>();
  for (const k of keywords) {
    const t = k.replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 80) continue;
    if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  const out = [...seen.values()].slice(0, max);
  return out.length ? out : ["foundation"];
}

function sampleSearch(
  ctx: AppContext,
  params: SearchFoundationsParams,
  queries: string[],
): SearchFoundationsResult {
  const state = params.state.toUpperCase();
  const candidates = SAMPLE_FOUNDATIONS.filter((s) => s.detail.state === state).map((s) => {
    const hay = `${s.detail.name} ${s.detail.city ?? ""}`.toLowerCase();
    const matched = queries.filter((q) =>
      q
        .toLowerCase()
        .replace(/"/g, "")
        .split(/\s+/)
        .some((w) => w.length > 2 && hay.includes(w)),
    );
    return toCandidate(s.detail, {
      source: "sample",
      rawR2Key: null,
      fetchedAt: ctx.now(),
      website: s.website,
      matchedQueries: matched,
    });
  });
  return {
    candidates,
    stats: {
      queries: queries.length,
      hits: candidates.length,
      detailFetched: candidates.length,
      privateFoundations: candidates.length,
      network: 0,
      cacheHits: 0,
      errors: 0,
    },
  };
}

export async function searchFoundations(
  ctx: AppContext,
  params: SearchFoundationsParams,
  opts: SearchFoundationsOptions = {},
): Promise<SearchFoundationsResult> {
  const state = params.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error(`invalid state "${params.state}"`);
  const queries = cleanKeywords(params.keywords, opts.maxQueries ?? 8);
  const source = opts.source ?? (isFake(ctx.env) ? "sample" : "propublica");
  if (source === "sample") return sampleSearch(ctx, { ...params, state }, queries);

  const log = ctx.logger.child({ module: "prospecting" });
  const client = opts.client ?? new ProPublicaClient(ctx, opts);
  const stats = { queries: 0, hits: 0, detailFetched: 0, privateFoundations: 0, errors: 0 };

  const hits = new Map<string, { hit: SearchHit; queries: string[] }>();
  for (const q of queries) {
    try {
      // 501(c)(3) only: private foundations are 501(c)(3) organizations.
      const page = await client.search({ q, state, cCode: 3, nteeMajor: params.nteeMajor });
      stats.queries++;
      for (const hit of page.hits) {
        if (hit.state && hit.state !== state) continue;
        const cur = hits.get(hit.ein);
        if (cur) cur.queries.push(q);
        else hits.set(hit.ein, { hit, queries: [q] });
      }
    } catch (e) {
      stats.errors++;
      log.warn("prospecting.search_failed", { error: String(e) });
    }
  }
  if (stats.queries === 0 && queries.length > 0) {
    throw new Error("ProPublica search failed for every query");
  }
  stats.hits = hits.size;

  const ranked = [...hits.values()]
    .map((h) => ({ ...h, priority: hitPriority(h.hit, h.queries.length) }))
    .filter((h) => h.priority > -5)
    .sort((a, b) => b.priority - a.priority || a.hit.ein.localeCompare(b.hit.ein))
    .slice(0, opts.maxDetailFetches ?? DEFAULT_MAX_DETAIL_FETCHES);

  const candidates: FoundationCandidate[] = [];
  for (const h of ranked) {
    try {
      const res = await client.organization(h.hit.ein);
      stats.detailFetched++;
      if (!res.detail?.isPrivateFoundation) continue;
      candidates.push(
        toCandidate(res.detail, {
          source: "propublica",
          rawR2Key: res.key,
          fetchedAt: res.fetchedAt,
          matchedQueries: h.queries,
        }),
      );
    } catch (e) {
      stats.errors++;
      log.warn("prospecting.organization_failed", { ein: h.hit.ein, error: String(e) });
    }
  }
  stats.privateFoundations = candidates.length;
  return { candidates, stats: { ...stats, ...client.stats } };
}
