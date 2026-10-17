// Indoor play centre maths: weekday and weekend admissions, member and pass mix, party bookings, cafe spend, staffing hours, fixed cost,
// startup cost and a loan, break-even attendance, a sixty-month ramp-up with cash trough and payback.
// Pure functions, no DOM, no network. Every figure is the operator's own input; nothing here is a market price, an attendance benchmark or a forecast.

export const SAMPLE = {
  weekdayDays: "5", weekdayVisits: "45", weekendDays: "2", weekendVisits: "110",
  admission: "14", memberPct: "25", memberVisit: "8", feesPct: "3",
  cafeSpend: "4.5", cafeCogsPct: "35", perVisitCost: "0.4",
  partiesWeek: "9", partyPrice: "325", partyCost: "55", partyStaffMin: "120",
  staffHours: "230", wage: "16", burdenPct: "12",
  rentMonthly: "7500", utilitiesMonthly: "1100", insuranceYear: "7200", marketingMonthly: "900", managerMonthly: "4500", otherMonthly: "700",
  sqft: "6000", buildoutPerSqft: "35", playEquipment: "120000", cafeEquipment: "25000", launch: "18000", depositMonths: "2", contingencyPct: "10",
  startPct: "40", rampMonths: "9",
  ltcPct: "50", loanRate: "9.5", termYears: "7", targetMargin: "15",
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
    weekdayDays: f("weekdayDays", 0), weekdayVisits: f("weekdayVisits", 0), weekendDays: f("weekendDays", 0), weekendVisits: f("weekendVisits", 0),
    admission: num(raw.admission), memberPct: f("memberPct", 0), memberVisit: f("memberVisit", 0), feesPct: f("feesPct", 0),
    cafeSpend: f("cafeSpend", 0), cafeCogsPct: f("cafeCogsPct", 0), perVisitCost: f("perVisitCost", 0),
    partiesWeek: f("partiesWeek", 0), partyPrice: f("partyPrice", 0), partyCost: f("partyCost", 0), partyStaffMin: f("partyStaffMin", 0),
    staffHours: f("staffHours", 0), wage: f("wage", 0), burdenPct: f("burdenPct", 0),
    rentMonthly: f("rentMonthly", 0), utilitiesMonthly: f("utilitiesMonthly", 0), insuranceYear: f("insuranceYear", 0), marketingMonthly: f("marketingMonthly", 0), managerMonthly: f("managerMonthly", 0), otherMonthly: f("otherMonthly", 0),
    sqft: f("sqft", 0), buildoutPerSqft: f("buildoutPerSqft", 0), playEquipment: f("playEquipment", 0), cafeEquipment: f("cafeEquipment", 0), launch: f("launch", 0), depositMonths: f("depositMonths", 0), contingencyPct: f("contingencyPct", 0),
    startPct: f("startPct", 100), rampMonths: f("rampMonths", 0),
    ltcPct: f("ltcPct", 0), loanRate: f("loanRate", 0), termYears: f("termYears", 7), targetMargin: f("targetMargin", 15),
  };
  if (!(p.admission >= 0)) errors.push("Enter the full admission price per child, dollars (0 or more).");
  if (!(p.weekdayDays >= 0 && p.weekdayDays <= 5 && Number.isInteger(p.weekdayDays))) errors.push("Weekdays open per week must be a whole number from 0 to 5.");
  if (!(p.weekendDays >= 0 && p.weekendDays <= 2 && Number.isInteger(p.weekendDays))) errors.push("Weekend days open per week must be 0, 1 or 2.");
  for (const [n, v] of [["Child visits on an average weekday", p.weekdayVisits], ["Child visits on an average weekend day", p.weekendVisits], ["Member or pass price per visit", p.memberVisit], ["Cafe spend per visit", p.cafeSpend], ["Other cost per visit", p.perVisitCost],
    ["Parties per week", p.partiesWeek], ["Party price", p.partyPrice], ["Cost per party", p.partyCost], ["Staff minutes per party", p.partyStaffMin], ["Staff hours per week", p.staffHours], ["Hourly wage", p.wage],
    ["Rent", p.rentMonthly], ["Utilities", p.utilitiesMonthly], ["Insurance", p.insuranceYear], ["Marketing", p.marketingMonthly], ["Manager or owner draw", p.managerMonthly], ["Other fixed costs", p.otherMonthly],
    ["Floor area", p.sqft], ["Fit-out per square foot", p.buildoutPerSqft], ["Play equipment", p.playEquipment], ["Cafe equipment", p.cafeEquipment], ["Launch cost", p.launch], ["Deposit months", p.depositMonths]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!errors.length && (p.weekdayDays * p.weekdayVisits + p.weekendDays * p.weekendVisits) + p.partiesWeek <= 0) errors.push("Enter some visits or parties; a centre with neither earns nothing.");
  if (!(p.memberPct >= 0 && p.memberPct <= 100)) errors.push("Member and pass share of visits must be 0 to 100 percent.");
  if (!(p.feesPct >= 0 && p.feesPct < 30)) errors.push("Card and booking fees must be from 0 to under 30 percent of revenue.");
  if (!(p.cafeCogsPct >= 0 && p.cafeCogsPct <= 100)) errors.push("Cafe cost of goods must be 0 to 100 percent of cafe sales.");
  if (!(p.burdenPct >= 0 && p.burdenPct <= 100)) errors.push("Payroll tax and benefits must be 0 to 100 percent of wages.");
  if (!(p.contingencyPct >= 0 && p.contingencyPct <= 100)) errors.push("Contingency must be 0 to 100 percent.");
  if (!(p.startPct >= 0 && p.startPct <= 100)) errors.push("Attendance in month 1 is a percent of full demand, 0 to 100.");
  if (!(p.rampMonths >= 0 && p.rampMonths <= 60 && Number.isInteger(p.rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(p.ltcPct >= 0 && p.ltcPct <= 100)) errors.push("Loan as a percent of startup cost must be from 0 to 100.");
  if (!(p.loanRate >= 0 && p.loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(p.termYears >= 1 && p.termYears <= 30 && Number.isInteger(p.termYears))) errors.push("Loan term must be a whole number of years from 1 to 30.");
  if (!(p.targetMargin > 0 && p.targetMargin < 90)) errors.push("Target operating margin must be more than 0 and under 90 percent.");
  return { errors, ...p };
}

export function visitsPerWeek(p) { return p.weekdayDays * p.weekdayVisits + p.weekendDays * p.weekendVisits; }
// Blended admission take per visit: full price for walk-ins, the lower per-visit price for members and pass holders.
export function blendedAdmission(p) { return (1 - p.memberPct / 100) * p.admission + (p.memberPct / 100) * p.memberVisit; }
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
  const buildout = p.sqft * p.buildoutPerSqft, deposit = p.depositMonths * p.rentMonthly;
  const contingency = (buildout + p.playEquipment + p.cafeEquipment + p.launch) * p.contingencyPct / 100;
  return { buildout, play: p.playEquipment, cafe: p.cafeEquipment, deposit, launch: p.launch, contingency, total: buildout + p.playEquipment + p.cafeEquipment + deposit + p.launch + contingency };
}

// One month. `scale` multiplies visits and parties together (ramp-up, demand swing); `priceScale` multiplies admission and party prices; `wageScale` multiplies staff pay.
function month(p, { scale = 1, priceScale = 1, wageScale = 1 } = {}) {
  const visits = visitsPerWeek(p) * WEEKS_PER_MONTH * scale;
  const parties = p.partiesWeek * WEEKS_PER_MONTH * scale;
  const admission = visits * blendedAdmission(p) * priceScale;
  const partyRev = parties * p.partyPrice * priceScale;
  const cafe = visits * p.cafeSpend;
  const gross = admission + partyRev + cafe;
  const lost = gross * p.feesPct / 100;
  const revenue = gross - lost;
  const variable = cafe * p.cafeCogsPct / 100 + visits * p.perVisitCost + parties * (p.partyCost + (p.partyStaffMin / 60) * p.wage * (1 + p.burdenPct / 100) * wageScale);
  const fx = fixedMonthly(p);
  const fixed = fx.total + fx.staff * (wageScale - 1);
  return { visits, parties, admission, partyRev, cafe, gross, lost, revenue, variable, fixed, profit: revenue - variable - fixed };
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

  // Profit is linear in the demand scale s: profit(s) = s x C - F with C = (revenue - variable) at plan. Break-even is s = F / C.
  const contribution = st.revenue - st.variable;
  const beScaleOps = contribution > 0 ? fixed / contribution : null;
  const beScaleDebt = contribution > 0 ? (fixed + pmt) / contribution : null;
  const bePerWeek = (s) => (s === null ? null : s * visitsPerWeek(p));
  const beVisitsOps = bePerWeek(beScaleOps), beVisitsDebt = bePerWeek(beScaleDebt);
  const bePctOps = beScaleOps === null ? null : beScaleOps * 100, bePctDebt = beScaleDebt === null ? null : beScaleDebt * 100;
  // Admission and party price factor that reaches the target margin: net revenue R = R0 + (x - 1) x A with A the net price-driven revenue.
  const m = p.targetMargin / 100, keep = 1 - p.feesPct / 100;
  const A = (st.admission + st.partyRev) * keep, O = st.revenue - A;
  const needRevenue = (st.variable + fixed) / (1 - m);
  const priceFactor = A > 0 ? (needRevenue - O) / A : null;

  const flows = [], yearProfit = Array(5).fill(0), yearCash = Array(5).fill(0);
  let cum = -equity, trough = -equity, troughMonth = 0, paybackMonth = null, firstProfitMonth = null;
  const debtMonths = p.termYears * 12;
  for (let mo = 1; mo <= HORIZON_MONTHS; mo++) {
    const s = month(p, { scale: scaleAt(p, mo) });
    const cf = s.profit - (mo <= debtMonths ? pmt : 0);
    flows.push(cf);
    yearProfit[Math.floor((mo - 1) / 12)] += s.profit; yearCash[Math.floor((mo - 1) / 12)] += cf;
    cum += cf;
    if (cum < trough) { trough = cum; troughMonth = mo; }
    if (firstProfitMonth === null && s.profit > 0) firstProfitMonth = mo;
    if (paybackMonth === null && cum >= 0) paybackMonth = mo;
  }
  const reserve = Math.max(0, -(trough + equity));

  const row = (s) => ({ ...s, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) });
  const demandSweep = [0.6, 0.7, 0.8, 0.9, 1, 1.1].map((scale) => { const s = month(p, { scale }); return { scale, visitsWeek: visitsPerWeek(p) * scale, ...row(s) }; });
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => ({ pct, ...row(month(p, { priceScale: 1 + pct / 100 })) }));
  const wageSweep = [-10, 0, 10, 20].map((pct) => ({ pct, ...row(month(p, { wageScale: 1 + pct / 100 })) }));

  const labourShare = st.revenue > 0 ? (fixedMonthly(p).staff) / st.revenue : 0;
  const rentShare = st.revenue > 0 ? p.rentMonthly / st.revenue : 0;
  const perVisitNet = st.visits > 0 ? st.revenue / st.visits : 0;
  const findings = [];
  if (contribution <= 0) findings.push({ severity: "high", title: `After fees, cafe cost, party cost and per-visit cost, each unit of demand earns ${whole(contribution)} in total, so more visitors lose more money. Prices or costs have to change.` });
  if (st.profit <= 0 && contribution > 0) findings.push({ severity: "high", title: `At planned attendance the centre loses ${whole(-st.profit)} a month before any loan payment. It needs ${Math.round(beVisitsOps).toLocaleString("en-US")} child visits a week (with parties scaled alongside) to cover costs and your plan has ${Math.round(visitsPerWeek(p)).toLocaleString("en-US")}.` });
  else if (st.profit > 0 && cashAfterDebt < 0) findings.push({ severity: "high", title: `Planned profit of ${whole(st.profit)} a month does not cover the ${whole(pmt)} loan payment. You would fund ${whole(-cashAfterDebt)} a month from your own pocket.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}, thin for a business whose attendance swings with school terms, weather and one bad review.` });
  if (bePctDebt !== null && bePctDebt > 100) findings.push({ severity: "high", title: `Covering costs and the loan needs ${bePctDebt.toFixed(0)}% of planned attendance, so the plan as typed does not pay for itself.` });
  else if (bePctDebt !== null && bePctDebt > 80) findings.push({ severity: "medium", title: `Costs and the loan take ${bePctDebt.toFixed(0)}% of planned attendance to cover, so a slow month puts you underwater.` });
  if (labourShare > 0.4) findings.push({ severity: "medium", title: `Floor and cafe staff take ${(labourShare * 100).toFixed(0)}% of revenue. Staffing hours are the lever this model moves most; the wage table below shows how far pay moves profit.` });
  if (rentShare > 0.2) findings.push({ severity: "medium", title: `Rent is ${(rentShare * 100).toFixed(0)}% of revenue at plan. Landlords of large-box space price it by the square foot; check it against your attendance, not against the building.` });
  findings.push({ severity: "info", title: `Planned demand is ${Math.round(visitsPerWeek(p)).toLocaleString("en-US")} child visits and ${p.partiesWeek} parties a week, about ${perVisitNet.toFixed(2)} dollars of net revenue per visit including parties and cafe. Check that your catchment can supply every one of those visits before signing a lease.` });
  if (reserve > 0) findings.push({ severity: "medium", title: `During ramp-up the cash drops ${whole(reserve)} below where you started, at month ${troughMonth}. Hold that much in reserve on top of the ${whole(equity)} of equity.` });
  if (paybackMonth === null) findings.push({ severity: "medium", title: `Your ${whole(equity)} of equity is not returned within ${HORIZON_MONTHS} months.` });
  if (p.memberPct > 0 && p.memberVisit > p.admission && p.admission > 0) findings.push({ severity: "medium", title: `The member price per visit is above the walk-in price. Check the two figures; members normally pay less per visit.` });
  findings.push({ severity: "info", title: `Check child-safety and play-equipment inspection rules, building and fire codes, occupancy limits, food licensing, insurance requirements, waivers and staff background checks where you are. This page does none of that.` });
  if (!findings.some((x) => x.severity === "high" || x.severity === "medium")) findings.push({ severity: "info", title: `At these figures the centre clears its costs and loan with ${whole(cashAfterDebt)} a month left at planned attendance.` });

  return { errors: [], input: p, cost, loan, equity, pmt, steady: st, contribution, margin, annualProfit, dscr, cashAfterDebt, perVisitNet, labourShare,
    beVisitsOps, beVisitsDebt, bePctOps, bePctDebt, priceFactor, paybackMonth, firstProfitMonth, trough, troughMonth, reserve,
    yearProfit: yearProfit.map(round2), yearCash: yearCash.map(round2), demandSweep, priceSweep, wageSweep, findings };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  const v = (n) => (n === null ? "n/a" : Math.round(n).toLocaleString("en-US"));
  return [
    `Indoor play centre: ${v(visitsPerWeek(p))} child visits a week (${p.weekdayDays} weekdays at ${p.weekdayVisits}, ${p.weekendDays} weekend days at ${p.weekendVisits}), ${p.partiesWeek} parties a week`,
    `Per visit: walk-in ${p.admission.toFixed(2)} dollars, ${p.memberPct}% on member or pass at ${p.memberVisit.toFixed(2)}, blended admission ${blendedAdmission(p).toFixed(2)} dollars, about ${r.perVisitNet.toFixed(2)} dollars of net revenue per visit with parties and cafe`,
    `Planned month: revenue ${whole(s.revenue)} (admission ${whole(s.admission)}, parties ${whole(s.partyRev)}, cafe ${whole(s.cafe)}, less fees), variable ${whole(s.variable)}, fixed ${whole(s.fixed)} (staff ${whole(fixedMonthly(p).staff)}), profit ${whole(s.profit)} (${pct(r.margin)} margin)`,
    `Startup ${whole(r.cost.total)} (fit-out ${whole(r.cost.buildout)}, play equipment ${whole(r.cost.play)}, cafe ${whole(r.cost.cafe)}, deposit ${whole(r.cost.deposit)}, launch ${whole(r.cost.launch)}, contingency ${whole(r.cost.contingency)}); loan ${whole(r.loan)} = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a month`,
    `Break-even: ${v(r.beVisitsOps)} visits a week to cover operating costs (${r.bePctOps === null ? "n/a" : r.bePctOps.toFixed(0) + "% of plan"}), ${v(r.beVisitsDebt)} to cover the loan too (${r.bePctDebt === null ? "n/a" : r.bePctDebt.toFixed(0) + "%"}); admission and party prices ${r.priceFactor === null ? "cannot reach" : (r.priceFactor >= 1 ? "up " : "down ") + Math.abs((r.priceFactor - 1) * 100).toFixed(0) + "% from your figures to reach"} a ${p.targetMargin}% margin`,
    `Ramp: first profitable month ${r.firstProfitMonth ?? "not within 60"}; lowest cash at month ${r.troughMonth || 0} (reserve ${whole(r.reserve)}); equity back ${r.paybackMonth === null ? "not within 60 months" : "in month " + r.paybackMonth}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["attendance_vs_plan_pct,child_visits_per_week,profit_per_month,margin_pct,cash_after_loan_per_month",
    ...r.demandSweep.map((x) => `${Math.round(x.scale * 100)},${Math.round(x.visitsWeek)},${x.profit.toFixed(2)},${x.margin === null ? "" : (x.margin * 100).toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}
