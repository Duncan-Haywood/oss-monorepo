// Getting-started emails (words and rules: src/shared/onboarding-email.ts; docs/EMAIL.md).
// Each send is claimed first with a row in onboarding_emails (primary key org + kind), so a
// company gets each email at most once even when a request or cron runs twice; a failed send
// deletes the claim so a later chance can try again. Never throws: an email must not fail the
// request that triggered it or stop the cron. Logs ids only.
//
// The two reminders (no job yet; a job but nothing sent) carry a signed one-click stop
// (lib/unsubscribe-token.ts, list "onboarding") for that member and company, in the text and as
// RFC 8058 List-Unsubscribe headers. A stop is a `stop:<userId>` row; stopped owners are skipped,
// and a company whose owners all stopped is never claimed.
import type { ReminderSettingDto } from "@shared/api/types";
import type { MemberRole } from "@shared/enums";
import type { GettingStarted } from "@shared/getting-started";
import {
  FIRST_SEND_AFTER_DAYS,
  FIRST_SEND_UNTIL_DAYS,
  firstSendEmailContent,
  NO_JOB_AFTER_DAYS,
  NO_JOB_UNTIL_DAYS,
  noJobEmailContent,
  type OnboardingEmailContent,
  welcomeEmailContent,
} from "@shared/onboarding-email";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, onboardingEmails, organization, projects, user } from "../../db/schema";
import { unsubscribeQuery, unsubscribeSecret } from "../../lib/unsubscribe-token";
import { render } from "../auth/emails";
import { isoDay } from "./cash";
import { orgGettingStarted } from "./getting-started";

type OnboardingKind = "welcome" | "no-job" | "first-send";
const stopKind = (userId: string) => `stop:${userId}` as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const appUrl = (env: { APP_URL: string }) => env.APP_URL.replace(/\/+$/, "");

export interface ReminderStopLinks {
  /** The /unsubscribe page, for people. */
  page: string;
  /** The RFC 8058 one-click POST target, for mail apps. */
  oneClick: string;
}

export function renderOnboardingEmail(
  content: OnboardingEmailContent,
  greetingName: string,
  env: { APP_URL: string },
  stop: ReminderStopLinks | null = null,
) {
  const mail = render({
    subject: content.subject,
    greetingName,
    paragraphs: content.paragraphs,
    action: { label: content.action.label, url: `${appUrl(env)}${content.action.path}` },
    footer: stop
      ? `${content.footer} Stop these reminders for this company (one click, no sign-in): ${stop.page}`
      : content.footer,
  });
  if (!stop) return mail;
  return {
    ...mail,
    headers: {
      "List-Unsubscribe": `<${stop.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** The stop links for one member's reminders, or null without a signing secret (local dev). */
export async function reminderStopLinks(
  env: { APP_URL: string; AUTH_SECRET?: string | undefined },
  orgId: string,
  userId: string,
): Promise<ReminderStopLinks | null> {
  const secret = unsubscribeSecret(env);
  if (!secret) return null;
  const q = await unsubscribeQuery(secret, orgId, userId, "onboarding");
  return {
    page: `${appUrl(env)}/unsubscribe?list=onboarding&${q}`,
    oneClick: `${appUrl(env)}/api/unsubscribe/onboarding?${q}`,
  };
}

/** What the signed stop link shows (routes/unsubscribe.ts): the company and whether it is on. */
export async function reminderStopStatus(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<{ orgName: string | null; subscribed: boolean }> {
  const [org] = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId));
  if (!org) return { orgName: null, subscribed: false };
  const [stopped] = await ctx.db
    .select({ orgId: onboardingEmails.orgId })
    .from(onboardingEmails)
    .where(and(eq(onboardingEmails.orgId, orgId), eq(onboardingEmails.kind, stopKind(userId))));
  return { orgName: org.name, subscribed: !stopped };
}

/**
 * The signed-in member's own reminder setting for this company, for the switch on the checklist.
 * Only owners are sent reminders, so `sentToRole` says whether they would get any at all.
 */
export async function myReminderSetting(
  ctx: AppContext,
  orgId: string,
  userId: string,
  role: MemberRole,
): Promise<ReminderSettingDto> {
  const [stopped] = await ctx.db
    .select({ orgId: onboardingEmails.orgId })
    .from(onboardingEmails)
    .where(and(eq(onboardingEmails.orgId, orgId), eq(onboardingEmails.kind, stopKind(userId))));
  return { sentToRole: role === "owner", on: !stopped };
}

/**
 * The switch: off writes the same stop row as the email's link; on deletes it. Each reminder is
 * still sent at most once per company, so turning them back on never repeats one already sent.
 */
export async function setMyReminders(
  ctx: AppContext,
  orgId: string,
  userId: string,
  role: MemberRole,
  on: boolean,
): Promise<ReminderSettingDto> {
  if (on) {
    await ctx.db
      .delete(onboardingEmails)
      .where(and(eq(onboardingEmails.orgId, orgId), eq(onboardingEmails.kind, stopKind(userId))));
  } else {
    await stopReminders(ctx, orgId, userId);
  }
  ctx.logger.info(on ? "onboarding.reminders_started" : "onboarding.reminders_stopped", { orgId });
  return myReminderSetting(ctx, orgId, userId, role);
}

/** The one-click stop: one row for that member and company; pressing it twice changes nothing. */
export async function stopReminders(ctx: AppContext, orgId: string, userId: string) {
  const [org] = await ctx.db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, orgId));
  if (!org) return; // deleted company: nothing left to send
  await ctx.db
    .insert(onboardingEmails)
    .values({ orgId, kind: stopKind(userId), sentOn: isoDay(ctx.now()) })
    .onConflictDoNothing();
}

async function claim(ctx: AppContext, orgId: string, kind: OnboardingKind): Promise<boolean> {
  const rows = await ctx.db
    .insert(onboardingEmails)
    .values({ orgId, kind, sentOn: isoDay(ctx.now()) })
    .onConflictDoNothing()
    .returning({ orgId: onboardingEmails.orgId });
  return rows.length === 1;
}

async function release(ctx: AppContext, orgId: string, kind: OnboardingKind) {
  await ctx.db
    .delete(onboardingEmails)
    .where(and(eq(onboardingEmails.orgId, orgId), eq(onboardingEmails.kind, kind)));
}

/**
 * The welcome email, after a user creates a company. Only for their first company (someone adding
 * a second one already knows PayApps) and only to a verified address. Returns whether it was sent.
 */
export async function sendWelcomeEmail(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<boolean> {
  try {
    const [u] = await ctx.db
      .select({ email: user.email, name: user.name, verified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId));
    if (!u?.verified) return false;
    const memberships = await ctx.db
      .select({ orgId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId));
    if (memberships.some((m) => m.orgId !== orgId)) return false;
    const [org] = await ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId));
    if (!org) return false;
    if (!(await claim(ctx, orgId, "welcome"))) return false;
    const mail = renderOnboardingEmail(
      welcomeEmailContent({ orgId, orgName: org.name }),
      u.name,
      ctx.env,
    );
    try {
      await ctx.email.send({ to: [u.email], ...mail });
      return true;
    } catch (e) {
      await release(ctx, orgId, "welcome");
      throw e;
    }
  } catch (e) {
    ctx.logger.warn("onboarding.welcome_failed", { orgId, userId, error: String(e) });
    return false;
  }
}

export interface ReminderRun {
  /** Companies in the age window with no reminder of this kind yet. */
  checked: number;
  sent: number;
  /** Checked but not due: the company's state does not call for it, or no owner to send it to. */
  notDue: number;
  failed: number;
}
/** At most this many companies are checked per cron run (per reminder); the rest wait a week. */
export const FIRST_SEND_COMPANIES_PER_RUN = 200;

interface ReminderSpec {
  kind: "no-job" | "first-send";
  afterDays: number;
  untilDays: number;
  content: (
    gs: GettingStarted,
    org: { id: string; name: string; daysSinceCreated: number },
  ) => Promise<OnboardingEmailContent | null>;
}

/**
 * One reminder kind over every company in its age window that has not had it. A company checked
 * and not due is not claimed, so it is checked again next week while it stays inside the window.
 * Goes to the company's owners with a verified address who have not stopped the reminders.
 */
async function sendReminders(
  ctx: AppContext,
  spec: ReminderSpec,
  companiesPerRun: number,
): Promise<ReminderRun> {
  const run: ReminderRun = { checked: 0, sent: 0, notDue: 0, failed: 0 };
  const now = ctx.now();
  try {
    const orgs = await ctx.db
      .select({ id: organization.id, name: organization.name, createdAt: organization.createdAt })
      .from(organization)
      .leftJoin(
        onboardingEmails,
        and(eq(onboardingEmails.orgId, organization.id), eq(onboardingEmails.kind, spec.kind)),
      )
      .where(
        and(
          isNull(onboardingEmails.orgId),
          lte(organization.createdAt, new Date(now.getTime() - spec.afterDays * DAY_MS)),
          gte(organization.createdAt, new Date(now.getTime() - spec.untilDays * DAY_MS)),
        ),
      )
      .orderBy(asc(organization.createdAt))
      .limit(companiesPerRun);

    for (const org of orgs) {
      run.checked++;
      try {
        const gs = await orgGettingStarted(ctx, org.id);
        const daysSinceCreated = (now.getTime() - org.createdAt.getTime()) / DAY_MS;
        const content = await spec.content(gs, { id: org.id, name: org.name, daysSinceCreated });
        const owners = content ? await reminderRecipients(ctx, org.id) : [];
        if (!content || owners.length === 0) {
          run.notDue++;
          continue;
        }
        if (!(await claim(ctx, org.id, spec.kind))) continue; // another run took it
        let delivered = 0;
        for (const o of owners) {
          try {
            const stop = await reminderStopLinks(ctx.env, org.id, o.userId);
            await ctx.email.send({
              to: [o.email],
              ...renderOnboardingEmail(content, o.name, ctx.env, stop),
            });
            delivered++;
          } catch (e) {
            ctx.logger.warn(`onboarding.${spec.kind}_email_failed`, {
              orgId: org.id,
              userId: o.userId,
              error: String(e),
            });
          }
        }
        if (delivered === 0) {
          await release(ctx, org.id, spec.kind);
          run.failed++;
        } else {
          run.sent++;
        }
      } catch (e) {
        run.failed++;
        ctx.logger.error(`onboarding.${spec.kind}_failed`, { orgId: org.id, error: String(e) });
      }
    }
  } catch (e) {
    ctx.logger.error(`onboarding.${spec.kind}_run_failed`, { error: String(e) });
  }
  ctx.logger.info(`onboarding.${spec.kind}_run`, { ...run });
  return run;
}

/** Owners with a verified address who have not pressed the stop link for this company. */
async function reminderRecipients(ctx: AppContext, orgId: string) {
  const [owners, stops] = await Promise.all([
    ctx.db
      .select({ userId: user.id, email: user.email, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, orgId),
          eq(member.role, "owner"),
          eq(user.emailVerified, true),
        ),
      ),
    ctx.db
      .select({ kind: onboardingEmails.kind })
      .from(onboardingEmails)
      .where(eq(onboardingEmails.orgId, orgId)),
  ]);
  const stopped = new Set(stops.map((s) => s.kind));
  return owners.filter((o) => !stopped.has(stopKind(o.userId)));
}

/**
 * The first-send reminder, from the weekly cron. Due: created 5 to 60 days ago, never reminded,
 * a real job (the sample never counts) and no application marked sent.
 */
export function sendFirstSendReminders(
  ctx: AppContext,
  opts: { companiesPerRun?: number } = {},
): Promise<ReminderRun> {
  return sendReminders(
    ctx,
    {
      kind: "first-send",
      afterDays: FIRST_SEND_AFTER_DAYS,
      untilDays: FIRST_SEND_UNTIL_DAYS,
      content: async (gs, org) =>
        firstSendEmailContent(gs, {
          orgId: org.id,
          orgName: org.name,
          daysSinceCreated: org.daysSinceCreated,
        }),
    },
    opts.companiesPerRun ?? FIRST_SEND_COMPANIES_PER_RUN,
  );
}

/**
 * The no-job reminder, from the weekly cron. Due: created 3 to 30 days ago, never reminded and no
 * real job (a sample job alone still counts as no job).
 */
export function sendNoJobReminders(
  ctx: AppContext,
  opts: { companiesPerRun?: number } = {},
): Promise<ReminderRun> {
  return sendReminders(
    ctx,
    {
      kind: "no-job",
      afterDays: NO_JOB_AFTER_DAYS,
      untilDays: NO_JOB_UNTIL_DAYS,
      content: async (gs, org) => {
        if (gs.steps.find((s) => s.key === "job")?.done) return null;
        const [sample] = await ctx.db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.orgId, org.id), eq(projects.isSample, true)))
          .limit(1);
        return noJobEmailContent(gs, {
          orgId: org.id,
          orgName: org.name,
          daysSinceCreated: org.daysSinceCreated,
          hasSample: Boolean(sample),
        });
      },
    },
    opts.companiesPerRun ?? FIRST_SEND_COMPANIES_PER_RUN,
  );
}
