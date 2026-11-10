/**
 * What does it cost to borrow for a factory run? A small brand is offered a
 * "factor rate" cash advance (pay back 1.3 times what you got), a term loan
 * with a fee, a credit card, or a supplier that lets you pay late and skip an
 * early-payment discount. The quoted number is rarely comparable: a factor
 * rate is not an interest rate, and a fee comes out of the money you receive.
 * This puts every offer on one scale, the yearly rate that makes the money
 * you receive equal the money you repay (an internal rate of return on
 * monthly cash flows, found by bisection).
 *
 *   factor   receive A, repay A x factor in equal monthly parts over N months
 *   loan     receive A less fee%, repay the level payment for APR/12 over N
 *            months (a card works the same way: type its APR and any fee)
 *   deferral pay later instead of taking a d% discount for paying in D days:
 *            cost = d / (1 - d) over (N - D) days, compounded over a year
 *
 * Arithmetic on typed terms, not a quote. It ignores late fees, prepayment
 * rules, daily-sales repayment (a share of sales stretches or shortens the
 * term), personal guarantees and tax; read the contract's own total.
 */
const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

/** Monthly rate i with sum cf[t] / (1+i)^t = 0, cf[0] > 0 received, rest negative. */
export function monthlyRate(cf) {
  const npv = i => cf.reduce((s, c, t) => s + c / Math.pow(1 + i, t), 0);
  if (npv(0) >= 0) return 0; // repays no more than received
  let lo = 0, hi = 1;
  while (npv(hi) < 0 && hi < 1e6) hi *= 2;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

function levelPayment(A, aprPct, n) {
  const i = aprPct / 1200;
  return i === 0 ? A / n : (A * i) / (1 - Math.pow(1 + i, -n));
}

/** @param {{name?:string, kind:"factor"|"loan"|"deferral", [k:string]:any}} opt  @param {number} A amount needed */
export function optionCost(opt, A) {
  const name = String(opt?.name || opt?.kind || "Option");
  if (!opt || typeof opt !== "object") throw new Error("An option needs a kind.");
  if (opt.kind === "deferral") {
    const d = num(opt.discountPct, `${name}: discount percent`, 0.01, 50) / 100;
    const D = num(opt.discountDays, `${name}: discount days`, 0, 365), N = num(opt.netDays, `${name}: days to pay`, 1, 730);
    if (N <= D) throw new Error(`${name}: days to pay must be more than the discount days.`);
    const per = d / (1 - d), days = N - D;
    return { name, kind: "deferral", received: r2(A), repaid: r2(A * (1 + per)), cost: r2(A * per), months: r1(days / 30.4375),
      nominalAprPct: r1(per * 365 / days * 100), effectiveAprPct: r1((Math.pow(1 + per, 365 / days) - 1) * 100) };
  }
  let cf;
  if (opt.kind === "factor") {
    const f = num(opt.factor, `${name}: factor rate`, 1, 3), n = Math.round(num(opt.months, `${name}: months`, 1, 60));
    cf = [A, ...Array(n).fill(-(A * f) / n)];
  } else if (opt.kind === "loan") {
    const apr = num(opt.aprPct ?? 0, `${name}: APR percent`, 0, 500), n = Math.round(num(opt.months, `${name}: months`, 1, 120));
    const fee = num(opt.feePct ?? 0, `${name}: fee percent`, 0, 50) / 100;
    cf = [A * (1 - fee), ...Array(n).fill(-levelPayment(A, apr, n))];
  } else throw new Error(`${name}: kind must be factor, loan or deferral.`);
  const i = monthlyRate(cf), repaid = -cf.slice(1).reduce((s, c) => s + c, 0);
  return { name, kind: opt.kind, received: r2(cf[0]), repaid: r2(repaid), cost: r2(repaid - cf[0]), months: cf.length - 1,
    nominalAprPct: r1(i * 1200), effectiveAprPct: r1((Math.pow(1 + i, 12) - 1) * 100) };
}

/** @param {{amount:number, pieces?:number, profitPerPiece?:number, options:object[]}} o */
export function compareFinancing(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.options) || !o.options.length) return { error: "Give the amount you need and at least one offer." };
  try {
    const A = num(o.amount, "Amount needed", 1, 1e9);
    const pieces = o.pieces == null ? null : num(o.pieces, "Pieces in the run", 1, 1e7);
    const profit = o.profitPerPiece == null ? null : num(o.profitPerPiece, "Profit per piece before financing", -1e6, 1e6);
    const rows = o.options.map(x => optionCost(x, A));
    for (const r of rows) {
      r.costPerPiece = pieces ? r2(r.cost / pieces) : null;
      r.shareOfProfitPct = pieces && profit > 0 ? r1((r.cost / (pieces * profit)) * 100) : null;
    }
    const ranked = [...rows].sort((a, b) => a.effectiveAprPct - b.effectiveAprPct || a.cost - b.cost);
    const cheapestRate = ranked[0].name;
    const cheapestMoney = [...rows].sort((a, b) => a.cost - b.cost)[0].name;
    const notes = [];
    if (cheapestRate !== cheapestMoney) notes.push(`${cheapestRate} has the lowest yearly rate but ${cheapestMoney} costs fewer dollars, because it is held for a shorter time. A rate is not the bill; compare both.`);
    for (const r of rows) {
      if (r.kind === "factor") notes.push(`${r.name}: a factor of ${r2(r.repaid / r.received)} looks like ${r1((r.repaid / r.received - 1) * 100)}% but, repaid in equal parts over ${r.months} months, it is about ${r.effectiveAprPct}% a year.`);
      if (r.shareOfProfitPct !== null && r.shareOfProfitPct >= 25) notes.push(`${r.name} would take ${r.shareOfProfitPct}% of the profit the run is expected to make.`);
      if (r.shareOfProfitPct === null && profit !== null && profit <= 0 && pieces) notes.push(`The run earns nothing before financing, so any borrowing adds to the loss.`);
    }
    return { amount: r2(A), rows, cheapestRate, cheapestMoney, ranked: ranked.map(r => r.name), notes };
  } catch (e) { return { error: e.message }; }
}
