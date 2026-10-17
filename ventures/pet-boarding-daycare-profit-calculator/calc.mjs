// Dog boarding and daycare maths: kennel runs and daycare spots to nights and days sold, revenue, staffing that steps up as dogs are added,
// per-dog supplies, fixed cost, startup cost and a loan, break-even utilisation, and a sixty-month ramp-up with cash trough and payback.
// Pure functions, no DOM, no network. Every figure is the owner's own input; nothing here is a market rate, an occupancy benchmark or a forecast.

export const SAMPLE = {
  runs: "30", nightly: "55", occPct: "70", stayNights: "4", addOn: "18",
  daySpots: "25", dayRate: "38", dayFillPct: "80", daysOpen: "26",
  suppliesPerDog: "6.5", feesPct: "3",
  dogsPerAttendant: "12", openHours: "12", minStaff: "2", wage: "16.5", payrollPct: "12",
  rentMonthly: "5200", utilitiesMonthly: "1100", managerMonthly: "4200", insuranceYear: "6000", otherMonthly: "900",
  buildoutPerRun: "2200", equipmentTotal: "18000", launch: "9000", depositMonths: "2", contingencyPct: "10",
  startPct: "30", rampMonths: "12",
  ltcPct: "60", loanRate: "9", termYears: "10", targetMargin: "15",
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
const BOARDING_DAYS = 30;

export function parse(raw) {
  const errors = [];
  const runs = opt(raw.runs, 0), daySpots = opt(raw.daySpots, 0);
  const nightly = opt(raw.nightly, 0), occPct = opt(raw.occPct, 0), stayNights = opt(raw.stayNights, 1), addOn = opt(raw.addOn, 0);
  const dayRate = opt(raw.dayRate, 0), dayFillPct = opt(raw.dayFillPct, 0), daysOpen = opt(raw.daysOpen, 26);
  const suppliesPerDog = opt(raw.suppliesPerDog, 0), feesPct = opt(raw.feesPct, 0);
  const dogsPerAttendant = num(raw.dogsPerAttendant), openHours = num(raw.openHours), minStaff = opt(raw.minStaff, 1), wage = opt(raw.wage, 0), payrollPct = opt(raw.payrollPct, 0);
  const rentMonthly = opt(raw.rentMonthly, 0), utilitiesMonthly = opt(raw.utilitiesMonthly, 0), managerMonthly = opt(raw.managerMonthly, 0), insuranceYear = opt(raw.insuranceYear, 0), otherMonthly = opt(raw.otherMonthly, 0);
  const buildoutPerRun = opt(raw.buildoutPerRun, 0), equipmentTotal = opt(raw.equipmentTotal, 0), launch = opt(raw.launch, 0), depositMonths = opt(raw.depositMonths, 0), contingencyPct = opt(raw.contingencyPct, 0);
  const startPct = opt(raw.startPct, 100), rampMonths = opt(raw.rampMonths, 0);
  const ltcPct = opt(raw.ltcPct, 0), loanRate = opt(raw.loanRate, 0), termYears = opt(raw.termYears, 10), targetMargin = opt(raw.targetMargin, 15);
  if (!(runs >= 0 && Number.isInteger(runs))) errors.push("Boarding runs or suites must be a whole number, 0 or more.");
  if (!(daySpots >= 0 && Number.isInteger(daySpots))) errors.push("Daycare spots (dogs at one time) must be a whole number, 0 or more.");
  if (!errors.length && runs + daySpots === 0) errors.push("Enter at least one boarding run or one daycare spot.");
  if (!(nightly >= 0)) errors.push("Nightly boarding price must be 0 or more.");
  if (!(dayRate >= 0)) errors.push("Daycare price per day must be 0 or more.");
  if (!errors.length && runs > 0 && nightly === 0 && (daySpots === 0 || dayRate === 0)) errors.push("Enter a nightly price greater than 0 for your boarding runs.");
  if (!errors.length && daySpots > 0 && dayRate === 0 && (runs === 0 || nightly === 0)) errors.push("Enter a daycare price per day greater than 0.");
  if (!(occPct >= 0 && occPct <= 100)) errors.push("Average boarding occupancy must be 0 to 100 percent.");
  if (!(dayFillPct >= 0 && dayFillPct <= 100)) errors.push("Average daycare fill must be 0 to 100 percent.");
  if (!(stayNights >= 1 && stayNights <= 60)) errors.push("Average stay must be 1 to 60 nights.");
  if (!(daysOpen >= 1 && daysOpen <= 31)) errors.push("Daycare days open per month must be 1 to 31.");
  if (!(feesPct >= 0 && feesPct < 30)) errors.push("Card and booking-software fees must be from 0 to under 30 percent of revenue.");
  if (!(dogsPerAttendant >= 1 && dogsPerAttendant <= 60)) errors.push("Enter dogs per attendant (1 to 60). Use the ratio your insurer, your state or your own standard requires.");
  if (!(openHours > 0 && openHours <= 24)) errors.push("Staffed hours per day must be more than 0 and no more than 24.");
  if (!(minStaff >= 1 && minStaff <= 20 && Number.isInteger(minStaff))) errors.push("Minimum staff on duty must be a whole number from 1 to 20.");
  if (!(payrollPct >= 0 && payrollPct <= 60)) errors.push("Payroll tax and benefits must be 0 to 60 percent of wages.");
  for (const [n, v] of [["Add-on revenue per stay", addOn], ["Supplies per dog per day", suppliesPerDog], ["Hourly wage", wage], ["Rent", rentMonthly], ["Utilities", utilitiesMonthly], ["Manager or owner draw", managerMonthly], ["Insurance", insuranceYear], ["Other fixed costs", otherMonthly],
    ["Build-out per run", buildoutPerRun], ["Equipment", equipmentTotal], ["Launch cost", launch], ["Deposit months", depositMonths]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(contingencyPct >= 0 && contingencyPct <= 100)) errors.push("Contingency must be 0 to 100 percent.");
  if (!(startPct >= 0 && startPct <= 100)) errors.push("Demand in month 1 is a percent of planned demand, 0 to 100.");
  if (!(rampMonths >= 0 && rampMonths <= 60 && Number.isInteger(rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(ltcPct >= 0 && ltcPct <= 100)) errors.push("Loan as a percent of startup cost must be from 0 to 100.");
  if (!(loanRate >= 0 && loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(termYears >= 1 && termYears <= 30 && Number.isInteger(termYears))) errors.push("Loan term must be a whole number of years from 1 to 30.");
  if (!(targetMargin > 0 && targetMargin < 90)) errors.push("Target operating margin must be more than 0 and under 90 percent.");
  return { errors, runs, daySpots, nightly, occPct, stayNights, addOn, dayRate, dayFillPct, daysOpen, suppliesPerDog, feesPct, dogsPerAttendant, openHours, minStaff, wage, payrollPct,
    rentMonthly, utilitiesMonthly, managerMonthly, insuranceYear, otherMonthly, buildoutPerRun, equipmentTotal, launch, depositMonths, contingencyPct, startPct, rampMonths, ltcPct, loanRate, termYears, targetMargin };
}

// Staff on duty for an average of `dogs` dogs on site: the ratio rounded up, never below the minimum. This is the step that decides the business.
export function attendants(p, dogs) {
  return Math.max(p.minStaff, Math.ceil(dogs / p.dogsPerAttendant - 1e-9));
}
export function laborMonthly(p, dogs) {
  return attendants(p, dogs) * p.openHours * BOARDING_DAYS * p.wage * (1 + p.payrollPct / 100);
}

// One month at boarding occupancy occ and daycare fill fill (both 0..1).
export function month(p, occ, fill, { priceScale = 1 } = {}) {
  const nights = p.runs * occ * BOARDING_DAYS;
  const dayDogs = p.daySpots * fill * p.daysOpen;
  const gross = (nights * p.nightly + dayDogs * p.dayRate + (nights / p.stayNights) * p.addOn) * priceScale;
  const lost = gross * p.feesPct / 100;
  const revenue = gross - lost;
  const supplies = (nights + dayDogs) * p.suppliesPerDog;
  const onSite = p.runs * occ + p.daySpots * fill * p.daysOpen / BOARDING_DAYS;
  const staff = attendants(p, onSite);
  const labor = laborMonthly(p, onSite);
  const fixed = p.rentMonthly + p.utilitiesMonthly + p.managerMonthly + p.insuranceYear / 12 + p.otherMonthly;
  return { nights, dayDogs, gross, lost, revenue, supplies, onSite, staff, labor, fixed, profit: revenue - supplies - labor - fixed };
}

export function startupCost(p) {
  const buildout = p.runs * p.buildoutPerRun, deposit = p.depositMonths * p.rentMonthly;
  const contingency = (buildout + p.equipmentTotal + p.launch) * p.contingencyPct / 100;
  return { buildout, equipment: p.equipmentTotal, deposit, launch: p.launch, contingency, total: buildout + p.equipmentTotal + deposit + p.launch + contingency };
}

export function payment(loan, annualPct, years) {
  const n = years * 12, r = annualPct / 100 / 12;
  if (loan <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}

export function scaleAt(p, m) {
  if (p.rampMonths <= 1 || m >= p.rampMonths) return 1;
  return (p.startPct + (100 - p.startPct) * (m - 1) / (p.rampMonths - 1)) / 100;
}

const capped = (p, s) => month(p, Math.min(1, p.occPct / 100 * s), Math.min(1, p.dayFillPct / 100 * s));

// Lowest utilisation u (boarding occupancy and daycare fill both at u percent of capacity) where profit reaches `extra` or more. Staffing steps, so scan.
export function breakEvenUtilisation(p, extra = 0) {
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    if (month(p, u, u).profit >= extra) return u;
  }
  return null;
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const cost = startupCost(p);
  const loan = cost.total * p.ltcPct / 100, equity = cost.total - loan;
  const pmt = payment(loan, p.loanRate, p.termYears);
  const st = capped(p, 1);
  const margin = st.revenue > 0 ? st.profit / st.revenue : null;
  const annualProfit = st.profit * 12, annualDebt = pmt * 12;
  const dscr = annualDebt > 0 ? annualProfit / annualDebt : null;
  const cashAfterDebt = st.profit - pmt;
  const beOps = breakEvenUtilisation(p, 0), beDebt = breakEvenUtilisation(p, pmt);
  const sold = st.nights + st.dayDogs;
  const m = p.targetMargin / 100, v = p.feesPct / 100;
  const needNet = (st.supplies + st.labor + st.fixed) / (1 - m);
  const priceFactor = st.gross > 0 && v < 1 ? needNet / (st.gross * (1 - v)) : null;
  const revenuePerRun = p.runs > 0 ? st.revenue / p.runs : null;

  const flows = [], yearProfit = Array(5).fill(0), yearCash = Array(5).fill(0);
  let cum = -equity, trough = -equity, troughMonth = 0, paybackMonth = null, firstProfitMonth = null;
  const debtMonths = p.termYears * 12;
  for (let mo = 1; mo <= HORIZON_MONTHS; mo++) {
    const s = capped(p, scaleAt(p, mo));
    const cf = s.profit - (mo <= debtMonths ? pmt : 0);
    flows.push(cf);
    yearProfit[Math.floor((mo - 1) / 12)] += s.profit; yearCash[Math.floor((mo - 1) / 12)] += cf;
    cum += cf;
    if (cum < trough) { trough = cum; troughMonth = mo; }
    if (firstProfitMonth === null && s.profit > 0) firstProfitMonth = mo;
    if (paybackMonth === null && cum >= 0) paybackMonth = mo;
  }
  const reserve = Math.max(0, -(trough + equity));

  const demandSweep = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1].map((scale) => {
    const s = capped(p, scale);
    return { scale, dogs: s.onSite, staff: s.staff, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) };
  });
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => {
    const s = month(p, Math.min(1, p.occPct / 100), Math.min(1, p.dayFillPct / 100), { priceScale: 1 + pct / 100 });
    return { pct, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) };
  });
  const wageSweep = [-10, 0, 10, 20].map((pct) => {
    const s = capped({ ...p, wage: p.wage * (1 + pct / 100) }, 1);
    return { pct, profit: round2(s.profit), cash: round2(s.profit - pmt) };
  });

  const findings = [];
  if (st.profit <= 0) findings.push({ severity: "high", title: `At your planned occupancy the business loses ${whole(-st.profit)} a month before any loan payment. Staffing is ${whole(st.labor)} a month (${st.staff} on duty).` });
  else if (cashAfterDebt < 0) findings.push({ severity: "high", title: `Operating profit of ${whole(st.profit)} a month does not cover the ${whole(pmt)} loan payment. You would fund ${whole(-cashAfterDebt)} a month yourself.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}, thin for a business where a disease scare or a bad holiday week can empty the runs.` });
  if (beDebt === null) findings.push({ severity: "high", title: `Even at 100% of capacity the facility does not cover costs and the loan at these prices.` });
  else if (beDebt > 0.85) findings.push({ severity: "medium", title: `Covering costs and the loan takes ${(beDebt * 100).toFixed(1)}% of capacity on both boarding and daycare, so a slow season puts you underwater.` });
  const laborShare = st.revenue > 0 ? st.labor / st.revenue : 0;
  if (laborShare > 0.4) findings.push({ severity: "medium", title: `Attendant wages are ${(laborShare * 100).toFixed(0)}% of revenue. Staffing steps up one person at a time as dogs are added; the demand table shows where it jumps.` });
  if (p.occPct > 85 && p.runs > 0) findings.push({ severity: "medium", title: `${p.occPct}% average boarding occupancy is hard to hold across a year because demand clusters around holidays and school breaks. Check it against your own booking history.` });
  if (reserve > 0) findings.push({ severity: "medium", title: `During ramp-up cash drops ${whole(reserve)} below where you started, at month ${troughMonth}. Hold that much in reserve on top of the ${whole(equity)} of equity.` });
  if (paybackMonth === null) findings.push({ severity: "medium", title: `Your ${whole(equity)} of equity is not returned within ${HORIZON_MONTHS} months.` });
  findings.push({ severity: "info", title: `Planned sales are about ${Math.round(sold).toLocaleString("en-US")} dog-days a month (${Math.round(st.nights).toLocaleString("en-US")} boarding nights and ${Math.round(st.dayDogs).toLocaleString("en-US")} daycare days) with ${st.staff} on duty.` });
  findings.push({ severity: "info", title: `Check your state or county boarding licence, local zoning and noise rules, vaccination policy, and the staffing ratio your insurer requires before you build. This page decides none of that.` });
  if (!findings.some((x) => x.severity === "high" || x.severity === "medium")) findings.push({ severity: "info", title: `At these figures the business clears its costs and loan with ${whole(cashAfterDebt)} a month left at planned occupancy.` });

  return { errors: [], input: p, cost, loan, equity, pmt, steady: st, margin, annualProfit, dscr, cashAfterDebt, beOps, beDebt, priceFactor, revenuePerRun, sold,
    paybackMonth, firstProfitMonth, trough, troughMonth, reserve, yearProfit: yearProfit.map(round2), yearCash: yearCash.map(round2), demandSweep, priceSweep, wageSweep, findings };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  return [
    `Pet boarding and daycare: ${p.runs} runs at ${p.occPct}% occupancy, ${p.daySpots} daycare spots at ${p.dayFillPct}% fill, ${p.dogsPerAttendant} dogs per attendant`,
    `Planned month: ${Math.round(s.nights).toLocaleString("en-US")} boarding nights, ${Math.round(s.dayDogs).toLocaleString("en-US")} daycare days, ${s.staff} attendants on duty`,
    `Revenue ${whole(s.revenue)} after fees; supplies ${whole(s.supplies)}, attendants ${whole(s.labor)}, fixed ${whole(s.fixed)}; profit ${whole(s.profit)} (${pct(r.margin)} margin)`,
    `Startup ${whole(r.cost.total)} (build-out ${whole(r.cost.buildout)}, equipment ${whole(r.cost.equipment)}, deposit ${whole(r.cost.deposit)}, launch ${whole(r.cost.launch)}, contingency ${whole(r.cost.contingency)}); loan ${whole(r.loan)} = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a month`,
    `Break-even: ${r.beOps === null ? "not reachable" : pct(r.beOps) + " of capacity"} to cover operating costs, ${r.beDebt === null ? "not reachable" : pct(r.beDebt) + " of capacity"} to cover the loan too; prices ${r.priceFactor === null ? "cannot reach" : (r.priceFactor >= 1 ? "up " : "down ") + Math.abs((r.priceFactor - 1) * 100).toFixed(0) + "% from your figures to reach"} a ${p.targetMargin}% margin`,
    `Ramp: first profitable month ${r.firstProfitMonth ?? "not within 60"}; lowest cash at month ${r.troughMonth || 0} (reserve ${whole(r.reserve)}); equity back ${r.paybackMonth === null ? "not within 60 months" : "in month " + r.paybackMonth}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["demand_vs_plan_pct,dogs_on_site,attendants,profit_per_month,margin_pct,cash_after_loan_per_month",
    ...r.demandSweep.map((x) => `${Math.round(x.scale * 100)},${x.dogs.toFixed(1)},${x.staff},${x.profit.toFixed(2)},${x.margin === null ? "" : (x.margin * 100).toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}
