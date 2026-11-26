// Catalog persistence: funder + opportunity upserts keyed by (source, sourceId), with content hashing
// so unchanged listings are not rewritten (and do not trigger re-matching).
import type { OpportunityRequirements } from "@shared/content";
import type { OpportunityStatus } from "@shared/enums";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { funders, opportunities } from "../../db/schema";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { type CatalogRecord, isPlaceholder } from "./grants-gov";

/** Display name: one line, collapsed whitespace, no trailing punctuation; placeholders -> unknown. */
export function cleanFunderName(name: string | null | undefined): string {
  const s = (name ?? "")
    .split(/\r?\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim()
    .replace(/[\s,;:.]+$/, "");
  return s && !isPlaceholder(s) ? s : "Unknown funder";
}

/**
 * Dedupe key for funders: "U.S. Dept. of Labor", "Department of Labor" and "The Department of
 * Labor" all map to "department of labor"; "Kresge Foundation, Inc." to "kresge foundation".
 */
export function normalizeFunderName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bdept\b/g, "department")
    .replace(/^the /, "")
    .replace(/^(?:u s|us|united states) (?=department )/, "")
    .replace(/ (?:inc|incorporated|llc|corp|corporation|co)$/, "")
    .trim();
}

/** Finds or creates the funder by normalized name; returns its id. `cache` dedupes within a run. */
export async function upsertFunder(
  ctx: AppContext,
  f: CatalogRecord["funder"],
  cache?: Map<string, string>,
): Promise<string> {
  const name = cleanFunderName(f.name);
  const normalizedName = normalizeFunderName(name) || "unknown";
  const cached = cache?.get(normalizedName);
  if (cached) return cached;
  await ctx.db
    .insert(funders)
    .values({
      id: newId("fnd"),
      name,
      normalizedName,
      type: f.type,
      agencyCode: f.agencyCode ?? null,
      websiteUrl: f.websiteUrl ?? null,
    })
    .onConflictDoNothing({ target: funders.normalizedName });
  const row = await ctx.db
    .select({ id: funders.id, agencyCode: funders.agencyCode })
    .from(funders)
    .where(eq(funders.normalizedName, normalizedName))
    .get();
  if (!row) throw new Error("funder upsert failed");
  if (!row.agencyCode && f.agencyCode) {
    await ctx.db.update(funders).set({ agencyCode: f.agencyCode }).where(eq(funders.id, row.id));
  }
  cache?.set(normalizedName, row.id);
  return row.id;
}

/** Stable hash of the record's content fields (dates as epoch ms). */
export async function recordHash(r: CatalogRecord, extra: unknown = null): Promise<string> {
  const { openDate, closeDate, estimatedPostDate, estimatedCloseDate, ...rest } = r;
  const canonical = JSON.stringify(
    sortKeys({
      ...rest,
      openDate: openDate?.getTime() ?? null,
      closeDate: closeDate?.getTime() ?? null,
      estimatedPostDate: estimatedPostDate?.getTime() ?? null,
      estimatedCloseDate: estimatedCloseDate?.getTime() ?? null,
      extra,
    }),
  );
  return sha256Hex(canonical);
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, sortKeys(val)]),
    );
  }
  return v;
}

export type UpsertOutcome = {
  id: string;
  outcome: "created" | "updated" | "unchanged";
  /** The stored row moved from forecasted to posted with this write. */
  forecastPosted?: boolean;
  /** The record was merged into an existing row from the other official source. */
  mergedInto?: "grants_gov" | "simpler_grants";
};

export interface UpsertOptions {
  contentHash: string;
  rawR2Key?: string | null;
  keywords?: string[];
  /** Requirements to store (e.g. sample catalog RFPs). Omit to keep / reset on change. */
  requirements?: OpportunityRequirements | null;
  funderCache?: Map<string, string>;
  /** Write even when the hash matches (e.g. to roll sample deadlines forward). */
  force?: boolean;
  /** Simpler records: the Grants.gov opportunity id (legacy_opportunity_id), for dedupe. */
  grantsGovId?: string | null;
}

/** A posted opportunity whose deadline has passed is closed, whatever the source still says. */
export function effectiveStatus(
  status: OpportunityStatus,
  closeDate: Date | null,
  now: Date,
): OpportunityStatus {
  return status === "posted" && closeDate && closeDate.getTime() < now.getTime()
    ? "closed"
    : status;
}

type Values = ReturnType<typeof recordValues>;

function recordValues(r: CatalogRecord, funderId: string, now: Date) {
  return {
    sourceUrl: r.sourceUrl,
    funderId,
    funderName: cleanFunderName(r.funder.name),
    title: r.title,
    opportunityNumber: r.opportunityNumber,
    summary: r.summary,
    description: r.description,
    eligibilityText: r.eligibilityText,
    applicantTypes: r.applicantTypes,
    categories: r.categories,
    geographicScope: r.geographicScope,
    awardFloorCents: r.awardFloorCents,
    awardCeilingCents: r.awardCeilingCents,
    totalFundingCents: r.totalFundingCents,
    expectedAwards: r.expectedAwards,
    costSharingRequired: r.costSharingRequired,
    openDate: r.openDate,
    closeDate: r.closeDate,
    estimatedPostDate: r.estimatedPostDate,
    estimatedCloseDate: r.estimatedCloseDate,
    status: effectiveStatus(r.status, r.closeDate, now),
    submissionMethod: r.submissionMethod,
    submissionEmail: r.submissionEmail,
    submissionUrl: r.submissionUrl,
  };
}

const TEXT_FIELDS = ["summary", "description", "eligibilityText"] as const;
const LIST_FIELDS = ["applicantTypes", "categories"] as const;
const GAP_FIELDS = [
  "sourceUrl",
  "opportunityNumber",
  "geographicScope",
  "awardFloorCents",
  "awardCeilingCents",
  "totalFundingCents",
  "expectedAwards",
  "costSharingRequired",
  "openDate",
  "closeDate",
  "estimatedPostDate",
  "estimatedCloseDate",
  "submissionEmail",
  "submissionUrl",
] as const;

/**
 * Same opportunity from two official sources -> one row with the richer fields: the longer text,
 * the longer list, and for scalars the primary value with gaps filled from the secondary. Pure.
 */
export function mergeRicher(primary: Values, secondary: Partial<Values>): Values {
  const out: Values = { ...primary };
  for (const k of TEXT_FIELDS) {
    const b = secondary[k];
    if (typeof b === "string" && b.length > out[k].length) out[k] = b;
  }
  for (const k of LIST_FIELDS) {
    const b = secondary[k];
    if (Array.isArray(b) && b.length > out[k].length) out[k] = b;
  }
  const o = out as Record<string, unknown>;
  for (const k of GAP_FIELDS) if (o[k] == null && secondary[k] != null) o[k] = secondary[k];
  return out;
}

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a instanceof Date ? a.getTime() : (a ?? null)) ===
  JSON.stringify(b instanceof Date ? b.getTime() : (b ?? null));

/** Public row of the other official source carrying the same opportunity number / id. */
async function findTwin(ctx: AppContext, r: CatalogRecord, grantsGovId?: string | null) {
  if (r.source !== "grants_gov" && r.source !== "simpler_grants") return null;
  const other = r.source === "grants_gov" ? "simpler_grants" : "grants_gov";
  const pub = and(isNull(opportunities.privateToOrgId), ne(opportunities.source, r.source));
  if (grantsGovId && other === "grants_gov") {
    const byId = await ctx.db
      .select()
      .from(opportunities)
      .where(
        and(pub, eq(opportunities.source, "grants_gov"), eq(opportunities.sourceId, grantsGovId)),
      )
      .get();
    if (byId) return byId;
  }
  if (!r.opportunityNumber) return null;
  return (
    (await ctx.db
      .select()
      .from(opportunities)
      .where(
        and(
          pub,
          eq(opportunities.source, other),
          eq(opportunities.opportunityNumber, r.opportunityNumber),
        ),
      )
      .get()) ?? null
  );
}

/**
 * Upsert a public catalog opportunity by (source, sourceId). If the stored contentHash matches,
 * nothing is written. On change, parsed requirements are reset (they derive from the old text)
 * unless new ones are provided.
 *
 * Grants.gov and Simpler.Grants.gov list the same opportunities: a record whose opportunity
 * number (or Grants.gov id) matches a row of the other source is merged into that row (richer
 * fields kept) instead of creating a duplicate. Grants.gov is canonical: a Simpler row is adopted
 * by Grants.gov (source/sourceId switch, same row id), while Simpler only fills gaps in a Grants.gov
 * row and never touches its contentHash / fetchedAt (Grants.gov change detection stays intact).
 */
export async function upsertCatalogOpportunity(
  ctx: AppContext,
  r: CatalogRecord,
  opts: UpsertOptions,
): Promise<UpsertOutcome> {
  const existing = await ctx.db
    .select({
      id: opportunities.id,
      contentHash: opportunities.contentHash,
      keywords: opportunities.keywords,
      status: opportunities.status,
    })
    .from(opportunities)
    // Public catalog only: a catalog upsert must never match (and overwrite) an org-private row.
    .where(
      and(
        eq(opportunities.source, r.source),
        eq(opportunities.sourceId, r.sourceId),
        isNull(opportunities.privateToOrgId),
      ),
    )
    .get();
  if (existing && !opts.force && existing.contentHash === opts.contentHash) {
    return { id: existing.id, outcome: "unchanged" };
  }
  const funderId = await upsertFunder(ctx, r.funder, opts.funderCache);
  const now = ctx.now();
  const values = recordValues(r, funderId, now);
  const forecastPosted = (prev: OpportunityStatus | undefined) =>
    prev === "forecasted" && values.status !== "forecasted" && r.status === "posted";
  const mergeKeywords = (prev: string[] | null | undefined) =>
    [...new Set([...(prev ?? []), ...(opts.keywords ?? [])])].sort();

  if (existing) {
    await ctx.db
      .update(opportunities)
      .set({
        ...values,
        rawR2Key: opts.rawR2Key ?? null,
        contentHash: opts.contentHash,
        fetchedAt: now,
        keywords: mergeKeywords(existing.keywords),
        requirements: opts.requirements !== undefined ? opts.requirements : null,
      })
      .where(eq(opportunities.id, existing.id));
    return {
      id: existing.id,
      outcome: "updated",
      ...(forecastPosted(existing.status) ? { forecastPosted: true } : {}),
    };
  }

  const twin = await findTwin(ctx, r, opts.grantsGovId);
  if (twin && r.source === "grants_gov") {
    // Adopt the Simpler row: Grants.gov values win, Simpler fills gaps / richer text.
    const merged = mergeRicher(values, { ...twin, funderId: twin.funderId ?? funderId });
    await ctx.db
      .update(opportunities)
      .set({
        ...merged,
        source: "grants_gov",
        sourceId: r.sourceId,
        rawR2Key: opts.rawR2Key ?? twin.rawR2Key,
        contentHash: opts.contentHash,
        fetchedAt: now,
        keywords: mergeKeywords(twin.keywords),
        requirements: opts.requirements !== undefined ? opts.requirements : null,
      })
      .where(eq(opportunities.id, twin.id));
    return {
      id: twin.id,
      outcome: "updated",
      mergedInto: "simpler_grants",
      ...(forecastPosted(twin.status) ? { forecastPosted: true } : {}),
    };
  }
  if (twin) {
    // Simpler record for a Grants.gov row: only fill gaps / richer text, keep Grants.gov identity.
    const base: Values = { ...twin, funderId: twin.funderId ?? funderId };
    const merged = mergeRicher(base, values);
    const keywords = mergeKeywords(twin.keywords);
    const changed = (Object.keys(merged) as (keyof Values)[]).filter(
      (k) => !sameValue(merged[k], twin[k]),
    );
    const keywordsChanged = !sameValue(keywords, twin.keywords);
    if (changed.length === 0 && !keywordsChanged) {
      return { id: twin.id, outcome: "unchanged", mergedInto: "grants_gov" };
    }
    const patch: Partial<Values> = {};
    for (const k of changed) (patch as Record<string, unknown>)[k] = merged[k];
    await ctx.db
      .update(opportunities)
      .set({
        ...patch,
        keywords,
        // Text changed => parsed requirements derive from stale text.
        ...(changed.some((k) => (TEXT_FIELDS as readonly string[]).includes(k))
          ? { requirements: null }
          : {}),
      })
      .where(eq(opportunities.id, twin.id));
    return {
      id: twin.id,
      outcome: changed.length > 0 ? "updated" : "unchanged",
      mergedInto: "grants_gov",
    };
  }

  const id = newId("opp");
  await ctx.db.insert(opportunities).values({
    id,
    source: r.source,
    sourceId: r.sourceId,
    privateToOrgId: null,
    ...values,
    rawR2Key: opts.rawR2Key ?? null,
    contentHash: opts.contentHash,
    fetchedAt: now,
    keywords: [...new Set(opts.keywords ?? [])].sort(),
    requirements: opts.requirements ?? null,
  });
  return { id, outcome: "created" };
}
