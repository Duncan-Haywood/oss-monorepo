// The affirmation reminder email (ROADMAP, "Affirmation reminders by email, part 2"): a dated email
// to an organization's admins and owners 60 and 7 days before an SPRS affirmation, self-assessment
// or POA&M closeout falls due, from the dates the Affirmations page already shows
// (src/shared/affirmation.ts, affirmationSchedule; stages in src/shared/affirmation-reminders.ts).
//
// Rules (docs/EMAIL.md, "Affirmation reminders"):
// - The daily cron (src/worker/index.ts) runs remindAffirmationsDue once a day.
// - To members with role admin or owner (the people who record affirmations), with a confirmed
//   address where sign-in needs one, who have not turned it off (`member_notifications`, on by
//   default). Every message carries a signed one-click unsubscribe link (RFC 8058) when the
//   deployment has an AUTH_SECRET, and the Affirmations page has the same switch.
// - One message per member per organization per day, listing every deadline that reached a stage.
// - Each (org, level, deadline, due date, stage) is claimed in `affirmation_reminder_sent` before
//   any mail goes out, so overlapping runs never send it twice. A failed send is logged with counts
//   and not retried: the page and the .ics file still show the date.
// - The text names only the organization's own records and the regulation the date comes from, and
//   says the dates are a planning aid: the app never submits to SPRS.
import type { AffirmationSchedule, Deadline } from "@shared/affirmation";
import {
  type AffirmationReminderSettings,
  type ReminderStage,
  type ReminderUnsubscribeStatus,
  reminderStage,
} from "@shared/affirmation-reminders";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  affirmation,
  affirmationReminderSent,
  member,
  memberNotifications,
  organization,
  user,
} from "../../db/schema";
import type { Env } from "../../env";
import { unsubscribeQuery, unsubscribeSecret } from "../../lib/unsubscribe-token";
import { isSafeEmailAddress, sanitizeHeaderValue } from "../../ports/email";
import { requiresEmailVerification } from "../auth/auth";
import { listAffirmations } from ".";

const RECIPIENT_ROLES = ["owner", "admin"] as const;

export interface DueReminder {
  level: 1 | 2;
  deadline: Deadline;
  stage: ReminderStage;
}

/** Every deadline in these schedules that is in a reminder stage today. Pure. */
export function dueReminders(schedules: readonly AffirmationSchedule[]): DueReminder[] {
  const out: DueReminder[] = [];
  for (const s of schedules) {
    for (const d of s.deadlines) {
      const stage = reminderStage(d.daysLeft);
      if (stage !== null) out.push({ level: s.level, deadline: d, stage });
    }
  }
  return out.sort((a, b) => a.deadline.daysLeft - b.deadline.daysLeft || a.level - b.level);
}

const oneLine = (s: string, max: number) => sanitizeHeaderValue(s, max);

const inDays = (n: number) => (n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`);

/** The reminder's subject and text. Pure, so the wording is tested without a database. */
export function affirmationReminderEmail(f: {
  appUrl: string;
  orgName: string;
  reminders: readonly DueReminder[];
  /** The signed /unsubscribe page, or null when the deployment cannot sign links. */
  unsubscribePage: string | null;
}): { subject: string; text: string } {
  const base = f.appUrl.replace(/\/+$/, "");
  const org = oneLine(f.orgName, 80) || "your organization";
  const lines: string[] = [];
  for (const r of f.reminders) {
    lines.push(
      `- Level ${r.level}: ${r.deadline.label}: due ${r.deadline.due} (${inDays(r.deadline.daysLeft)})`,
      `  Basis: ${r.deadline.basis}`,
    );
  }
  const first = f.reminders[0];
  const subject =
    f.reminders.length === 1 && first
      ? `${first.deadline.label} due ${inDays(first.deadline.daysLeft)} (${org})`
      : `${f.reminders.length} CMMC dates fall due soon (${org})`;
  const text = [
    `From the affirmations recorded for ${org} in CMMC Workspace, these dates fall due soon:`,
    "",
    ...lines,
    "",
    `See the dates and record the next affirmation: ${base}/?tab=affirmations`,
    "",
    "These dates are counted from what your organization recorded. They are a planning aid, not a",
    "determination of your CMMC status. CMMC Workspace does not submit anything to SPRS: your",
    "affirming official does that in SPRS.",
    "",
    `You get this because you are an admin of ${org} in CMMC Workspace.`,
    f.unsubscribePage
      ? `Stop these reminders (one click, no sign-in): ${f.unsubscribePage}`
      : "Stop these reminders on the Affirmations page.",
  ].join("\n");
  return { subject: oneLine(subject, 160), text };
}

/** The two unsubscribe links for one member, or null without a signing secret (local dev). */
export async function reminderUnsubscribeLinks(
  env: Pick<Env, "APP_URL" | "AUTH_SECRET">,
  orgId: string,
  userId: string,
): Promise<{ page: string; oneClick: string } | null> {
  const secret = unsubscribeSecret(env);
  if (!secret) return null;
  const q = await unsubscribeQuery(secret, orgId, userId);
  const base = env.APP_URL.replace(/\/+$/, "");
  return {
    page: `${base}/unsubscribe?${q}`,
    oneClick: `${base}/api/unsubscribe/affirmation-reminders?${q}`,
  };
}

async function settingFor(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ on: memberNotifications.affirmationReminders })
    .from(memberNotifications)
    .where(and(eq(memberNotifications.orgId, orgId), eq(memberNotifications.userId, userId)))
    .get();
  return row?.on ?? true;
}

async function saveSetting(ctx: AppContext, orgId: string, userId: string, on: boolean) {
  await ctx.db
    .insert(memberNotifications)
    .values({ orgId, userId, affirmationReminders: on })
    .onConflictDoUpdate({
      target: [memberNotifications.orgId, memberNotifications.userId],
      set: { affirmationReminders: on, updatedAt: ctx.now() },
    });
}

/** The signed-in member's own setting, for the Affirmations page. */
export async function reminderSettings(
  ctx: AppContext,
  orgId: string,
  userId: string,
  role: string,
): Promise<AffirmationReminderSettings> {
  return {
    on: await settingFor(ctx, orgId, userId),
    eligible: (RECIPIENT_ROLES as readonly string[]).includes(role),
    delivers: ctx.email.delivers,
  };
}

export async function saveReminderSettings(
  ctx: AppContext,
  orgId: string,
  userId: string,
  role: string,
  on: boolean,
): Promise<AffirmationReminderSettings> {
  await saveSetting(ctx, orgId, userId, on);
  ctx.logger.info("affirmation.reminders_changed", { orgId, on });
  return reminderSettings(ctx, orgId, userId, role);
}

/** What the signed link shows: the organization and whether the email is on. Changes nothing. */
export async function reminderUnsubscribeStatus(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<ReminderUnsubscribeStatus> {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  return { orgName: org?.name ?? null, on: await settingFor(ctx, orgId, userId) };
}

/** The one-click unsubscribe: turns off this member's reminder for this organization, nothing else. */
export async function unsubscribeReminders(ctx: AppContext, orgId: string, userId: string) {
  const org = await ctx.db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  const u = await ctx.db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();
  // A deleted org or account has nothing to turn off (and a row would break its foreign keys).
  if (org && u) await saveSetting(ctx, orgId, userId, false);
  ctx.logger.info("affirmation.reminders_unsubscribed", { orgId });
}

const redact = (e: unknown) =>
  String(e)
    .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
    .slice(0, 300);

/** The daily run. Never throws; returns counts for the log and tests. */
export async function remindAffirmationsDue(
  ctx: AppContext,
): Promise<{ orgs: number; reminders: number; emails: number; skipped: number; failed: number }> {
  const out = { orgs: 0, reminders: 0, emails: 0, skipped: 0, failed: 0 };
  let orgIds: string[];
  try {
    orgIds = (
      await ctx.db.selectDistinct({ orgId: affirmation.orgId }).from(affirmation).all()
    ).map((r) => r.orgId);
  } catch (e) {
    ctx.logger.error("affirmation.reminder_list_failed", { error: redact(e) });
    return out;
  }
  const needVerified = requiresEmailVerification(ctx.env);
  for (const orgId of orgIds) {
    const log = ctx.logger.child({ orgId });
    try {
      const due = dueReminders((await listAffirmations(ctx, orgId)).schedules);
      if (due.length === 0) continue;
      // Claim first: only the rows this run inserted are mailed.
      const claimed = await ctx.db
        .insert(affirmationReminderSent)
        .values(
          due.map((r) => ({
            orgId,
            level: r.level,
            deadlineKey: r.deadline.key,
            due: r.deadline.due,
            stage: r.stage,
            sentAt: ctx.now(),
          })),
        )
        .onConflictDoNothing()
        .returning({
          level: affirmationReminderSent.level,
          deadlineKey: affirmationReminderSent.deadlineKey,
          due: affirmationReminderSent.due,
          stage: affirmationReminderSent.stage,
        });
      const isClaimed = (r: DueReminder) =>
        claimed.some(
          (c) =>
            c.level === r.level &&
            c.deadlineKey === r.deadline.key &&
            c.due === r.deadline.due &&
            c.stage === r.stage,
        );
      const reminders = due.filter(isClaimed);
      if (reminders.length === 0) continue;
      out.orgs++;
      out.reminders += reminders.length;

      const [org, recipients] = await Promise.all([
        ctx.db
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, orgId))
          .get(),
        ctx.db
          .select({
            userId: user.id,
            email: user.email,
            verified: user.emailVerified,
            on: memberNotifications.affirmationReminders,
          })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .leftJoin(
            memberNotifications,
            and(
              eq(memberNotifications.orgId, member.organizationId),
              eq(memberNotifications.userId, member.userId),
            ),
          )
          .where(and(eq(member.organizationId, orgId), inArray(member.role, [...RECIPIENT_ROLES])))
          .all(),
      ]);
      for (const r of recipients) {
        if (r.on === false || (needVerified && !r.verified) || !isSafeEmailAddress(r.email)) {
          out.skipped++;
          continue;
        }
        try {
          const links = await reminderUnsubscribeLinks(ctx.env, orgId, r.userId);
          const mail = affirmationReminderEmail({
            appUrl: ctx.env.APP_URL,
            orgName: org?.name ?? "",
            reminders,
            unsubscribePage: links?.page ?? null,
          });
          await ctx.email.send({
            to: [r.email],
            subject: mail.subject,
            text: mail.text,
            fromName: "CMMC Workspace",
            ...(links
              ? {
                  // RFC 2369 + RFC 8058: mail apps show their own unsubscribe button and POST here.
                  headers: {
                    "List-Unsubscribe": `<${links.oneClick}>`,
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                  },
                }
              : {}),
          });
          out.emails++;
        } catch (e) {
          out.failed++;
          log.warn("affirmation.reminder_failed", {
            reminders: reminders.length,
            error: redact(e),
          });
        }
      }
    } catch (e) {
      out.failed++;
      log.warn("affirmation.reminder_org_failed", { error: redact(e) });
    }
  }
  ctx.logger.info("affirmation.reminders", out);
  return out;
}
