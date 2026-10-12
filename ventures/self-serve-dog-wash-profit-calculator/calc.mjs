// Self-serve and full-service dog wash pro forma: capacity per tub, month-by-month sales with day-of-week and season, variable and fixed
// costs, start-up cost, a loan, break-even washes per day, payback and an equity view. Pure functions, no DOM, no network.
// Every figure is the owner's own input; nothing here is a market price, a traffic estimate or a forecast.

export const SAMPLE = {
  tubs: "4", price: "20", addOnPrice: "4", addOnPct: "35", weekdaysOpen: "5", weekendDaysOpen: "2", openHours: "10", washMinutes: "30", cleanupMinutes: "10",
  washesWeekday: "3", washesWeekend: "6", peakFirstMonth: "5", peakMonths: "5", peakPct: "125", offPct: "85",
  fsWashesPerDay: "2", fsPrice: "55", fsMinutes: "50", fsWage: "18",
  gallonsPerWash: "25", waterPer1000: "11", heatPerWash: "0.35", suppliesPerWash: "1.2", towelPerWash: "0.6", cardPct: "3", repairsPct: "2",
  attendantHours: "4", attendantWage: "16", burdenPct: "10", rent: "2800", utilitiesBase: "350", insurance: "180", softwareMarketing: "250", otherFixed: "150", ownerPay: "0",
  tubCost: "6500", sqft: "1200", buildPerSqft: "45", permits: "4000", signagePos: "6000", inventory: "1500", cashReserve: "15000", otherStartup: "3000",
  startMonth: "3", startUtilPct: "30", rampMonths: "12", ltcPct: "60", loanRate: "8", termYears: "7", horizonMonths: "60", exitMultiple: "", targetYield: "25", targetPayback: "36",
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
  const tubs = num(raw.tubs), price = num(raw.price);
  if (!(tubs >= 1 && tubs <= 50 && Number.isInteger(tubs))) errors.push("Enter the number of tubs as a whole number from 1 to 50.");
  if (!(price > 0)) errors.push("Enter the price of a self-serve wash (more than 0).");
  const addOnPrice = opt(raw.addOnPrice, 0), addOnPct = opt(raw.addOnPct, 0);
  const weekdaysOpen = opt(raw.weekdaysOpen, 5), weekendDaysOpen = opt(raw.weekendDaysOpen, 2);
  const openHours = opt(raw.openHours, 10), washMinutes = opt(raw.washMinutes, 30), cleanupMinutes = opt(raw.cleanupMinutes, 10);
  const washesWeekday = opt(raw.washesWeekday, NaN), washesWeekend = opt(raw.washesWeekend, 0);
  const peakFirstMonth = opt(raw.peakFirstMonth, 1), peakMonths = opt(raw.peakMonths, 0), peakPct = opt(raw.peakPct, 100), offPct = opt(raw.offPct, 100);
  const fsWashesPerDay = opt(raw.fsWashesPerDay, 0), fsPrice = opt(raw.fsPrice, 0), fsMinutes = opt(raw.fsMinutes, 0), fsWage = opt(raw.fsWage, 0);
  const gallonsPerWash = opt(raw.gallonsPerWash, 0), waterPer1000 = opt(raw.waterPer1000, 0), heatPerWash = opt(raw.heatPerWash, 0), suppliesPerWash = opt(raw.suppliesPerWash, 0), towelPerWash = opt(raw.towelPerWash, 0);
  const cardPct = opt(raw.cardPct, 0), repairsPct = opt(raw.repairsPct, 0);
  const attendantHours = opt(raw.attendantHours, 0), attendantWage = opt(raw.attendantWage, 0), burdenPct = opt(raw.burdenPct, 0);
  const rent = opt(raw.rent, 0), utilitiesBase = opt(raw.utilitiesBase, 0), insurance = opt(raw.insurance, 0), softwareMarketing = opt(raw.softwareMarketing, 0), otherFixed = opt(raw.otherFixed, 0), ownerPay = opt(raw.ownerPay, 0);
  const tubCost = opt(raw.tubCost, 0), sqft = opt(raw.sqft, 0), buildPerSqft = opt(raw.buildPerSqft, 0), permits = opt(raw.permits, 0), signagePos = opt(raw.signagePos, 0), inventory = opt(raw.inventory, 0), cashReserve = opt(raw.cashReserve, 0), otherStartup = opt(raw.otherStartup, 0);
  const startMonth = opt(raw.startMonth, 1), startUtilPct = opt(raw.startUtilPct, 100), rampMonths = opt(raw.rampMonths, 0);
  const ltcPct = opt(raw.ltcPct, 0), loanRate = opt(raw.loanRate, 0), termYears = opt(raw.termYears, 5), horizonMonths = opt(raw.horizonMonths, 60), exitMultiple = opt(raw.exitMultiple, 0);
  const targetYield = opt(raw.targetYield, 20), targetPayback = opt(raw.targetPayback, 36);

  if (!(weekdaysOpen >= 0 && weekdaysOpen <= 5 && Number.isInteger(weekdaysOpen))) errors.push("Weekdays open per week must be a whole number from 0 to 5.");
  if (!(weekendDaysOpen >= 0 && weekendDaysOpen <= 2 && Number.isInteger(weekendDaysOpen))) errors.push("Weekend days open per week must be 0, 1 or 2.");
  if (!errors.length && weekdaysOpen + weekendDaysOpen < 1) errors.push("The shop has to be open at least one day a week.");
  if (!(openHours > 0 && openHours <= 24)) errors.push("Open hours per day must be more than 0 and no more than 24.");
  if (!(washMinutes >= 5 && washMinutes <= 180)) errors.push("Minutes a dog spends in the tub (self-serve) must be from 5 to 180.");
  if (!(cleanupMinutes >= 0 && cleanupMinutes <= 60)) errors.push("Minutes to drain and clean a tub between dogs must be from 0 to 60.");
  if (!(washesWeekday >= 0)) errors.push("Enter the average self-serve washes per tub on a weekday (0 or more).");
  if (!(washesWeekend >= 0)) errors.push("Self-serve washes per tub on a weekend day must be 0 or more.");
  if (!(peakFirstMonth >= 1 && peakFirstMonth <= 12 && Number.isInteger(peakFirstMonth))) errors.push("First month of the busy season must be a whole number from 1 to 12.");
  if (!(peakMonths >= 0 && peakMonths <= 12 && Number.isInteger(peakMonths))) errors.push("Length of the busy season must be a whole number of months from 0 to 12.");
  if (!(peakPct >= 0 && peakPct <= 300)) errors.push("Busy-season traffic is a percent of the typical figure, 0 to 300.");
  if (!(offPct >= 0 && offPct <= 300)) errors.push("Slow-season traffic is a percent of the typical figure, 0 to 300.");
  for (const [n, v] of [["Add-on price", addOnPrice], ["Full-service price", fsPrice], ["Full-service wage", fsWage], ["Water cost per 1,000 gallons", waterPer1000], ["Water gallons per wash", gallonsPerWash], ["Water heating per wash", heatPerWash], ["Shampoo and supplies per wash", suppliesPerWash], ["Towel and laundry per wash", towelPerWash], ["Attendant hours", attendantHours], ["Attendant wage", attendantWage], ["Rent", rent], ["Base utilities", utilitiesBase], ["Insurance", insurance], ["Software and marketing", softwareMarketing], ["Other fixed costs", otherFixed], ["Owner pay", ownerPay], ["Cost per tub", tubCost], ["Shop square feet", sqft], ["Build-out cost per square foot", buildPerSqft], ["Permits and legal", permits], ["Signage and point of sale", signagePos], ["Opening inventory", inventory], ["Cash reserve", cashReserve], ["Other start-up cost", otherStartup]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(addOnPct >= 0 && addOnPct <= 100)) errors.push("Share of washes that buy an add-on is a percent, 0 to 100.");
  if (!(fsWashesPerDay >= 0)) errors.push("Full-service dogs per open day must be 0 or more.");
  if (fsWashesPerDay > 0 && !(fsMinutes >= 5 && fsMinutes <= 480)) errors.push("Staff minutes per full-service dog must be from 5 to 480 when you take full-service dogs.");
  if (fsWashesPerDay > 0 && !(fsPrice > 0)) errors.push("Enter a full-service price when you take full-service dogs.");
  if (!(cardPct >= 0 && cardPct < 20)) errors.push("Card fees must be from 0 to under 20 percent of sales.");
  if (!(repairsPct >= 0 && repairsPct < 30)) errors.push("Repairs and replacement reserve must be from 0 to under 30 percent of sales.");
  if (!(burdenPct >= 0 && burdenPct <= 60)) errors.push("Payroll taxes and benefits must be from 0 to 60 percent of wages.");
  if (!(attendantHours <= 24)) errors.push("Attendant hours per open day cannot be more than 24.");
  if (!(startMonth >= 1 && startMonth <= 12 && Number.isInteger(startMonth))) errors.push("Opening month must be a whole number from 1 to 12.");
  if (!(startUtilPct >= 0 && startUtilPct <= 100)) errors.push("Month-1 traffic is a percent of the full-ramp figure, 0 to 100.");
  if (!(rampMonths >= 0 && rampMonths <= 60 && Number.isInteger(rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(ltcPct >= 0 && ltcPct <= 90)) errors.push("Loan as a percent of start-up cost must be from 0 to 90.");
  if (!(loanRate >= 0 && loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(termYears >= 1 && termYears <= 25 && Number.isInteger(termYears))) errors.push("Loan term must be a whole number of years from 1 to 25.");
  if (!(horizonMonths >= 12 && horizonMonths <= 120 && Number.isInteger(horizonMonths))) errors.push("Months to project must be a whole number from 12 to 120.");
  if (!(exitMultiple >= 0 && exitMultiple <= 10)) errors.push("Sale multiple must be from 0 to 10 times a year of operating profit (blank for no sale).");
  if (!(targetYield > 0 && targetYield <= 200)) errors.push("Target yield on start-up cost must be more than 0 and up to 200 percent a year.");
  if (!(targetPayback >= 1 && targetPayback <= 120)) errors.push("Target payback must be from 1 to 120 months.");
  const p = { tubs, price, addOnPrice, addOnPct, weekdaysOpen, weekendDaysOpen, openHours, washMinutes, cleanupMinutes, washesWeekday, washesWeekend, peakFirstMonth, peakMonths, peakPct, offPct, fsWashesPerDay, fsPrice, fsMinutes, fsWage, gallonsPerWash, waterPer1000, heatPerWash, suppliesPerWash, towelPerWash, cardPct, repairsPct, attendantHours, attendantWage, burdenPct, rent, utilitiesBase, insurance, softwareMarketing, otherFixed, ownerPay, tubCost, sqft, buildPerSqft, permits, signagePos, inventory, cashReserve, otherStartup, startMonth, startUtilPct, rampMonths, ltcPct, loanRate, termYears, horizonMonths, exitMultiple, targetYield, targetPayback };
  if (!errors.length) {
    const cap = capacityMinutes(p);
    if (p.fsWashesPerDay * (p.fsMinutes + p.cleanupMinutes) > cap) errors.push("Full-service dogs alone need more tub time than the shop has. Raise the tubs or open hours, or take fewer full-service dogs.");
    else {
      const maxPerTub = (cap - p.fsWashesPerDay * (p.fsMinutes + p.cleanupMinutes)) / (p.washMinutes + p.cleanupMinutes) / p.tubs;
      if (Math.max(p.washesWeekday, p.washesWeekend) > maxPerTub + 1e-9) errors.push(`Planned self-serve washes per tub (${Math.max(p.washesWeekday, p.washesWeekend)}) are more than a tub can do in ${p.openHours} open hours after full-service dogs: about ${Math.floor(maxPerTub * 100) / 100}. Lower the traffic or lengthen the day.`);
    }
  }
  return { errors, ...p };
}

// Tub-minutes available in one open day.
export function capacityMinutes(p) {
  return p.tubs * p.openHours * 60;
}
// Most self-serve washes one tub can do in a day with no full-service dogs.
export function capacityPerTub(p) {
  return Math.floor((p.openHours * 60) / (p.washMinutes + p.cleanupMinutes) * 100) / 100;
}

export function startupCost(p) {
  const equipment = p.tubs * p.tubCost, buildOut = p.sqft * p.buildPerSqft;
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

// Traffic multiplier for a calendar month (1-12): busy season, slow season, never both.
export function seasonFactor(p, calMonth) {
  if (p.peakMonths <= 0) return 1;
  const inPeak = (calMonth - p.peakFirstMonth + 12) % 12 < p.peakMonths;
  return (inPeak ? p.peakPct : p.offPct) / 100;
}

// Share of full-ramp traffic in model month m (1-based): linear from the month-1 figure to 100 percent in the last ramp month.
export function rampAt(p, m) {
  if (p.rampMonths <= 1 || m >= p.rampMonths) return 1;
  return (p.startUtilPct + ((100 - p.startUtilPct) * (m - 1)) / (p.rampMonths - 1)) / 100;
}

// One open day: full-service dogs are served first, self-serve takes the tub time left. Anything above capacity is turned away.
function dayMix(p, demandSelf, demandFull) {
  const cap = capacityMinutes(p);
  const full = Math.min(demandFull, cap / (p.fsMinutes + p.cleanupMinutes || 1));
  const left = cap - full * (p.fsMinutes + p.cleanupMinutes);
  const self = Math.min(demandSelf, Math.max(0, left) / (p.washMinutes + p.cleanupMinutes));
  return { self, full, capped: self < demandSelf - 1e-9 || full < demandFull - 1e-9 };
}

export function openDaysPerMonth(p) {
  return (p.weekdaysOpen + p.weekendDaysOpen) * WEEKS_PER_MONTH;
}
export function variablePerWash(p) {
  return (p.gallonsPerWash * p.waterPer1000) / 1000 + p.heatPerWash + p.suppliesPerWash + p.towelPerWash;
}
export function fixedMonthly(p) {
  return p.rent + p.utilitiesBase + p.insurance + p.softwareMarketing + p.otherFixed + p.ownerPay;
}
export function attendantMonthly(p) {
  return p.attendantHours * openDaysPerMonth(p) * p.attendantWage * (1 + p.burdenPct / 100);
}

// One month of operations at a given share of planned traffic (traffic) and self-serve price.
export function monthModel(p, calMonth, traffic = 1, price = p.price) {
  const f = seasonFactor(p, calMonth) * traffic;
  const wd = dayMix(p, p.tubs * p.washesWeekday * f, p.fsWashesPerDay * f);
  const we = dayMix(p, p.tubs * p.washesWeekend * f, p.fsWashesPerDay * f);
  const wdDays = p.weekdaysOpen * WEEKS_PER_MONTH, weDays = p.weekendDaysOpen * WEEKS_PER_MONTH;
  const self = wd.self * wdDays + we.self * weDays, full = wd.full * wdDays + we.full * weDays;
  const capped = (wd.capped && wdDays > 0) || (we.capped && weDays > 0);
  const selfRev = self * price, addOnRev = self * p.addOnPrice * (p.addOnPct / 100), fullRev = full * p.fsPrice;
  const revenue = selfRev + addOnRev + fullRev;
  const card = revenue * (p.cardPct / 100), repairs = revenue * (p.repairsPct / 100);
  const variable = (self + full) * variablePerWash(p);
  const fullLabor = (full * p.fsMinutes / 60) * p.fsWage;
  const attendant = attendantMonthly(p), fixed = fixedMonthly(p);
  const operating = revenue - card - repairs - variable - fullLabor - attendant - fixed;
  return { self, full, capped, selfRev, addOnRev, fullRev, revenue, card, repairs, variable, fullLabor, attendant, fixed, operating };
}

// Twelve months at full ramp, January to December, at a share of planned traffic.
export function yearModel(p, { traffic = 1, price = p.price } = {}) {
  const t = { self: 0, full: 0, selfRev: 0, addOnRev: 0, fullRev: 0, revenue: 0, card: 0, repairs: 0, variable: 0, fullLabor: 0, attendant: 0, fixed: 0, operating: 0, cappedMonths: 0 };
  for (let m = 1; m <= 12; m++) {
    const x = monthModel(p, m, traffic, price);
    for (const k of Object.keys(t)) if (k !== "cappedMonths") t[k] += x[k];
    if (x.capped) t.cappedMonths++;
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

  // Break-even. Each self-serve wash brings its price plus the expected add-on, less card fees, the repairs reserve and its own supplies.
  const k = 1 - p.cardPct / 100 - p.repairsPct / 100;
  const perWash = (p.price + p.addOnPrice * p.addOnPct / 100) * k - variablePerWash(p);
  const fullNet = st.fullRev * k - st.full * variablePerWash(p) - st.fullLabor;
  const fixedAll = st.fixed + st.attendant;
  const daysYear = openDaysPerMonth(p) * 12;
  const beWashes = (needed) => (perWash > 0 ? Math.max(0, needed) / perWash : null);
  const beOpAnnual = beWashes(fixedAll - fullNet), beDebtAnnual = beWashes(fixedAll - fullNet + annualDebt);
  const toDay = (x) => (x === null ? null : x / daysYear);
  const beOpDay = toDay(beOpAnnual), beDebtDay = toDay(beDebtAnnual);
  const bePerTubDebt = beDebtDay === null ? null : beDebtDay / p.tubs;
  const plannedPerDay = st.self / daysYear;
  const beShare = beDebtAnnual === null || st.self <= 0 ? null : beDebtAnnual / st.self;
  // Self-serve price that reaches the target yield on start-up cost, other figures unchanged.
  const priceForTarget = st.self > 0 && cost.total > 0
    ? ((((p.targetYield / 100) * cost.total + fixedAll + st.variable + st.fullLabor) / k) - st.addOnRev - st.fullRev) / st.self
    : null;

  // Month by month from opening.
  const H = p.horizonMonths, debtMonths = p.termYears * 12;
  const months = [], flows = [-equity];
  let cum = -equity, paybackMonth = null, trough = -equity, troughMonth = 0, firstProfitMonth = null, cappedMonths = 0;
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
    if (x.capped) cappedMonths++;
    months.push({ month: m, calendar: MONTHS[cal - 1], revenue: round2(x.revenue), operating: round2(x.operating), debt: round2(debt), cash: round2(cf), cumulative: round2(cum), washes: round2(x.self + x.full) });
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
  const paybackFromOps = paybackMonth;

  const sweep = [0.6, 0.8, 0.9, 1, 1.1, 1.25].map((scale) => {
    const y = yearModel(p, { traffic: scale });
    return { scale, washesPerDay: y.self / daysYear, operating: round2(y.operating), yoc: cost.total > 0 ? y.operating / cost.total : null, dscr: annualDebt > 0 ? y.operating / annualDebt : null, cash: round2(y.operating - annualDebt) };
  });
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => {
    const price = p.price * (1 + pct / 100);
    const y = yearModel(p, { price });
    return { pct, price: round2(price), operating: round2(y.operating), yoc: cost.total > 0 ? y.operating / cost.total : null, dscr: annualDebt > 0 ? y.operating / annualDebt : null, cash: round2(y.operating - annualDebt) };
  });

  const findings = [];
  if (st.operating <= 0) findings.push({ severity: "high", title: `At the planned traffic the shop does not cover its own running costs: operating profit is ${whole(st.operating)} a year before any loan payment.` });
  else if (annualDebt > 0 && st.operating < annualDebt) findings.push({ severity: "high", title: `Operating profit of ${whole(st.operating)} a year does not cover ${whole(annualDebt)} a year of loan payments (coverage ${dscr.toFixed(2)}). You would fund the gap from your own pocket.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}. That is thin; a slow season or a broken dryer could erase it. Ask your lender what they require.` });
  if (perWash <= 0) findings.push({ severity: "high", title: `Each self-serve wash earns ${dollars(perWash)} after card fees, the repairs reserve and its own water, heat and supplies, so more traffic cannot cover the fixed costs. Raise the price or cut the per-wash cost.` });
  else if (bePerTubDebt !== null && bePerTubDebt > capacityPerTub(p)) findings.push({ severity: "high", title: `Covering costs and the loan needs ${bePerTubDebt.toFixed(1)} self-serve washes per tub per open day, but one tub can do about ${capacityPerTub(p)} in ${p.openHours} hours. The numbers cannot work at this price and cost.` });
  else if (beShare !== null && beShare > 0.85) findings.push({ severity: "medium", title: `Break-even needs ${(beShare * 100).toFixed(0)}% of your planned self-serve washes. There is little room for a slow month.` });
  if (st.cappedMonths > 0) findings.push({ severity: "medium", title: `In ${st.cappedMonths} month(s) of a full year the planned traffic is more than the tubs can wash in your open hours, so the model turns the extra dogs away. Add tubs or hours if you expect that demand.` });
  if (p.exitMultiple === 0 && paybackMonth === null) findings.push({ severity: "medium", title: `Your equity of ${whole(equity)} is not returned from operating cash within ${H} months.` });
  if (trough < -equity * 1.0001) findings.push({ severity: "medium", title: `During ramp-up cumulative cash falls ${whole(-(trough + equity))} below where you started, at month ${troughMonth}. Hold that much in reserve on top of your equity.` });
  if (paybackMonth !== null && paybackMonth > p.targetPayback) findings.push({ severity: "info", title: `Equity comes back from operations in month ${paybackMonth}, later than your ${p.targetPayback}-month target.` });
  if (p.ownerPay === 0 && p.attendantHours === 0) findings.push({ severity: "medium", title: `No owner pay and no attendant hours are entered, so the shop is assumed to run itself. Add the hours someone will work, paid or not.` });
  if (p.fsWashesPerDay > 0) findings.push({ severity: "info", title: `Full-service dogs add ${whole(fullNet)} a year after card fees, supplies and the ${p.fsMinutes} staff minutes each; they also take tub time from self-serve customers.` });
  findings.push({ severity: "info", title: `Check zoning, the sewer and water connection fees, grease and hair interceptor rules, and any animal-establishment or sales-tax rules in your city and state before you sign a lease. A wash bay that cannot be permitted earns nothing.` });
  if (!findings.some((f) => f.severity !== "info")) findings.push({ severity: "info", title: `At these figures the shop clears its costs and loan with ${whole(cashAfterDebt)} a year left once it reaches full traffic.` });

  return {
    errors: [], input: p, cost, loan, equity, pmt, annualDebt, steady: st, yieldOnCost, dscr, cashAfterDebt, cashOnCash,
    perWash, beOpDay, beDebtDay, bePerTubDebt, plannedPerDay, beShare, priceForTarget, capacityPerTub: capacityPerTub(p),
    months, paybackMonth: paybackFromOps, trough, troughMonth, firstProfitMonth, cappedMonths, salePrice, payoff, saleProceeds, equityIrr, totalCash, profit, multiple,
    sweep, priceSweep, findings,
  };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  const n1 = (n) => (n === null ? "n/a" : n.toFixed(1));
  return [
    `Dog wash: ${p.tubs} tubs, self-serve at ${dollars(p.price)} a wash${p.fsWashesPerDay > 0 ? `, plus ${p.fsWashesPerDay} full-service dogs a day at ${dollars(p.fsPrice)}` : ""}`,
    `Start-up cost ${whole(r.cost.total)} (equipment ${whole(r.cost.equipment)}, build-out ${whole(r.cost.buildOut)}, permits ${whole(r.cost.permits)}, signage and POS ${whole(r.cost.signagePos)}, inventory ${whole(r.cost.inventory)}, cash reserve ${whole(r.cost.cashReserve)}, other ${whole(r.cost.otherStartup)})`,
    `Loan ${whole(r.loan)} at ${p.loanRate}% over ${p.termYears} years = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Full-traffic year: sales ${whole(s.revenue)}, running costs ${whole(s.revenue - s.operating)}, operating profit ${whole(s.operating)}; yield on start-up cost ${pct(r.yieldOnCost)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a year; cash-on-cash ${pct(r.cashOnCash)}`,
    `Break-even: ${n1(r.beOpDay)} self-serve washes per open day to cover running costs, ${n1(r.beDebtDay)} to cover the loan too (${n1(r.bePerTubDebt)} per tub; plan is ${n1(r.plannedPerDay)} per day); price for a ${p.targetYield}% yield: ${r.priceForTarget === null ? "n/a" : dollars(r.priceForTarget)}`,
    `Over ${p.horizonMonths} months from opening: first profitable month ${r.firstProfitMonth === null ? "none" : r.firstProfitMonth}; equity back from operations ${r.paybackMonth === null ? "not within the projection" : "in month " + r.paybackMonth}; lowest cumulative cash ${whole(r.trough)} at month ${r.troughMonth}; profit ${whole(r.profit)}; equity IRR ${pct(r.equityIrr)}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["traffic_vs_plan_pct,self_serve_washes_per_open_day,operating_profit_per_year,yield_on_cost_pct,debt_coverage,cash_after_loan_per_year",
    ...r.sweep.map((x) => `${Math.round(x.scale * 100)},${x.washesPerDay.toFixed(2)},${x.operating.toFixed(2)},${x.yoc === null ? "" : (x.yoc * 100).toFixed(2)},${x.dscr === null ? "" : x.dscr.toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}

export function monthsCsv(r) {
  return ["month,calendar_month,washes,sales,operating_profit,loan_payment,cash_after_loan,cumulative_cash",
    ...r.months.map((x) => `${x.month},${x.calendar},${x.washes.toFixed(1)},${x.revenue.toFixed(2)},${x.operating.toFixed(2)},${x.debt.toFixed(2)},${x.cash.toFixed(2)},${x.cumulative.toFixed(2)}`)].join("\n");
}
