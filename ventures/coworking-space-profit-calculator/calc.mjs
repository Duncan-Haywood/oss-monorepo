// Coworking and flex-office space maths: floor area to seats that fit, fit-out and launch cost, stabilized monthly revenue from private
// offices, dedicated desks, hot-desk memberships, day passes and meeting rooms, a month-by-month ramp with payback and a cash trough,
// break-even occupancy, and the price change that reaches a target margin. Pure functions, no DOM, no network.
// Every figure is the operator's own input; nothing here is a market rate, a rent comparable or a forecast.

export const SAMPLE = {
  sqft: "6000", rentablePct: "75", offices: "10", officeSqft: "110", officeRate: "950", desks: "12", deskSqft: "50", deskRate: "350", hot: "30", hotSqft: "35", hotRate: "150",
  dayPasses: "60", dayRate: "25", meetingHours: "80", meetingRate: "30", stabOcc: "80", startOcc: "15", rampMonths: "12",
  leasePerSqft: "26", otherLeaseCostPct: "20", staffMonthly: "6500", utilitiesMonthly: "1800", suppliesMonthly: "900", softwareMarketingMonthly: "1200", insuranceYear: "3600", feesPct: "3.5", badDebtPct: "2",
  buildoutPerSqft: "55", furniturePerSeat: "650", depositMonths: "2", launch: "15000", contingencyPct: "10",
  ltcPct: "60", loanRate: "8", termYears: "7", targetMargin: "25",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
const whole = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const round2 = (n) => Math.round(n * 100) / 100;
export const HORIZON_MONTHS = 60;

export function parse(raw) {
  const errors = [];
  const sqft = num(raw.sqft), stabOcc = num(raw.stabOcc);
  if (!(sqft > 0)) errors.push("Enter the total square feet you lease (more than 0).");
  if (!(stabOcc > 0 && stabOcc <= 100)) errors.push("Enter stabilized occupancy as a percent of memberships sold (more than 0, up to 100).");
  const rentablePct = opt(raw.rentablePct, 75);
  const offices = opt(raw.offices, 0), officeSqft = opt(raw.officeSqft, 100), officeRate = opt(raw.officeRate, 0);
  const desks = opt(raw.desks, 0), deskSqft = opt(raw.deskSqft, 50), deskRate = opt(raw.deskRate, 0);
  const hot = opt(raw.hot, 0), hotSqft = opt(raw.hotSqft, 35), hotRate = opt(raw.hotRate, 0);
  const dayPasses = opt(raw.dayPasses, 0), dayRate = opt(raw.dayRate, 0), meetingHours = opt(raw.meetingHours, 0), meetingRate = opt(raw.meetingRate, 0);
  const startOcc = opt(raw.startOcc, stabOcc), rampMonths = opt(raw.rampMonths, 0);
  const leasePerSqft = opt(raw.leasePerSqft, 0), otherLeaseCostPct = opt(raw.otherLeaseCostPct, 0);
  const staffMonthly = opt(raw.staffMonthly, 0), utilitiesMonthly = opt(raw.utilitiesMonthly, 0), suppliesMonthly = opt(raw.suppliesMonthly, 0), softwareMarketingMonthly = opt(raw.softwareMarketingMonthly, 0), insuranceYear = opt(raw.insuranceYear, 0);
  const feesPct = opt(raw.feesPct, 0), badDebtPct = opt(raw.badDebtPct, 0);
  const buildoutPerSqft = opt(raw.buildoutPerSqft, 0), furniturePerSeat = opt(raw.furniturePerSeat, 0), depositMonths = opt(raw.depositMonths, 0), launch = opt(raw.launch, 0), contingencyPct = opt(raw.contingencyPct, 0);
  const ltcPct = opt(raw.ltcPct, 0), loanRate = opt(raw.loanRate, 0), termYears = opt(raw.termYears, 7), targetMargin = opt(raw.targetMargin, 20);
  for (const [n, v] of [["Private offices", offices], ["Dedicated desks", desks], ["Hot-desk memberships", hot], ["Day passes per month", dayPasses], ["Meeting room hours per month", meetingHours],
    ["Office rate", officeRate], ["Dedicated desk rate", deskRate], ["Hot-desk rate", hotRate], ["Day pass price", dayRate], ["Meeting room rate", meetingRate],
    ["Lease cost per square foot", leasePerSqft], ["Staff cost", staffMonthly], ["Utilities and internet", utilitiesMonthly], ["Cleaning and supplies", suppliesMonthly], ["Software and marketing", softwareMarketingMonthly], ["Insurance", insuranceYear],
    ["Fit-out per square foot", buildoutPerSqft], ["Furniture per seat", furniturePerSeat], ["Deposit months", depositMonths], ["Launch cost", launch]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  for (const [n, v] of [["Private offices", offices], ["Dedicated desks", desks], ["Hot-desk memberships", hot]])
    if (!Number.isInteger(v)) errors.push(`${n} must be a whole number.`);
  if (!(rentablePct > 0 && rentablePct <= 100)) errors.push("Rentable share of the floor is a percent, more than 0 and up to 100 (the rest is lobby, kitchen, halls and restrooms).");
  for (const [n, v] of [["Square feet per office", officeSqft], ["Square feet per dedicated desk", deskSqft], ["Square feet per hot-desk seat", hotSqft]])
    if (!(v >= 10 && v <= 2000)) errors.push(`${n} must be from 10 to 2,000.`);
  if (!errors.length && offices + desks + hot < 1) errors.push("Enter at least one private office, dedicated desk or hot-desk membership.");
  if (!(startOcc >= 0 && startOcc <= 100)) errors.push("Starting occupancy is a percent, 0 to 100.");
  if (!(rampMonths >= 0 && rampMonths <= 60 && Number.isInteger(rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(otherLeaseCostPct >= 0 && otherLeaseCostPct <= 200)) errors.push("Taxes, common-area charges and other lease costs must be 0 to 200 percent of base rent.");
  if (!(feesPct >= 0 && feesPct < 30)) errors.push("Card and platform fees must be from 0 to under 30 percent of revenue.");
  if (!(badDebtPct >= 0 && badDebtPct < 30)) errors.push("Bad debt and discounts must be from 0 to under 30 percent of revenue.");
  if (!(contingencyPct >= 0 && contingencyPct <= 100)) errors.push("Contingency must be 0 to 100 percent.");
  if (!(ltcPct >= 0 && ltcPct <= 100)) errors.push("Loan as a percent of project cost must be from 0 to 100.");
  if (!(loanRate >= 0 && loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(termYears >= 1 && termYears <= 30 && Number.isInteger(termYears))) errors.push("Loan term must be a whole number of years from 1 to 30.");
  if (!(targetMargin > 0 && targetMargin < 90)) errors.push("Target operating margin must be more than 0 and under 90 percent.");
  return { errors, sqft, stabOcc, rentablePct, offices, officeSqft, officeRate, desks, deskSqft, deskRate, hot, hotSqft, hotRate, dayPasses, dayRate, meetingHours, meetingRate, startOcc, rampMonths,
    leasePerSqft, otherLeaseCostPct, staffMonthly, utilitiesMonthly, suppliesMonthly, softwareMarketingMonthly, insuranceYear, feesPct, badDebtPct,
    buildoutPerSqft, furniturePerSeat, depositMonths, launch, contingencyPct, ltcPct, loanRate, termYears, targetMargin };
}

// Does the mix of rooms and seats fit in the rentable floor?
export function areaFit(p) {
  const rentable = p.sqft * p.rentablePct / 100;
  const used = p.offices * p.officeSqft + p.desks * p.deskSqft + p.hot * p.hotSqft;
  return { rentable, used, spare: rentable - used };
}

// Revenue per month at full occupancy of memberships, split so occupancy and price can scale it independently.
function fullRevenue(p) {
  const members = p.offices * p.officeRate + p.desks * p.deskRate + p.hot * p.hotRate;
  const walkIn = p.dayPasses * p.dayRate + p.meetingHours * p.meetingRate;
  return { members, walkIn };
}

export function monthlyLease(p) {
  return (p.sqft * p.leasePerSqft / 12) * (1 + p.otherLeaseCostPct / 100);
}
export function fixedMonthly(p) {
  return monthlyLease(p) + p.staffMonthly + p.utilitiesMonthly + p.suppliesMonthly + p.softwareMarketingMonthly + p.insuranceYear / 12;
}

export function startupCost(p) {
  const seats = p.offices + p.desks + p.hot;
  const buildout = p.sqft * p.buildoutPerSqft, furniture = seats * p.furniturePerSeat, deposit = p.depositMonths * monthlyLease(p);
  const contingency = (buildout + furniture + p.launch) * p.contingencyPct / 100;
  return { buildout, furniture, deposit, launch: p.launch, contingency, total: buildout + furniture + deposit + p.launch + contingency };
}

export function payment(loan, annualPct, years) {
  const n = years * 12, r = annualPct / 100 / 12;
  if (loan <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}

// Steady-state month. occScale multiplies memberships and walk-in volume together; priceScale multiplies every price.
function steady(p, { occScale = 1, priceScale = 1 } = {}) {
  const f = fullRevenue(p);
  const gross = (f.members * (p.stabOcc / 100) + f.walkIn) * occScale * priceScale;
  const lost = gross * (p.feesPct + p.badDebtPct) / 100;
  const revenue = gross - lost;
  const fixed = fixedMonthly(p);
  return { gross, lost, revenue, fixed, profit: revenue - fixed };
}

export function occupancyAt(p, m) {
  if (p.rampMonths <= 1 || m >= p.rampMonths) return p.stabOcc;
  return p.startOcc + ((p.stabOcc - p.startOcc) * (m - 1)) / (p.rampMonths - 1);
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const fit = areaFit(p);
  const seats = p.offices + p.desks + p.hot;
  const cost = startupCost(p);
  const loan = cost.total * p.ltcPct / 100, equity = cost.total - loan;
  const pmt = payment(loan, p.loanRate, p.termYears);
  const st = steady(p);
  const margin = st.revenue > 0 ? st.profit / st.revenue : null;
  const annualProfit = st.profit * 12, annualDebt = pmt * 12;
  const dscr = annualDebt > 0 ? annualProfit / annualDebt : null;
  const cashAfterDebt = st.profit - pmt;
  const f = fullRevenue(p);
  const revPerSqft = (st.gross * 12) / p.sqft;

  // Break-even is closed form because revenue is linear in the occupancy scale.
  const netPerScale = (f.members * (p.stabOcc / 100) + f.walkIn) * (1 - (p.feesPct + p.badDebtPct) / 100);
  const beScaleOps = netPerScale > 0 ? st.fixed / netPerScale : null;
  const beScaleDebt = netPerScale > 0 ? (st.fixed + pmt) / netPerScale : null;
  const beOps = beScaleOps === null ? null : beScaleOps * p.stabOcc;
  const beDebt = beScaleDebt === null ? null : beScaleDebt * p.stabOcc;
  // Price multiplier that reaches the target margin: (1 - v - m) x gross x s = fixed.
  const v = (p.feesPct + p.badDebtPct) / 100, m = p.targetMargin / 100;
  const gross1 = st.gross;
  const priceFactor = gross1 > 0 && 1 - v - m > 0 ? st.fixed / ((1 - v - m) * gross1) : null;

  // Month by month ramp. Walk-in volume ramps with the same factor as memberships.
  const flows = [], yearProfit = Array(5).fill(0), yearCash = Array(5).fill(0);
  let cum = -equity, trough = -equity, troughMonth = 0, paybackMonth = null, firstProfitMonth = null;
  const debtMonths = p.termYears * 12;
  for (let mo = 1; mo <= HORIZON_MONTHS; mo++) {
    const occ = occupancyAt(p, mo), scale = occ / p.stabOcc;
    const s = steady(p, { occScale: scale });
    const cf = s.profit - (mo <= debtMonths ? pmt : 0);
    flows.push(cf);
    yearProfit[Math.floor((mo - 1) / 12)] += s.profit; yearCash[Math.floor((mo - 1) / 12)] += cf;
    cum += cf;
    if (cum < trough) { trough = cum; troughMonth = mo; }
    if (firstProfitMonth === null && s.profit > 0) firstProfitMonth = mo;
    if (paybackMonth === null && cum >= 0) paybackMonth = mo;
  }
  const reserve = Math.max(0, -(trough + equity));

  const occSweep = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1].map((scale) => {
    const o = Math.min(100, p.stabOcc * scale), eff = o / p.stabOcc;
    const s = steady(p, { occScale: eff });
    return { scale, occ: o, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) };
  });
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => {
    const s = steady(p, { priceScale: 1 + pct / 100 });
    return { pct, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) };
  });

  const findings = [];
  if (fit.spare < 0) findings.push({ severity: "high", title: `The offices, desks and seats need ${Math.round(fit.used).toLocaleString("en-US")} sq ft but only ${Math.round(fit.rentable).toLocaleString("en-US")} sq ft is rentable (${p.rentablePct}% of ${p.sqft.toLocaleString("en-US")}). Cut seats or rooms, or find more floor.` });
  if (st.profit <= 0) findings.push({ severity: "high", title: `At ${p.stabOcc}% occupancy the space loses ${whole(-st.profit)} a month before any loan payment. Rent, staffing or prices have to change.` });
  else if (cashAfterDebt < 0) findings.push({ severity: "high", title: `Stabilized profit of ${whole(st.profit)} a month does not cover the ${whole(pmt)} loan payment. You would fund ${whole(-cashAfterDebt)} a month from your own pocket.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}, thin for a business whose revenue is month-to-month memberships.` });
  if (beDebt !== null && beDebt > 100) findings.push({ severity: "high", title: `Covering costs and the loan needs ${beDebt.toFixed(0)}% occupancy, which is not possible at these prices.` });
  else if (beDebt !== null && p.stabOcc < beDebt * 1.15) findings.push({ severity: "medium", title: `Planned occupancy of ${p.stabOcc}% is within 15% of the ${beDebt.toFixed(0)}% needed to cover costs and the loan.` });
  if (reserve > 0) findings.push({ severity: "medium", title: `During ramp-up the cash drops ${whole(reserve)} below where you started, at month ${troughMonth}. Hold that much in reserve on top of the ${whole(equity)} of equity.` });
  if (paybackMonth === null) findings.push({ severity: "medium", title: `Your ${whole(equity)} of equity is not returned within ${HORIZON_MONTHS} months.` });
  if (p.stabOcc > 90) findings.push({ severity: "medium", title: `${p.stabOcc}% stabilized occupancy leaves little room for members who leave between lease-ups. Check it against spaces near you.` });
  const leaseShare = st.revenue > 0 ? monthlyLease(p) / st.revenue : 0;
  if (leaseShare > 0.4) findings.push({ severity: "medium", title: `Lease cost is ${(leaseShare * 100).toFixed(0)}% of revenue. Many operators try to keep rent well under that; the lease term and rent steps decide whether you can ride out a slow ramp.` });
  findings.push({ severity: "info", title: `Check the lease for term, personal guarantee, rent escalations and a right to sublet or assign, and check zoning, occupancy classification and accessibility rules for shared office use before signing.` });
  if (!findings.some((x) => x.severity !== "info")) findings.push({ severity: "info", title: `At these figures the space clears its costs and loan with ${whole(cashAfterDebt)} a month left at stabilization.` });

  return { errors: [], input: p, fit, seats, cost, loan, equity, pmt, steady: st, margin, annualProfit, dscr, cashAfterDebt, revPerSqft, beOps, beDebt, priceFactor,
    paybackMonth, firstProfitMonth, trough, troughMonth, reserve, yearProfit: yearProfit.map(round2), yearCash: yearCash.map(round2), occSweep, priceSweep, findings };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  return [
    `Coworking space: ${p.sqft.toLocaleString("en-US")} sq ft, ${p.offices} offices, ${p.desks} dedicated desks, ${p.hot} hot-desk memberships; ${p.stabOcc}% occupied once stabilized`,
    `Floor: ${Math.round(r.fit.used).toLocaleString("en-US")} of ${Math.round(r.fit.rentable).toLocaleString("en-US")} rentable sq ft used`,
    `Startup ${whole(r.cost.total)} (fit-out ${whole(r.cost.buildout)}, furniture ${whole(r.cost.furniture)}, deposit ${whole(r.cost.deposit)}, launch ${whole(r.cost.launch)}, contingency ${whole(r.cost.contingency)}); loan ${whole(r.loan)} = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Stabilized month: revenue ${whole(s.revenue)} after fees and bad debt, fixed costs ${whole(s.fixed)}, profit ${whole(s.profit)} (${pct(r.margin)} margin); ${whole(r.revPerSqft)} of gross revenue per sq ft per year`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a month`,
    `Break-even occupancy: ${r.beOps === null ? "n/a" : r.beOps.toFixed(0) + "% to cover operating costs"}, ${r.beDebt === null ? "n/a" : r.beDebt.toFixed(0) + "% to cover the loan too"}; prices ${r.priceFactor === null ? "cannot reach" : (r.priceFactor >= 1 ? "up " : "down ") + Math.abs((r.priceFactor - 1) * 100).toFixed(0) + "% from your figures to reach"} a ${p.targetMargin}% margin`,
    `Ramp: first profitable month ${r.firstProfitMonth ?? "not within 60"}; lowest cash at month ${r.troughMonth || 0} (reserve ${whole(r.reserve)}); equity back ${r.paybackMonth === null ? "not within 60 months" : "in month " + r.paybackMonth}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["occupancy_vs_plan_pct,occupancy_pct,profit_per_month,margin_pct,cash_after_loan_per_month",
    ...r.occSweep.map((x) => `${Math.round(x.scale * 100)},${x.occ.toFixed(1)},${x.profit.toFixed(2)},${x.margin === null ? "" : (x.margin * 100).toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}
