// Payments received against a pay application. Pure: the worker stores payment rows, and everything
// else (what is still owed, whether a new payment fits, whether the application is now paid) is
// computed here so the API, the cash report and the page agree.
//
// expected: the GC-certified amount when there is one, else line 8 (current payment due).
// received: the sum of the recorded payments. An application marked paid without payments (or with
// fewer than the expected amount) counts as paid in full: "Mark paid" means the rest came in too.
//
// Closing short: a GC that pays short and will not pay the rest (a backcharge, an amount in dispute,
// or money the contractor gives up on) leaves a balance that would otherwise sit in the aging for
// ever. Closing it records the balance at that moment as `closedShortCents` with a reason, and the
// application turns paid: the cash report then counts only what was received as paid and the rest
// under its reason, and the unconditional waiver it asks for covers only the money received.
// Reopening (or deleting a payment) puts the balance back as owed.
import type { PayAppStatus, PayTermsBasis, ShortCloseReason } from "./enums";
import { formatCents } from "./money";

export interface PaymentInput {
  amountCents: number;
  receivedOn: string; // YYYY-MM-DD
}

export const expectedCents = (
  certifiedAmountCents: number | null,
  currentPaymentDueCents: number,
) => certifiedAmountCents ?? currentPaymentDueCents;

export const receivedCents = (payments: readonly Pick<PaymentInput, "amountCents">[]) =>
  payments.reduce((s, p) => s + p.amountCents, 0);

export interface PaymentPosition {
  expectedCents: number;
  /** What the cash report counts as paid: everything when the application is paid, else received. */
  paidCents: number;
  /** Still owed on a sent application; 0 for drafts and paid applications. */
  remainingCents: number;
  /** Some money in, some still owed. */
  partial: boolean;
  /** Latest payment date, or null. */
  lastReceivedOn: string | null;
  /** Balance closed without payment (a backcharge, a dispute, a write-off); 0 when none. */
  closedShortCents: number;
}

export function paymentPosition(
  status: PayAppStatus,
  expected: number,
  payments: readonly PaymentInput[],
  closedShortCents: number | null = null,
): PaymentPosition {
  const received = receivedCents(payments);
  const lastReceivedOn = payments.reduce<string | null>(
    (d, p) => (d === null || p.receivedOn > d ? p.receivedOn : d),
    null,
  );
  if (status === "paid") {
    const closed = Math.min(Math.max(0, closedShortCents ?? 0), expected);
    return {
      expectedCents: expected,
      paidCents: expected - closed,
      remainingCents: 0,
      partial: false,
      lastReceivedOn,
      closedShortCents: closed,
    };
  }
  if (status === "draft")
    return {
      expectedCents: expected,
      paidCents: 0,
      remainingCents: 0,
      partial: false,
      lastReceivedOn,
      closedShortCents: 0,
    };
  const paid = Math.min(received, expected);
  const remaining = Math.max(0, expected - received);
  return {
    expectedCents: expected,
    paidCents: paid,
    remainingCents: remaining,
    partial: paid > 0 && remaining > 0,
    lastReceivedOn,
    closedShortCents: 0,
  };
}

/**
 * Why a new payment cannot be recorded, or null when it can. A payment larger than what is still
 * owed is refused (almost always a typo); an overpayment by the GC is rare and is better handled by
 * correcting the certified amount.
 */
export function paymentProblem(
  status: PayAppStatus,
  expected: number,
  existing: readonly PaymentInput[],
  payment: PaymentInput,
  today: string,
): string | null {
  if (status === "draft") return "Submit the application before recording a payment against it";
  if (status === "paid") return "This application is already marked paid";
  if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0)
    return "A payment must be more than $0.00";
  if (payment.receivedOn > today) return "The date received cannot be in the future";
  const remaining = expected - receivedCents(existing);
  if (payment.amountCents > remaining)
    return `That is more than the ${formatCents(remaining)} still owed on this application`;
  return null;
}

/** Status after a payment is recorded: paid once the payments reach the expected amount. */
export function statusAfterPayments(
  status: PayAppStatus,
  expected: number,
  payments: readonly PaymentInput[],
): PayAppStatus {
  if (status === "submitted" || status === "certified")
    return receivedCents(payments) >= expected ? "paid" : status;
  return status;
}

/**
 * Money counted as paid on an application marked paid in full that has no payment row behind it:
 * "Mark paid" said the rest came in, but not when or by which check. 0 for an unpaid application,
 * and the balance closed short is never counted (it was not received).
 */
export function unrecordedPaidCents(
  status: PayAppStatus,
  expected: number,
  payments: readonly Pick<PaymentInput, "amountCents">[],
  closedShortCents: number | null = null,
): number {
  if (status !== "paid") return 0;
  const closed = Math.min(Math.max(0, closedShortCents ?? 0), expected);
  return Math.max(0, expected - closed - receivedCents(payments));
}

/**
 * Why the unrecorded money on a paid application cannot be recorded as one payment now, or null.
 * The payment is always the whole unrecorded amount, so it cannot be mistyped.
 */
export function unrecordedPaymentProblem(
  status: PayAppStatus,
  unrecordedCents: number,
  receivedOn: string,
  today: string,
): string | null {
  if (status !== "paid") return "Only an application marked paid has money to record this way";
  if (unrecordedCents <= 0) return "Every dollar paid on this application is already recorded";
  if (receivedOn > today) return "The date received cannot be in the future";
  return null;
}

export const SHORT_REASON_LABELS: Record<ShortCloseReason, string> = {
  backcharge: "Backcharge",
  disputed: "Disputed",
  "written-off": "Written off",
};

export interface ShortCloseInput {
  reason: ShortCloseReason;
  closedOn: string; // YYYY-MM-DD
}

/**
 * Why the balance of an application cannot be closed short, or null when it can. Only a sent,
 * unpaid application with money still owed; the date is when the contractor learned the balance
 * would not be paid (the backcharge notice, the short check), never in the future and never before
 * the application date.
 */
export function shortCloseProblem(
  app: { status: PayAppStatus; applicationDate: string },
  expected: number,
  payments: readonly PaymentInput[],
  input: ShortCloseInput,
  today: string,
): string | null {
  if (app.status === "draft") return "Submit the application before closing its balance";
  if (app.status === "paid") return "This application is already paid or closed";
  if (expected - receivedCents(payments) <= 0) return "Nothing is owed on this application";
  if (input.closedOn > today) return "The date cannot be in the future";
  if (input.closedOn < app.applicationDate) return "The date cannot be before the application date";
  return null;
}

/**
 * Why the owner's payment date cannot be recorded on an application, or null when it can. Only on
 * a pay-when-paid job (its terms count from the owner's payment), only once the application went
 * to the GC, never in the future and never before the period it bills began (the owner cannot have
 * paid for work not yet started). Clearing it (null) is allowed on any sent application.
 */
export function ownerPaidProblem(
  app: { status: PayAppStatus; periodFrom: string },
  basis: PayTermsBasis,
  ownerPaidOn: string | null,
  today: string,
): string | null {
  if (app.status === "draft") return "Submit the application before recording the owner's payment";
  if (ownerPaidOn === null) return null;
  if (basis !== "owner_paid") {
    return "This job's pay terms do not count from the owner's payment; set them to pay-when-paid first";
  }
  if (ownerPaidOn > today) return "The date cannot be in the future";
  if (ownerPaidOn < app.periodFrom) return "The date cannot be before the period billed began";
  return null;
}

/** The most applications one owner-payment date can be recorded on at once. */
export const MAX_OWNER_PAID_BATCH = 50;

/**
 * Why one owner's payment date cannot be recorded on several applications at once, or null when it
 * can. A GC often reports a single owner payment that covered more than one period ("the owner paid
 * January and February on the 10th"); every application must pass {@link ownerPaidProblem} on its
 * own, so the batch is all or nothing and the first refusal names its application. Clearing (null)
 * is one application at a time, on its own page.
 */
export function ownerPaidManyProblem(
  apps: readonly { number: number; status: PayAppStatus; periodFrom: string }[],
  basis: PayTermsBasis,
  ownerPaidOn: string,
  today: string,
): string | null {
  if (apps.length === 0) return "Choose at least one application";
  if (apps.length > MAX_OWNER_PAID_BATCH) {
    return `At most ${MAX_OWNER_PAID_BATCH} applications at once`;
  }
  for (const app of [...apps].sort((a, b) => a.number - b.number)) {
    const problem = ownerPaidProblem(app, basis, ownerPaidOn, today);
    if (problem) return `Application #${app.number}: ${problem}`;
  }
  return null;
}

/** The balance that closing short would record: expected less received, never negative. */
export const shortBalanceCents = (expected: number, payments: readonly PaymentInput[]) =>
  Math.max(0, expected - receivedCents(payments));
