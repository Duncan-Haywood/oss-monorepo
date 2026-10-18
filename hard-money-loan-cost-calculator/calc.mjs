// Hard money loan cost for a fix-and-flip: compares two lenders on the whole deal, not the headline rate.
// Pure functions, nothing leaves the browser.
//
// Per lender: the purchase advance (percent of price) is funded at closing; the rehab advance (percent of the rehab
// budget) is released in equal draws spread evenly over the rehab period, and interest accrues only on money already
// drawn. Cost = interest (with an optional minimum-interest floor) + points on the whole commitment + flat fees +
// a fee per draw + extension fees if the hold runs past the term. The effective annual rate divides that cost by the
// average balance outstanding, so a 12% loan with 3 points and draw fees shows its real price. A month-by-month scan
// finds the hold length at which the two lenders cost the same. The default figures are placeholders, not quotes.

export const DEFAULTS = {
  purchase: 200000,     // purchase price
  rehab: 60000,         // rehab budget
  arv: 340000,          // after-repair value
  sellPct: 7,           // selling costs, percent of the sale price
  holdingMonthly: 1100, // taxes, insurance, utilities per month while you own it
  holdMonths: 6,        // months from closing to sale
  rehabMonths: 3,       // months over which the rehab draws are released
  // Lender A
  aAdvancePct: 85,      // percent of the purchase price lent
  aRehabPct: 100,       // percent of the rehab budget lent, released in draws
  aRate: 11.5,          // annual interest rate, percent (interest only)
  aPoints: 2,           // origination points, percent of the total commitment
  aFlat: 1500,          // underwriting, processing, doc fees at closing
  aDraws: 3,            // number of rehab draws
  aDrawFee: 150,        // inspection fee per draw
  aMinMonths: 0,        // minimum months of interest on the full commitment
  aTerm: 9,             // loan term in months
  aExtPct: 1,           // extension fee per extension, percent of the commitment
  aExtMonths: 3,        // months added by one extension
  // Lender B
  bAdvancePct: 90,
  bRehabPct: 90,
  bRate: 9.5,
  bPoints: 3.5,
  bFlat: 2500,
  bDraws: 5,
  bDrawFee: 300,
  bMinMonths: 6,
  bTerm: 12,
  bExtPct: 0.5,
  bExtMonths: 3,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

const L = (o, p) => ({
  advancePct: o[p + "AdvancePct"], rehabPct: o[p + "RehabPct"], rate: o[p + "Rate"], points: o[p + "Points"],
  flat: o[p + "Flat"], draws: Math.min(1000, Math.max(1, Math.round(o[p + "Draws"]))), drawFee: o[p + "DrawFee"],
  minMonths: o[p + "MinMonths"], term: o[p + "Term"], extPct: o[p + "ExtPct"], extMonths: o[p + "ExtMonths"],
});

// Cost of one lender for a hold of `months` months.
export function lenderCost(o, p, months = o.holdMonths) {
  const l = L(o, p);
  const purchaseLoan = o.purchase * l.advancePct / 100;
  const rehabLoan = o.rehab * l.rehabPct / 100;
  const commitment = purchaseLoan + rehabLoan;
  const m = Math.max(0, months);
  const monthly = l.rate / 100 / 12;
  // Draw k of n is released at k/n of the rehab period (capped at the hold), so the first draw is not free.
  const spread = Math.min(o.rehabMonths, m);
  let balanceMonths = purchaseLoan * m;
  for (let k = 1; k <= l.draws; k++) {
    const t = spread * k / l.draws;
    balanceMonths += (rehabLoan / l.draws) * Math.max(0, m - t);
  }
  const interestAccrued = balanceMonths * monthly;
  const floor = commitment * monthly * l.minMonths;
  const interest = Math.max(interestAccrued, floor);
  const pointsCost = commitment * l.points / 100;
  const drawFees = l.drawFee * l.draws;
  const extensions = m > l.term && l.extMonths > 0 ? Math.ceil((m - l.term) / l.extMonths) : 0;
  const extensionFees = extensions * commitment * l.extPct / 100;
  const total = interest + pointsCost + l.flat + drawFees + extensionFees;
  const avgBalance = m > 0 ? balanceMonths / m : 0;
  const effectiveApr = avgBalance > 0 && m > 0 ? total / avgBalance / (m / 12) * 100 : 0;
  return {
    purchaseLoan, rehabLoan, commitment, interest, floorApplied: floor > interestAccrued, pointsCost, flat: l.flat,
    drawFees, extensions, extensionFees, total, avgBalance, effectiveApr,
    cashIn: o.purchase - purchaseLoan + (o.rehab - rehabLoan) + pointsCost + l.flat,
  };
}

// Profit and return on the cash you put in, for one lender at a hold length.
export function deal(o, p, months = o.holdMonths) {
  const c = lenderCost(o, p, months);
  const sale = o.arv * (1 - o.sellPct / 100);
  const holding = o.holdingMonthly * Math.max(0, months);
  const profit = sale - o.purchase - o.rehab - holding - c.total;
  const cash = c.cashIn; // cash at closing and for the unfunded rehab; holding costs are paid as they come and reduce profit
  const roi = cash > 0 ? profit / cash * 100 : NaN;
  const annualized = cash > 0 && months > 0 ? roi * 12 / months : NaN;
  const ltarv = o.arv > 0 ? c.commitment / o.arv * 100 : NaN;
  return { ...c, sale, holding, profit, cash, roi, annualized, ltarv };
}

// First hold length (whole months, 1..36) at which the cheaper lender changes, or null if one is always cheaper.
export function crossover(o) {
  let prev = null;
  for (let m = 1; m <= 36; m++) {
    const d = lenderCost(o, "a", m).total - lenderCost(o, "b", m).total;
    const s = d === 0 ? 0 : d > 0 ? 1 : -1;
    if (prev !== null && s !== prev && s !== 0 && prev !== 0) return { month: m, cheaperAfter: s > 0 ? "B" : "A" };
    if (s !== 0) prev = s;
  }
  return null;
}

export function sensitivity(o, months = [3, 4, 6, 8, 10, 12, 15]) {
  return months.map((m) => {
    const a = deal(o, "a", m), b = deal(o, "b", m);
    return { months: m, aCost: a.total, bCost: b.total, aProfit: a.profit, bProfit: b.profit, cheaper: a.total <= b.total ? "A" : "B" };
  });
}

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  const nonneg = ["purchase", "rehab", "arv", "holdingMonthly", "holdMonths", "rehabMonths",
    ...["a", "b"].flatMap((p) => ["Rate", "Points", "Flat", "DrawFee", "MinMonths", "Term", "ExtPct", "ExtMonths"].map((s) => p + s))];
  for (const k of nonneg) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  for (const p of ["a", "b"]) {
    if (o[p + "AdvancePct"] < 0 || o[p + "AdvancePct"] > 100) warnings.push(`Lender ${p.toUpperCase()}: purchase advance must be 0-100%.`);
    if (o[p + "RehabPct"] < 0 || o[p + "RehabPct"] > 100) warnings.push(`Lender ${p.toUpperCase()}: rehab advance must be 0-100%.`);
  }
  if (o.purchase <= 0) warnings.push("Enter a purchase price above zero.");
  if (o.holdMonths <= 0) warnings.push("Enter a hold of at least one month.");
  if (warnings.length) return { opts: o, warnings, result: null, rows: [] };
  const a = deal(o, "a"), b = deal(o, "b");
  for (const [p, d] of [["A", a], ["B", b]]) {
    if (d.ltarv > 75) warnings.push(`Lender ${p}: the loan is ${pct(d.ltarv)} of the after-repair value. Most lenders cap this near 65-75%; check the term sheet.`);
    if (o.holdMonths > (p === "A" ? o.aTerm : o.bTerm)) warnings.push(`Lender ${p}: your hold runs past the ${p === "A" ? o.aTerm : o.bTerm}-month term, so extension fees are included.`);
  }
  if (a.profit < 0 && b.profit < 0) warnings.push("The deal loses money with either lender at these figures.");
  const better = a.profit >= b.profit ? "A" : "B";
  const result = { a, b, better, profitGap: Math.abs(a.profit - b.profit), crossover: crossover(o) };
  return { opts: o, warnings, result, rows: sensitivity(o) };
}

export function toCsv(a) {
  if (!a || !a.rows.length) return "";
  const head = "months,lender_a_finance_cost,lender_b_finance_cost,lender_a_profit,lender_b_profit,cheaper";
  const rows = a.rows.map((r) => [r.months, r.aCost.toFixed(2), r.bCost.toFixed(2), r.aProfit.toFixed(2), r.bProfit.toFixed(2), r.cheaper].join(","));
  return [head, ...rows].join("\n") + "\n";
}
