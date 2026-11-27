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
// - The company's own insurance certificates that are expired or expire within
//   INSURANCE_EXPIRING_DAYS of the report's date (src/shared/insurance.ts) are listed too, soonest
//   first and capped at MAX_DIGEST_CERTIFICATES: many GCs hold payment while the certificate on file
//   has lapsed, so a renewal is part of getting paid. Archived certificates never are. A certificate
//   alone is enough to send the email: it belongs to the company, not to a job, so it is not a job's
//   next step, and waiting for one would hide a lapsed policy from a company with nothing else due.
// - RFIs past the response date the contractor entered, with no answer recorded
//   (src/shared/rfi.ts, overdueRfis), across every job, most days overdue first and capped at
//   MAX_DIGEST_RFIS. The work an RFI covers waits on the answer, and a late answer is the usual
//   start of a delay or a change order, so chasing it is part of the week's list. Like a
//   certificate, an overdue RFI alone is enough to send the email.
// - Submittals waiting on someone (src/shared/submittals.ts, submittalsToChase): back from the GC
//   past the required-back date, not sent past the last day to send for the material to arrive on
//   time, or returned for resubmittal with no next revision entered. Delivery-at-risk ones first,
//   capped at MAX_DIGEST_SUBMITTALS. A late approval holds the material release, so it is part of
//   the week's list too, and enough on its own to send the email.
// - Signed T&M tickets on no change order (src/shared/tm-tickets.ts, ticketsToBill), per job, the
//   oldest work first, capped at MAX_DIGEST_TM_JOBS. The GC's representative signed for the work
//   and nobody has asked to be paid for it yet; subcontracts set deadlines for submitting extra
//   work, so it is enough on its own to send the email.
// - Lower-tier waivers still out (src/shared/lower-tier-waivers.ts, lowerTierToChase): the
//   suppliers and sub-subcontractors the contractor listed on a pay application whose signed waiver
//   has not come in, per pay application, the longest wait first, capped at MAX_DIGEST_LOWER_TIER.
//   Many GCs hold a payment until the lower-tier waivers are in, so it is enough on its own to send
//   the email.
// - The company's other compliance documents (src/shared/company-documents.ts: contractor's
//   licenses, the bonding letter, the EMR letter and the like) that are expired or expire within
//   COMPANY_DOCUMENT_EXPIRING_DAYS of the report's date, soonest first, capped at
//   MAX_DIGEST_DOCUMENTS. A GC asks for them again when they lapse and an expired license can stop
//   work on site, so like a certificate a document alone is enough to send the email. Archived ones
//   and ones with no expiry date (a W-9) never are.
// - Jobs whose daily log has weekdays with no report in the week before the email, less the
//   company's listed holidays (src/shared/daily-reports.ts, dailyReportGaps), among jobs whose log someone is still keeping,
//   most days missing first, capped at MAX_DIGEST_DAILY_GAPS. A GC that asks for a report every
//   workday finds the gaps when a delay or a backcharge is argued, and the day is easiest to write up
//   that week. Unlike the lines above, gaps alone never send the email: a sub is often not on site
//   every weekday, and an email about days nobody worked would teach people to ignore the next one.
// - No next step anywhere, no certificate or document to renew, no overdue RFI, no submittal to
//   chase, no signed T&M ticket to bill and no lower-tier waiver out: no email (null). An email that says "nothing
//   to do" teaches people to ignore the next one.
// - Jobs are in the report's order (most money owed first) and capped at MAX_DIGEST_JOBS; the rest
//   are counted and the email links to the page that lists them all.
import type { CashReport } from "./cash-report";
import {
  COMPANY_DOCUMENT_EXPIRING_DAYS,
  type CompanyDocumentInput,
  documentName,
  documentsNeedingRenewal,
} from "./company-documents";
import { type CompanyDailyReportJob, type DailyReportGap, dailyReportGaps } from "./daily-reports";
import { type FollowUpKind, followUpKind } from "./follow-up-email";
import {
  type CertificateInput,
  certificateName,
  certificatesNeedingRenewal,
  INSURANCE_EXPIRING_DAYS,
  joinNames,
} from "./insurance";
import {
  type CompanyLowerTierInput,
  type LowerTierPayAppToChase,
  lowerTierToChase,
} from "./lower-tier-waivers";
import { formatCents } from "./money";
import { type CompanyRfiInput, type OverdueRfi, overdueRfis } from "./rfi";
import type { HolidayCalendar } from "./schedule";
import { type CompanySubmittalInput, type SubmittalToChase, submittalsToChase } from "./submittals";
import { type CompanyTmTicketInput, type TmJobToBill, ticketsToBill } from "./tm-tickets";

export const MAX_DIGEST_JOBS = 15;
/** Certificates listed by name; any more are counted and the email links to the insurance page. */
export const MAX_DIGEST_CERTIFICATES = 10;
/** Company documents listed by name; any more are counted and the email links to the documents page. */
export const MAX_DIGEST_DOCUMENTS = 10;
/** Overdue RFIs listed one by one; any more are counted and the email links to the projects page. */
export const MAX_DIGEST_RFIS = 10;
/** Submittals to chase listed one by one; any more are counted and the email links to the projects page. */
export const MAX_DIGEST_SUBMITTALS = 10;
/** Jobs with signed T&M tickets to bill, listed one by one; any more are counted. */
export const MAX_DIGEST_TM_JOBS = 10;
/** Pay applications with lower-tier waivers still out, listed one by one; any more are counted. */
export const MAX_DIGEST_LOWER_TIER = 10;
/** Jobs with weekdays missing from the daily log, listed one by one; any more are counted. */
export const MAX_DIGEST_DAILY_GAPS = 10;

/** One certificate to renew, as the email lists it. */
export interface CashDigestCertificate {
  id: string;
  name: string;
  /** YYYY-MM-DD. */
  expiresOn: string;
  status: "expiring" | "expired";
  /** Days from the report's date to the expiry date: 0 on the day, negative once past. */
  daysLeft: number;
  /** The GCs recorded as holding it (the renewal goes to each); absent or empty when none. */
  holders?: string[];
}

/** One company document (license, bonding letter...) to renew, as the email lists it. */
export interface CashDigestDocument {
  id: string;
  name: string;
  /** YYYY-MM-DD. */
  expiresOn: string;
  status: "expiring" | "expired";
  /** Days from the report's date to the expiry date: 0 on the day, negative once past. */
  daysLeft: number;
}

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
  /** Active certificates expired or expiring on the report's date, soonest first, capped. */
  certificates: CashDigestCertificate[];
  /** Certificates to renew left out by the cap. */
  moreCertificates: number;
  /** Active company documents expired or expiring on the report's date, soonest first, capped. */
  documents: CashDigestDocument[];
  /** Documents to renew left out by the cap. */
  moreDocuments: number;
  /** RFIs past their response date with no answer, across jobs, most days overdue first, capped. */
  rfis: OverdueRfi[];
  /** Overdue RFIs left out by the cap. */
  moreRfis: number;
  /** Submittals overdue back, late to send or to resubmit, across jobs, at-risk first, capped. */
  submittals: SubmittalToChase[];
  /** Submittals to chase left out by the cap. */
  moreSubmittals: number;
  /** Jobs with signed T&M tickets on no change order, the oldest work first, capped. */
  tmJobs: TmJobToBill[];
  /** Jobs with tickets to bill left out by the cap. */
  moreTmJobs: number;
  /** Pay applications with lower-tier waivers not yet received, longest wait first, capped. */
  lowerTier: LowerTierPayAppToChase[];
  /** Pay applications with lower-tier waivers out left out by the cap. */
  moreLowerTier: number;
  /** Jobs with weekdays missing from the daily log in the week before, most days first, capped. */
  dailyGaps: DailyReportGap[];
  /** Jobs with missing days left out by the cap. */
  moreDailyGaps: number;
}

export function cashDigest(
  report: CashReport,
  maxJobs = MAX_DIGEST_JOBS,
  certificates: CertificateInput[] = [],
  rfis: CompanyRfiInput[] = [],
  submittals: CompanySubmittalInput[] = [],
  tmTickets: CompanyTmTicketInput[] = [],
  lowerTierRows: CompanyLowerTierInput[] = [],
  documents: CompanyDocumentInput[] = [],
  dailyReportJobs: CompanyDailyReportJob[] = [],
  holidays: HolidayCalendar = new Map(),
): CashDigest | null {
  const withSteps = report.projects.filter((p) => p.actions.length > 0);
  const renew = certificatesNeedingRenewal(certificates, report.asOf);
  const late = overdueRfis(rfis, report.asOf);
  const chase = submittalsToChase(submittals, report.asOf);
  const toBill = ticketsToBill(tmTickets, report.asOf);
  const ltOut = lowerTierToChase(lowerTierRows, report.asOf);
  const docs = documentsNeedingRenewal(documents, report.asOf);
  if (
    withSteps.length === 0 &&
    renew.length === 0 &&
    docs.length === 0 &&
    late.length === 0 &&
    chase.length === 0 &&
    toBill.length === 0 &&
    ltOut.length === 0
  )
    return null;
  const gaps = dailyReportGaps(dailyReportJobs, report.asOf, holidays);
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
      t.retainageWaitingOnCloseoutCents > 0
        ? `Retainage on finished work: ${formatCents(t.retainageOnCompleteJobsCents)}, of which ${formatCents(t.retainageWaitingOnCloseoutCents)} is waiting on close-out (punch items or documents still open).`
        : `Retainage on finished work, ready to bill: ${formatCents(t.retainageOnCompleteJobsCents)}.`,
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
  if (renew.length > 0) {
    const expired = renew.filter((c) => c.status === "expired").length;
    summary.push(
      expired > 0
        ? `Insurance certificates to renew: ${renew.length}, of which ${expired} ${expired === 1 ? "has" : "have"} expired.`
        : `Insurance certificates expiring within ${INSURANCE_EXPIRING_DAYS} days: ${renew.length}.`,
    );
  }
  if (docs.length > 0) {
    const expired = docs.filter((d) => d.status === "expired").length;
    summary.push(
      expired > 0
        ? `Licenses and company documents to renew: ${docs.length}, of which ${expired} ${expired === 1 ? "has" : "have"} expired.`
        : `Licenses and company documents expiring within ${COMPANY_DOCUMENT_EXPIRING_DAYS} days: ${docs.length}.`,
    );
  }
  if (late.length > 0) {
    summary.push(`RFIs past the response date with no answer: ${late.length}.`);
  }
  if (chase.length > 0) {
    const risk = chase.filter((s) => s.deliveryAtRisk).length;
    summary.push(
      risk > 0
        ? `Submittals to chase: ${chase.length}, of which ${risk} put${risk === 1 ? "s" : ""} delivery on site at risk.`
        : `Submittals to chase (overdue back, late to send or to resubmit): ${chase.length}.`,
    );
  }
  if (toBill.length > 0) {
    const tickets = toBill.reduce((n, j) => n + j.tickets.length, 0);
    const cents = toBill.reduce((n, j) => n + j.pricedCents, 0);
    const unpriced = toBill.reduce((n, j) => n + j.unpriced, 0);
    const jobsText = toBill.length === 1 ? "1 job" : `${toBill.length} jobs`;
    const amount =
      unpriced === tickets
        ? "not priced yet"
        : unpriced > 0
          ? `${formatCents(cents)} priced, ${unpriced} not priced yet`
          : `${formatCents(cents)} priced`;
    summary.push(`Signed T&M tickets not on a change order: ${tickets} on ${jobsText}, ${amount}.`);
  }
  if (ltOut.length > 0) {
    const n = ltOut.reduce((sum, p) => sum + p.outstanding, 0);
    const apps = ltOut.length === 1 ? "1 pay application" : `${ltOut.length} pay applications`;
    summary.push(`Lower-tier lien waivers still out: ${n} on ${apps}.`);
  }
  if (gaps.length > 0) {
    const days = gaps.reduce((n, g) => n + g.days.length, 0);
    const jobsText = gaps.length === 1 ? "1 job" : `${gaps.length} jobs`;
    summary.push(`Weekdays without a daily report last week: ${days} on ${jobsText}.`);
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
  const listed = renew.slice(0, MAX_DIGEST_CERTIFICATES).map(
    (c): CashDigestCertificate => ({
      id: c.id,
      name: certificateName(c),
      expiresOn: c.expiresOn,
      status: c.status === "expired" ? "expired" : "expiring",
      daysLeft: c.daysLeft,
      holders: c.holderGcs ?? [],
    }),
  );
  const listedDocs = docs.slice(0, MAX_DIGEST_DOCUMENTS).map(
    (d): CashDigestDocument => ({
      id: d.id,
      name: documentName(d),
      // documentsNeedingRenewal keeps only dated documents expired or expiring.
      expiresOn: d.expiresOn ?? "",
      status: d.status === "expired" ? "expired" : "expiring",
      daysLeft: d.daysLeft ?? 0,
    }),
  );
  return {
    asOf: report.asOf,
    summary,
    jobs,
    moreJobs: withSteps.length - jobs.length,
    followUps,
    certificates: listed,
    moreCertificates: renew.length - listed.length,
    documents: listedDocs,
    moreDocuments: docs.length - listedDocs.length,
    rfis: late.slice(0, MAX_DIGEST_RFIS),
    moreRfis: Math.max(0, late.length - MAX_DIGEST_RFIS),
    submittals: chase.slice(0, MAX_DIGEST_SUBMITTALS),
    moreSubmittals: Math.max(0, chase.length - MAX_DIGEST_SUBMITTALS),
    tmJobs: toBill.slice(0, MAX_DIGEST_TM_JOBS),
    moreTmJobs: Math.max(0, toBill.length - MAX_DIGEST_TM_JOBS),
    lowerTier: ltOut.slice(0, MAX_DIGEST_LOWER_TIER),
    moreLowerTier: Math.max(0, ltOut.length - MAX_DIGEST_LOWER_TIER),
    dailyGaps: gaps.slice(0, MAX_DIGEST_DAILY_GAPS),
    moreDailyGaps: Math.max(0, gaps.length - MAX_DIGEST_DAILY_GAPS),
  };
}

/** "General liability (Acme Mutual): expired 2026-11-20." or "...: expires 2026-12-10, in 17 days." */
export function digestCertificateText(c: CashDigestCertificate): string {
  const gcs = c.holders?.length ? joinNames(c.holders) : null;
  if (c.status === "expired") {
    const send = gcs
      ? `Send the renewal certificate to ${gcs}`
      : "Send your GCs the renewal certificate";
    return c.daysLeft === 0
      ? `${c.name}: expires today, ${c.expiresOn}. ${send}.`
      : `${c.name}: expired ${c.expiresOn}. ${send}, then enter it in PayApps.`;
  }
  const held = gcs ? ` Held by ${gcs}.` : "";
  return `${c.name}: expires ${c.expiresOn}, in ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"}. Ask your insurer or agent for the renewal certificate.${held}`;
}

/**
 * "Contractor's license (CA): expired 2026-11-20. Renew it, send any GC who keeps a copy on file the
 * new one, then enter it in PayApps." or "...: expires 2026-12-10, in 17 days. Start the renewal..."
 */
export function digestDocumentText(d: CashDigestDocument): string {
  if (d.status === "expired") {
    return d.daysLeft === 0
      ? `${d.name}: expires today, ${d.expiresOn}. Renew it and send any GC who keeps a copy on file the new one.`
      : `${d.name}: expired ${d.expiresOn}. Renew it, send any GC who keeps a copy on file the new one, then enter it in PayApps.`;
  }
  return `${d.name}: expires ${d.expiresOn}, in ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"}. Start the renewal and send your GCs the new copy when it comes.`;
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
