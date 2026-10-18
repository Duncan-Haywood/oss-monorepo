// Roofing insurance supplement finder: what an adjuster's estimate leaves out, priced.
// Pure functions, no dependencies, nothing leaves the browser. Every default is a
// placeholder, not a benchmark: replace each with your own measurement report, the
// adjuster's estimate and your own unit prices.

// Line items checked against the adjuster's estimate. `unit` is display only.
export const LINES = [
  { key: "starter", label: "Starter strip", unit: "LF" },
  { key: "dripEdge", label: "Drip edge (eaves and rakes)", unit: "LF" },
  { key: "ridgeCap", label: "Hip and ridge cap", unit: "LF" },
  { key: "iceWater", label: "Ice and water barrier", unit: "SQ" },
  { key: "underlayment", label: "Synthetic underlayment", unit: "SQ" },
  { key: "stepFlashing", label: "Step and wall flashing", unit: "LF" },
  { key: "pipeJacks", label: "Pipe jacks and vents", unit: "EA" },
  { key: "steepCharge", label: "Steep-slope charge (7/12 and up)", unit: "SQ" },
  { key: "highCharge", label: "High-roof charge (2+ stories)", unit: "SQ" },
  { key: "haulOff", label: "Haul-off and dumpster", unit: "EA" },
  { key: "permit", label: "Permit", unit: "EA" },
];

export const DEFAULTS = {
  // Shingle field: measured net squares, the squares on the adjuster's estimate
  // (waste already included there), waste you need, and the two per-square prices
  // (tear-off plus install).
  netSquares: 30,
  estimateSquares: 31.5,
  neededWastePct: 15,
  paidSqPrice: 395,
  yourSqPrice: 465,
  // [measured quantity, quantity on the adjuster's estimate, your unit price]
  starterMeasured: 260, starterPaid: 0, starterPrice: 2.1,
  dripEdgeMeasured: 260, dripEdgePaid: 0, dripEdgePrice: 3.4,
  ridgeCapMeasured: 75, ridgeCapPaid: 60, ridgeCapPrice: 9.5,
  iceWaterMeasured: 3.2, iceWaterPaid: 0, iceWaterPrice: 95,
  underlaymentMeasured: 34.5, underlaymentPaid: 34.5, underlaymentPrice: 38,
  stepFlashingMeasured: 40, stepFlashingPaid: 40, stepFlashingPrice: 11,
  pipeJacksMeasured: 4, pipeJacksPaid: 2, pipeJacksPrice: 85,
  steepChargeMeasured: 30, steepChargePaid: 0, steepChargePrice: 48,
  highChargeMeasured: 0, highChargePaid: 0, highChargePrice: 30,
  haulOffMeasured: 1, haulOffPaid: 1, haulOffPrice: 650,
  permitMeasured: 1, permitPaid: 0, permitPrice: 275,
  // Money around the claim.
  opApplies: 1,
  overheadPct: 10,
  profitPct: 10,
  materialSharePct: 40,
  taxPct: 6,
  originalRcv: 14200,
  deductible: 2500,
  roofAge: 12,
  roofLife: 25,
  maxDepPct: 100,
  depRecoverable: 1,
  acceptPct: 70,
  serviceFeePct: 0,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const pc = (x) => Math.min(100, nz(x)) / 100;
const r2 = (x) => Math.round(x * 100) / 100;

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
}

// Squares of shingle the roof needs: net area plus the waste its shape calls for.
export function neededSquares(o) {
  return nz(o.netSquares) * (1 + nz(o.neededWastePct) / 100);
}

// The shingle field has two independent shortfalls: squares left out (waste, or
// an under-measured roof) and a per-square price below yours. They are kept apart
// because they are argued differently: one is a measurement, the other a price.
export function shingleGap(o) {
  const needed = neededSquares(o);
  const paid = nz(o.estimateSquares);
  const missingSquares = Math.max(0, needed - paid);
  const quantityGap = missingSquares * nz(o.paidSqPrice);
  // Price gap is on the squares the adjuster did pay for, at the difference in price.
  const priceGap = paid * Math.max(0, nz(o.yourSqPrice) - nz(o.paidSqPrice));
  // Squares you are owed beyond the estimate are priced at your price, not theirs.
  const quantityGapAtYourPrice = missingSquares * nz(o.yourSqPrice);
  return {
    needed, paid, missingSquares,
    quantityGap: quantityGapAtYourPrice,
    quantityGapAtTheirPrice: quantityGap,
    priceGap,
    total: quantityGapAtYourPrice + priceGap,
  };
}

// One row per checked line: what is missing and what is over-included.
export function lineGaps(o) {
  return LINES.map((l) => {
    const measured = nz(o[`${l.key}Measured`]);
    const paid = nz(o[`${l.key}Paid`]);
    const price = nz(o[`${l.key}Price`]);
    const missingQty = Math.max(0, measured - paid);
    const overQty = Math.max(0, paid - measured);
    return {
      key: l.key, label: l.label, unit: l.unit, measured, paid, price,
      missingQty, overQty,
      missing: r2(missingQty * price),
      over: r2(overQty * price),
      status: measured === 0 && paid === 0 ? "unused" : missingQty > 0 ? "missing" : overQty > 0 ? "over" : "matches",
    };
  });
}

// Total requested supplement before O&P, and what flows from it.
export function supplement(o) {
  const lines = lineGaps(o);
  const sg = shingleGap(o);
  const linesMissing = lines.reduce((s, l) => s + l.missing, 0);
  const linesOver = lines.reduce((s, l) => s + l.over, 0);
  const subtotal = r2(sg.total + linesMissing);
  const opPct = o.opApplies >= 1 ? nz(o.overheadPct) + nz(o.profitPct) : 0;
  const op = r2((subtotal * opPct) / 100);
  const tax = r2((subtotal * pc(o.materialSharePct) * nz(o.taxPct)) / 100);
  const rcv = r2(subtotal + op + tax);
  return { lines, shingle: sg, linesMissing: r2(linesMissing), linesOver: r2(linesOver), subtotal, opPct, op, tax, rcv };
}

// Straight-line depreciation on age over expected life, capped.
export function depreciationPct(o) {
  const life = nz(o.roofLife);
  if (life === 0) return 0;
  return Math.min(nz(o.roofAge) / life, 1) * Math.min(100, nz(o.maxDepPct)) / 100;
}

// What the homeowner and contractor see in cash: before the supplement, and after the
// carrier agrees to `acceptPct` of it. ACV is paid first; depreciation is released on
// completion only when the policy makes it recoverable.
export function claimPayments(o) {
  const s = supplement(o);
  const dep = depreciationPct(o);
  const orig = nz(o.originalRcv);
  const ded = nz(o.deductible);
  const accepted = r2(s.rcv * pc(o.acceptPct));
  const pay = (rcv) => {
    const acvNow = Math.max(0, rcv * (1 - dep) - ded);
    const full = Math.max(0, rcv - ded);
    return { rcv: r2(rcv), held: r2(rcv * dep), acvNow: r2(acvNow), onCompletion: o.depRecoverable >= 1 ? r2(full) : r2(acvNow) };
  };
  const before = pay(orig);
  const after = pay(orig + accepted);
  return { dep, accepted, before, after, extraNow: r2(after.acvNow - before.acvNow), extraOnCompletion: r2(after.onCompletion - before.onCompletion) };
}

// Net to the contractor or homeowner after a supplement service's fee, at a given acceptance.
export function netAfterFee(o, acceptPct, feePct) {
  const s = supplement(o);
  return r2(s.rcv * pc(acceptPct) * (1 - pc(feePct)));
}

// Supplement as a share of the original estimate, so a request that dwarfs the
// estimate is visible as such before anyone sends it.
export function supplementShare(o) {
  const orig = nz(o.originalRcv);
  return orig === 0 ? null : supplement(o).rcv / orig;
}

// Yearly-free grid: net recovered across acceptance and fee.
export function sensitivity(o, accepts = [25, 50, 75, 100], fees = [0, 10, 15, 20]) {
  return accepts.map((a) => ({ acceptPct: a, cells: fees.map((f) => ({ feePct: f, net: netAfterFee(o, a, f) })) }));
}
