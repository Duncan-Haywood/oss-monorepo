// Line and per-rate tax arithmetic shared by checks.mjs and breakdown.mjs,
// following EN 16931: line net = quantity x (price / price base quantity)
// + line charges - line allowances, rounded to cents; VAT is worked out per
// rate on the summed taxable amount, not per line. Mirrors
// src/einvoice_preflight/linenet.py.
import { parseDecimal } from "./numbers.mjs";

// numbers.mjs: the same reading as the CLI (no 0x64, no 1e400).
const parseNumber = parseDecimal;

export function roundCents(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(value) * 100).toPrecision(12)))) / 100;
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
  // Line allowances and charges are summed with their sign: a credit line may carry
  // a negative charge (OpenPeppol's PINT A-NZ negative invoice, line 2:
  // -4 x 400/2 - 200 charge + 100 allowance = -900.00).
  return roundCents((quantity * price) / base + signedAdjustment(line.adjustments, true));
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
//
// A stated net is summed at the precision it is stated in, and only the sum is
// rounded: PINT Oman's lines carry baisa (0.047 OMR) under two-decimal totals, so
// ten of them make 0.47, not 10 x 0.05 = 0.50 (OpenPeppol's "baisa gap" examples,
// eval/phive-corpus.mjs, 2026-11-12). EN 16931 lines have two decimals (BR-DEC-23),
// where both readings agree.
export function summedLineNet(line, invoice = {}) {
  const stated = parseNumber(line.net);
  const parsed = typeof invoice.source_format === "string";
  return stated === null || !parsed ? expectedLineNet(line) : stated;
}

// A line's own VAT amount (PINT Oman's BTOM-016, cac:ItemPriceExtension/cac:TaxTotal),
// when the file states one that agrees with net x rate to within a cent. Oman's
// category tax is the sum of these (ALIGNED-IBRP-S-09-OM), which can differ from the
// rate applied to the summed taxable amount: thirty lines of 0.047 OMR at 5% state
// 0.002 each, 0.06 in all, where 1.41 x 5% is 0.07. null when the line states none.
export function statedLineTax(line, net, percent) {
  const stated = parseNumber(line && line.tax_amount);
  if (stated === null || net === null || percent === null) return null;
  return Math.abs(stated - (net * percent) / 100) < 0.01 + 1e-9 ? stated : null;
}

// E, Z, AE, K and G must carry 0 (EN 16931 BR-E-05, BR-Z-05, BR-AE-05, BR-IC-05, BR-G-05),
// and PINT (UAE, Oman) leaves BT-119 out on them: a missing one reads as 0 as well; the
// official sets still flag a missing element where their profile requires it.
const NO_RATE_CATEGORIES = new Set(["O", "E", "Z", "AE", "K", "G"]);

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
  // lineTax: the sum of the lines' own stated VAT amounts, kept only while every line
  // in the group states one and no header allowance or charge falls in it.
  const add = (key, percent, amount, lineTax = null) => {
    const group = groups.get(key) || { taxable: 0, tax: 0, percent, lineTax: 0, lineTaxAll: true };
    group.taxable += amount;
    if (lineTax === null) group.lineTaxAll = false;
    else group.lineTax += lineTax;
    groups.set(key, group);
  };
  for (const line of Array.isArray(invoice.lines) ? invoice.lines : []) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const net = summedLineNet(line, invoice);
    const percent = taxPercentOf(line);
    if (net === null || percent === null || percent < 0 || percent > 100) continue;
    add(taxKey(line, withCategory), percent, net, statedLineTax(line, net, percent));
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
    group.lineTax = group.lineTaxAll ? roundCents(group.lineTax) : null;
    delete group.lineTaxAll;
  }
  return { groups, unattributed, withCategory };
}
