// Fact base queries + mutations. Every function takes the tenant orgId and scopes every query by it.
import type { FactValue } from "@shared/content";
import type { FactCategory, FactStatus, Sensitivity } from "@shared/enums";
import { FACT_CATEGORIES, FACT_STATUSES } from "@shared/enums";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AppContext } from "../../context";
import { documents, facts, projects } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../privacy/audit";
import { type CoverageItem, computeCoverage } from "./checklist";
import { applySupersede } from "./supersede";

export type FactRow = typeof facts.$inferSelect;

/** D1 allows at most 100 bound parameters per statement (bulkConfirmFacts binds 7 besides the ids). */
const IN_CHUNK = 80;

export function chunkIds<T>(ids: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export interface ListFactsFilter {
  status?: FactStatus[];
  category?: FactCategory[];
  q?: string;
  projectId?: string;
  sourceDocumentId?: string;
  sourceInterviewId?: string;
  limit?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function listFacts(
  ctx: AppContext,
  orgId: string,
  f: ListFactsFilter = {},
): Promise<FactRow[]> {
  const where: SQL[] = [eq(facts.orgId, orgId)];
  if (f.status?.length) where.push(inArray(facts.status, f.status));
  else where.push(ne(facts.status, "superseded"));
  if (f.category?.length) where.push(inArray(facts.category, f.category));
  if (f.projectId) where.push(eq(facts.projectId, f.projectId));
  if (f.sourceDocumentId) where.push(eq(facts.sourceDocumentId, f.sourceDocumentId));
  if (f.sourceInterviewId) where.push(eq(facts.sourceInterviewId, f.sourceInterviewId));
  const q = f.q?.trim();
  if (q) {
    const pat = `%${escapeLike(q)}%`;
    const cond = or(
      sql`${facts.statement} like ${pat} escape '\\'`,
      sql`${facts.sourceQuote} like ${pat} escape '\\'`,
    );
    if (cond) where.push(cond);
  }
  return ctx.db
    .select()
    .from(facts)
    .where(and(...where))
    .orderBy(desc(facts.createdAt), asc(facts.id))
    .limit(Math.min(Math.max(f.limit ?? 1000, 1), 2000))
    .all();
}

export async function getFact(ctx: AppContext, orgId: string, id: string): Promise<FactRow> {
  const row = await ctx.db
    .select()
    .from(facts)
    .where(and(eq(facts.id, id), eq(facts.orgId, orgId)))
    .get();
  if (!row) throw notFound("Fact");
  return row;
}

export async function getFactsByIds(
  ctx: AppContext,
  orgId: string,
  ids: readonly string[],
): Promise<FactRow[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  const out: FactRow[] = [];
  for (const part of chunkIds(unique)) {
    const rows = await ctx.db
      .select()
      .from(facts)
      .where(and(eq(facts.orgId, orgId), inArray(facts.id, part)))
      .all();
    out.push(...rows);
  }
  const order = new Map(unique.map((id, i) => [id, i]));
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export interface DraftingFactsOptions {
  /** Include org-wide facts plus facts linked to this project. */
  projectId?: string;
  /** Include `proposed` (unconfirmed) facts; claims citing them get flagged downstream. */
  includeProposed?: boolean;
  /** Without projectId: also include facts linked to any project (default: org-wide facts only). */
  allProjects?: boolean;
}

/** Facts the drafter may cite: never rejected, superseded or restricted. Confirmed first. */
export async function getFactsForDrafting(
  ctx: AppContext,
  orgId: string,
  opts: DraftingFactsOptions = {},
): Promise<FactRow[]> {
  const statuses: FactStatus[] = opts.includeProposed ? ["confirmed", "proposed"] : ["confirmed"];
  const where: (SQL | undefined)[] = [
    eq(facts.orgId, orgId),
    inArray(facts.status, statuses),
    ne(facts.sensitivity, "restricted"),
    isNull(facts.supersededById),
  ];
  if (opts.projectId) where.push(or(isNull(facts.projectId), eq(facts.projectId, opts.projectId)));
  else if (!opts.allProjects) where.push(isNull(facts.projectId));
  const rows = await ctx.db
    .select()
    .from(facts)
    .where(and(...where))
    .orderBy(asc(facts.category), desc(facts.confidence), asc(facts.createdAt))
    .all();
  // confirmed before proposed, stable otherwise
  return rows.sort((a, b) => Number(a.status !== "confirmed") - Number(b.status !== "confirmed"));
}

export async function getCoverage(ctx: AppContext, orgId: string): Promise<CoverageItem[]> {
  const rows = await ctx.db
    .select({ category: facts.category, status: facts.status, projectId: facts.projectId })
    .from(facts)
    .where(and(eq(facts.orgId, orgId), inArray(facts.status, ["proposed", "confirmed"])))
    .all();
  return computeCoverage(rows);
}

export interface FactsSummary {
  byStatus: Record<FactStatus, number>;
  byCategory: Record<FactCategory, number>;
  coverage: CoverageItem[];
}

export async function getFactsSummary(ctx: AppContext, orgId: string): Promise<FactsSummary> {
  const rows = await ctx.db
    .select({
      category: facts.category,
      status: facts.status,
      n: sql<number>`count(*)`,
    })
    .from(facts)
    .where(eq(facts.orgId, orgId))
    .groupBy(facts.category, facts.status)
    .all();
  const byStatus = Object.fromEntries(FACT_STATUSES.map((s) => [s, 0])) as Record<
    FactStatus,
    number
  >;
  const byCategory = Object.fromEntries(FACT_CATEGORIES.map((c) => [c, 0])) as Record<
    FactCategory,
    number
  >;
  for (const r of rows) {
    const n = Number(r.n);
    byStatus[r.status] = (byStatus[r.status] ?? 0) + n;
    // byCategory counts usable facts only (rejected/superseded excluded)
    if (r.status === "proposed" || r.status === "confirmed")
      byCategory[r.category] = (byCategory[r.category] ?? 0) + n;
  }
  return { byStatus, byCategory, coverage: await getCoverage(ctx, orgId) };
}

async function assertProject(ctx: AppContext, orgId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const p = await ctx.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!p) throw badRequest("Unknown projectId");
}

export interface CreateFactInput {
  category: FactCategory;
  statement: string;
  value?: FactValue | null;
  asOf?: string | null;
  projectId?: string | null;
  sensitivity?: Sensitivity;
}

export interface Actor {
  userId: string;
  requestId?: string;
}

/** A fact typed in by org staff: user_entered and auto-confirmed by its author. */
export async function createUserFact(
  ctx: AppContext,
  orgId: string,
  input: CreateFactInput,
  actor: Actor,
): Promise<FactRow> {
  await assertProject(ctx, orgId, input.projectId);
  const now = ctx.now();
  const id = newId("fct");
  const row = await ctx.db
    .insert(facts)
    .values({
      id,
      orgId,
      category: input.category,
      statement: input.statement.trim(),
      value: input.value ?? null,
      asOf: input.asOf ?? null,
      projectId: input.projectId ?? null,
      sensitivity: input.sensitivity ?? "internal",
      status: "confirmed",
      confidence: 1,
      sourceType: "user_entered",
      sourceQuote: "",
      createdBy: actor.userId,
      confirmedBy: actor.userId,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "fact.created",
    targetType: "fact",
    targetId: id,
    metadata: { category: input.category },
    requestId: actor.requestId,
  });
  return row;
}

export interface UpdateFactInput {
  category?: FactCategory;
  statement?: string;
  value?: FactValue | null;
  asOf?: string | null;
  projectId?: string | null;
  sensitivity?: Sensitivity;
}

/**
 * Edit a fact. Provenance (source document/chunk/turn + verbatim quote) is always kept; the first
 * extracted statement is preserved in originalStatement and the editor recorded. PATCH never moves a
 * fact from proposed to confirmed — that only happens via confirm. A human editing an already
 * confirmed fact re-vouches for it (confirmedBy/At updated).
 */
export async function updateFact(
  ctx: AppContext,
  orgId: string,
  id: string,
  input: UpdateFactInput,
  actor: Actor,
): Promise<FactRow> {
  const cur = await getFact(ctx, orgId, id);
  if (input.projectId !== undefined) await assertProject(ctx, orgId, input.projectId);
  const now = ctx.now();
  const patch: Partial<typeof facts.$inferInsert> = { updatedAt: now };
  if (input.category !== undefined) patch.category = input.category;
  if (input.value !== undefined) patch.value = input.value;
  if (input.asOf !== undefined) patch.asOf = input.asOf;
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.sensitivity !== undefined) patch.sensitivity = input.sensitivity;
  const statement = input.statement?.trim();
  const statementChanged = statement !== undefined && statement !== cur.statement;
  if (statementChanged) {
    patch.statement = statement;
    if (cur.originalStatement == null && cur.sourceType !== "user_entered")
      patch.originalStatement = cur.statement;
  }
  const contentChanged = statementChanged || input.value !== undefined || input.asOf !== undefined;
  if (contentChanged) {
    patch.editedBy = actor.userId;
    patch.editedAt = now;
    if (cur.createdBy == null) patch.createdBy = actor.userId;
    if (cur.status === "confirmed") {
      patch.confirmedBy = actor.userId;
      patch.confirmedAt = now;
    }
  }
  const row = await ctx.db
    .update(facts)
    .set(patch)
    .where(and(eq(facts.id, id), eq(facts.orgId, orgId)))
    .returning()
    .get();
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "fact.updated",
    targetType: "fact",
    targetId: id,
    metadata: { fields: Object.keys(input), statementChanged },
    requestId: actor.requestId,
  });
  return row;
}

export async function confirmFact(
  ctx: AppContext,
  orgId: string,
  id: string,
  actor: Actor,
): Promise<FactRow> {
  const cur = await getFact(ctx, orgId, id);
  if (cur.status === "superseded") throw conflict("A superseded fact cannot be confirmed");
  if (cur.status === "confirmed") return cur;
  const now = ctx.now();
  const row = await ctx.db
    .update(facts)
    .set({
      status: "confirmed",
      confirmedBy: actor.userId,
      confirmedAt: now,
      lastConfirmedAt: now,
      rejectionReason: null,
      updatedAt: now,
    })
    .where(and(eq(facts.id, id), eq(facts.orgId, orgId)))
    .returning()
    .get();
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "fact.confirmed",
    targetType: "fact",
    targetId: id,
    metadata: { from: cur.status },
    requestId: actor.requestId,
  });
  // A confirmed update replaces the older fact it proposed to supersede.
  await applySupersede(ctx, orgId, [id], actor);
  return row;
}

/**
 * "Confirm still true": a human re-vouches for a confirmed fact, which clears its staleness
 * indicator (lastConfirmedAt). The statement, provenance and confirmedAt are unchanged.
 */
export async function confirmFactStillTrue(
  ctx: AppContext,
  orgId: string,
  id: string,
  actor: Actor,
): Promise<FactRow> {
  const cur = await getFact(ctx, orgId, id);
  if (cur.status !== "confirmed")
    throw conflict("Only a confirmed fact can be confirmed as still true");
  const now = ctx.now();
  const row = await ctx.db
    .update(facts)
    .set({ lastConfirmedAt: now, updatedAt: now })
    .where(and(eq(facts.id, id), eq(facts.orgId, orgId)))
    .returning()
    .get();
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "fact.still_true",
    targetType: "fact",
    targetId: id,
    requestId: actor.requestId,
  });
  return row;
}

export async function rejectFact(
  ctx: AppContext,
  orgId: string,
  id: string,
  actor: Actor,
  reason?: string | null,
): Promise<FactRow> {
  const cur = await getFact(ctx, orgId, id);
  if (cur.status === "superseded") throw conflict("A superseded fact cannot be rejected");
  const now = ctx.now();
  const row = await ctx.db
    .update(facts)
    .set({
      status: "rejected",
      rejectionReason: reason?.trim() || null,
      confirmedBy: null,
      confirmedAt: null,
      updatedAt: now,
    })
    .where(and(eq(facts.id, id), eq(facts.orgId, orgId)))
    .returning()
    .get();
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "fact.rejected",
    targetType: "fact",
    targetId: id,
    metadata: { from: cur.status },
    requestId: actor.requestId,
  });
  return row;
}

/** Confirms the given proposed facts of this org (others are ignored). */
export async function bulkConfirmFacts(
  ctx: AppContext,
  orgId: string,
  ids: readonly string[],
  actor: Actor,
): Promise<{ confirmed: number; ids: string[] }> {
  const now = ctx.now();
  const done: string[] = [];
  // Facts from a document flagged for possible prompt injection are never bulk-confirmed: each one
  // needs its own confirmation (POST /facts/:id/confirm) after a human has checked it.
  const flaggedDocs = ctx.db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        sql`json_extract(${documents.safetyFlags}, '$.injectionSuspected') = 1`,
      ),
    );
  for (const part of chunkIds([...new Set(ids)])) {
    const rows = await ctx.db
      .update(facts)
      .set({
        status: "confirmed",
        confirmedBy: actor.userId,
        confirmedAt: now,
        lastConfirmedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(facts.orgId, orgId),
          eq(facts.status, "proposed"),
          inArray(facts.id, part),
          or(isNull(facts.sourceDocumentId), notInArray(facts.sourceDocumentId, flaggedDocs)),
        ),
      )
      .returning({ id: facts.id })
      .all();
    done.push(...rows.map((r) => r.id));
  }
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "fact.bulk_confirmed",
    targetType: "fact",
    metadata: { count: done.length, ids: done.slice(0, 200) },
    requestId: actor.requestId,
  });
  await applySupersede(ctx, orgId, done, actor);
  return { confirmed: done.length, ids: done };
}
