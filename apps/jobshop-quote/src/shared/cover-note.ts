// The quote cover note. The LLM may only EXPLAIN a quote the costing engine already priced: it gets
// customer-safe facts (part numbers, quantities, unit prices, totals, what the price includes by name,
// lead time; never rates, costs or markup) and writes a short note. Every number in its note must appear in those facts, else the note is
// rejected and the deterministic template is used instead. It never sees or sets a price input.

export interface CoverNoteFacts {
  shopName: string;
  customerName: string;
  quoteNumber: string;
  validUntil: string | null;
  leadTimeText: string | null;
  lines: {
    partNumber: string;
    description: string | null;
    breaks: { quantity: number; unitPriceCents: number; totalCents: number }[];
    /** What the price covers, by name only (material, operations, finishing, extras). No rates. */
    includes: string[];
  }[];
  notes: string | null;
}

const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The facts as text: the only material the LLM gets, and the only numbers its note may use. */
export function coverNoteContext(f: CoverNoteFacts): string {
  const out = [
    `Shop: ${f.shopName}`,
    `Customer: ${f.customerName}`,
    `Quote number: ${f.quoteNumber}`,
  ];
  if (f.validUntil) out.push(`Valid until: ${f.validUntil}`);
  if (f.leadTimeText) out.push(`Lead time: ${f.leadTimeText}`);
  for (const l of f.lines) {
    out.push(`Part ${l.partNumber}${l.description ? ` - ${l.description}` : ""}`);
    for (const b of l.breaks) {
      out.push(
        `  Qty ${b.quantity}: ${money(b.unitPriceCents)} each, ${money(b.totalCents)} total`,
      );
    }
    if (l.includes.length > 0) out.push(`  Includes: ${l.includes.join("; ")}`);
  }
  if (f.notes) out.push(`Estimator notes: ${f.notes}`);
  return out.join("\n");
}

/** Numeric values in a text ("$1,234.50" -> 1234.5, "0.005" -> 0.005, "Rev 3" -> 3). */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+/g)].map((m) =>
    Number(m[0].replace(/,/g, "")),
  );
}

/** Numbers in `note` that are not in `context`. Empty means the note is grounded. */
export function ungroundedNumbers(note: string, context: string): number[] {
  const allowed = new Set(numbersIn(context));
  return [...new Set(numbersIn(note))].filter((n) => !allowed.has(n));
}

/**
 * Why a model-written note must be rejected, or null. Beyond ungrounded numbers: the note may not
 * state prices or percentages at all (a grounded number can still be attached to the wrong
 * quantity, "Qty 45 at $100" from "Qty 100 at $45"), nor offer discounts or spelled-out amounts.
 * Pricing lives in the PDF only.
 */
export function coverNoteProblem(note: string, context: string): string | null {
  if (!note.trim()) return "empty";
  if (/\$\s*\d|\d\s*(%|percent\b|dollars?\b|usd\b)/i.test(note))
    return "states a price or percentage";
  if (/\b(discount|rebate|free of charge|complimentary|guarantee[ds]?|waive[ds]?)\b/i.test(note)) {
    return "offers terms not in the quote";
  }
  if (
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand)\b[\s-]*(percent|%|dollars?|off)\b/i.test(
      note,
    )
  ) {
    return "spelled-out amount";
  }
  const extra = ungroundedNumbers(note, context);
  return extra.length > 0 ? `numbers not in the quote: ${extra.join(", ")}` : null;
}

/** Deterministic fallback note, built only from the facts. */
export function templateCoverNote(f: CoverNoteFacts): string {
  const parts = f.lines.map((l) => l.partNumber).join(", ");
  const lines = [
    `Hello ${f.customerName},`,
    "",
    `Thank you for the opportunity to quote ${parts}. Quote ${f.quoteNumber} is attached with pricing at each requested quantity.`,
  ];
  if (f.leadTimeText) lines.push(`Lead time: ${f.leadTimeText}.`);
  if (f.validUntil) lines.push(`Pricing is valid until ${f.validUntil}.`);
  lines.push("", "Please let us know if you have any questions.", "", f.shopName);
  return lines.join("\n");
}
