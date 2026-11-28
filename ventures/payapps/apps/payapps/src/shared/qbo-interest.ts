// Interest a late payment earned, as its own QuickBooks Online invoice to the GC (pure). The cash
// report works the figure out (src/shared/cash-report.ts, paidLateApps); once the contractor bills it
// as a separate invoice, re-typing it in QuickBooks is the step this saves. One line, the interest,
// described so the GC's AP clerk can check it: which application, the balance it ran on, the due
// date, the day paid, the days late and the rate with where it comes from.
import { type LateInterestTerms, rateLabel } from "./late-interest";
import { formatCents } from "./money";
import { QBO_DOC_NUMBER_MAX } from "./qbo-invoice";

export interface QboInterestInput {
  appNumber: number;
  projectName: string;
  /** The application's own invoice number in QuickBooks, when it was sent there. */
  invoiceDocNumber: string | null;
  dueOn: string;
  paidOn: string;
  daysLate: number;
  /** The balance the interest ran on. */
  paidCents: number;
  interestCents: number;
  terms: Pick<LateInterestTerms, "bps" | "per" | "method" | "source">;
}

export interface QboInterestPlan {
  description: string;
  totalCents: number;
  /** Printed on the GC's copy (QuickBooks CustomerMemo). */
  customerMemo: string;
}

export class QboInterestPlanError extends Error {
  override name = "QboInterestPlanError";
}

/**
 * "PA24-117-03" (the application's invoice number) becomes "LI24-117-03", late interest: the same
 * length, so it always fits QuickBooks' 21 characters, and a retry finds the invoice it made.
 */
export function qboInterestDocNumber(payAppDocNumber: string): string {
  return payAppDocNumber.startsWith("PA")
    ? `LI${payAppDocNumber.slice(2)}`
    : `LI${payAppDocNumber}`.slice(0, QBO_DOC_NUMBER_MAX);
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function planQboInterest(i: QboInterestInput): QboInterestPlan {
  if (!Number.isSafeInteger(i.interestCents) || i.interestCents <= 0) {
    throw new QboInterestPlanError("There is no interest to invoice on this application.");
  }
  const rate = `${rateLabel(i.terms)}${i.terms.source ? ` (${i.terms.source})` : ""}`;
  const days = i.daysLate === 1 ? "1 day" : `${i.daysLate} days`;
  const invoice = i.invoiceDocNumber ? `, invoice ${i.invoiceDocNumber}` : "";
  const description = clip(
    `Interest on late payment of pay application #${i.appNumber}${invoice}: ${formatCents(i.paidCents)} due ${i.dueOn}, paid ${i.paidOn}, ${days} late, at ${rate}.`,
    4000,
  );
  const customerMemo = clip(
    `Interest on late payment, ${i.projectName}, pay application #${i.appNumber}. Simple interest on the balance unpaid from the day after it was due to the day it was paid.`,
    1000,
  );
  return { description, totalCents: i.interestCents, customerMemo };
}
