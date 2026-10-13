// Hydroponic and indoor-farm maths: growing area and crop cycle to heads a month, revenue by sales channel, per-head variable cost, fixed cost
// (rent, lights and climate, labour, insurance), startup cost and a loan, break-even heads a week, a sixty-month ramp-up with cash trough and payback.
// Pure functions, no DOM, no network. Every figure is the grower's own input; nothing here is a market price, a yield benchmark or a forecast.

export const SAMPLE = {
  growSqft: "2000", plantsPerSqft: "6", cycleDays: "35", turnDays: "3", lossPct: "8",
  wholesalePct: "60", wholesalePrice: "1.80", retailPrice: "3.25", feesPct: "3", returnsPct: "2",
  seedPerHead: "0.06", nutrientsPerHead: "0.07", packagingPerHead: "0.22", deliveryPerHead: "0.10", laborMinPerHead: "0.8", wage: "17",
  rentMonthly: "2400", lightKw: "24", lightHours: "16", kwhPrice: "0.13", climatePct: "50", waterOtherMonthly: "350", managerMonthly: "3200", insuranceYear: "2400", otherMonthly: "400",
  buildoutPerSqft: "40", equipmentTotal: "55000", launch: "8000", depositMonths: "1", contingencyPct: "10",
  startPct: "20", rampMonths: "9",
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
  const growSqft = num(raw.growSqft), plantsPerSqft = num(raw.plantsPerSqft), cycleDays = num(raw.cycleDays), wholesalePrice = opt(raw.wholesalePrice, NaN), retailPrice = opt(raw.retailPrice, NaN);
  if (!(growSqft > 0)) errors.push("Enter the growing area in square feet (more than 0). Count planted bench or tray area, not the whole building.");
  if (!(plantsPerSqft > 0 && plantsPerSqft <= 100)) errors.push("Enter plants per square foot of growing area (more than 0, up to 100).");
  if (!(cycleDays >= 1 && cycleDays <= 365)) errors.push("Enter days from transplant to harvest (1 to 365).");
  const turnDays = opt(raw.turnDays, 0), lossPct = opt(raw.lossPct, 0);
  const wholesalePct = opt(raw.wholesalePct, 100);
  const feesPct = opt(raw.feesPct, 0), returnsPct = opt(raw.returnsPct, 0);
  const seedPerHead = opt(raw.seedPerHead, 0), nutrientsPerHead = opt(raw.nutrientsPerHead, 0), packagingPerHead = opt(raw.packagingPerHead, 0), deliveryPerHead = opt(raw.deliveryPerHead, 0);
  const laborMinPerHead = opt(raw.laborMinPerHead, 0), wage = opt(raw.wage, 0);
  const rentMonthly = opt(raw.rentMonthly, 0), lightKw = opt(raw.lightKw, 0), lightHours = opt(raw.lightHours, 0), kwhPrice = opt(raw.kwhPrice, 0), climatePct = opt(raw.climatePct, 0);
  const waterOtherMonthly = opt(raw.waterOtherMonthly, 0), managerMonthly = opt(raw.managerMonthly, 0), insuranceYear = opt(raw.insuranceYear, 0), otherMonthly = opt(raw.otherMonthly, 0);
  const buildoutPerSqft = opt(raw.buildoutPerSqft, 0), equipmentTotal = opt(raw.equipmentTotal, 0), launch = opt(raw.launch, 0), depositMonths = opt(raw.depositMonths, 0), contingencyPct = opt(raw.contingencyPct, 0);
  const startPct = opt(raw.startPct, 100), rampMonths = opt(raw.rampMonths, 0);
  const ltcPct = opt(raw.ltcPct, 0), loanRate = opt(raw.loanRate, 0), termYears = opt(raw.termYears, 7), targetMargin = opt(raw.targetMargin, 20);
  if (!(wholesalePrice >= 0)) errors.push("Enter the wholesale price per head, dollars (0 or more).");
  if (!(retailPrice >= 0)) errors.push("Enter the retail or subscription price per head, dollars (0 or more). If you sell only wholesale, enter the same figure and set wholesale share to 100.");
  if (!errors.length && wholesalePrice === 0 && retailPrice === 0) errors.push("Enter a price greater than 0 for at least one sales channel.");
  if (!(turnDays >= 0 && turnDays <= 365)) errors.push("Turnaround days between crops must be 0 to 365 (cleaning, reseeding, nursery lag).");
  if (!(lossPct >= 0 && lossPct < 90)) errors.push("Crop loss must be 0 to under 90 percent (failed plants, trimming, rejects).");
  if (!(wholesalePct >= 0 && wholesalePct <= 100)) errors.push("Wholesale share of heads sold must be 0 to 100 percent.");
  if (!(feesPct >= 0 && feesPct < 30)) errors.push("Card, platform and market fees must be from 0 to under 30 percent of revenue.");
  if (!(returnsPct >= 0 && returnsPct < 30)) errors.push("Returns, credits and unsold product must be from 0 to under 30 percent of revenue.");
  for (const [n, v] of [["Seed and media per head", seedPerHead], ["Nutrients per head", nutrientsPerHead], ["Packaging per head", packagingPerHead], ["Delivery per head", deliveryPerHead], ["Labour minutes per head", laborMinPerHead], ["Hourly wage", wage],
    ["Rent", rentMonthly], ["Light power", lightKw], ["Light hours per day", lightHours], ["Electricity price", kwhPrice], ["Climate control share", climatePct], ["Water and other utilities", waterOtherMonthly], ["Manager or owner draw", managerMonthly], ["Insurance", insuranceYear], ["Other fixed costs", otherMonthly],
    ["Fit-out per square foot", buildoutPerSqft], ["Equipment", equipmentTotal], ["Launch cost", launch], ["Deposit months", depositMonths]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(lightHours <= 24)) errors.push("Light hours per day cannot be more than 24.");
  if (!(climatePct <= 300)) errors.push("Climate control (cooling, dehumidifying, fans) is a percent of lighting energy, 0 to 300.");
  if (!(contingencyPct >= 0 && contingencyPct <= 100)) errors.push("Contingency must be 0 to 100 percent.");
  if (!(startPct >= 0 && startPct <= 100)) errors.push("Production in month 1 is a percent of full output, 0 to 100.");
  if (!(rampMonths >= 0 && rampMonths <= 60 && Number.isInteger(rampMonths))) errors.push("Ramp-up months must be a whole number from 0 to 60.");
  if (!(ltcPct >= 0 && ltcPct <= 100)) errors.push("Loan as a percent of startup cost must be from 0 to 100.");
  if (!(loanRate >= 0 && loanRate <= 30)) errors.push("Loan interest rate must be from 0 to 30 percent.");
  if (!(termYears >= 1 && termYears <= 30 && Number.isInteger(termYears))) errors.push("Loan term must be a whole number of years from 1 to 30.");
  if (!(targetMargin > 0 && targetMargin < 90)) errors.push("Target operating margin must be more than 0 and under 90 percent.");
  return { errors, growSqft, plantsPerSqft, cycleDays, turnDays, lossPct, wholesalePct, wholesalePrice, retailPrice, feesPct, returnsPct, seedPerHead, nutrientsPerHead, packagingPerHead, deliveryPerHead, laborMinPerHead, wage,
    rentMonthly, lightKw, lightHours, kwhPrice, climatePct, waterOtherMonthly, managerMonthly, insuranceYear, otherMonthly, buildoutPerSqft, equipmentTotal, launch, depositMonths, contingencyPct,
    startPct, rampMonths, ltcPct, loanRate, termYears, targetMargin };
}

// Output at full production.
export function production(p) {
  const cyclesPerYear = 365 / (p.cycleDays + p.turnDays);
  const plantedPerYear = p.growSqft * p.plantsPerSqft * cyclesPerYear;
  const headsPerYear = plantedPerYear * (1 - p.lossPct / 100);
  return { cyclesPerYear, plantedPerYear, headsPerYear, headsPerMonth: headsPerYear / 12, headsPerWeek: headsPerYear / 52 };
}

export function blendedPrice(p) {
  return (p.wholesalePct / 100) * p.wholesalePrice + (1 - p.wholesalePct / 100) * p.retailPrice;
}
// Net revenue per head after fees and returns.
export function netPerHead(p) {
  return blendedPrice(p) * (1 - (p.feesPct + p.returnsPct) / 100);
}
// Variable cost per head: inputs and packaging and delivery, plus labour minutes at the hourly wage.
export function variablePerHead(p) {
  return p.seedPerHead + p.nutrientsPerHead + p.packagingPerHead + p.deliveryPerHead + (p.laborMinPerHead / 60) * p.wage;
}
export function energyMonthly(p) {
  const lighting = p.lightKw * p.lightHours * 30 * p.kwhPrice;
  return { lighting, climate: lighting * p.climatePct / 100, total: lighting * (1 + p.climatePct / 100) };
}
export function fixedMonthly(p) {
  return p.rentMonthly + energyMonthly(p).total + p.waterOtherMonthly + p.managerMonthly + p.insuranceYear / 12 + p.otherMonthly;
}

export function startupCost(p) {
  const buildout = p.growSqft * p.buildoutPerSqft, deposit = p.depositMonths * p.rentMonthly;
  const contingency = (buildout + p.equipmentTotal + p.launch) * p.contingencyPct / 100;
  return { buildout, equipment: p.equipmentTotal, deposit, launch: p.launch, contingency, total: buildout + p.equipmentTotal + deposit + p.launch + contingency };
}

export function payment(loan, annualPct, years) {
  const n = years * 12, r = annualPct / 100 / 12;
  if (loan <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}

// One month. scale multiplies heads sold (ramp-up, yield change); priceScale multiplies prices.
function month(p, { scale = 1, priceScale = 1 } = {}) {
  const heads = production(p).headsPerMonth * scale;
  const gross = heads * blendedPrice(p) * priceScale;
  const lost = gross * (p.feesPct + p.returnsPct) / 100;
  const revenue = gross - lost;
  const variable = heads * variablePerHead(p);
  const fixed = fixedMonthly(p);
  return { heads, gross, lost, revenue, variable, fixed, profit: revenue - variable - fixed };
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
  const net = netPerHead(p), vc = variablePerHead(p), contribution = net - vc;

  // Closed form: profit is linear in heads sold, so break-even heads = fixed / contribution per head.
  const beHeadsOps = contribution > 0 ? st.fixed / contribution : null;
  const beHeadsDebt = contribution > 0 ? (st.fixed + pmt) / contribution : null;
  const bePctOps = beHeadsOps === null ? null : beHeadsOps / prod.headsPerMonth * 100;
  const bePctDebt = beHeadsDebt === null ? null : beHeadsDebt / prod.headsPerMonth * 100;
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
    return { scale, heads: s.heads, profit: round2(s.profit), margin: s.revenue > 0 ? s.profit / s.revenue : null, cash: round2(s.profit - pmt) };
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
  if (contribution <= 0) findings.push({ severity: "high", title: `Each head nets ${whole(net)} after fees and returns but costs ${whole(vc)} in inputs, packaging, delivery and labour (${net.toFixed(2)} vs ${vc.toFixed(2)} dollars). Selling more loses more money. Price or per-head cost has to change.` });
  if (st.profit <= 0 && contribution > 0) findings.push({ severity: "high", title: `At full production the farm loses ${whole(-st.profit)} a month before any loan payment. It needs ${beHeadsOps === null ? "more" : Math.round(beHeadsOps).toLocaleString("en-US")} heads a month to cover costs and your plan sells ${Math.round(prod.headsPerMonth).toLocaleString("en-US")}.` });
  else if (st.profit > 0 && cashAfterDebt < 0) findings.push({ severity: "high", title: `Full-production profit of ${whole(st.profit)} a month does not cover the ${whole(pmt)} loan payment. You would fund ${whole(-cashAfterDebt)} a month from your own pocket.` });
  else if (dscr !== null && dscr < 1.25) findings.push({ severity: "medium", title: `Debt coverage is ${dscr.toFixed(2)}, thin for a crop business where one failed cycle can erase a month.` });
  if (bePctDebt !== null && bePctDebt > 100) findings.push({ severity: "high", title: `Covering costs and the loan needs ${bePctDebt.toFixed(0)}% of planned output, which the growing area cannot produce at these prices.` });
  else if (bePctDebt !== null && bePctDebt > 85) findings.push({ severity: "medium", title: `Costs and the loan take ${bePctDebt.toFixed(0)}% of planned output to cover, so a bad cycle or a lost customer puts you underwater.` });
  const sold = prod.headsPerWeek;
  findings.push({ severity: "info", title: `Planned output is about ${Math.round(sold).toLocaleString("en-US")} heads a week (${prod.cyclesPerYear.toFixed(1)} crop cycles a year). Check that you have buyers for every one of them before building; selling the last 30% is what usually breaks the plan.` });
  const energyShare = st.revenue > 0 ? energy.total / st.revenue : 0;
  if (energyShare > 0.25) findings.push({ severity: "medium", title: `Lights and climate control take ${(energyShare * 100).toFixed(0)}% of revenue. Electricity price and fixture efficiency decide this business; the power table below shows how far it moves.` });
  if (reserve > 0) findings.push({ severity: "medium", title: `During ramp-up the cash drops ${whole(reserve)} below where you started, at month ${troughMonth}. Hold that much in reserve on top of the ${whole(equity)} of equity.` });
  if (paybackMonth === null) findings.push({ severity: "medium", title: `Your ${whole(equity)} of equity is not returned within ${HORIZON_MONTHS} months.` });
  if (p.lossPct < 3) findings.push({ severity: "medium", title: `${p.lossPct}% crop loss is very low for a new indoor farm. Check it against your own harvest records before you rely on it.` });
  findings.push({ severity: "info", title: `Check food-safety rules for your sales channels (many wholesale buyers ask for a food-safety audit or insurance), local zoning and power capacity before you build. This page does none of that.` });
  if (!findings.some((x) => x.severity === "high" || x.severity === "medium")) findings.push({ severity: "info", title: `At these figures the farm clears its costs and loan with ${whole(cashAfterDebt)} a month left at full production.` });

  return { errors: [], input: p, prod, cost, loan, equity, pmt, steady: st, energy, net, variable: vc, contribution, margin, annualProfit, dscr, cashAfterDebt,
    beHeadsOps, beHeadsDebt, bePctOps, bePctDebt, priceFactor, paybackMonth, firstProfitMonth, trough, troughMonth, reserve,
    yearProfit: yearProfit.map(round2), yearCash: yearCash.map(round2), yieldSweep, priceSweep, powerSweep, findings };
}

export function summaryText(r) {
  const p = r.input, s = r.steady;
  const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
  const heads = (n) => (n === null ? "n/a" : Math.round(n).toLocaleString("en-US"));
  return [
    `Indoor farm: ${p.growSqft.toLocaleString("en-US")} sq ft growing, ${p.plantsPerSqft} plants per sq ft, ${p.cycleDays}-day crop plus ${p.turnDays} days turnaround, ${p.lossPct}% loss`,
    `Output: ${heads(r.prod.headsPerMonth)} heads a month (${heads(r.prod.headsPerWeek)} a week, ${r.prod.cyclesPerYear.toFixed(1)} cycles a year)`,
    `Per head: blended price ${blendedPrice(p).toFixed(2)} dollars, net ${r.net.toFixed(2)} dollars after fees and returns, variable cost ${r.variable.toFixed(2)} dollars, contribution ${r.contribution.toFixed(2)} dollars`,
    `Full-production month: revenue ${whole(s.revenue)}, variable ${whole(s.variable)}, fixed ${whole(s.fixed)} (lights and climate ${whole(r.energy.total)}), profit ${whole(s.profit)} (${pct(r.margin)} margin)`,
    `Startup ${whole(r.cost.total)} (fit-out ${whole(r.cost.buildout)}, equipment ${whole(r.cost.equipment)}, deposit ${whole(r.cost.deposit)}, launch ${whole(r.cost.launch)}, contingency ${whole(r.cost.contingency)}); loan ${whole(r.loan)} = ${whole(r.pmt)} a month; equity ${whole(r.equity)}`,
    `Debt coverage ${r.dscr === null ? "n/a (no loan)" : r.dscr.toFixed(2)}; cash after loan ${whole(r.cashAfterDebt)} a month`,
    `Break-even: ${heads(r.beHeadsOps)} heads a month to cover operating costs (${r.bePctOps === null ? "n/a" : r.bePctOps.toFixed(0) + "% of output"}), ${heads(r.beHeadsDebt)} to cover the loan too (${r.bePctDebt === null ? "n/a" : r.bePctDebt.toFixed(0) + "%"}); prices ${r.priceFactor === null ? "cannot reach" : (r.priceFactor >= 1 ? "up " : "down ") + Math.abs((r.priceFactor - 1) * 100).toFixed(0) + "% from your figures to reach"} a ${p.targetMargin}% margin`,
    `Ramp: first profitable month ${r.firstProfitMonth ?? "not within 60"}; lowest cash at month ${r.troughMonth || 0} (reserve ${whole(r.reserve)}); equity back ${r.paybackMonth === null ? "not within 60 months" : "in month " + r.paybackMonth}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["output_vs_plan_pct,heads_per_month,profit_per_month,margin_pct,cash_after_loan_per_month",
    ...r.yieldSweep.map((x) => `${Math.round(x.scale * 100)},${Math.round(x.heads)},${x.profit.toFixed(2)},${x.margin === null ? "" : (x.margin * 100).toFixed(2)},${x.cash.toFixed(2)}`)].join("\n");
}
