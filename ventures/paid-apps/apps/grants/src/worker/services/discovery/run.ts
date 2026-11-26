// Discovery runs: query official grant APIs, upsert the public catalog, record a discovery_runs row,
// then ask matching to re-score every org.
//
// Searches = defaults ∪ every org's AI search plan (plans.ts), de-duplicated, capped at
// MAX_QUERIES_PER_RUN. Hits are pre-ranked by keyword hits against all org plans so the per-run
// caps (detail fetches / upserts) keep the most relevant new opportunities; what the caps drop is
// logged as counts and picked up by later runs.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { discoveryRuns, opportunities, orgProfiles } from "../../db/schema";
import { isFake } from "../../env";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { enqueue } from "../../queues/enqueue";
import { recordHash, type UpsertOutcome, upsertCatalogOpportunity } from "./catalog";
import {
  fetchGrantsGovOpportunity,
  listingFingerprint,
  type SearchHit,
  searchGrantsGov,
  toCatalogRecord,
} from "./grants-gov";
import {
  buildSearchList,
  DEFAULT_QUERIES,
  keywordSpec,
  type RelevanceTerms,
  rankByRelevance,
  relevanceScore,
  type SearchList,
  type SearchSpec,
} from "./plans";
import { seedSampleOpportunities } from "./sample-opportunities";
import {
  type SimplerOpportunity,
  searchSimpler,
  simplerAlns,
  simplerToCatalogRecord,
} from "./simpler-grants";
import { sweepOpportunityStatuses } from "./sweep";

export { DEFAULT_QUERIES };

export interface DiscoveryCounts {
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  /** Stored forecasts that are now posted (forecast -> NOFO transition). */
  forecastsPosted: number;
}

/** What per-run caps left out (counts only; logged as discovery.caps and kept on the run row). */
export interface DroppedByCaps {
  /** Distinct searches over the per-run query cap. */
  queries: number;
  /** Orgs whose stale plan was kept because the per-run re-plan cap was reached. */
  replansDeferred: number;
  /** Hits beyond maxPages for their search. */
  hitsBeyondPages: number;
  /** Changed/new hits not processed because of maxDetailFetches / maxUpserts (next run). */
  deferred: number;
}

const zeroCounts = (): DiscoveryCounts => ({
  found: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  errors: 0,
  forecastsPosted: 0,
});

export interface DiscoveryRunOptions {
  trigger: "cron" | "manual";
  /** Explicit keyword searches (default filters). Overrides the planned search list. */
  queries?: string[];
  /** Explicit searches (keyword / filters / ALN). Overrides `queries` and the planned list. */
  searches?: SearchSpec[];
  maxPages?: number;
  rows?: number;
  /** Pause between API calls (be polite to the APIs). */
  throttleMs?: number;
  maxQueries?: number;
  /** Enqueue matching.score_org for every org afterwards (default true). */
  rescore?: boolean;
}

export interface GrantsGovRunOptions extends DiscoveryRunOptions {
  /** Upper bound on fetchOpportunity calls per run; remaining hits are picked up next run. */
  maxDetailFetches?: number;
  /** Skip the detail call when the listing is unchanged and was fetched within this window. */
  detailMaxAgeMs?: number;
}

export interface SimplerRunOptions extends DiscoveryRunOptions {
  /** Upper bound on upserts per run (most relevant first); the rest are picked up next run. */
  maxUpserts?: number;
}

export interface DiscoveryRunResult {
  runId: string;
  counts: DiscoveryCounts;
  /** Created/updated opportunity ids, most relevant first. */
  changedIds: string[];
  forecastPostedIds: string[];
  dropped: DroppedByCaps;
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Default queries + every org's focus areas, case-insensitively de-duplicated (no AI plans). */
export async function discoveryQueries(ctx: AppContext, max = 15): Promise<string[]> {
  const rows = await ctx.db.select({ focusAreas: orgProfiles.focusAreas }).from(orgProfiles).all();
  const seen = new Map<string, string>();
  const add = (q: string) => {
    const t = q.replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 80) return;
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
  };
  for (const q of DEFAULT_QUERIES) add(q);
  for (const r of rows) for (const q of r.focusAreas ?? []) add(q);
  return [...seen.values()].slice(0, max);
}

/** Explicit searches/queries from options, else defaults ∪ all org plans (planning as needed). */
async function resolveSearches(ctx: AppContext, opts: DiscoveryRunOptions): Promise<SearchList> {
  const explicit = opts.searches ?? opts.queries?.map(keywordSpec);
  if (!explicit) return buildSearchList(ctx, { maxQueries: opts.maxQueries });
  const terms: RelevanceTerms = {
    keywords: [...new Set(explicit.map((s) => s.label.toLowerCase()))],
    alns: explicit.flatMap((s) => (s.aln ? [s.aln] : [])),
  };
  return { specs: explicit, terms, dropped: { queries: 0, replansDeferred: 0 }, planStatus: {} };
}

const describeSpec = (s: SearchSpec) => (s.aln ? `aln:${s.aln}` : s.keyword);

/** Enqueue a matching re-score for every org that has a profile. Failures are logged, not thrown. */
export async function enqueueRescoreAllOrgs(ctx: AppContext): Promise<number> {
  const orgs = await ctx.db.select({ orgId: orgProfiles.orgId }).from(orgProfiles).all();
  let n = 0;
  for (const { orgId } of orgs) {
    try {
      await enqueue(ctx, { type: "matching.score_org", orgId });
      n++;
    } catch (e) {
      ctx.logger.warn("discovery.rescore_enqueue_failed", { orgId, error: String(e) });
    }
  }
  return n;
}

async function startRun(
  ctx: AppContext,
  source: "grants_gov" | "simpler_grants",
  trigger: "cron" | "manual",
  query: Record<string, unknown>,
) {
  const id = newId("dsc");
  await ctx.db
    .insert(discoveryRuns)
    .values({ id, source, trigger, status: "running", query, startedAt: ctx.now() });
  return id;
}

async function finishRun(
  ctx: AppContext,
  id: string,
  counts: DiscoveryCounts,
  error: string | null,
  query?: Record<string, unknown>,
) {
  await ctx.db
    .update(discoveryRuns)
    .set({
      status: error ? "failed" : "succeeded",
      found: counts.found,
      created: counts.created,
      updated: counts.updated,
      error,
      finishedAt: ctx.now(),
      ...(query ? { query } : {}),
    })
    .where(eq(discoveryRuns.id, id));
}

function logCaps(
  ctx: AppContext,
  source: string,
  runId: string,
  dropped: DroppedByCaps,
  list: SearchList,
) {
  ctx.logger.info("discovery.caps", {
    source,
    runId,
    searches: list.specs.length,
    ...dropped,
    plans: list.planStatus,
  });
}

/** Existing grants.gov rows for these source ids (D1 caps bound params, so chunk). */
async function existingBySourceId(ctx: AppContext, ids: string[]) {
  const out = new Map<
    string,
    { id: string; contentHash: string | null; fetchedAt: Date | null; updatedAt: Date }
  >();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const rows = await ctx.db
      .select({
        id: opportunities.id,
        sourceId: opportunities.sourceId,
        contentHash: opportunities.contentHash,
        fetchedAt: opportunities.fetchedAt,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .where(and(eq(opportunities.source, "grants_gov"), inArray(opportunities.sourceId, chunk)))
      .all();
    for (const r of rows) out.set(r.sourceId, r);
  }
  return out;
}

function tally(
  counts: DiscoveryCounts,
  res: UpsertOutcome,
  changedIds: string[],
  forecastPostedIds: string[],
) {
  counts[res.outcome]++;
  if (res.outcome !== "unchanged") changedIds.push(res.id);
  if (res.forecastPosted) {
    counts.forecastsPosted++;
    forecastPostedIds.push(res.id);
  }
}

/**
 * Grants.gov discovery. contentHash = "<listing fingerprint hash>.<full record hash>" so a listing
 * that is unchanged and recently fetched skips the fetchOpportunity call entirely.
 */
export async function runGrantsGovDiscovery(
  ctx: AppContext,
  opts: GrantsGovRunOptions,
): Promise<DiscoveryRunResult> {
  const maxPages = opts.maxPages ?? 3;
  const rows = opts.rows ?? 25;
  const throttleMs = opts.throttleMs ?? 400;
  const maxDetailFetches = opts.maxDetailFetches ?? 150;
  const detailMaxAgeMs = opts.detailMaxAgeMs ?? 7 * 24 * 3600_000;
  const list = await resolveSearches(ctx, opts);
  const query: Record<string, unknown> = {
    queries: list.specs.map(describeSpec),
    oppStatuses: "forecasted|posted",
    maxPages,
    rows,
  };
  const runId = await startRun(ctx, "grants_gov", opts.trigger, query);
  const counts = zeroCounts();
  const changedIds: string[] = [];
  const forecastPostedIds: string[] = [];
  const dropped: DroppedByCaps = { ...list.dropped, hitsBeyondPages: 0, deferred: 0 };
  let calls = 0;
  const throttle = async () => {
    if (calls++ > 0) await sleep(throttleMs);
  };

  try {
    // 1. Search: collect unique hits across searches, remembering which searches found each.
    const hits = new Map<string, { hit: SearchHit; keywords: Set<string> }>();
    let failedQueries = 0;
    for (const spec of list.specs) {
      try {
        for (let page = 0; page < maxPages; page++) {
          await throttle();
          const res = await searchGrantsGov(ctx.web, {
            keyword: spec.keyword,
            eligibilities: spec.eligibilities,
            fundingCategories: spec.fundingCategories,
            aln: spec.aln,
            rows,
            startRecordNum: page * rows,
          });
          for (const hit of res.hits) {
            const entry = hits.get(hit.id) ?? { hit, keywords: new Set<string>() };
            entry.keywords.add(spec.label.toLowerCase());
            hits.set(hit.id, entry);
          }
          if (res.hits.length < rows || (page + 1) * rows >= res.hitCount) break;
          if (page === maxPages - 1) dropped.hitsBeyondPages += res.hitCount - (page + 1) * rows;
        }
      } catch (e) {
        failedQueries++;
        counts.errors++;
        ctx.logger.warn("discovery.grants_gov.search_failed", {
          search: describeSpec(spec),
          error: String(e),
        });
      }
    }
    if (list.specs.length > 0 && failedQueries === list.specs.length) {
      throw new Error("all grants.gov searches failed");
    }
    counts.found = hits.size;

    // 2. Pre-rank by relevance to all org plans, then details + upsert (capped).
    const ranked = rankByRelevance([...hits.entries()], ([, { hit, keywords }]) =>
      relevanceScore(
        [hit.title, hit.agency, hit.number].filter(Boolean).join(" "),
        keywords,
        hit.cfdaList ?? [],
        list.terms,
      ),
    );
    const existing = await existingBySourceId(ctx, [...hits.keys()]);
    const funderCache = new Map<string, string>();
    let detailFetches = 0;
    for (const [id, { hit, keywords }] of ranked) {
      const listingHash = (await sha256Hex(listingFingerprint(hit))).slice(0, 16);
      const prev = existing.get(id);
      const fresh =
        prev?.fetchedAt && ctx.now().getTime() - prev.fetchedAt.getTime() < detailMaxAgeMs;
      if (prev && fresh && prev.contentHash?.startsWith(`${listingHash}.`)) {
        counts.unchanged++;
        continue;
      }
      if (detailFetches >= maxDetailFetches) {
        dropped.deferred++; // next run
        continue;
      }
      try {
        await throttle();
        detailFetches++;
        const detail = await fetchGrantsGovOpportunity(ctx.web, id).catch((e) => {
          ctx.logger.warn("discovery.grants_gov.fetch_failed", { id, error: String(e) });
          return null;
        });
        if (!detail || detail.id !== id) {
          // Never replace a good row with a listing-only one; retried on the next run.
          if (detail) ctx.logger.warn("discovery.grants_gov.detail_id_mismatch", { id });
          counts.errors++;
          continue;
        }
        const record = toCatalogRecord(hit, detail);
        const contentHash = `${listingHash}.${await recordHash(record)}`;
        if (prev && prev.contentHash === contentHash) {
          // Verified unchanged: refresh fetchedAt only (updatedAt kept, so nothing looks modified).
          await ctx.db
            .update(opportunities)
            .set({ fetchedAt: ctx.now(), updatedAt: prev.updatedAt })
            .where(eq(opportunities.id, prev.id));
          counts.unchanged++;
          continue;
        }
        const rawR2Key = `catalog/grants_gov/${encodeURIComponent(id)}.json`;
        await ctx.env.FILES.put(
          rawR2Key,
          JSON.stringify({ fetchedAt: ctx.now().toISOString(), hit, detail }),
          { httpMetadata: { contentType: "application/json" } },
        );
        const res = await upsertCatalogOpportunity(ctx, record, {
          contentHash,
          rawR2Key,
          keywords: [...keywords],
          funderCache,
        });
        tally(counts, res, changedIds, forecastPostedIds);
      } catch (e) {
        counts.errors++;
        ctx.logger.warn("discovery.grants_gov.upsert_failed", { id, error: String(e) });
      }
    }
    await finishRun(ctx, runId, counts, null, { ...query, dropped });
  } catch (e) {
    await finishRun(ctx, runId, counts, String(e).slice(0, 500), { ...query, dropped });
    ctx.logger.error("discovery.grants_gov.failed", { runId, error: String(e) });
    return { runId, counts, changedIds, forecastPostedIds, dropped };
  }
  logCaps(ctx, "grants_gov", runId, dropped, list);
  ctx.logger.info("discovery.grants_gov.done", { runId, ...counts });
  if (opts.rescore !== false) await enqueueRescoreAllOrgs(ctx);
  return { runId, counts, changedIds, forecastPostedIds, dropped };
}

/**
 * Simpler.Grants.gov discovery (requires SIMPLER_GRANTS_API_KEY). Search results carry the full
 * summary, so there are no detail calls. Records whose opportunity number (or legacy Grants.gov
 * id) matches a Grants.gov row are merged into that row (see upsertCatalogOpportunity).
 */
export async function runSimplerDiscovery(
  ctx: AppContext,
  opts: SimplerRunOptions,
): Promise<DiscoveryRunResult> {
  const apiKey = ctx.env.SIMPLER_GRANTS_API_KEY;
  const counts = zeroCounts();
  const dropped: DroppedByCaps = {
    queries: 0,
    replansDeferred: 0,
    hitsBeyondPages: 0,
    deferred: 0,
  };
  if (!apiKey) {
    // Recorded so operators can see the run was intentionally skipped.
    const runId = await startRun(ctx, "simpler_grants", opts.trigger, {});
    await finishRun(ctx, runId, counts, "SIMPLER_GRANTS_API_KEY is not set");
    return { runId, counts, changedIds: [], forecastPostedIds: [], dropped };
  }
  const maxPages = opts.maxPages ?? 3;
  const rows = opts.rows ?? 25;
  const throttleMs = opts.throttleMs ?? 400;
  const maxUpserts = opts.maxUpserts ?? 300;
  const list = await resolveSearches(ctx, opts);
  Object.assign(dropped, list.dropped);
  const query: Record<string, unknown> = {
    queries: list.specs.map(describeSpec),
    opportunityStatus: ["forecasted", "posted"],
    maxPages,
    rows,
  };
  const runId = await startRun(ctx, "simpler_grants", opts.trigger, query);
  const changedIds: string[] = [];
  const forecastPostedIds: string[] = [];
  let calls = 0;
  const throttle = async () => {
    if (calls++ > 0) await sleep(throttleMs);
  };
  try {
    const hits = new Map<string, { item: SimplerOpportunity; keywords: Set<string> }>();
    let failed = 0;
    for (const spec of list.specs) {
      try {
        for (let page = 1; page <= maxPages; page++) {
          await throttle();
          const res = await searchSimpler(ctx.web, apiKey, {
            query: spec.keyword,
            eligibilities: spec.eligibilities,
            fundingCategories: spec.fundingCategories,
            aln: spec.aln,
            pageOffset: page,
            pageSize: rows,
          });
          for (const item of res.items) {
            const entry = hits.get(item.opportunity_id) ?? { item, keywords: new Set<string>() };
            entry.keywords.add(spec.label.toLowerCase());
            hits.set(item.opportunity_id, entry);
          }
          if (res.items.length < rows || page >= res.totalPages) break;
          if (page === maxPages) dropped.hitsBeyondPages += res.totalRecords - page * rows;
        }
      } catch (e) {
        failed++;
        counts.errors++;
        // Never log request headers (API key).
        ctx.logger.warn("discovery.simpler.search_failed", {
          search: describeSpec(spec),
          error: String(e).slice(0, 300),
        });
      }
    }
    if (list.specs.length > 0 && failed === list.specs.length) {
      throw new Error("all simpler.grants.gov searches failed");
    }
    counts.found = hits.size;
    const ranked = rankByRelevance([...hits.values()], ({ item, keywords }) =>
      relevanceScore(
        [item.opportunity_title, item.agency_name, item.opportunity_number]
          .filter(Boolean)
          .join(" "),
        keywords,
        simplerAlns(item),
        list.terms,
      ),
    );
    dropped.deferred += Math.max(0, ranked.length - maxUpserts);
    const funderCache = new Map<string, string>();
    for (const { item, keywords } of ranked.slice(0, maxUpserts)) {
      try {
        const record = simplerToCatalogRecord(item);
        const contentHash = `sgg.${await recordHash(record)}`;
        const rawR2Key = `catalog/simpler_grants/${encodeURIComponent(item.opportunity_id)}.json`;
        const res = await upsertCatalogOpportunity(ctx, record, {
          contentHash,
          rawR2Key,
          keywords: [...keywords],
          funderCache,
          grantsGovId: item.legacy_opportunity_id,
        });
        if (res.outcome !== "unchanged" && !res.mergedInto) {
          await ctx.env.FILES.put(
            rawR2Key,
            JSON.stringify({ fetchedAt: ctx.now().toISOString(), item }),
            { httpMetadata: { contentType: "application/json" } },
          );
        }
        tally(counts, res, changedIds, forecastPostedIds);
      } catch (e) {
        counts.errors++;
        ctx.logger.warn("discovery.simpler.upsert_failed", {
          id: item.opportunity_id,
          error: String(e).slice(0, 300),
        });
      }
    }
    await finishRun(ctx, runId, counts, null, { ...query, dropped });
  } catch (e) {
    await finishRun(ctx, runId, counts, String(e).slice(0, 500), { ...query, dropped });
    ctx.logger.error("discovery.simpler.failed", { runId, error: String(e).slice(0, 300) });
    return { runId, counts, changedIds, forecastPostedIds, dropped };
  }
  logCaps(ctx, "simpler_grants", runId, dropped, list);
  ctx.logger.info("discovery.simpler.done", { runId, ...counts });
  if (opts.rescore !== false) await enqueueRescoreAllOrgs(ctx);
  return { runId, counts, changedIds, forecastPostedIds, dropped };
}

/** Offline / FAKE_EXTERNALS mode: refresh the labeled sample catalog instead of calling APIs. */
export async function runSampleDiscovery(
  ctx: AppContext,
  source: "grants_gov" | "simpler_grants",
  trigger: "cron" | "manual",
  opts: { rescore?: boolean } = {},
) {
  const runId = await startRun(ctx, source, trigger, { mode: "sample_catalog" });
  const counts = zeroCounts();
  try {
    const res = await seedSampleOpportunities(ctx);
    Object.assign(counts, res);
    await finishRun(ctx, runId, counts, null);
  } catch (e) {
    await finishRun(ctx, runId, counts, String(e).slice(0, 500));
    throw e;
  }
  if (opts.rescore !== false) await enqueueRescoreAllOrgs(ctx);
  return { runId, counts };
}

/** Daily status sweep; never fails the discovery job. */
async function sweepSafely(ctx: AppContext) {
  try {
    return await sweepOpportunityStatuses(ctx);
  } catch (e) {
    ctx.logger.warn("discovery.sweep.failed", { error: String(e).slice(0, 300) });
    return null;
  }
}

/** Entry point for the discovery.run job (daily cron enqueues grants_gov, + simpler with a key). */
export async function runDiscoveryForSource(
  ctx: AppContext,
  source: "grants_gov" | "simpler_grants",
  trigger: "cron" | "manual",
) {
  // The grants_gov job runs once a day: it also closes/archives expired rows, before matching.
  if (source === "grants_gov") await sweepSafely(ctx);
  if (isFake(ctx.env)) return runSampleDiscovery(ctx, source, trigger);
  if (source === "simpler_grants") return runSimplerDiscovery(ctx, { trigger });
  return runGrantsGovDiscovery(ctx, { trigger });
}

export async function listDiscoveryRuns(ctx: AppContext, limit = 50) {
  return ctx.db
    .select()
    .from(discoveryRuns)
    .orderBy(desc(discoveryRuns.startedAt))
    .limit(limit)
    .all();
}
