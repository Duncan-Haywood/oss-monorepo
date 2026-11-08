/**
 * Quality tiers: one design costed at several fabric grades.
 *
 * The designer's second interview asked for pricing tiers that change fabric
 * quality. Each tier names a fabric from the supplier sheet; everything else in
 * the design (decoration, quantity, garment) stays fixed. A tier's shelf price
 * is either typed or solved from the target margin (sellingSide's
 * priceForTargetMargin), and the ladder reports landed cost, margin, break-even
 * and the step up in price per step up in cost, so a "best" tier that costs
 * 6 more and sells for 4 more shows up as a loss of margin.
 *
 * Inputs are the designer's own sheet; no market data and no demand model
 * (whether anyone pays the higher price is a test, not a formula here).
 */
import { unitCost, sellingSide, DEFAULT_PLAN } from "./costing.mjs";

const round2 = v => Math.round(v * 100) / 100;

/**
 * tiers: [{ name, fabric, price? }]. Tiers whose fabric the sheet cannot price
 * are returned with an error instead of throwing, so one gap does not hide the rest.
 */
export function tierLadder(design, sheet, tiers, plan = DEFAULT_PLAN) {
  const rows = tiers.map(t => {
    try {
      const d = { ...design, fabric: t.fabric };
      const cost = unitCost(d, sheet);
      const target = sellingSide({ landed: cost.landed, price: 1, quantity: design.quantity, moq: sheet.moq, currency: sheet.currency }, plan).priceForTargetMargin;
      const price = t.price != null && Number.isFinite(t.price) ? t.price : target;
      const sell = price != null ? sellingSide({ landed: cost.landed, price, quantity: design.quantity, moq: sheet.moq, currency: sheet.currency }, plan) : null;
      return { name: t.name, fabric: t.fabric, landed: cost.landed, fabricCost: cost.lines[0].value, priceForTarget: target, priced: price != null && t.price != null, price, sell, error: null };
    } catch (e) {
      return { name: t.name, fabric: t.fabric, error: e.message };
    }
  });
  const ok = rows.filter(r => !r.error);
  ok.forEach((r, i) => {
    const prev = ok[i - 1];
    r.stepCost = prev ? round2(r.landed - prev.landed) : null;
    r.stepPrice = prev && r.price != null && prev.price != null ? round2(r.price - prev.price) : null;
    r.stepProfit = prev && r.sell && prev.sell ? round2(r.sell.profitPerSale - prev.sell.profitPerSale) : null;
  });
  const notes = [];
  ok.forEach(r => {
    if (r.stepProfit != null && r.stepProfit < 0) notes.push(`${r.name}: costs ${r.stepCost} more than the tier before but earns ${-r.stepProfit} less per sale at ${r.price}. Raise its price by at least ${round2(-r.stepProfit / ((1 - (plan.paymentFeePct ?? DEFAULT_PLAN.paymentFeePct) / 100 - (plan.channelFeePct ?? 0) / 100) || 1))} or drop it.`);
    if (r.sell && r.sell.breakEvenUnits != null && r.sell.breakEvenUnits > r.sell.sellableUnits) notes.push(`${r.name}: break-even needs ${r.sell.breakEvenUnits} sales, more than the ${r.sell.sellableUnits} the run is expected to sell.`);
  });
  rows.filter(r => r.error).forEach(r => notes.push(`${r.name}: ${r.error}`));
  return { rows, notes };
}

/** Spreadsheet-safe CSV of a ladder. */
export function ladderCsv(ladder) {
  const safe = s => { const t = String(s ?? ""); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
  const q = s => `"${safe(s).replace(/"/g, '""')}"`;
  const lines = [["tier", "fabric", "landed", "price", "profit_per_sale", "margin_pct", "break_even_units", "step_cost", "step_price"].join(",")];
  for (const r of ladder.rows) {
    if (r.error) { lines.push([q(r.name), q(r.fabric), "", "", "", "", "", "", ""].join(",")); continue; }
    lines.push([q(r.name), q(r.fabric), r.landed, r.price ?? "", r.sell?.profitPerSale ?? "", r.sell?.marginPct ?? "", r.sell?.breakEvenUnits ?? "", r.stepCost ?? "", r.stepPrice ?? ""].join(","));
  }
  return lines.join("\n") + "\n";
}
