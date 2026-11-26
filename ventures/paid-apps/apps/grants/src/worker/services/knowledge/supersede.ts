// Supersede detection: a newly extracted fact that updates an older one (same category and scope,
// a newer asOf, the same claim with different numbers or wording) is linked to it as a *proposal*
// (facts.supersedesFactId). Nothing is superseded until a human confirms the new fact
// (applySupersede, called by confirmFact / bulkConfirmFacts). Candidate matching is pure.

import type { FactCategory, FactStatus } from "@shared/enums";
import { asOfKey } from "@shared/fact-staleness";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { facts } from "../../db/schema";
import { audit } from "../privacy/audit";
import { jaccard, statementTokens } from "./text";

/** Token overlap (numbers and years ignored) above which two dated facts state the same thing. */
export const SUPERSEDE_OVERLAP = 0.5;

export interface SupersedeCandidate {
  id: string;
  category: FactCategory;
  statement: string;
  asOf: string | null;
  status: FactStatus;
  projectId: string | null;
  supersededById?: string | null;
  unit?: string | null;
}

export interface NewFactForSupersede {
  category: FactCategory;
  statement: string;
  asOf: string | null;
  projectId?: string | null;
  unit?: string | null;
}

/** Content words without numbers (so "served 320 … 2025" and "served 412 … 2026" match). */
const wordTokens = (s: string) => statementTokens(s).filter((t) => !/^[$\d]/.test(t));

/** The older fact `f` updates, or null. Only confirmed / proposed, non-superseded facts qualify. */
export function findSupersedeCandidate(
  f: NewFactForSupersede,
  existing: readonly SupersedeCandidate[],
): SupersedeCandidate | null {
  const newKey = asOfKey(f.asOf);
  if (!newKey) return null;
  const tokens = wordTokens(f.statement);
  if (tokens.length === 0) return null;
  let best: { c: SupersedeCandidate; score: number; key: string } | null = null;
  for (const c of existing) {
    if (c.category !== f.category) continue;
    if (c.status !== "confirmed" && c.status !== "proposed") continue;
    if (c.supersededById) continue;
    if ((c.projectId ?? null) !== (f.projectId ?? null)) continue;
    if (f.unit && c.unit && f.unit.toLowerCase() !== c.unit.toLowerCase()) continue;
    const key = asOfKey(c.asOf);
    if (!key || key >= newKey) continue;
    const score = jaccard(tokens, wordTokens(c.statement));
    if (score < SUPERSEDE_OVERLAP) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (key > best.key || (c.status === "confirmed" && best.c.status !== "confirmed")))
    ) {
      best = { c, score, key };
    }
  }
  return best?.c ?? null;
}

/** The org's facts a new fact could supersede (loaded once per extraction run). */
export async function loadSupersedeCandidates(
  ctx: AppContext,
  orgId: string,
): Promise<SupersedeCandidate[]> {
  const rows = await ctx.db
    .select({
      id: facts.id,
      category: facts.category,
      statement: facts.statement,
      asOf: facts.asOf,
      status: facts.status,
      projectId: facts.projectId,
      supersededById: facts.supersededById,
      value: facts.value,
    })
    .from(facts)
    .where(
      and(
        eq(facts.orgId, orgId),
        inArray(facts.status, ["confirmed", "proposed"]),
        isNull(facts.supersededById),
      ),
    )
    .all();
  return rows.filter((r) => r.asOf).map(({ value, ...r }) => ({ ...r, unit: value?.unit ?? null }));
}

/**
 * After `newFactIds` were confirmed: each one that proposes to supersede an older fact marks it
 * superseded (supersededById = the new fact). Tenant-scoped; skips facts already superseded or
 * rejected. Returns the ids that were superseded.
 */
export async function applySupersede(
  ctx: AppContext,
  orgId: string,
  newFactIds: readonly string[],
  actor: { userId: string; requestId?: string },
): Promise<string[]> {
  if (newFactIds.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < newFactIds.length; i += 80) {
    const rows = await ctx.db
      .select({ id: facts.id, supersedesFactId: facts.supersedesFactId })
      .from(facts)
      .where(
        and(
          eq(facts.orgId, orgId),
          eq(facts.status, "confirmed"),
          inArray(facts.id, newFactIds.slice(i, i + 80)),
        ),
      )
      .all();
    for (const r of rows) {
      if (!r.supersedesFactId || r.supersedesFactId === r.id) continue;
      const now = ctx.now();
      const done = await ctx.db
        .update(facts)
        .set({ status: "superseded", supersededById: r.id, updatedAt: now })
        .where(
          and(
            eq(facts.id, r.supersedesFactId),
            eq(facts.orgId, orgId),
            inArray(facts.status, ["confirmed", "proposed"]),
            isNull(facts.supersededById),
          ),
        )
        .returning({ id: facts.id })
        .all();
      if (done.length === 0) continue;
      out.push(r.supersedesFactId);
      await audit(ctx, {
        orgId,
        actorType: "user",
        actorId: actor.userId,
        action: "fact.superseded",
        targetType: "fact",
        targetId: r.supersedesFactId,
        metadata: { supersededById: r.id },
        requestId: actor.requestId,
      });
    }
  }
  return out;
}

export interface FactLink {
  id: string;
  statement: string;
  asOf: string | null;
  status: FactStatus;
}

export interface SupersedeLinks {
  /** Proposed fact: the older fact confirming it would supersede. */
  supersedes: FactLink | null;
  /** Older fact: a pending proposal that would supersede it ("superseded by proposal"). */
  supersedeProposal: FactLink | null;
}

/** Adds both directions of pending supersede proposals to a list of facts (tenant-scoped). */
export async function withSupersedeLinks<
  T extends { id: string; status: FactStatus; supersedesFactId: string | null },
>(ctx: AppContext, orgId: string, rows: readonly T[]): Promise<(T & SupersedeLinks)[]> {
  const link = (f: FactLink): FactLink => ({
    id: f.id,
    statement: f.statement,
    asOf: f.asOf,
    status: f.status,
  });
  const select = {
    id: facts.id,
    statement: facts.statement,
    asOf: facts.asOf,
    status: facts.status,
    supersedesFactId: facts.supersedesFactId,
  };
  const olderIds = [
    ...new Set(
      rows.filter((r) => r.status === "proposed").flatMap((r) => r.supersedesFactId ?? []),
    ),
  ];
  const ids = rows.map((r) => r.id);
  const older = new Map<string, FactLink>();
  const proposals = new Map<string, FactLink>();
  for (let i = 0; i < olderIds.length; i += 80) {
    const part = await ctx.db
      .select(select)
      .from(facts)
      .where(and(eq(facts.orgId, orgId), inArray(facts.id, olderIds.slice(i, i + 80))))
      .all();
    for (const f of part) older.set(f.id, link(f));
  }
  for (let i = 0; i < ids.length; i += 80) {
    const part = await ctx.db
      .select(select)
      .from(facts)
      .where(
        and(
          eq(facts.orgId, orgId),
          eq(facts.status, "proposed"),
          inArray(facts.supersedesFactId, ids.slice(i, i + 80)),
        ),
      )
      .all();
    for (const f of part) if (f.supersedesFactId) proposals.set(f.supersedesFactId, link(f));
  }
  return rows.map((r) => {
    const o = r.status === "proposed" && r.supersedesFactId ? older.get(r.supersedesFactId) : null;
    const p =
      r.status === "confirmed" || r.status === "proposed" ? (proposals.get(r.id) ?? null) : null;
    return {
      ...r,
      supersedes: o && (o.status === "confirmed" || o.status === "proposed") ? o : null,
      supersedeProposal: p,
    };
  });
}
