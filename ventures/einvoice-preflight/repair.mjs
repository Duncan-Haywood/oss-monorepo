// Repair the arithmetic of a JSON invoice, and nothing else.
//
// Fixes only what is fully determined by the invoice's own inputs: line nets
// (quantity x unit price), the net, tax, gross and amount-due totals, and a
// lower-case currency code. It never picks a tax rate, a date, an identifier,
// a bank account or a party; those findings stay in `remaining` for a person.
// Every change is logged with its path, old value and new value, and the
// repaired invoice is re-checked so the caller sees what is still wrong.
//
// The checker is the one source of truth for the arithmetic: a value is
// rewritten only when checkInvoice flags it, and the new value comes from the
// same helpers the checker uses (linenet.mjs). An earlier version recomputed
// everything its own way (unit price rounded to cents first, no price base
// quantity, VAT per line instead of per rate) and so turned valid invoices
// into invalid ones: 1,000 x 0.125 became 130.00 instead of 125.00 (red team,
// 2026-11-14).

import { headerAdjustmentNetDelta } from "./adjustment.mjs";
import { checkInvoice, roundHalfUpToCents } from "./checks.mjs";
import { expectedLineNet, flatTaxTotal, isNegativeInvoice, summedLineNet, taxGroups, taxPercentOf } from "./linenet.mjs";

function num(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(n) ? n : null;
}

const cents = (value) => {
  const n = num(value);
  return n === null ? null : roundHalfUpToCents(n);
};

const flagged = (invoice, rules, path) => checkInvoice(invoice).some((e) => rules.includes(e.rule) && e.path === path);

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
  let computable = lines.length > 0;
  const lineFlags = new Set(checkInvoice(fixed).filter((e) => e.rule === "INV-012").map((e) => e.path));
  lines.forEach((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) { computable = false; return; }
    const quantity = num(line.quantity);
    const price = num(line.unit_price);
    const rate = taxPercentOf(line);
    if (quantity === null || quantity <= 0 || price === null || price < 0) { computable = false; return; }
    const path = `/lines/${index}/net`;
    const lineNet = expectedLineNet(line);
    if (lineFlags.has(path) && lineNet !== null) {
      set(line, "net", path, lineNet, "Line net is quantity times unit price (per price base quantity, after line allowances and charges).");
    }
    if (rate === null || rate < 0 || rate > 100) computable = false;
    // An allowance larger than the line leaves a negative net on a positive line, which
    // the totals cannot carry (no negative tax on an ordinary invoice): a person decides.
    if (lineNet === null || (lineNet < 0 && !isNegativeInvoice(fixed))) computable = false;
  });

  if (computable) {
    const totals = fixed.totals && typeof fixed.totals === "object" && !Array.isArray(fixed.totals) ? fixed.totals : (fixed.totals = {});
    let net = roundHalfUpToCents(lines.reduce((sum, line) => sum + summedLineNet(line, fixed), 0) + headerAdjustmentNetDelta(fixed));
    if (net < 0 && !isNegativeInvoice(fixed)) net = 0;
    if (flagged(fixed, ["INV-013", "INV-014"], "/totals/net")) {
      set(totals, "net", "/totals/net", net, "Net total is the sum of line nets after header allowances and charges.");
    }
    // VAT per rate on the summed taxable amount (EN 16931 BR-CO-17), as the checker
    // works it; a header allowance it cannot place in a rate leaves the tax alone.
    const groups = taxGroups(fixed);
    const flat = flatTaxTotal(fixed);
    if (!groups.unattributed && flat !== null && flagged(fixed, ["INV-015", "INV-018"], "/totals/tax")) {
      let tax = flat;
      for (const group of groups.groups.values()) tax = roundHalfUpToCents(tax + group.tax);
      set(totals, "tax", "/totals/tax", tax, "Tax total is each rate applied to that rate's summed taxable amount.");
    }
    if (flagged(fixed, ["INV-016", "INV-017"], "/totals/gross")) {
      const stated = cents(totals.net);
      const tax = cents(totals.tax) ?? 0;
      if (stated !== null) set(totals, "gross", "/totals/gross", roundHalfUpToCents(stated + tax), "Gross is net plus tax.");
    }
    const gross = cents(totals.gross);
    const prepaid = totals.prepaid === undefined || totals.prepaid === null || totals.prepaid === "" ? 0 : cents(totals.prepaid);
    const rounding = totals.rounding === undefined || totals.rounding === null || totals.rounding === "" ? 0 : cents(totals.rounding);
    if ("due" in totals && totals.due !== null && totals.due !== "" && gross !== null && prepaid !== null && prepaid >= 0
        && rounding !== null && flagged(fixed, ["INV-029"], "/totals/due")) {
      set(totals, "due", "/totals/due", Math.max(0, roundHalfUpToCents(gross - prepaid + rounding)), "Amount due is gross minus prepaid plus rounding.");
    }
  }

  const remaining = checkInvoice(fixed);
  return { invoice: fixed, changes, before, remaining, repaired: changes.length > 0 };
}
