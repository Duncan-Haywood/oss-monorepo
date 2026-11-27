// The weekly "money to chase" email (services/payapps/digest.ts): which lines of the cash report
// (src/shared/cash-report.ts) go into it. Pure and computed from the report alone, so the email
// says exactly what the Cash and retainage page says that day, and nothing it does not.
//
// Rules:
// - Only jobs with at least one next step are listed (past due or unpaid over 30 days, paid short,
//   pay-when-paid with no owner payment recorded after 30 days,
//   retainage to bill on finished work, unconditional waivers owed, change orders waiting past 30
//   days, a disputed balance, a closed job still owed money, a California preliminary notice due
//   or late, the GC's billing cutoff within a week or missed). Their sentences are the report's own.
// - No next step anywhere: no email (null). An email that says "nothing to do" teaches people to
//   ignore the next one.
// - Jobs are in the report's order (most money owed first) and capped at MAX_DIGEST_JOBS; the rest
//   are counted and the email links to the page that lists them all.
import type { CashReport } from "./cash-report";
import { type FollowUpKind, followUpKind } from "./follow-up-email";
import { formatCents } from "./money";

export const MAX_DIGEST_JOBS = 15;

export interface CashDigestJob {
  id: string;
  name: string;
  number: string | null;
  gcName: string;
  outstandingCents: number;
  retainageHeldCents: number;
  actions: string[];
  /** This job's applications with a follow-up draft waiting (past due or paid short), oldest first. */
  drafts: CashDigestDraft[];
}

/** One application's follow-up draft; the email links straight to it on the cash page. */
export interface CashDigestDraft {
  payAppId: string;
  number: number;
  kind: Exclude<FollowUpKind, "status">;
}

export interface CashDigest {
  asOf: string;
  /** One-line totals, plain text, only those that are not zero. */
  summary: string[];
  jobs: CashDigestJob[];
  /** Jobs with next steps left out by the cap. */
  moreJobs: number;
  /**
   * Unpaid applications (past due or paid short, across every job, capped or not) with a follow-up
   * email draft waiting on the cash page; the email links to them.
   */
  followUps: number;
}

export function cashDigest(report: CashReport, maxJobs = MAX_DIGEST_JOBS): CashDigest | null {
  const withSteps = report.projects.filter((p) => p.actions.length > 0);
  if (withSteps.length === 0) return null;
  const t = report.totals;
  const summary: string[] = [];
  if (t.outstandingCents > 0) {
    summary.push(
      t.pastDueCents > 0
        ? `Owed on sent applications: ${formatCents(t.outstandingCents)}, of which ${formatCents(t.pastDueCents)} is past due.`
        : `Owed on sent applications: ${formatCents(t.outstandingCents)}.`,
    );
  }
  if (t.awaitingOwnerCents > 0) {
    summary.push(
      `Waiting on the owner's payment to the GC (pay-when-paid, no due date yet): ${formatCents(t.awaitingOwnerCents)}.`,
    );
  }
  if (t.retainageOnCompleteJobsCents > 0) {
    summary.push(
      `Retainage on finished work, ready to bill: ${formatCents(t.retainageOnCompleteJobsCents)}.`,
    );
  }
  if (t.waiversToSend > 0) {
    summary.push(`Unconditional lien waivers to send: ${t.waiversToSend}.`);
  }
  if (t.pendingChangeOrdersOverdue > 0) {
    summary.push(
      `Change orders waiting more than 30 days for approval: ${t.pendingChangeOrdersOverdue}.`,
    );
  }
  if (t.disputedCents > 0) {
    summary.push(`Disputed balances closed short: ${formatCents(t.disputedCents)}.`);
  }
  const jobs = withSteps.slice(0, Math.max(1, maxJobs)).map((p) => ({
    id: p.id,
    name: p.name,
    number: p.number,
    gcName: p.gcName,
    outstandingCents: p.outstandingCents,
    retainageHeldCents: p.retainageHeldCents,
    actions: p.actions,
    drafts: jobDrafts(p),
  }));
  const followUps = report.projects.reduce((n, p) => n + jobDrafts(p).length, 0);
  return { asOf: report.asOf, summary, jobs, moreJobs: withSteps.length - jobs.length, followUps };
}

function jobDrafts(p: CashReport["projects"][number]): CashDigestDraft[] {
  const drafts: CashDigestDraft[] = [];
  for (const a of p.outstanding) {
    const kind = followUpKind(p, a);
    if (kind !== "status") drafts.push({ payAppId: a.payAppId, number: a.number, kind });
  }
  return drafts.sort((x, y) => x.number - y.number);
}

const DRAFT_KIND_WORDS: Record<CashDigestDraft["kind"], string> = {
  reminder: "reminder",
  second: "second request",
  balance: "question about the balance",
  owner: "question about the owner's payment",
};

/** "Draft email for application #3 (second request)" under the job's next steps. */
export function digestDraftText(d: CashDigestDraft): string {
  return `Draft email for application #${d.number} (${DRAFT_KIND_WORDS[d.kind]})`;
}

/**
 * The cash page's anchor for one application's draft: the page opens that draft and scrolls to it
 * (src/client/components/follow-up-emails.tsx reads the same prefix).
 */
export const FOLLOW_UP_ANCHOR_PREFIX = "follow-up-";
export function followUpAnchor(payAppId: string): string {
  return `${FOLLOW_UP_ANCHOR_PREFIX}${encodeURIComponent(payAppId)}`;
}

/** The line under the jobs pointing at the follow-up drafts, or null when there are none. */
export function digestFollowUpText(d: Pick<CashDigest, "followUps">): string | null {
  if (d.followUps <= 0) return null;
  return d.followUps === 1
    ? "A follow-up email to the GC is drafted for the 1 application past due or paid short: check it, then send it from your own email."
    : `Follow-up emails to the GC are drafted for the ${d.followUps} applications past due or paid short: check them, then send them from your own email.`;
}

/** "Clinic TI (#2207), Harbor Builders" as the job's heading in the email. */
export function digestJobHeading(j: CashDigestJob): string {
  return `${j.name}${j.number ? ` (#${j.number})` : ""}, ${j.gcName}`;
}

/**
 * The cron fires every hour (wrangler.jsonc) and mails each member whose chosen weekday and hour
 * have come in their own time zone; a retried or doubled run, or a day changed after this week's
 * email, sends nothing inside 6 days. A member who never picked an hour or a zone (every row
 * before migration 0029) keeps the old 13:00 UTC.
 */
export const DIGEST_SEND_HOUR_UTC = 13;
export const DEFAULT_DIGEST_WEEKDAY = 1;
export const DEFAULT_DIGEST_HOUR = DIGEST_SEND_HOUR_UTC;
export const DEFAULT_DIGEST_TIME_ZONE = "UTC";
/** The hour the page offers first to a member turning it on: early, before the day's calls. */
export const SUGGESTED_DIGEST_HOUR = 7;
/** Index = day of the week, as Date#getUTCDay() counts it. */
export const DIGEST_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** UTC day of the week (0 Sunday ... 6 Saturday) of a YYYY-MM-DD day. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** "7:00", "13:00": the hour as the page and the email show it (24-hour, no locale guessing). */
export function digestHourText(hour: number): string {
  return `${hour}:00`;
}

/** True for an IANA time zone name this runtime knows ("America/Chicago", "UTC"). */
export function isTimeZone(tz: string): boolean {
  if (tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The local day (YYYY-MM-DD) and hour (0-23) at `now` in `timeZone`; UTC when the zone is unknown. */
export function localClock(now: Date, timeZone: string): { day: string; hour: number } {
  const zone = isTimeZone(timeZone) ? timeZone : DEFAULT_DIGEST_TIME_ZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Some runtimes print midnight as "24" even with h23.
  const hour = Number(get("hour")) % 24;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour };
}

const DAY_MS = 86_400_000;
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** When one member's list goes out. */
export interface DigestSchedule {
  weekday: number;
  hour: number;
  timeZone: string;
}

const UTC_SCHEDULE = { hour: DEFAULT_DIGEST_HOUR, timeZone: DEFAULT_DIGEST_TIME_ZONE };

/**
 * The next day (YYYY-MM-DD, the member's own calendar) the cron will look at this member's list:
 * the first chosen weekday, from today, that is at least 6 days after the last email. Today counts
 * even after the chosen hour, because digestDueDay sends at any hour from it on (a member who picks
 * an hour already past today is mailed on the next hourly run, so the page must not say next week).
 * The email goes out that day only when there is something to chase.
 */
export function nextDigestDay(
  weekday: number,
  lastSentOn: string | null,
  now: Date,
  at: Omit<DigestSchedule, "weekday"> = UTC_SCHEDULE,
): string {
  const { day: today } = localClock(now, at.timeZone);
  let day = lastSentOn !== today ? today : addDays(today, 1);
  for (let i = 0; i < 14; i++, day = addDays(day, 1)) {
    if (weekdayOf(day) === weekday && digestDue(lastSentOn, day)) return day;
  }
  return day;
}

/**
 * The member's local day when their list is due on this cron run, else null: their weekday, at or
 * after their hour (so a missed or late run still sends later that day), and 6 days since the last.
 */
export function digestDueDay(
  s: DigestSchedule & { lastSentOn: string | null },
  now: Date,
): string | null {
  const { day, hour } = localClock(now, s.timeZone);
  if (weekdayOf(day) !== s.weekday || hour < s.hour) return null;
  return digestDue(s.lastSentOn, day) ? day : null;
}

/** The cron fires daily; a retried or doubled run inside 6 days sends nothing. */
export const DIGEST_MIN_DAYS_BETWEEN = 6;

/** True when a member last mailed on `lastSentOn` is due again on `today` (both YYYY-MM-DD, local). */
export function digestDue(lastSentOn: string | null, today: string): boolean {
  if (lastSentOn === null) return true;
  const days =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastSentOn}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days >= DIGEST_MIN_DAYS_BETWEEN;
}

/** The latest day on or before which a previous send leaves the member due on `today`. */
export function digestCutoff(today: string): string {
  const d = new Date(Date.parse(`${today}T00:00:00Z`) - DIGEST_MIN_DAYS_BETWEEN * 86_400_000);
  return d.toISOString().slice(0, 10);
}
