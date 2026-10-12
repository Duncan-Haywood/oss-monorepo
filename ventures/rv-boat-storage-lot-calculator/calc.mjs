// Outdoor RV and boat storage lot maths: acres to spaces, project cost, stabilized NOI, yield on cost, debt coverage, a monthly
// lease-up model over the hold, and an equity IRR with a sale at the end. Pure functions, no DOM, no network.
// Every figure is the investor's own input; nothing here is a market rate, a rent comparable or a forecast.

export const SAMPLE = {
  acres: "3", usablePct: "70", spaceSqft: "600", land: "420000", sitePerSqft: "4.5", developedPct: "85", fenceGate: "60000", permits: "35000", other: "20000",
  rate: "85", stabOcc: "85", startOcc: "20", rampMonths: "18", badDebtPct: "3", propTax: "9000", insurance: "5500", fixedMonthly: "450", mgmtPct: "8", repairsPerSpace: "40",
  rateGrowth: "3", costGrowth: "3", ltcPct: "65", loanRate: "7.25", termYears: "25", holdYears: "10", exitCap: "8", sellPct: "4", targetYield: "10",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const round2 = (n) => Math.round(n * 100) / 100;
export const SQFT_PER_ACRE = 43560;

export function parse(raw) {
  const errors = [];
  const acres = num(raw.acres), rate = num(raw.rate), stabOcc = num(raw.stabOcc);
  if (!(acres > 0)) errors.push("Enter the acres you are building on (more than 0).");
  if (!(rate > 0)) errors.push("Enter the monthly rent per space (more than 0).");
  if (!(stabOcc > 0 && stabOcc <= 100)) errors.push("Enter stabilized occupancy as a percent of spaces rented (more than 0, up to 100).");
  const usablePct = opt(raw.usablePct, 70), spaceSqft = opt(raw.spaceSqft, 600), land = opt(raw.land, 0), sitePerSqft = opt(raw.sitePerSqft, 0), developedPct = opt(raw.developedPct, 100);
  const fenceGate = opt(raw.fenceGate, 0), permits = opt(raw.permits, 0), other = opt(raw.other, 0);
  const startOcc = opt(raw.startOcc, stabOcc), rampMonths = opt(raw.rampMonths, 0), badDebtPct = opt(raw.badDebtPct, 0);
  const propTax = opt(raw.propTax, 0), insurance = opt(raw.insurance, 0), fixedMonthly = opt(raw.fixedMonthly, 0), mgmtPct = opt(raw.mgmtPct, 0), repairsPerSpace = opt(raw.repairsPerSpace, 0);
  const rateGrowth = opt(raw.rateGrowth, 0), costGrowth = opt(raw.costGrowth, 0);
  const ltcPct = opt(raw.ltcPct, 0), loanRate = opt(raw.loanRate, 0), termYears = opt(raw.termYears, 25), holdYears = opt(raw.holdYears, 10);
  const exitCap = opt(raw.exitCap, 8), sellPct = opt(raw.sellPct, 0), targetYield = opt(raw.targetYield, 10);
  for (const [n, v] of [["Land cost", land], ["Site work per square foot", sitePerSqft], ["Fencing, gate and cameras", fenceGate], ["Permits, survey and engineering", permits], ["Other startup cost", other], ["Property tax", propTax], ["Insurance", insurance], ["Fixed monthly costs", fixedMonthly], ["Repairs per space", repairsPerSpace]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(usablePct > 0 && usablePct <= 100)) errors.push("Usable share of the land is a percent, more than 0 and up to 100.");
  if (!(spaceSqft >= 100 && spaceSqft <= 5000)) errors.push("Square feet per space (including its share of the aisle) must be from 100 to 5,000.");
  if (!(developedPct > 0 && developedPct <= 100)) errors.push("Share of the site that needs surfacing is a percent, more than 0 and up to 100.");
  if (!(startOcc >= 0 && startOcc <= 100)) errors.push("Starting occupancy is a percent, 0 to 100.");
  if (!(rampMonths >= 0 && rampMonths <= 120 && Number.isInteger(rampMonths))) errors.push("Lease-up months must be a whole number from 0 to 120.");
  if (!(badDebtPct >= 0 && badDebtPct < 50)) errors.push("Bad debt and discounts must be from 0 to under 50 percent of rent.");
  if (!(mgmtPct >= 0 && mgmtPct < 50)) errors.push("Management and card fees must be from 0 to under 50 percent of rent.");
  if (!(rateGrowth >= -10 && rateGrowth <= 20)) errors.push("Yearly rent growth must be from -10 to 20 percent.");
  if (!(costGrowth >= -10 && costGrowth <= 20)) errors.push("Yearly cost growth must be from -10 to 20 percent.");
  if (!(ltcPct >= 0 && ltcPct <= 90)) errors.push("Loan as a percent of project cost must be from 0 to 90.");
  if (!(loanRate >= 0 && loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(termYears >= 1 && termYears <= 40 && Number.isInteger(termYears))) errors.push("Loan term must be a whole number of years from 1 to 40.");
  if (!(holdYears >= 1 && holdYears <= 30 && Number.isInteger(holdYears))) errors.push("Years you hold the lot must be a whole number from 1 to 30.");
  if (!(exitCap > 0 && exitCap <= 30)) errors.push("Sale cap rate must be more than 0 and up to 30 percent.");
  if (!(sellPct >= 0 && sellPct < 20)) errors.push("Selling costs must be from 0 to under 20 percent of the price.");
  if (!(targetYield > 0 && targetYield <= 50)) errors.push("Target yield on cost must be more than 0 and up to 50 percent.");
  if (!errors.length && Math.floor(acres * SQFT_PER_ACRE * usablePct / 100 / spaceSqft) < 1) errors.push("These figures leave room for fewer than one space. Raise the acres or usable share, or shrink the space size.");
  return { errors, acres, rate, stabOcc, usablePct, spaceSqft, land, sitePerSqft, developedPct, fenceGate, permits, other, startOcc, rampMonths, badDebtPct, propTax, insurance, fixedMonthly, mgmtPct, repairsPerSpace, rateGrowth, costGrowth, ltcPct, loanRate, termYears, holdYears, exitCap, sellPct, targetYield };
}

// Whole spaces that fit: usable square feet divided by the footprint of one space including its share of aisle.
export function spacesFor(p) {
  return Math.floor((p.acres * SQFT_PER_ACRE * p.usablePct) / 100 / p.spaceSqft);
}

export function projectCost(p) {
  const siteWork = p.acres * SQFT_PER_ACRE * (p.developedPct / 100) * p.sitePerSqft;
  const total = p.land + siteWork + p.fenceGate + p.permits + p.other;
  return { land: p.land, siteWork, fenceGate: p.fenceGate, permits: p.permits, other: p.other, total };
}

// Level monthly payment on an amortizing loan.
export function payment(loan, annualPct, years) {
  const n = years * 12, r = annualPct / 100 / 12;
  if (loan <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}
export function balanceAfter(loan, annualPct, years, months) {
  const r = annualPct / 100 / 12, pmt = payment(loan, annualPct, years);
  if (loan <= 0) return 0;
  if (months >= years * 12) return 0;
  if (r === 0) return loan - pmt * months;
  const g = Math.pow(1 + r, months);
  return Math.max(0, loan * g - (pmt * (g - 1)) / r);
}

// Annualized IRR of monthly cash flows (flows[0] is at time zero). Bisection on the monthly rate; null when there is no sign change.
export function irr(flows) {
  const f = (r) => flows.reduce((a, c, i) => a + c / Math.pow(1 + r, i), 0);
  let lo = -0.5, hi = 1;
  const flo = f(lo), fhi = f(hi);
  if (!(Number.isFinite(flo) && Number.isFinite(fhi)) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (flo * fm <= 0) hi = mid; else lo = mid;
  }
  const m = (lo + hi) / 2;
  return Math.pow(1 + m, 12) - 1;
}

// Steady-state economics at year-one prices, with occupancy and rent as overrides.
function steady(p, spaces, { occ = p.stabOcc, rate = p.rate } = {}) {
  const gross = spaces * (occ / 100) * rate * 12;
  const lost = gross * (p.badDebtPct / 100);
  const mgmt = gross * (1 - p.badDebtPct / 100) * (p.mgmtPct / 100);
  const fixed = p.propTax + p.insurance + p.fixedMonthly * 12 + p.repairsPerSpace * spaces;
  const income = gross - lost;
  const noi = income - mgmt - fixed;
  return { gross, lost, income, mgmt, fixed, opex: mgmt + fixed, noi };
}

// Occupancy in month m (1-based): linear from the starting figure in month 1 to the stabilized one in the last lease-up month, then flat.
export function occupancyAt(p, m) {
  if (p.rampMonths <= 1 || m >= p.rampMonths) return p.stabOcc;
  return p.startOcc + ((p.stabOcc - p.startOcc) * (m - 1)) / (p.rampMonths - 1);
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const spaces = spacesFor(p);
  const cost = projectCost(p);
  const loan = cost.total * p.ltcPct / 100;
  const equity = cost.total - loan;
  const pmt = payment(loan, p.loanRate, p.termYears);
  const annualDebt = pmt * 12;
  const st = steady(p, spaces);
  const yieldOnCost = st.noi / cost.total;
  const dscr = annualDebt > 0 ? st.noi / annualDebt : null;
  const cashAfterDebt = st.noi - annualDebt;
  const cashOnCash = equity > 0 ? cashAfterDebt / equity : null;
  const costPerSpace = cost.total / spaces;

  // Break-even occupancy: income net of management is linear in occupancy, so both are closed form.
  const perOccPoint = spaces * p.rate * 12 * (1 - p.badDebtPct / 100) * (1 - p.mgmtPct / 100) / 100;
  const beNoi = perOccPoint > 0 ? st.fixed / perOccPoint : null;
  const beCash = perOccPoint > 0 ? (st.fixed + annualDebt) / perOccPoint : null;
  // Rent per space that reaches the target yield on cost at the stabilized occupancy.
  const rateForTarget = ((p.targetYield / 100) * cost.total + st.fixed) / (spaces * (p.stabOcc / 100) * 12 * (1 - p.badDebtPct / 100) * (1 - p.mgmtPct / 100));

  // Month-by-month over the hold. Rent and costs step up each year.
  const H = p.holdYears * 12, debtMonths = p.termYears * 12;
  const flows = [-equity], noiByYear = Array(p.holdYears).fill(0), cfByYear = Array(p.holdYears).fill(0);
  let cum = -equity, paybackMonth = null, trough = -equity;
  for (let m = 1; m <= H; m++) {
    const y = Math.floor((m - 1) / 12);
    const occ = occupancyAt(p, m);
    const g = Math.pow(1 + p.rateGrowth / 100, y), cg = Math.pow(1 + p.costGrowth / 100, y);
    const gross = spaces * (occ / 100) * p.rate * g;
    const income = gross * (1 - p.badDebtPct / 100);
    const fixed = (p.propTax / 12 + p.insurance / 12 + p.fixedMonthly + (p.repairsPerSpace * spaces) / 12) * cg;
    const noi = income * (1 - p.mgmtPct / 100) - fixed;
    const cf = noi - (m <= debtMonths ? pmt : 0);
    noiByYear[y] += noi; cfByYear[y] += cf;
    cum += cf;
    if (cum < trough) trough = cum;
    if (paybackMonth === null && cum >= 0) paybackMonth = m;
    flows.push(cf);
  }
  const exitNoi = noiByYear[p.holdYears - 1];
  const salePrice = exitNoi / (p.exitCap / 100);
  const saleNet = salePrice * (1 - p.sellPct / 100);
  const payoff = balanceAfter(loan, p.loanRate, p.termYears, H);
  const saleProceeds = saleNet - payoff;
  const exitFlows = flows.slice();
  exitFlows[H] += saleProceeds;
  const equityIrr = irr(exitFlows);
  const totalCash = flows.slice(1).reduce((a, b) => a + b, 0);
  const profit = totalCash + saleProceeds - equity;
  const multiple = equity > 0 ? (totalCash + saleProceeds) / equity : null;

  const sweep = [0.6, 0.7, 0.8, 0.9, 1, 1.1].map((scale) => {
    const occ = Math.min(100, p.stabOcc * scale);
    const s = steady(p, spaces, { occ });
    return { scale, occ, noi: round2(s.noi), yoc: s.noi / cost.total, dscr: annualDebt > 0 ? s.noi / annualDebt : null, cash: round2(s.noi - annualDebt) };
  });
  const rateSweep = [-20, -10, 0, 10, 20].map((pct) => {
    const rate = p.rate * (1 + pct / 100);
    const s = steady(p, spaces, { rate });
    return { pct, rate: round2(rate), noi: round2(s.noi), yoc: s.noi / cost.total, dscr: annualDebt > 0 ? s.noi / annualDebt : null, cash: round2(s.noi - annualDebt) };
  });

  const findings = [];
  if (st.noi <= 0) findings.push({ severity: "high", title: `At ${p.stabOcc}% occupancy the lot does not cover its own operating costs: NOI is ${whole(st.noi)} a year before any loan payment.` });
  else if (annualDebt > 0 && st.noi < annualDebt) findings.push({ severity: "high", title: `Stabilized NOI of ${whole(st.noi)} does not cover the ${whole(annualDebt)} a year of loan payments (coverage ${dscr.toFixed(2)}). You would fund the gap from your own pocket every year.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}. That is thin: lenders often want a cushion above 1.0, and a few empty spaces would erase it. Ask your lender what they require.` });
  if (beCash !== null && beCash > 100) findings.push({ severity: "high", title: `Covering operating costs and the loan needs ${beCash.toFixed(0)}% occupancy, which is not possible. Rent, cost or loan size has to change.` });
  else if (beCash !== null && p.stabOcc < beCash * 1.15) findings.push({ severity: "medium", title: `Stabilized occupancy of ${p.stabOcc}% is within 15% of the ${beCash.toFixed(0)}% needed to cover costs and the loan.` });
  if (trough < -equity * 1.0001) findings.push({ severity: "medium", title: `During lease-up the cumulative cash dips ${whole(-(trough + equity))} below where you started. Keep that much in reserve on top of your equity.` });
  if (paybackMonth === null) findings.push({ severity: "medium", title: `Your equity of ${whole(equity)} is not returned from operating cash within the ${p.holdYears}-year hold; it depends on the sale.` });
  if (p.stabOcc > 92) findings.push({ severity: "medium", title: `${p.stabOcc}% stabilized occupancy leaves little room for turnover between renters. Check it against rented spaces at lots near you.` });
  if (p.exitCap < yieldOnCost * 100 - 0.5 && equityIrr !== null) findings.push({ severity: "info", title: `You sell at a ${p.exitCap}% cap rate but built at a ${(yieldOnCost * 100).toFixed(1)}% yield on cost, so part of the return comes from the sale value rising above what you spent. Try a higher sale cap rate.` });
  findings.push({ severity: "info", title: `Check zoning, conditional-use rules, stormwater, fire-lane and screening requirements before you buy land. A lot that cannot legally be used for storage is worth the price of the land only.` });
  if (!findings.some((f) => f.severity !== "info")) findings.push({ severity: "info", title: `At these figures the lot clears its costs and loan with ${whole(cashAfterDebt)} a year left at stabilization.` });

  return {
    errors: [], input: p, spaces, cost, costPerSpace, loan, equity, pmt, annualDebt, steady: st, yieldOnCost, dscr, cashAfterDebt, cashOnCash,
    beNoi, beCash, rateForTarget, paybackMonth, trough, noiByYear: noiByYear.map(round2), cfByYear: cfByYear.map(round2),
    salePrice, saleNet, payoff, saleProceeds, equityIrr, totalCash, profit, multiple, sweep, rateSweep, findings,
  };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  return [
    `RV and boat storage lot: ${p.acres} acres, ${r.spaces} spaces at ${whole(p.rate)} a month, ${p.stabOcc}% occupied once stabilized`,
    `Project cost ${whole(r.cost.total)} (land ${whole(r.cost.land)}, site work ${whole(r.cost.siteWork)}, fencing ${whole(r.cost.fenceGate)}, permits ${whole(r.cost.permits)}, other ${whole(r.cost.other)}); ${whole(r.costPerSpace)} per space`,
    `Loan ${whole(r.loan)} at ${p.loanRate}% over ${p.termYears} years = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Stabilized year one: rent collected ${whole(s.income)}, operating costs ${whole(s.opex)}, NOI ${whole(s.noi)}; yield on cost ${pct(r.yieldOnCost)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a year; cash-on-cash ${pct(r.cashOnCash)}`,
    `Break-even occupancy: ${r.beNoi === null ? "n/a" : r.beNoi.toFixed(0) + "% to cover operating costs"}, ${r.beCash === null ? "n/a" : r.beCash.toFixed(0) + "% to cover the loan too"}; rent for a ${p.targetYield}% yield on cost: ${whole(r.rateForTarget)}`,
    `${p.holdYears}-year hold: sale ${whole(r.salePrice)} at a ${p.exitCap}% cap rate, ${whole(r.saleProceeds)} to you after selling costs and loan payoff; profit ${whole(r.profit)}; equity IRR ${pct(r.equityIrr)}; equity returned from operations ${r.paybackMonth === null ? "not within the hold" : "in month " + r.paybackMonth}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["occupancy_vs_plan_pct,occupancy_pct,noi_per_year,yield_on_cost_pct,debt_coverage,cash_after_loan_per_year",
    ...r.sweep.map((x) => `${Math.round(x.scale * 100)},${x.occ.toFixed(1)},${x.noi.toFixed(2)},${(x.yoc * 100).toFixed(2)},${x.dscr === null ? "" : x.dscr.toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}
