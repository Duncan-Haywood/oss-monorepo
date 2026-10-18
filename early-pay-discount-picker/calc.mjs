// Early-pay discount picker. Pure functions, no DOM, no network.
// A supplier offers "2/10 net 30": take 2% off if you pay within 10 days, otherwise pay everything on day 30. Taken alone
// that is a very high annual return on the cash (2/10 net 30 is about 37% a year), so owners know to take it. The problem
// starts when several suppliers offer terms at once and there is not enough cash to pay all of them early: which invoices
// do you pay now? This finds the subset that nets the most after the cost of the cash, checking every subset exactly (up
// to 14 invoices), compares it with the rules of thumb (highest annual rate first, biggest discount first, earliest
// deadline first), says what extra cash would be worth, and re-solves with the cost of cash halved and doubled.
// Model: you pay each chosen invoice on the last day of its discount window instead of on its due day, so the outlay
// (amount less discount) leaves your account `due - discountDays` days sooner. That cash is charged at your cost-of-cash
// rate (simple interest). One cash limit applies to everything paid early.

export const MAX_INVOICES = 14;
export const SHARED_DEFAULTS = { cash: 0, costOfCash: 8 };
export const ITEM_DEFAULTS = { name: "", amount: 0, discountPct: 0, discountDays: "", dueDays: "" };

// Placeholder example figures, not any supplier's terms.
export const EXAMPLE_SHARED = { cash: 15000, costOfCash: 9 };
export const EXAMPLE_ITEMS = [
  { name: "Lumber yard", amount: 12000, discountPct: 2, discountDays: 10, dueDays: 30 },
  { name: "Paint supplier", amount: 6500, discountPct: 1, discountDays: 10, dueDays: 45 },
  { name: "Electrical wholesaler", amount: 9000, discountPct: 2, discountDays: 15, dueDays: 30 },
  { name: "Packaging vendor", amount: 3200, discountPct: 3, discountDays: 7, dueDays: 30 },
  { name: "Tool rental", amount: 1800, discountPct: 0.5, discountDays: 10, dueDays: 20 },
  { name: "Insurance premium", amount: 7000, discountPct: 4, discountDays: 20, dueDays: 60 },
  { name: "Fastener distributor", amount: 2400, discountPct: 2, discountDays: 10, dueDays: 30 },
  { name: "Steel supplier", amount: 14000, discountPct: 2.5, discountDays: 10, dueDays: 30 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const pct = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US") + "%";

export function cleanShared(s = {}) {
  return {
    cash: Math.min(1e9, Math.max(0, num(s.cash, SHARED_DEFAULTS.cash))),
    costOfCash: Math.min(500, Math.max(0, num(s.costOfCash, SHARED_DEFAULTS.costOfCash))),
  };
}

// Benefit of paying one invoice early: the discount kept, less the interest on the cash that leaves `early` days sooner.
export function benefitOf(inv, costOfCashPct) {
  return inv.discount - inv.outlay * (costOfCashPct / 100) * (inv.early / 365);
}

export function cleanItems(items = []) {
  const out = [];
  const warnings = [];
  items.forEach((raw, idx) => {
    const r = raw || {};
    const amount = num(r.amount, 0);
    const name = String(r.name ?? "").trim();
    const label = name || `Invoice ${idx + 1}`;
    if (amount <= 0) {
      if (name) warnings.push(`"${name}" has no amount, so it is left out.`);
      return;
    }
    if (out.length >= MAX_INVOICES) {
      warnings.push(`Only the first ${MAX_INVOICES} invoices are used; "${label}" is left out.`);
      return;
    }
    const d = num(r.discountPct, 0);
    const dd = String(r.discountDays ?? "").trim() === "" ? null : num(r.discountDays, NaN);
    const due = String(r.dueDays ?? "").trim() === "" ? null : num(r.dueDays, NaN);
    if (d <= 0 || d >= 100) { warnings.push(`"${label}" has no usable discount percentage, so it is left out.`); return; }
    if (dd == null || due == null || !Number.isFinite(dd) || !Number.isFinite(due) || dd < 0) {
      warnings.push(`"${label}" needs both the last day to take the discount and the due day, so it is left out.`);
      return;
    }
    if (due <= dd) { warnings.push(`"${label}" is due on or before the discount deadline, so paying early gains nothing and it is left out.`); return; }
    const amt = Math.min(1e9, amount);
    const discount = amt * (d / 100);
    const outlay = amt - discount;
    const early = due - dd;
    // Simple annualised return on the cash: discount / outlay, scaled from `early` days to a year.
    const apr = (discount / outlay) * (365 / early) * 100;
    out.push({ name: label, amount: amt, discountPct: d, discountDays: dd, dueDays: due, early, discount, outlay, apr });
  });
  return { items: out, warnings };
}

const EPS = 1e-6;

// Exact: try every subset (2^14 = 16,384) and keep the best that fits the cash limit.
export function solve(invoices, cash, costOfCashPct) {
  const n = invoices.length;
  const ben = invoices.map((v) => benefitOf(v, costOfCashPct));
  let best = { mask: 0, benefit: 0, used: 0 };
  for (let mask = 1; mask < 1 << n; mask++) {
    let used = 0, total = 0, ok = true;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      if (ben[i] <= 0) { ok = false; break; } // never pay early for a loss
      used += invoices[i].outlay;
      total += ben[i];
      if (used > cash + EPS) { ok = false; break; }
    }
    if (ok && (total > best.benefit + EPS || (Math.abs(total - best.benefit) <= EPS && used < best.used - EPS))) best = { mask, benefit: total, used };
  }
  const chosen = [];
  for (let i = 0; i < n; i++) if (best.mask & (1 << i)) chosen.push(i);
  return { chosen, benefit: best.benefit, used: best.used, ben };
}

function greedy(invoices, cash, costOfCashPct, order) {
  let left = cash, benefit = 0;
  const chosen = [];
  for (const i of order) {
    const b = benefitOf(invoices[i], costOfCashPct);
    if (b > 0 && invoices[i].outlay <= left + EPS) { chosen.push(i); left -= invoices[i].outlay; benefit += b; }
  }
  return { chosen, benefit, used: cash - left };
}

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const { items, warnings } = cleanItems(rawItems);
  if (!items.length) {
    return { ok: false, warnings: [...warnings, "Add at least one invoice with an amount, a discount percentage, a discount deadline and a due day."] };
  }
  if (shared.cash <= 0) return { ok: false, warnings: [...warnings, "Enter the cash you can use for early payments."] };
  const r = shared.costOfCash;
  const idx = items.map((_, i) => i);
  const exact = solve(items, shared.cash, r);
  const rules = [
    { label: "Highest annual rate first", order: [...idx].sort((a, b) => items[b].apr - items[a].apr) },
    { label: "Biggest discount in dollars first", order: [...idx].sort((a, b) => items[b].discount - items[a].discount) },
    { label: "Earliest deadline first", order: [...idx].sort((a, b) => items[a].discountDays - items[b].discountDays) },
    { label: "In the order listed", order: idx },
  ].map((rule) => {
    const g = greedy(items, shared.cash, r, rule.order);
    return { label: rule.label, benefit: g.benefit, used: g.used, count: g.chosen.length, extra: exact.benefit - g.benefit };
  });
  const bestRule = rules.reduce((a, b) => (b.benefit > a.benefit ? b : a));
  const ruleLoss = exact.benefit - bestRule.benefit;
  const chosenSet = new Set(exact.chosen);
  const plan = exact.chosen
    .map((i) => ({ ...items[i], benefit: exact.ben[i] }))
    .sort((a, b) => a.discountDays - b.discountDays);
  const skipped = items.map((v, i) => ({ ...v, benefit: exact.ben[i], i })).filter((v) => !chosenSet.has(v.i)).map((v) => ({
    ...v,
    reason: v.benefit <= 0 ? "the discount is worth less than your cost of cash over the extra days" : "it does not fit in the cash limit alongside better uses of that cash",
  }));
  // What more cash would buy: same invoices, bigger limit.
  const extraLevels = [0.25, 0.5, 1].map((f) => {
    const add = shared.cash * f;
    const s = solve(items, shared.cash + add, r);
    return { add, gain: s.benefit - exact.benefit, count: s.chosen.length };
  });
  // Is the answer fragile to the cost-of-cash figure?
  const rateChecks = [0.5, 2].map((f) => {
    const s = solve(items, shared.cash, r * f);
    return { rate: r * f, benefit: s.benefit, count: s.chosen.length, same: s.chosen.join() === exact.chosen.join() };
  });
  // The cheapest line of credit that still pays: lowest-APR invoice taken in the plan.
  const hurdle = plan.length ? Math.min(...plan.map((p) => p.apr)) : null;
  const allDiscounts = items.reduce((s, v) => s + v.discount, 0);
  return {
    ok: true, warnings, shared, items, plan, skipped, rules, ruleLoss, bestRule, hurdle,
    benefit: exact.benefit, used: exact.used, cashLeft: shared.cash - exact.used,
    discountKept: plan.reduce((s, p) => s + p.discount, 0), allDiscounts, extraLevels, rateChecks,
  };
}

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCsv(a) {
  const rows = [["Invoice", "Pay by day", "Amount to pay now", "Discount kept", "Days paid early", "Annual rate %", "Net benefit after cost of cash"]];
  for (const p of a.plan) rows.push([p.name, p.discountDays, p.outlay.toFixed(2), p.discount.toFixed(2), p.early, p.apr.toFixed(1), p.benefit.toFixed(2)]);
  rows.push([]);
  rows.push(["Skipped", "Reason"]);
  for (const s of a.skipped) rows.push([s.name, s.reason]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
