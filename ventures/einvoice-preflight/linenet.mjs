// Line and per-rate tax arithmetic shared by checks.mjs and breakdown.mjs,
// following EN 16931: line net = quantity x (price / price base quantity)
// + line charges - line allowances, rounded to cents; VAT is worked out per
// rate on the summed taxable amount, not per line. Mirrors
// src/einvoice_preflight/linenet.py.

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text === "" || !Number.isFinite(Number(text))) return null;
  return Number(text);
}

export function roundCents(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

// A negative invoice (EN 16931 allows one; the Peppol BIS 3.0 example
// "base-negative-inv-correction" is one) states a negative net and gross, and
// any header allowance or charge then carries the same sign.
export function isNegativeInvoice(invoice) {
  const totals = invoice && typeof invoice.totals === "object" && invoice.totals ? invoice.totals : {};
  const net = parseNumber(totals.net);
  const gross = parseNumber(totals.gross);
  return net !== null && net < 0 && gross !== null && gross < 0;
}

function signedAdjustment(rows, allowNegative = false) {
  let delta = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const kind = String(row.kind ?? "").toLowerCase();
    const amount = parseNumber(row.amount);
    if (amount === null || (amount < 0 && !allowNegative) || (kind !== "charge" && kind !== "allowance")) continue;
    delta += kind === "charge" ? amount : -amount;
  }
  return delta;
}

// null when quantity or price is not a number. The price is used at full
// precision: UBL and CII allow more than two decimals (BT-146), and a
// quantity may be negative on a credit line.
export function expectedLineNet(line, applyBase = true) {
  const quantity = parseNumber(line.quantity);
  const price = parseNumber(line.unit_price);
  if (quantity === null || price === null) return null;
  let base = applyBase ? parseNumber(line.price_base_quantity) : 1;
  if (base === null || base <= 0) base = 1;
  return roundCents((quantity * price) / base + signedAdjustment(line.adjustments));
}

// The line net a file should carry. The price base quantity (BT-149) is
// applied, but some producers state one and still net the line as quantity
// times price (the official CII example 8 has a base of 0.0088 on a line that
// sums that way), so a supplied net that matches either reading is accepted.
export function acceptedLineNet(line, supplied) {
  const primary = expectedLineNet(line);
  if (primary === null || supplied === null) return primary;
  const unscaled = expectedLineNet(line, false);
  return supplied === unscaled ? unscaled : primary;
}

// What a total is summed from. In a parsed UBL or CII file it is the line's
// stated net (BR-CO-10 adds the stated nets), so a wrong one is reported once,
// as INV-012, instead of again in every total below it. A draft JSON invoice
// is summed from quantity times price, so a typo in one line net shows up as
// that line's INV-012 and in the totals only if they disagree with the lines.
export function summedLineNet(line, invoice = {}) {
  const stated = parseNumber(line.net);
  const parsed = typeof invoice.source_format === "string";
  return stated === null || !parsed ? expectedLineNet(line) : roundCents(stated);
}

const NO_RATE_CATEGORIES = new Set(["O"]);

// The VAT percentage of a line or breakdown row. Category O ("outside the
// scope of VAT") carries no percentage, so a missing one reads as 0 there.
export function taxPercentOf(item) {
  const percent = parseNumber(item.tax_percent);
  if (percent !== null) return percent;
  const category = typeof item.tax_category === "string" ? item.tax_category.trim().toUpperCase() : "";
  return NO_RATE_CATEGORIES.has(category) ? 0 : null;
}

// Group rows and lines by category and rate when every one of them names a
// category (Z, E and S at 0% are different rows), by rate alone otherwise.
export function taxKeyMode(invoice) {
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const rows = Array.isArray(invoice.tax_breakdown) ? invoice.tax_breakdown : [];
  const named = (item) => item && typeof item === "object" && typeof item.tax_category === "string" && item.tax_category.trim();
  return lines.length > 0 && lines.every(named) && rows.every(named);
}

export function taxKey(item, withCategory) {
  const percent = taxPercentOf(item);
  if (percent === null) return null;
  if (!withCategory) return String(percent);
  const category = typeof item.tax_category === "string" ? item.tax_category.trim().toUpperCase() : "";
  return category ? `${category}|${percent}` : null;
}

// { groups: Map key -> {taxable, tax, percent}, unattributed } from the lines
// and header allowances/charges. A header row that names no VAT percentage
// can only be placed when there is a single rate; otherwise `unattributed` is
// true and per-rate totals cannot be derived.
export function taxGroups(invoice) {
  const withCategory = taxKeyMode(invoice);
  const groups = new Map();
  let unattributed = false;
  const add = (key, percent, amount) => {
    const group = groups.get(key) || { taxable: 0, tax: 0, percent };
    group.taxable += amount;
    groups.set(key, group);
  };
  for (const line of Array.isArray(invoice.lines) ? invoice.lines : []) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const net = summedLineNet(line, invoice);
    const percent = taxPercentOf(line);
    if (net === null || percent === null || percent < 0 || percent > 100) continue;
    add(taxKey(line, withCategory), percent, net);
  }
  for (const row of Array.isArray(invoice.adjustments) ? invoice.adjustments : []) {
    const delta = signedAdjustment([row], isNegativeInvoice(invoice));
    if (!delta) continue;
    const key = row && typeof row === "object" ? taxKey(row, withCategory) : null;
    if (key !== null && groups.has(key)) add(key, groups.get(key).percent, delta);
    else if (key !== null) add(key, taxPercentOf(row), delta);
    else if (groups.size === 1) add([...groups.keys()][0], [...groups.values()][0].percent, delta);
    else unattributed = true;
  }
  for (const group of groups.values()) {
    group.taxable = roundCents(group.taxable);
    group.tax = roundCents((group.taxable * group.percent) / 100);
  }
  return { groups, unattributed, withCategory };
}
