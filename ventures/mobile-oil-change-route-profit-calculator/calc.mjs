// Mobile oil change route profit. Pure arithmetic over what an independent mobile oil-change operator types in: three kinds of service (conventional, synthetic,
// and fleet or commercial stops where one drive covers several vehicles), the price, on-site minutes and oil, filter and disposal cost of each, the drive between
// stops, how often a stop is a no-show or cancellation, the fixed costs of running a van, and the pay terms of three ways to do the same route: solo and independent,
// a franchisee who pays a franchise fee on revenue, or an employee on an hourly wage. It does not model used-oil disposal rules, EPA or state requirements.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const TYPES = [
  { id: "conv", label: "Conventional oil changes" },
  { id: "synth", label: "Synthetic oil changes" },
  { id: "fleet", label: "Fleet or commercial stops" },
];

const NUMERIC = [
  "convQty", "convPrice", "convMin", "convQuarts", "convQtCost", "convFilter",
  "synthQty", "synthPrice", "synthMin", "synthQuarts", "synthQtCost", "synthFilter",
  "fleetQty", "fleetBatch", "fleetPrice", "fleetMin", "fleetQuarts", "fleetQtCost", "fleetFilter",
  "disposalPerVehicle", "haulWeek",
  "tripFee", "failedPct", "failedPayPct", "failedMin",
  "driveMiles", "driveMin", "mileCost",
  "insuranceMonth", "toolsYear", "otherFixedMonth", "labRunHours", "ownerRate", "hoursAvailable", "targetMarginPct",
  "franchiseFeePct", "franchiseVolumePct", "franchiseSupplies", "employedWage", "employedMileReimb",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    convQty: f("convQty"), convPrice: f("convPrice", 70), convMin: f("convMin", 25), convQuarts: f("convQuarts", 5), convQtCost: f("convQtCost", 4), convFilter: f("convFilter", 6),
    synthQty: f("synthQty"), synthPrice: f("synthPrice", 110), synthMin: f("synthMin", 30), synthQuarts: f("synthQuarts", 5), synthQtCost: f("synthQtCost", 9), synthFilter: f("synthFilter", 9),
    fleetQty: f("fleetQty"), fleetBatch: f("fleetBatch", 4), fleetPrice: f("fleetPrice", 60), fleetMin: f("fleetMin", 22), fleetQuarts: f("fleetQuarts", 6), fleetQtCost: f("fleetQtCost", 4), fleetFilter: f("fleetFilter", 7),
    disposalPerVehicle: f("disposalPerVehicle", 1.5), haulWeek: f("haulWeek"),
    tripFee: f("tripFee"), failedPct: f("failedPct", 8), failedPayPct: f("failedPayPct"), failedMin: f("failedMin", 10),
    driveMiles: f("driveMiles", 10), driveMin: f("driveMin", 20), mileCost: f("mileCost", 0.7),
    insuranceMonth: f("insuranceMonth", 150), toolsYear: f("toolsYear", 300), otherFixedMonth: f("otherFixedMonth", 400), labRunHours: f("labRunHours", 3),
    ownerRate: f("ownerRate", 30), hoursAvailable: f("hoursAvailable", 40), targetMarginPct: f("targetMarginPct", 30),
    franchiseFeePct: f("franchiseFeePct", 30), franchiseVolumePct: f("franchiseVolumePct", 25), franchiseSupplies: f("franchiseSupplies"),
    employedWage: f("employedWage", 24), employedMileReimb: f("employedMileReimb", 0.6),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["convQty", "synthQty", "fleetQty", "fleetBatch"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number.` };
  if (v.fleetBatch < 1) return { error: "Vehicles per fleet stop must be at least 1." };
  if (v.fleetBatch > 100) return { error: "More than 100 vehicles at one fleet stop: check the number." };
  if (v.convQty + v.synthQty + v.fleetQty < 1) return { error: "Enter how many vehicles you service in a typical week." };
  if (v.convQty + v.synthQty + v.fleetQty > 1000) return { error: "That is far more than one operator can service in a week: check the quantities." };
  if (v.failedPct > 90) return { error: "No-shows are a percent of scheduled stops: keep it at or below 90." };
  if (v.failedPayPct > 100) return { error: "The share of the fee you still collect on a no-show is a percent: keep it at or below 100." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the fee." };
  if (v.franchiseFeePct >= 100) return { error: "The franchise fee is a percent of revenue: keep it below 100." };
  if (v.franchiseVolumePct > 500) return { error: "Extra volume from a franchise is a percent change in weekly vehicles: keep it at or below 500." };
  if (v.franchiseSupplies !== 0 && v.franchiseSupplies !== 1) return { error: "Franchise supplies must be 0 (you buy oil and filters) or 1 (the franchise supplies them)." };
  if (v.hoursAvailable <= 0 || v.hoursAvailable > 168) return { error: "Working hours per week must be above 0 and at most 168." };
  return { v };
}

export function fixedCosts(v) {
  const insurance = (v.insuranceMonth * 12) / 52;
  const cert = v.toolsYear / 52;
  const other = (v.otherFixedMonth * 12) / 52;
  const haul = v.haulWeek;
  const cash = insurance + cert + other + haul;
  return { insurance: round2(insurance), cert: round2(cert), other: round2(other), haul: round2(haul), total: round2(cash), cash, labRun: round2(v.labRunHours * v.ownerRate), withLabRun: cash + v.labRunHours * v.ownerRate };
}

// Per-type shape: vehicles per stop, price per vehicle, minutes per vehicle, and oil, filter and disposal cost per vehicle. Batching applies to fleet stops.
function shape(v, id, batch) {
  const mat = (q, c, fl) => q * c + fl + v.disposalPerVehicle;
  if (id === "conv") return { d: 1, price: v.convPrice, min: v.convMin, mat: mat(v.convQuarts, v.convQtCost, v.convFilter), stops: v.convQty };
  if (id === "synth") return { d: 1, price: v.synthPrice, min: v.synthMin, mat: mat(v.synthQuarts, v.synthQtCost, v.synthFilter), stops: v.synthQty };
  return { d: batch, price: v.fleetPrice, min: v.fleetMin, mat: mat(v.fleetQuarts, v.fleetQtCost, v.fleetFilter), stops: v.fleetQty / batch };
}

// Expected economics of ONE scheduled stop of a type: no-shows (a share of stops) drive there, spend a few minutes, and collect only failedPayPct of the stop's fee.
function stopEcon(v, id, batch) {
  const s = shape(v, id, batch);
  const f = v.failedPct / 100, keep = 1 - f, fp = v.failedPayPct / 100;
  const gross = s.d * s.price + v.tripFee;
  const revenue = gross * (keep + f * fp);
  const driveHours = v.driveMin / 60;
  const onsiteHours = (keep * s.d * s.min + f * v.failedMin) / 60;
  const supplies = keep * s.d * s.mat;
  const mileage = v.driveMiles * v.mileCost;
  const timeCost = (driveHours + onsiteHours) * v.ownerRate;
  const failedWaste = f * ((v.driveMin + v.failedMin) / 60 * v.ownerRate) + f * mileage; // drive and curb time spent on a stop that did not pay in full, expected per scheduled stop
  return { ...s, gross, revenue, supplies, mileage, driveHours, onsiteHours, timeCost, completed: keep * s.d, failedStopsShare: f, failedWaste, failedPaid: gross * f * fp };
}

function totals(v, { scale = 1, batch = v.fleetBatch } = {}) {
  const t = { stops: 0, scheduled: 0, completed: 0, failedStops: 0, revenue: 0, failedPaid: 0, supplies: 0, mileage: 0, driveHours: 0, onsiteHours: 0, failedGross: 0, failedWasteCost: 0, lostMargin: 0 };
  for (const type of TYPES) {
    const e = stopEcon(v, type.id, batch);
    const stops = e.stops * scale;
    t.stops += stops;
    t.scheduled += stops * e.d;
    t.completed += stops * e.completed;
    t.failedStops += stops * e.failedStopsShare;
    t.revenue += stops * e.revenue;
    t.failedPaid += stops * e.failedPaid;
    t.supplies += stops * e.supplies;
    t.mileage += stops * e.mileage;
    t.driveHours += stops * e.driveHours;
    t.onsiteHours += stops * e.onsiteHours;
    t.failedGross += stops * e.failedStopsShare * e.gross;
    t.failedWasteCost += stops * e.failedWaste;
    t.lostMargin += stops * e.failedStopsShare * (e.gross - e.d * e.mat) * (1 - v.failedPayPct / 100);
  }
  t.workHours = t.driveHours + t.onsiteHours + v.labRunHours;
  return t;
}

// One vehicle type: what a completed vehicle costs and earns once drive, no-shows, supplies and its share of the fixed costs are counted.
export function typeLine(v, type, all = totals(v)) {
  const e = stopEcon(v, type.id, v.fleetBatch);
  const fixedPerVehicle = all.completed > 0 ? fixedCosts(v).withLabRun / all.completed : 0;
  const revPerVehicle = e.revenue / (e.d * (1 - v.failedPct / 100));
  const costPerVehicle = (e.supplies + e.mileage + e.timeCost) / (e.d * (1 - v.failedPct / 100)) + fixedPerVehicle;
  const profit = revPerVehicle - costPerVehicle;
  const keep = 1 - v.failedPct / 100, fp = v.failedPayPct / 100;
  const k = (keep + (1 - keep) * fp) / keep; // revenue per completed vehicle is k * (fee + trip fee / vehicles per stop)
  const hours = e.driveHours + e.onsiteHours;
  const qty = type.id === "fleet" ? v.fleetQty : type.id === "conv" ? v.convQty : v.synthQty;
  const targetFee = Math.max(0, costPerVehicle / (1 - v.targetMarginPct / 100) / k - v.tripFee / e.d);
  return {
    id: type.id, label: type.label, qty, vehiclesPerStop: e.d, fee: round2(e.price), minutes: v[type.id + "Min"],
    stopCost: round2(e.mileage + e.driveHours * v.ownerRate), cost: round2(costPerVehicle), profit: round2(profit), marginPct: revPerVehicle > 0 ? round1((profit / revPerVehicle) * 100) : 0,
    perHour: hours > 0 ? round2((e.revenue - e.supplies - e.mileage) / hours) : 0, // take per working hour for this kind of stop, before fixed cost and before your own pay
    targetFee: round2(targetFee),
  };
}

// The same route done three ways, per week. "Net" is cash kept before the value of your own time; "afterPay" subtracts hours worked at the owner rate.
export function modes(v, { scale = 1, batch = v.fleetBatch } = {}) {
  const fx = fixedCosts(v);
  const t = totals(v, { scale, batch });
  const soloNet = t.revenue - t.supplies - t.mileage - fx.cash;
  const a = totals(v, { scale: scale * (1 + v.franchiseVolumePct / 100), batch });
  const keepShare = 1 - v.franchiseFeePct / 100;
  const franchiseNet = a.revenue * keepShare - (v.franchiseSupplies ? 0 : a.supplies) - a.mileage - fx.cash;
  const miles = v.mileCost > 0 ? t.mileage / v.mileCost : t.stops * v.driveMiles;
  const empNet = v.employedWage * t.workHours + v.employedMileReimb * miles - t.mileage;
  // Franchise fee at which the franchisee nets the same as solo, and the hourly wage at which employed nets the same as solo.
  const equalTake = a.revenue > 0 ? (1 - (soloNet + (v.franchiseSupplies ? 0 : a.supplies) + a.mileage + fx.cash) / a.revenue) * 100 : null;
  const equalWage = t.workHours > 0 ? (soloNet + t.mileage - v.employedMileReimb * miles) / t.workHours : null;
  return {
    t, a, fx, miles,
    solo: { net: soloNet, afterPay: soloNet - t.workHours * v.ownerRate, hours: t.workHours },
    franchise: { net: franchiseNet, afterPay: franchiseNet - a.workHours * v.ownerRate, hours: a.workHours, revenue: a.revenue, kept: a.revenue * keepShare, vehicles: a.scheduled },
    employed: { net: empNet, afterPay: empNet - t.workHours * v.ownerRate, hours: t.workHours },
    equalTake, equalWage,
  };
}

// Scheduled vehicles per week at which solo work covers fixed cost and your own time, at the current mix.
export function breakEven(v) {
  const t = totals(v);
  const fx = fixedCosts(v);
  const contribution = t.revenue - t.supplies - t.mileage - (t.driveHours + t.onsiteHours) * v.ownerRate;
  if (!(contribution > 0) || t.scheduled <= 0) return null;
  const scale = fx.withLabRun / contribution;
  return { scale: round2(scale), scheduled: round1(scale * t.scheduled), completed: round1(scale * t.completed), stops: round1(scale * t.stops), contribution: round2(contribution) };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const t = totals(v);
  const m = modes(v);
  const fx = fixedCosts(v);
  const lines = TYPES.map((x) => typeLine(v, x, t));
  const be = breakEven(v);
  const utilizationPct = round1((t.workHours / v.hoursAvailable) * 100);
  const failedDirect = t.failedWasteCost - t.failedPaid; // out of pocket on trips that failed: drive and curb time and mileage, less anything still collected
  const season = {
    lines, fixed: fx, scheduled: round1(t.scheduled), completed: round1(t.completed), stops: round1(t.stops), revenue: round2(t.revenue),
    driveHours: round1(t.driveHours), onsiteHours: round1(t.onsiteHours), labRunHours: v.labRunHours, workHours: round1(t.workHours), utilizationPct,
    soloNet: round2(m.solo.net), soloAfterPay: round2(m.solo.afterPay),
    profitPerVehicle: t.completed > 0 ? round2(m.solo.afterPay / t.completed) : 0,
    profitPerHour: round2(m.solo.net / t.workHours), profitPerHourAfterPay: round2(m.solo.afterPay / t.workHours),
    failedStops: round1(t.failedStops), failedCost: round2(t.failedWasteCost - t.failedPaid), failedLostMargin: round2(t.lostMargin),
    failedCostYear: round2((failedDirect + t.lostMargin) * 52), failedPaid: round2(t.failedPaid),
    franchiseNet: round2(m.franchise.net), franchiseAfterPay: round2(m.franchise.afterPay), franchiseHours: round1(m.franchise.hours), franchiseVehicles: round1(m.franchise.vehicles), franchiseKept: round2(m.franchise.kept),
    employedNet: round2(m.employed.net), employedAfterPay: round2(m.employed.afterPay),
    soloPerHour: round2(m.solo.net / m.solo.hours), franchisePerHour: round2(m.franchise.net / m.franchise.hours), employedPerHour: round2(m.employed.net / m.employed.hours),
    equalTake: m.equalTake === null ? null : round1(m.equalTake), equalWage: m.equalWage === null ? null : round2(m.equalWage),
    breakEven: be,
  };
  season.failedTotalWeek = round2(failedDirect + t.lostMargin);
  const advice = [];
  advice.push(`Solo and independent, per week: ${season.scheduled} vehicles serviced over ${season.stops} stops, ${season.completed} completed, ${usd(season.revenue)} collected, ${usd(season.soloNet)} kept after oil, filters, disposal, mileage, insurance, tools and van costs, and ${usd(season.soloAfterPay)} after valuing your ${season.workHours} working hours at ${usd(v.ownerRate)}.`);
  advice.push(`That is ${usd(season.profitPerVehicle)} profit per completed vehicle after your own time, and ${usd(season.profitPerHour)} per working hour with drive time counted (${usd(season.profitPerHourAfterPay)} after your time value). The week is ${season.driveHours} drive hours, ${season.onsiteHours} on site and ${v.labRunHours} on restocking, used-oil drop-off and paperwork.`);
  const active = lines.filter((l) => l.qty > 0);
  if (active.length > 1) {
    const best = [...active].sort((a, b) => b.perHour - a.perHour)[0], worst = [...active].sort((a, b) => a.perHour - b.perHour)[0];
    if (best.id !== worst.id) advice.push(`Per working hour, before fixed cost and your pay: ${active.map((l) => `${l.label.toLowerCase()} ${usd(l.perHour)}`).join(", ")}. ${best.label} earn the most for the time, ${worst.label.toLowerCase()} the least.`);
  }
  for (const l of active) {
    if (l.fee < l.targetFee) advice.push(`${l.label} at ${usd(l.fee)} a vehicle earn ${l.marginPct}% once drive, no-shows, supplies and a share of fixed cost are counted. For a ${v.targetMarginPct}% margin the price would need to be ${usd(l.targetFee)} a vehicle.`);
  }
  if (v.failedPct > 0) advice.push(`No-shows: ${v.failedPct}% of ${season.stops} stops is about ${season.failedStops} wasted trips a week. You still drive there and wait at the curb, so they cost ${usd(season.failedCost)} a week in mileage and the time you spent, plus ${usd(season.failedLostMargin)} of service margin that did not happen, about ${usd(season.failedCostYear)} a year. ${v.failedPayPct > 0 ? `Collecting ${v.failedPayPct}% of the fee recovers ${usd(season.failedPaid)} a week of that.` : "None of the fee is collected on a no-show: a cancellation fee or a confirmation text is worth testing."}`);
  if (be) advice.push(`Break-even for working solo, covering fixed costs and your own time: about ${be.scheduled} scheduled vehicles a week at this mix (${be.completed} completed, ${be.stops} stops), against ${season.scheduled} planned.${season.scheduled >= be.scheduled ? "" : " You plan fewer than that."}`);
  else advice.push("At these fees, each stop earns less than the drive, the oil, filters and your own time, so more vehicles do not cover fixed costs. Raise a price, add a trip fee, or batch fleet stops first.");
  advice.push(`Same route, three ways, per week: solo ${usd(season.soloNet)} kept (${usd(season.soloPerHour)} an hour worked), a franchisee paying ${v.franchiseFeePct}% of revenue, at ${season.franchiseVehicles} vehicles ${usd(season.franchiseNet)} (${usd(season.franchisePerHour)} an hour), an employee at ${usd(v.employedWage)} an hour plus ${usd(v.employedMileReimb)} a mile ${usd(season.employedNet)} (${usd(season.employedPerHour)} an hour). Employed assumes your employer pays oil, filters, disposal, insurance and the van.`);
  if (m.equalTake !== null) advice.push(`A franchise fee of about ${season.equalTake}% would match solo with ${v.franchiseVolumePct}% more vehicles; at your ${v.franchiseFeePct}% fee ${m.franchise.net >= m.solo.net ? "the franchise pays more" : "solo pays more"}. An hourly wage of ${usd(season.equalWage)} would match solo's take per hour.`);
  if (utilizationPct > 100) advice.push(`The week needs ${season.workHours} working hours against ${v.hoursAvailable} available (${utilizationPct}%). That route is not possible as planned.`);
  else advice.push(`The week uses ${season.workHours} of ${v.hoursAvailable} hours (${utilizationPct}%), and ${round1(season.driveHours / season.workHours * 100)}% of the hours worked are driving. Grouping fleet vehicles into one stop usually raises profit per hour faster than raising prices.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((s) => {
    const r = modes(v, { scale: s });
    return { pct: Math.round(s * 100), scheduled: round1(r.t.scheduled), hours: round1(r.t.workHours), utilizationPct: round1((r.t.workHours / v.hoursAvailable) * 100), solo: round2(r.solo.afterPay), franchise: round2(r.franchise.afterPay), employed: round2(r.employed.afterPay) };
  });
  const batchTable = [1, 2, 3, 4, 6].map((b) => {
    const r = modes(v, { batch: b });
    return { batch: b, stops: round1(r.t.stops), hours: round1(r.t.workHours), driveHours: round1(r.t.driveHours), net: round2(r.solo.net), afterPay: round2(r.solo.afterPay), perHour: round2(r.solo.net / r.t.workHours) };
  });
  return { error: null, input: v, season, table, batchTable, advice };
}

export function sampleInput() {
  return {
    convQty: "12", convPrice: "70", convMin: "25", convQuarts: "5", convQtCost: "4", convFilter: "6",
    synthQty: "10", synthPrice: "110", synthMin: "30", synthQuarts: "5", synthQtCost: "9", synthFilter: "9",
    fleetQty: "16", fleetBatch: "4", fleetPrice: "60", fleetMin: "22", fleetQuarts: "6", fleetQtCost: "4", fleetFilter: "7",
    disposalPerVehicle: "1.50", haulWeek: "0",
    tripFee: "0", failedPct: "8", failedPayPct: "0", failedMin: "10", driveMiles: "10", driveMin: "20", mileCost: "0.70",
    insuranceMonth: "150", toolsYear: "300", otherFixedMonth: "400", labRunHours: "3", ownerRate: "30", hoursAvailable: "40", targetMarginPct: "30",
    franchiseFeePct: "8", franchiseVolumePct: "20", franchiseSupplies: "0", employedWage: "20", employedMileReimb: "0.60",
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
  const head = "volume_pct,scheduled_vehicles_per_week,work_hours,hours_used_pct,solo_after_pay,franchisee_after_pay,employed_after_pay";
  return [head, ...result.table.map((r) => [r.pct, r.scheduled, r.hours, r.utilizationPct, r.solo, r.franchise, r.employed].join(","))].join("\n");
}
