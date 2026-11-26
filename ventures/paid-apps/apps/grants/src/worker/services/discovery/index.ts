// Discovery module public API: catalog reads (tenant-visibility enforced), requirements, runs, seeding.
import { OPPORTUNITY_STATUSES, type OpportunityStatus } from "@shared/enums";
import { and, eq, gte, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { opportunities, opportunityMatches } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { audit } from "../privacy/audit";
import { isSubmissionEmailVerified } from "../submission/channel";

export {
  buildSearchList,
  ensureOrgPlan,
  PLAN_QUERIES_PURPOSE,
  type SearchPlan,
  type SearchSpec,
  validateSearchPlans,
} from "./plans";
export { ensureRequirements, standardSections } from "./requirements";
export {
  DEFAULT_QUERIES,
  type DiscoveryCounts,
  type DiscoveryRunResult,
  discoveryQueries,
  enqueueRescoreAllOrgs,
  listDiscoveryRuns,
  runDiscoveryForSource,
  runGrantsGovDiscovery,
  runSampleDiscovery,
  runSimplerDiscovery,
} from "./run";
export { SAMPLE_OPPORTUNITIES, seedSampleOpportunities } from "./sample-opportunities";
export { sweepOpportunityStatuses } from "./sweep";

export type OpportunityRow = typeof opportunities.$inferSelect;
export type MatchRow = typeof opportunityMatches.$inferSelect;
export type OpportunityWithMatch = OpportunityRow & { match: MatchRow | null };

/** Public catalog rows + rows private to this org. */
export const visibleTo = (orgId: string) =>
  or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId));

/** Throws 404 when the opportunity does not exist or is private to another org. */
export async function getOpportunity(
  ctx: AppContext,
  orgId: string,
  id: string,
): Promise<OpportunityWithMatch> {
  const row = await ctx.db
    .select({ opportunity: opportunities, match: opportunityMatches })
    .from(opportunities)
    .leftJoin(
      opportunityMatches,
      and(
        eq(opportunityMatches.opportunityId, opportunities.id),
        eq(opportunityMatches.orgId, orgId),
      ),
    )
    .where(and(eq(opportunities.id, id), visibleTo(orgId)))
    .get();
  if (!row) throw notFound("Opportunity");
  return { ...row.opportunity, match: row.match ?? null };
}

export type StatusFilter = OpportunityStatus | "open" | "all";

export interface ListOpportunitiesQuery {
  q?: string;
  /** "open" (default) = forecasted|posted with a deadline not yet passed; "all" = no filter. */
  status?: StatusFilter;
  closingWithinDays?: number;
  limit?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listOpportunities(
  ctx: AppContext,
  orgId: string,
  query: ListOpportunitiesQuery = {},
): Promise<OpportunityWithMatch[]> {
  const now = ctx.now();
  const conds: (SQL | undefined)[] = [visibleTo(orgId)];
  const status = query.status ?? "open";
  if (status === "open") {
    conds.push(inArray(opportunities.status, ["forecasted", "posted"]));
    conds.push(or(isNull(opportunities.closeDate), gte(opportunities.closeDate, now)));
  } else if (status !== "all" && (OPPORTUNITY_STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(opportunities.status, status));
  }
  if (query.closingWithinDays != null) {
    conds.push(gte(opportunities.closeDate, now));
    conds.push(
      lte(opportunities.closeDate, new Date(now.getTime() + query.closingWithinDays * 86_400_000)),
    );
  }
  const q = query.q?.trim();
  if (q) {
    for (const term of q.split(/\s+/).slice(0, 6)) {
      const pat = `%${escapeLike(term)}%`;
      conds.push(
        or(
          sql`${opportunities.title} like ${pat} escape '\\'`,
          sql`${opportunities.summary} like ${pat} escape '\\'`,
          sql`${opportunities.funderName} like ${pat} escape '\\'`,
          sql`${opportunities.opportunityNumber} like ${pat} escape '\\'`,
        ),
      );
    }
  }
  const rows = await ctx.db
    .select({ opportunity: opportunities, match: opportunityMatches })
    .from(opportunities)
    .leftJoin(
      opportunityMatches,
      and(
        eq(opportunityMatches.opportunityId, opportunities.id),
        eq(opportunityMatches.orgId, orgId),
      ),
    )
    .where(and(...conds))
    .orderBy(
      sql`${opportunityMatches.expectedValueCents} is null`,
      sql`${opportunityMatches.expectedValueCents} desc`,
      sql`${opportunities.closeDate} is null`,
      sql`${opportunities.closeDate} asc`,
    )
    .limit(Math.min(Math.max(query.limit ?? 200, 1), 500))
    .all();
  return rows.map((r) => ({ ...r.opportunity, match: r.match ?? null }));
}

/**
 * A person confirms the funder's submission email of an org-private (imported / watchlist)
 * opportunity, enabling the email channel for it. `email` must equal the stored address so the
 * confirmation always refers to exactly what the person saw (a re-import resets it on change).
 */
export async function confirmSubmissionEmail(
  ctx: AppContext,
  orgId: string,
  opportunityId: string,
  email: string,
  actor: { userId: string; requestId?: string },
): Promise<OpportunityWithMatch> {
  const opp = await getOpportunity(ctx, orgId, opportunityId);
  if (!opp.submissionEmail) throw badRequest("This opportunity has no submission email to confirm");
  if (opp.submissionEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new AppError(
      409,
      "email_changed",
      "The submission email changed since you loaded this page. Review it and confirm again.",
    );
  }
  if (isSubmissionEmailVerified(opp)) return opp;
  // Public catalog rows are shared by every org: one org cannot vouch for an address on them.
  if (opp.privateToOrgId !== orgId) {
    throw conflict("This listing's submission email can't be confirmed per organization.");
  }
  await ctx.db
    .update(opportunities)
    .set({ submissionEmailVerified: true })
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.privateToOrgId, orgId)));
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "opportunity.submission_email_confirmed",
    targetType: "opportunity",
    targetId: opportunityId,
    // The funder's address is business contact data shown in the UI, not personal data of a user.
    metadata: { submissionEmail: opp.submissionEmail, source: opp.source },
    requestId: actor.requestId,
  });
  return getOpportunity(ctx, orgId, opportunityId);
}
