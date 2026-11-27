// A balance closed short (a backcharge, a dispute, a write-off) as a QuickBooks Online credit memo
// against the pay application's invoice (pure). Without it the invoice keeps the short balance open
// in QuickBooks, so the A/R aging there disagrees with PayApps' cash report.
//
// The credit is exactly what QuickBooks still shows open on the invoice once every payment is
// there: the balance closed short, plus, when the GC certified less than was billed, the difference
// between line 8 (the invoice) and the certified amount. Anything else is a mismatch, and nothing
// is planned: the editor checks QuickBooks rather than PayApps guessing which figure is right.
import type { ShortCloseReason } from "./enums";
import { formatCents } from "./money";
import { SHORT_REASON_LABELS } from "./payments";
import { QBO_DOC_NUMBER_MAX } from "./qbo-invoice";

export type QboCreditLineKind = "closed_short" | "certified_below_billed";

export interface QboCreditLinePlan {
  kind: QboCreditLineKind;
  description: string;
  amountCents: number;
}

export interface QboCreditPlan {
  lines: QboCreditLinePlan[];
  totalCents: number;
}

export interface QboCreditInput {
  appNumber: number;
  shortClosedCents: number;
  reason: ShortCloseReason;
  note: string | null;
  /** The invoice's total in QuickBooks (line 8 when it was sent). */
  invoiceTotalCents: number;
  certifiedAmountCents: number | null;
  /** What QuickBooks shows open on the invoice now. */
  openCents: number;
}

export class QboCreditPlanError extends Error {
  override name = "QboCreditPlanError";
}

/** "PA24-117-03" becomes "CR24-117-03": same length, so it always fits QuickBooks' 21 characters. */
export function qboCreditDocNumber(invoiceDocNumber: string): string {
  return invoiceDocNumber.startsWith("PA")
    ? `CR${invoiceDocNumber.slice(2)}`
    : `CR${invoiceDocNumber}`.slice(0, QBO_DOC_NUMBER_MAX);
}

export function planQboCredit(i: QboCreditInput): QboCreditPlan {
  if (!(i.shortClosedCents > 0)) {
    throw new QboCreditPlanError("This application has no balance closed short to credit.");
  }
  const gap = i.openCents - i.shortClosedCents;
  if (gap < 0) {
    throw new QboCreditPlanError(
      `QuickBooks shows ${formatCents(i.openCents)} open on the invoice, less than the ${formatCents(i.shortClosedCents)} closed short. A payment or credit may already be entered there; check the invoice, and if the credit is there, mark it as already in QuickBooks.`,
    );
  }
  const label = SHORT_REASON_LABELS[i.reason];
  const note = i.note?.trim();
  const lines: QboCreditLinePlan[] = [
    {
      kind: "closed_short",
      description: `${label}, pay application #${i.appNumber}${note ? `: ${note}` : ""}`,
      amountCents: i.shortClosedCents,
    },
  ];
  if (gap > 0) {
    const certifiedGap =
      i.certifiedAmountCents === null ? null : i.invoiceTotalCents - i.certifiedAmountCents;
    if (certifiedGap !== gap) {
      throw new QboCreditPlanError(
        `QuickBooks shows ${formatCents(i.openCents)} open on the invoice, more than the ${formatCents(i.shortClosedCents)} closed short. A payment received may not be in QuickBooks yet, or the invoice was changed there; nothing was sent.`,
      );
    }
    lines.push({
      kind: "certified_below_billed",
      description: `Certified by the GC at ${formatCents(i.certifiedAmountCents ?? 0)}, below the ${formatCents(i.invoiceTotalCents)} billed (pay application #${i.appNumber})`,
      amountCents: gap,
    });
  }
  return { lines, totalCents: i.openCents };
}
