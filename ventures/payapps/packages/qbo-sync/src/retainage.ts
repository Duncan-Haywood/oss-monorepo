/**
 * Retainage pattern: maps one pay application (AIA G702/G703 style) onto ordinary invoice lines.
 *
 * Accounting effect when the retainage item's posting account is an asset account
 * ("Retainage Receivable", AccountType "Other Current Asset"):
 *
 *   pay app with work W and retainage held R (R = W × rate):
 *     line "work completed"      +W  -> credits income W
 *     line "retainage held"      -R  -> debits Retainage Receivable R
 *     invoice total             W-R  -> debits Accounts Receivable W-R (what the customer owes now)
 *
 *   later, retainage released L (on a pay app or a release-only invoice):
 *     line "retainage released"  +L  -> credits Retainage Receivable L
 *     invoice total includes L       -> debits Accounts Receivable L
 *
 * Income is recognised in full when the work is billed; the held amount sits in an asset account
 * until it is billed for release. The Retainage Receivable balance equals retainage held to date
 * minus retainage released. See the README for the full write-up and its sources.
 *
 * This module is pure: it builds lines and checks the arithmetic; it does not call any API.
 */

import { applyRateBps, formatRateBps } from "./money.ts";
import { AccountingValidationError, type Cents, type InvoiceLineInput } from "./port.ts";

export interface PayAppWorkLine {
  /** The contract/schedule-of-values item this work posts to (an income item). */
  itemId: string;
  description: string;
  /** Work completed this period plus materials presently stored, for this line. May be negative. */
  amountCents: Cents;
  /** Overrides the pay app's default rate for this line (e.g. stored materials at a lower rate). */
  retainageRateBps?: number;
}

export interface PayAppInvoicePlanInput {
  applicationNumber: number;
  /** The item whose posting account is Retainage Receivable (from `ensureRetainageSetup`). */
  retainageItemId: string;
  workLines: PayAppWorkLine[];
  /** Default retainage rate in basis points: 1000 = 10%. */
  retainageRateBps: number;
  /** Retainage held on earlier pay apps, net of earlier releases. Required to release. */
  retainageHeldToDateCents?: Cents;
  /** Retainage being billed for release on this invoice. */
  retainageReleasedCents?: Cents;
}

export interface PayAppInvoiceSummary {
  grossCents: Cents;
  retainageHeldCents: Cents;
  retainageReleasedCents: Cents;
  /** What the invoice asks the customer to pay now: gross - held + released. */
  netCents: Cents;
  /** Retainage Receivable balance after this invoice posts (when the prior balance was given). */
  retainageBalanceAfterCents: Cents | null;
}

export interface PayAppInvoicePlan {
  lines: InvoiceLineInput[];
  summary: PayAppInvoiceSummary;
}

function checkRate(rateBps: number, where: string): void {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new AccountingValidationError(`${where}: retainage rate must be 0..10000 basis points`);
  }
}

function checkCents(value: number, where: string): void {
  if (!Number.isInteger(value))
    throw new AccountingValidationError(`${where} must be integer cents`);
}

export function planPayAppInvoice(input: PayAppInvoicePlanInput): PayAppInvoicePlan {
  const app = input.applicationNumber;
  if (!Number.isInteger(app) || app < 1) {
    throw new AccountingValidationError("applicationNumber must be a positive integer");
  }
  if (!input.retainageItemId) throw new AccountingValidationError("retainageItemId is required");
  checkRate(input.retainageRateBps, "pay app");

  const released = input.retainageReleasedCents ?? 0;
  checkCents(released, "retainageReleasedCents");
  if (released < 0)
    throw new AccountingValidationError("retainageReleasedCents cannot be negative");
  const heldBefore = input.retainageHeldToDateCents;
  if (heldBefore !== undefined) checkCents(heldBefore, "retainageHeldToDateCents");

  if (input.workLines.length === 0 && released === 0) {
    throw new AccountingValidationError("nothing to bill: no work lines and no retainage release");
  }

  const lines: InvoiceLineInput[] = [];
  let gross = 0;
  // Retainage held, grouped by rate so the invoice shows one "held" line per rate.
  const heldByRate = new Map<number, Cents>();
  for (const [i, w] of input.workLines.entries()) {
    checkCents(w.amountCents, `workLines[${i}].amountCents`);
    if (!w.itemId) throw new AccountingValidationError(`workLines[${i}]: itemId is required`);
    const rate = w.retainageRateBps ?? input.retainageRateBps;
    checkRate(rate, `workLines[${i}]`);
    gross += w.amountCents;
    lines.push({ itemId: w.itemId, description: w.description, amountCents: w.amountCents });
    heldByRate.set(rate, (heldByRate.get(rate) ?? 0) + applyRateBps(w.amountCents, rate));
  }

  let held = 0;
  for (const [rate, amount] of [...heldByRate.entries()].sort((a, b) => b[0] - a[0])) {
    if (amount === 0) continue;
    held += amount;
    lines.push({
      itemId: input.retainageItemId,
      description: `Retainage held (${formatRateBps(rate)}), pay application #${app}`,
      amountCents: -amount,
    });
  }

  if (released > 0) {
    if (heldBefore === undefined) {
      throw new AccountingValidationError(
        "retainageHeldToDateCents is required when releasing retainage",
      );
    }
    if (released > heldBefore + held) {
      throw new AccountingValidationError(
        `release (${released}) exceeds retainage held to date (${heldBefore + held})`,
      );
    }
    lines.push({
      itemId: input.retainageItemId,
      description: `Retainage released, pay application #${app}`,
      amountCents: released,
    });
  }

  const net = gross - held + released;
  if (net < 0) {
    throw new AccountingValidationError(
      `pay app #${app} nets to a negative invoice (${net} cents)`,
    );
  }

  return {
    lines,
    summary: {
      grossCents: gross,
      retainageHeldCents: held,
      retainageReleasedCents: released,
      netCents: net,
      retainageBalanceAfterCents: heldBefore === undefined ? null : heldBefore + held - released,
    },
  };
}

/**
 * Retainage Receivable movement on invoices already in the books: the sum of the retainage
 * item's lines, negated (held lines are negative, release lines positive).
 */
export function retainageBalanceFromLines(
  lines: readonly { itemId: string; amountCents: Cents }[],
  retainageItemId: string,
): Cents {
  let balance = 0;
  for (const l of lines) if (l.itemId === retainageItemId) balance -= l.amountCents;
  return balance;
}
