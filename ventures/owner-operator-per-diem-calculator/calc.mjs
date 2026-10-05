// Pure arithmetic for the owner-operator per diem comparison. No DOM, no network.
// Every default below is a figure the user must verify against the current GSA and IRS notices.

export const DEFAULTS = Object.freeze({
  conusRate: 80,        // transportation-industry M&IE, CONUS (verify)
  oconusRate: 86,       // transportation-industry M&IE, OCONUS (verify)
  partialPct: 75,       // travel / partial days (verify)
  dotPct: 80,           // DOT hours-of-service limit for meals (verify)
  wageBase: 184500,     // Social Security wage base (verify the year)
  seFactor: 0.9235,
  ssRate: 0.124,
  medicareRate: 0.029,
});

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Self-employment tax on a net profit, with the Social Security part capped at the wage base less
// any wages already subject to it. Medicare has no cap here (additional Medicare tax is not modeled).
export function seTax(netProfit, { otherWages = 0, wageBase = DEFAULTS.wageBase } = {}) {
  if (!(netProfit > 0)) return 0;
  const base = netProfit * DEFAULTS.seFactor;
  const room = Math.max(0, wageBase - otherWages);
  return Math.min(base, room) * DEFAULTS.ssRate + base * DEFAULTS.medicareRate;
}

export function calculatePerDiem(input = {}) {
  const v = {
    fullDays: num(input.fullDays),
    partialDays: num(input.partialDays),
    dailyRate: num(input.dailyRate),
    partialPct: input.partialPct === undefined ? DEFAULTS.partialPct : num(input.partialPct),
    dotPct: input.dotPct === undefined ? DEFAULTS.dotPct : num(input.dotPct),
    receipts: num(input.receipts),
    netProfit: num(input.netProfit),
    otherWages: num(input.otherWages),
    wageBase: input.wageBase === undefined ? DEFAULTS.wageBase : num(input.wageBase),
    marginalRate: num(input.marginalRate),
  };
  for (const [k, x] of Object.entries(v)) {
    if (!Number.isFinite(x) || x < 0) return { error: `${k} must be a number of zero or more.` };
  }
  if (v.fullDays + v.partialDays > 366) return { error: "Full days plus travel days cannot be more than 366." };
  if (v.partialPct > 100) return { error: "The travel day percentage cannot be more than 100." };
  if (v.dotPct > 100) return { error: "The DOT percentage cannot be more than 100." };
  if (v.marginalRate > 100) return { error: "The marginal rate cannot be more than 100." };

  const fullAmount = v.fullDays * v.dailyRate;
  const partialAmount = v.partialDays * v.dailyRate * (v.partialPct / 100);
  const perDiemGross = fullAmount + partialAmount;
  const perDiemDeduction = perDiemGross * (v.dotPct / 100);
  const receiptsDeduction = v.receipts * (v.dotPct / 100);
  const method = perDiemDeduction === receiptsDeduction ? "equal" : perDiemDeduction > receiptsDeduction ? "per-diem" : "receipts";
  const deduction = Math.max(perDiemDeduction, receiptsDeduction);

  // Tax effect: the deduction cuts net profit, which cuts SE tax, half of which is deductible again.
  const opts = { otherWages: v.otherWages, wageBase: v.wageBase };
  const before = seTax(v.netProfit, opts);
  const after = seTax(Math.max(0, v.netProfit - deduction), opts);
  const seSaving = before - after;
  const incomeTaxSaving = (Math.min(deduction, v.netProfit) + seSaving / 2) * (v.marginalRate / 100);
  const hasProfit = v.netProfit > 0;

  return {
    inputs: v,
    totalDays: v.fullDays + v.partialDays,
    fullAmount: round2(fullAmount),
    partialAmount: round2(partialAmount),
    perDiemGross: round2(perDiemGross),
    perDiemDeduction: round2(perDiemDeduction),
    receiptsDeduction: round2(receiptsDeduction),
    method,
    deduction: round2(deduction),
    difference: round2(Math.abs(perDiemDeduction - receiptsDeduction)),
    taxEstimated: hasProfit,
    seTaxBefore: round2(before),
    seTaxAfter: round2(after),
    seSaving: round2(seSaving),
    incomeTaxSaving: round2(incomeTaxSaving),
    totalSaving: round2(seSaving + incomeTaxSaving),
  };
}

export function sampleInputs() {
  return {
    fullDays: 220, partialDays: 30, dailyRate: DEFAULTS.conusRate, partialPct: 75, dotPct: 80,
    receipts: 9000, netProfit: 80000, otherWages: 0, wageBase: DEFAULTS.wageBase, marginalRate: 22,
  };
}
