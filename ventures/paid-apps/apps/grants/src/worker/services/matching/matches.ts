// Read/update matches for the /matches routes. Every query is scoped by orgId.
import type { MATCH_STATUSES, MatchStatus } from "@shared/enums";
import {
  type BulkMatchResult,
  type BulkMatchStatus,
  type DismissReason,
  MAX_DISMISS_NOTE_CHARS,
} from "@shared/match-triage";
import { and, desc, eq, gte, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import type { AppContext } from "../../context";
import { opportunities, opportunityMatches } from "../../db/schema";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { conflict, notFound } from "../../lib/errors";
import { audit } from "../privacy/audit";

export type MatchRow = typeof opportunityMatches.$inferSelect;
export type OpportunityRow = typeof opportunities.$inferSelect;
export type MatchWithOpportunity = MatchRow & { opportunity: OpportunityRow };

export interface ListMatchesFilter {
  /** Omitted: every status except "dismissed". */
  statuses?: MatchStatus[];
  minFit?: number;
  limit?: number;
}

export async function listMatches(
  ctx: AppContext,
  orgId: string,
  filter: ListMatchesFilter = {},
): Promise<MatchWithOpportunity[]> {
  const where: (SQL | undefined)[] = [
    eq(opportunityMatches.orgId, orgId),
    // Defense in depth: never surface another org's private opportunity.
    or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId)),
    filter.statuses?.length
      ? inArray(opportunityMatches.status, filter.statuses)
      : ne(opportunityMatches.status, "dismissed"),
  ];
  if (filter.minFit != null) where.push(gte(opportunityMatches.fitScore, filter.minFit));
  const rows = await ctx.db
    .select({ match: opportunityMatches, opportunity: opportunities })
    .from(opportunityMatches)
    .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
    .where(and(...where))
    .orderBy(desc(opportunityMatches.expectedValueCents), desc(opportunityMatches.fitScore))
    .limit(Math.min(filter.limit ?? 200, 500))
    .all();
  return rows.map((r) => ({ ...r.match, opportunity: r.opportunity }));
}

/** Statuses a user may set from the UI. */
export const USER_MATCH_STATUSES = [
  "new",
  "shortlisted",
  "dismissed",
] as const satisfies readonly (typeof MATCH_STATUSES)[number][];
export type UserMatchStatus = (typeof USER_MATCH_STATUSES)[number];

/** Why a match was dismissed. Only stored with status "dismissed"; cleared on any other status. */
export interface DismissalInput {
  reason?: DismissReason | null;
  note?: string | null;
}

/** Matches that already have an application: users manage them from Applications. */
const LOCKED_STATUSES: readonly MatchStatus[] = ["drafting", "applied"];

/** Column values for a status change. A note without a reason counts as "other". */
export function dismissalColumns(
  status: UserMatchStatus,
  d: DismissalInput | undefined,
): { dismissReason: DismissReason | null; dismissNote: string | null } {
  if (status !== "dismissed") return { dismissReason: null, dismissNote: null };
  const note = d?.note?.trim().slice(0, MAX_DISMISS_NOTE_CHARS) || null;
  return { dismissReason: d?.reason ?? (note ? "other" : null), dismissNote: note };
}

type MatchState = Pick<MatchRow, "status" | "dismissReason" | "dismissNote">;

/** True when applying (status, dismissal) would change nothing. Re-dismissing without a reason keeps the old one. */
function isUnchanged(current: MatchState, status: UserMatchStatus, d?: DismissalInput): boolean {
  if (current.status !== status) return false;
  if (status !== "dismissed" || d === undefined) return true;
  const next = dismissalColumns(status, d);
  return current.dismissReason === next.dismissReason && current.dismissNote === next.dismissNote;
}

export async function updateMatchStatus(
  ctx: AppContext,
  orgId: string,
  matchId: string,
  status: UserMatchStatus,
  actor: { userId: string; requestId?: string },
  dismissal?: DismissalInput,
): Promise<MatchRow> {
  const current = await ctx.db
    .select()
    .from(opportunityMatches)
    .where(and(eq(opportunityMatches.id, matchId), eq(opportunityMatches.orgId, orgId)))
    .get();
  if (!current) throw notFound("Match");
  if (LOCKED_STATUSES.includes(current.status)) {
    throw conflict("This match already has an application; manage it from Applications.");
  }
  if (isUnchanged(current, status, dismissal)) return current;
  const columns = dismissalColumns(status, dismissal);
  const [updated] = await ctx.db
    .update(opportunityMatches)
    .set({ status, ...columns, updatedAt: ctx.now() })
    .where(
      and(
        eq(opportunityMatches.id, matchId),
        eq(opportunityMatches.orgId, orgId),
        // A concurrent autopilot claim (-> drafting) wins.
        inArray(opportunityMatches.status, USER_MATCH_STATUSES),
      ),
    )
    .returning();
  if (!updated)
    throw conflict("This match already has an application; manage it from Applications.");
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "match.status_changed",
    targetType: "opportunity_match",
    targetId: matchId,
    metadata: {
      from: current.status,
      to: status,
      opportunityId: current.opportunityId,
      ...(columns.dismissReason ? { dismissReason: columns.dismissReason } : {}),
    },
    requestId: actor.requestId,
  });
  return updated;
}

/**
 * Shortlist or dismiss up to MAX_BULK_MATCH_IDS of the org's matches at once. Ids of other orgs'
 * matches come back as `notFound`; matches with an application (drafting/applied) are `skipped`.
 * Each change is audited like a single PATCH, with `bulk: true`.
 */
export async function bulkUpdateMatchStatus(
  ctx: AppContext,
  orgId: string,
  ids: readonly string[],
  status: BulkMatchStatus,
  actor: { userId: string; requestId?: string },
  dismissal?: DismissalInput,
): Promise<BulkMatchResult> {
  const unique = [...new Set(ids)];
  const rows = (
    await Promise.all(
      chunk(unique, D1_IN_CHUNK).map((part) =>
        ctx.db
          .select({
            id: opportunityMatches.id,
            opportunityId: opportunityMatches.opportunityId,
            status: opportunityMatches.status,
            dismissReason: opportunityMatches.dismissReason,
            dismissNote: opportunityMatches.dismissNote,
          })
          .from(opportunityMatches)
          .where(and(eq(opportunityMatches.orgId, orgId), inArray(opportunityMatches.id, part)))
          .all(),
      ),
    )
  ).flat();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const result: BulkMatchResult = {
    updated: [],
    unchanged: [],
    skipped: [],
    notFound: unique.filter((id) => !byId.has(id)),
  };
  const pending: typeof rows = [];
  for (const id of unique) {
    const r = byId.get(id);
    if (!r) continue;
    if (LOCKED_STATUSES.includes(r.status)) result.skipped.push({ id, status: r.status });
    else if (isUnchanged(r, status, dismissal)) result.unchanged.push(id);
    else pending.push(r);
  }

  const columns = dismissalColumns(status, dismissal);
  const now = ctx.now();
  const changed = new Set(
    (
      await Promise.all(
        chunk(
          pending.map((r) => r.id),
          D1_IN_CHUNK,
        ).map((part) =>
          ctx.db
            .update(opportunityMatches)
            .set({ status, ...columns, updatedAt: now })
            .where(
              and(
                eq(opportunityMatches.orgId, orgId),
                inArray(opportunityMatches.id, part),
                // A concurrent autopilot claim (-> drafting) wins.
                inArray(opportunityMatches.status, USER_MATCH_STATUSES),
              ),
            )
            .returning({ id: opportunityMatches.id }),
        ),
      )
    )
      .flat()
      .map((r) => r.id),
  );

  for (const r of pending) {
    if (!changed.has(r.id)) {
      result.skipped.push({ id: r.id, status: "drafting" });
      continue;
    }
    result.updated.push(r.id);
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: actor.userId,
      action: "match.status_changed",
      targetType: "opportunity_match",
      targetId: r.id,
      metadata: {
        from: r.status,
        to: status,
        opportunityId: r.opportunityId,
        bulk: true,
        ...(columns.dismissReason ? { dismissReason: columns.dismissReason } : {}),
      },
      requestId: actor.requestId,
    });
  }
  return result;
}
