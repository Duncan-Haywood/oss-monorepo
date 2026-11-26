// buildProspects: org profile -> ProPublica search params -> private-foundation candidates ->
// LLM fit score (prospecting.score) + deterministic caps -> upsert org_prospects. The user's
// status / notes / nextStepAt are never touched by a rebuild.
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { funderProfiles, orgProspects } from "../../db/schema/prospects";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { LlmOutputError, LlmRefusalError } from "../../ports/llm";
import { formatFactsForPrompt, getFactsForDrafting } from "../knowledge";
import { getOrgProfile, getOrgPromptProfile, type OrgProfile } from "../orgs";
import { ProPublicaClient } from "./propublica";
import {
  buildProspectContext,
  buildProspectPrompt,
  finalizeProspectScore,
  funderFacts,
  type OrgGeography,
  PROSPECT_PROMPT_VERSION,
  PROSPECT_SCORE_PURPOSE,
  ProspectScoreOutput,
  SYSTEM_PROMPT,
} from "./scoring";
import {
  type FoundationCandidate,
  type SearchFoundationsOptions,
  searchFoundations,
} from "./search";

/** Max LLM scoring calls per refresh (cost control); the rest are scored on later refreshes. */
export const MAX_SCORES_PER_RUN = 15;
const MAX_FACTS_IN_PROMPT = 120;
const LLM_CONCURRENCY = 3;
const IN_CHUNK = 50;

/** Ids for org_prospects ("prs_"); lib/ids has no prospect prefix yet (see integration notes). */
export const newProspectId = () => `prs_${newId("org").slice(4)}`;

export interface DerivedSearch {
  geography: OrgGeography;
  /** One ProPublica query each. */
  keywords: string[];
}

const STATE_RE = /^[A-Z]{2}$/;
const GENERIC_PLACE_WORDS =
  /\b(county|city|town|village|region|area|nation|reservation|pueblo|tribe|of|the)\b/gi;

/**
 * Search params from the org profile. ProPublica's `q` matches organization names and cities, so
 * we search for (a) foundations in / named after the org's places, (b) distinctive focus-area
 * phrases in foundation names, (c) a generic "foundation" query for the state. Pure.
 */
export function deriveSearchParams(
  profile: Pick<OrgProfile, "state" | "city" | "serviceAreas" | "focusAreas">,
): DerivedSearch {
  const states: string[] = [];
  const addState = (s: string | null | undefined) => {
    const t = s?.trim().toUpperCase();
    if (t && STATE_RE.test(t) && !states.includes(t)) states.push(t);
  };
  addState(profile.state);
  const placeSet = new Map<string, string>();
  const addPlace = (p: string) => {
    const t = p.replace(/\s+/g, " ").trim();
    if (t.length >= 3 && !placeSet.has(t.toLowerCase())) placeSet.set(t.toLowerCase(), t);
  };
  if (profile.city) addPlace(profile.city);
  for (const area of profile.serviceAreas ?? []) {
    const [place, region] = area.split(",").map((s) => s.trim());
    if (region) addState(region);
    if (place) addPlace(place);
  }
  const places = [...placeSet.values()];

  const keywords: string[] = [];
  const addKw = (k: string) => {
    const t = k.replace(/\s+/g, " ").trim();
    if (t.length >= 3 && !keywords.some((x) => x.toLowerCase() === t.toLowerCase()))
      keywords.push(t);
  };
  for (const p of places.slice(0, 3)) {
    const core = p.replace(GENERIC_PLACE_WORDS, " ").replace(/\s+/g, " ").trim();
    if (core.length >= 3) addKw(core);
  }
  for (const f of (profile.focusAreas ?? []).slice(0, 3)) {
    const t = f.replace(/["]/g, "").trim();
    if (t.length >= 3) addKw(t.includes(" ") ? `"${t}"` : t);
  }
  addKw("foundation");
  return { geography: { states: states.slice(0, 2), places }, keywords: keywords.slice(0, 7) };
}

export interface BuildProspectsOptions extends SearchFoundationsOptions {
  maxScores?: number;
}

export interface BuildProspectsResult {
  states: string[];
  candidates: number;
  scored: number;
  unchanged: number;
  failed: number;
  created: number;
  network: number;
  cacheHits: number;
  searchErrors: number;
}

async function mapLimit<T>(xs: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < xs.length) await fn(xs[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
}

async function upsertFunderProfiles(ctx: AppContext, candidates: FoundationCandidate[]) {
  const now = ctx.now();
  for (const c of candidates) {
    const values = {
      source: c.source,
      name: c.name,
      city: c.city,
      state: c.state,
      nteeCode: c.nteeCode,
      subsectionCode: c.subsectionCode,
      foundationType: c.foundationType,
      latestFilingYear: c.latestFilingYear,
      latestFormType: c.latestFormType,
      totalAssetsCents: c.totalAssetsCents,
      totalGivingCents: c.totalGivingCents,
      website: c.website,
      propublicaUrl: c.propublicaUrl,
      rawR2Key: c.rawR2Key,
      fetchedAt: c.fetchedAt,
    };
    await ctx.db
      .insert(funderProfiles)
      .values({ ein: c.ein, ...values })
      .onConflictDoUpdate({
        target: funderProfiles.ein,
        // Keep a website a human (or later enrichment) added when ProPublica has none.
        set: { ...values, website: c.website ?? undefined, updatedAt: now },
      });
  }
}

/** Larger reported giving first, then local matches. Pure. */
export function rankCandidates(
  candidates: FoundationCandidate[],
  geography: OrgGeography,
): FoundationCandidate[] {
  const places = geography.places.map((p) => p.toLowerCase());
  const local = (c: FoundationCandidate) =>
    c.city != null && places.some((p) => p.includes(c.city?.toLowerCase() ?? "\0"));
  return [...candidates].sort(
    (a, b) =>
      Number(local(b)) - Number(local(a)) ||
      Number(b.foundationType === "private_non_operating") -
        Number(a.foundationType === "private_non_operating") ||
      (b.totalGivingCents ?? -1) - (a.totalGivingCents ?? -1) ||
      a.ein.localeCompare(b.ein),
  );
}

export async function buildProspects(
  ctx: AppContext,
  orgId: string,
  opts: BuildProspectsOptions = {},
): Promise<BuildProspectsResult> {
  const log = ctx.logger.child({ module: "prospecting", orgId });
  const profile = await getOrgProfile(ctx, orgId);
  const derived = deriveSearchParams(profile);
  const result: BuildProspectsResult = {
    states: derived.geography.states,
    candidates: 0,
    scored: 0,
    unchanged: 0,
    failed: 0,
    created: 0,
    network: 0,
    cacheHits: 0,
    searchErrors: 0,
  };
  if (derived.geography.states.length === 0) return result;

  // 1. Candidates (one polite client per run so the 1 req/s spacing spans every state).
  const client = opts.client ?? new ProPublicaClient(ctx, opts);
  const byEin = new Map<string, FoundationCandidate>();
  for (const state of derived.geography.states) {
    const res = await searchFoundations(
      ctx,
      { state, keywords: derived.keywords },
      { ...opts, client },
    );
    result.searchErrors += res.stats.errors;
    for (const c of res.candidates) if (!byEin.has(c.ein)) byEin.set(c.ein, c);
  }
  result.network = client.stats.network;
  result.cacheHits = client.stats.cacheHits;
  const candidates = rankCandidates([...byEin.values()], derived.geography);
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;
  await upsertFunderProfiles(ctx, candidates);

  // 2. Org context (stable across this run's calls -> prompt-cached).
  const [profileText, facts] = await Promise.all([
    getOrgPromptProfile(ctx, orgId),
    getFactsForDrafting(ctx, orgId, { includeProposed: true, allProjects: true }),
  ]);
  const promptFacts = facts.slice(0, MAX_FACTS_IN_PROMPT);
  const orgFactIds = new Set(promptFacts.map((f) => f.id));
  const context = buildProspectContext({
    profileText,
    geography: derived.geography,
    factsText: formatFactsForPrompt(promptFacts),
  });

  const existing = new Map<string, { id: string; scoreInputHash: string | null }>();
  const eins = candidates.map((c) => c.ein);
  for (let i = 0; i < eins.length; i += IN_CHUNK) {
    const rows = await ctx.db
      .select({ id: orgProspects.id, ein: orgProspects.ein, hash: orgProspects.scoreInputHash })
      .from(orgProspects)
      .where(
        and(eq(orgProspects.orgId, orgId), inArray(orgProspects.ein, eins.slice(i, i + IN_CHUNK))),
      )
      .all();
    for (const r of rows) existing.set(r.ein, { id: r.id, scoreInputHash: r.hash });
  }

  // 3. Score (skip unchanged inputs), capped per run.
  const jobs: { c: FoundationCandidate; prompt: string; hash: string; ff: Set<string> }[] = [];
  for (const c of candidates) {
    const ff = funderFacts(c);
    const prompt = buildProspectPrompt(c, ff);
    const hash = await sha256Hex(
      `${PROSPECT_PROMPT_VERSION}\n${SYSTEM_PROMPT}\n${context}\n${prompt}`,
    );
    if (existing.get(c.ein)?.scoreInputHash === hash) {
      result.unchanged++;
      continue;
    }
    jobs.push({ c, prompt, hash, ff: new Set(ff.map((f) => f.id)) });
  }
  const batch = jobs.slice(0, opts.maxScores ?? MAX_SCORES_PER_RUN);

  await mapLimit(batch, LLM_CONCURRENCY, async ({ c, prompt, hash, ff }) => {
    try {
      const { data } = await ctx.llm.generateStructured({
        purpose: PROSPECT_SCORE_PURPOSE,
        orgId,
        system: SYSTEM_PROMPT,
        context,
        prompt,
        schema: ProspectScoreOutput,
        effort: "low",
        maxTokens: 4_000, // adaptive thinking shares this budget
      });
      const final = finalizeProspectScore({
        output: data,
        orgFactIds,
        funderFactIds: ff,
        totalGivingCents: c.totalGivingCents,
        foundationType: c.foundationType,
      });
      if (final.droppedFactIds.length) {
        log.warn("prospecting.dropped_fact_ids", {
          ein: c.ein,
          count: final.droppedFactIds.length,
        });
      }
      const now = ctx.now();
      const scoreValues = {
        fitScore: final.fitScore,
        reasons: final.reasons,
        approach: final.approach,
        approachNotes: final.approachNotes,
        scoreInputHash: hash,
        scoredAt: now,
      };
      // User-owned columns (status, notes, nextStepAt) are not in the update set.
      await ctx.db
        .insert(orgProspects)
        .values({
          id: newProspectId(),
          orgId,
          ein: c.ein,
          ...scoreValues,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [orgProspects.orgId, orgProspects.ein],
          set: { ...scoreValues, updatedAt: now },
        });
      result.scored++;
      if (!existing.has(c.ein)) result.created++;
    } catch (e) {
      result.failed++;
      if (e instanceof LlmRefusalError || e instanceof LlmOutputError) {
        log.warn("prospecting.score_failed", { ein: c.ein, error: e.message });
        return;
      }
      log.error("prospecting.score_error", { ein: c.ein, error: String(e) });
    }
  });
  log.info("prospecting.built", { ...result });
  return result;
}
