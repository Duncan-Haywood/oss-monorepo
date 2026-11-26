// Cron-driven senders: the Monday weekly digest and the daily deadline nudges. Both are idempotent
// through digest_log: a row is claimed (unique orgId+key) before sending and released if the send
// fails, so reruns and queue retries never email twice and a failed send is retried next run.
import type { ApplicationStatus } from "@shared/enums";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applications, followups, opportunities, organization } from "../../db/schema";
import { digestLog } from "../../db/schema/digest";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import type { RenderedEmail } from "../email-templates";
import { deadlineReminderEvent, sendIntegrationEvent, weeklyDigestEvent } from "../integrations";
import {
  listUnsubscribeHeaders,
  notificationOneClickUrl,
  unsubscribePageUrl,
} from "../marketing/headers";
import { buildWeeklyDigest, DAY, daysUntil, digestIsEmpty, isoWeek } from "./build";
import {
  type NotificationKind,
  notificationEmailHash,
  notificationRecipients,
} from "./preferences";
import { renderDeadlineNudgeEmail, renderWeeklyDigestEmail } from "./render";
import { notificationUnsubscribeToken } from "./unsubscribe";

export const weeklyKey = (now: Date) => `weekly:${isoWeek(now)}`;
export const deadlineKey = (applicationId: string, days: number) =>
  `deadline:${applicationId}:${days}`;

/** Days before the deadline at which a nudge goes out (one email per threshold). */
export const DEADLINE_THRESHOLDS = [14, 7, 3, 1] as const;
/** Applications still being worked on by the team. */
export const NUDGE_STATUSES: ApplicationStatus[] = [
  "drafting",
  "in_review",
  "needs_info",
  "changes_requested",
];

/**
 * The most urgent threshold the deadline has crossed (14, 7, 3 or 1), or null when it is more than
 * 14 days away or already past. With a daily cron each threshold is hit once.
 */
export function deadlineThreshold(deadline: Date, now: Date): number | null {
  if (deadline.getTime() <= now.getTime()) return null;
  const days = daysUntil(deadline, now);
  let hit: number | null = null;
  for (const t of DEADLINE_THRESHOLDS) if (days <= t) hit = t;
  return hit;
}

/** Claim (orgId, key). False when another run already claimed it. */
async function claim(ctx: AppContext, orgId: string, key: string, now: Date): Promise<boolean> {
  const rows = await ctx.db
    .insert(digestLog)
    .values({ orgId, key, sentAt: now })
    .onConflictDoNothing()
    .returning({ key: digestLog.key });
  return rows.length > 0;
}

async function release(ctx: AppContext, orgId: string, key: string) {
  await ctx.db.delete(digestLog).where(and(eq(digestLog.orgId, orgId), eq(digestLog.key, key)));
}

/**
 * Claim, then send one copy per recipient (each with its own unsubscribe link and List-Unsubscribe
 * headers). The claim is released only when no copy went out, so a retry never re-mails someone who
 * already got it; a partial failure is logged and not retried.
 */
async function sendOnce(
  ctx: AppContext,
  p: { orgId: string; key: string; now: Date; to: string[]; kind: NotificationKind },
  render: (unsubscribeUrl: string | null) => RenderedEmail,
): Promise<"sent" | "already_sent" | "failed"> {
  if (!(await claim(ctx, p.orgId, p.key, p.now))) return "already_sent";
  const appUrl = ctx.env.APP_URL ?? "";
  const secret = ctx.env.AUTH_SECRET;
  let delivered = 0;
  for (const addr of p.to) {
    try {
      const token = secret
        ? await notificationUnsubscribeToken(secret, { orgId: p.orgId, kind: p.kind, email: addr })
        : null;
      const msg = render(token ? unsubscribePageUrl(appUrl, token) : null);
      const headers = token ? listUnsubscribeHeaders(notificationOneClickUrl(appUrl, token)) : null;
      const recipientKey = (await notificationEmailHash(addr)).slice(0, 16);
      await ctx.email.send({
        to: [addr],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        ...(headers ? { headers } : {}),
        idempotencyKey: `digest:${p.orgId}:${p.key}:${recipientKey}`,
      });
      delivered++;
    } catch (e) {
      ctx.logger.warn("digest.send_failed", { orgId: p.orgId, key: p.key, error: String(e) });
    }
  }
  if (delivered > 0) return "sent";
  await release(ctx, p.orgId, p.key);
  return "failed";
}

export interface SendResult {
  sent: number;
  alreadySent: number;
  empty: number;
  noRecipients: number;
  failed: number;
}

const emptyResult = (): SendResult => ({
  sent: 0,
  alreadySent: 0,
  empty: 0,
  noRecipients: 0,
  failed: 0,
});

/** Monday cron: one digest per org per ISO week; orgs with nothing to report get no email. */
export async function sendWeeklyDigests(ctx: AppContext, now: Date): Promise<SendResult> {
  const key = weeklyKey(now);
  const result = emptyResult();
  const [orgs, done] = await Promise.all([
    ctx.db.select({ id: organization.id }).from(organization).all(),
    ctx.db.select({ orgId: digestLog.orgId }).from(digestLog).where(eq(digestLog.key, key)).all(),
  ]);
  const sentAlready = new Set(done.map((r) => r.orgId));
  for (const { id: orgId } of orgs) {
    if (sentAlready.has(orgId)) {
      result.alreadySent++;
      continue;
    }
    try {
      const digest = await buildWeeklyDigest(ctx, orgId, now);
      if (digestIsEmpty(digest)) {
        result.empty++;
        continue;
      }
      await sendIntegrationEvent(ctx, orgId, weeklyDigestEvent(digest)); // dedupe weekly:{week}
      const to = await notificationRecipients(ctx, orgId, "weeklyDigest");
      if (to.length === 0) {
        result.noRecipients++;
        continue;
      }
      const outcome = await sendOnce(ctx, { orgId, key, now, to, kind: "weeklyDigest" }, (u) =>
        renderWeeklyDigestEmail(digest, ctx.env.APP_URL ?? "", { unsubscribeUrl: u }),
      );
      if (outcome === "sent") result.sent++;
      else if (outcome === "already_sent") result.alreadySent++;
      else result.failed++;
    } catch (e) {
      // One org's failure never blocks the others; its claim (if any) was released.
      result.failed++;
      ctx.logger.warn("digest.weekly_org_failed", { orgId, error: String(e) });
    }
  }
  return result;
}

/**
 * Daily cron: a nudge per application per threshold (14/7/3/1 days before its deadline). The
 * submission module already emails `deadline_reminder` follow-ups at 14 and 3 days
 * (`deadline:{appId}:14d` / `:3d`, see submission/index.ts#scheduleDeadlineReminders); when such a
 * follow-up exists for the threshold it is left to that sweep, so the team never gets both.
 */
export async function sendDeadlineNudges(
  ctx: AppContext,
  now: Date,
  opts: { limit?: number } = {},
): Promise<SendResult & { coveredByFollowups: number }> {
  const horizon = now.getTime() + DEADLINE_THRESHOLDS[0] * DAY;
  const deadlineSql = sql`coalesce(${applications.deadline}, ${opportunities.closeDate})`;
  const rows = await ctx.db
    .select({
      id: applications.id,
      orgId: applications.orgId,
      title: applications.title,
      deadline: applications.deadline,
      closeDate: opportunities.closeDate,
      funderName: opportunities.funderName,
      orgName: organization.name,
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .innerJoin(organization, eq(organization.id, applications.orgId))
    .where(
      and(
        inArray(applications.status, NUDGE_STATUSES),
        sql`${deadlineSql} > ${now.getTime()} and ${deadlineSql} <= ${horizon}`,
      ),
    )
    .orderBy(deadlineSql)
    .limit(opts.limit ?? 500)
    .all();

  const due = rows.flatMap((r) => {
    const deadline = r.deadline ?? r.closeDate;
    const days = deadline ? deadlineThreshold(deadline, now) : null;
    return deadline && days ? [{ ...r, deadline, days, key: deadlineKey(r.id, days) }] : [];
  });

  // Follow-up rows the submission module created for these applications (any status: pending
  // will fire, notified already fired, done/skipped means the team handled it).
  const covered = new Set<string>();
  for (const ids of chunk([...new Set(due.map((d) => d.id))], D1_IN_CHUNK)) {
    const fups = await ctx.db
      .select({ orgId: followups.orgId, dedupeKey: followups.dedupeKey })
      .from(followups)
      .where(and(eq(followups.kind, "deadline_reminder"), inArray(followups.applicationId, ids)))
      .all();
    for (const f of fups) if (f.dedupeKey) covered.add(`${f.orgId}|${f.dedupeKey}`);
  }

  const result = { ...emptyResult(), coveredByFollowups: 0 };
  const recipients = new Map<string, string[]>();
  const kind: NotificationKind = "deadlineReminders";
  for (const d of due) {
    // Chat reminder (dedupe deadline:{appId}:{days}; never throws).
    await sendIntegrationEvent(
      ctx,
      d.orgId,
      deadlineReminderEvent({
        orgId: d.orgId,
        applicationId: d.id,
        title: d.title,
        daysLeft: daysUntil(d.deadline, now),
        threshold: d.days,
      }),
    );
    if (covered.has(`${d.orgId}|${d.key}d`)) {
      result.coveredByFollowups++;
      continue;
    }
    try {
      let to = recipients.get(d.orgId);
      if (!to) {
        to = await notificationRecipients(ctx, d.orgId, kind);
        recipients.set(d.orgId, to);
      }
      if (to.length === 0) {
        result.noRecipients++;
        continue;
      }
      const outcome = await sendOnce(ctx, { orgId: d.orgId, key: d.key, now, to, kind }, (u) =>
        renderDeadlineNudgeEmail(
          {
            orgId: d.orgId,
            orgName: d.orgName,
            applicationId: d.id,
            title: d.title,
            funderName: d.funderName,
            deadline: d.deadline,
            daysLeft: daysUntil(d.deadline, now),
          },
          ctx.env.APP_URL ?? "",
          { unsubscribeUrl: u },
        ),
      );
      if (outcome === "sent") result.sent++;
      else if (outcome === "already_sent") result.alreadySent++;
      else result.failed++;
    } catch (e) {
      result.failed++;
      ctx.logger.warn("digest.deadline_nudge_failed", { applicationId: d.id, error: String(e) });
    }
  }
  return result;
}
