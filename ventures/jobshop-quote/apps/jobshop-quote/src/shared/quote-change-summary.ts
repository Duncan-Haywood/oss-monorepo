// "Changes from Q-1001": the customer's view of what a revision changed, printed on the revision's
// PDF when the estimator turns it on (quotes.show_changes_on_pdf). Pure, no I/O.
//
// Customer-safe by construction: it reads only what the customer PDF already shows (part number,
// part revision, description, quantity breaks with their unit prices, lead time). Operations,
// machines, minutes, material, blank, finishing and extras are the shop's cost basis and are never
// read here, so a change to them alone prints nothing (the new price says enough).
// Prices are the ones each revision stored, compared as they are; nothing is re-priced.
import { formatMoney } from "./currency";
import type { FieldChange, LineChange, QuoteChanges } from "./quote-diff";

/** Line fields the customer PDF prints, so the customer may see them change. */
const CUSTOMER_LINE_FIELDS = new Set(["partNumber", "revision", "description"]);
/** Header fields the customer PDF prints and that a revision would reasonably change. */
const CUSTOMER_HEADER_FIELDS = new Set(["leadTimeText"]);

const part = (l: LineChange) => `${l.partNumber}${l.revision ? ` Rev ${l.revision}` : ""}`;
const val = (s: string | null) => s ?? "none";

function fieldText(f: FieldChange): string {
  if (f.field === "description") return "description updated";
  if (f.field === "revision") return `part revision ${val(f.from)} to ${val(f.to)}`;
  return `${f.label.toLowerCase()} ${val(f.from)} to ${val(f.to)}`;
}

function lineItems(l: LineChange, currency: string | null): string[] {
  const money = (c: number) => formatMoney(c, currency);
  if (l.kind === "unchanged") return [];
  if (l.kind === "added") return [`${part(l)}: added`];
  if (l.kind === "removed") return [`${part(l)}: no longer quoted`];
  const out: string[] = [];
  const fields = l.fields.filter((f) => CUSTOMER_LINE_FIELDS.has(f.field)).map(fieldText);
  if (fields.length > 0) out.push(`${part(l)}: ${fields.join("; ")}`);
  for (const p of l.prices) {
    const q = `${part(l)}, qty ${p.quantity}`;
    if (p.kind === "added") {
      out.push(
        p.toUnitCents == null ? `${q}: added` : `${q}: added at ${money(p.toUnitCents)} each`,
      );
    } else if (p.kind === "removed") {
      out.push(`${q}: no longer quoted`);
    } else if (p.kind === "changed" && p.fromUnitCents != null && p.toUnitCents != null) {
      out.push(`${q}: ${money(p.fromUnitCents)} to ${money(p.toUnitCents)} each`);
    }
    // A break that was unpriced on one side never reaches a sent PDF (unpriced quotes cannot be
    // sent), so "changed" with a null side prints nothing rather than a misleading figure.
  }
  return out;
}

/**
 * The bullet lines for the PDF, in quote order (header first). Empty when nothing the customer can
 * see changed: the PDF then prints no section at all.
 */
export function customerChangeSummary(
  changes: QuoteChanges,
  /** The shop's ISO 4217 code (shared/currency.ts); null is USD. */
  currency: string | null = null,
): string[] {
  const header = changes.header
    .filter((h) => CUSTOMER_HEADER_FIELDS.has(h.field))
    .map((h) => `${h.label}: ${val(h.from)} to ${val(h.to)}`);
  return [...header, ...changes.lines.flatMap((l) => lineItems(l, currency))];
}
