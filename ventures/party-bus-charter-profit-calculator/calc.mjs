// Party bus, limo and shuttle charter profit check. A charter operator quotes a price for
// a block of hours, but the vehicle and driver are tied up for more than the billed time:
// positioning from the garage, deadhead back, and any minimum-hours rule that bills a
// short trip as a longer one. This takes out driver pay with payroll burden for every
// paid hour, fuel and wear for every mile, detailing, the driver's gratuity share, card
// fees, the vehicle's depreciation per charter, and a share of the yearly insurance,
// storage and permit overhead, then reports true profit per charter, margin, profit per
// vehicle hour, the lowest quote that earns a target margin, how many charters a vehicle
// needs to pay for itself, and break-even charters a year. A second mode compares two charters.
//
//   billedHours  = max(hours, minHours)
//   driverHours  = billedHours + deadheadHours ;  vehicleHours = driverHours
//   labor        = driverHours * wage * (1 + burden)
//   costs        = labor + fuel + wear + cleaning + gratuity + processing + depreciation + fixedShare
//   gratuity     = gratuityPct * price ;  processing = processPct * price
//   depreciation = vehicleCost / lifeCharters ;  fixedShare = annualFixed / chartersPerYear
//   profit       = price - costs
//   minPrice     = (costs - gratuity - processing) / (1 - gratuityPct - processPct - targetMargin)   (exact)
//   payback      = vehicleCost / (price - (costs - depreciation))  charters, then / vehicleUses years

export const JOB_KEYS = ["price", "hours", "minHours", "deadheadHours", "miles"];

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!pos(i.price, 100000)) e.push("Charter price must be above $0 and at most $100,000.");
  if (!pos(i.hours, 24)) e.push("Hours the customer books must be above 0 and at most 24.");
  if (!nonneg(i.minHours, 24)) e.push("Minimum billed hours must be between 0 and 24.");
  if (!nonneg(i.deadheadHours, 24)) e.push("Deadhead and positioning hours must be between 0 and 24.");
  if (!nonneg(i.miles, 3000)) e.push("Total miles, including deadhead, must be between 0 and 3,000.");
  if (!pos(i.wage, 500)) e.push("Driver hourly pay must be above $0 and at most $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!pos(i.mpg, 100)) e.push("Vehicle miles per gallon must be above 0 and at most 100.");
  if (!pos(i.fuelPrice, 20)) e.push("Fuel price must be above $0 and at most $20 a gallon.");
  if (!nonneg(i.wearPerMile, 20)) e.push("Maintenance and tire wear per mile must be between $0 and $20.");
  if (!nonneg(i.cleaning, 5000)) e.push("Cleaning and detailing per charter must be between $0 and $5,000.");
  if (!nonneg(i.gratuityPct, 50)) e.push("Gratuity share paid to the driver must be between 0% and 50% of the price.");
  if (!nonneg(i.processPct, 15)) e.push("Card fees must be between 0% and 15%.");
  if (!nonneg(i.vehicleCost, 5000000)) e.push("Vehicle purchase cost must be between $0 and $5,000,000.");
  if (!(Number.isFinite(i.lifeCharters) && i.lifeCharters >= 1 && i.lifeCharters <= 10000)) e.push("Charters over the vehicle's life must be between 1 and 10,000.");
  if (!(Number.isFinite(i.vehicleUses) && i.vehicleUses > 0 && i.vehicleUses <= 730)) e.push("Charters this vehicle runs per year must be above 0 and at most 730.");
  if (!nonneg(i.annualFixed, 5000000)) e.push("Yearly insurance, storage and permits must be between $0 and $5,000,000.");
  if (!(Number.isFinite(i.chartersPerYear) && i.chartersPerYear >= 1 && i.chartersPerYear <= 10000)) e.push("Charters per year (whole fleet) must be between 1 and 10,000.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (e.length === 0 && i.gratuityPct + i.processPct + i.targetMargin >= 100) e.push("Gratuity share plus card fees plus target margin must be under 100%.");
  return e;
}

function figures(i) {
  const p = i.processPct / 100;
  const g = i.gratuityPct / 100;
  const m = i.targetMargin / 100;
  const revenue = i.price;
  const billedHours = Math.max(i.hours, i.minHours);
  const driverHours = billedHours + i.deadheadHours;
  const labor = driverHours * i.wage * (1 + i.burdenPct / 100);
  const fuel = (i.miles / i.mpg) * i.fuelPrice;
  const wear = i.wearPerMile * i.miles;
  const gratuity = g * revenue;
  const processing = p * revenue;
  const depreciation = i.vehicleCost / i.lifeCharters;
  const fixedShare = i.annualFixed / i.chartersPerYear;
  const costs = labor + fuel + wear + i.cleaning + gratuity + processing + depreciation + fixedShare;
  const profit = revenue - costs;
  const margin = profit / revenue;
  const minPrice = (costs - gratuity - processing) / (1 - g - p - m);
  const contribution = revenue - (costs - depreciation);
  const paybackCharters = contribution > 0 ? i.vehicleCost / contribution : null;
  const paybackYears = paybackCharters === null ? null : paybackCharters / i.vehicleUses;
  const afterWear = revenue - (costs - fixedShare);
  const breakevenCharters = afterWear > 0 ? i.annualFixed / afterWear : null;
  return {
    revenue, billedHours, driverHours, vehicleHours: driverHours, minApplied: i.minHours > i.hours,
    labor, fuel, wear, cleaning: i.cleaning, gratuity, processing, depreciation, fixedShare, costs,
    profit, margin, profitPerVehicleHour: profit / driverHours, revenuePerVehicleHour: revenue / driverHours,
    minPrice, minGap: revenue - minPrice, meets: margin >= m - 1e-12,
    contribution, paybackCharters, paybackYears, paybackWithinLife: paybackCharters !== null && paybackCharters <= i.lifeCharters,
    lifetimeProfit: profit * i.lifeCharters, breakevenCharters, annualProfit: profit * i.chartersPerYear,
  };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const f = figures(input);
  return { ok: true, input, ...f, notes: buildNotes(input, f) };
}

function buildNotes(i, f) {
  const n = [];
  if (f.profit < 0) n.push(`This charter loses ${cents(-f.profit)}. At ${cents(f.revenue)} it does not cover driver time, fuel and vehicle wear.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. The charter needs to be quoted at ${cents(f.minPrice)}, which is ${cents(-f.minGap)} more.`);
  if (f.minApplied) n.push(`The ${i.minHours}-hour minimum bills ${f.billedHours - i.hours} more hour${f.billedHours - i.hours === 1 ? "" : "s"} than the customer booked, and the driver is paid for them.`);
  if (i.deadheadHours > 0 && f.driverHours > 0) n.push(`Deadhead and positioning are ${((i.deadheadHours / f.driverHours) * 100).toFixed(0)}% of the vehicle's hours and nobody is billed for them.`);
  if (f.paybackCharters === null) n.push("Each charter earns nothing above its direct costs, so this vehicle never pays for itself at this price.");
  else if (!f.paybackWithinLife) n.push(`The vehicle needs ${Math.ceil(f.paybackCharters)} charters to pay for itself but you expect only ${i.lifeCharters} in its life.`);
  return n;
}

export function compareJobs(input, altOverrides) {
  const a = solve(input);
  if (!a.ok) return { ok: false, errors: a.errors };
  const alt = { ...input };
  for (const k of JOB_KEYS) if (altOverrides && altOverrides[k] !== undefined) alt[k] = altOverrides[k];
  const b = solve(alt);
  if (!b.ok) return { ok: false, errors: b.errors.map((x) => `Charter B: ${x}`) };
  const pick = (x, y) => (y > x + 0.005 ? "B" : x > y + 0.005 ? "A" : "tie");
  const byJob = pick(a.profit, b.profit);
  const byHour = pick(a.profitPerVehicleHour, b.profitPerVehicleHour);
  const notes = [];
  if (byJob === "tie") notes.push("The two charters make the same profit.");
  else {
    const w = byJob === "A" ? a : b;
    const l = byJob === "A" ? b : a;
    notes.push(`Charter ${byJob} makes ${money(w.profit - l.profit)} more per charter (${money(w.profit)} against ${money(l.profit)}).`);
  }
  if (byHour !== byJob && byHour !== "tie" && byJob !== "tie") notes.push(`Charter ${byHour} earns more per vehicle hour. If the vehicle is the limit on how many charters you can run, Charter ${byHour} fills the calendar better even though Charter ${byJob} makes more on its own.`);
  return { ok: true, a, b, winnerJob: byJob, winnerHour: byHour, profitDifference: b.profit - a.profit, notes };
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleInput() {
  return {
    price: 850, hours: 4, minHours: 5, deadheadHours: 1.5, miles: 90,
    wage: 28, burdenPct: 12, mpg: 8, fuelPrice: 3.9, wearPerMile: 0.55, cleaning: 45, gratuityPct: 5, processPct: 3,
    vehicleCost: 85000, lifeCharters: 900, vehicleUses: 90, annualFixed: 38000, chartersPerYear: 160, targetMargin: 25,
  };
}

export function sampleJob() {
  return { price: 680, hours: 3, minHours: 3, deadheadHours: 0.5, miles: 45 };
}

export function resultText(r) {
  const lines = [
    `Charter profit check: price ${cents(r.input.price)}, ${r.billedHours} billed hours, ${r.driverHours} driver and vehicle hours`,
    `Costs ${cents(r.costs)} (driver ${cents(r.labor)}, fuel ${cents(r.fuel)}, wear ${cents(r.wear)})`,
    `True profit ${cents(r.profit)} per charter, margin ${pct(r.margin)}, ${cents(r.profitPerVehicleHour)} per vehicle hour`,
    `Lowest quote for a ${r.input.targetMargin}% margin: ${cents(r.minPrice)}`,
    `Vehicle payback: ${r.paybackCharters === null ? "never at this price" : `${r.paybackCharters.toFixed(1)} charters (${r.paybackYears.toFixed(1)} years)`}`,
    `Break-even charters a year: ${r.breakevenCharters === null ? "n/a" : r.breakevenCharters.toFixed(0)}; profit at ${r.input.chartersPerYear} charters: ${money(r.annualProfit)} a year`,
    "Arithmetic on the numbers entered, not tax, legal, insurance or financial advice.",
  ];
  return lines.join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["revenue", r.revenue], ["billed_hours", r.billedHours], ["driver_and_vehicle_hours", r.driverHours], ["driver_pay", r.labor], ["fuel", r.fuel], ["vehicle_wear", r.wear],
    ["cleaning", r.cleaning], ["gratuity_share", r.gratuity], ["card_fees", r.processing], ["vehicle_depreciation", r.depreciation], ["yearly_overhead_share", r.fixedShare], ["total_costs", r.costs],
    ["profit_per_charter", r.profit], ["margin", r.margin], ["profit_per_vehicle_hour", r.profitPerVehicleHour],
    ["minimum_quote", r.minPrice], ["payback_charters", r.paybackCharters === null ? "" : r.paybackCharters],
    ["breakeven_charters_per_year", r.breakevenCharters === null ? "" : r.breakevenCharters], ["annual_profit", r.annualProfit],
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "party-bus-charter-profit-calculator";
export function serializeState(input, job) { return JSON.stringify({ app: APP, version: 1, input, job: job || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved charter scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, job: d.job && typeof d.job === "object" ? d.job : null };
}
