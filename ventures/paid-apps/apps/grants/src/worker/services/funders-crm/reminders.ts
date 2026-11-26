// Next-step reminders: a relation whose next step is due goes to the notification center once
// (the owner, or the org's editors when nobody owns it). Meant to run from the 30-minute
// `followups.run_due` cron alongside submission follow-ups. Never throws per relation.
import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { AppContext } from "../../context";
import { orgFunderRelations } from "../../db/schema/funder-relations";
import { notify } from "../notifications";

export async function runDueNextSteps(
  ctx: AppContext,
  opts: { limit?: number } = {},
): Promise<{ notified: number }> {
  const now = ctx.now();
  const due = await ctx.db
    .select()
    .from(orgFunderRelations)
    .where(
      and(
        isNull(orgFunderRelations.nextStepNotifiedAt),
        isNotNull(orgFunderRelations.nextStepAt),
        lte(orgFunderRelations.nextStepAt, now),
      ),
    )
    .orderBy(asc(orgFunderRelations.nextStepAt))
    .limit(opts.limit ?? 200)
    .all();
  let notified = 0;
  for (const r of due) {
    const claimed = await ctx.db
      .update(orgFunderRelations)
      .set({ nextStepNotifiedAt: now })
      .where(
        and(
          eq(orgFunderRelations.id, r.id),
          eq(orgFunderRelations.orgId, r.orgId),
          isNull(orgFunderRelations.nextStepNotifiedAt),
        ),
      )
      .returning({ id: orgFunderRelations.id });
    if (claimed.length === 0) continue; // another run got it
    const res = await notify(ctx, {
      orgId: r.orgId,
      recipients: r.ownerId ? [r.ownerId] : "editors",
      kind: "followup.due",
      title: `Next step with ${r.displayName}`,
      body: r.nextStepNote,
      link: `/orgs/${r.orgId}/funders/${r.id}`,
      severity: "action",
      dedupeKey: `funder_next:${r.id}:${r.nextStepAt?.getTime() ?? 0}`,
    });
    notified += res.created > 0 ? 1 : 0;
  }
  return { notified };
}
