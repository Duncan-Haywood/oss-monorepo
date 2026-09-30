// BRRRR (buy, rehab, rent, refinance, repeat) calculator: turns purchase price,
// rehab, hard-money terms, after-repair value (ARV) and the refinance into the
// all-in cost, cash actually invested, cash pulled back out at the refinance,
// cash left in the deal, post-refinance cash flow and DSCR, the highest
// purchase price that pulls every dollar out, and ARV / overrun stress tables.
// Deterministic and local. Pre-tax.

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const blank = (v) => String(v ?? "").trim() === "";
const opt = (v, dflt = 0) => (blank(v) ? dflt : parseNum(v));

export function loanPayment(amount, aprPct, years) {
  if (amount <= 0 || years <= 0) return 0;
  const r = aprPct / 100 / 12, n = years * 12;
  return r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
}
export function maxLoanForPayment(payment, aprPct, years) {
  if (payment <= 0) return 0;
  const r = aprPct / 100 / 12, n = years * 12;
  return r === 0 ? payment * n : (payment * (1 - Math.pow(1 + r, -n))) / r;
}

// Everything that happens before and at the refinance, for one set of inputs.
export function deal(p) {
  const hardLoan = p.price * p.hardPct + p.rehab * p.hardRehabPct;
  const points = hardLoan * p.points;
  const buyClosing = p.price * p.closingPct;
  const interest = hardLoan * p.hardRate / 12 * p.holdMonths; // interest-only, paid monthly
  const carry = p.carryMonthly * p.holdMonths;
  const allIn = p.price + p.rehab + buyClosing + points + interest + carry;
  const cashIn = allIn - hardLoan;

  // Refinance loan: LTV on ARV, capped by what the rent supports at the lender's minimum DSCR.
  const ltvLoan = p.arv * p.refiLtv;
  const rentYear = (p.rent + p.otherIncome) * 12;
  const fixedYear = p.propertyTax + p.insurance + p.hoa * 12 + p.utilities * 12;
  const dscrDebt = p.targetDscr > 0 ? rentYear / p.targetDscr - p.propertyTax - p.insurance - p.hoa * 12 : Infinity;
  const dscrLoan = p.targetDscr > 0 ? maxLoanForPayment(Math.max(0, dscrDebt) / 12, p.refiRate * 100, p.refiTerm) : Infinity;
  const refiLoan = Math.min(ltvLoan, dscrLoan);
  const refiCosts = refiLoan * p.refiClosingPct;
  const cashOut = refiLoan - hardLoan - refiCosts;
  const cashLeft = Math.max(0, cashIn - cashOut);
  const cashExcess = Math.max(0, cashOut - cashIn);

  const gross = rentYear, egi = gross * (1 - p.vacancy);
  const opex = egi * (p.management + p.maintenance) + fixedYear;
  const noi = egi - opex;
  const debt = loanPayment(refiLoan, p.refiRate * 100, p.refiTerm) * 12;
  const cashFlow = noi - debt;
  return { hardLoan, points, buyClosing, interest, carry, allIn, cashIn, ltvLoan, dscrLoan, refiLoan, refiCosts, cashOut, cashLeft, cashExcess,
    recovered: cashIn > 0 ? Math.max(0, cashOut) / cashIn : null,
    limitedBy: dscrLoan < ltvLoan ? "dscr" : "ltv",
    noi, debt, cashFlow, dscr: debt > 0 ? noi / debt : null,
    dscrRent: debt > 0 ? gross / (debt + p.propertyTax + p.insurance + p.hoa * 12) : null,
    cashOnCash: cashLeft > 0 ? cashFlow / cashLeft : null,
    equity: p.arv - refiLoan, egi, opex,
    // Total cash-in plus the drag of the refinance costs, as a share of ARV.
    allInPctArv: p.arv > 0 ? allIn / p.arv : null };
}

// Highest purchase price for which no cash stays in the deal (bisection; cash left is increasing in price).
export function maxPriceForFullRefi(p) {
  const left = (price) => deal({ ...p, price }).cashLeft;
  if (left(0) > 0.5) return null;
  let lo = 0, hi = Math.max(p.arv * 2, 1);
  if (left(hi) <= 0.5) return hi;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (left(mid) > 0.5) hi = mid; else lo = mid; }
  return lo;
}

function parseInput(raw) {
  const o = {};
  for (const [key, name, max] of [["price", "the purchase price", 1e9], ["arv", "the after-repair value (ARV)", 1e9], ["rent", "the monthly rent after rehab", 1e6]]) {
    const v = parseNum(raw[key]);
    if (!(v > 0 && v <= max)) return { error: `Enter ${name}, above zero and up to ${money(max)}.` };
    o[key] = v;
  }
  for (const [key, name, dflt, max] of [
    ["rehab", "Rehab budget, dollars", 0, 1e8], ["holdMonths", "Months from purchase to refinance", 6, 60],
    ["carryMonthly", "Monthly holding cost (taxes, insurance, utilities)", 0, 1e6], ["closingPct", "Closing costs at purchase, percent", 3, 20],
    ["hardPct", "Hard-money loan on the purchase price, percent", 0, 100], ["hardRehabPct", "Hard-money loan on the rehab, percent", 0, 100],
    ["hardRate", "Hard-money interest rate, percent", 11, 40], ["points", "Hard-money points, percent of the loan", 2, 10],
    ["refiLtv", "Refinance loan-to-value, percent of ARV", 75, 100], ["refiRate", "Refinance interest rate, percent", 7, 30],
    ["refiTerm", "Refinance term, years", 30, 40], ["refiClosingPct", "Refinance closing costs, percent of the loan", 2.5, 10],
    ["targetDscr", "Lender's minimum DSCR (0 = ignore)", 0, 5], ["otherIncome", "Other monthly income", 0, 1e6],
    ["vacancy", "Vacancy, percent", 5, 100], ["propertyTax", "Yearly property tax", 0, 1e7], ["insurance", "Yearly insurance", 0, 1e7],
    ["hoa", "Monthly HOA", 0, 1e5], ["utilities", "Monthly utilities you pay", 0, 1e5],
    ["management", "Property management, percent of rent", 0, 50], ["maintenance", "Maintenance reserve, percent of rent", 5, 50],
  ]) {
    const v = opt(raw[key], dflt);
    if (!(v >= 0 && v <= max)) return { error: `${name} must be a number between 0 and ${money(max)}, or blank.` };
    o[key] = v;
  }
  if (o.hardPct > 100 || o.hardRehabPct > 100) return { error: "Loan percentages cannot exceed 100." };
  if (o.refiTerm < 1) return { error: "Refinance term must be at least 1 year." };
  const p = { price: o.price, arv: o.arv, rent: o.rent, rehab: o.rehab, holdMonths: o.holdMonths, carryMonthly: o.carryMonthly,
    closingPct: o.closingPct / 100, hardPct: o.hardPct / 100, hardRehabPct: o.hardRehabPct / 100, hardRate: o.hardRate / 100, points: o.points / 100,
    refiLtv: o.refiLtv / 100, refiRate: o.refiRate / 100, refiTerm: Math.round(o.refiTerm), refiClosingPct: o.refiClosingPct / 100,
    targetDscr: o.targetDscr, otherIncome: o.otherIncome, vacancy: o.vacancy / 100, propertyTax: o.propertyTax, insurance: o.insurance,
    hoa: o.hoa, utilities: o.utilities, management: o.management / 100, maintenance: o.maintenance / 100 };
  return { p };
}

export function analyze(raw) {
  const r = parseInput(raw);
  if (r.error) return r;
  const p = r.p;
  const base = deal(p);
  const arvRows = [0.85, 0.9, 0.95, 1, 1.05].map((m) => {
    const d = deal({ ...p, arv: p.arv * m });
    return { label: m === 1 ? "Your ARV" : `${m > 1 ? "+" : ""}${Math.round((m - 1) * 100)}%`, arv: p.arv * m, refiLoan: d.refiLoan, cashOut: d.cashOut, cashLeft: d.cashLeft, cashFlow: d.cashFlow };
  });
  const overrunRows = [[0, 0], [0.25, 0], [0, 3], [0.25, 3], [0.5, 6]].map(([rehabUp, months]) => {
    const d = deal({ ...p, rehab: p.rehab * (1 + rehabUp), holdMonths: p.holdMonths + months });
    return { label: rehabUp === 0 && months === 0 ? "As planned" : `Rehab +${Math.round(rehabUp * 100)}%, ${months} more month${months === 1 ? "" : "s"}`, cashIn: d.cashIn, cashOut: d.cashOut, cashLeft: d.cashLeft, cashFlow: d.cashFlow };
  });
  const rateRows = [-1, 0, 1, 2].map((dl) => {
    const rate = Math.max(0, p.refiRate * 100 + dl);
    const d = deal({ ...p, refiRate: rate / 100 });
    return { label: dl === 0 ? "Your rate" : `${dl > 0 ? "+" : ""}${dl} point${Math.abs(dl) === 1 ? "" : "s"}`, rate, refiLoan: d.refiLoan, cashLeft: d.cashLeft, cashFlow: d.cashFlow, dscr: d.dscr };
  });
  const maxPrice = maxPriceForFullRefi(p);
  const seventy = p.arv * 0.7 - p.rehab;
  const f = [];
  if (base.cashExcess > 0) f.push({ severity: "info", title: `The refinance returns all your cash plus about $${money(base.cashExcess)}`, detail: `You put in about $${money(base.cashIn)} and the refinance pays out about $${money(base.cashOut)} after paying off the hard-money loan and closing costs. Cash flow after the refinance is about $${money(base.cashFlow)} a year on no cash left in the deal, so cash-on-cash return is undefined rather than large.` });
  else f.push({ severity: base.cashLeft > 0 ? "medium" : "info", title: `About $${money(base.cashLeft)} stays in the deal (${base.recovered === null ? "n/a" : Math.round(base.recovered * 100)}% of your cash comes back)`, detail: `All-in cost is about $${money(base.allIn)} (${base.allInPctArv === null ? "n/a" : Math.round(base.allInPctArv * 100)}% of ARV) and you put in about $${money(base.cashIn)} of your own cash after the hard-money loan. The refinance loan of about $${money(base.refiLoan)} pays out about $${money(Math.max(0, base.cashOut))}.` });
  if (base.limitedBy === "dscr") f.push({ severity: "medium", title: "The rent, not the value, caps your refinance", detail: `At a ${p.targetDscr.toFixed(2)} minimum DSCR the rent supports a loan of about $${money(base.dscrLoan)}, below the $${money(base.ltvLoan)} the loan-to-value limit would allow. Higher rent, a lower rate or a lower lender minimum would raise the payout.` });
  if (base.cashFlow < 0) f.push({ severity: "medium", title: "Cash flow is negative after the refinance", detail: `After operating costs and the new loan payment you would put in about $${money(-base.cashFlow)} a year. Check the rent, vacancy, reserve and rate assumptions.` });
  const worst = overrunRows[3];
  if (worst.cashLeft > base.cashLeft) f.push({ severity: "info", title: `A 25% rehab overrun and 3 extra months leave about $${money(worst.cashLeft)} in the deal`, detail: `That is $${money(worst.cashLeft - base.cashLeft)} more than planned, because the refinance is sized on value and rent, not on what you spent.` });
  if (maxPrice !== null) f.push({ severity: "info", title: `Highest price that pulls every dollar out: about $${money(maxPrice)}`, detail: `With these terms, a purchase price at or below that leaves no cash in the deal; the 70% rule of thumb (70% of ARV minus rehab) gives $${money(Math.max(0, seventy))} for comparison. Your price is $${money(p.price)}.` });
  else f.push({ severity: "medium", title: "No purchase price pulls every dollar out on these terms", detail: "Even a free property leaves cash in the deal because rehab, points and holding costs exceed what the refinance pays. Check the ARV, refinance limits and rehab budget." });
  f.push({ severity: "info", title: "Appraisal risk decides this deal", detail: `If the property appraises 10% under your ARV, the refinance pays out about $${money(Math.max(0, arvRows[1].cashOut))} instead of $${money(Math.max(0, base.cashOut))}. The stress table shows the cash left at each value.` });
  return { p, base, arvRows, overrunRows, rateRows, maxPrice, seventy, findings: f };
}

export function sampleInput() {
  return { price: "150000", rehab: "40000", arv: "250000", rent: "2100", holdMonths: "6", carryMonthly: "450", closingPct: "3", hardPct: "85", hardRehabPct: "100", hardRate: "11", points: "2",
    refiLtv: "75", refiRate: "7", refiTerm: "30", refiClosingPct: "2.5", targetDscr: "1.1", otherIncome: "0", vacancy: "5", propertyTax: "2800", insurance: "1500", hoa: "0", utilities: "0", management: "8", maintenance: "6" };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const b = a.base;
  const rows = [["Item", "Amount"], ["Purchase price", round2(a.p.price)], ["Rehab", round2(a.p.rehab)], ["Closing costs at purchase", round2(b.buyClosing)], ["Hard-money points", round2(b.points)],
    ["Hard-money interest during hold", round2(b.interest)], ["Holding costs", round2(b.carry)], ["All-in cost", round2(b.allIn)], ["Hard-money loan", round2(b.hardLoan)], ["Cash invested", round2(b.cashIn)],
    ["After-repair value", round2(a.p.arv)], ["Refinance loan", round2(b.refiLoan)], ["Refinance closing costs", round2(b.refiCosts)], ["Cash out at refinance", round2(b.cashOut)],
    ["Cash left in the deal", round2(b.cashLeft)], ["Yearly NOI after refinance", round2(b.noi)], ["Yearly debt service", round2(b.debt)], ["Yearly cash flow", round2(b.cashFlow)], ["Equity after refinance", round2(b.equity)]];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
