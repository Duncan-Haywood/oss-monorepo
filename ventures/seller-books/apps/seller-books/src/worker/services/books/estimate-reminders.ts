// The 1040-ES reminder email: an owner or admin who turns it on (the Estimated tax page) gets one email a
// week before each estimated-tax due date, with what is still to pay by that date from the books and the
// figures saved for the year (services/books/estimate-settings.ts). A date the saved figures show as
// covered (paid and withheld reach the amount due, or the year's tax after withholding is under $1,000)
// sends nothing. Sent by the Worker's daily cron (index.ts, wrangler.jsonc). Which date a day reminds of:
// src/shared/estimate-reminder.ts. Pattern from apps/payapps (services/payapps/digest.ts).
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import {
  longDate,
  nextDueDate,
  paymentName,
  REMINDER_LEAD_DAYS,
  type ReminderTarget,
  reminderTarget,
  whenText,
} from "@shared/estimate-reminder";
import { ESTIMATED_TAX_DISCLAIMER, estimate } from "@shared/estimated-tax";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { estimateReminders, member, organization, user } from "../../db/schema";
import { unsubscribeQuery, unsubscribeSecret } from "../../lib/unsubscribe-token";
import { escapeHtml } from "../auth/emails";
import { getEstimateSettings } from "./estimate-settings";
import { profitToDateByPeriod } from "./service";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const appUrl = (env: { APP_URL: string }) => env.APP_URL.replace(/\/+$/, "");
const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const DAY = 86_400_000;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Only these roles may have the email: the amount comes from the taxpayer's own saved figures. */
const canHaveReminder = (role: string) =>
  ROLE_RANK[(role in ROLE_RANK ? role : "viewer") as MemberRole] >= ROLE_RANK.admin;

export interface ReminderSetting {
  enabled: boolean;
  /** The due date last reminded of, or null. */
  lastSentDue: string | null;
  /** The next due date and the day its reminder goes out (from REMINDER_LEAD_DAYS before it). */
  next: { due: string; year: number; quarter: number; sendsOn: string };
  /** True when mail actually leaves the Worker (false until the deploy sets EMAIL_FROM). */
  delivers: boolean;
  emailVerified: boolean;
}

export async function getReminderSetting(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<ReminderSetting> {
  const [row] = await ctx.db
    .select({ lastSentDue: estimateReminders.lastSentDue })
    .from(estimateReminders)
    .where(and(eq(estimateReminders.orgId, orgId), eq(estimateReminders.userId, userId)));
  const [u] = await ctx.db
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  const today = isoDay(ctx.now());
  // A date already reminded of moves "next" to the one after it.
  let next = nextDueDate(today);
  if (row?.lastSentDue && row.lastSentDue >= next.due) next = nextDueDate(addDays(next.due, 1));
  const sendsOn = addDays(next.due, -REMINDER_LEAD_DAYS);
  return {
    enabled: row !== undefined,
    lastSentDue: row?.lastSentDue ?? null,
    next: {
      due: next.due,
      year: next.year,
      quarter: next.quarter,
      sendsOn: sendsOn < today ? today : sendsOn,
    },
    delivers: ctx.email.delivers,
    emailVerified: u?.emailVerified ?? false,
  };
}

export async function setReminder(
  ctx: AppContext,
  orgId: string,
  userId: string,
  enabled: boolean,
): Promise<ReminderSetting> {
  if (enabled) {
    await ctx.db.insert(estimateReminders).values({ orgId, userId }).onConflictDoNothing();
  } else {
    await ctx.db
      .delete(estimateReminders)
      .where(and(eq(estimateReminders.orgId, orgId), eq(estimateReminders.userId, userId)));
  }
  return getReminderSetting(ctx, orgId, userId);
}

/** What the signed unsubscribe link shows (routes/unsubscribe.ts): the shop and whether it is on. */
export async function reminderUnsubscribeStatus(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<{ orgName: string | null; subscribed: boolean }> {
  const [org] = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId));
  const [row] = await ctx.db
    .select({ orgId: estimateReminders.orgId })
    .from(estimateReminders)
    .where(and(eq(estimateReminders.orgId, orgId), eq(estimateReminders.userId, userId)));
  return { orgName: org?.name ?? null, subscribed: row !== undefined };
}

/**
 * The two unsubscribe links for one member's email, or null without a signing secret (local dev):
 * `page` is the /unsubscribe page for people, `oneClick` the RFC 8058 POST target for mail apps.
 */
export async function reminderUnsubscribeLinks(
  env: { APP_URL: string; AUTH_SECRET?: string | undefined },
  orgId: string,
  userId: string,
): Promise<{ page: string; oneClick: string } | null> {
  const secret = unsubscribeSecret(env);
  if (!secret) return null;
  const q = await unsubscribeQuery(secret, orgId, userId, "estimate-reminder");
  return {
    page: `${appUrl(env)}/unsubscribe?list=estimate-reminder&${q}`,
    oneClick: `${appUrl(env)}/api/unsubscribe/estimate-reminder?${q}`,
  };
}

/** What the reminder says about the amount, from the shop's books and the year's saved figures. */
export type ReminderFigures =
  | { kind: "no-figures" }
  | { kind: "no-amount" }
  | { kind: "covered"; exempt: boolean; credited: number }
  | { kind: "amount"; stillToPay: number; target: number; credited: number };

/** The amount still to pay by the target's due date, read as the Estimated tax page reads it today. */
export async function reminderFigures(
  ctx: AppContext,
  orgId: string,
  t: ReminderTarget,
  today: string,
): Promise<ReminderFigures> {
  const s = await getEstimateSettings(ctx, orgId, t.year);
  if (!s) return { kind: "no-figures" };
  const cents = (d: number) => Math.round(d * 100);
  const books = await profitToDateByPeriod(ctx, orgId, t.year, today, s.mileageRate);
  const est = estimate({
    year: t.year,
    asOf: today,
    filing: s.filing,
    wages: cents(s.wages),
    otherIncome: cents(s.otherIncome),
    withholding: cents(s.withholding),
    priorYearTax: s.priorYearTax == null ? null : cents(s.priorYearTax),
    priorAgiOver150k: s.priorAgiOver150k,
    paid: s.paid.map(cents),
    profitToDate: books.profitToDate,
    homeOffice: books.homeOffice != null,
  });
  const row = est.rows[t.quarter];
  if (!row || row.stillToPay == null || row.cumulativeTarget == null) return { kind: "no-amount" };
  if (est.exempt || row.stillToPay === 0)
    return { kind: "covered", exempt: est.exempt, credited: row.credited };
  return {
    kind: "amount",
    stillToPay: row.stillToPay,
    target: row.cumulativeTarget,
    credited: row.credited,
  };
}

export interface RenderedReminder {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

/**
 * Plain text + minimal HTML, every interpolated value escaped. The subject is fixed text plus the date:
 * the shop's name is typed by its owner and never reaches a header.
 */
export function reminderEmail(
  t: ReminderTarget,
  figures: Exclude<ReminderFigures, { kind: "covered" }>,
  opts: {
    orgId: string;
    orgName: string;
    userName: string;
    today: string;
    unsubscribe?: { page: string; oneClick: string } | null;
  },
  env: { APP_URL: string },
): RenderedReminder {
  const pageUrl = `${appUrl(env)}/orgs/${encodeURIComponent(opts.orgId)}/estimated-tax`;
  const name = opts.userName.trim() || "there";
  const payment = paymentName(t);
  const lead = `${payment[0]?.toUpperCase() ?? ""}${payment.slice(1)} is due ${whenText(t.daysLeft)}, ${longDate(t.due)}.`;
  const amount =
    figures.kind === "amount"
      ? [
          `From the books for ${opts.orgName} to ${longDate(opts.today)} and the figures saved for ${t.year} on the Estimated tax page, about ${usd(figures.stillToPay)} is still to pay by that date: ${usd(figures.target)} to have paid by then (the lower of the regular and annualized amounts), less ${usd(figures.credited)} already paid or withheld toward it.`,
          "If sales or expenses since your last import are missing from the books, import them first: the amount moves with them.",
        ]
      : figures.kind === "no-amount"
        ? [
            `The figures saved for ${t.year} are not enough to work out an amount yet (usually last year's total tax is not entered, or no ${t.year} tax brackets are on file). Open the Estimated tax page to check them.`,
          ]
        : [
            `No figures are saved for ${t.year} on the Estimated tax page, so this email has no amount. Enter your filing status, wages, withholding and last year's tax there, and the page (and the next reminder) will show what is still to pay.`,
          ];
  const how =
    "You can pay through IRS Direct Pay or your IRS online account, through EFTPS, or by mailing a check with the Form 1040-ES voucher. A state estimated payment, if your state asks for one, is not in this figure.";
  const unsub = opts.unsubscribe ?? null;
  const footer = `You get this email because you turned on estimated-tax reminders for ${opts.orgName} on the Estimated tax page${unsub ? "" : "; turn them off there"}.`;
  const paragraphs = [lead, ...amount, how, ESTIMATED_TAX_DISCLAIMER];
  const text = [
    `Hi ${name},`,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    `Open the Estimated tax page: ${pageUrl}`,
    "",
    footer,
    ...(unsub ? [`Stop these reminders (one click, no sign-in): ${unsub.page}`] : []),
    "",
    "Seller Books",
  ].join("\n");
  const p = (s: string, style = "margin:0 0 16px") => `<p style="${style}">${escapeHtml(s)}</p>`;
  const small = "margin:0 0 16px;font-size:13px;color:#475569";
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">',
    p(`Hi ${name},`),
    p(lead, "margin:0 0 16px;font-weight:600"),
    ...amount.map((s) => p(s)),
    p(how),
    `<p style="margin:0 0 16px"><a href="${escapeHtml(pageUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the Estimated tax page</a></p>`,
    p(ESTIMATED_TAX_DISCLAIMER, small),
    p(footer, small),
    unsub
      ? `<p style="${small}"><a href="${escapeHtml(unsub.page)}" style="color:#475569">Stop these reminders</a> (one click, no sign-in).</p>`
      : "",
    '<p style="margin:0">Seller Books</p>',
    "</body></html>",
  ].join("");
  const subject = `Estimated tax due ${longDate(t.due)}: your Seller Books reminder`;
  if (!unsub) return { subject, text, html };
  // RFC 2369 + RFC 8058: mail apps show their own unsubscribe button and POST to the link.
  const headers = {
    "List-Unsubscribe": `<${unsub.oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return { subject, text, html, headers };
}

export interface ReminderRun {
  /** The due date this run reminded of, or null when none is within the lead time. */
  due: string | null;
  shops: number;
  sent: number;
  /** Members whose saved figures show the date covered: no email, checked again on the next run. */
  covered: number;
  failed: number;
}

/** At most this many shops per run; the rest are picked up by the next day's run. */
export const REMINDER_SHOPS_PER_RUN = 200;

/**
 * Send today's reminders. Due: a due date is within REMINDER_LEAD_DAYS, the member is still the shop's
 * owner or an admin, their address is verified, and they have not been reminded of that date. Each send
 * is claimed first with a conditional update on last_sent_due, so two runs (a retry, two isolates)
 * never mail the same member twice; a failed send puts the old value back. One reading of the books per
 * shop, however many of its members asked.
 */
export async function sendEstimateReminders(
  ctx: AppContext,
  opts: { shopsPerRun?: number } = {},
): Promise<ReminderRun> {
  const today = isoDay(ctx.now());
  const t = reminderTarget(today);
  const run: ReminderRun = { due: t?.due ?? null, shops: 0, sent: 0, covered: 0, failed: 0 };
  if (!t) return run;
  const candidates = await ctx.db
    .select({
      orgId: estimateReminders.orgId,
      userId: estimateReminders.userId,
      lastSentDue: estimateReminders.lastSentDue,
      role: member.role,
      email: user.email,
      userName: user.name,
      orgName: organization.name,
    })
    .from(estimateReminders)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, estimateReminders.orgId),
        eq(member.userId, estimateReminders.userId),
      ),
    )
    .innerJoin(user, eq(user.id, estimateReminders.userId))
    .innerJoin(organization, eq(organization.id, estimateReminders.orgId))
    .where(
      and(
        eq(user.emailVerified, true),
        or(isNull(estimateReminders.lastSentDue), ne(estimateReminders.lastSentDue, t.due)),
      ),
    )
    .orderBy(asc(estimateReminders.orgId));

  const byShop = new Map<string, typeof candidates>();
  for (const r of candidates) {
    if (!canHaveReminder(r.role)) continue;
    const list = byShop.get(r.orgId) ?? [];
    list.push(r);
    byShop.set(r.orgId, list);
  }
  const limit = opts.shopsPerRun ?? REMINDER_SHOPS_PER_RUN;
  for (const [orgId, members] of byShop) {
    if (run.shops >= limit) break;
    run.shops++;
    let figures: ReminderFigures;
    try {
      figures = await reminderFigures(ctx, orgId, t, today);
    } catch (e) {
      ctx.logger.error("estimate_reminder.figures_failed", { orgId, error: String(e) });
      run.failed += members.length;
      continue;
    }
    if (figures.kind === "covered") {
      run.covered += members.length;
      continue;
    }
    for (const m of members) {
      if (!(await claim(ctx, orgId, m.userId, m.lastSentDue, t.due))) continue; // another run took it
      const unsubscribe = await reminderUnsubscribeLinks(ctx.env, orgId, m.userId);
      const mail = reminderEmail(
        t,
        figures,
        { orgId, orgName: m.orgName, userName: m.userName, today, unsubscribe },
        ctx.env,
      );
      try {
        await ctx.email.send({ to: [m.email], ...mail });
        run.sent++;
      } catch (e) {
        run.failed++;
        ctx.logger.warn("estimate_reminder.email_failed", {
          orgId,
          userId: m.userId,
          error: String(e),
        });
        await ctx.db
          .update(estimateReminders)
          .set({ lastSentDue: m.lastSentDue })
          .where(
            and(
              eq(estimateReminders.orgId, orgId),
              eq(estimateReminders.userId, m.userId),
              eq(estimateReminders.lastSentDue, t.due),
            ),
          );
      }
    }
  }
  ctx.logger.info("estimate_reminder.run", { ...run });
  return run;
}

async function claim(
  ctx: AppContext,
  orgId: string,
  userId: string,
  previous: string | null,
  due: string,
): Promise<boolean> {
  const res = await ctx.db
    .update(estimateReminders)
    .set({ lastSentDue: due })
    .where(
      and(
        eq(estimateReminders.orgId, orgId),
        eq(estimateReminders.userId, userId),
        previous === null
          ? isNull(estimateReminders.lastSentDue)
          : eq(estimateReminders.lastSentDue, previous),
      ),
    )
    .returning({ orgId: estimateReminders.orgId });
  return res.length === 1;
}
