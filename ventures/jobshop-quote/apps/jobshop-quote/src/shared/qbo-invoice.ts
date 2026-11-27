// A won quote as a QuickBooks Online invoice (docs/QUICKBOOKS.md). Pure: the worker loads the quote
// and the customer's online acceptance, this decides what the invoice says.
//
// Rules (the "no invented prices" rule of docs/ARCHITECTURE.md carried into the books):
// - Every invoice line is one quote line at one of its quoted quantity breaks, at that break's
//   stored unit price and total (total = unit price × quantity, as the costing engine stores it).
//   A quantity that was not quoted is refused, never priced by interpolation.
// - Which break: the one the estimator picks; else the one the customer accepted online; else the
//   line's only break. A line quoted at several breaks with none of these is named and refused.
// - A part the customer did not order (left out of an online acceptance, or left out by the
//   estimator) is not on the invoice; at least one line must be.
// - Nothing internal reaches the invoice: part number, revision, description, quantity and price
//   only, the same facts the customer PDF prints.

import { quoteLabel } from "./quote-label";

export interface InvoiceableLine {
  id: string;
  partNumber: string;
  revision: string | null;
  description: string | null;
  breaks: { quantity: number; unitPriceCents: number; totalCents: number }[] | null;
}

export interface InvoiceChoice {
  lineId: string;
  /** A quoted quantity of that line, or 0 to leave the line off the invoice. */
  quantity: number;
}

export interface PlannedInvoiceLine {
  lineId: string;
  partNumber: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  /** Where the quantity came from, for the preview. */
  source: "picked" | "accepted" | "only-break";
}

export type InvoicePlan =
  | { ok: true; lines: PlannedInvoiceLine[]; totalCents: number; leftOff: string[] }
  | { ok: false; error: string; missing?: string[] };

/** QuickBooks Online's DocNumber holds at most 21 characters. */
export const QBO_DOC_NUMBER_MAX = 21;
/** QuickBooks Online's line Description holds at most 4,000 characters. */
const QBO_LINE_DESCRIPTION_MAX = 4000;

/**
 * The invoice number in QuickBooks: "Q1001", or "Q1001-R2" for a revision. Stable per quote, so a
 * second send finds the first invoice instead of making another.
 */
export function qboDocNumber(quoteNumber: number, revNumber = 1): string {
  const n = revNumber > 1 ? `Q${quoteNumber}-R${revNumber}` : `Q${quoteNumber}`;
  return n.slice(0, QBO_DOC_NUMBER_MAX);
}

/** "BRK-114 Rev C, Mounting bracket": what the customer PDF names the part. */
export function invoiceLineDescription(
  line: Pick<InvoiceableLine, "partNumber" | "revision" | "description">,
) {
  const rev = line.revision?.trim();
  const desc = line.description?.replace(/\s+/g, " ").trim();
  const head = rev ? `${line.partNumber} Rev ${rev}` : line.partNumber;
  return (desc ? `${head}, ${desc}` : head).slice(0, QBO_LINE_DESCRIPTION_MAX);
}

/**
 * The message printed on the invoice: the customer's PO and the quote it came from. QuickBooks
 * prints `CustomerMemo` on the customer's copy ("Message displayed on invoice").
 */
export function invoiceMemo(q: {
  quoteNumber: number;
  revNumber: number;
  poNumber: string | null;
}) {
  const po = q.poNumber?.replace(/\s+/g, " ").trim();
  const ref = `Per our quote ${quoteLabel(q.quoteNumber, q.revNumber)}.`;
  return (po ? `Your PO ${po}. ${ref}` : ref).slice(0, 1000);
}

export function planQuoteInvoice(
  lines: readonly InvoiceableLine[],
  picked: readonly InvoiceChoice[],
  accepted: ReadonlyArray<{ lineId: string; quantity: number }> | null,
): InvoicePlan {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const pickedById = new Map<string, number>();
  for (const c of picked) {
    const line = byId.get(c.lineId);
    if (!line) return { ok: false, error: "A quantity names a line not on this quote" };
    if (pickedById.has(c.lineId)) return { ok: false, error: `${line.partNumber} is picked twice` };
    pickedById.set(c.lineId, c.quantity);
  }

  const out: PlannedInvoiceLine[] = [];
  const leftOff: string[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const breaks = line.breaks ?? [];
    let quantity: number | undefined;
    let source: PlannedInvoiceLine["source"] = "picked";
    if (pickedById.has(line.id)) {
      quantity = pickedById.get(line.id);
    } else if (accepted) {
      quantity = accepted.find((c) => c.lineId === line.id)?.quantity ?? 0;
      source = "accepted";
    } else if (breaks.length === 1) {
      quantity = breaks[0]?.quantity;
      source = "only-break";
    }
    if (quantity === undefined) {
      if (breaks.length === 0) {
        return {
          ok: false,
          error: `${line.partNumber} has no price: finish the line before invoicing`,
        };
      }
      missing.push(line.partNumber);
      continue;
    }
    if (quantity === 0) {
      leftOff.push(line.partNumber);
      continue;
    }
    const b = breaks.find((x) => x.quantity === quantity);
    if (!b) {
      return {
        ok: false,
        error: `${line.partNumber} was not quoted at a quantity of ${quantity}; pick one of the quoted quantities, or revise the quote`,
      };
    }
    if (b.totalCents !== b.unitPriceCents * b.quantity) {
      // The costing engine stores total = unit × quantity; anything else is not a price we made.
      return {
        ok: false,
        error: `${line.partNumber}'s stored price does not add up; re-price the quote`,
      };
    }
    out.push({
      lineId: line.id,
      partNumber: line.partNumber,
      description: invoiceLineDescription(line),
      quantity: b.quantity,
      unitPriceCents: b.unitPriceCents,
      totalCents: b.totalCents,
      source,
    });
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Pick the quantity ordered for ${missing.join(", ")}: quoted at more than one quantity`,
      missing,
    };
  }
  if (out.length === 0)
    return { ok: false, error: "No part on this quote is picked for the invoice" };
  return { ok: true, lines: out, totalCents: out.reduce((s, l) => s + l.totalCents, 0), leftOff };
}

/**
 * Whether the shop's prices can go into this QuickBooks company: the company's home currency must
 * be the shop's. An unknown home currency is accepted only for a US-dollar shop (QuickBooks' own
 * default), never guessed for another.
 */
export function currencyMismatch(
  shopCurrency: string,
  homeCurrency: string | undefined,
): string | null {
  if (homeCurrency === undefined) {
    return shopCurrency === "USD"
      ? null
      : `Your QuickBooks company did not say its home currency, and this shop prices in ${shopCurrency}; nothing was sent`;
  }
  return homeCurrency === shopCurrency
    ? null
    : `Your QuickBooks company keeps its books in ${homeCurrency} and this shop prices in ${shopCurrency}; nothing was sent, since the amounts would land as ${homeCurrency}`;
}
