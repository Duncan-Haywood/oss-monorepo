// Hydroseeding job bid. Pure arithmetic over what a hydroseeding contractor types in: the job's area, seed, mulch, tackifier and water per
// thousand square feet, how fast the crew sprays and how many tank loads the job needs, labor, truck and travel, and the hydroseeder and
// overhead the season has to carry. It turns that into the cost and profit of one job, the price per 1,000 sq ft that earns a target margin,
// a table of job sizes (where the minimum charge and the setup hours bite), and the season result against jobs per season.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

const NUMERIC = [
  "areaSqft", "jobsPerSeason", "seedLbPer1k", "seedCostLb", "mulchLbPer1k", "mulchCostBale", "extraPer1k", "waterGalPer1k", "waterPer1kGal",
  "tankGal", "sprayRate1kPerHr", "refillMin", "setupHrs", "crewSize", "crewRate", "burdenPct", "travelMiles", "truckCostPerMile",
  "machineCost", "machineYears", "otherFixed", "pricePer1k", "minCharge", "slopePremiumPct", "slopeSharePct", "targetMarginPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    areaSqft: f("areaSqft"), jobsPerSeason: f("jobsPerSeason", 60), seedLbPer1k: f("seedLbPer1k", 4), seedCostLb: f("seedCostLb", 2.5),
    mulchLbPer1k: f("mulchLbPer1k", 70), mulchCostBale: f("mulchCostBale", 17), extraPer1k: f("extraPer1k", 1.5), waterGalPer1k: f("waterGalPer1k", 90),
    waterPer1kGal: f("waterPer1kGal", 6), tankGal: f("tankGal", 1500), sprayRate1kPerHr: f("sprayRate1kPerHr", 20), refillMin: f("refillMin", 20),
    setupHrs: f("setupHrs", 1.5), crewSize: f("crewSize", 2), crewRate: f("crewRate", 22), burdenPct: f("burdenPct", 15), travelMiles: f("travelMiles", 40),
    truckCostPerMile: f("truckCostPerMile", 1.1), machineCost: f("machineCost", 38000), machineYears: f("machineYears", 7), otherFixed: f("otherFixed", 6000),
    pricePer1k: f("pricePer1k", 85), minCharge: f("minCharge", 450), slopePremiumPct: f("slopePremiumPct", 0), slopeSharePct: f("slopeSharePct", 0),
    targetMarginPct: f("targetMarginPct", 35),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (v.areaSqft < 1) return { error: "Enter the job area in square feet." };
  if (v.areaSqft > 20000000) return { error: "That area is far beyond one hydroseeding job: check the square feet." };
  if (v.sprayRate1kPerHr <= 0) return { error: "Spray rate must be above zero thousand sq ft per hour." };
  if (v.tankGal <= 0) return { error: "Tank size must be above zero gallons." };
  if (v.waterGalPer1k <= 0) return { error: "Enter the gallons of slurry you spray per 1,000 sq ft." };
  if (v.crewSize < 1) return { error: "Crew size must be at least 1." };
  if (v.machineYears < 1) return { error: "The hydroseeder must be spread over at least 1 year." };
  if (v.jobsPerSeason < 1) return { error: "Enter at least 1 job per season." };
  if (v.slopeSharePct > 100) return { error: "The share of steep jobs is a percentage up to 100." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the price." };
  return { v };
}

// Cost and profit of one job of `area` sq ft. Fixed cost is kept out: it belongs to the season, not the job.
export function jobLine(v, area = v.areaSqft) {
  const k = area / 1000;
  const seed = k * v.seedLbPer1k * v.seedCostLb;
  const mulch = (k * v.mulchLbPer1k / 50) * v.mulchCostBale;
  const extra = k * v.extraPer1k;
  const gallons = k * v.waterGalPer1k;
  const water = (gallons / 1000) * v.waterPer1kGal;
  const loads = Math.max(1, Math.ceil(gallons / v.tankGal));
  const hours = v.setupHrs + k / v.sprayRate1kPerHr + (loads - 1) * (v.refillMin / 60);
  const labor = hours * v.crewSize * v.crewRate * (1 + v.burdenPct / 100);
  const travel = v.travelMiles * v.truckCostPerMile;
  const materials = seed + mulch + extra + water;
  const cost = materials + labor + travel;
  const slopeBoost = 1 + (v.slopePremiumPct / 100) * (v.slopeSharePct / 100);
  const priced = k * v.pricePer1k * slopeBoost;
  const revenue = Math.max(v.minCharge, priced);
  const profit = revenue - cost;
  return {
    area, loads, gallons: Math.round(gallons), hours: round2(hours), seed: round2(seed), mulch: round2(mulch), extra: round2(extra), water: round2(water),
    materials: round2(materials), labor: round2(labor), travel: round2(travel), cost: round2(cost), revenue: round2(revenue), profit: round2(profit),
    marginPct: revenue > 0 ? round1((profit / revenue) * 100) : 0, perCrewHour: hours > 0 ? round2((revenue - materials - travel) / hours) : 0,
    minApplies: priced < v.minCharge,
    // Price per 1,000 sq ft that earns the target margin at this size (a minimum charge would sit on top of this).
    targetPer1k: round2(cost / (1 - v.targetMarginPct / 100) / k / slopeBoost),
  };
}

export function fixedCosts(v) {
  const machine = v.machineCost / v.machineYears;
  return { machine: round2(machine), other: round2(v.otherFixed), total: round2(machine + v.otherFixed) };
}

export function seasonResult(v, scale = 1) {
  const job = jobLine(v);
  const jobs = Math.round(v.jobsPerSeason * scale);
  const fixed = fixedCosts(v);
  const revenue = jobs * job.revenue;
  const contribution = jobs * job.profit;
  const profit = contribution - fixed.total;
  return { scale, jobs, job, fixed, revenue: round2(revenue), contribution: round2(contribution), profit: round2(profit), hours: round1(jobs * job.hours) };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const res = seasonResult(v);
  const j = res.job;
  const advice = [];
  advice.push(`This ${v.areaSqft.toLocaleString("en-US")} sq ft job needs ${j.gallons.toLocaleString("en-US")} gallons of slurry, so ${j.loads} tank load${j.loads > 1 ? "s" : ""}, and about ${j.hours} crew hours including setup. Direct cost: ${usd(j.cost)} (materials ${usd(j.materials)}, labor ${usd(j.labor)}, travel ${usd(j.travel)}).`);
  advice.push(`At ${usd(v.pricePer1k)} per 1,000 sq ft${j.minApplies ? ` the minimum charge of ${usd(v.minCharge)} applies` : ""} you bill ${usd(j.revenue)} and keep ${usd(j.profit)} (${j.marginPct}%) before the hydroseeder and overhead.`);
  if (j.marginPct < v.targetMarginPct) advice.push(`For a ${v.targetMarginPct}% margin this job needs about ${usd(j.targetPer1k)} per 1,000 sq ft, or ${usd(round2(j.targetPer1k * v.areaSqft / 1000))} in total.`);
  if (j.profit <= 0) advice.push("This job loses money before any fixed cost. More jobs like it make the season worse, so raise the price or the minimum charge first.");
  else {
    const be = Math.ceil(res.fixed.total / j.profit);
    advice.push(`Fixed cost for the season is ${usd(res.fixed.total)} (hydroseeder ${usd(res.fixed.machine)} a year, overhead ${usd(res.fixed.other)}). At ${usd(j.profit)} a job you break even at about ${be} jobs; you plan ${v.jobsPerSeason}, a season result of ${usd(res.profit)}.`);
  }
  const loadShare = j.loads > 1 ? round1(((j.loads - 1) * v.refillMin / 60 / j.hours) * 100) : 0;
  if (loadShare >= 15) advice.push(`Refilling the tank takes about ${loadShare}% of this job's crew hours. A bigger tank or a closer water source buys more than a faster nozzle.`);
  if (v.travelMiles * v.truckCostPerMile + v.setupHrs * v.crewSize * v.crewRate * (1 + v.burdenPct / 100) > 0.35 * j.cost && j.revenue > 0)
    advice.push("Setup and travel are over a third of this job's cost: it is a small job priced like a big one. Check the size table for where the minimum charge stops saving you.");
  const sizes = [2000, 5000, 10000, 25000, 50000, 100000];
  const table = sizes.map((a) => { const l = jobLine(v, a); return { area: a, loads: l.loads, hours: l.hours, cost: l.cost, revenue: l.revenue, profit: l.profit, marginPct: l.marginPct, minApplies: l.minApplies }; });
  const seasonTable = [0.5, 0.75, 1, 1.25, 1.5].map((s) => { const r = seasonResult(v, s); return { pct: Math.round(s * 100), jobs: r.jobs, revenue: r.revenue, profit: r.profit, hours: r.hours }; });
  return { error: null, input: v, season: res, table, seasonTable, advice };
}

export function sampleInput() {
  return {
    areaSqft: "20000", jobsPerSeason: "60", seedLbPer1k: "4", seedCostLb: "2.5", mulchLbPer1k: "70", mulchCostBale: "17", extraPer1k: "1.5", waterGalPer1k: "90",
    waterPer1kGal: "6", tankGal: "1500", sprayRate1kPerHr: "20", refillMin: "20", setupHrs: "1.5", crewSize: "2", crewRate: "22", burdenPct: "15",
    travelMiles: "40", truckCostPerMile: "1.1", machineCost: "38000", machineYears: "7", otherFixed: "6000", pricePer1k: "85", minCharge: "450",
    slopePremiumPct: "25", slopeSharePct: "20", targetMarginPct: "35",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = [...NUMERIC];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 200));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 200);
  return out;
}

export function toCsv(result) {
  const head = "job_sqft,tank_loads,crew_hours,cost,revenue,profit,margin_pct";
  return [head, ...result.table.map((r) => [r.area, r.loads, r.hours, r.cost, r.revenue, r.profit, r.marginPct].join(","))].join("\n");
}
