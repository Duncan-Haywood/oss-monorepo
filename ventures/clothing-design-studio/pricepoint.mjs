/**
 * What shelf price earns the most? A constant-elasticity demand curve.
 *
 * Demand at price p is  Q(p) = Q0 * (p / P0)^(-e)  where (P0, Q0) is one
 * observed point (a price you sold at and how many you sold) and e is the
 * price elasticity: the percent fall in sales per percent rise in price.
 * e can be typed, or estimated from a second observed point (a price test).
 *
 * Profit per piece is  p/(1+vat) * (1 - fee) - landed  (VAT is not yours;
 * fees are taken on what the customer pays net of VAT here, a simplification
 * stated on the page). For e > 1 and no fixed cost the profit-maximising
 * price has a closed form,  p* = e/(e-1) * landed / ((1-fee)/(1+vat)).
 * With e <= 1 the model says "raise the price for ever", which is a sign
 * the curve is wrong that far out, so the search is capped at `maxMultiple`
 * times the observed price and the answer is flagged.
 *
 * What it is not: a forecast. Two points do not fix a curve, real demand has
 * price thresholds (a 49.99 vs 50 step) and the guess about e moves the
 * answer a lot, which `sensitivity` shows. Prices are typed, not supplier's.
 */
const round2 = v => Math.round(v * 100) / 100;
const need = (v, name, lo, hi) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be a number from ${lo} to ${hi}.`);
  return v;
};

/** Elasticity from two observed (price, sales) points. Returns a positive number when sales fall as price rises. */
export function elasticityFrom(p1, q1, p2, q2) {
  need(p1, "price 1", 0.01, 1e6); need(p2, "price 2", 0.01, 1e6);
  need(q1, "sales 1", 0.01, 1e9); need(q2, "sales 2", 0.01, 1e9);
  if (p1 === p2) throw new Error("The two prices must differ.");
  return -Math.log(q2 / q1) / Math.log(p2 / p1);
}

/** Profit and sales at one price. */
export function atPrice(price, { refPrice, refSales, elasticity, landed, feePct = 3, vatPct = 0, fixed = 0 }) {
  need(price, "price", 0.01, 1e6);
  const q = refSales * Math.pow(price / refPrice, -elasticity);
  const net = price / (1 + vatPct / 100) * (1 - feePct / 100);
  const perPiece = net - landed;
  return { price, sales: q, perPiece: round2(perPiece), revenue: round2(q * price / (1 + vatPct / 100)), profit: round2(q * perPiece - fixed) };
}

/**
 * Best price by scan over [landed .. maxMultiple x refPrice], plus a table of
 * nearby prices. `endings` snaps to prices ending in .99 / .95 / whole.
 */
export function bestPrice(inp) {
  const { refPrice, refSales, elasticity, landed, feePct = 3, vatPct = 0, fixed = 0, maxMultiple = 3 } = inp;
  need(refPrice, "reference price", 0.01, 1e6); need(refSales, "reference sales", 0.01, 1e9);
  need(elasticity, "elasticity", 0, 20); need(landed, "landed cost", 0, 1e6);
  need(feePct, "fees %", 0, 99); need(vatPct, "VAT %", 0, 60); need(fixed, "fixed cost", 0, 1e9); need(maxMultiple, "search cap", 1.1, 10);
  const keep = (1 - feePct / 100) / (1 + vatPct / 100);
  const floor = landed / keep;                       // price at which a piece just covers itself
  const hi = refPrice * maxMultiple;
  const notes = [];
  let closed = null;
  if (elasticity > 1) closed = elasticity / (elasticity - 1) * floor;
  else notes.push(`Elasticity ${round2(elasticity)} is 1 or below: on this curve a higher price always earns more, so the answer is just the cap of ${round2(hi)}. Real buyers leave at some price; treat it as "test higher", not a result.`);
  // scan in 0.5% steps
  let best = null;
  for (let p = Math.max(0.01, floor); p <= hi + 1e-9; p *= 1.005) {
    const r = atPrice(p, { refPrice, refSales, elasticity, landed, feePct, vatPct, fixed });
    if (!best || r.profit > best.profit) best = r;
  }
  if (!best) throw new Error("No price in range covers its cost.");
  if (closed && closed > hi) notes.push(`The formula's best price ${round2(closed)} is past the search cap of ${round2(hi)}; raise the cap to see it, but that is far from any price you tested.`);
  if (floor > refPrice) notes.push(`At the price you tested (${refPrice}) each piece loses money (cost floor ${round2(floor)}).`);
  const far = best.price / refPrice;
  if (far > 1.5 || far < 0.67) notes.push(`The best price is ${round2(far)}x the one you observed. A curve fitted near ${refPrice} is a weak guide that far away: test a price in between first.`);
  const ref = atPrice(refPrice, { refPrice, refSales, elasticity, landed, feePct, vatPct, fixed });
  const table = [0.8, 0.9, 1, 1.1, 1.25, 1.5].map(m => atPrice(round2(refPrice * m), { refPrice, refSales, elasticity, landed, feePct, vatPct, fixed }));
  return { best: { ...best, price: round2(best.price), sales: Math.round(best.sales * 10) / 10 }, atReference: ref, costFloor: round2(floor), closedForm: closed ? round2(closed) : null, table, notes };
}

/** The best price for a range of elasticities: how much the guess matters. */
export function sensitivity(inp, elasticities = [1.2, 1.5, 2, 2.5, 3, 4]) {
  return elasticities.map(e => { const r = bestPrice({ ...inp, elasticity: e }); return { elasticity: e, price: r.best.price, profit: r.best.profit, sales: r.best.sales }; });
}

/** Nearest price ending (.99, .95 or whole) at or below the target, so a result can be put on a shelf. */
export function snap(price, ending = ".99") {
  need(price, "price", 1, 1e6);
  if (ending === "whole") return Math.round(price);
  const e = ending === ".95" ? 0.95 : 0.99;
  const base = Math.floor(price - e) + e;
  return round2(base < 1 ? e : (base > price + 1e-9 ? base - 1 : base));
}

const defuse = s => /^[=+\-@\t\r]/.test(String(s)) ? "'" + s : String(s);
export function priceCsv(r) {
  return ["price,sales,profit_per_piece,revenue_ex_vat,profit", ...r.table.map(t => [t.price, Math.round(t.sales * 10) / 10, t.perPiece, t.revenue, t.profit].map(defuse).join(","))].join("\n") + "\n";
}
