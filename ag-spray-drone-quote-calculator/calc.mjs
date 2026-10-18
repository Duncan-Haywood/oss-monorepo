// Ag spray drone quote calculator: field-by-field time, cost and price per acre.
//
// A custom applicator flying a spray drone is limited by one of five things at
// a time, and which one decides the real acres per hour:
//   speed   the pump cannot deliver the gallons-per-acre at the top speed, so
//           the drone slows down (flow-limited) or the pilot's cap binds
//   sortie  a sortie ends when the tank is empty or the battery is, whichever
//           comes first
//   gap     between sorties the crew refills and swaps a battery; with few
//           battery sets, charging time, not the refill, sets the pace
// Pure functions, no I/O. US units: acres, gallons, feet, miles per hour.

export const FT_PER_MILE = 5280;
export const SQFT_PER_ACRE = 43560;
export const MAX_FIELDS = 200;

export const SAMPLE_FIELDS = [
  "Miller north 80 | 80 | 6",
  "Miller creek bottom | 22 | 6 | 25",
  "Hanson soybeans | 160 | 14",
  "Hanson corner pivot | 35 | 14 | 15",
  "Oakridge orchard | 12 | 9 | 40",
  "Davis wheat | 240 | 22",
  "Tiny hobby field | 4 | 18 | 10",
].join("\n");

export const SAMPLE_ECON = {
  swath: 24, maxSpeed: 15, pump: 3.2, tank: 10.5, rate: 2, battMin: 9, sets: 3, charge: 16, swap: 1.5, refill: 3.5,
  turnEff: 85, setup: 12, drivePrice: 0.7, driveMph: 45, crew: 2, wage: 28,
  dronePrice: 26000, resale: 25, life: 1500, battPrice: 1400, battCycles: 1500,
  fixed: 7500, season: 5000, margin: 30, minCharge: 150, price: 9,
};

const NUM_KEYS = Object.keys(SAMPLE_ECON);

export function num(x) {
  const s = String(x ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function parseFields(text) {
  const fields = [], errors = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split("|").map((s) => s.trim());
    const where = `Field line ${i + 1}`;
    if (parts.length < 3 || parts.length > 4) { errors.push(`${where}: use name | acres | miles one way | extra % (optional).`); return; }
    const acres = num(parts[1]), miles = num(parts[2]), extra = parts[3] === undefined || parts[3] === "" ? 0 : num(parts[3]);
    if (!parts[0]) errors.push(`${where}: the field needs a name.`);
    else if (!(acres > 0) || acres > 100000) errors.push(`${where} (${parts[0]}): acres must be a number above 0.`);
    else if (!(miles >= 0) || miles > 1000) errors.push(`${where} (${parts[0]}): miles one way must be 0 or more.`);
    else if (!(extra >= 0) || extra > 300) errors.push(`${where} (${parts[0]}): extra % must be between 0 and 300.`);
    else fields.push({ name: parts[0], acres, miles, extra });
  });
  return { fields, errors };
}

export function buildSpec(input) {
  const errors = [];
  const spec = {};
  for (const k of NUM_KEYS) {
    const v = num(input[k]);
    if (Number.isNaN(v)) errors.push(`Enter a number for "${k}".`);
    spec[k] = v;
  }
  const f = parseFields(input.fields);
  errors.push(...f.errors);
  spec.fields = f.fields;
  return { spec, errors };
}

const RANGES = {
  swath: [5, 100, "Swath width (ft)"], maxSpeed: [1, 40, "Top spraying speed (mph)"], pump: [0.1, 30, "Pump flow (gal/min)"],
  tank: [0.5, 60, "Tank size (gal)"], rate: [0.2, 20, "Application rate (gal/acre)"], battMin: [1, 60, "Flight minutes per battery"],
  sets: [1, 20, "Battery sets"], charge: [0, 240, "Charge minutes"], swap: [0, 30, "Swap minutes"], refill: [0, 60, "Refill minutes"],
  turnEff: [30, 100, "Coverage efficiency (%)"], setup: [0, 240, "Setup minutes per field"], drivePrice: [0, 10, "Truck cost per mile ($)"],
  driveMph: [5, 80, "Driving speed (mph)"], crew: [1, 10, "Crew size"], wage: [0, 500, "Crew hourly cost ($)"],
  dronePrice: [0, 1e7, "Drone price ($)"], resale: [0, 100, "Resale value (%)"], life: [10, 1e5, "Drone life (flight hours)"],
  battPrice: [0, 1e6, "Battery set price ($)"], battCycles: [10, 1e5, "Battery cycles"], fixed: [0, 1e7, "Fixed cost per year ($)"],
  season: [1, 1e7, "Acres per season"], margin: [0, 90, "Target margin (%)"], minCharge: [0, 1e6, "Minimum charge per field ($)"], price: [0, 1e4, "Price per acre ($)"],
};

export function validateSpec(spec) {
  const errors = [];
  for (const [k, [lo, hi, label]] of Object.entries(RANGES)) {
    const v = spec[k];
    if (!(v >= lo && v <= hi)) errors.push(`${label} must be between ${lo} and ${hi}.`);
  }
  if (!spec.fields || spec.fields.length === 0) errors.push("Add at least one field.");
  if (spec.fields && spec.fields.length > MAX_FIELDS) errors.push(`At most ${MAX_FIELDS} fields.`);
  return errors;
}

// Gallons delivered per acre cannot exceed what the pump moves: at ground
// speed v, acres per minute = swath * v * 88 / 43560, gallons per minute =
// rate * that. The pump caps v.
export function machine(spec) {
  const apmPerMph = (spec.swath * (FT_PER_MILE / 60)) / SQFT_PER_ACRE;
  const flowSpeed = spec.pump / (spec.rate * apmPerMph);
  const speed = Math.min(spec.maxSpeed, flowSpeed);
  const speedLimit = flowSpeed < spec.maxSpeed ? "pump flow" : "top speed";
  const apm = speed * apmPerMph * (spec.turnEff / 100);
  const tankAcres = spec.tank / spec.rate;
  return { speed, flowSpeed, speedLimit, apm, tankAcres, acresPerSprayHour: apm * 60 };
}

function sortieFor(spec, apm) {
  const tankAcres = spec.tank / spec.rate;
  const battAcres = spec.battMin * apm;
  return battAcres < tankAcres
    ? { acres: battAcres, limit: "battery flight time" }
    : { acres: tankAcres, limit: "tank size" };
}

// Start of sortie k (0-based): each sortie waits for the crew turnaround after
// the one before (a = flight + turn) and for its battery set to be charged
// (b = flight + charge, the set last flew N sorties earlier). The longest path
// through those two kinds of step gives a closed form.
export function startOfSortie(k, flight, spec) {
  const a = flight + spec.refill + spec.swap;
  const b = flight + spec.charge;
  return Math.max(k * a, Math.floor(k / spec.sets) * b + (k % spec.sets) * a);
}

function fieldTimes(spec, acres, extra) {
  const m = machine(spec);
  const apm = m.apm / (1 + extra / 100);
  const s = sortieFor(spec, apm);
  const sorties = Math.max(1, Math.ceil(acres / s.acres - 1e-9));
  const fullFlight = s.acres / apm;
  const flightMin = acres / apm;
  const lastFlight = flightMin - (sorties - 1) * fullFlight;
  const sprayMin = startOfSortie(sorties - 1, fullFlight, spec) + lastFlight;
  return { apm, sortieAcres: s.acres, sortieLimit: s.limit, sorties, fullFlight, flightMin, sprayMin };
}

export function solve(spec) {
  const m = machine(spec);
  const wearPerFlightHr = (spec.dronePrice * (1 - spec.resale / 100)) / spec.life;
  const battPerSortie = spec.battPrice / spec.battCycles;
  const totalAcres = spec.fields.reduce((s, f) => s + f.acres, 0);
  const overheadPerAcre = spec.fixed / spec.season;
  const rows = spec.fields.map((f) => {
    const t = fieldTimes(spec, f.acres, f.extra);
    const driveMin = (2 * f.miles / spec.driveMph) * 60;
    const crewHours = (t.sprayMin + spec.setup + driveMin) / 60;
    const droneWear = (t.flightMin / 60) * wearPerFlightHr;
    const battery = t.sorties * battPerSortie;
    const labor = crewHours * spec.crew * spec.wage;
    const truck = 2 * f.miles * spec.drivePrice;
    const variable = droneWear + battery + labor + truck;
    const overhead = f.acres * overheadPerAcre;
    const cost = variable + overhead;
    const quote = Math.max(spec.minCharge, spec.price * f.acres);
    const floorQuote = Math.max(spec.minCharge, cost / (1 - spec.margin / 100));
    return {
      ...f, ...t, driveMin, crewHours, gallons: f.acres * spec.rate, loads: f.acres / m.tankAcres,
      droneWear, battery, labor, truck, variable, overhead, cost,
      quote, profit: quote - cost, margin: quote > 0 ? (quote - cost) / quote : 0,
      perAcreCost: cost / f.acres, recommended: floorQuote, recommendedPerAcre: floorQuote / f.acres,
      profitPerCrewHour: (quote - cost) / crewHours,
      minChargeBinds: spec.minCharge > spec.price * f.acres,
    };
  });
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  const revenue = sum("quote"), cost = sum("cost"), variable = sum("variable");
  const contributionPerAcre = (revenue - variable) / totalAcres;
  const priceAt = (p) => {
    const rev = rows.reduce((s, r) => s + Math.max(spec.minCharge, p * r.acres), 0);
    const profit = rev - cost;
    return { price: p, revenue: rev, profit, margin: rev > 0 ? profit / rev : 0, seasonProfit: ((rev - variable) / totalAcres) * spec.season - spec.fixed };
  };
  const mixCost = cost / totalAcres;
  const baseline = mixCost / (1 - spec.margin / 100);
  const ladder = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35].map((k) => priceAt(Math.round(baseline * k * 100) / 100));
  const f0 = sortieFor(spec, m.apm).acres / m.apm;
  const gapLimit = (f0 + spec.charge) / spec.sets > f0 + spec.refill + spec.swap + 1e-9 ? "battery charging" : "refill and battery swap";
  return {
    machine: m, rows, totalAcres, revenue, cost, variable, profit: revenue - cost, margin: revenue > 0 ? (revenue - cost) / revenue : 0,
    crewHours: sum("crewHours"), sorties: sum("sorties"), gallons: sum("gallons"),
    contributionPerAcre, breakEvenAcres: contributionPerAcre > 0 ? spec.fixed / contributionPerAcre : Infinity,
    seasonProfit: contributionPerAcre * spec.season - spec.fixed, mixCost, baselinePrice: baseline, ladder,
    sortieLimit: sortieFor(spec, m.apm).limit, gapLimit,
    bestFirst: [...rows].sort((a, b) => b.profitPerCrewHour - a.profitPerCrewHour).map((r) => r.name),
  };
}

// Independent check: replay each field sortie by sortie with a clock and a
// ready-time per battery set, instead of the closed form, and compare. Also
// checks gallons-per-acre against the pump and that cost lines add up.
export function verifyPlan(spec, res) {
  const problems = [];
  const m = res.machine;
  if (m.speed * ((spec.swath * FT_PER_MILE / 60) / SQFT_PER_ACRE) * spec.rate > spec.pump + 1e-9) problems.push("Required flow exceeds the pump.");
  res.rows.forEach((r) => {
    const ready = new Array(spec.sets).fill(0);
    let clock = 0, left = r.acres, end = 0, count = 0;
    while (left > 1e-9) {
      const k = ready.indexOf(Math.min(...ready));
      const acres = Math.min(r.sortieAcres, left);
      const flight = acres / r.apm;
      const start = Math.max(clock, ready[k]);
      end = start + flight;
      ready[k] = end + spec.charge;
      clock = end + spec.refill + spec.swap;
      left -= acres;
      count++;
    }
    if (count !== r.sorties) problems.push(`${r.name}: replay used ${count} sorties, formula ${r.sorties}.`);
    if (Math.abs(end - r.sprayMin) > 1e-6 * Math.max(1, end)) problems.push(`${r.name}: replay time ${end.toFixed(3)} min, formula ${r.sprayMin.toFixed(3)}.`);
    if (Math.abs(r.droneWear + r.battery + r.labor + r.truck + r.overhead - r.cost) > 1e-6) problems.push(`${r.name}: cost lines do not add up.`);
  });
  if (Math.abs(res.revenue - res.cost - res.profit) > 1e-6) problems.push("Totals do not add up.");
  return problems;
}

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function planCsv(spec, res) {
  const head = ["field", "acres", "miles one way", "extra %", "sorties", "spray minutes", "crew hours", "gallons of mix", "cost", "quote", "profit", "margin %", "recommended quote", "recommended $/acre"];
  const lines = [head.join(",")];
  for (const r of res.rows) {
    lines.push([r.name, r.acres, r.miles, r.extra, r.sorties, r.sprayMin.toFixed(1), r.crewHours.toFixed(2), r.gallons.toFixed(1), r.cost.toFixed(2), r.quote.toFixed(2), r.profit.toFixed(2), (r.margin * 100).toFixed(1), r.recommended.toFixed(2), r.recommendedPerAcre.toFixed(2)].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

export const money0 = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = (n, d = 1) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (p, d = 0) => `${(p * 100).toFixed(d)}%`;
