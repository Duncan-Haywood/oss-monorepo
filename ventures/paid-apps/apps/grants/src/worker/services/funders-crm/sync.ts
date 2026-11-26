// Auto-linking, computed on read: instead of hooks in matching / pipeline / awards / prospecting,
// syncRelations() looks at the org's shortlisted matches, applications, awards and researched
// prospects and makes sure each funder behind them has a relation. Relations whose stage was never
// set by a person ("auto") follow the signals; a person's stage choice is never overwritten.
// Every query is scoped by orgId.
import type { FunderStage } from "@shared/api/funders";
import type { ApplicationStatus, MatchStatus } from "@shared/enums";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applications, funders, opportunities, opportunityMatches } from "../../db/schema";
import { awards } from "../../db/schema/awards";
import { type FunderRelationOrigin, orgFunderRelations } from "../../db/schema/funder-relations";
import { funderProfiles, orgProspects } from "../../db/schema/prospects";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { normalizeFunderName } from "../discovery/catalog";
import { audit } from "../privacy/audit";
import { deriveStage, emptySignals, type StageSignals } from "./model";

export const newRelationId = () => `frl_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

/** Prospect statuses that mean the org is actively working this foundation. */
export const LINKING_PROSPECT_STATUSES = ["researching", "contacted", "applied"] as const;
const LINKING_MATCH_STATUSES: MatchStatus[] = ["shortlisted", "drafting", "applied"];

/** Awards may not be migrated yet where the awards module is unwired: treat a missing table as empty. */
export async function tolerateMissingTable<T>(
  ctx: AppContext,
  table: string,
  run: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await run();
  } catch (e) {
    if (String(e).includes("no such table")) {
      ctx.logger.warn("funders_crm.table_missing", { table });
      return [];
    }
    throw e;
  }
}

/** One thing the org did that involves a funder. */
interface Signal {
  origin: Exclude<FunderRelationOrigin, "manual">;
  funderId: string | null;
  ein: string | null;
  name: string;
  apply: (s: StageSignals) => void;
}

interface Bucket {
  relationId: string | null;
  funderId: string | null;
  ein: string | null;
  name: string;
  normalizedName: string;
  origin: Exclude<FunderRelationOrigin, "manual">;
  signals: StageSignals;
}

const ORIGIN_RANK: Record<Bucket["origin"], number> = {
  award: 0,
  application: 1,
  match: 2,
  prospect: 3,
};

async function loadSignals(ctx: AppContext, orgId: string): Promise<Signal[]> {
  const [matchRows, appRows, awardRows, prospectRows] = await Promise.all([
    ctx.db
      .select({
        status: opportunityMatches.status,
        funderId: opportunities.funderId,
        funderName: opportunities.funderName,
      })
      .from(opportunityMatches)
      .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          inArray(opportunityMatches.status, LINKING_MATCH_STATUSES),
        ),
      )
      .limit(1000)
      .all(),
    ctx.db
      .select({
        status: applications.status,
        funderId: opportunities.funderId,
        funderName: opportunities.funderName,
      })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(applications.orgId, orgId))
      .limit(1000)
      .all(),
    tolerateMissingTable(ctx, "awards", () =>
      ctx.db
        .select({
          funderName: awards.funderName,
          funderId: opportunities.funderId,
        })
        .from(awards)
        .leftJoin(
          applications,
          and(eq(applications.id, awards.applicationId), eq(applications.orgId, orgId)),
        )
        .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
        .where(eq(awards.orgId, orgId))
        .limit(1000)
        .all(),
    ),
    ctx.db
      .select({ status: orgProspects.status, ein: orgProspects.ein, name: funderProfiles.name })
      .from(orgProspects)
      .innerJoin(funderProfiles, eq(funderProfiles.ein, orgProspects.ein))
      .where(
        and(
          eq(orgProspects.orgId, orgId),
          inArray(orgProspects.status, [...LINKING_PROSPECT_STATUSES]),
        ),
      )
      .limit(1000)
      .all(),
  ]);

  const out: Signal[] = [];
  for (const m of matchRows) {
    out.push({
      origin: "match",
      funderId: m.funderId,
      ein: null,
      name: m.funderName,
      apply: (s) => s.matchStatuses.push(m.status),
    });
  }
  for (const a of appRows) {
    out.push({
      origin: "application",
      funderId: a.funderId,
      ein: null,
      name: a.funderName,
      apply: (s) => s.applicationStatuses.push(a.status as ApplicationStatus),
    });
  }
  for (const w of awardRows) {
    out.push({
      origin: "award",
      funderId: w.funderId ?? null,
      ein: null,
      name: w.funderName,
      apply: (s) => {
        s.awards += 1;
      },
    });
  }
  for (const p of prospectRows) {
    out.push({
      origin: "prospect",
      funderId: null,
      ein: p.ein,
      name: p.name,
      apply: (s) => {
        s.prospectStatus = p.status;
      },
    });
  }
  return out;
}

/** Catalog funders by normalized name, so name-only signals (awards, prospects) get a funderId. */
async function fundersByName(ctx: AppContext, names: string[]) {
  const map = new Map<string, string>();
  const unique = [...new Set(names.filter(Boolean))];
  for (const part of chunk(unique, D1_IN_CHUNK)) {
    const rows = await ctx.db
      .select({ id: funders.id, normalizedName: funders.normalizedName })
      .from(funders)
      .where(inArray(funders.normalizedName, part))
      .all();
    for (const r of rows) map.set(r.normalizedName, r.id);
  }
  return map;
}

export interface SyncResult {
  created: number;
  updated: number;
}

/**
 * Creates missing relations for funders the org has shortlisted, applied to, been awarded by or
 * is researching as a prospect, links missing funderId / EIN, and moves "auto" stages to match.
 * Idempotent; safe to run on every read.
 */
export async function syncRelations(ctx: AppContext, orgId: string): Promise<SyncResult> {
  const signals = await loadSignals(ctx, orgId);
  if (signals.length === 0) return { created: 0, updated: 0 };

  const existing = await ctx.db
    .select({
      id: orgFunderRelations.id,
      funderId: orgFunderRelations.funderId,
      prospectEin: orgFunderRelations.prospectEin,
      normalizedName: orgFunderRelations.normalizedName,
      stage: orgFunderRelations.stage,
      stageSource: orgFunderRelations.stageSource,
    })
    .from(orgFunderRelations)
    .where(eq(orgFunderRelations.orgId, orgId))
    .all();

  const catalog = await fundersByName(
    ctx,
    signals.filter((s) => !s.funderId).map((s) => normalizeFunderName(s.name)),
  );

  const byFunder = new Map<string, Bucket>();
  const byEin = new Map<string, Bucket>();
  const byName = new Map<string, Bucket>();
  const buckets: Bucket[] = [];
  const index = (b: Bucket) => {
    if (b.funderId) byFunder.set(b.funderId, b);
    if (b.ein) byEin.set(b.ein, b);
    if (!byName.has(b.normalizedName)) byName.set(b.normalizedName, b);
  };
  for (const r of existing) {
    const b: Bucket = {
      relationId: r.id,
      funderId: r.funderId,
      ein: r.prospectEin,
      name: "",
      normalizedName: r.normalizedName,
      origin: "prospect",
      signals: emptySignals(),
    };
    buckets.push(b);
    index(b);
  }

  for (const s of signals) {
    const normalizedName = normalizeFunderName(s.name) || "unknown";
    const funderId = s.funderId ?? catalog.get(normalizedName) ?? null;
    let b =
      (funderId ? byFunder.get(funderId) : undefined) ??
      (s.ein ? byEin.get(s.ein) : undefined) ??
      byName.get(normalizedName);
    if (!b) {
      b = {
        relationId: null,
        funderId,
        ein: s.ein,
        name: s.name.trim() || "Unknown funder",
        normalizedName,
        origin: s.origin,
        signals: emptySignals(),
      };
      buckets.push(b);
    } else {
      // Fill links the relation is missing (never replace one it has).
      if (!b.funderId && funderId && !byFunder.has(funderId)) b.funderId = funderId;
      if (!b.ein && s.ein && !byEin.has(s.ein)) b.ein = s.ein;
      if (!b.relationId && ORIGIN_RANK[s.origin] < ORIGIN_RANK[b.origin]) b.origin = s.origin;
    }
    index(b);
    s.apply(b.signals);
  }

  const now = ctx.now();
  let created = 0;
  let updated = 0;
  const existingById = new Map(existing.map((r) => [r.id, r]));
  for (const b of buckets) {
    const derived: FunderStage | null = deriveStage(b.signals);
    if (!b.relationId) {
      const id = newRelationId();
      const inserted = await ctx.db
        .insert(orgFunderRelations)
        .values({
          id,
          orgId,
          funderId: b.funderId,
          prospectEin: b.ein,
          displayName: b.name.slice(0, 300),
          normalizedName: b.normalizedName,
          stage: derived ?? "prospect",
          stageSource: "auto",
          origin: b.origin,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: orgFunderRelations.id });
      if (inserted.length === 0) continue; // a concurrent read linked it first
      created++;
      await audit(ctx, {
        orgId,
        actorType: "system",
        action: "funder_relation.auto_linked",
        targetType: "org_funder_relation",
        targetId: id,
        metadata: { origin: b.origin, stage: derived ?? "prospect", funderId: b.funderId },
      });
      continue;
    }
    const cur = existingById.get(b.relationId);
    if (!cur) continue;
    const set: Partial<typeof orgFunderRelations.$inferInsert> = {};
    if (b.funderId && b.funderId !== cur.funderId) set.funderId = b.funderId;
    if (b.ein && b.ein !== cur.prospectEin) set.prospectEin = b.ein;
    if (cur.stageSource === "auto" && derived && derived !== cur.stage) set.stage = derived;
    if (Object.keys(set).length === 0) continue;
    try {
      await ctx.db
        .update(orgFunderRelations)
        .set({ ...set, updatedAt: now })
        .where(and(eq(orgFunderRelations.id, cur.id), eq(orgFunderRelations.orgId, orgId)));
      updated++;
    } catch (e) {
      // A unique link (funderId / EIN) already belongs to another relation: keep both as they are.
      ctx.logger.warn("funders_crm.link_conflict", { orgId, relationId: cur.id, error: String(e) });
    }
  }
  return { created, updated };
}
