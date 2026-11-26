// The saved budget as drafting and grounding consume it (`budget:<lineId>` pseudo-citations).
// Imported by pipeline/deps.ts, so it must not import the pipeline (no cycle).
import type { BudgetGroundingInput } from "@shared/budget";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applicationBudgets } from "../../db/schema";

/** Tenant-scoped; null when no budget is saved or it cannot be read (citations then fail closed). */
export async function loadBudgetForGrounding(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
): Promise<BudgetGroundingInput | null> {
  try {
    const row = await ctx.db
      .select({ lines: applicationBudgets.lines, totals: applicationBudgets.totals })
      .from(applicationBudgets)
      .where(
        and(
          eq(applicationBudgets.applicationId, applicationId),
          eq(applicationBudgets.orgId, orgId),
        ),
      )
      .get();
    if (!row) return null;
    const m = row.totals.match;
    return {
      lines: row.lines.map((l) => ({
        id: l.id,
        category: l.category,
        description: l.description,
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
        totalCents: l.totalCents,
        fundingSource: l.fundingSource,
      })),
      totals: {
        requestCents: m.requestCents,
        matchCents: m.matchCents,
        otherCents: m.otherCents,
        totalProjectCents: m.totalProjectCents,
      },
    };
  } catch (e) {
    ctx.logger.warn("budgets.load_for_grounding_failed", { applicationId, error: String(e) });
    return null;
  }
}
