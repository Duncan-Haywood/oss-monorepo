// @ts-check
// Price sensitivity: what a swing in one section's prices (lumber, sheathing, labor...) does to the
// cost total and the bid. Pure function over a budget() result: it re-runs the budget's own stacking
// (tax on materials, contingency on materials plus tax, then overhead, then profit) on scaled
// section subtotals, so a 0% shock reproduces the budget exactly. Unpriced lines stay out, as in the
// budget. Nothing here is a forecast; the swing size is yours.
const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;

/**
 * Cost total and bid for the budget's section subtotals scaled by `factors` (section name -> multiplier).
 * @param {any} b budget() result
 * @param {Record<string, number>} [factors]
 */
export function restack(b, factors = {}) {
  let materials = 0, labor = 0, allow = 0;
  for (const s of b.sections) {
    const v = s.subtotal * (factors[s.name] ?? 1);
    if (s.name === "Labor") labor += v; else if (s.name === "Allowances") allow += v; else materials += v;
  }
  const tax = materials * (b.taxRate || 0), cont = (materials + tax) * (b.contingencyRate || 0);
  const total = materials + tax + cont + labor + allow;
  const overhead = total * (b.overheadRate || 0), profit = (total + overhead) * (b.profitRate || 0);
  return { total: r2(total), bid: r2(total + overhead + profit) };
}

/**
 * Swing of each section at +/- `pct` percent, largest first, and the rise in that section alone
 * that a fixed bid price can absorb before the profit is gone (overhead and profit held in dollars).
 * @param {any} b budget() result
 * @param {number} [pct] shock size in percent, 1 to 100
 */
export function sensitivity(b, pct = 10) {
  if (!b || !Array.isArray(b.sections)) throw new Error("sensitivity needs a budget() result");
  if (!(pct >= 1 && pct <= 100)) throw new Error("The price swing must be between 1 and 100 percent.");
  const base = restack(b);
  const rows = b.sections.filter((/** @type {any} */ s) => s.subtotal > 0).map((/** @type {any} */ s) => {
    const up = restack(b, { [s.name]: 1 + pct / 100 }), down = restack(b, { [s.name]: 1 - pct / 100 });
    const costPerPct = (up.total - base.total) / pct; // cost dollars per 1% rise in this section
    const absorb = b.profit > 0 && costPerPct > 0 ? r2(b.profit / costPerPct) : null;
    return { section: s.name, subtotal: s.subtotal, bidUp: r2(up.bid - base.bid), bidDown: r2(down.bid - base.bid), costUp: r2(up.total - base.total),
      bidUpPct: base.bid > 0 ? r2((100 * (up.bid - base.bid)) / base.bid) : 0, profitAbsorbsPct: absorb };
  }).sort((/** @type {any} */ x, /** @type {any} */ y) => y.bidUp - x.bidUp);
  const all = Object.fromEntries(b.sections.map((/** @type {any} */ s) => [s.name, 1 + pct / 100]));
  return { pct, total: base.total, bid: base.bid, profit: b.profit, rows, allUp: restack(b, all), unpriced: b.unpriced || [] };
}

/** @param {ReturnType<typeof sensitivity>} s */
export function sensitivityText(s) {
  const out = [`  Cost ${s.total.toFixed(2)}, bid ${s.bid.toFixed(2)}. Each section moved alone by +/-${s.pct}% (tax, contingency, overhead and profit restacked as in the budget):`];
  for (const r of s.rows) {
    out.push(`    ${r.section.padEnd(14)} subtotal ${r.subtotal.toFixed(2).padStart(10)}  bid ${r.bidUp >= 0 ? "+" : ""}${r.bidUp.toFixed(2)} / ${r.bidDown.toFixed(2)} (${r.bidUpPct}% up)` + (r.profitAbsorbsPct != null ? `; at a fixed bid the profit is gone after a ${r.profitAbsorbsPct}% rise` : ""));
  }
  out.push(`  Everything +${s.pct}% together: cost ${s.allUp.total.toFixed(2)}, bid ${s.allUp.bid.toFixed(2)}.`);
  if (s.unpriced.length) out.push(`  Partial: ${s.unpriced.length} unpriced line(s) are left out, as in the budget.`);
  out.push("  A what-if over your own prices, not a forecast; the profit break-even holds overhead and profit in dollars.");
  return out;
}
