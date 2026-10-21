// Repair the arithmetic of a JSON invoice, and nothing else.
//
// Fixes only what is fully determined by the invoice's own inputs: line nets
// (quantity x unit price), the net, tax, gross and amount-due totals, and a
// lower-case currency code. It never picks a tax rate, a date, an identifier,
// a bank account or a party; those findings stay in `remaining` for a person.
// Every change is logged with its path, old value and new value, and the
// repaired invoice is re-checked so the caller sees what is still wrong.

import { headerAdjustmentNetDelta } from "./adjustment.mjs";
import { checkInvoice, roundHalfUpToCents } from "./checks.mjs";

function num(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(n) ? n : null;
}

const cents = (value) => {
  const n = num(value);
  return n === null ? null : roundHalfUpToCents(n);
};

export function repairInvoice(invoice) {
  const before = checkInvoice(invoice);
  if (invoice === null || typeof invoice !== "object" || Array.isArray(invoice)) {
    return { invoice, changes: [], before, remaining: before, repaired: false };
  }
  const fixed = JSON.parse(JSON.stringify(invoice));
  const changes = [];
  const set = (target, key, path, value, reason) => {
    if (target[key] === value) return;
    changes.push({ path, from: target[key] ?? null, to: value, reason });
    target[key] = value;
  };

  if (typeof fixed.currency === "string" && /^[A-Za-z]{3}$/.test(fixed.currency.trim())) {
    set(fixed, "currency", "/currency", fixed.currency.trim().toUpperCase(), "Currency codes are upper case.");
  }

  const lines = Array.isArray(fixed.lines) ? fixed.lines : [];
  let net = 0;
  let tax = 0;
  let computable = lines.length > 0;
  lines.forEach((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) { computable = false; return; }
    const quantity = num(line.quantity);
    const price = cents(line.unit_price);
    const rate = num(line.tax_percent);
    if (quantity === null || quantity <= 0 || price === null || price < 0) { computable = false; return; }
    const lineNet = roundHalfUpToCents(quantity * price);
    set(line, "net", `/lines/${index}/net`, lineNet, "Line net is quantity times unit price.");
    net = roundHalfUpToCents(net + lineNet);
    if (rate === null || rate < 0 || rate > 100) { computable = false; return; }
    tax = roundHalfUpToCents(tax + roundHalfUpToCents((lineNet * rate) / 100));
  });

  if (computable) {
    net = Math.max(0, roundHalfUpToCents(net + headerAdjustmentNetDelta(fixed)));
    const totals = fixed.totals && typeof fixed.totals === "object" && !Array.isArray(fixed.totals) ? fixed.totals : (fixed.totals = {});
    const gross = roundHalfUpToCents(net + tax);
    set(totals, "net", "/totals/net", net, "Net total is the sum of line nets after header allowances and charges.");
    set(totals, "tax", "/totals/tax", tax, "Tax total is the sum of per-line tax at each line's own percentage.");
    set(totals, "gross", "/totals/gross", gross, "Gross is net plus tax.");
    const prepaid = totals.prepaid === undefined || totals.prepaid === null || totals.prepaid === "" ? 0 : cents(totals.prepaid);
    if ("due" in totals && totals.due !== null && totals.due !== "" && prepaid !== null && prepaid >= 0) {
      set(totals, "due", "/totals/due", Math.max(0, roundHalfUpToCents(gross - prepaid)), "Amount due is gross minus prepaid.");
    }
  }

  const remaining = checkInvoice(fixed);
  return { invoice: fixed, changes, before, remaining, repaired: changes.length > 0 };
}
