// Tenant-scoped prospect reads/writes and refresh requests. Every query filters by orgId.

import { and, desc, eq, gte, inArray, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  funderProfiles,
  orgProspects,
  type ProspectApproach,
  type ProspectStatus,
  prospectRuns,
} from "../../db/schema/prospects";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { enqueue } from "../../queues/enqueue";
import { getOrgProfile } from "../orgs";
import { audit } from "../privacy/audit";
import { type BuildProspectsOptions, buildProspects, deriveSearchParams } from "./build";
import {
  type FilingSummary,
  PROPUBLICA_ATTRIBUTION,
  PROPUBLICA_DATA_SOURCES,
  PROPUBLICA_TERMS_URL,
  parseOrganizationResponse,
  readCachedEnvelope,
} from "./propublica";
import { SAMPLE_FOUNDATIONS } from "./sample-foundations";
import { funderFacts } from "./scoring";

export type ProspectRow = typeof orgProspects.$inferSelect;
export type FunderProfileRow = typeof funderProfiles.$inferSelect;
export type ProspectRunRow = typeof prospectRuns.$inferSelect;
export type ProspectWithFunder = ProspectRow & { funder: FunderProfileRow };

export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export interface ListProspectsFilter {
  statuses?: ProspectStatus[];
  minFit?: number;
  approach?: ProspectApproach;
  state?: string;
  q?: string;
  limit?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listProspects(
  ctx: AppContext,
  orgId: string,
  f: ListProspectsFilter = {},
): Promise<ProspectWithFunder[]> {
  const conds: (SQL | undefined)[] = [eq(orgProspects.orgId, orgId)];
  if (f.statuses?.length) conds.push(inArray(orgProspects.status, f.statuses));
  if (f.minFit != null) conds.push(gte(orgProspects.fitScore, f.minFit));
  if (f.approach) conds.push(eq(orgProspects.approach, f.approach));
  if (f.state) conds.push(eq(funderProfiles.state, f.state.toUpperCase()));
  const q = f.q?.trim();
  if (q) {
    const pat = `%${escapeLike(q.slice(0, 100))}%`;
    conds.push(
      sql`(${funderProfiles.name} like ${pat} escape '\\' or ${funderProfiles.city} like ${pat} escape '\\')`,
    );
  }
  const rows = await ctx.db
    .select({ prospect: orgProspects, funder: funderProfiles })
    .from(orgProspects)
    .innerJoin(funderProfiles, eq(funderProfiles.ein, orgProspects.ein))
    .where(and(...conds))
    .orderBy(desc(orgProspects.fitScore), funderProfiles.name)
    .limit(Math.min(Math.max(f.limit ?? 200, 1), 500))
    .all();
  return rows.map((r) => ({ ...r.prospect, funder: r.funder }));
}

async function getProspectRow(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select({ prospect: orgProspects, funder: funderProfiles })
    .from(orgProspects)
    .innerJoin(funderProfiles, eq(funderProfiles.ein, orgProspects.ein))
    .where(and(eq(orgProspects.id, id), eq(orgProspects.orgId, orgId)))
    .get();
  if (!row) throw notFound("Prospect");
  return row;
}

export interface ProspectDetail extends ProspectWithFunder {
  /** Public-data facts the reasons' funderFactIds refer to. */
  funderFacts: { id: string; statement: string }[];
  filings: FilingSummary[];
  attribution: {
    text: string;
    source: "ProPublica Nonprofit Explorer" | "Fictional sample data";
    url: string | null;
    termsUrl: string;
    dataSources: readonly { name: string; url: string }[];
    fetchedAt: string;
  };
}

async function filingHistory(ctx: AppContext, funder: FunderProfileRow): Promise<FilingSummary[]> {
  if (funder.source === "sample") {
    return SAMPLE_FOUNDATIONS.find((s) => s.detail.ein === funder.ein)?.detail.filings ?? [];
  }
  if (!funder.rawR2Key) return [];
  const cached = await readCachedEnvelope(ctx, funder.rawR2Key);
  return (cached && parseOrganizationResponse(cached.body)?.filings) ?? [];
}

export async function getProspectDetail(
  ctx: AppContext,
  orgId: string,
  id: string,
): Promise<ProspectDetail> {
  const { prospect, funder } = await getProspectRow(ctx, orgId, id);
  const filings = (await filingHistory(ctx, funder)).slice(0, 12);
  const sample = funder.source === "sample";
  return {
    ...prospect,
    funder,
    funderFacts: funderFacts(funder),
    filings,
    attribution: {
      text: sample
        ? "Fictional sample foundation for the offline demo. Not real IRS data."
        : PROPUBLICA_ATTRIBUTION,
      source: sample ? "Fictional sample data" : "ProPublica Nonprofit Explorer",
      url: funder.propublicaUrl,
      termsUrl: PROPUBLICA_TERMS_URL,
      dataSources: sample ? [] : PROPUBLICA_DATA_SOURCES,
      fetchedAt: funder.fetchedAt.toISOString(),
    },
  };
}

export interface ProspectPatch {
  status?: ProspectStatus;
  notes?: string;
  nextStepAt?: Date | null;
}

export async function updateProspect(
  ctx: AppContext,
  orgId: string,
  id: string,
  patch: ProspectPatch,
  actor: { userId: string; requestId?: string },
): Promise<ProspectWithFunder> {
  const { prospect: current } = await getProspectRow(ctx, orgId, id);
  const set: Partial<typeof orgProspects.$inferInsert> = {};
  if (patch.status !== undefined && patch.status !== current.status) set.status = patch.status;
  if (patch.notes !== undefined && patch.notes !== current.notes) set.notes = patch.notes;
  if (
    patch.nextStepAt !== undefined &&
    (patch.nextStepAt?.getTime() ?? null) !== (current.nextStepAt?.getTime() ?? null)
  ) {
    set.nextStepAt = patch.nextStepAt;
  }
  if (Object.keys(set).length > 0) {
    await ctx.db
      .update(orgProspects)
      .set({ ...set, updatedAt: ctx.now() })
      .where(and(eq(orgProspects.id, id), eq(orgProspects.orgId, orgId)));
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: actor.userId,
      action: "prospect.updated",
      targetType: "org_prospect",
      targetId: id,
      // Field names only: notes may contain relationship details.
      metadata: {
        fields: Object.keys(set),
        ...(set.status ? { from: current.status, to: set.status } : {}),
        ein: current.ein,
      },
      requestId: actor.requestId,
    });
  }
  const { prospect, funder } = await getProspectRow(ctx, orgId, id);
  return { ...prospect, funder };
}

// ---------------------------------------------------------------------------------------------
// Refresh runs

export async function latestProspectRun(
  ctx: AppContext,
  orgId: string,
): Promise<ProspectRunRow | null> {
  return (
    (await ctx.db
      .select()
      .from(prospectRuns)
      .where(eq(prospectRuns.orgId, orgId))
      .orderBy(desc(prospectRuns.startedAt))
      .limit(1)
      .get()) ?? null
  );
}

export type RefreshRequest =
  | { queued: true; runId: string }
  | { queued: false; retryAfterSeconds: number };

/**
 * Starts a refresh unless one was requested in the last hour (DB-backed, so it holds across
 * isolates; the Workers rate-limit binding only supports 10 s / 60 s windows).
 * Runs inline in tests / INLINE_JOBS, otherwise after the response (see integration notes).
 */
export async function requestProspectRefresh(
  ctx: AppContext,
  orgId: string,
  actor: { userId: string; requestId?: string },
  opts: BuildProspectsOptions = {},
): Promise<RefreshRequest> {
  const profile = await getOrgProfile(ctx, orgId);
  if (deriveSearchParams(profile).geography.states.length === 0) {
    throw badRequest(
      "Add your organization's state to its profile before searching for foundations.",
    );
  }
  const now = ctx.now();
  const last = await latestProspectRun(ctx, orgId);
  if (last && now.getTime() - last.startedAt.getTime() < REFRESH_INTERVAL_MS) {
    const retryMs = last.startedAt.getTime() + REFRESH_INTERVAL_MS - now.getTime();
    return { queued: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
  }
  const runId = `prr_${newId("org").slice(4)}`;
  await ctx.db
    .insert(prospectRuns)
    .values({ id: runId, orgId, status: "queued", requestedBy: actor.userId, startedAt: now });
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "prospects.refresh_requested",
    targetType: "prospect_run",
    targetId: runId,
    requestId: actor.requestId,
  });
  const inline =
    ctx.env.APP_ENV === "test" || (ctx.env as { INLINE_JOBS?: string }).INLINE_JOBS === "true";
  if (inline) await runProspectRefresh(ctx, orgId, runId, opts);
  else await enqueue(ctx, { type: "prospecting.build", orgId, runId });
  return { queued: true, runId };
}

/** Executes a refresh run and records its outcome. Never throws (job-safe). */
export async function runProspectRefresh(
  ctx: AppContext,
  orgId: string,
  runId: string,
  opts: BuildProspectsOptions = {},
): Promise<void> {
  const where = and(eq(prospectRuns.id, runId), eq(prospectRuns.orgId, orgId));
  await ctx.db.update(prospectRuns).set({ status: "running" }).where(where);
  try {
    const result = await buildProspects(ctx, orgId, opts);
    const { states: _states, ...counts } = result;
    await ctx.db
      .update(prospectRuns)
      .set({ status: "succeeded", counts, finishedAt: ctx.now() })
      .where(where);
  } catch (e) {
    ctx.logger.error("prospecting.refresh_failed", { orgId, runId, error: String(e) });
    await ctx.db
      .update(prospectRuns)
      .set({ status: "failed", error: String(e).slice(0, 500), finishedAt: ctx.now() })
      .where(where);
  }
}
