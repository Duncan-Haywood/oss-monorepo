// Tent and party rental job profit check. An event rental business (frame tents,
// pole tents, tables, chairs) prices each job as a rental fee plus a delivery fee,
// and most of the cost is crew time the quote never counted: loading, driving,
// setting up, taking down, and cleaning. This takes out crew labor with payroll
// burden, truck fuel and wear, supplies, a damage reserve, card fees, tent
// depreciation per rental, and a share of the yearly storage/insurance/truck
// payment, then reports true profit per job, margin, profit per crew hour, the
// lowest quote that still earns a target margin, and how many rentals a tent
// needs to pay for itself. A second mode compares two jobs.
//
//   revenue   = rentPrice + deliveryFee
//   labor     = crewSize * (onsiteHours + driveHours + loadHours) * wage * (1 + burden)
//   costs     = labor + fuel + truckWear + supplies + damage + processing + depreciation + fixedShare
//   processing= processPct * revenue ;  depreciation = tentCost / lifeRentals ;  fixedShare = annualFixed / jobsPerYear
//   profit    = revenue - costs
//   minRevenue= (costs - processing) / (1 - processPct - targetMargin)   (exact: margin = target)
//   payback   = tentCost / (revenue - (costs - depreciation))   rentals, then / tentUsesPerYear years

export const JOB_KEYS = ["rentPrice", "deliveryFee", "crewSize", "onsiteHours", "driveHours", "loadHours", "miles"];

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!pos(i.rentPrice, 100000)) e.push("Rental price must be above $0 and at most $100,000.");
  if (!nonneg(i.deliveryFee, 10000)) e.push("Delivery fee must be between $0 and $10,000.");
  if (!(Number.isInteger(i.crewSize) && i.crewSize >= 1 && i.crewSize <= 30)) e.push("Crew size must be a whole number between 1 and 30.");
  if (!pos(i.onsiteHours, 24)) e.push("On-site hours per person (setup and takedown) must be above 0 and at most 24.");
  if (!nonneg(i.driveHours, 24)) e.push("Drive hours per person must be between 0 and 24.");
  if (!nonneg(i.loadHours, 24)) e.push("Load, unload and cleaning hours per person must be between 0 and 24.");
  if (!nonneg(i.miles, 2000)) e.push("Round-trip miles must be between 0 and 2,000.");
  if (!pos(i.wage, 500)) e.push("Crew hourly wage must be above $0 and at most $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!pos(i.mpg, 100)) e.push("Truck miles per gallon must be above 0 and at most 100.");
  if (!pos(i.fuelPrice, 20)) e.push("Fuel price must be above $0 and at most $20 a gallon.");
  if (!nonneg(i.truckPerMile, 10)) e.push("Truck wear per mile must be between $0 and $10.");
  if (!nonneg(i.supplies, 5000)) e.push("Supplies per job must be between $0 and $5,000.");
  if (!nonneg(i.damage, 5000)) e.push("Damage and loss reserve must be between $0 and $5,000 per job.");
  if (!nonneg(i.processPct, 15)) e.push("Card and booking fees must be between 0% and 15%.");
  if (!nonneg(i.tentCost, 1000000)) e.push("Tent and equipment cost must be between $0 and $1,000,000.");
  if (!(Number.isFinite(i.lifeRentals) && i.lifeRentals >= 1 && i.lifeRentals <= 5000)) e.push("Rentals over the equipment's life must be between 1 and 5,000.");
  if (!(Number.isFinite(i.tentUses) && i.tentUses > 0 && i.tentUses <= 365)) e.push("Times this tent is rented per year must be above 0 and at most 365.");
  if (!nonneg(i.annualFixed, 1000000)) e.push("Yearly storage, insurance and truck payment must be between $0 and $1,000,000.");
  if (!(Number.isFinite(i.jobsPerYear) && i.jobsPerYear >= 1 && i.jobsPerYear <= 2000)) e.push("Jobs per year (all equipment) must be between 1 and 2,000.");
  if (!nonneg(i.taxPct, 60)) e.push("Tax set-aside must be between 0% and 60%.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (e.length === 0 && i.processPct + i.targetMargin >= 100) e.push("Card fees plus target margin must be under 100%.");
  return e;
}

function figures(i) {
  const p = i.processPct / 100;
  const m = i.targetMargin / 100;
  const revenue = i.rentPrice + i.deliveryFee;
  const personHours = i.onsiteHours + i.driveHours + i.loadHours;
  const crewHours = i.crewSize * personHours;
  const labor = crewHours * i.wage * (1 + i.burdenPct / 100);
  const fuel = (i.miles / i.mpg) * i.fuelPrice;
  const truckWear = i.truckPerMile * i.miles;
  const processing = p * revenue;
  const depreciation = i.tentCost / i.lifeRentals;
  const fixedShare = i.annualFixed / i.jobsPerYear;
  const costs = labor + fuel + truckWear + i.supplies + i.damage + processing + depreciation + fixedShare;
  const profit = revenue - costs;
  const setAside = Math.max(0, profit) * (i.taxPct / 100);
  const takeHome = profit - setAside;
  const margin = profit / revenue;
  const minRevenue = (costs - processing) / (1 - p - m);
  const minRentPrice = minRevenue - i.deliveryFee;
  const contribution = revenue - (costs - depreciation);
  const paybackRentals = contribution > 0 ? i.tentCost / contribution : null;
  const paybackYears = paybackRentals === null ? null : paybackRentals / i.tentUses;
  const afterWear = revenue - (costs - fixedShare);
  const breakevenJobs = afterWear > 0 ? i.annualFixed / afterWear : null;
  return {
    revenue, crewHours, labor, fuel, truckWear, supplies: i.supplies, damage: i.damage, processing, depreciation, fixedShare, costs,
    profit, margin, profitPerCrewHour: profit / crewHours, revenuePerCrewHour: revenue / crewHours, setAside, takeHome,
    minRevenue, minRentPrice, minGap: revenue - minRevenue, meets: margin >= m - 1e-12,
    contribution, paybackRentals, paybackYears, paybackWithinLife: paybackRentals !== null && paybackRentals <= i.lifeRentals,
    lifetimeProfit: profit * i.lifeRentals, breakevenJobs,
    annualProfit: profit * i.jobsPerYear, annualTakeHome: takeHome * i.jobsPerYear,
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
  if (f.profit < 0) n.push(`This job loses ${cents(-f.profit)}. At ${cents(f.revenue)} it does not cover crew, truck and equipment wear.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. The job needs to bring in ${cents(f.minRevenue)} (rental ${cents(Math.max(0, f.minRentPrice))} plus delivery), which is ${cents(-f.minGap)} more.`);
  const labourShare = f.labor / f.costs;
  if (labourShare > 0.5) n.push(`Crew labor is ${(labourShare * 100).toFixed(0)}% of the job's cost. The quote lives or dies on setup and takedown hours, so check those first.`);
  if (f.paybackRentals === null) n.push("Each rental earns nothing above its direct costs, so this tent never pays for itself at this price.");
  else if (!f.paybackWithinLife) n.push(`The tent needs ${Math.ceil(f.paybackRentals)} rentals to pay for itself but you expect only ${i.lifeRentals} in its life.`);
  return n;
}

export function compareJobs(input, altOverrides) {
  const a = solve(input);
  if (!a.ok) return { ok: false, errors: a.errors };
  const alt = { ...input };
  for (const k of JOB_KEYS) if (altOverrides && altOverrides[k] !== undefined) alt[k] = altOverrides[k];
  const b = solve(alt);
  if (!b.ok) return { ok: false, errors: b.errors.map((x) => `Job B: ${x}`) };
  const pick = (x, y) => (y > x + 0.005 ? "B" : x > y + 0.005 ? "A" : "tie");
  const byJob = pick(a.profit, b.profit);
  const byHour = pick(a.profitPerCrewHour, b.profitPerCrewHour);
  const notes = [];
  if (byJob === "tie") notes.push("The two jobs make the same profit.");
  else {
    const w = byJob === "A" ? a : b;
    const l = byJob === "A" ? b : a;
    notes.push(`Job ${byJob} makes ${money(w.profit - l.profit)} more per job (${money(w.profit)} against ${money(l.profit)}).`);
  }
  if (byHour !== byJob && byHour !== "tie" && byJob !== "tie") notes.push(`Job ${byHour} earns more per crew hour. If your crew is the limit on how many jobs you can take, Job ${byHour} fills the calendar better even though Job ${byJob} makes more on its own.`);
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
    rentPrice: 650, deliveryFee: 75, crewSize: 3, onsiteHours: 3, driveHours: 1, loadHours: 1, miles: 40,
    wage: 20, burdenPct: 12, mpg: 11, fuelPrice: 3.7, truckPerMile: 0.35, supplies: 18, damage: 25, processPct: 3,
    tentCost: 5200, lifeRentals: 150, tentUses: 25, annualFixed: 6000, jobsPerYear: 90, taxPct: 25, targetMargin: 30,
  };
}

export function sampleJob() {
  return { rentPrice: 430, deliveryFee: 60, crewSize: 2, onsiteHours: 2.5, driveHours: 0.75, loadHours: 0.75, miles: 40 };
}

export function resultText(r) {
  const lines = [
    `Tent rental job check: rental ${cents(r.input.rentPrice)} + delivery ${cents(r.input.deliveryFee)}, crew of ${r.input.crewSize}, ${r.crewHours} crew hours`,
    `Revenue ${cents(r.revenue)}; costs ${cents(r.costs)} (labor ${cents(r.labor)})`,
    `True profit ${cents(r.profit)} per job, margin ${pct(r.margin)}, ${cents(r.profitPerCrewHour)} per crew hour`,
    `After ${r.input.taxPct}% set-aside: ${cents(r.takeHome)} per job`,
    `Lowest quote for a ${r.input.targetMargin}% margin: ${cents(r.minRevenue)} (rental ${cents(Math.max(0, r.minRentPrice))} + delivery ${cents(r.input.deliveryFee)})`,
    `Tent payback: ${r.paybackRentals === null ? "never at this price" : `${r.paybackRentals.toFixed(1)} rentals (${r.paybackYears.toFixed(1)} years)`}`,
    `Break-even jobs a year: ${r.breakevenJobs === null ? "n/a" : r.breakevenJobs.toFixed(0)}; profit at ${r.input.jobsPerYear} jobs: ${money(r.annualProfit)} a year`,
    "Arithmetic on the numbers entered, not tax, legal, insurance or financial advice.",
  ];
  return lines.join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["revenue", r.revenue], ["crew_hours", r.crewHours], ["labor", r.labor], ["fuel", r.fuel], ["truck_wear", r.truckWear], ["supplies", r.supplies],
    ["damage_reserve", r.damage], ["card_fees", r.processing], ["tent_depreciation", r.depreciation], ["yearly_fixed_share", r.fixedShare], ["total_costs", r.costs],
    ["profit_per_job", r.profit], ["margin", r.margin], ["profit_per_crew_hour", r.profitPerCrewHour], ["tax_set_aside", r.setAside], ["take_home_per_job", r.takeHome],
    ["minimum_total_quote", r.minRevenue], ["minimum_rental_price", r.minRentPrice], ["payback_rentals", r.paybackRentals === null ? "" : r.paybackRentals],
    ["breakeven_jobs_per_year", r.breakevenJobs === null ? "" : r.breakevenJobs], ["annual_profit", r.annualProfit],
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "tent-rental-job-profit-calculator";
export function serializeState(input, job) { return JSON.stringify({ app: APP, version: 1, input, job: job || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved tent rental job scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, job: d.job && typeof d.job === "object" ? d.job : null };
}
