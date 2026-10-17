// Convenience store and gas station monthly profit from the operator's own figures.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.

export const CATEGORIES = [
  { id: "tobacco", label: "Tobacco and vape" },
  { id: "food", label: "Grocery, snacks, drinks and food service" },
  { id: "beer", label: "Beer, wine and alcohol" },
];

function num(raw, name, errors, { required = false, min = 0, max = Infinity, gt = null } = {}) {
  const s = raw === undefined || raw === null ? "" : String(raw).trim().replace(/[$,%\s]/g, "");
  if (s === "") {
    if (required) errors.push(`${name} is required.`);
    return 0;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) { errors.push(`${name} must be a number.`); return 0; }
  if (v < min) { errors.push(`${name} cannot be below ${min}.`); return 0; }
  if (v > max) { errors.push(`${name} cannot be above ${max}.`); return 0; }
  if (gt !== null && !(v > gt)) { errors.push(`${name} must be greater than ${gt}.`); return 0; }
  return v;
}

export function parse(input) {
  const errors = [];
  const g = {
    gallons: num(input.gallons, "Gallons sold per month", errors, { required: true, gt: 0 }),
    price: num(input.price, "Pump price per gallon", errors, { required: true, gt: 0 }),
    cost: num(input.cost, "Delivered fuel cost per gallon (rack, freight, taxes)", errors, { required: true, gt: 0 }),
    cardShare: num(input.cardShare, "Fuel sales paid by card %", errors, { max: 100 }),
    feePct: num(input.feePct, "Card fee % of the sale", errors, { max: 20 }),
    perTxn: num(input.perTxn, "Card fee per transaction, $", errors, { max: 5 }),
    avgFill: num(input.avgFill, "Average gallons per fill-up", errors, { gt: 0, max: 200 }),
    insideCardPct: num(input.insideCardPct, "Inside sales paid by card %", errors, { max: 100 }),
    shrinkPct: num(input.shrinkPct, "Shrink and waste % of inside sales", errors, { max: 50 }),
    otherIncome: num(input.otherIncome, "Lottery, ATM and other commissions per month", errors),
    hours: num(input.hours, "Paid labor hours per month", errors, { required: true }),
    wage: num(input.wage, "Average hourly wage", errors, { required: true }),
    burdenPct: num(input.burdenPct, "Payroll burden %", errors, { max: 100 }),
    rent: num(input.rent, "Rent or mortgage interest per month", errors),
    utilities: num(input.utilities, "Utilities per month", errors),
    insurance: num(input.insurance, "Insurance per month", errors),
    propTax: num(input.propTax, "Property tax per month", errors),
    otherFixed: num(input.otherFixed, "Other fixed cost per month (licenses, software, repairs)", errors),
    debt: num(input.debt, "Loan payments per month", errors),
  };
  if (g.cardShare > 0 && g.perTxn > 0 && !(g.avgFill > 0)) errors.push("Average gallons per fill-up is required when a per-transaction fee is set.");
  const cats = CATEGORIES.map((c) => ({
    id: c.id, label: c.label,
    sales: num(input[`${c.id}_sales`], `${c.label}: sales per month`, errors),
    margin: num(input[`${c.id}_margin`], `${c.label}: gross margin %`, errors, { max: 100 }),
  }));
  return { errors, g, cats };
}

export function compute(input) {
  const { errors, g, cats } = parse(input);
  if (errors.length) return { errors };
  const share = g.cardShare / 100;
  const fuelRevenue = g.gallons * g.price;
  const fuelGross = g.gallons * (g.price - g.cost);
  const txns = g.avgFill > 0 ? (g.gallons * share) / g.avgFill : 0;
  const fuelFees = fuelRevenue * share * (g.feePct / 100) + txns * g.perTxn;
  const fuelNet = fuelGross - fuelFees;
  const grossCpg = g.price - g.cost;
  const netCpg = fuelNet / g.gallons;

  const insideSales = cats.reduce((s, c) => s + c.sales, 0);
  const insideGross = cats.reduce((s, c) => s + c.sales * (c.margin / 100), 0);
  const insideFees = insideSales * (g.insideCardPct / 100) * (g.feePct / 100);
  const shrink = insideSales * (g.shrinkPct / 100);
  const insideNet = insideGross - insideFees - shrink;
  const labor = g.hours * g.wage * (1 + g.burdenPct / 100);
  const fixed = g.rent + g.utilities + g.insurance + g.propTax + g.otherFixed;

  const nonFuel = insideNet + g.otherIncome - labor - fixed; // everything except fuel, before debt
  const opProfit = fuelNet + nonFuel;
  const netAfterDebt = opProfit - g.debt;
  const dscr = g.debt > 0 ? opProfit / g.debt : null;
  const fuelShare = fuelNet + insideNet + g.otherIncome > 0 ? fuelNet / (fuelNet + insideNet + g.otherIncome) : null;
  const feeShareOfFuelGross = fuelGross > 0 ? fuelFees / fuelGross : null;
  const beGallons = netCpg > 0 ? Math.max(0, (g.debt - nonFuel) / netCpg) : null;
  const requiredNetCpg = (g.debt - nonFuel) / g.gallons;
  const insideMargin = insideSales > 0 ? insideGross / insideSales : null;

  const profitAt = (cpgDelta, galMult) => {
    const gal = g.gallons * galMult;
    return gal * (netCpg + cpgDelta) + nonFuel - g.debt; // insideNet/nonFuel held fixed
  };
  const cpgSweep = [-0.1, -0.05, 0, 0.05, 0.1].map((d) => ({ cents: Math.round(d * 100), profit: profitAt(d, 1) }));
  const volumeSweep = [-30, -20, -10, 0, 10, 20].map((p) => ({ pct: p, profit: profitAt(0, 1 + p / 100) }));

  const findings = [];
  if (netCpg < 0) findings.push({ severity: "high", title: `Fuel loses ${(-netCpg * 100).toFixed(1)} cents a gallon after card fees; every gallon sold costs you money before labor or rent.` });
  if (netAfterDebt < 0) findings.push({ severity: "high", title: `The store loses ${money(-netAfterDebt)} a month after loan payments${beGallons !== null ? `; break-even is about ${Math.round(beGallons).toLocaleString("en-US")} gallons a month at this margin (you plan ${Math.round(g.gallons).toLocaleString("en-US")})` : ""}.` });
  if (dscr !== null && dscr < 1.25) findings.push({ severity: dscr < 1 ? "high" : "medium", title: `Debt coverage is ${dscr.toFixed(2)}x; lenders commonly look for more than 1.25x (check your own lender's terms).` });
  if (feeShareOfFuelGross !== null && feeShareOfFuelGross > 0.15) findings.push({ severity: "medium", title: `Card fees take ${(feeShareOfFuelGross * 100).toFixed(0)}% of your fuel gross margin (${money(fuelFees)} a month). Fuel cost changes move the fee too, because it is charged on the pump price.` });
  if (fuelShare !== null && fuelShare > 0.6) findings.push({ severity: "info", title: `${(fuelShare * 100).toFixed(0)}% of operating profit comes from fuel: a 5-cent margin squeeze costs ${money(g.gallons * 0.05)} a month.` });
  if (insideMargin !== null && insideMargin < 0.2) findings.push({ severity: "info", title: `Inside gross margin is ${(insideMargin * 100).toFixed(1)}%; the tobacco share of sales pulls this down, so look at the food and drink mix.` });

  return { errors: [], g, cats, fuelRevenue, fuelGross, fuelFees, fuelNet, grossCpg, netCpg, insideSales, insideGross, insideFees, shrink, insideNet, labor, fixed, nonFuel, opProfit, netAfterDebt, dscr, fuelShare, feeShareOfFuelGross, beGallons, requiredNetCpg, insideMargin, cpgSweep, volumeSweep, findings };
}

export function money(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

export const SAMPLE = {
  gallons: "60000", price: "3.45", cost: "3.12", cardShare: "80", feePct: "2.2", perTxn: "0.10", avgFill: "11",
  tobacco_sales: "30000", tobacco_margin: "12", food_sales: "28000", food_margin: "34", beer_sales: "14000", beer_margin: "22",
  insideCardPct: "65", shrinkPct: "1.5", otherIncome: "1200",
  hours: "1100", wage: "14.50", burdenPct: "12", rent: "4000", utilities: "2800", insurance: "1800", propTax: "900", otherFixed: "1200", debt: "1800",
};

export function summaryText(r) {
  const L = [];
  L.push("Convenience store and gas station profit");
  L.push(`Fuel: ${Math.round(r.g.gallons).toLocaleString("en-US")} gal at ${(r.grossCpg * 100).toFixed(1)} cents gross, ${(r.netCpg * 100).toFixed(1)} cents after card fees; fuel net ${money(r.fuelNet)}`);
  L.push(`Inside: sales ${money(r.insideSales)}, gross ${money(r.insideGross)}, net of card fees and shrink ${money(r.insideNet)}`);
  L.push(`Labor ${money(r.labor)}; fixed costs ${money(r.fixed)}`);
  L.push(`Operating profit ${money(r.opProfit)}; after loan payments ${money(r.netAfterDebt)}${r.dscr === null ? "" : `; debt coverage ${r.dscr.toFixed(2)}x`}`);
  L.push(r.beGallons === null ? "Break-even gallons: not reachable at this fuel margin." : `Break-even: about ${Math.round(r.beGallons).toLocaleString("en-US")} gallons a month (fuel net needed: ${(r.requiredNetCpg * 100).toFixed(1)} cents a gallon at your volume).`);
  return L.join("\n");
}

export function sweepCsv(r) {
  const out = ["change in net fuel margin (cents per gallon),profit after loan payments per month"];
  for (const x of r.cpgSweep) out.push(`${x.cents},${x.profit.toFixed(2)}`);
  out.push("", "change in gallons (%),profit after loan payments per month");
  for (const x of r.volumeSweep) out.push(`${x.pct},${x.profit.toFixed(2)}`);
  return out.join("\n") + "\n";
}
