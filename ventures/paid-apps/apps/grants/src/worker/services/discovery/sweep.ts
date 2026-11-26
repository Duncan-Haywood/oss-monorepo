// Daily catalog hygiene (run with the daily grants_gov discovery job):
//  1. posted opportunities whose deadline has passed -> closed
//  2. closed opportunities 90+ days past their deadline -> archived, unless an application
//     references them (the application keeps a live view of what it applied to)
//  3. stale forecasts whose ESTIMATED due date is 90+ days past -> archived (same exception)
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applications, opportunities } from "../../db/schema";

export const ARCHIVE_AFTER_DAYS = 90;

export interface SweepCounts {
  closed: number;
  archived: number;
}

const notReferenced = sql`not exists (select 1 from ${applications} where ${applications.opportunityId} = ${opportunities.id})`;

export async function sweepOpportunityStatuses(ctx: AppContext): Promise<SweepCounts> {
  const now = ctx.now();
  const cutoff = new Date(now.getTime() - ARCHIVE_AFTER_DAYS * 86_400_000);
  const closed = await ctx.db
    .update(opportunities)
    .set({ status: "closed" })
    .where(
      and(
        eq(opportunities.status, "posted"),
        isNotNull(opportunities.closeDate),
        lt(opportunities.closeDate, now),
      ),
    )
    .returning({ id: opportunities.id });
  const archived = await ctx.db
    .update(opportunities)
    .set({ status: "archived" })
    .where(
      and(
        or(
          and(eq(opportunities.status, "closed"), lt(opportunities.closeDate, cutoff)),
          and(
            eq(opportunities.status, "forecasted"),
            isNull(opportunities.closeDate),
            lt(opportunities.estimatedCloseDate, cutoff),
          ),
        ),
        notReferenced,
      ),
    )
    .returning({ id: opportunities.id });
  const counts = { closed: closed.length, archived: archived.length };
  ctx.logger.info("discovery.sweep.done", { ...counts });
  return counts;
}
