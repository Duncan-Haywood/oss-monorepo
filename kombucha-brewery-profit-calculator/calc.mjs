// Kombucha brewery maths: fermenter capacity, fill and brew cycle to gallons a month, revenue by sales channel, per-gallon variable cost, fixed cost
// (rent, chilling and brewhouse energy, labour, insurance), startup cost and a loan, break-even gallons a week, a sixty-month ramp-up with cash trough and payback.
// Pure functions, no DOM, no network. Every figure is the brewer's own input; nothing here is a market price, a yield benchmark or a forecast.

export const SAMPLE = {
  tankGal: "1200", fillPct: "90", brewDays: "14", turnDays: "2", lossPct: "6",
  wholesalePct: "70", wholesalePrice: "11", retailPrice: "30", feesPct: "3", returnsPct: "2",
  ingredientsPerGal: "0.6", flavorPerGal: "0.9", packagingPerGal: "2.2", deliveryPerGal: "0.8", laborMinPerGal: "3", wage: "20",
  rentMonthly: "3500", chillerKw: "8", chillerHours: "24", kwhPrice: "0.13", equipmentPct: "60", waterOtherMonthly: "300", managerMonthly: "4500", insuranceYear: "4800", otherMonthly: "800",
  buildoutPerGal: "15", equipmentTotal: "140000", launch: "15000", depositMonths: "1", contingencyPct: "10",
  startPct: "25", rampMonths: "10",
  ltcPct: "50", loanRate: "9", termYears: "7", targetMargin: "20",
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
  const tankGal = num(raw.tankGal), fillPct = num(raw.fillPct), brewDays = num(raw.brewDays), wholesalePrice = opt(raw.wholesalePrice, NaN), retailPrice = opt(raw.retailPrice, NaN);
  if (!(tankGal > 0)) errors.push("Enter total fermenter capacity in gallons (more than 0). Count tank volume you can actually brew into, not the whole building.");
  if (!(fillPct > 0 && fillPct <= 100)) errors.push("Enter how full each batch fills the tank, as a percent of capacity (more than 0, up to 100).");
  if (!(brewDays >= 1 && brewDays <= 365)) errors.push("Enter days from brew to packaged product, first and second fermentation together (1 to 365).");
  const turnDays = opt(raw.turnDays, 0), lossPct = opt(raw.lossPct, 0);
  const wholesalePct = opt(raw.wholesalePct, 100);
  const feesPct = opt(raw.feesPct, 0), returnsPct = opt(raw.returnsPct, 0);
  const ingredientsPerGal = opt(raw.ingredientsPerGal, 0), flavorPerGal = opt(raw.flavorPerGal, 0), packagingPerGal = opt(raw.packagingPerGal, 0), deliveryPerGal = opt(raw.deliveryPerGal, 0);
  const laborMinPerGal = opt(raw.laborMinPerGal, 0), wage = opt(raw.wage, 0);
  const rentMonthly = opt(raw.rentMonthly, 0), chillerKw = opt(raw.chillerKw, 0), chillerHours = opt(raw.chillerHours, 0), kwhPrice = opt(raw.kwhPrice, 0), equipmentPct = opt(raw.equipmentPct, 0);
  const waterOtherMonthly = opt(raw.waterOtherMonthly, 0), managerMonthly = opt(raw.managerMonthly, 0), insuranceYear = opt(raw.insuranceYear, 0), otherMonthly = opt(raw.otherMonthly, 0);
  const buildoutPerGal = opt(raw.buildoutPerGal, 0), equipmentTotal = opt(raw.equipmentTotal, 0), launch = opt(raw.launch, 0), depositMonths = opt(raw.depositMonths, 0), contingencyPct = opt(raw.contingencyPct, 0);
  const startPct = opt(raw.startPct, 100), rampMonths = opt(raw.rampMonths, 0);
  const ltcPct = opt(raw.ltcPct, 0), loanRate = opt(raw.loanRate, 0), termYears = opt(raw.termYears, 7), targetMargin = opt(raw.targetMargin, 20);
  if (!(wholesalePrice >= 0)) errors.push("Enter the wholesale price per gallon, dollars (0 or more).");
  if (!(retailPrice >= 0)) errors.push("Enter the retail or subscription price per gallon, dollars (0 or more). If you sell only wholesale, enter the same figure and set wholesale share to 100.");
  if (!errors.length && wholesalePrice === 0 && retailPrice === 0) errors.push("Enter a price greater than 0 for at least one sales channel.");
  if (!(turnDays >= 0 && turnDays <= 365)) errors.push("Turnaround days between batches must be 0 to 365 (draining, cleaning, sanitising, new culture).");
  if (!(lossPct >= 0 && lossPct < 90)) errors.push("Batch loss must be 0 to under 90 percent (dumped batches, lees, filling shrink, rejects).");
  if (!(wholesalePct >= 0 && wholesalePct <= 100)) errors.push("Wholesale share of gallons sold must be 0 to 100 percent.");
  if (!(feesPct >= 0 && feesPct < 30)) errors.push("Card, platform and market fees must be from 0 to under 30 percent of revenue.");
  if (!(returnsPct >= 0 && returnsPct < 30)) errors.push("Returns, credits and unsold product must be from 0 to under 30 percent of revenue.");
  for (const [n, v] of [["Tea, sugar and culture per gallon", ingredientsPerGal], ["Flavouring and juice per gallon", flavorPerGal], ["Packaging per gallon", packagingPerGal], ["Delivery per gallon", deliveryPerGal], ["Labour minutes per gallon", laborMinPerGal], ["Hourly wage", wage],
    ["Rent", rentMonthly], ["Chiller and cold-room power", chillerKw], ["Chiller hours per day", chillerHours], ["Electricity price", kwhPrice], ["Pumps, heating and packaging line share", equipmentPct], ["Water and other utilities", waterOtherMonthly], ["Manager or owner draw", managerMonthly], ["Insurance", insuranceYear], ["Other fixed costs", otherMonthly],
    ["Fit-out per gallon of tank capacity", buildoutPerGal], ["Equipment", equipmentTotal], ["Launch cost", launch], ["Deposit months", depositMonths]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(chillerHours <= 24)) errors.push("Chiller hours per day cannot be more than 24.");
  if (!(equipmentPct <= 300)) errors.push("Climate control (cooling, dehumidifying, fans) is a percent of chilling energy, 0 to 300.");
  if (!(contingencyPct >= 0 && contingencyPct <= 100)) errors.push("Contingency must be 0 to 100 percent.");
  if (!(startPct >= 0 && startPct <= 100)) errors.push("Production in month 1 is a percent of full output, 0 to 100.");
  if (!(rampMonths >= 0 && rampMonths <= 60 && Number.isInteger(rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(ltcPct >= 0 && ltcPct <= 100)) errors.push("Loan as a percent of startup cost must be from 0 to 100.");
  if (!(loanRate >= 0 && loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(termYears >= 1 && termYears <= 30 && Number.isInteger(termYears))) errors.push("Loan term must be a whole number of years from 1 to 30.");
  if (!(targetMargin > 0 && targetMargin < 90)) errors.push("Target operating margin must be more than 0 and under 90 percent.");
  return { errors, tankGal, fillPct, brewDays, turnDays, lossPct, wholesalePct, wholesalePrice, retailPrice, feesPct, returnsPct, ingredientsPerGal, flavorPerGal, packagingPerGal, deliveryPerGal, laborMinPerGal, wage,
    rentMonthly, chillerKw, chillerHours, kwhPrice, equipmentPct, waterOtherMonthly, managerMonthly, insuranceYear, otherMonthly, buildoutPerGal, equipmentTotal, launch, depositMonths, contingencyPct,
    startPct, rampMonths, ltcPct, loanRate, termYears, targetMargin };
}

// Output at full production.
export function production(p) {
  const batchesPerYear = 365 / (p.brewDays + p.turnDays);
  const brewedPerYear = p.tankGal * (p.fillPct / 100) * batchesPerYear;
  const gallonsPerYear = brewedPerYear * (1 - p.lossPct / 100);
  return { batchesPerYear, brewedPerYear, gallonsPerYear, gallonsPerMonth: gallonsPerYear / 12, gallonsPerWeek: gallonsPerYear / 52 };
}

export function blendedPrice(p) {
  return (p.wholesalePct / 100) * p.wholesalePrice + (1 - p.wholesalePct / 100) * p.retailPrice;
}
// Net revenue per gallon after fees and returns.
export function netPerGal(p) {
  return blendedPrice(p) * (1 - (p.feesPct + p.returnsPct) / 100);
}
// Variable cost per gallon: inputs and packaging and delivery, plus labour minutes at the hourly wage.
export function variablePerGal(p) {
  return p.ingredientsPerGal + p.flavorPerGal + p.packagingPerGal + p.deliveryPerGal + (p.laborMinPerGal / 60) * p.wage;
}
export function energyMonthly(p) {
  const chilling = p.chillerKw * p.chillerHours * 30 * p.kwhPrice;
  return { chilling, equipment: chilling * p.equipmentPct / 100, total: chilling * (1 + p.equipmentPct / 100) };
}
export function fixedMonthly(p) {
  return p.rentMonthly + energyMonthly(p).total + p.waterOtherMonthly + p.managerMonthly + p.insuranceYear / 12 + p.otherMonthly;
}

export function startupCost(p) {
  const buildout = p.tankGal * p.buildoutPerGal, deposit = p.depositMonths * p.rentMonthly;
  const contingency = (buildout + p.equipmentTotal + p.launch) * p.contingencyPct / 100;
  return { buildout, equipment: p.equipmentTotal, deposit, launch: p.launch, contingency, total: buildout + p.equipmentTotal + deposit + p.launch + contingency };
}

export function payment(loan, annualPct, years) {
  const n = years * 12, r = annualPct / 100 / 12;
  if (loan <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}

// One month. scale multiplies gallons sold (ramp-up, yield change); priceScale multiplies prices.
function month(p, { scale = 1, priceScale = 1 } = {}) {
  const gallons = production(p).gallonsPerMonth * scale;
  const gross = gallons * blendedPrice(p) * priceScale;
  const lost = gross * (p.feesPct + p.returnsPct) / 100;
  const revenue = gross - lost;
  const variable = gallons * variablePerGal(p);
  const fixed = fixedMonthly(p);
  return { gallons, gross, lost, revenue, variable, fixed, profit: revenue - variable - fixed };
}

export function scaleAt(p, m) {
  if (p.rampMonths <= 1 || m >= p.rampMonths) return 1;
  return (p.startPct + (100 - p.startPct) * (m - 1) / (p.rampMonths - 1)) / 100;
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const prod = production(p);
  const cost = startupCost(p);
  const loan = cost.total * p.ltcPct / 100, equity = cost.total - loan;
  const pmt = payment(loan, p.loanRate, p.termYears);
  const st = month(p);
  const margin = st.revenue > 0 ? st.profit / st.revenue : null;
  const energy = energyMonthly(p);
  const annualProfit = st.profit * 12, annualDebt = pmt * 12;
  const dscr = annualDebt > 0 ? annualProfit / annualDebt : null;
  const cashAfterDebt = st.profit - pmt;
  const net = netPerGal(p), vc = variablePerGal(p), contribution = net - vc;

  // Closed form: profit is linear in gallons sold, so break-even gallons = fixed / contribution per gallon.
  const beGalOps = contribution > 0 ? st.fixed / contribution : null;
  const beGalDebt = contribution > 0 ? (st.fixed + pmt) / contribution : null;
  const bePctOps = beGalOps === null ? null : beGalOps / prod.gallonsPerMonth * 100;
  const bePctDebt = beGalDebt === null ? null : beGalDebt / prod.gallonsPerMonth * 100;
  // Blended price that reaches the target margin: net revenue R satisfies R - V - F = m x R, R = (V + F) / (1 - m).
  const m = p.targetMargin / 100, v = (p.feesPct + p.returnsPct) / 100;
  const needNetRevenue = (st.variable + st.fixed) / (1 - m);
  const priceFactor = st.gross > 0 && v < 1 ? needNetRevenue / (st.gross * (1 - v)) : null;

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

  const yieldSweep = [0.6, 0.7, 0.8, 0.9, 1, 1.1].map((scale) => {
    const s = month(p, { scale });
    return { scale, gallons: s.gallons, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) };
  });
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => {
    const s = month(p, { priceScale: 1 + pct / 100 });
    return { pct, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) };
  });
  const powerSweep = [-25, 0, 25, 50].map((pct) => {
    const s = month({ ...p, kwhPrice: p.kwhPrice * (1 + pct / 100) });
    return { pct, profit: round2(s.profit), cash: round2(s.profit - pmt) };
  });

  const findings = [];
  if (contribution <= 0) findings.push({ severity: "high", title: `Each gallon nets ${whole(net)} after fees and returns but costs ${whole(vc)} in inputs, packaging, delivery and labour (${net.toFixed(2)} vs ${vc.toFixed(2)} dollars). Selling more loses more money. Price or per-gallon cost has to change.` });
  if (st.profit <= 0 && contribution > 0) findings.push({ severity: "high", title: `At full production the brewery loses ${whole(-st.profit)} a month before any loan payment. It needs ${beGalOps === null ? "more" : Math.round(beGalOps).toLocaleString("en-US")} gallons a month to cover costs and your plan sells ${Math.round(prod.gallonsPerMonth).toLocaleString("en-US")}.` });
  else if (st.profit > 0 && cashAfterDebt < 0) findings.push({ severity: "high", title: `Full-production profit of ${whole(st.profit)} a month does not cover the ${whole(pmt)} loan payment. You would fund ${whole(-cashAfterDebt)} a month from your own pocket.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}, thin for a brewery where one dumped batch can erase a week of margin.` });
  if (bePctDebt !== null && bePctDebt > 100) findings.push({ severity: "high", title: `Covering costs and the loan needs ${bePctDebt.toFixed(0)}% of planned output, which the tank capacity cannot produce at these prices.` });
  else if (bePctDebt !== null && bePctDebt > 85) findings.push({ severity: "medium", title: `Costs and the loan take ${bePctDebt.toFixed(0)}% of planned output to cover, so a bad cycle or a lost customer puts you underwater.` });
  const sold = prod.gallonsPerWeek;
  findings.push({ severity: "info", title: `Planned output is about ${Math.round(sold).toLocaleString("en-US")} gallons a week (${prod.batchesPerYear.toFixed(1)} batches a year). Check that you have buyers or taproom volume for every gallon before building; selling the last 30% is what usually breaks the plan.` });
  const energyShare = st.revenue > 0 ? energy.total / st.revenue : 0;
  if (energyShare > 0.25) findings.push({ severity: "medium", title: `Chilling and brewhouse energy take ${(energyShare * 100).toFixed(0)}% of revenue. Electricity price and equipment efficiency decide this business; the power table below shows how far it moves.` });
  if (reserve > 0) findings.push({ severity: "medium", title: `During ramp-up the cash drops ${whole(reserve)} below where you started, at month ${troughMonth}. Hold that much in reserve on top of the ${whole(equity)} of equity.` });
  if (paybackMonth === null) findings.push({ severity: "medium", title: `Your ${whole(equity)} of equity is not returned within ${HORIZON_MONTHS} months.` });
  if (p.lossPct < 3) findings.push({ severity: "medium", title: `${p.lossPct}% batch loss is very low for a new brewery. Check it against your own batch records before you rely on it.` });
  findings.push({ severity: "info", title: `Check food-safety licensing, alcohol-content testing and labelling rules (kombucha that tests above 0.5% alcohol is regulated as an alcoholic beverage), zoning and power capacity before you build. This page does none of that.` });
  if (!findings.some((x) => x.severity === "high" || x.severity === "medium")) findings.push({ severity: "info", title: `At these figures the brewery clears its costs and loan with ${whole(cashAfterDebt)} a month left at full production.` });

  return { errors: [], input: p, prod, cost, loan, equity, pmt, steady: st, energy, net, variable: vc, contribution, margin, annualProfit, dscr, cashAfterDebt,
    beGalOps, beGalDebt, bePctOps, bePctDebt, priceFactor, paybackMonth, firstProfitMonth, trough, troughMonth, reserve,
    yearProfit: yearProfit.map(round2), yearCash: yearCash.map(round2), yieldSweep, priceSweep, powerSweep, findings };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  const gallons = (n) => (n === null ? "n/a" : Math.round(n).toLocaleString("en-US"));
  return [
    `Kombucha brewery: ${p.tankGal.toLocaleString("en-US")} gal of fermenters filled ${p.fillPct}%, ${p.brewDays}-day brew plus ${p.turnDays} days turnaround, ${p.lossPct}% loss`,
    `Output: ${gallons(r.prod.gallonsPerMonth)} gallons a month (${gallons(r.prod.gallonsPerWeek)} a week, ${r.prod.batchesPerYear.toFixed(1)} batches a year)`,
    `Per gallon: blended price ${blendedPrice(p).toFixed(2)} dollars, net ${r.net.toFixed(2)} dollars after fees and returns, variable cost ${r.variable.toFixed(2)} dollars, contribution ${r.contribution.toFixed(2)} dollars`,
    `Full-production month: revenue ${whole(s.revenue)}, variable ${whole(s.variable)}, fixed ${whole(s.fixed)} (chilling and brewhouse energy ${whole(r.energy.total)}), profit ${whole(s.profit)} (${pct(r.margin)} margin)`,
    `Startup ${whole(r.cost.total)} (fit-out ${whole(r.cost.buildout)}, equipment ${whole(r.cost.equipment)}, deposit ${whole(r.cost.deposit)}, launch ${whole(r.cost.launch)}, contingency ${whole(r.cost.contingency)}); loan ${whole(r.loan)} = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a month`,
    `Break-even: ${gallons(r.beGalOps)} gallons a month to cover operating costs (${r.bePctOps === null ? "n/a" : r.bePctOps.toFixed(0) + "% of output"}), ${gallons(r.beGalDebt)} to cover the loan too (${r.bePctDebt === null ? "n/a" : r.bePctDebt.toFixed(0) + "%"}); prices ${r.priceFactor === null ? "cannot reach" : (r.priceFactor >= 1 ? "up " : "down ") + Math.abs((r.priceFactor - 1) * 100).toFixed(0) + "% from your figures to reach"} a ${p.targetMargin}% margin`,
    `Ramp: first profitable month ${r.firstProfitMonth ?? "not within 60"}; lowest cash at month ${r.troughMonth || 0} (reserve ${whole(r.reserve)}); equity back ${r.paybackMonth === null ? "not within 60 months" : "in month " + r.paybackMonth}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["output_vs_plan_pct,gallons_per_month,profit_per_month,margin_pct,cash_after_loan_per_month",
    ...r.yieldSweep.map((x) => `${Math.round(x.scale * 100)},${Math.round(x.gallons)},${x.profit.toFixed(2)},${x.margin === null ? "" : (x.margin * 100).toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}
