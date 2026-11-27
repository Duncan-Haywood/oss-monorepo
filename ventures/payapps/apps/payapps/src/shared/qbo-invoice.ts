// One pay application as a QuickBooks Online invoice (pure). The invoice asks for exactly line 8
// (current payment due) of the application:
//
//   one line per schedule-of-values line, for what this application adds to column G (work this
//   period plus the change in materials stored), posted to the contract income item;
//   one retainage line, posted to the Retainage item (Retainage Receivable): negative when
//   retainage is held this period, positive when it is released.
//
// The retainage line is the difference between line 8 and the work lines, so the invoice total is
// always the application's own line 8, never a figure recomputed from a rate. With consistent
// history it equals minus the change in total retainage (line 5); `retainageCheck` reports any gap
// so a mismatch is visible rather than silently booked.
import type { ComputedApplication } from "./payapp-math";

export type QboInvoiceLineKind = "work" | "retainage_held" | "retainage_released";

export interface QboInvoiceLinePlan {
  kind: QboInvoiceLineKind;
  sovLineId: string | null;
  description: string;
  amountCents: number;
}

export interface QboInvoicePlan {
  lines: QboInvoiceLinePlan[];
  /** Sum of the work lines: what this application adds to total completed and stored (column G). */
  workCents: number;
  /** Signed: negative = retainage held this period, positive = released. */
  retainageCents: number;
  /** Line 8 of the application, the invoice total. */
  totalCents: number;
  /**
   * Retainage line minus the change in total retainage (line 5) since the previous application.
   * 0 with consistent history; null for a first application (no line 5 before it here).
   */
  retainageCheckCents: number | null;
}

export class QboInvoicePlanError extends Error {
  override name = "QboInvoicePlanError";
}

/** QuickBooks DocNumber is at most 21 characters. */
export const QBO_DOC_NUMBER_MAX = 21;

/**
 * Invoice number for a pay application: "PA" + the job number (or a short job id) + the
 * application number, e.g. "PA24-117-03". Stable, so a retry finds the invoice it already created.
 */
export function qboDocNumber(
  project: { id: string; number: string | null },
  appNumber: number,
): string {
  const n = String(appNumber).padStart(2, "0");
  const raw = (project.number ?? "").replace(/[^A-Za-z0-9-]/g, "");
  const key = raw || project.id.replace(/^prj_/, "").slice(0, 6);
  const room = QBO_DOC_NUMBER_MAX - 3 - n.length; // "PA" + "-" + number
  return `PA${key.slice(0, room)}-${n}`;
}

const clip = (s: string, max = 4000) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function planQboInvoice(
  current: ComputedApplication,
  previous: ComputedApplication | null,
): QboInvoicePlan {
  const total = current.summary.currentPaymentDueCents;
  if (total < 0) {
    throw new QboInvoicePlanError(
      "Line 8 is negative (this application bills less than earlier ones); QuickBooks cannot take a negative invoice. Record it as a credit memo in QuickBooks instead.",
    );
  }
  const prevG = new Map(previous?.lines.map((l) => [l.sovLineId, l.completedAndStoredCents]));
  const lines: QboInvoiceLinePlan[] = [];
  let work = 0;
  for (const l of current.lines) {
    // A first application here starts from the opening balance (column D), with nothing stored.
    const before = previous ? (prevG.get(l.sovLineId) ?? 0) : l.fromPreviousCents;
    const delta = l.completedAndStoredCents - before;
    if (delta === 0) continue;
    work += delta;
    const label = [l.itemNumber, l.description].filter(Boolean).join(" ");
    lines.push({
      kind: "work",
      sovLineId: l.sovLineId,
      description: clip(label),
      amountCents: delta,
    });
  }
  const retainage = total - work;
  if (retainage !== 0) {
    const held = retainage < 0;
    lines.push({
      kind: held ? "retainage_held" : "retainage_released",
      sovLineId: null,
      description: `Retainage ${held ? "held" : "released"}, pay application #${current.number}`,
      amountCents: retainage,
    });
  }
  if (lines.length === 0) {
    throw new QboInvoicePlanError("This application bills nothing: line 8 is $0 with no work.");
  }
  const retainageCheckCents = previous
    ? retainage + (current.summary.totalRetainageCents - previous.summary.totalRetainageCents)
    : null;
  return {
    lines,
    workCents: work,
    retainageCents: retainage,
    totalCents: total,
    retainageCheckCents,
  };
}
