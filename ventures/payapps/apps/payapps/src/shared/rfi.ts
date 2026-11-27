// RFIs (requests for information): the questions a subcontractor sends the GC when the drawings,
// specs or field conditions leave the work unclear, and the answers that come back. Pure: status,
// days outstanding, the log's summary, the next number and the email draft, shared by the Worker
// (services/payapps/rfis.ts, the PDF and CSV) and the SPA (components/rfis.tsx). Nothing is
// estimated: every date is one the contractor entered, and "overdue" only means the response date
// they entered has passed.

import { addDays, daysBetween } from "./cash-report";
import { pmGreeting } from "./change-order-email";

/** Whether an RFI changes the price or the contract time: none, maybe (not yet known), or yes. */
export const RFI_IMPACTS = ["none", "possible", "yes"] as const;
export type RfiImpact = (typeof RFI_IMPACTS)[number];

export const RFI_IMPACT_LABELS: Record<RfiImpact, string> = {
  none: "None",
  possible: "Possible",
  yes: "Yes",
};

/** draft: not sent; open: sent, no answer, not past due; overdue: past its response date; answered. */
export type RfiStatus = "draft" | "open" | "overdue" | "answered";

export const RFI_STATUS_LABELS: Record<RfiStatus, string> = {
  draft: "Not sent",
  open: "Open",
  overdue: "Overdue",
  answered: "Answered",
};

/** Response window offered on the form when the subcontract does not set one (editable). */
export const DEFAULT_RESPONSE_DAYS = 7;

export interface RfiFacts {
  number: number;
  subject: string;
  question: string;
  suggestion: string | null;
  reference: string | null;
  sentOn: string | null;
  responseDueOn: string | null;
  answeredOn: string | null;
  answer: string | null;
  answeredBy: string | null;
  costImpact: RfiImpact | null;
  timeImpact: RfiImpact | null;
  changeOrderId: string | null;
}

export function rfiStatus(
  rfi: Pick<RfiFacts, "sentOn" | "responseDueOn" | "answeredOn">,
  today: string,
): RfiStatus {
  if (rfi.answeredOn) return "answered";
  if (!rfi.sentOn) return "draft";
  if (rfi.responseDueOn && rfi.responseDueOn < today) return "overdue";
  return "open";
}

/** Calendar days from sent to answered (or to today while open); null when not sent. */
export function daysOutstanding(
  rfi: Pick<RfiFacts, "sentOn" | "answeredOn">,
  today: string,
): number | null {
  if (!rfi.sentOn) return null;
  return daysBetween(rfi.sentOn, rfi.answeredOn ?? today);
}

/** Calendar days past the response date, for an unanswered RFI; 0 when not overdue. */
export function daysOverdue(
  rfi: Pick<RfiFacts, "sentOn" | "responseDueOn" | "answeredOn">,
  today: string,
): number {
  if (rfiStatus(rfi, today) !== "overdue" || !rfi.responseDueOn) return 0;
  return daysBetween(rfi.responseDueOn, today);
}

/**
 * An answered RFI that says (or may say) the price changes, with no change order recorded against
 * it: the money a sub most often loses on RFIs is the extra work an answer asked for and nobody
 * priced. Possible counts too, since "possible" after the answer means nobody has decided.
 */
export function needsChangeOrder(
  rfi: Pick<RfiFacts, "answeredOn" | "costImpact" | "timeImpact" | "changeOrderId">,
): boolean {
  if (!rfi.answeredOn || rfi.changeOrderId) return false;
  const priced = (i: RfiImpact | null) => i === "yes" || i === "possible";
  return priced(rfi.costImpact) || priced(rfi.timeImpact);
}

export interface RfiLogSummary {
  total: number;
  draft: number;
  open: number;
  overdue: number;
  answered: number;
  /** Answered, with a cost or time impact and no change order recorded. */
  needChangeOrder: number;
  /** Mean calendar days from sent to answered over answered RFIs; null when none is answered. */
  averageDaysToAnswer: number | null;
  /** The unanswered RFI sent longest ago, if any is open or overdue. */
  oldestOpen: { number: number; days: number } | null;
}

export function summarizeRfis(rfis: RfiFacts[], today: string): RfiLogSummary {
  const s: RfiLogSummary = {
    total: rfis.length,
    draft: 0,
    open: 0,
    overdue: 0,
    answered: 0,
    needChangeOrder: 0,
    averageDaysToAnswer: null,
    oldestOpen: null,
  };
  let answeredDays = 0;
  let answeredSent = 0;
  for (const r of rfis) {
    const status = rfiStatus(r, today);
    s[status]++;
    if (needsChangeOrder(r)) s.needChangeOrder++;
    if (status === "answered" && r.sentOn && r.answeredOn) {
      answeredDays += daysBetween(r.sentOn, r.answeredOn);
      answeredSent++;
    }
    if ((status === "open" || status === "overdue") && r.sentOn) {
      const days = daysBetween(r.sentOn, today);
      if (!s.oldestOpen || days > s.oldestOpen.days) s.oldestOpen = { number: r.number, days };
    }
  }
  if (answeredSent > 0) s.averageDaysToAnswer = Math.round((answeredDays / answeredSent) * 10) / 10;
  return s;
}

/** The next RFI number on a job: one past the highest used (deleted numbers are not reused). */
export function nextRfiNumber(numbers: number[]): number {
  return numbers.reduce((m, n) => Math.max(m, n), 0) + 1;
}

/** The response date offered for an RFI sent on `sentOn`, `days` calendar days later. */
export function suggestedDueDate(sentOn: string, days = DEFAULT_RESPONSE_DAYS): string {
  return addDays(sentOn, days);
}

/** Checks the dates of an RFI as a whole; returns the first problem in words, or null. */
export function rfiDateProblem(
  rfi: Pick<RfiFacts, "sentOn" | "responseDueOn" | "answeredOn">,
  today: string,
): string | null {
  if (rfi.sentOn && rfi.sentOn > today) return "The date sent cannot be in the future";
  if (rfi.answeredOn && rfi.answeredOn > today) return "The date answered cannot be in the future";
  if (rfi.answeredOn && !rfi.sentOn) return "Enter the date the RFI was sent before its answer";
  if (rfi.responseDueOn && !rfi.sentOn) return "Enter the date sent before a response date";
  if (rfi.sentOn && rfi.responseDueOn && rfi.responseDueOn < rfi.sentOn) {
    return "The response date cannot be before the date sent";
  }
  if (rfi.sentOn && rfi.answeredOn && rfi.answeredOn < rfi.sentOn) {
    return "The date answered cannot be before the date sent";
  }
  return null;
}

/** "RFI 003": numbers print padded to three digits, the way most logs show them. */
export function rfiLabel(n: number): string {
  return `RFI ${String(n).padStart(3, "0")}`;
}

/**
 * The longest description the draft fills in: a change order takes 500 characters, but one that
 * adds a new schedule-of-values line gives the line its description, and a line takes 300.
 */
export const CHANGE_ORDER_DESCRIPTION_MAX = 300;

/**
 * Whether the RFI log offers "Start a change order": the RFI is answered and nothing prices it yet.
 * Offered whatever the impact fields say, since a sub may price an answer marked "none".
 */
export function canStartChangeOrder(rfi: Pick<RfiFacts, "answeredOn" | "changeOrderId">): boolean {
  return Boolean(rfi.answeredOn) && !rfi.changeOrderId;
}

/**
 * What the change order form is filled in with when a change order is started from an answered
 * RFI: the description names the RFI and carries its subject, cut to the change order's limit.
 * Nothing is priced here: the line, the amount and the days stay the contractor's to enter.
 */
export function changeOrderDraftFromRfi(rfi: Pick<RfiFacts, "number" | "subject">): {
  description: string;
} {
  const full = `${rfiLabel(rfi.number)}: ${rfi.subject.trim()}`;
  const description =
    full.length <= CHANGE_ORDER_DESCRIPTION_MAX
      ? full
      : `${full.slice(0, CHANGE_ORDER_DESCRIPTION_MAX - 1).trimEnd()}…`;
  return { description };
}

export function impactText(kind: "Cost" | "Time", impact: RfiImpact | null): string {
  if (impact === null) return `${kind} impact: not stated`;
  if (impact === "none") return `${kind} impact: none expected`;
  if (impact === "possible") return `${kind} impact: possible, to be confirmed`;
  return `${kind} impact: yes, a change order will follow`;
}

export interface RfiEmailJob {
  name: string;
  number: string | null;
  gcName: string;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}

export interface RfiEmail {
  kind: "send" | "follow-up";
  to: string | null;
  subject: string;
  body: string;
}

/**
 * The email that sends an RFI to the GC's project manager, or chases one that is past due. Null
 * once it is answered. The text says only what was entered; the RFI PDF goes with it as the record.
 */
export function rfiEmail(
  job: RfiEmailJob,
  rfi: RfiFacts,
  from: { name: string; company: string },
  today: string,
): RfiEmail | null {
  const status = rfiStatus(rfi, today);
  if (status === "answered") return null;
  const label = job.number ? `${job.name} (job ${job.number})` : job.name;
  const id = rfiLabel(rfi.number);
  const sign = [from.name.trim() || "[your name]", from.company.trim()].filter(Boolean).join("\n");
  const lines: string[] = [pmGreeting(job)];
  let subject: string;
  let kind: RfiEmail["kind"];
  if (status === "draft" || status === "open") {
    kind = "send";
    subject = `${id}: ${rfi.subject.trim()} (${label})`;
    lines.push(
      `We need direction on the following before we can proceed with this part of the work on ${label}.`,
      `${id}: ${rfi.subject.trim()}`,
      rfi.question.trim(),
    );
    if (rfi.reference?.trim()) lines.push(`Reference: ${rfi.reference.trim()}`);
    if (rfi.suggestion?.trim()) lines.push(`Our proposed solution: ${rfi.suggestion.trim()}`);
    lines.push([impactText("Cost", rfi.costImpact), impactText("Time", rfi.timeImpact)].join("\n"));
    const due = rfi.responseDueOn ?? suggestedDueDate(rfi.sentOn ?? today);
    lines.push(`Please respond by ${due}. The RFI form is attached.`);
  } else {
    kind = "follow-up";
    subject = `Following up: ${id}, ${rfi.subject.trim()} (${label})`;
    const sent = rfi.sentOn ?? today;
    lines.push(
      `Following up on ${id} (${rfi.subject.trim()}), sent ${sent}. We asked for a response by ${rfi.responseDueOn}, ${daysOverdue(rfi, today)} day${daysOverdue(rfi, today) === 1 ? "" : "s"} ago, and have not had one.`,
      "The work it covers is waiting on the answer. Could you let us know when we can expect it?",
    );
  }
  lines.push(`Thank you,\n${sign}`);
  return { kind, to: job.gcPmEmail?.trim() || null, subject, body: lines.join("\n\n") };
}

/** One RFI with its job, as the company-wide overdue list (weekly email, projects page) reads it. */
export interface CompanyRfiInput
  extends Pick<RfiFacts, "number" | "subject" | "sentOn" | "responseDueOn" | "answeredOn"> {
  id: string;
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
}

/** An RFI past the response date entered for it, with no answer recorded. */
export interface OverdueRfi {
  id: string;
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  number: number;
  subject: string;
  /** YYYY-MM-DD, as entered. */
  sentOn: string;
  responseDueOn: string;
  /** Calendar days past the response date, 1 or more. */
  daysOverdue: number;
}

/**
 * Every overdue RFI across the company's jobs, most days overdue first (then job name, then number).
 * Only the dates entered decide it (rfiStatus): an RFI with no response date is never overdue, so
 * nothing here is an estimate of when the GC should have answered.
 */
export function overdueRfis(list: CompanyRfiInput[], today: string): OverdueRfi[] {
  const out: OverdueRfi[] = [];
  for (const r of list) {
    if (rfiStatus(r, today) !== "overdue" || !r.sentOn || !r.responseDueOn) continue;
    out.push({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName,
      projectNumber: r.projectNumber,
      gcName: r.gcName,
      number: r.number,
      subject: r.subject.trim(),
      sentOn: r.sentOn,
      responseDueOn: r.responseDueOn,
      daysOverdue: daysOverdue(r, today),
    });
  }
  return out.sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue ||
      a.projectName.localeCompare(b.projectName) ||
      a.number - b.number,
  );
}

/** "Clinic TI (#2207), RFI 004: Ceiling height at grid C: answer due 2026-11-16, 7 days overdue (Harbor Builders)." */
export function overdueRfiText(r: OverdueRfi): string {
  const job = `${r.projectName}${r.projectNumber ? ` (#${r.projectNumber})` : ""}`;
  const days = `${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} overdue`;
  return `${job}, ${rfiLabel(r.number)}: ${r.subject}: answer due ${r.responseDueOn}, ${days} (${r.gcName}).`;
}

/** The job page's anchor for its RFI log (components/rfis.tsx scrolls to it). */
export const RFI_LOG_ANCHOR = "rfis";
