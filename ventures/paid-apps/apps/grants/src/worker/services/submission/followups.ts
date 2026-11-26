// Follow-up tracking: listing, completing and the due-reminder sweep (cron every 30 min).
import type { FollowupStatus } from "@shared/enums";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applications, followups } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { renderEmail } from "../email-templates";
import { audit } from "../privacy/audit";
import { TERMINAL_STATUSES } from "./index";
import { loadOrgContacts, type OrgContacts, teamRecipients } from "./notify";

export type FollowupRow = typeof followups.$inferSelect;

export async function listFollowups(
  ctx: AppContext,
  orgId: string,
  opts: { status?: FollowupStatus; applicationId?: string } = {},
) {
  const conds = [eq(followups.orgId, orgId)];
  if (opts.status) conds.push(eq(followups.status, opts.status));
  if (opts.applicationId) conds.push(eq(followups.applicationId, opts.applicationId));
  const rows = await ctx.db
    .select({ f: followups, appId: applications.id, appTitle: applications.title })
    .from(followups)
    .leftJoin(
      applications,
      and(eq(applications.id, followups.applicationId), eq(applications.orgId, orgId)),
    )
    .where(and(...conds))
    .orderBy(asc(followups.dueAt))
    .limit(500)
    .all();
  return rows.map((r) => ({
    ...r.f,
    application: r.appId ? { id: r.appId, title: r.appTitle ?? "" } : null,
  }));
}

export async function updateFollowup(
  ctx: AppContext,
  input: {
    orgId: string;
    followupId: string;
    userId: string;
    status?: FollowupStatus;
    notes?: string;
    requestId?: string;
  },
): Promise<FollowupRow> {
  const { orgId } = input;
  const row = await ctx.db
    .select()
    .from(followups)
    .where(and(eq(followups.id, input.followupId), eq(followups.orgId, orgId)))
    .get();
  if (!row) throw notFound("Follow-up");
  const patch: Partial<typeof followups.$inferInsert> = {};
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.status && input.status !== row.status) {
    patch.status = input.status;
    if (input.status === "pending") {
      patch.completedAt = null;
      patch.completedBy = null;
    } else {
      patch.completedAt = ctx.now();
      patch.completedBy = input.userId;
    }
  }
  if (Object.keys(patch).length === 0) return row;
  const [updated] = await ctx.db
    .update(followups)
    .set(patch)
    .where(and(eq(followups.id, row.id), eq(followups.orgId, orgId)))
    .returning();
  if (patch.status) {
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: input.userId,
      requestId: input.requestId,
      action: `followup.${patch.status}`,
      targetType: "followup",
      targetId: row.id,
      metadata: { kind: row.kind, applicationId: row.applicationId },
    });
  }
  return updated ?? row;
}

/**
 * Email a reminder for every due, pending, not-yet-notified follow-up. Idempotent: each row is
 * claimed by setting notifiedAt with a conditional update before sending; a failed send releases
 * the claim so the next run retries.
 */
export async function sendDueFollowups(
  ctx: AppContext,
  opts: { limit?: number } = {},
): Promise<{ notified: number; skipped: number; failed: number }> {
  const now = ctx.now();
  const due = await ctx.db
    .select({ f: followups, appStatus: applications.status, appTitle: applications.title })
    .from(followups)
    .leftJoin(
      applications,
      and(eq(applications.id, followups.applicationId), eq(applications.orgId, followups.orgId)),
    )
    .where(
      and(eq(followups.status, "pending"), isNull(followups.notifiedAt), lte(followups.dueAt, now)),
    )
    .orderBy(asc(followups.dueAt))
    .limit(opts.limit ?? 200)
    .all();

  const contactsByOrg = new Map<string, OrgContacts>();
  let notified = 0;
  let skipped = 0;
  let failed = 0;
  for (const { f, appStatus, appTitle } of due) {
    // A deadline reminder for an application that is already in (or past) submission is moot.
    if (f.kind === "deadline_reminder" && appStatus && TERMINAL_STATUSES.includes(appStatus)) {
      await ctx.db
        .update(followups)
        .set({
          status: "skipped",
          notifiedAt: now,
          notes: f.notes || "Application already submitted",
        })
        .where(and(eq(followups.id, f.id), eq(followups.orgId, f.orgId)));
      skipped++;
      continue;
    }
    const claimed = await ctx.db
      .update(followups)
      .set({ notifiedAt: now })
      .where(
        and(eq(followups.id, f.id), eq(followups.orgId, f.orgId), isNull(followups.notifiedAt)),
      )
      .returning({ id: followups.id });
    if (claimed.length === 0) continue; // another run got it

    let contacts = contactsByOrg.get(f.orgId);
    if (!contacts) {
      contacts = await loadOrgContacts(ctx, f.orgId);
      contactsByOrg.set(f.orgId, contacts);
    }
    const to = teamRecipients(contacts);
    if (to.length === 0) {
      ctx.logger.info("followup.no_recipients", { orgId: f.orgId, followupId: f.id });
      skipped++;
      continue;
    }
    try {
      const msg = renderEmail(
        "followupDue",
        {
          orgId: f.orgId,
          orgName: contacts.legalName,
          title: f.title,
          applicationTitle: appTitle,
          dueAt: f.dueAt,
          notes: f.notes,
        },
        { appUrl: ctx.env.APP_URL },
      );
      await ctx.email.send({ to, subject: msg.subject, text: msg.text, html: msg.html });
      notified++;
    } catch (e) {
      failed++;
      ctx.logger.warn("followup.notify_failed", { followupId: f.id, error: String(e) });
      await ctx.db
        .update(followups)
        .set({ notifiedAt: null })
        .where(and(eq(followups.id, f.id), eq(followups.orgId, f.orgId)));
    }
  }
  return { notified, skipped, failed };
}
