// Lawn core aeration and overseeding bid check. A lawn-care operator prices a fall
// aeration + overseeding job from the lot, but the real cost depends on the turf that is
// actually there (lot minus beds and hardscape), how fast the aerator covers it, how many
// passes it takes, and how many pounds of seed and starter fertilizer go down. This turns
// those into hours and materials, adds crew labor with payroll burden, the machine's
// own fuel and rental/depreciation per hour, the truck, card fees and a share of the
// yearly overhead, then reports true profit per job, margin, profit per crew hour,
// the lowest quote that earns a target margin, the price per 1,000 sq ft, whether the
// minimum-job fee is what is really being charged, and break-even jobs a season.
// A second mode compares two jobs.
//
//   turf        = lotSqft - bedsSqft
//   aerRate     = swathFt * speedMph * 5280 * efficiency          (sq ft per hour, one pass)
//   aerHours    = turf * passes / aerRate ;  seedHours = turf / spreadRate
//   clockHours  = aerHours + seedHours + extraHours               (each person is paid for these)
//   revenue     = max(price, minFee)
//   labor       = crewSize * (clockHours + driveHours + loadHours) * wage * (1 + burden)
//   materials   = turf/1000 * (seedRate*seedPrice + fertRate*fertPrice) + other
//   machine     = aerHours * (equipHour + machineGph * fuelPrice)
//   truck       = miles/mpg*fuelPrice + truckPerMile*miles
//   costs       = labor + materials + machine + truck + processing + fixedShare
//   minRevenue  = (costs - processing) / (1 - processPct - targetMargin)   (exact: margin = target)

export const JOB_KEYS = ["price", "lotSqft", "bedsSqft", "passes", "seedRate", "miles"];

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!nonneg(i.price, 100000)) e.push("Quote must be between $0 and $100,000.");
  if (!nonneg(i.minFee, 10000)) e.push("Minimum job fee must be between $0 and $10,000.");
  if (!pos(i.lotSqft, 5000000)) e.push("Lot size must be above 0 and at most 5,000,000 sq ft.");
  if (!nonneg(i.bedsSqft, 5000000)) e.push("Beds and hardscape must be between 0 and 5,000,000 sq ft.");
  if (Number.isFinite(i.lotSqft) && Number.isFinite(i.bedsSqft) && i.bedsSqft >= i.lotSqft) e.push("Beds and hardscape must be less than the lot size, or there is no turf to aerate.");
  if (!(Number.isFinite(i.passes) && i.passes >= 1 && i.passes <= 6)) e.push("Aerator passes must be between 1 and 6.");
  if (!pos(i.swathFt, 20)) e.push("Aerator swath must be above 0 and at most 20 ft.");
  if (!pos(i.speedMph, 10)) e.push("Aerator ground speed must be above 0 and at most 10 mph.");
  if (!(Number.isFinite(i.efficiencyPct) && i.efficiencyPct >= 10 && i.efficiencyPct <= 100)) e.push("Aerator field efficiency must be between 10% and 100%.");
  if (!nonneg(i.seedRate, 40)) e.push("Seed rate must be between 0 and 40 lbs per 1,000 sq ft.");
  if (!nonneg(i.seedPrice, 100)) e.push("Seed price must be between $0 and $100 a pound.");
  if (!nonneg(i.fertRate, 40)) e.push("Starter fertilizer must be between 0 and 40 lbs per 1,000 sq ft.");
  if (!nonneg(i.fertPrice, 100)) e.push("Fertilizer price must be between $0 and $100 a pound.");
  if (!pos(i.spreadRate, 500000)) e.push("Seeding speed must be above 0 and at most 500,000 sq ft an hour.");
  if (!nonneg(i.extraHours, 24)) e.push("Extra on-site hours (flagging, gates, cleanup) must be between 0 and 24.");
  if (!(Number.isInteger(i.crewSize) && i.crewSize >= 1 && i.crewSize <= 30)) e.push("Crew size must be a whole number between 1 and 30.");
  if (!nonneg(i.driveHours, 24)) e.push("Drive hours per person must be between 0 and 24.");
  if (!nonneg(i.loadHours, 24)) e.push("Load, unload and cleaning hours per person must be between 0 and 24.");
  if (!nonneg(i.miles, 2000)) e.push("Round-trip miles must be between 0 and 2,000.");
  if (!pos(i.wage, 500)) e.push("Crew hourly wage must be above $0 and at most $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!pos(i.mpg, 100)) e.push("Truck miles per gallon must be above 0 and at most 100.");
  if (!pos(i.fuelPrice, 20)) e.push("Fuel price must be above $0 and at most $20 a gallon.");
  if (!nonneg(i.truckPerMile, 10)) e.push("Truck wear per mile must be between $0 and $10.");
  if (!nonneg(i.machineGph, 20)) e.push("Aerator fuel use must be between 0 and 20 gallons an hour.");
  if (!nonneg(i.equipHour, 1000)) e.push("Aerator rental or depreciation per hour must be between $0 and $1,000.");
  if (!nonneg(i.supplies, 5000)) e.push("Other supplies per job must be between $0 and $5,000.");
  if (!nonneg(i.processPct, 15)) e.push("Card fees must be between 0% and 15%.");
  if (!nonneg(i.annualFixed, 1000000)) e.push("Yearly insurance, truck payment and overhead must be between $0 and $1,000,000.");
  if (!(Number.isFinite(i.jobsPerYear) && i.jobsPerYear >= 1 && i.jobsPerYear <= 5000)) e.push("Aeration jobs per season must be between 1 and 5,000.");
  if (!nonneg(i.taxPct, 60)) e.push("Tax set-aside must be between 0% and 60%.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (e.length === 0 && i.processPct + i.targetMargin >= 100) e.push("Card fees plus target margin must be under 100%.");
  return e;
}

function figures(i) {
  const p = i.processPct / 100;
  const m = i.targetMargin / 100;
  const turf = i.lotSqft - i.bedsSqft;
  const ksf = turf / 1000;
  const aerRate = i.swathFt * i.speedMph * 5280 * (i.efficiencyPct / 100);
  const aerHours = (turf * i.passes) / aerRate;
  const seedHours = turf / i.spreadRate;
  const clockHours = aerHours + seedHours + i.extraHours;
  const crewHours = i.crewSize * (clockHours + i.driveHours + i.loadHours);
  const revenue = Math.max(i.price, i.minFee);
  const minFeeApplied = i.minFee > i.price;
  const labor = crewHours * i.wage * (1 + i.burdenPct / 100);
  const seedLbs = ksf * i.seedRate;
  const seedCost = seedLbs * i.seedPrice;
  const fertCost = ksf * i.fertRate * i.fertPrice;
  const machine = aerHours * (i.equipHour + i.machineGph * i.fuelPrice);
  const truckFuel = (i.miles / i.mpg) * i.fuelPrice;
  const truckWear = i.truckPerMile * i.miles;
  const processing = p * revenue;
  const fixedShare = i.annualFixed / i.jobsPerYear;
  const costs = labor + seedCost + fertCost + i.supplies + machine + truckFuel + truckWear + processing + fixedShare;
  const profit = revenue - costs;
  const setAside = Math.max(0, profit) * (i.taxPct / 100);
  const takeHome = profit - setAside;
  const margin = profit / revenue;
  const minRevenue = (costs - processing) / (1 - p - m);
  const afterWear = revenue - (costs - fixedShare);
  const breakevenJobs = afterWear > 0 ? i.annualFixed / afterWear : null;
  return {
    turf, aerRate, aerHours, seedHours, clockHours, crewHours, revenue, minFeeApplied, labor, seedLbs, seedCost, fertCost, supplies: i.supplies,
    machine, truckFuel, truckWear, processing, fixedShare, costs, profit, margin, profitPerCrewHour: profit / crewHours,
    revenuePerCrewHour: revenue / crewHours, setAside, takeHome, minRevenue, minGap: revenue - minRevenue, meets: margin >= m - 1e-12,
    pricePerKsf: revenue / ksf, minPricePerKsf: minRevenue / ksf, breakevenJobs,
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
  if (f.profit < 0) n.push(`This job loses ${cents(-f.profit)}. At ${cents(f.revenue)} it does not cover crew, seed, machine and truck.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. The job needs ${cents(f.minRevenue)} (${cents(f.minPricePerKsf)} per 1,000 sq ft of turf), which is ${cents(-f.minGap)} more.`);
  if (f.minFeeApplied) n.push(`Your minimum job fee of ${cents(i.minFee)} is higher than the ${cents(i.price)} quote, so the job is billed at the minimum.`);
  const mat = (f.seedCost + f.fertCost) / f.costs;
  if (mat > 0.4) n.push(`Seed and fertilizer are ${(mat * 100).toFixed(0)}% of the job's cost. A swing in seed price moves the whole quote.`);
  const labourShare = f.labor / f.costs;
  if (labourShare > 0.5) n.push(`Crew labor is ${(labourShare * 100).toFixed(0)}% of the job's cost. Passes and drive time decide this quote.`);
  if (f.breakevenJobs !== null && f.breakevenJobs > i.jobsPerYear) n.push(`You need ${Math.ceil(f.breakevenJobs)} jobs a season to cover overhead but plan on ${i.jobsPerYear}.`);
  if (f.breakevenJobs === null) n.push("Each job earns nothing above its direct costs, so the overhead is never covered at this price.");
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
  if (byHour !== byJob && byHour !== "tie" && byJob !== "tie") notes.push(`Job ${byHour} earns more per crew hour. If your crew is the limit on how many lawns fit into a fall weekend, Job ${byHour} fills the calendar better even though Job ${byJob} makes more on its own.`);
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
    price: 520, minFee: 150, lotSqft: 12000, bedsSqft: 2500, passes: 2, swathFt: 2, speedMph: 2.5, efficiencyPct: 60,
    seedRate: 6, seedPrice: 2.8, fertRate: 3, fertPrice: 1.1, spreadRate: 25000, extraHours: 0.5,
    crewSize: 2, driveHours: 0.5, loadHours: 0.5, miles: 30, wage: 22, burdenPct: 12, mpg: 13, fuelPrice: 3.7, truckPerMile: 0.35,
    machineGph: 0.8, equipHour: 18, supplies: 6, processPct: 3, annualFixed: 4800, jobsPerYear: 120, taxPct: 25, targetMargin: 30,
  };
}

export function sampleJob() {
  return { price: 800, lotSqft: 20000, bedsSqft: 4000, passes: 2, seedRate: 6, miles: 30 };
}

export function resultText(r) {
  const lines = [
    `Aeration + overseeding job check: ${Math.round(r.turf).toLocaleString("en-US")} sq ft of turf, ${r.input.passes} passes, ${r.seedLbs.toFixed(1)} lbs of seed, crew of ${r.input.crewSize}, ${r.crewHours.toFixed(2)} crew hours`,
    `Billed ${cents(r.revenue)}${r.minFeeApplied ? " (minimum job fee)" : ""} = ${cents(r.pricePerKsf)} per 1,000 sq ft; costs ${cents(r.costs)} (labor ${cents(r.labor)}, seed + fertilizer ${cents(r.seedCost + r.fertCost)})`,
    `True profit ${cents(r.profit)} per job, margin ${pct(r.margin)}, ${cents(r.profitPerCrewHour)} per crew hour`,
    `After ${r.input.taxPct}% set-aside: ${cents(r.takeHome)} per job`,
    `Lowest quote for a ${r.input.targetMargin}% margin: ${cents(r.minRevenue)} (${cents(r.minPricePerKsf)} per 1,000 sq ft)`,
    `Break-even jobs a season: ${r.breakevenJobs === null ? "n/a" : r.breakevenJobs.toFixed(0)}; profit at ${r.input.jobsPerYear} jobs: ${money(r.annualProfit)} a season`,
    "Arithmetic on the numbers entered, not tax, legal, insurance or financial advice.",
  ];
  return lines.join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["turf_sqft", r.turf], ["aerator_hours", r.aerHours], ["seeding_hours", r.seedHours], ["crew_hours", r.crewHours], ["revenue", r.revenue], ["labor", r.labor],
    ["seed_lbs", r.seedLbs], ["seed", r.seedCost], ["fertilizer", r.fertCost], ["other_supplies", r.supplies], ["machine", r.machine], ["truck_fuel", r.truckFuel],
    ["truck_wear", r.truckWear], ["card_fees", r.processing], ["yearly_overhead_share", r.fixedShare], ["total_costs", r.costs],
    ["profit_per_job", r.profit], ["margin", r.margin], ["profit_per_crew_hour", r.profitPerCrewHour], ["price_per_1000_sqft", r.pricePerKsf],
    ["tax_set_aside", r.setAside], ["take_home_per_job", r.takeHome], ["minimum_quote", r.minRevenue], ["minimum_price_per_1000_sqft", r.minPricePerKsf],
    ["breakeven_jobs_per_season", r.breakevenJobs === null ? "" : r.breakevenJobs], ["annual_profit", r.annualProfit],
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "lawn-aeration-overseeding-bid-calculator";
export function serializeState(input, job) { return JSON.stringify({ app: APP, version: 1, input, job: job || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved aeration and overseeding scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, job: d.job && typeof d.job === "object" ? d.job : null };
}
