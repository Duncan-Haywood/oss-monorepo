// Rendering and link-state helpers for the browser tool. Pure functions only,
// so `node --test` covers them without a DOM.
//
// Two things a calculator that lives entirely in one page otherwise can't do:
// hand the result to somewhere else (markdown, for notes or a client email),
// and come back to a quote later (the URL fragment). Both matter more here
// than in a hosted tool, because there is no account to save anything into.

/**
 * Renders the same Markdown report as `python3 src/quote_margin.py --format
 * markdown`, field for field. Anyone comparing the two surfaces should get
 * byte-identical output for the same inputs — that is the point of keeping the
 * wording here rather than paraphrasing it.
 */
export function toMarkdown(quote, result) {
  const c = quote.currency;
  const n = (value) => (Math.round(value * 100) / 100).toFixed(2);
  const status = result.gap_to_target >= 0 ? "above target" : "below target";
  return (
    [
      "# Quote Margin Check",
      "",
      `Status: **${status}** (arithmetic comparison only)`,
      "",
      "| Measure | Result |",
      "|---|---:|",
      `| Quoted price | ${c} ${n(quote.price)} |`,
      `| Total working hours | ${n(result.total_hours)} |`,
      `| Direct costs | ${c} ${n(result.direct_costs)} |`,
      `| Effective hourly rate | ${c} ${n(result.effective_hourly_rate)}/hour |`,
      `| Price at supplied target rate | ${c} ${n(result.target_price)} |`,
      `| Gap to target price | ${c} ${n(result.gap_to_target)} |`,
      `| After direct costs | ${c} ${n(result.cost_coverage)} |`,
      "",
      "This is a customer-supplied estimate, not tax, financial, or business advice. It does not certify profitability or account for every cost. Review the assumptions before using the result.",
    ].join("\n") + "\n"
  );
}

const NUMERIC_FIELDS = [
  "price",
  "delivery_hours",
  "admin_hours",
  "revision_hours",
  "overhead",
  "subcontractor_cost",
  "target_hourly_rate",
];

/**
 * Encodes the raw form strings into a URL fragment.
 *
 * The fragment, not the query string, on purpose: fragments are never sent to
 * a server, so a shared or bookmarked link keeps the same "nothing leaves your
 * device" property as the rest of the page even if this is ever hosted behind
 * someone else's access log.
 *
 * Blank fields are omitted rather than written as 0, so a restored form looks
 * like the one that was shared instead of filling every optional box with
 * zeroes.
 */
export function encodeQuoteToHash(raw) {
  const params = new URLSearchParams();
  if (raw.currency && raw.currency !== "USD") params.set("currency", raw.currency);
  for (const field of NUMERIC_FIELDS) {
    const value = raw[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(field, String(value).trim());
    }
  }
  const encoded = params.toString();
  return encoded ? `#${encoded}` : "";
}

/**
 * Reads a fragment written by encodeQuoteToHash back into raw form strings.
 *
 * Deliberately lenient: a hand-edited or truncated link should populate what it
 * can and leave the rest blank, rather than throwing and leaving the visitor on
 * an empty page with no explanation. Anything non-numeric is dropped here so it
 * never reaches loadQuote() as a validation error the visitor didn't cause.
 */
export function decodeQuoteFromHash(hash) {
  const raw = {};
  if (typeof hash !== "string") return raw;
  const query = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!query) return raw;
  let params;
  try {
    params = new URLSearchParams(query);
  } catch {
    return raw;
  }
  const currency = params.get("currency");
  if (currency && currency.trim() && currency.trim().length <= 12) {
    raw.currency = currency.trim();
  }
  for (const field of NUMERIC_FIELDS) {
    const value = params.get(field);
    if (value === null) continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    raw[field] = trimmed;
  }
  return raw;
}

/**
 * A worked example, used by the "Try an example" button.
 *
 * Chosen to be below target: a quote that looks fine on delivery hours alone
 * and stops looking fine once admin and revision time are counted. That is the
 * problem the tool exists for, so the first thing a first-time visitor sees
 * should demonstrate it rather than a comfortable pass.
 */
export const EXAMPLE_QUOTE = {
  currency: "USD",
  price: "4200",
  delivery_hours: "30",
  admin_hours: "6",
  revision_hours: "8",
  overhead: "150",
  subcontractor_cost: "400",
  target_hourly_rate: "95",
};
