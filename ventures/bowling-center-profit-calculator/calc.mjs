// Bowling center maths: lane-hours booked at peak and off-peak prices, league discount, parties and events, food and drink, arcade and shoe rental, staffing, fixed cost,
// startup cost and a loan, break-even utilization, a sixty-month ramp-up with cash trough and payback.
// Pure functions, no DOM, no network. Every figure is the operator's own input; nothing here is a market price, a utilization benchmark or a forecast.

export const SAMPLE = {
  lanes: "24", hoursWeekday: "12", hoursWeekend: "14", peakShare: "40", peakUtil: "45", offUtil: "9", peakPrice: "40", offPrice: "20",
  leaguePct: "35", leagueDiscount: "30", feesPct: "2.5", bowlersPerHour: "3", fbSpend: "8", fbCogsPct: "30", arcadePerHour: "3",
  arcadeMarginPct: "60", perHourCost: "1.5", partiesWeek: "14", partyPrice: "260", partyCostPct: "35", staffHours: "560", wage: "15", burdenPct: "12",
  rentMonthly: "26000", utilitiesMonthly: "8000", insuranceYear: "18000", marketingMonthly: "2000", managerMonthly: "8000", otherMonthly: "2500",
  laneCost: "12000", fitout: "180000", barkitchen: "90000", launch: "30000", depositMonths: "2", contingencyPct: "10", startPct: "60", rampMonths: "9",
  ltcPct: "60", loanRate: "9.5", termYears: "10", targetMargin: "15",
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
const WEEKS_PER_MONTH = 52 / 12;

export function parse(raw) {
  const errors = [];
  const f = (key, d) => opt(raw[key], d);
  const p = {
    lanes: num(raw.lanes), hoursWeekday: num(raw.hoursWeekday), hoursWeekend: num(raw.hoursWeekend), peakShare: f("peakShare", 0),
    peakUtil: f("peakUtil", 0), offUtil: f("offUtil", 0), peakPrice: num(raw.peakPrice), offPrice: f("offPrice", 0), leaguePct: f("leaguePct", 0), leagueDiscount: f("leagueDiscount", 0), feesPct: f("feesPct", 0),
    bowlersPerHour: f("bowlersPerHour", 3), fbSpend: f("fbSpend", 0), fbCogsPct: f("fbCogsPct", 0), arcadePerHour: f("arcadePerHour", 0), arcadeMarginPct: f("arcadeMarginPct", 0), perHourCost: f("perHourCost", 0),
    partiesWeek: f("partiesWeek", 0), partyPrice: f("partyPrice", 0), partyCostPct: f("partyCostPct", 0),
    staffHours: f("staffHours", 0), wage: f("wage", 0), burdenPct: f("burdenPct", 0),
    rentMonthly: f("rentMonthly", 0), utilitiesMonthly: f("utilitiesMonthly", 0), insuranceYear: f("insuranceYear", 0), marketingMonthly: f("marketingMonthly", 0), managerMonthly: f("managerMonthly", 0), otherMonthly: f("otherMonthly", 0),
    laneCost: f("laneCost", 0), fitout: f("fitout", 0), barkitchen: f("barkitchen", 0), launch: f("launch", 0), depositMonths: f("depositMonths", 0), contingencyPct: f("contingencyPct", 0),
    startPct: f("startPct", 100), rampMonths: f("rampMonths", 0),
    ltcPct: f("ltcPct", 0), loanRate: f("loanRate", 0), termYears: f("termYears", 7), targetMargin: f("targetMargin", 15),
  };
  if (!(p.lanes >= 1 && p.lanes <= 100 && Number.isInteger(p.lanes))) errors.push("Enter the number of lanes, a whole number from 1 to 100.");
  if (!(p.hoursWeekday >= 0 && p.hoursWeekday <= 24)) errors.push("Open hours on a weekday must be from 0 to 24.");
  if (!(p.hoursWeekend >= 0 && p.hoursWeekend <= 24)) errors.push("Open hours on a weekend day must be from 0 to 24.");
  if (!(p.peakPrice >= 0)) errors.push("Enter the peak price per lane-hour, dollars (0 or more).");
  if (!errors.length && p.hoursWeekday * 5 + p.hoursWeekend * 2 <= 0) errors.push("Enter some opening hours; a center that never opens earns nothing.");
  for (const [n, v] of [["Off-peak price", p.offPrice], ["Food and drink spend per bowler", p.fbSpend], ["Arcade and shoe rental sales per booked hour", p.arcadePerHour], ["Other cost per booked hour", p.perHourCost],
    ["Parties per week", p.partiesWeek], ["Party price", p.partyPrice], ["Staff hours per week", p.staffHours], ["Hourly wage", p.wage],
    ["Rent", p.rentMonthly], ["Utilities", p.utilitiesMonthly], ["Insurance", p.insuranceYear], ["Marketing", p.marketingMonthly], ["Manager or owner draw", p.managerMonthly], ["Other fixed costs", p.otherMonthly],
    ["Cost per lane", p.laneCost], ["Building fit-out", p.fitout], ["Bar, kitchen and equipment", p.barkitchen], ["Launch cost", p.launch], ["Deposit months", p.depositMonths]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(p.bowlersPerHour >= 1 && p.bowlersPerHour <= 6)) errors.push("Bowlers per booked lane-hour must be from 1 to 6 (a lane seats up to six).");
  for (const [n, v] of [["Peak share of opening hours", p.peakShare], ["Peak utilization", p.peakUtil], ["Off-peak utilization", p.offUtil], ["League share of booked hours", p.leaguePct], ["League discount", p.leagueDiscount], ["Food and drink cost of goods", p.fbCogsPct], ["Arcade and shoe rental margin", p.arcadeMarginPct], ["Party cost share of party fees", p.partyCostPct], ["Payroll load", p.burdenPct], ["Contingency", p.contingencyPct], ["Loan as a percent of startup cost", p.ltcPct], ["Attendance in month 1", p.startPct]])
    if (!(v >= 0 && v <= 100)) errors.push(`${n} must be 0 to 100 percent.`);
  if (!(p.feesPct >= 0 && p.feesPct < 30)) errors.push("Card and booking-app fees must be from 0 to under 30 percent of revenue.");
  if (!errors.length && p.peakUtil <= 0 && p.offUtil <= 0 && p.partiesWeek <= 0) errors.push("Enter some utilization or parties; a center with no bookings earns nothing.");
  if (!(p.rampMonths >= 0 && p.rampMonths <= 60 && Number.isInteger(p.rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(p.loanRate >= 0 && p.loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(p.termYears >= 1 && p.termYears <= 30 && Number.isInteger(p.termYears))) errors.push("Loan term must be a whole number of years from 1 to 30.");
  if (!(p.targetMargin > 0 && p.targetMargin < 90)) errors.push("Target operating margin must be more than 0 and under 90 percent.");
  return { errors, ...p };
}

// Open lane-hours a week, split into peak and off-peak.
export function openHoursWeek(p) { return p.lanes * (p.hoursWeekday * 5 + p.hoursWeekend * 2); }
export function peakHoursWeek(p) { return openHoursWeek(p) * p.peakShare / 100; }
export function bookedHoursWeek(p, scale = 1) {
  const peak = peakHoursWeek(p), off = openHoursWeek(p) - peak;
  return { peak: peak * Math.min(1, p.peakUtil / 100 * scale), off: off * Math.min(1, p.offUtil / 100 * scale) };
}
// Highest demand multiple before the busier of the two periods is full. Beyond it, extra demand has no lane to go to.
export function capacityScale(p) {
  const caps = [];
  if (p.peakShare > 0 && p.peakUtil > 0) caps.push(100 / p.peakUtil);
  if (p.peakShare < 100 && p.offUtil > 0) caps.push(100 / p.offUtil);
  return caps.length ? Math.min(...caps) : Infinity;
}
// Average lane price after the league discount.
export function leagueFactor(p) { return 1 - (p.leaguePct / 100) * (p.leagueDiscount / 100); }
export function payment(loan, annualPct, years) {
  const n = years * 12, r = annualPct / 100 / 12;
  if (loan <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}
export function fixedMonthly(p) {
  const staff = p.staffHours * WEEKS_PER_MONTH * p.wage * (1 + p.burdenPct / 100);
  return { staff, total: staff + p.rentMonthly + p.utilitiesMonthly + p.insuranceYear / 12 + p.marketingMonthly + p.managerMonthly + p.otherMonthly };
}
export function startupCost(p) {
  const lanes = p.lanes * p.laneCost, deposit = p.depositMonths * p.rentMonthly;
  const contingency = (lanes + p.fitout + p.barkitchen + p.launch) * p.contingencyPct / 100;
  return { lanes, fitout: p.fitout, barkitchen: p.barkitchen, deposit, launch: p.launch, contingency, total: lanes + p.fitout + p.barkitchen + deposit + p.launch + contingency };
}

// One month. `scale` multiplies utilization and parties together (ramp-up, demand swing), capped at a full lane; `priceScale` multiplies lane and party
// prices; `wageScale` multiplies staff pay.
function month(p, { scale = 1, priceScale = 1, wageScale = 1 } = {}) {
  const w = bookedHoursWeek(p, scale);
  const hours = (w.peak + w.off) * WEEKS_PER_MONTH;
  const parties = p.partiesWeek * WEEKS_PER_MONTH * Math.min(scale, capacityScale(p));
  const laneRev = (w.peak * p.peakPrice + w.off * p.offPrice) * WEEKS_PER_MONTH * leagueFactor(p) * priceScale;
  const partyRev = parties * p.partyPrice * priceScale;
  const fb = hours * p.bowlersPerHour * p.fbSpend;
  const arcade = hours * p.arcadePerHour;
  const gross = laneRev + partyRev + fb + arcade;
  const lost = gross * p.feesPct / 100;
  const revenue = gross - lost;
  const variable = fb * p.fbCogsPct / 100 + arcade * (1 - p.arcadeMarginPct / 100) + hours * p.perHourCost + partyRev * p.partyCostPct / 100;
  const fx = fixedMonthly(p);
  const fixed = fx.total + fx.staff * (wageScale - 1);
  return { hours, parties, laneRev, partyRev, fb, arcade, gross, lost, revenue, variable, fixed, profit: revenue - variable - fixed };
}

export function scaleAt(p, m) {
  if (p.rampMonths <= 1 || m >= p.rampMonths) return 1;
  return (p.startPct + (100 - p.startPct) * (m - 1) / (p.rampMonths - 1)) / 100;
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const cost = startupCost(p);
  const loan = cost.total * p.ltcPct / 100, equity = cost.total - loan;
  const pmt = payment(loan, p.loanRate, p.termYears);
  const st = month(p);
  const margin = st.revenue > 0 ? st.profit / st.revenue : null;
  const annualProfit = st.profit * 12, annualDebt = pmt * 12;
  const dscr = annualDebt > 0 ? annualProfit / annualDebt : null;
  const cashAfterDebt = st.profit - pmt;
  const fixed = st.fixed;
  const cap = capacityScale(p);

  // Below the capacity cap profit is linear in the demand scale s: profit(s) = s x C - F with C = (revenue - variable) at plan. Break-even is s = F / C,
  // and counts only if it is reachable, i.e. no larger than the cap.
  const contribution = st.revenue - st.variable;
  const reach = (s) => (s !== null && s <= cap + 1e-9 ? s : null);
  const beScaleOps = contribution > 0 ? fixed / contribution : null;
  const beScaleDebt = contribution > 0 ? (fixed + pmt) / contribution : null;
  const beOps = reach(beScaleOps), beDebt = reach(beScaleDebt);
  const plannedUtil = st.hours > 0 ? st.hours / WEEKS_PER_MONTH / openHoursWeek(p) : 0;
  const utilOf = (s) => (s === null ? null : s * plannedUtil);
  const beUtilOps = utilOf(beOps), beUtilDebt = utilOf(beDebt);
  const beHoursOps = beOps === null ? null : beOps * st.hours / WEEKS_PER_MONTH, beHoursDebt = beDebt === null ? null : beDebt * st.hours / WEEKS_PER_MONTH;
  const bePctOps = beOps === null ? null : beOps * 100, bePctDebt = beDebt === null ? null : beDebt * 100;
  const m = p.targetMargin / 100;
  const priceFactor = solvePrice(p, m);

  const yearProfit = Array(5).fill(0), yearCash = Array(5).fill(0);
  let cum = -equity, trough = -equity, troughMonth = 0, paybackMonth = null, firstProfitMonth = null;
  const debtMonths = p.termYears * 12;
  for (let mo = 1; mo <= HORIZON_MONTHS; mo++) {
    const s = month(p, { scale: scaleAt(p, mo) });
    const cf = s.profit - (mo <= debtMonths ? pmt : 0);
    yearProfit[Math.floor((mo - 1) / 12)] += s.profit; yearCash[Math.floor((mo - 1) / 12)] += cf;
    cum += cf;
    if (cum < trough) { trough = cum; troughMonth = mo; }
    if (firstProfitMonth === null && s.profit > 0) firstProfitMonth = mo;
    if (paybackMonth === null && cum >= 0) paybackMonth = mo;
  }
  const reserve = Math.max(0, -(trough + equity));

  const row = (s) => ({ ...s, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) });
  const demandSweep = [0.6, 0.7, 0.8, 0.9, 1, 1.1].map((scale) => { const s = month(p, { scale }); const full = scale > cap + 1e-9; return { scale, capped: full, hoursWeek: s.hours / WEEKS_PER_MONTH, util: openHoursWeek(p) > 0 ? s.hours / WEEKS_PER_MONTH / openHoursWeek(p) : 0, ...row(s) }; });
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => ({ pct, ...row(month(p, { priceScale: 1 + pct / 100 })) }));
  const wageSweep = [-10, 0, 10, 20].map((pct) => ({ pct, ...row(month(p, { wageScale: 1 + pct / 100 })) }));

  const labourShare = st.revenue > 0 ? fixedMonthly(p).staff / st.revenue : 0;
  const rentShare = st.revenue > 0 ? p.rentMonthly / st.revenue : 0;
  const revPerHour = st.hours > 0 ? st.revenue / st.hours : 0;
  const laneShare = st.gross > 0 ? st.laneRev / st.gross : 0;
  const findings = [];
  if (contribution <= 0) findings.push({ severity: "high", title: `After fees, food cost, party cost share and per-hour cost, each unit of demand earns ${whole(contribution)} in total, so more bookings lose more money. Prices or costs have to change.` });
  if (st.profit <= 0 && contribution > 0) findings.push({ severity: "high", title: `At planned utilization the center loses ${whole(-st.profit)} a month before any loan payment.${beUtilOps === null ? " Even with every lane full in the busier period it cannot cover its costs, so prices, rent or staffing have to change." : ` It needs ${(beUtilOps * 100).toFixed(0)}% of all open lane-hours booked to cover costs and your plan has ${(plannedUtil * 100).toFixed(0)}%.`}` });
  else if (st.profit > 0 && cashAfterDebt < 0) findings.push({ severity: "high", title: `Planned profit of ${whole(st.profit)} a month does not cover the ${whole(pmt)} loan payment. You would fund ${whole(-cashAfterDebt)} a month from your own pocket.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}, thin for a center whose bookings swing with weather, school terms and the next lane down the road.` });
  if (st.profit > 0 && beDebt === null && pmt > 0) findings.push({ severity: "high", title: `Covering costs and the loan needs more bookings than the lanes can hold in the busier period, so the plan as typed does not pay for itself.` });
  else if (bePctDebt !== null && bePctDebt > 80) findings.push({ severity: "medium", title: `Costs and the loan take ${bePctDebt.toFixed(0)}% of planned bookings to cover, so a slow month puts you underwater.` });
  if (p.peakUtil >= 90) findings.push({ severity: "medium", title: `Peak utilization is ${p.peakUtil}%. Evening and weekend slots rarely fill that far all year; the demand table shows what a slower season does.` });
  if (labourShare > 0.3) findings.push({ severity: "medium", title: `Front-desk, bar, kitchen and mechanic staff take ${(labourShare * 100).toFixed(0)}% of revenue. Staffing hours are the lever this model moves most; the wage table shows how far pay moves profit.` });
  if (rentShare > 0.2) findings.push({ severity: "medium", title: `Rent is ${(rentShare * 100).toFixed(0)}% of revenue at plan. A bowling center needs a large clear-span building and is priced per square foot; check it against your bookings, not against the building.` });
  findings.push({ severity: "info", title: `Planned demand is ${Math.round(st.hours / WEEKS_PER_MONTH).toLocaleString("en-US")} booked lane-hours a week (${(plannedUtil * 100).toFixed(0)}% of ${Math.round(openHoursWeek(p)).toLocaleString("en-US")} open), about ${revPerHour.toFixed(2)} dollars of net revenue per booked hour including food, drink and arcade; lane hire is ${(laneShare * 100).toFixed(0)}% of gross. Check that your catchment can fill those hours before signing a lease.` });
  if (reserve > 0) findings.push({ severity: "medium", title: `During ramp-up the cash drops ${whole(reserve)} below where you started, at month ${troughMonth}. Hold that much in reserve on top of the ${whole(equity)} of equity.` });
  if (paybackMonth === null) findings.push({ severity: "medium", title: `Your ${whole(equity)} of equity is not returned within ${HORIZON_MONTHS} months.` });
  if (p.offPrice > p.peakPrice && p.peakPrice > 0) findings.push({ severity: "medium", title: `The off-peak price is above the peak price. Check the two figures; off-peak is normally cheaper.` });
  findings.push({ severity: "info", title: `Check planning and zoning, building and fire codes, noise limits, ceiling-height and lane-dimension requirements, floodlighting, accessibility, food and alcohol licensing, insurance and coach qualifications where you are. This page does none of that.` });
  if (!findings.some((x) => x.severity === "high" || x.severity === "medium")) findings.push({ severity: "info", title: `At these figures the center clears its costs and loan with ${whole(cashAfterDebt)} a month left at planned bookings.` });

  return { errors: [], input: p, cost, loan, equity, pmt, steady: st, contribution, margin, annualProfit, dscr, cashAfterDebt, revPerHour, labourShare, plannedUtil, capacity: cap,
    beHoursOps, beHoursDebt, beUtilOps, beUtilDebt, bePctOps, bePctDebt, priceFactor, paybackMonth, firstProfitMonth, trough, troughMonth, reserve,
    yearProfit: yearProfit.map(round2), yearCash: yearCash.map(round2), demandSweep, priceSweep, wageSweep, findings };
}

// Lane and party price factor x that lands the planned month on the target margin. Revenue and the party cost share both scale with x, so profit is
// linear in x; solve from two evaluations (exact, no iteration).
function solvePrice(p, m) {
  const at = (x) => { const s = month(p, { priceScale: x }); return s.profit - m * s.revenue; };
  const a = at(1), b = at(2);
  const slope = b - a;
  return slope > 0 ? 1 - a / slope : null;
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  const v = (n) => (n === null ? "n/a" : Math.round(n).toLocaleString("en-US"));
  return [
    `Bowling center: ${p.lanes} lanes, ${v(openHoursWeek(p))} open lane-hours a week, ${p.peakShare}% peak at ${p.peakUtil}% booked, off-peak ${p.offUtil}% booked; ${p.partiesWeek} parties a week`,
    `Per hour: peak ${p.peakPrice.toFixed(2)} dollars, off-peak ${p.offPrice.toFixed(2)}, ${p.leaguePct}% of hours on leagues at ${p.leagueDiscount}% off; about ${r.revPerHour.toFixed(2)} dollars of net revenue per booked hour including food, drink and arcade`,
    `Planned month: revenue ${whole(s.revenue)} (lanes ${whole(s.laneRev)}, parties ${whole(s.partyRev)}, food and drink ${whole(s.fb)}, arcade ${whole(s.arcade)}, less fees), variable ${whole(s.variable)}, fixed ${whole(s.fixed)} (staff ${whole(fixedMonthly(p).staff)}), profit ${whole(s.profit)} (${pct(r.margin)} margin)`,
    `Startup ${whole(r.cost.total)} (lanes ${whole(r.cost.lanes)}, fit-out ${whole(r.cost.fitout)}, bar and kitchen ${whole(r.cost.barkitchen)}, deposit ${whole(r.cost.deposit)}, launch ${whole(r.cost.launch)}, contingency ${whole(r.cost.contingency)}); loan ${whole(r.loan)} = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a month`,
    `Break-even: ${v(r.beHoursOps)} booked lane-hours a week to cover operating costs (${r.beUtilOps === null ? "n/a" : (r.beUtilOps * 100).toFixed(0) + "% of open hours"}), ${v(r.beHoursDebt)} to cover the loan too (${r.beUtilDebt === null ? "n/a" : (r.beUtilDebt * 100).toFixed(0) + "%"}); lane and party prices ${r.priceFactor === null ? "cannot reach" : (r.priceFactor >= 1 ? "up " : "down ") + Math.abs((r.priceFactor - 1) * 100).toFixed(0) + "% from your figures to reach"} a ${p.targetMargin}% margin`,
    `Ramp: first profitable month ${r.firstProfitMonth ?? "not within 60"}; lowest cash at month ${r.troughMonth || 0} (reserve ${whole(r.reserve)}); equity back ${r.paybackMonth === null ? "not within 60 months" : "in month " + r.paybackMonth}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["bookings_vs_plan_pct,booked_lane_hours_per_week,utilization_pct,profit_per_month,margin_pct,cash_after_loan_per_month",
    ...r.demandSweep.map((x) => `${Math.round(x.scale * 100)},${Math.round(x.hoursWeek)},${(x.util * 100).toFixed(1)},${x.profit.toFixed(2)},${x.margin === null ? "" : (x.margin * 100).toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}
