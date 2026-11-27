// A follow-up email to the GC about one unpaid pay application, drafted from the cash report's own
// figures (src/shared/cash-report.ts). Pure and offline: no LLM, nothing sent. The contractor reads
// it, edits it and sends it from their own mail program, so every fact in it is one PayApps already
// shows on the cash report and nothing is invented (no attachment that may not be there, no legal
// threat or claim about lien rights). The greeting and recipient come only from the GC billing
// contact the contractor entered on the job; without one it greets the GC's accounts payable and
// leaves the recipient blank.
//
// Which draft:
// - "balance": paid short (some money received, a balance still owed): asks what the rest is held for.
// - "second": more than SECOND_NOTICE_DAYS days past due (or, with no pay terms, more than
//   30 + SECOND_NOTICE_DAYS days old): a firmer second request asking for a payment date.
// - "reminder": past due (or, with no pay terms, more than 30 days old).
// - "owner": pay-when-paid, more than OWNER_PAYMENT_FOLLOW_UP_DAYS days old and no owner payment
//   recorded, so there is no due date yet: asks whether the owner has paid the GC for the period
//   and when this application will be paid. It states no view on the clause itself. With an outer limit
//   ("and in any event within 90 days") the draft also names the date that limit falls on, and once
//   that date passes the application is past due like any other ("reminder", "second").
// - "status": not yet due: asks that it is in for processing and nothing is missing.

import type { OutstandingApp } from "./cash-report";
import { OWNER_PAYMENT_FOLLOW_UP_DAYS, ownerPaymentUnknown, termsPhrase } from "./cash-report";
import type { PayTermsBasis } from "./enums";
import { formatCents } from "./money";

/** Past due by more than this many days, the draft becomes a second request. */
export const SECOND_NOTICE_DAYS = 30;
/** With no pay terms, an application older than this is treated as late (the report's own rule). */
export const NO_TERMS_FOLLOW_UP_DAYS = 30;

export type FollowUpKind = "status" | "reminder" | "second" | "balance" | "owner";

export interface FollowUpJob {
  name: string;
  number: string | null;
  gcName: string;
  /** The GC's billing contact entered on the job (accounts payable), if any. */
  gcBillingName?: string | null;
  gcBillingEmail?: string | null;
  payTermsDays: number | null;
  payTermsBasis: PayTermsBasis;
  /** Pay-when-paid outer limit in days from the application date, if any. */
  payTermsOuterDays?: number | null;
}

export interface FollowUpEmail {
  kind: FollowUpKind;
  /** The GC billing contact's address from the job, or null (the contractor adds it). */
  to: string | null;
  subject: string;
  body: string;
}

/** "Hello Pat Lee," with a contact name on the job, else "Hello Harbor Builders accounts payable,". */
export function greeting(job: Pick<FollowUpJob, "gcName" | "gcBillingName">): string {
  const name = job.gcBillingName?.trim();
  return name ? `Hello ${name},` : `Hello ${job.gcName} accounts payable,`;
}

/** How late an application is for the follow-up: days past due, else days past the 30-day rule. */
function lateness(job: FollowUpJob, app: OutstandingApp): number {
  if (job.payTermsDays === null) return Math.max(0, app.ageDays - NO_TERMS_FOLLOW_UP_DAYS);
  return app.daysPastDue;
}

export function followUpKind(job: FollowUpJob, app: OutstandingApp): FollowUpKind {
  if (app.receivedCents > 0) return "balance";
  if (job.payTermsDays !== null && ownerPaymentUnknown(job.payTermsBasis, app)) {
    return app.ageDays > OWNER_PAYMENT_FOLLOW_UP_DAYS ? "owner" : "status";
  }
  const late = lateness(job, app);
  if (late > SECOND_NOTICE_DAYS) return "second";
  if (late > 0) return "reminder";
  return "status";
}

/** True when the cash report would ask the contractor to chase this application. */
export function needsFollowUp(job: FollowUpJob, app: OutstandingApp): boolean {
  return followUpKind(job, app) !== "status";
}

const terms = (job: FollowUpJob) =>
  job.payTermsBasis === "owner_paid" ? (job.payTermsOuterDays ?? null) : null;

const jobLabel = (job: FollowUpJob) => (job.number ? `${job.name} (job ${job.number})` : job.name);

/**
 * The draft for one unpaid application, signed with the user's name and company in PayApps; a blank
 * one leaves a placeholder the contractor fills in.
 */
export function followUpEmail(
  job: FollowUpJob,
  app: OutstandingApp,
  from: { name: string; company: string },
): FollowUpEmail {
  const kind = followUpKind(job, app);
  const label = jobLabel(job);
  const owed = formatCents(app.amountCents);
  const billed = formatCents(app.expectedCents);
  const appRef = `pay application #${app.number}`;
  const sentOn = `dated ${app.applicationDate}, for work through ${app.periodTo}`;
  const due =
    job.payTermsDays !== null && app.dueOn
      ? ` Under our subcontract's pay terms (${termsPhrase(job.payTermsDays, job.payTermsBasis, terms(job))}) it was due on ${app.dueOn}.`
      : "";
  const certified = app.status === "certified" ? " It has been certified." : "";
  const lines: string[] = [];
  let subject: string;

  switch (kind) {
    case "status":
      subject = `${label}: pay application #${app.number}, ${owed}`;
      lines.push(
        `Checking that our ${appRef} on ${label} (${sentOn}) for ${owed} reached you and is in for processing.${certified}`,
        job.payTermsDays !== null && app.dueOn
          ? `By our subcontract's pay terms (${termsPhrase(job.payTermsDays, job.payTermsBasis, terms(job))}) it is due on ${app.dueOn}.`
          : "",
        "If anything is missing or needs correcting before it can be approved (a lien waiver, backup, a line you read differently), please let me know now so it does not hold up payment.",
      );
      break;
    case "reminder":
      subject = `Past due: ${label}, pay application #${app.number}, ${owed}`;
      lines.push(
        `Our ${appRef} on ${label} (${sentOn}) for ${owed} has not been paid yet.${due}${certified}`,
        `Could you tell me when we can expect payment? If something is holding it up (a lien waiver, backup, or a question on a line), let me know and I will get it to you right away.`,
      );
      break;
    case "second":
      subject = `Second request: ${label}, pay application #${app.number}, ${owed} past due`;
      lines.push(
        `I am following up again on our ${appRef} on ${label} (${sentOn}) for ${owed}, which is still unpaid ${app.ageDays} days after the application date.${due}${certified}`,
        "Please reply with the date the payment will be released, or tell me what is needed to release it. If there is a problem with the application, I would rather fix it this week than let it wait another cycle.",
      );
      break;
    case "owner":
      subject = `${label}: pay application #${app.number}, ${owed}, has the owner paid?`;
      lines.push(
        `Our ${appRef} on ${label} (${sentOn}) for ${owed} has not been paid yet.${certified}`,
        job.payTermsDays !== null
          ? `Our subcontract pays ${termsPhrase(job.payTermsDays, job.payTermsBasis, terms(job))}. Has the owner paid you for this period yet, and if so, on what date? That tells me when to expect our payment.${app.dueByOuterLimit && app.dueOn ? ` Either way, under that outer limit it is due on ${app.dueOn}.` : ""}`
          : "",
        "If the owner's payment is held up by something on our side (a lien waiver, backup, or a question on a line), let me know and I will get it to you right away.",
      );
      break;
    case "balance":
      subject = `Balance on ${label}, pay application #${app.number}: ${owed}`;
      lines.push(
        `Thank you for the ${formatCents(app.receivedCents)} received${app.lastReceivedOn ? ` (last on ${app.lastReceivedOn})` : ""} against our ${appRef} on ${label} (${sentOn}). The application was for ${billed}, which leaves ${owed} unpaid.${due}`,
        "Could you tell me what the balance is held for? If it is a backcharge, please send the backup for it; if it is waiting on a lien waiver or other paperwork, tell me what you need; and if it was missed, please let me know when it will be paid.",
      );
      break;
  }

  const name = from.name.trim() || "[your name]";
  const company = from.company.trim() || "[your company]";
  const body = [
    greeting(job),
    "",
    ...lines.filter((l) => l !== "").flatMap((l) => [l, ""]),
    "I can resend the application and its backup if that helps.",
    "",
    "Thank you,",
    name,
    company,
  ].join("\n");
  return { kind, to: job.gcBillingEmail?.trim() || null, subject, body };
}

/**
 * A mailto: link with the subject and body filled in, addressed to `to` when given (the job's GC
 * billing contact), else with no recipient (the contractor picks it). The address is percent-encoded
 * apart from its "@", so nothing in it can add a header or a second recipient.
 */
export function mailtoHref(
  email: Pick<FollowUpEmail, "subject" | "body"> & { to?: string | null },
): string {
  const to = email.to?.trim() ? encodeURIComponent(email.to.trim()).replace(/%40/g, "@") : "";
  return `mailto:${to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}
