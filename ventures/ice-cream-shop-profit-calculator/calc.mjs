// Ice cream shop and seasonal stand pro forma: scoops per day by weekday and weekend, a hot season and an off season, a ticket built from
// cones and cups, shakes, toppings and a pint line, cost of goods, labor, fixed costs, start-up cost, a loan, break-even scoops per day,
// payback and an equity view. Pure functions, no DOM, no network.
// Every figure is the owner's own input; nothing here is a market price, a traffic estimate or a forecast.

export const SAMPLE = {
  price: "4.5", scoopsPerTicket: "1.8", shakePct: "12", shakeUplift: "3", shakeCost: "1.4", toppingPct: "35", toppingPrice: "1", toppingCost: "0.3",
  pintsPerDay: "8", pintPrice: "9", pintCost: "3.8",
  scoopsWeekday: "150", scoopsWeekend: "280", weekdaysOpen: "5", weekendDaysOpen: "2", openHours: "11",
  peakFirstMonth: "5", peakMonths: "5", peakPct: "140", offPct: "60",
  dairyPerScoop: "0.65", vesselPerScoop: "0.22", cardPct: "3",
  staffPerOpenHour: "2.5", wage: "15", burdenPct: "12",
  rent: "3800", utilities: "700", insurance: "250", otherFixed: "300", ownerPay: "0",
  cabinets: "4", cabinetCost: "4500", otherEquipment: "12000", sqft: "900", buildPerSqft: "55", permits: "3500", signagePos: "6000", inventory: "3500", cashReserve: "20000", otherStartup: "3000",
  startMonth: "3", startUtilPct: "40", rampMonths: "10", ltcPct: "60", loanRate: "8", termYears: "7", horizonMonths: "60", exitMultiple: "", targetYield: "25", targetPayback: "36",
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
export const WEEKS_PER_MONTH = 52 / 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parse(raw) {
  const errors = [];
  const price = num(raw.price), scoopsWeekday = num(raw.scoopsWeekday);
  if (!(price > 0)) errors.push("Enter the average price of a scoop in a cone or cup (more than 0).");
  if (!(scoopsWeekday >= 0 && scoopsWeekday <= 5000)) errors.push("Enter the scoops you sell on a typical weekday, from 0 to 5,000.");
  const scoopsWeekend = opt(raw.scoopsWeekend, 0), scoopsPerTicket = opt(raw.scoopsPerTicket, 1);
  const shakePct = opt(raw.shakePct, 0), shakeUplift = opt(raw.shakeUplift, 0), shakeCost = opt(raw.shakeCost, 0);
  const toppingPct = opt(raw.toppingPct, 0), toppingPrice = opt(raw.toppingPrice, 0), toppingCost = opt(raw.toppingCost, 0);
  const pintsPerDay = opt(raw.pintsPerDay, 0), pintPrice = opt(raw.pintPrice, 0), pintCost = opt(raw.pintCost, 0);
  const weekdaysOpen = opt(raw.weekdaysOpen, 5), weekendDaysOpen = opt(raw.weekendDaysOpen, 2), openHours = opt(raw.openHours, 10);
  const peakFirstMonth = opt(raw.peakFirstMonth, 1), peakMonths = opt(raw.peakMonths, 0), peakPct = opt(raw.peakPct, 100), offPct = opt(raw.offPct, 100);
  const dairyPerScoop = opt(raw.dairyPerScoop, 0), vesselPerScoop = opt(raw.vesselPerScoop, 0), cardPct = opt(raw.cardPct, 0);
  const staffPerOpenHour = opt(raw.staffPerOpenHour, 0), wage = opt(raw.wage, 0), burdenPct = opt(raw.burdenPct, 0);
  const rent = opt(raw.rent, 0), utilities = opt(raw.utilities, 0), insurance = opt(raw.insurance, 0), otherFixed = opt(raw.otherFixed, 0), ownerPay = opt(raw.ownerPay, 0);
  const cabinets = opt(raw.cabinets, 0), cabinetCost = opt(raw.cabinetCost, 0), otherEquipment = opt(raw.otherEquipment, 0), sqft = opt(raw.sqft, 0), buildPerSqft = opt(raw.buildPerSqft, 0);
  const permits = opt(raw.permits, 0), signagePos = opt(raw.signagePos, 0), inventory = opt(raw.inventory, 0), cashReserve = opt(raw.cashReserve, 0), otherStartup = opt(raw.otherStartup, 0);
  const startMonth = opt(raw.startMonth, 1), startUtilPct = opt(raw.startUtilPct, 100), rampMonths = opt(raw.rampMonths, 0);
  const ltcPct = opt(raw.ltcPct, 0), loanRate = opt(raw.loanRate, 0), termYears = opt(raw.termYears, 5), horizonMonths = opt(raw.horizonMonths, 60), exitMultiple = opt(raw.exitMultiple, 0);
  const targetYield = opt(raw.targetYield, 20), targetPayback = opt(raw.targetPayback, 36);

  if (!(scoopsWeekend >= 0 && scoopsWeekend <= 5000)) errors.push("Scoops on a typical weekend day must be from 0 to 5,000.");
  if (!(scoopsPerTicket >= 1 && scoopsPerTicket <= 20)) errors.push("Scoops per ticket (one customer's order) must be from 1 to 20.");
  if (!(shakePct >= 0 && shakePct <= 100)) errors.push("Share of scoops that go into shakes or sundaes is a percent, 0 to 100.");
  if (!(toppingPct >= 0 && toppingPct <= 300)) errors.push("Toppings sold per 100 scoops must be from 0 to 300.");
  if (!(pintsPerDay >= 0 && pintsPerDay <= 5000)) errors.push("Pints or wholesale tubs per open day must be from 0 to 5,000.");
  if (pintsPerDay > 0 && !(pintPrice > 0)) errors.push("Enter a pint price when you sell pints.");
  for (const [n, v] of [["Shake or sundae price uplift", shakeUplift], ["Shake or sundae extra cost", shakeCost], ["Topping price", toppingPrice], ["Topping cost", toppingCost], ["Pint price", pintPrice], ["Pint cost", pintCost], ["Dairy and mix cost per scoop", dairyPerScoop], ["Cone, cup and spoon cost per scoop", vesselPerScoop], ["Staff hours per open hour", staffPerOpenHour], ["Wage", wage], ["Rent", rent], ["Utilities", utilities], ["Insurance", insurance], ["Other fixed costs", otherFixed], ["Owner pay", ownerPay], ["Cost per dipping cabinet or freezer", cabinetCost], ["Other equipment", otherEquipment], ["Shop square feet", sqft], ["Build-out cost per square foot", buildPerSqft], ["Permits and legal", permits], ["Signage and point of sale", signagePos], ["Opening inventory", inventory], ["Cash reserve", cashReserve], ["Other start-up cost", otherStartup]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(cabinets >= 0 && cabinets <= 50 && Number.isInteger(cabinets))) errors.push("Dipping cabinets and freezers must be a whole number from 0 to 50.");
  if (!(weekdaysOpen >= 0 && weekdaysOpen <= 5 && Number.isInteger(weekdaysOpen))) errors.push("Weekdays open per week must be a whole number from 0 to 5.");
  if (!(weekendDaysOpen >= 0 && weekendDaysOpen <= 2 && Number.isInteger(weekendDaysOpen))) errors.push("Weekend days open per week must be 0, 1 or 2.");
  if (!errors.length && weekdaysOpen + weekendDaysOpen < 1) errors.push("The shop has to be open at least one day a week.");
  if (!(openHours > 0 && openHours <= 24)) errors.push("Open hours per day must be more than 0 and no more than 24.");
  if (!(peakFirstMonth >= 1 && peakFirstMonth <= 12 && Number.isInteger(peakFirstMonth))) errors.push("First month of the hot season must be a whole number from 1 to 12.");
  if (!(peakMonths >= 0 && peakMonths <= 12 && Number.isInteger(peakMonths))) errors.push("Length of the hot season must be a whole number of months from 0 to 12.");
  if (!(peakPct >= 0 && peakPct <= 300)) errors.push("Hot-season sales are a percent of the typical figure, 0 to 300.");
  if (!(offPct >= 0 && offPct <= 300)) errors.push("Off-season sales are a percent of the typical figure, 0 to 300 (0 closes the shop).");
  if (!(cardPct >= 0 && cardPct < 20)) errors.push("Card fees must be from 0 to under 20 percent of sales.");
  if (!(staffPerOpenHour <= 50)) errors.push("Staff hours per open hour cannot be more than 50.");
  if (!(burdenPct >= 0 && burdenPct <= 60)) errors.push("Payroll taxes and benefits must be from 0 to 60 percent of wages.");
  if (!(startMonth >= 1 && startMonth <= 12 && Number.isInteger(startMonth))) errors.push("Opening month must be a whole number from 1 to 12.");
  if (!(startUtilPct >= 0 && startUtilPct <= 100)) errors.push("Month-1 sales are a percent of the full-ramp figure, 0 to 100.");
  if (!(rampMonths >= 0 && rampMonths <= 60 && Number.isInteger(rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(ltcPct >= 0 && ltcPct <= 90)) errors.push("Loan as a percent of start-up cost must be from 0 to 90.");
  if (!(loanRate >= 0 && loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(termYears >= 1 && termYears <= 25 && Number.isInteger(termYears))) errors.push("Loan term must be a whole number of years from 1 to 25.");
  if (!(horizonMonths >= 12 && horizonMonths <= 120 && Number.isInteger(horizonMonths))) errors.push("Months to project must be a whole number from 12 to 120.");
  if (!(exitMultiple >= 0 && exitMultiple <= 10)) errors.push("Sale multiple must be from 0 to 10 times a year of operating profit (blank for no sale).");
  if (!(targetYield > 0 && targetYield <= 200)) errors.push("Target yield on start-up cost must be more than 0 and up to 200 percent a year.");
  if (!(targetPayback >= 1 && targetPayback <= 120)) errors.push("Target payback must be from 1 to 120 months.");
  const p = { price, scoopsWeekday, scoopsWeekend, scoopsPerTicket, shakePct, shakeUplift, shakeCost, toppingPct, toppingPrice, toppingCost, pintsPerDay, pintPrice, pintCost, weekdaysOpen, weekendDaysOpen, openHours, peakFirstMonth, peakMonths, peakPct, offPct, dairyPerScoop, vesselPerScoop, cardPct, staffPerOpenHour, wage, burdenPct, rent, utilities, insurance, otherFixed, ownerPay, cabinets, cabinetCost, otherEquipment, sqft, buildPerSqft, permits, signagePos, inventory, cashReserve, otherStartup, startMonth, startUtilPct, rampMonths, ltcPct, loanRate, termYears, horizonMonths, exitMultiple, targetYield, targetPayback };
  if (!errors.length && !Array.from({ length: 12 }, (_, i) => seasonFactor(p, i + 1)).some((f) => f > 0)) errors.push("Hot and off seasons are both set to 0, so the shop would be closed all year. Give at least one season some sales.");
  return { errors, ...p };
}

export function startupCost(p) {
  const equipment = p.cabinets * p.cabinetCost + p.otherEquipment, buildOut = p.sqft * p.buildPerSqft;
  const total = equipment + buildOut + p.permits + p.signagePos + p.inventory + p.cashReserve + p.otherStartup;
  return { equipment, buildOut, permits: p.permits, signagePos: p.signagePos, inventory: p.inventory, cashReserve: p.cashReserve, otherStartup: p.otherStartup, total };
}

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

// Sales multiplier for a calendar month (1-12): hot season or off season, never both. With no hot season every month is typical.
export function seasonFactor(p, calMonth) {
  if (p.peakMonths <= 0) return 1;
  const inPeak = (calMonth - p.peakFirstMonth + 12) % 12 < p.peakMonths;
  return (inPeak ? p.peakPct : p.offPct) / 100;
}

// Share of full-ramp sales in model month m (1-based): linear from the month-1 figure to 100 percent in the last ramp month.
export function rampAt(p, m) {
  if (p.rampMonths <= 1 || m >= p.rampMonths) return 1;
  return (p.startUtilPct + ((100 - p.startUtilPct) * (m - 1)) / (p.rampMonths - 1)) / 100;
}

export function openDaysPerMonth(p) {
  return (p.weekdaysOpen + p.weekendDaysOpen) * WEEKS_PER_MONTH;
}
// Sales for one average scoop: the scoop itself plus its share of shake uplift and toppings.
export function revenuePerScoop(p, price = p.price) {
  return price + (p.shakePct / 100) * p.shakeUplift + (p.toppingPct / 100) * p.toppingPrice;
}
export function costPerScoop(p) {
  return p.dairyPerScoop + p.vesselPerScoop + (p.shakePct / 100) * p.shakeCost + (p.toppingPct / 100) * p.toppingCost;
}
export function averageTicket(p) {
  return revenuePerScoop(p) * p.scoopsPerTicket;
}
export function fixedMonthly(p) {
  return p.rent + p.utilities + p.insurance + p.otherFixed + p.ownerPay;
}

// One month of operations at a given share of planned sales (traffic) and scoop price. A month whose season share is 0 is closed:
// no staff are paid, but rent and the other fixed costs still run.
export function monthModel(p, calMonth, traffic = 1, price = p.price) {
  const season = seasonFactor(p, calMonth), f = season * traffic, open = season > 0 ? 1 : 0;
  const wdDays = p.weekdaysOpen * WEEKS_PER_MONTH, weDays = p.weekendDaysOpen * WEEKS_PER_MONTH;
  const scoops = (p.scoopsWeekday * wdDays + p.scoopsWeekend * weDays) * f;
  const pints = p.pintsPerDay * (wdDays + weDays) * f;
  const openDays = (wdDays + weDays) * open;
  const scoopRev = scoops * price, shakeRev = scoops * (p.shakePct / 100) * p.shakeUplift, toppingRev = scoops * (p.toppingPct / 100) * p.toppingPrice, pintRev = pints * p.pintPrice;
  const revenue = scoopRev + shakeRev + toppingRev + pintRev;
  const card = revenue * (p.cardPct / 100);
  const cogs = scoops * costPerScoop(p) + pints * p.pintCost;
  const staffHours = p.staffPerOpenHour * p.openHours * openDays;
  const labor = staffHours * p.wage * (1 + p.burdenPct / 100);
  const fixed = fixedMonthly(p);
  const operating = revenue - card - cogs - labor - fixed;
  return { scoops, pints, openDays, scoopRev, shakeRev, toppingRev, pintRev, revenue, card, cogs, staffHours, labor, fixed, operating };
}

// Twelve months at full ramp, January to December, at a share of planned sales.
export function yearModel(p, { traffic = 1, price = p.price } = {}) {
  const t = { scoops: 0, pints: 0, openDays: 0, scoopRev: 0, shakeRev: 0, toppingRev: 0, pintRev: 0, revenue: 0, card: 0, cogs: 0, staffHours: 0, labor: 0, fixed: 0, operating: 0, lossMonths: 0, closedMonths: 0 };
  for (let m = 1; m <= 12; m++) {
    const x = monthModel(p, m, traffic, price);
    for (const k of Object.keys(x)) t[k] += x[k];
    if (x.operating < 0) t.lossMonths++;
    if (x.openDays === 0) t.closedMonths++;
  }
  return t;
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const cost = startupCost(p);
  const loan = cost.total * p.ltcPct / 100, equity = cost.total - loan;
  const pmt = payment(loan, p.loanRate, p.termYears), annualDebt = pmt * 12;
  const st = yearModel(p);
  const yieldOnCost = cost.total > 0 ? st.operating / cost.total : null;
  const dscr = annualDebt > 0 ? st.operating / annualDebt : null;
  const cashAfterDebt = st.operating - annualDebt;
  const cashOnCash = equity > 0 ? cashAfterDebt / equity : null;
  const share = (x) => (st.revenue > 0 ? x / st.revenue : null);
  const cogsPct = share(st.cogs), laborPct = share(st.labor), primePct = share(st.cogs + st.labor);
  const avgTicket = averageTicket(p);
  const scoopsPerStaffHour = st.staffHours > 0 ? st.scoops / st.staffHours : null;

  // Break-even. Each scoop brings its price plus its share of shake uplift and toppings, less card fees and its own mix, vessel and extras.
  // The pint line is held at plan: it is netted against the fixed costs, as is the labor of the planned open hours.
  const k = 1 - p.cardPct / 100;
  const perScoop = revenuePerScoop(p) * k - costPerScoop(p);
  const pintNet = st.pintRev * k - st.pints * p.pintCost;
  const fixedAll = st.fixed + st.labor;
  const beScoops = (needed) => (perScoop > 0 ? Math.max(0, needed) / perScoop : null);
  const beOpAnnual = beScoops(fixedAll - pintNet), beDebtAnnual = beScoops(fixedAll - pintNet + annualDebt);
  const toDay = (x) => (x === null ? null : x / st.openDays);
  const beOpDay = toDay(beOpAnnual), beDebtDay = toDay(beDebtAnnual);
  const plannedPerDay = st.scoops / st.openDays;
  const beShare = beDebtAnnual === null || st.scoops <= 0 ? null : beDebtAnnual / st.scoops;
  // Scoop price that reaches the target yield on start-up cost, other figures unchanged.
  const priceForTarget = st.scoops > 0 && cost.total > 0
    ? ((((p.targetYield / 100) * cost.total + fixedAll + st.cogs) / k) - st.shakeRev - st.toppingRev - st.pintRev) / st.scoops
    : null;

  // Month by month from opening.
  const H = p.horizonMonths, debtMonths = p.termYears * 12;
  const months = [], flows = [-equity];
  let cum = -equity, paybackMonth = null, trough = -equity, troughMonth = 0, firstProfitMonth = null;
  const lastYear = [];
  for (let m = 1; m <= H; m++) {
    const cal = ((p.startMonth - 1 + m - 1) % 12) + 1;
    const x = monthModel(p, cal, rampAt(p, m));
    const debt = m <= debtMonths ? pmt : 0;
    const cf = x.operating - debt;
    cum += cf;
    if (cum < trough) { trough = cum; troughMonth = m; }
    if (paybackMonth === null && cum >= 0) paybackMonth = m;
    if (firstProfitMonth === null && x.operating > 0) firstProfitMonth = m;
    months.push({ month: m, calendar: MONTHS[cal - 1], revenue: round2(x.revenue), operating: round2(x.operating), debt: round2(debt), cash: round2(cf), cumulative: round2(cum), scoops: round2(x.scoops) });
    flows.push(cf);
    if (m > H - 12) lastYear.push(x.operating);
  }
  const lastYearOperating = lastYear.reduce((a, b) => a + b, 0);
  const salePrice = p.exitMultiple > 0 ? Math.max(0, lastYearOperating) * p.exitMultiple : 0;
  const payoff = p.exitMultiple > 0 ? balanceAfter(loan, p.loanRate, p.termYears, H) : 0;
  const saleProceeds = p.exitMultiple > 0 ? salePrice - payoff : 0;
  const exitFlows = flows.slice();
  exitFlows[H] += saleProceeds;
  const equityIrr = irr(exitFlows);
  const totalCash = flows.slice(1).reduce((a, b) => a + b, 0);
  const profit = totalCash + saleProceeds - equity;
  const multiple = equity > 0 ? (totalCash + saleProceeds) / equity : null;

  const sweep = [0.6, 0.8, 0.9, 1, 1.1, 1.25].map((scale) => {
    const y = yearModel(p, { traffic: scale });
    return { scale, scoopsPerDay: y.scoops / y.openDays, operating: round2(y.operating), yoc: cost.total > 0 ? y.operating / cost.total : null, dscr: annualDebt > 0 ? y.operating / annualDebt : null, cash: round2(y.operating - annualDebt) };
  });
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => {
    const price = p.price * (1 + pct / 100);
    const y = yearModel(p, { price });
    return { pct, price: round2(price), operating: round2(y.operating), yoc: cost.total > 0 ? y.operating / cost.total : null, dscr: annualDebt > 0 ? y.operating / annualDebt : null, cash: round2(y.operating - annualDebt) };
  });

  const findings = [];
  if (st.operating <= 0) findings.push({ severity: "high", title: `At the planned sales the shop does not cover its own running costs: operating profit is ${whole(st.operating)} a year before any loan payment.` });
  else if (annualDebt > 0 && st.operating < annualDebt) findings.push({ severity: "high", title: `Operating profit of ${whole(st.operating)} a year does not cover ${whole(annualDebt)} a year of loan payments (coverage ${dscr.toFixed(2)}). You would fund the gap from your own pocket.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}. That is thin; a rainy summer or a broken freezer could erase it. Ask your lender what they require.` });
  if (perScoop <= 0) findings.push({ severity: "high", title: `Each scoop earns ${dollars(perScoop)} after card fees and its own mix, cone and extras cost, so more scoops cannot cover the fixed costs. Raise the price or cut the per-scoop cost.` });
  else if (beShare !== null && beShare > 0.85) findings.push({ severity: "medium", title: `Break-even needs ${(beShare * 100).toFixed(0)}% of your planned scoops. There is little room for a cool, wet summer.` });
  if (st.operating > 0 && st.lossMonths > 0) findings.push({ severity: "medium", title: `Even in a profitable year, ${st.lossMonths} month(s) lose money before the loan${st.closedMonths > 0 ? ` (${st.closedMonths} of them closed, with rent and other fixed costs still running)` : ""}. The hot season has to carry the rest, so the cash reserve matters.` });
  if (p.exitMultiple === 0 && paybackMonth === null) findings.push({ severity: "medium", title: `Your equity of ${whole(equity)} is not returned from operating cash within ${H} months.` });
  if (trough < -equity * 1.0001) findings.push({ severity: "medium", title: `During ramp-up and the off season cumulative cash falls ${whole(-(trough + equity))} below where you started, at month ${troughMonth}. Hold that much in reserve on top of your equity.` });
  if (paybackMonth !== null && paybackMonth > p.targetPayback) findings.push({ severity: "info", title: `Equity comes back from operations in month ${paybackMonth}, later than your ${p.targetPayback}-month target.` });
  if (p.ownerPay === 0 && p.staffPerOpenHour === 0) findings.push({ severity: "medium", title: `No owner pay and no staff hours are entered, so the shop is assumed to run itself. Add the hours someone will work, paid or not.` });
  if (scoopsPerStaffHour !== null) findings.push({ severity: "info", title: `The plan works out to ${scoopsPerStaffHour.toFixed(1)} scoops per staff hour on average. Compare that with how fast your own crew actually serves at a rush.` });
  findings.push({ severity: "info", title: `Check zoning, health-department food and dairy or frozen-dessert licensing, equipment and hood rules, and sales-tax rules in your city and state before you sign a lease. A shop that cannot be permitted earns nothing.` });
  if (!findings.some((f) => f.severity !== "info")) findings.push({ severity: "info", title: `At these figures the shop clears its costs and loan with ${whole(cashAfterDebt)} a year left once it reaches full sales.` });

  return {
    errors: [], input: p, cost, loan, equity, pmt, annualDebt, steady: st, yieldOnCost, dscr, cashAfterDebt, cashOnCash,
    cogsPct, laborPct, primePct, avgTicket, scoopsPerStaffHour,
    perScoop, beOpDay, beDebtDay, plannedPerDay, beShare, priceForTarget,
    months, paybackMonth, trough, troughMonth, firstProfitMonth, salePrice, payoff, saleProceeds, equityIrr, totalCash, profit, multiple,
    sweep, priceSweep, findings,
  };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  const n1 = (n) => (n === null ? "n/a" : n.toFixed(1));
  return [
    `Ice cream shop: scoops at ${dollars(p.price)}, average ticket ${dollars(r.avgTicket)} (${p.scoopsPerTicket} scoops), ${p.scoopsWeekday} scoops on a typical weekday and ${p.scoopsWeekend} on a weekend day`,
    `Start-up cost ${whole(r.cost.total)} (equipment ${whole(r.cost.equipment)}, build-out ${whole(r.cost.buildOut)}, permits ${whole(r.cost.permits)}, signage and POS ${whole(r.cost.signagePos)}, inventory ${whole(r.cost.inventory)}, cash reserve ${whole(r.cost.cashReserve)}, other ${whole(r.cost.otherStartup)})`,
    `Loan ${whole(r.loan)} at ${p.loanRate}% over ${p.termYears} years = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Full-sales year: sales ${whole(s.revenue)}, running costs ${whole(s.revenue - s.operating)}, operating profit ${whole(s.operating)}; yield on start-up cost ${pct(r.yieldOnCost)}`,
    `Cost of goods ${pct(r.cogsPct)} of sales, labor ${pct(r.laborPct)}, prime cost ${pct(r.primePct)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a year; cash-on-cash ${pct(r.cashOnCash)}`,
    `Break-even: ${n1(r.beOpDay)} scoops per open day to cover running costs, ${n1(r.beDebtDay)} to cover the loan too (plan is ${n1(r.plannedPerDay)} per day); scoop price for a ${p.targetYield}% yield: ${r.priceForTarget === null ? "n/a" : dollars(r.priceForTarget)}`,
    `Over ${p.horizonMonths} months from opening: first profitable month ${r.firstProfitMonth === null ? "none" : r.firstProfitMonth}; equity back from operations ${r.paybackMonth === null ? "not within the projection" : "in month " + r.paybackMonth}; lowest cumulative cash ${whole(r.trough)} at month ${r.troughMonth}; profit ${whole(r.profit)}; equity IRR ${pct(r.equityIrr)}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["sales_vs_plan_pct,scoops_per_open_day,operating_profit_per_year,yield_on_cost_pct,debt_coverage,cash_after_loan_per_year",
    ...r.sweep.map((x) => `${Math.round(x.scale * 100)},${x.scoopsPerDay.toFixed(2)},${x.operating.toFixed(2)},${x.yoc === null ? "" : (x.yoc * 100).toFixed(2)},${x.dscr === null ? "" : x.dscr.toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}

export function monthsCsv(r) {
  return ["month,calendar_month,scoops,sales,operating_profit,loan_payment,cash_after_loan,cumulative_cash",
    ...r.months.map((x) => `${x.month},${x.calendar},${x.scoops.toFixed(0)},${x.revenue.toFixed(2)},${x.operating.toFixed(2)},${x.debt.toFixed(2)},${x.cash.toFixed(2)},${x.cumulative.toFixed(2)}`)].join("\n");
}
