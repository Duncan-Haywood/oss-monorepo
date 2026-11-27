// Cash across jobs: what has been applied for, what is still owed and how old it is, and how much
// retainage the GCs are holding. Pure: computed from the pay applications and their computed summaries
// (src/shared/payapp-math.ts), nothing stored. Drafts are left out: nothing is owed on a draft.
//
// Definitions (cents):
// - applied: the sum of line 8 (current payment due) of every submitted, certified or paid application
//   made here. A mid-job start's opening application is not counted: it was billed elsewhere.
// - expected: per application, the GC-certified amount when there is one, else line 8.
// - paid: expected of applications marked paid (marking paid records the whole application as paid),
//   plus the payments recorded so far against applications not yet paid in full (src/shared/payments.ts).
// - outstanding: expected less payments received, of submitted or certified applications, aged from
//   the application date.
// - retainageHeld: line 5 (total retainage) of the latest submitted application, which already nets
//   out retainage released and includes retainage from before a mid-job start.
// - workComplete: the latest submitted application has no balance to finish on any line (line 9 minus
//   retainage is zero), so the retainage is the only money left and is due under most subcontracts.
// - dueOn: with the job's pay terms (days the subcontract gives the GC to pay), the application date
//   plus those days, or the period end plus those days when the terms count from the end of the
//   period billed (payTermsBasis "period_end", e.g. "30 days after the end of the month"), or the day
//   the owner paid the GC for it (payTermsBasis "owner_paid", pay-when-paid). Past due: still owed
//   after that date. Expected in the next 30 days: still owed and due within 30 days of the report
//   date (past-due money is not in it). A pay-when-paid job may also have an outer limit
//   (payTermsOuterDays, "and in any event within 90 days"): the application is then due on the
//   earlier of the owner's payment plus the days and the application date plus the outer limit, and
//   is due by that outer limit even when the owner's payment is never recorded. A job with no pay terms keeps the old rule: a follow-up once
//   an application is 30 days old.
// - awaitingOwner: on a pay-when-paid job, an application still owed whose owner payment has not
//   been recorded has no due date (unless the job has an outer limit, which dates it): PayApps never
//   guesses when the owner pays. Its money is reported
//   apart (not past due, not in the forecast), and once it is more than OWNER_PAYMENT_FOLLOW_UP_DAYS
//   days old the next step is to ask the GC whether the owner has paid on it.
// - pendingChangeCents: the change orders still waiting for the GC's approval that add money (net of
//   their own lines), which cannot be billed until approved. Pending deductions are listed but not
//   added in. Each is aged from the date it went to the GC, else from the date it was entered here;
//   one waiting more than PENDING_CHANGE_FOLLOW_UP_DAYS days gets a follow-up. That follow-up names
//   the last email drafted to the GC's PM from PayApps (change_orders.last_emailed_on) when it came
//   after the date sent, so nobody chases twice in a week without knowing; with no date sent
//   recorded and a request already drafted, it asks for the date sent instead (lastFollowUp).
// - closedShort: applications paid short whose balance was closed (src/shared/payments.ts). The
//   balance is neither paid nor outstanding: it is counted under its reason (backcharged, disputed,
//   written off). A disputed balance gets a next step, since the contractor still claims it.
// - billing cutoff: with the job's cutoff day set (the day of the month the GC must receive the
//   application), a next step within a week of a cutoff with nothing sent this cycle, or after a
//   missed one (src/shared/billing-cutoff.ts). Drafts are read here only for this.
// - closeout: on a job whose work is complete with retainage held, what still stands between it and
//   the release (punch items not accepted, close-out documents still to send), as the job's close-out
//   checklist reads it (closeoutReadiness in src/shared/closeout.ts, computed by the Worker). Its
//   retainage is counted again under retainageWaitingOnCloseoutCents until nothing does.
import { billingCutoff, billingCutoffText } from "./billing-cutoff";
import type { CloseoutReadiness } from "./closeout";
import type { PayAppStatus, PayTermsBasis, ShortCloseReason } from "./enums";
import {
  type GaWaiverClock,
  gaClockNeedsAction,
  gaClockText,
  gaWaiverClocks,
} from "./ga-waiver-clock";
import { type LienDeadline, lienDeadlineText } from "./lien-deadline";
import { formatCents } from "./money";
import type { ApplicationSummary, Totals } from "./payapp-math";
import { expectedCents, type PaymentInput, paymentPosition } from "./payments";
import { type TxSendFacts, type TxUnpaidMonth, txNoticeTexts, txUnpaidMonths } from "./tx-notices";
import {
  type WaiverFollowUpInput,
  type WaiverToSend,
  waiversToSend,
  waiverToSendText,
} from "./waiver-followup";

export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface CashReportAppInput {
  id: string;
  number: number;
  status: PayAppStatus;
  applicationDate: string; // YYYY-MM-DD
  periodTo: string; // YYYY-MM-DD
  /** First day of the period (YYYY-MM-DD); the Texas notices read the months it covers. */
  periodFrom?: string;
  /** The UTC day it left draft (src/shared/billing-cutoff.ts); null or absent for a draft. */
  submittedOn?: string | null;
  certifiedAmountCents: number | null;
  /** Pay-when-paid: the day the owner paid the GC for this application, or null when not known. */
  ownerPaidOn?: string | null;
  summary: ApplicationSummary;
  totals: Totals;
  /** Payments recorded against this application (none when only marked paid). */
  payments?: PaymentInput[];
  /** Lien waivers saved on this application (src/shared/waiver-followup.ts). */
  waivers?: WaiverFollowUpInput[];
  /** The balance closed short on a paid application, or null. */
  shortClose?: {
    cents: number;
    reason: ShortCloseReason;
    note: string | null;
    closedOn: string;
  } | null;
}

export interface ClosedShortApp {
  payAppId: string;
  number: number;
  cents: number;
  reason: ShortCloseReason;
  note: string | null;
  closedOn: string;
}

export interface CashReportChangeOrderInput {
  id: string;
  number: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  /** Net of the change order's lines (negative for a deduction). */
  amountCents: number;
  /** Date it went to the GC; null when not recorded. */
  submittedOn: string | null;
  /** Date it was entered here. */
  createdOn: string;
  /** Last day its email draft was copied or opened in PayApps; null when never. */
  lastEmailedOn?: string | null;
}

export interface PendingChange {
  id: string;
  number: string;
  description: string;
  amountCents: number;
  submittedOn: string | null;
  /** Days since it went to the GC, else since it was entered. */
  ageDays: number;
  agedFrom: "sent" | "entered";
  /** Last day its email draft was copied or opened in PayApps; null when never. */
  lastEmailedOn: string | null;
  /** Days from lastEmailedOn to the report date; null when never emailed. */
  lastEmailedDays: number | null;
}

/** A pending change order older than this many days gets a follow-up. */
export const PENDING_CHANGE_FOLLOW_UP_DAYS = 30;

export interface CashReportProjectInput {
  id: string;
  name: string;
  number: string | null;
  gcName: string;
  /** The GC's billing contact, used to address the follow-up drafts. */
  gcBillingName?: string | null;
  gcBillingEmail?: string | null;
  status: "active" | "closed";
  originalContractSumCents: number;
  /** Original contract sum plus change orders approved to date (for a job not yet billed). */
  contractSumToDateCents: number;
  /** Days the GC has to pay under the subcontract; null when not set. */
  payTermsDays?: number | null;
  /** What the days count from (default: the application date). */
  payTermsBasis?: PayTermsBasis;
  /** Pay-when-paid outer limit, days from the application date; null when none (or not pay-when-paid). */
  payTermsOuterDays?: number | null;
  apps: CashReportAppInput[];
  /** The job's change orders (only pending ones are reported). */
  changeOrders?: CashReportChangeOrderInput[];
  /**
   * California preliminary notice reminder (services/payapps/notices.ts): the § 8204(a) last day and
   * who has no notice recorded yet, in words ("owner", "direct contractor"). Absent when no
   * first-furnished date is entered or everyone it waits on has one.
   */
  caNotice?: { dueOn: string; missing: string[] } | null;
  /**
   * Florida Notice to Owner reminder (services/payapps/fl-notices.ts): the § 713.06(2)(a) 45-day
   * serve-by date and the § 713.18(2) 40-day mail-by date. Absent when no first-furnished date is
   * entered or a notice to the owner is recorded.
   */
  flNotice?: { serveBy: string; mailBy: string } | null;
  /**
   * The last day to record a lien on the job (src/shared/lien-deadline.ts), from its saved state and
   * dates or its billing. Absent when the job has no state set or PayApps does not carry the state.
   */
  lienDeadline?: LienDeadline | null;
  /**
   * Texas notices of claim (src/shared/tx-notices.ts): set when the job is tracked (residential or
   * not), with the notices recorded so far. Each unpaid month's § 53.056 notice is read from `apps`.
   */
  txNotice?: { residential: boolean; sends: TxSendFacts[] } | null;
  /** The GC's monthly billing cutoff, day of the month (src/shared/billing-cutoff.ts); null when not set. */
  billingDay?: number | null;
  /**
   * The job's close-out checklist read with its punch list and retainage (closeoutReadiness in
   * src/shared/closeout.ts). Absent when the Worker did not read it; used only on a job whose work
   * is complete with retainage held.
   */
  closeout?: CloseoutReadiness | null;
}

export interface OutstandingApp {
  payAppId: string;
  number: number;
  applicationDate: string;
  /** End of the period the application bills (YYYY-MM-DD). */
  periodTo: string;
  /** Still owed: expected less payments received. */
  amountCents: number;
  /** GC-certified amount, else line 8. */
  expectedCents: number;
  /** Payments received so far (a partial payment when above 0). */
  receivedCents: number;
  lastReceivedOn: string | null;
  status: "submitted" | "certified";
  ageDays: number;
  bucket: AgingBucket;
  /** Application date (or period end, by the job's basis) plus its pay terms; null without terms. */
  dueOn: string | null;
  /** Whole days since dueOn while still owed; 0 when not yet due or no terms. */
  daysPastDue: number;
  /** Pay-when-paid: the day the owner paid the GC, or null. */
  ownerPaidOn: string | null;
  /** Pay-when-paid and the owner's payment is not recorded yet, so there is no due date. */
  awaitingOwner: boolean;
  /** Pay-when-paid: the due date is the job's outer limit ("in any event within N days"), not the owner's payment. */
  dueByOuterLimit: boolean;
}

export interface CashReportProject {
  id: string;
  name: string;
  number: string | null;
  gcName: string;
  gcBillingName: string | null;
  gcBillingEmail: string | null;
  status: "active" | "closed";
  contractSumToDateCents: number;
  /** Line 4 of the latest submitted application: work completed and stored to date. */
  completedToDateCents: number;
  percentComplete: number; // 0..100, one decimal
  appliedCents: number;
  paidCents: number;
  outstandingCents: number;
  outstanding: OutstandingApp[];
  payTermsDays: number | null;
  payTermsBasis: PayTermsBasis;
  /** Pay-when-paid outer limit in days from the application date; null when none or not pay-when-paid. */
  payTermsOuterDays: number | null;
  /** Still owed after its due date (0 without pay terms). */
  pastDueCents: number;
  /** Still owed and due within 30 days of the report date (0 without pay terms). */
  dueNext30Cents: number;
  /** Pay-when-paid: still owed on applications whose owner payment is not recorded yet. */
  awaitingOwnerCents: number;
  retainageHeldCents: number;
  /** Days since the first application here that held retainage, while retainage is held. */
  retainageAgeDays: number | null;
  workComplete: boolean;
  /**
   * Work complete with retainage held: whether the close-out checklist is in (ready) and, if not,
   * what still stands between the job and the release, in words. Null on any other job, or when the
   * close-out checklist was not read.
   */
  closeout: CloseoutReadiness | null;
  /** Unconditional lien waivers owed on paid applications, oldest application first. */
  waiversToSend: WaiverToSend[];
  /**
   * Georgia waivers marked sent and not paid whose 90 days (O.C.G.A. § 44-14-366(g)(2)) end within
   * GA_REMIND_DAYS or ended in the last GA_REMIND_DAYS, and filed affidavits of nonpayment whose
   * copy to the owner is not recorded as sent (src/shared/ga-waiver-clock.ts, gaClockNeedsAction).
   */
  gaWaiverDeadlines: GaWaiverClock[];
  /** Change orders waiting for the GC's approval, oldest first. */
  pendingChanges: PendingChange[];
  /** Pending change orders that add money: work that cannot be billed until approved. */
  pendingChangeCents: number;
  /** Applications paid short whose balance was closed, by application number. */
  closedShort: ClosedShortApp[];
  backchargedCents: number;
  disputedCents: number;
  writtenOffCents: number;
  /** The job's lien deadline (src/shared/lien-deadline.ts), or null when not set or not carried. */
  lienDeadline: LienDeadline | null;
  /** Plain-language next steps, e.g. bill the retainage on a finished job. */
  actions: string[];
  lastApplication: { number: number; periodTo: string; status: PayAppStatus } | null;
}

export interface CashReport {
  asOf: string;
  projects: CashReportProject[];
  totals: {
    contractSumToDateCents: number;
    appliedCents: number;
    paidCents: number;
    outstandingCents: number;
    retainageHeldCents: number;
    /** Retainage held on jobs whose work is complete: money that should be billed now. */
    retainageOnCompleteJobsCents: number;
    /** Of that, retainage on jobs whose close-out checklist still has punch items or documents open. */
    retainageWaitingOnCloseoutCents: number;
    pastDueCents: number;
    dueNext30Cents: number;
    /** Owed on jobs with no pay terms set: left out of past due and the 30-day forecast. */
    noTermsOutstandingCents: number;
    /** Owed on pay-when-paid applications waiting on the owner's payment: also left out. */
    awaitingOwnerCents: number;
    /** Unconditional lien waivers owed on paid applications, across jobs. */
    waiversToSend: number;
    /** Pending change orders that add money, across jobs. */
    pendingChangeCents: number;
    /** Balances closed short, by reason, across jobs. */
    backchargedCents: number;
    disputedCents: number;
    writtenOffCents: number;
    /** Count of pending change orders (additions and deductions), across jobs. */
    pendingChangeOrders: number;
    /** Pending change orders older than PENDING_CHANGE_FOLLOW_UP_DAYS, across jobs. */
    pendingChangeOrdersOverdue: number;
    aging: Record<AgingBucket, number>;
  };
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (both YYYY-MM-DD, UTC), never negative. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  // Date.parse rolls 30 February over to 2 March: an impossible day counts as no days.
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  if (
    new Date(a).toISOString().slice(0, 10) !== from ||
    new Date(b).toISOString().slice(0, 10) !== to
  )
    return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/** `iso` (YYYY-MM-DD) plus `days` calendar days, UTC. */
export function addDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Pay terms typed by a person: blank is "not set" (null), "net 30" or "30" is 30. Undefined when it
 * is not a whole number of days from 0 to 365.
 */
export function parsePayTermsDays(text: string): number | null | undefined {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/^net\s*/, "")
    .replace(/\s*days?$/, "");
  if (t === "") return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  const n = Number(t);
  return n <= 365 ? n : undefined;
}

/**
 * A pay-when-paid outer limit typed by a person ("90", "90 days"): blank is none (null). Undefined
 * when it is not a whole number of days from 1 to 365.
 */
export function parseOuterLimitDays(text: string): number | null | undefined {
  const n = parsePayTermsDays(text);
  return n === 0 ? undefined : n;
}

/** The window the forecast looks ahead, in days. */
export const FORECAST_DAYS = 30;

/** Pay-when-paid: an application this many days old with no owner payment recorded gets a next step. */
export const OWNER_PAYMENT_FOLLOW_UP_DAYS = 30;

export function bucketFor(ageDays: number): AgingBucket {
  if (ageDays <= 30) return "0-30";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "90+";
}

const isSent = (s: PayAppStatus) => s !== "draft";
const positionOf = (a: CashReportAppInput) =>
  paymentPosition(
    a.status,
    expectedCents(a.certifiedAmountCents, a.summary.currentPaymentDueCents),
    a.payments ?? [],
    a.status === "paid" ? (a.shortClose?.cents ?? null) : null,
  );

/** A Texas job's unpaid months and who still needs a notice for each (empty when not tracked). */
export function txUnpaidMonthsOf(p: CashReportProjectInput): TxUnpaidMonth[] {
  if (!p.txNotice) return [];
  return txUnpaidMonths(
    p.apps.map((a) => ({
      number: a.number,
      sent: isSent(a.status),
      periodFrom: a.periodFrom ?? a.periodTo,
      periodTo: a.periodTo,
      remainingCents: positionOf(a).remainingCents,
    })),
    p.txNotice.sends,
    p.txNotice.residential,
  );
}

/** Pending change orders of a job, oldest first (by age, then number). */
export function pendingChanges(
  changeOrders: readonly CashReportChangeOrderInput[],
  asOf: string,
): PendingChange[] {
  return changeOrders
    .filter((co) => co.status === "pending")
    .map((co) => ({
      id: co.id,
      number: co.number,
      description: co.description,
      amountCents: co.amountCents,
      submittedOn: co.submittedOn,
      ageDays: daysBetween(co.submittedOn ?? co.createdOn, asOf),
      agedFrom: co.submittedOn ? ("sent" as const) : ("entered" as const),
      lastEmailedOn: co.lastEmailedOn ?? null,
      lastEmailedDays: co.lastEmailedOn ? daysBetween(co.lastEmailedOn, asOf) : null,
    }))
    .sort(
      (a, b) =>
        b.ageDays - a.ageDays || a.number.localeCompare(b.number, undefined, { numeric: true }),
    );
}

/** The follow-up for a job's pending change orders, or null when none is old enough. */
export function pendingChangeText(
  pending: readonly PendingChange[],
  gcName: string,
): string | null {
  const old = pending.filter((c) => c.amountCents > 0 && c.ageDays > PENDING_CHANGE_FOLLOW_UP_DAYS);
  const first = old[0];
  if (!first) return null;
  const since =
    first.agedFrom === "sent"
      ? `since it went to ${gcName} on ${first.submittedOn}`
      : "since it was entered here (no date sent recorded)";
  const others =
    old.length > 1
      ? ` ${old.length - 1} more pending over ${PENDING_CHANGE_FOLLOW_UP_DAYS} days on this job (${formatCents(old.slice(1).reduce((s, c) => s + c.amountCents, 0))}).`
      : "";
  const last = lastFollowUp(first);
  return `Change order ${first.number} (${first.description}, ${formatCents(first.amountCents)}) has waited ${first.ageDays} days for approval ${since}.${last ? ` ${last}` : ""} It cannot be billed until it is approved: ask ${gcName} for the signed change order, then mark it approved or rejected here.${others}`;
}

/** "5 days ago", "yesterday" or "today". */
function agoText(days: number): string {
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The sentence about the last email drafted for a pending change order, or null when there is
 * nothing worth saying: never emailed, or emailed on or before the date sent (that was the request
 * itself, already named by "since it went to"). With no date sent recorded, a drafted request means
 * it probably went out without the date being recorded, so it asks for the date.
 */
export function lastFollowUp(
  c: Pick<PendingChange, "submittedOn" | "lastEmailedOn" | "lastEmailedDays">,
): string | null {
  if (!c.lastEmailedOn || c.lastEmailedDays === null) return null;
  const when = `${c.lastEmailedOn} (${agoText(c.lastEmailedDays)})`;
  if (!c.submittedOn) {
    return `Its request email was drafted here on ${when}, but no date sent is recorded: if it went out, record the date sent so it is aged from that day.`;
  }
  if (c.lastEmailedOn <= c.submittedOn) return null;
  return `Last follow-up emailed from here on ${when}.`;
}

/**
 * When an application is due under the job's pay terms: its application date, the end of the period
 * it bills, or the day the owner paid the GC for it (pay-when-paid), plus the days. Null when the
 * job has no pay terms, or on a pay-when-paid job until the owner's payment is recorded. A
 * pay-when-paid job's outer limit (days from the application date, "and in any event within 90 days")
 * caps it: the earlier of the two dates, and the outer date alone while the owner's payment is not
 * recorded. The outer limit is ignored under any other basis. Also used
 * for the due date of the QuickBooks invoice (services/quickbooks.ts), so both say the same date.
 */
export function payDueOn(
  terms: number | null,
  basis: PayTermsBasis,
  app: { applicationDate: string; periodTo: string; ownerPaidOn?: string | null },
  outerDays: number | null = null,
): string | null {
  if (terms === null) return null;
  if (basis === "owner_paid") {
    const fromOwner = app.ownerPaidOn ? addDays(app.ownerPaidOn, terms) : null;
    const outer = outerLimitOn(app.applicationDate, outerDays);
    // biome-ignore lint/complexity/useMathMinMax: ISO date strings compared as text, not numbers.
    if (fromOwner && outer) return fromOwner < outer ? fromOwner : outer;
    return fromOwner ?? outer;
  }
  return addDays(basis === "period_end" ? app.periodTo : app.applicationDate, terms);
}

/** The application date plus a pay-when-paid outer limit, or null without one. */
export function outerLimitOn(applicationDate: string, outerDays: number | null | undefined) {
  return outerDays ? addDays(applicationDate, outerDays) : null;
}

/**
 * "30 days" (from the application date, as before), "30 days after the period end", "7 days after
 * the owner pays the GC" or, with an outer limit, "7 days after the owner pays the GC, and in any
 * event within 90 days of the application date".
 */
export function termsPhrase(
  terms: number,
  basis: PayTermsBasis,
  outerDays: number | null = null,
): string {
  const days = `${terms} day${terms === 1 ? "" : "s"}`;
  if (basis === "period_end") return `${days} after the period end`;
  if (basis === "owner_paid") {
    return outerDays
      ? `${days} after the owner pays the GC, and in any event within ${outerDays} day${outerDays === 1 ? "" : "s"} of the application date`
      : `${days} after the owner pays the GC`;
  }
  return days;
}

/**
 * Pay-when-paid, the owner's payment to the GC is not recorded and the application is not past due:
 * worth asking the GC whether the owner has paid (with an outer limit, an earlier owner payment
 * makes it due sooner than the outer date).
 */
export function ownerPaymentUnknown(
  basis: PayTermsBasis,
  o: Pick<OutstandingApp, "ownerPaidOn" | "daysPastDue">,
): boolean {
  return basis === "owner_paid" && o.ownerPaidOn === null && o.daysPastDue === 0;
}

/**
 * The cash page's (and the weekly email's) reminder to give California's preliminary notice: due 20
 * calendar days after first furnishing work, and still worth giving late, since it then covers work
 * from 20 days before it is given (Cal. Civ. Code § 8204(a)). Null when nothing is owed.
 */
export function caNoticeText(
  n: { dueOn: string; missing: string[] } | null | undefined,
  asOf: string,
): string | null {
  if (!n || n.missing.length === 0) return null;
  const who = n.missing.map((m) => `the ${m}`).join(" or ");
  if (asOf <= n.dueOn) {
    const days = daysBetween(asOf, n.dueOn);
    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    return `California preliminary notice due ${when}, by ${n.dueOn} (20 days after you first furnished work, Civ. Code § 8204(a)): none recorded yet for ${who}.`;
  }
  return `California preliminary notice was due ${n.dueOn} and none is recorded for ${who}. A notice given now still covers work from 20 days before it is given (Civ. Code § 8204(a)); if you do not owe one, clear the first-furnished date on the job.`;
}

/**
 * The cash page's (and the weekly email's) reminder to serve Florida's Notice to Owner: 45 calendar
 * days after first furnishing (Fla. Stat. § 713.06(2)(a)), or mailed by registered, Global Express
 * Guaranteed or certified mail within 40 days to count as served that day (§ 713.18(2)). Once the 45
 * days pass, "the failure to serve the notice, or to timely serve it, is a complete defense to
 * enforcement of a lien", so the late wording says what is lost instead of urging a notice.
 */
export function flNoticeText(
  n: { serveBy: string; mailBy: string } | null | undefined,
  asOf: string,
): string | null {
  if (!n) return null;
  const inDays = (to: string) => {
    const days = daysBetween(asOf, to);
    return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  };
  const copy =
    " (with a copy to the contractor if you are a sub-subcontractor or a supplier to a subcontractor)";
  if (asOf <= n.mailBy) {
    return `Florida Notice to Owner: none recorded yet for the owner${copy}. Mail it by certified or registered mail ${inDays(n.mailBy)}, by ${n.mailBy}, and it counts as served that day (Fla. Stat. § 713.18(2)); it must be served by ${n.serveBy} (45 days, § 713.06(2)(a)).`;
  }
  if (asOf <= n.serveBy) {
    return `Florida Notice to Owner must be served ${inDays(n.serveBy)}, by ${n.serveBy} (45 days after you first furnished work, Fla. Stat. § 713.06(2)(a)), and none is recorded for the owner${copy}. Past the 40 days, mail counts only when delivered, so hand delivery or a carrier with proof of delivery is safer now.`;
  }
  return `Florida Notice to Owner was due ${n.serveBy} and none is recorded for the owner. A late notice is "a complete defense to enforcement of a lien" (Fla. Stat. § 713.06(2)(a)): if you served one, record it on the job; if you do not owe one (you hired on with the owner directly), clear the first-furnished date.`;
}

/**
 * The next step on a finished job with retainage held. Without the close-out checklist it is the
 * generic one; with it, it names what still stands between the job and the release, or, once
 * nothing does, points to the release request the checklist drafts. It never says the
 * subcontract's conditions are met: only what the lists show.
 */
export function retainageActionText(heldCents: number, closeout: CloseoutReadiness | null): string {
  const held = formatCents(heldCents);
  if (!closeout) {
    return "Work is complete and retainage is still held: bill the retainage (a final application releasing it) and send the final waivers your GC asks for.";
  }
  if (closeout.ready) {
    return `Work is complete and the close-out checklist is in: ask for the ${held} retainage (the release request is drafted on the job's close-out checklist), bill it on a final application and send the final waivers your GC asks for.`;
  }
  return `Work is complete and ${held} retainage is still held, waiting on close-out: ${closeout.blockers.join(" ")} Clear these on the job's close-out checklist, then ask for the release.`;
}

export function projectCash(p: CashReportProjectInput, asOf: string): CashReportProject {
  const sent = p.apps.filter((a) => isSent(a.status)).sort((x, y) => x.number - y.number);
  const latest = sent.at(-1) ?? null;
  const terms = p.payTermsDays ?? null;
  const basis = p.payTermsBasis ?? "application_date";
  const outerDays = basis === "owner_paid" ? (p.payTermsOuterDays ?? null) : null;
  const horizon = addDays(asOf, FORECAST_DAYS);
  let appliedCents = 0;
  let paidCents = 0;
  const outstanding: OutstandingApp[] = [];
  for (const a of sent) {
    appliedCents += a.summary.currentPaymentDueCents;
    const pos = positionOf(a);
    paidCents += pos.paidCents;
    if ((a.status === "submitted" || a.status === "certified") && pos.remainingCents > 0) {
      const ageDays = daysBetween(a.applicationDate, asOf);
      const dueOn = payDueOn(terms, basis, a, outerDays);
      const ownerPaidOn = a.ownerPaidOn ?? null;
      const outerOn = outerLimitOn(a.applicationDate, outerDays);
      outstanding.push({
        payAppId: a.id,
        number: a.number,
        applicationDate: a.applicationDate,
        periodTo: a.periodTo,
        amountCents: pos.remainingCents,
        expectedCents: pos.expectedCents,
        receivedCents: pos.paidCents,
        lastReceivedOn: pos.lastReceivedOn,
        status: a.status,
        ageDays,
        bucket: bucketFor(ageDays),
        dueOn,
        daysPastDue: dueOn !== null && dueOn < asOf ? daysBetween(dueOn, asOf) : 0,
        ownerPaidOn,
        awaitingOwner: terms !== null && basis === "owner_paid" && dueOn === null,
        dueByOuterLimit:
          terms !== null &&
          outerOn !== null &&
          dueOn === outerOn &&
          (ownerPaidOn === null || addDays(ownerPaidOn, terms) > outerOn),
      });
    }
  }
  const outstandingCents = outstanding.reduce((s, o) => s + o.amountCents, 0);
  const pastDueCents = outstanding
    .filter((o) => o.daysPastDue > 0)
    .reduce((s, o) => s + o.amountCents, 0);
  const dueNext30Cents = outstanding
    .filter((o) => o.dueOn !== null && o.dueOn >= asOf && o.dueOn <= horizon)
    .reduce((s, o) => s + o.amountCents, 0);
  const awaitingOwnerCents = outstanding
    .filter((o) => o.awaitingOwner)
    .reduce((s, o) => s + o.amountCents, 0);
  const contractSumToDateCents = latest
    ? latest.summary.contractSumToDateCents
    : p.contractSumToDateCents;
  const completedToDateCents = latest?.summary.totalCompletedAndStoredCents ?? 0;
  const retainageHeldCents = latest?.summary.totalRetainageCents ?? 0;
  const firstHeld = sent.find((a) => a.summary.totalRetainageCents > 0);
  const retainageAgeDays =
    retainageHeldCents > 0 && firstHeld ? daysBetween(firstHeld.periodTo, asOf) : null;
  const workComplete =
    latest !== null && contractSumToDateCents > 0 && latest.totals.balanceToFinishCents <= 0;

  const actions: string[] = [];
  const closeout = workComplete && retainageHeldCents > 0 ? (p.closeout ?? null) : null;
  if (workComplete && retainageHeldCents > 0) {
    actions.push(retainageActionText(retainageHeldCents, closeout));
  }
  if (terms === null) {
    const oldest = outstanding.reduce<OutstandingApp | null>(
      (o, x) => (o === null || x.ageDays > o.ageDays ? x : o),
      null,
    );
    if (oldest && oldest.ageDays > 30) {
      actions.push(
        oldest.receivedCents > 0
          ? `Application #${oldest.number} was paid short ${oldest.ageDays} days after it went out: ${formatCents(oldest.amountCents)} of ${formatCents(oldest.expectedCents)} is still owed. Ask ${p.gcName} what the balance is held for (a backcharge, a missing waiver, or a mistake); if it will not be paid, close the balance on the application.`
          : `Application #${oldest.number} has been unpaid for ${oldest.ageDays} days: follow up with ${p.gcName}, or record the payment if the check came in.`,
      );
    }
  } else {
    const late = outstanding.reduce<OutstandingApp | null>(
      (o, x) => (x.daysPastDue > 0 && (o === null || x.daysPastDue > o.daysPastDue) ? x : o),
      null,
    );
    if (late) {
      const count = outstanding.filter((o) => o.daysPastDue > 0).length;
      const others = count > 1 ? ` ${count - 1} more past due on this job.` : "";
      actions.push(
        late.receivedCents > 0
          ? `Application #${late.number} was due on ${late.dueOn} (${termsPhrase(terms, basis, outerDays)}) and is ${late.daysPastDue} days late, paid short: ${formatCents(late.amountCents)} of ${formatCents(late.expectedCents)} is still owed. Ask ${p.gcName} what the balance is held for (a backcharge, a missing waiver, or a mistake); if it will not be paid, close the balance on the application.${others}`
          : `Application #${late.number} was due on ${late.dueOn} (${termsPhrase(terms, basis, outerDays)}) and is ${late.daysPastDue} days late: follow up with ${p.gcName}, or record the payment if the check came in.${others}`,
      );
    }
    const waiting = outstanding
      .filter((o) => ownerPaymentUnknown(basis, o) && o.ageDays > OWNER_PAYMENT_FOLLOW_UP_DAYS)
      .sort((x, y) => y.ageDays - x.ageDays || x.number - y.number);
    const first = waiting[0];
    if (first) {
      const others =
        waiting.length > 1
          ? ` ${waiting.length - 1} more on this job with no owner payment recorded after ${OWNER_PAYMENT_FOLLOW_UP_DAYS} days.`
          : "";
      actions.push(
        `Application #${first.number} went out ${first.ageDays} days ago and no payment from the owner to ${p.gcName} is recorded for it (pay terms: ${termsPhrase(terms, basis, outerDays)}). Ask ${p.gcName} whether the owner has paid for that period and on what date, then record the date on the application so its due date can be counted.${first.dueOn ? ` Whatever the owner does, it is due by ${first.dueOn} under the outer limit.` : ""}${others}`,
      );
    }
  }
  // The unconditional waiver covers the money received: a balance closed short was never paid, and
  // on an application paid in part, only the checks recorded so far.
  const toSend = sent.flatMap((a) => {
    const pos = positionOf(a);
    return waiversToSend(
      {
        ...a,
        paidCents: pos.paidCents,
        receivedCents: a.status === "paid" ? undefined : pos.paidCents,
      },
      a.waivers ?? [],
    );
  });
  for (const w of toSend) actions.push(waiverToSendText(w, p.gcName));
  // Georgia's 90 days (and a filed affidavit's copy to the owner): money recorded on the application against each sent Georgia waiver.
  const gaDeadlines = sent
    .flatMap((a) => gaWaiverClocks(a, positionOf(a).paidCents, a.waivers ?? [], asOf))
    .filter(gaClockNeedsAction)
    .sort(
      (x, y) =>
        (x.filing?.copyDaysLeft ?? x.daysLeft) - (y.filing?.copyDaysLeft ?? y.daysLeft) ||
        x.number - y.number,
    );
  for (const c of gaDeadlines) actions.push(gaClockText(c));
  const pending = pendingChanges(p.changeOrders ?? [], asOf);
  const pendingText = pendingChangeText(pending, p.gcName);
  if (pendingText) actions.push(pendingText);
  const closedShort: ClosedShortApp[] = sent.flatMap((a) => {
    const cents = positionOf(a).closedShortCents;
    if (a.status !== "paid" || !a.shortClose || cents <= 0) return [];
    const { reason, note, closedOn } = a.shortClose;
    return [{ payAppId: a.id, number: a.number, cents, reason, note, closedOn }];
  });
  for (const c of closedShort) {
    if (c.reason !== "disputed") continue;
    actions.push(
      `Application #${c.number}: ${formatCents(c.cents)} was closed as disputed on ${c.closedOn}${c.note ? ` (${c.note})` : ""} and is no longer counted as owed. If you still mean to collect it, keep the backup together and check the subcontract's dispute terms and your lien or payment bond deadlines for this job; reopen the balance here if ${p.gcName} agrees to pay it.`,
    );
  }
  const byReason = (r: ShortCloseReason) =>
    closedShort.filter((c) => c.reason === r).reduce((s, c) => s + c.cents, 0);
  const caText = caNoticeText(p.status === "active" ? p.caNotice : null, asOf);
  if (caText) actions.push(caText);
  const flText = flNoticeText(p.status === "active" ? p.flNotice : null, asOf);
  if (flText) actions.push(flText);
  const lien = p.lienDeadline ?? null;
  const lienText = lienDeadlineText(
    lien,
    { outstandingCents, retainageHeldCents, workComplete },
    asOf,
  );
  if (lienText) actions.push(lienText);
  if (p.status === "active") actions.push(...txNoticeTexts(txUnpaidMonthsOf(p), asOf));
  // The GC's billing cutoff: drafts count too (a draft dated before a passed cutoff is a missed one).
  if (p.billingDay && p.status === "active" && !workComplete) {
    const cutoff = billingCutoff(
      p.billingDay,
      p.apps.map((a) => ({
        number: a.number,
        status: a.status,
        applicationDate: a.applicationDate,
        submittedOn: a.submittedOn ?? null,
      })),
      asOf,
    );
    const cutoffText = billingCutoffText(cutoff, p.gcName);
    if (cutoffText) actions.push(cutoffText);
  }
  if (p.status === "closed" && (retainageHeldCents > 0 || outstandingCents > 0)) {
    actions.push("This job is closed but money is still owed on it.");
  }

  return {
    id: p.id,
    name: p.name,
    number: p.number,
    gcName: p.gcName,
    gcBillingName: p.gcBillingName?.trim() || null,
    gcBillingEmail: p.gcBillingEmail?.trim() || null,
    status: p.status,
    contractSumToDateCents,
    completedToDateCents,
    percentComplete:
      contractSumToDateCents > 0
        ? Math.round((completedToDateCents / contractSumToDateCents) * 1000) / 10
        : 0,
    appliedCents,
    paidCents,
    outstandingCents,
    outstanding,
    payTermsDays: terms,
    payTermsBasis: basis,
    payTermsOuterDays: outerDays,
    pastDueCents,
    dueNext30Cents,
    awaitingOwnerCents,
    retainageHeldCents,
    retainageAgeDays,
    workComplete,
    closeout,
    lienDeadline: lien,
    waiversToSend: toSend,
    gaWaiverDeadlines: gaDeadlines,
    pendingChanges: pending,
    pendingChangeCents: pending.reduce((s, c) => s + Math.max(0, c.amountCents), 0),
    closedShort,
    backchargedCents: byReason("backcharge"),
    disputedCents: byReason("disputed"),
    writtenOffCents: byReason("written-off"),
    actions,
    lastApplication: latest
      ? { number: latest.number, periodTo: latest.periodTo, status: latest.status }
      : null,
  };
}

export function cashReport(projects: CashReportProjectInput[], asOf: string): CashReport {
  const rows = projects.map((p) => projectCash(p, asOf));
  // Most money owed first, so the jobs worth a phone call lead.
  rows.sort(
    (a, b) =>
      b.outstandingCents + b.retainageHeldCents - (a.outstandingCents + a.retainageHeldCents) ||
      a.name.localeCompare(b.name),
  );
  const aging = Object.fromEntries(AGING_BUCKETS.map((k) => [k, 0])) as Record<AgingBucket, number>;
  for (const r of rows) for (const o of r.outstanding) aging[o.bucket] += o.amountCents;
  const sum = (f: (r: CashReportProject) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    asOf,
    projects: rows,
    totals: {
      contractSumToDateCents: sum((r) => r.contractSumToDateCents),
      appliedCents: sum((r) => r.appliedCents),
      paidCents: sum((r) => r.paidCents),
      outstandingCents: sum((r) => r.outstandingCents),
      retainageHeldCents: sum((r) => r.retainageHeldCents),
      retainageOnCompleteJobsCents: sum((r) => (r.workComplete ? r.retainageHeldCents : 0)),
      retainageWaitingOnCloseoutCents: sum((r) =>
        r.closeout && !r.closeout.ready ? r.retainageHeldCents : 0,
      ),
      pastDueCents: sum((r) => r.pastDueCents),
      dueNext30Cents: sum((r) => r.dueNext30Cents),
      noTermsOutstandingCents: sum((r) => (r.payTermsDays === null ? r.outstandingCents : 0)),
      awaitingOwnerCents: sum((r) => r.awaitingOwnerCents),
      waiversToSend: sum((r) => r.waiversToSend.length),
      pendingChangeCents: sum((r) => r.pendingChangeCents),
      backchargedCents: sum((r) => r.backchargedCents),
      disputedCents: sum((r) => r.disputedCents),
      writtenOffCents: sum((r) => r.writtenOffCents),
      pendingChangeOrders: sum((r) => r.pendingChanges.length),
      pendingChangeOrdersOverdue: sum(
        (r) =>
          r.pendingChanges.filter(
            (c) => c.amountCents > 0 && c.ageDays > PENDING_CHANGE_FOLLOW_UP_DAYS,
          ).length,
      ),
      aging,
    },
  };
}
