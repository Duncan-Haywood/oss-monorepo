/**
 * Sell-through and markdown plan for one run: how much of the stock sells at
 * full price, what a markdown ladder recovers, and what is left on the shelf.
 *
 * Demand model (an assumption, not data): at full price the shop sells
 * `weeklyRate` units a week; at a lower price the weekly rate scales by
 * (full price / price) ^ elasticity. Elasticity 2 is a placeholder until the
 * designer has real sales to fit; with 0 a markdown does not move demand.
 * Stock caps every stage. Money per sale comes from `sellingSide`, so tax and
 * fees are taken off each marked-down price, and a sale below landed cost is
 * shown as a loss, not hidden.
 */
import { sellingSide } from "./costing.mjs";

const round2 = v => Math.round(v * 100) / 100;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

/**
 * @param {{landed:number, price:number, quantity:number, weeklyRate:number, fullPriceWeeks:number,
 *   steps?:{offPct:number, weeks:number}[], elasticity?:number, currency?:string, scrapPerUnit?:number}} o
 * scrapPerUnit: what a leftover unit fetches (0 = written off).
 */
export function clearancePlan(o, plan) {
  if (!o || typeof o !== "object") throw new Error("Give the run's cost, price, quantity and weekly sales.");
  const landed = num(o.landed, "Landed cost", 0, 1e6);
  const price = num(o.price, "Price", 0.01, 1e6);
  const quantity = num(o.quantity, "Quantity", 1, 1e7);
  const weeklyRate = num(o.weeklyRate, "Weekly sales at full price", 0, 1e6);
  const fullPriceWeeks = num(o.fullPriceWeeks, "Full-price weeks", 0, 520);
  const elasticity = num(o.elasticity ?? 2, "Elasticity", 0, 6);
  const scrap = num(o.scrapPerUnit ?? 0, "Leftover value", 0, 1e6);
  const steps = o.steps ?? [];
  if (!Array.isArray(steps) || steps.length > 12) throw new Error("Markdown steps must be a list of up to 12.");
  const stages = [{ label: "Full price", offPct: 0, weeks: fullPriceWeeks }];
  for (const s of steps) stages.push({ label: `${num(s?.offPct, "Markdown", 1, 95)}% off`, offPct: s.offPct, weeks: num(s.weeks, "Markdown weeks", 0, 520) });

  let stock = Math.floor(quantity);
  let cum = 0;
  const rows = [];
  for (const st of stages) {
    const p = round2(price * (1 - st.offPct / 100));
    const side = sellingSide({ landed, price: p, quantity }, { ...(plan || {}), marketingBudget: 0 });
    const perSale = side.profitPerSale + landed; // net after tax and fees, before cost
    const rate = weeklyRate * Math.pow(price / p, elasticity);
    const sold = Math.min(stock, Math.floor(rate * st.weeks));
    stock -= sold;
    cum += sold * perSale;
    rows.push({ label: st.label, price: p, weeks: st.weeks, sold, profitPerSale: round2(side.profitPerSale), netCash: round2(sold * perSale), stockLeft: stock });
  }
  const scrapCash = stock * scrap;
  const spent = landed * quantity;
  const total = cum + scrapCash - spent;
  const notes = [];
  if (stock > 0) notes.push(`${stock} of ${quantity} units are still unsold after the ladder: a longer ladder, a deeper cut or a smaller first run.`);
  const lossStage = rows.find(r => r.sold > 0 && r.profitPerSale < 0);
  if (lossStage) notes.push(`Sales at ${lossStage.label} lose money on each unit (${lossStage.profitPerSale} after tax and fees), but may still beat holding the stock.`);
  if (total < 0) notes.push(`The run loses ${round2(-total)} after the whole ladder.`);
  return {
    currency: o.currency || "EUR",
    rows,
    sold: quantity - stock,
    sellThroughPct: Math.round(((quantity - stock) / quantity) * 1000) / 10,
    fullPriceSharePct: Math.round((rows[0].sold / quantity) * 1000) / 10,
    unsold: stock,
    scrapCash: round2(scrapCash),
    totalProfit: round2(total),
    notes,
  };
}
