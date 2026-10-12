// Scrap gold buy price for a buyer (pawn shop, estate buyer, "cash for gold" event): what to offer a seller so the
// lot still pays after the refiner's cut, assay loss, fees, the wait for settlement and a move in the gold price.
// Pure functions, nothing leaves the browser.
//
// Fine gold in a piece = weight x karat/24. The seller's melt value is fine gold at today's spot. The refiner finds
// a little less than you weighed (stones, solder, a generous stamp), pays a percentage of what it recovers, and charges
// a handling fee plus you pay shipping and insurance. If you have not locked the price, the gold price at settlement
// decides what you are paid. The default figures are placeholders, not today's price or a refiner's quote.

export const GRAMS_PER_OZT = 31.1034768;
export const GRAMS_PER_DWT = 1.55517384;

export const DEFAULTS = {
  spot: 3000,          // gold price, dollars per troy ounce of fine gold
  unit: 1,             // weight unit multiplier to grams: 1 = grams, 1.55517384 = pennyweights (dwt)
  i1Karat: 10, i1Weight: 40,
  i2Karat: 14, i2Weight: 85,
  i3Karat: 18, i3Weight: 22,
  i4Karat: 24, i4Weight: 0,
  weightLossPct: 3,    // fine gold the refiner finds below what you tested/weighed, percent
  offerPct: 78,        // what you pay the seller, percent of melt value
  payoutPct: 96,       // refiner pays this share of the fine gold it recovers
  refineFee: 35,       // refiner handling/assay fee per lot, dollars
  shipInsure: 45,      // shipping and insurance per lot, dollars
  handling: 25,        // testing, labour, payout handling per lot, dollars
  daysToSettle: 10,    // days from paying the seller to being paid by the refiner
  annualVolPct: 18,    // typical yearly swing in the gold price, percent
  hedged: 0,           // 1 if the price is locked when you buy (hedge or lock-at-receipt), 0 if you take the price at settlement
  capitalRatePct: 12,  // what your money costs per year while it is tied up, percent
  wantPct: 8,  // profit you want on each dollar paid to the seller, percent
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

// Standard normal CDF (Abramowitz-Stegun 7.1.26 erf approximation).
export function normCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export function lines(o) {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    const karat = o[`i${i}Karat`], w = o[`i${i}Weight`];
    if (!(w > 0)) continue;
    const grams = w * o.unit;
    const fineG = grams * karat / 24;
    out.push({ n: i, karat, grams, fineG, melt: fineG / GRAMS_PER_OZT * o.spot });
  }
  return out;
}

// Economics of one lot at one offer, with the gold price moved by `move` percent between buying and settlement.
export function lot(o, offerPct = o.offerPct, move = 0) {
  const ls = lines(o);
  const fineG = ls.reduce((s, l) => s + l.fineG, 0);
  const grams = ls.reduce((s, l) => s + l.grams, 0);
  const melt = fineG / GRAMS_PER_OZT * o.spot;
  const recoveredG = fineG * (1 - o.weightLossPct / 100);
  const settleSpot = o.hedged ? o.spot : o.spot * (1 + move / 100);
  const refinerGross = recoveredG / GRAMS_PER_OZT * settleSpot * o.payoutPct / 100;
  const refinerNet = refinerGross - o.refineFee - o.shipInsure;
  const paid = melt * offerPct / 100;
  const carry = (paid + o.handling) * o.capitalRatePct / 100 * o.daysToSettle / 365;
  const profit = refinerNet - paid - o.handling - carry;
  return { lines: ls, grams, fineG, melt, recoveredG, refinerGross, refinerNet, paid, carry, profit,
    margin: paid > 0 ? profit / paid * 100 : NaN, paidPerGram: grams > 0 ? paid / grams : NaN };
}

// Highest offer (dollars and percent of melt) that still leaves `targetPct` profit on the money paid out.
export function maxOffer(o, targetPct) {
  const base = lot(o, 0, 0);
  const k = o.capitalRatePct / 100 * o.daysToSettle / 365;
  const room = base.refinerNet - o.handling * (1 + k);
  const dollars = Math.max(0, room / (1 + k + targetPct / 100));
  return { dollars, pct: base.melt > 0 ? dollars / base.melt * 100 : NaN };
}

export function offerLadder(o, steps = [60, 65, 70, 75, 80, 85, 90, 95]) {
  return steps.map((p) => ({ offerPct: p, ...lot(o, p) }));
}

export function spotScenarios(o, moves = [-20, -10, -5, 0, 5, 10]) {
  return moves.map((m) => ({ move: m, ...lot(o, o.offerPct, m) }));
}

// Chance the lot loses money, treating the gold price move over the wait as normal with the typical yearly swing.
export function risk(o) {
  const base = lot(o, o.offerPct, 0);
  const sigma = o.annualVolPct / 100 * Math.sqrt(Math.max(0, o.daysToSettle) / 365) * 100; // percent
  if (o.hedged) return { sigma, breakEvenMove: null, pLoss: base.profit < 0 ? 100 : 0, swing: 0 };
  const sens = base.refinerGross; // dollars of profit per +100% move
  const breakEvenMove = sens > 0 ? -base.profit / sens * 100 : NaN;
  const pLoss = sigma > 0 && Number.isFinite(breakEvenMove) ? normCdf(breakEvenMove / sigma) * 100 : (base.profit < 0 ? 100 : 0);
  return { sigma, breakEvenMove, pLoss, swing: sens * sigma / 100 };
}

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  for (const k of ["spot", "weightLossPct", "offerPct", "payoutPct", "refineFee", "shipInsure", "handling", "daysToSettle", "annualVolPct", "capitalRatePct", "wantPct", "i1Weight", "i2Weight", "i3Weight", "i4Weight"]) {
    if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  if (o.spot <= 0) warnings.push("Enter a gold price above zero.");
  if (!(o.unit > 0)) warnings.push("Pick a weight unit.");
  for (let i = 1; i <= 4; i++) {
    const k = o[`i${i}Karat`];
    if (o[`i${i}Weight`] > 0 && (k <= 0 || k > 24)) warnings.push(`Item ${i}: karat must be between 1 and 24.`);
  }
  if (o.payoutPct > 100) warnings.push("The refiner payout cannot be more than 100% of the fine gold.");
  if (o.offerPct > 100) warnings.push("An offer above 100% of melt loses money before any fee.");
  if (o.weightLossPct > 100) warnings.push("Weight loss cannot be more than 100%.");
  if (warnings.length) return { opts: o, warnings, result: null, ladder: [], moves: [] };
  const base = lot(o);
  if (!base.lines.length) return { opts: o, warnings: ["Enter at least one item with a weight above zero."], result: null, ladder: [], moves: [] };
  const be = maxOffer(o, 0), want = maxOffer(o, o.wantPct);
  const rk = risk(o);
  if (base.profit < 0) warnings.push("At this offer the lot loses money even if the gold price does not move.");
  if (o.offerPct > o.payoutPct) warnings.push("You are offering more than the refiner pays on the fine gold, so every lot loses before fees.");
  if (base.melt > 0 && (o.refineFee + o.shipInsure) / base.melt > 0.05) warnings.push("Refiner and shipping fees are over 5% of this lot's melt value; a small lot may be better held and combined with others.");
  if (o.daysToSettle > 0 && !o.hedged && rk.pLoss > 25 && base.profit >= 0) warnings.push("Without a locked price, a normal-sized price drop while you wait could turn this lot into a loss.");
  const result = { base, breakEven: be, target: want, risk: rk, gap: o.offerPct - want.pct };
  return { opts: o, warnings, result, ladder: offerLadder(o), moves: spotScenarios(o) };
}

export function toCsv(a) {
  if (!a || !a.ladder.length) return "";
  const head = "offer_pct_of_melt,paid_to_seller,refiner_net,profit,margin_on_paid_pct";
  const l = a.ladder.map((r) => [r.offerPct, r.paid.toFixed(2), r.refinerNet.toFixed(2), r.profit.toFixed(2), Number.isFinite(r.margin) ? r.margin.toFixed(2) : ""].join(","));
  const h2 = "gold_price_move_pct,profit_at_current_offer";
  const m = a.moves.map((r) => [r.move, r.profit.toFixed(2)].join(","));
  return [head, ...l, "", h2, ...m].join("\n") + "\n";
}
