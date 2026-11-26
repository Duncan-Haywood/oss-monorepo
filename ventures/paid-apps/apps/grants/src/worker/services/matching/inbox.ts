// GET /matches/inbox: the triage inbox. New matches (not yet shortlisted or dismissed by a person)
// whose deadline hasn't passed, highest expected value first, each with the org's stored
// eligibility check (if one has run). Every query is scoped by orgId.
import { EligibilityResult } from "@shared/eligibility";
import type { InboxEligibility } from "@shared/match-triage";
import { and, count, desc, eq, gte, isNull, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { opportunities, opportunityMatches, orgEligibility } from "../../db/schema";
import type { MatchRow } from "./matches";

export const INBOX_DEFAULT_LIMIT = 100;
export const INBOX_MAX_LIMIT = 200;
const SUMMARY_CHARS = 1_000;

type OpportunityRow = typeof opportunities.$inferSelect;

export type InboxOpportunityRow = Pick<
  OpportunityRow,
  | "id"
  | "title"
  | "funderId"
  | "funderName"
  | "summary"
  | "status"
  | "closeDate"
  | "estimatedCloseDate"
  | "awardFloorCents"
  | "awardCeilingCents"
  | "opportunityNumber"
  | "source"
  | "sourceUrl"
>;

export type InboxEligibilityRow = Omit<InboxEligibility, "checkedAt"> & { checkedAt: Date };

export type InboxItem = MatchRow & {
  opportunity: InboxOpportunityRow;
  eligibilityCheck: InboxEligibilityRow | null;
};

/** Condense a stored check; null if missing or stored in an older shape. */
export function inboxEligibility(raw: unknown, checkedAt: Date | null): InboxEligibilityRow | null {
  if (raw == null || checkedAt == null) return null;
  const parsed = EligibilityResult.safeParse(raw);
  if (!parsed.success) return null;
  return {
    overall: parsed.data.overall,
    checkedAt,
    items: parsed.data.checklist.map((c) => ({
      criterionId: c.criterionId,
      kind: c.kind,
      status: c.status,
      text: c.text,
    })),
  };
}

export async function listInbox(
  ctx: AppContext,
  orgId: string,
  opts: { limit?: number } = {},
): Promise<{ items: InboxItem[]; total: number }> {
  const limit = Math.max(0, Math.min(opts.limit ?? INBOX_DEFAULT_LIMIT, INBOX_MAX_LIMIT));
  const where = and(
    eq(opportunityMatches.orgId, orgId),
    eq(opportunityMatches.status, "new"),
    // Defense in depth: never surface another org's private opportunity.
    or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId)),
    // Nothing to triage once the deadline has passed.
    or(isNull(opportunities.closeDate), gte(opportunities.closeDate, ctx.now())),
  );
  const totalRow = await ctx.db
    .select({ n: count() })
    .from(opportunityMatches)
    .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
    .where(where)
    .get();
  const total = totalRow?.n ?? 0;
  if (limit === 0 || total === 0) return { items: [], total };

  const rows = await ctx.db
    .select({
      match: opportunityMatches,
      opportunity: {
        id: opportunities.id,
        title: opportunities.title,
        funderId: opportunities.funderId,
        funderName: opportunities.funderName,
        summary: opportunities.summary,
        status: opportunities.status,
        closeDate: opportunities.closeDate,
        estimatedCloseDate: opportunities.estimatedCloseDate,
        awardFloorCents: opportunities.awardFloorCents,
        awardCeilingCents: opportunities.awardCeilingCents,
        opportunityNumber: opportunities.opportunityNumber,
        source: opportunities.source,
        sourceUrl: opportunities.sourceUrl,
      },
      eligibilityResult: orgEligibility.result,
      eligibilityCheckedAt: orgEligibility.checkedAt,
    })
    .from(opportunityMatches)
    .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
    .leftJoin(
      orgEligibility,
      and(
        eq(orgEligibility.orgId, orgId),
        eq(orgEligibility.opportunityId, opportunityMatches.opportunityId),
      ),
    )
    .where(where)
    .orderBy(desc(opportunityMatches.expectedValueCents), desc(opportunityMatches.fitScore))
    .limit(limit)
    .all();

  const items = rows.map((r) => ({
    ...r.match,
    opportunity: {
      ...r.opportunity,
      summary:
        r.opportunity.summary.length > SUMMARY_CHARS
          ? `${r.opportunity.summary.slice(0, SUMMARY_CHARS)}…`
          : r.opportunity.summary,
    },
    eligibilityCheck: inboxEligibility(r.eligibilityResult, r.eligibilityCheckedAt),
  }));
  return { items, total };
}
