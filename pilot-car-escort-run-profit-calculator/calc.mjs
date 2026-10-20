// Pilot car and oversize-load escort run profit check. An escort operator quotes a flat
// price, a day rate or a per-mile rate with a minimum charge, but the truck is out for more
// than the loaded miles: the drive to the start point, the drive home from the end point,
// waiting hours, tolls, meals and hotel nights on a multi-day move. This takes out the
// driver's time, fuel and wear on every mile (loaded and empty), per diem, hotel, tolls,
// card fees, the vehicle's depreciation per run, and a share of the yearly certification,
// insurance and equipment overhead, then reports true profit per run, margin, profit per
// driver hour, the lowest quote that earns a target margin, break-even runs a year, and
// compares two runs (for example a short run that bills the minimum against a long run).
//
//   quoted       = mode "flat" ? price : price * loadedMiles          (price is $ per loaded mile in "mile" mode)
//   revenue      = max(quoted, minCharge)
//   totalMiles   = loadedMiles + deadheadMiles
//   costs        = labor + fuel + wear + perDiem + hotel + tolls + processing + depreciation + fixedShare
//   labor        = driverHours * wage ;  fuel = totalMiles / mpg * fuelPrice ;  wear = wearPerMile * totalMiles
//   perDiem      = perDiemRate * days ;  hotel = hotelRate * nights ;  processing = processPct * revenue
//   depreciation = vehicleCost / lifeRuns ;  fixedShare = (insurance + certs + equipment) / runsPerYear
//   profit       = revenue - costs
//   needRevenue  = (costs - processing) / (1 - processPct - targetMargin)   (exact)
//   minQuote     = needRevenue (flat)  or  needRevenue / loadedMiles (per mile)
//   breakeven    = annualOverhead / (revenue - (costs - fixedShare))   runs a year

export const JOB_KEYS = ["mode", "price", "loadedMiles", "minCharge", "deadheadMiles", "driverHours", "days", "nights", "tolls"];
export const MODES = ["flat", "mile"];

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!MODES.includes(i.mode)) e.push("Quote type must be a flat or day price, or a price per loaded mile.");
  else if (i.mode === "flat" && !pos(i.price, 100000)) e.push("Flat or day price must be above $0 and at most $100,000.");
  else if (i.mode === "mile" && !pos(i.price, 100)) e.push("Price per loaded mile must be above $0 and at most $100.");
  if (!nonneg(i.loadedMiles, 5000)) e.push("Loaded miles (with the load) must be between 0 and 5,000.");
  if (i.mode === "mile" && !(Number.isFinite(i.loadedMiles) && i.loadedMiles > 0)) e.push("A per-mile quote needs loaded miles above 0.");
  if (!nonneg(i.minCharge, 100000)) e.push("Minimum charge must be between $0 and $100,000.");
  if (!nonneg(i.deadheadMiles, 5000)) e.push("Deadhead miles (to the start and home from the end) must be between 0 and 5,000.");
  if (!pos(i.driverHours, 400)) e.push("Driver hours on the run, including waiting, must be above 0 and at most 400.");
  if (!pos(i.days, 60)) e.push("Days away must be above 0 and at most 60.");
  if (!nonneg(i.nights, 60)) e.push("Hotel nights must be between 0 and 60.");
  if (!nonneg(i.tolls, 10000)) e.push("Tolls and permits paid on the run must be between $0 and $10,000.");
  if (!nonneg(i.wage, 500)) e.push("Driver pay per hour must be between $0 and $500 (0 if you drive it yourself).");
  if (!pos(i.mpg, 100)) e.push("Miles per gallon must be above 0 and at most 100.");
  if (!pos(i.fuelPrice, 20)) e.push("Fuel price must be above $0 and at most $20 a gallon.");
  if (!nonneg(i.wearPerMile, 20)) e.push("Maintenance and tire wear per mile must be between $0 and $20.");
  if (!nonneg(i.perDiemRate, 1000)) e.push("Meals per day must be between $0 and $1,000.");
  if (!nonneg(i.hotelRate, 5000)) e.push("Hotel cost per night must be between $0 and $5,000.");
  if (!nonneg(i.processPct, 15)) e.push("Card and invoicing fees must be between 0% and 15%.");
  if (!nonneg(i.vehicleCost, 1000000)) e.push("Vehicle cost must be between $0 and $1,000,000.");
  if (!(Number.isFinite(i.lifeRuns) && i.lifeRuns >= 1 && i.lifeRuns <= 20000)) e.push("Runs over the vehicle's life must be between 1 and 20,000.");
  if (!nonneg(i.annualInsurance, 1000000)) e.push("Yearly insurance must be between $0 and $1,000,000.");
  if (!nonneg(i.annualCerts, 1000000)) e.push("Yearly certifications, permits and training must be between $0 and $1,000,000.");
  if (!nonneg(i.annualEquipment, 1000000)) e.push("Yearly signs, lights, radios and equipment must be between $0 and $1,000,000.");
  if (!(Number.isFinite(i.runsPerYear) && i.runsPerYear >= 1 && i.runsPerYear <= 5000)) e.push("Escort runs per year must be between 1 and 5,000.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (e.length === 0 && i.processPct + i.targetMargin >= 100) e.push("Card fees plus target margin must be under 100%.");
  return e;
}

function figures(i) {
  const p = i.processPct / 100;
  const m = i.targetMargin / 100;
  const quoted = i.mode === "mile" ? i.price * i.loadedMiles : i.price;
  const minApplied = i.minCharge > quoted;
  const revenue = Math.max(quoted, i.minCharge);
  const totalMiles = i.loadedMiles + i.deadheadMiles;
  const labor = i.driverHours * i.wage;
  const fuel = (totalMiles / i.mpg) * i.fuelPrice;
  const wear = i.wearPerMile * totalMiles;
  const perDiem = i.perDiemRate * i.days;
  const hotel = i.hotelRate * i.nights;
  const tolls = i.tolls;
  const processing = p * revenue;
  const depreciation = i.vehicleCost / i.lifeRuns;
  const annualOverhead = i.annualInsurance + i.annualCerts + i.annualEquipment;
  const fixedShare = annualOverhead / i.runsPerYear;
  const costs = labor + fuel + wear + perDiem + hotel + tolls + processing + depreciation + fixedShare;
  const profit = revenue - costs;
  const margin = profit / revenue;
  const needRevenue = (costs - processing) / (1 - p - m);
  const minQuote = i.mode === "mile" ? needRevenue / i.loadedMiles : needRevenue;
  const afterVariable = revenue - (costs - fixedShare);
  const breakevenRuns = afterVariable > 0 && annualOverhead > 0 ? annualOverhead / afterVariable : afterVariable > 0 ? 0 : null;
  return {
    quoted, revenue, minApplied, totalMiles, labor, fuel, wear, perDiem, hotel, tolls, processing, depreciation, annualOverhead, fixedShare, costs,
    profit, margin, profitPerHour: profit / i.driverHours, revenuePerHour: revenue / i.driverHours, revenuePerLoadedMile: i.loadedMiles > 0 ? revenue / i.loadedMiles : null,
    needRevenue, minQuote, minGap: i.mode === "mile" ? (i.price - minQuote) * i.loadedMiles : revenue - needRevenue,
    minChargeCovers: needRevenue <= i.minCharge, meets: margin >= m - 1e-12,
    breakevenRuns, annualProfit: profit * i.runsPerYear,
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
  if (f.profit < 0) n.push(`This run loses ${cents(-f.profit)}. At ${cents(f.revenue)} it does not cover your time, fuel, wear and the days away.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. The run needs ${cents(f.needRevenue)} in total, which is ${cents(f.needRevenue - f.revenue)} more${i.mode === "mile" ? `, or ${cents(f.minQuote)} per loaded mile` : ""}.`);
  if (f.minApplied) n.push(`The ${cents(i.minCharge)} minimum charge applies: the loaded miles alone quote ${cents(f.quoted)}.`);
  if (f.totalMiles > 0 && i.deadheadMiles > 0) n.push(`Deadhead is ${((i.deadheadMiles / f.totalMiles) * 100).toFixed(0)}% of the miles driven and none of it is billed unless your minimum or flat price covers it.`);
  if (f.breakevenRuns === null) n.push("Each run earns nothing above its direct costs, so the yearly overhead is never covered at this price.");
  else if (f.breakevenRuns > i.runsPerYear) n.push(`Break-even is ${f.breakevenRuns.toFixed(0)} runs a year but you expect ${i.runsPerYear}.`);
  return n;
}

export function compareJobs(input, altOverrides) {
  const a = solve(input);
  if (!a.ok) return { ok: false, errors: a.errors };
  const alt = { ...input };
  for (const k of JOB_KEYS) if (altOverrides && altOverrides[k] !== undefined) alt[k] = altOverrides[k];
  const b = solve(alt);
  if (!b.ok) return { ok: false, errors: b.errors.map((x) => `Run B: ${x}`) };
  const pick = (x, y) => (y > x + 0.005 ? "B" : x > y + 0.005 ? "A" : "tie");
  const byJob = pick(a.profit, b.profit);
  const byHour = pick(a.profitPerHour, b.profitPerHour);
  const notes = [];
  if (byJob === "tie") notes.push("The two runs make the same profit.");
  else {
    const w = byJob === "A" ? a : b;
    const l = byJob === "A" ? b : a;
    notes.push(`Run ${byJob} makes ${money(w.profit - l.profit)} more per run (${money(w.profit)} against ${money(l.profit)}).`);
  }
  if (byHour !== byJob && byHour !== "tie" && byJob !== "tie") notes.push(`Run ${byHour} earns more per driver hour. If your hours are the limit on how many runs you can take, Run ${byHour} is the better use of a day even though Run ${byJob} makes more on its own.`);
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
    mode: "mile", price: 1.8, loadedMiles: 140, minCharge: 450, deadheadMiles: 60, driverHours: 5, days: 1, nights: 0, tolls: 12,
    wage: 22, mpg: 17, fuelPrice: 3.7, wearPerMile: 0.18, perDiemRate: 45, hotelRate: 110, processPct: 3,
    vehicleCost: 38000, lifeRuns: 1500, annualInsurance: 3200, annualCerts: 900, annualEquipment: 1400, runsPerYear: 120, targetMargin: 30,
  };
}

export function sampleJob() {
  return { mode: "mile", price: 2.4, loadedMiles: 420, minCharge: 450, deadheadMiles: 120, driverHours: 13, days: 2, nights: 1, tolls: 30 };
}

export function resultText(r) {
  const unit = r.input.mode === "mile" ? "per loaded mile" : "for the run";
  const lines = [
    `Escort run profit check: quote ${cents(r.input.price)} ${unit}, revenue ${cents(r.revenue)}${r.minApplied ? " (minimum charge applies)" : ""}, ${r.totalMiles} miles driven, ${r.input.driverHours} driver hours`,
    `Costs ${cents(r.costs)} (driver ${cents(r.labor)}, fuel ${cents(r.fuel)}, wear ${cents(r.wear)}, meals ${cents(r.perDiem)}, hotel ${cents(r.hotel)}, tolls ${cents(r.tolls)})`,
    `True profit ${cents(r.profit)} per run, margin ${pct(r.margin)}, ${cents(r.profitPerHour)} per driver hour`,
    `Lowest quote for a ${r.input.targetMargin}% margin: ${cents(r.minQuote)} ${unit}${r.minChargeCovers ? " (your minimum charge already covers it)" : ""}`,
    `Break-even runs a year: ${r.breakevenRuns === null ? "n/a" : r.breakevenRuns.toFixed(0)}; profit at ${r.input.runsPerYear} runs: ${money(r.annualProfit)} a year`,
    "Arithmetic on the numbers entered, not tax, legal, insurance or financial advice.",
  ];
  return lines.join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["revenue", r.revenue], ["quoted_before_minimum", r.quoted], ["total_miles", r.totalMiles], ["driver_hours", r.input.driverHours], ["driver_pay", r.labor], ["fuel", r.fuel], ["vehicle_wear", r.wear],
    ["meals", r.perDiem], ["hotel", r.hotel], ["tolls_and_permits", r.tolls], ["card_fees", r.processing], ["vehicle_depreciation", r.depreciation], ["yearly_overhead_share", r.fixedShare], ["total_costs", r.costs],
    ["profit_per_run", r.profit], ["margin", r.margin], ["profit_per_driver_hour", r.profitPerHour],
    ["minimum_quote", r.minQuote], ["required_revenue", r.needRevenue],
    ["breakeven_runs_per_year", r.breakevenRuns === null ? "" : r.breakevenRuns], ["annual_profit", r.annualProfit],
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "pilot-car-escort-run-profit-calculator";
export function serializeState(input, job) { return JSON.stringify({ app: APP, version: 1, input, job: job || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved escort run scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, job: d.job && typeof d.job === "object" ? d.job : null };
}
