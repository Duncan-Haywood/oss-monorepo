// Mobile phlebotomy route profit. Pure arithmetic over what an independent mobile phlebotomist types in: three kinds of draw (routine home or office,
// STAT or priority, and facility or batch visits where one drive covers several patients), the fee, on-site minutes and supplies of each, the drive between
// stops, how often a trip fails at the door, the fixed costs of staying in business, and the pay terms of three ways to do the same route: solo and independent,
// a contractor paid per draw by an agency that keeps a take, or an employee on an hourly wage. It does not model licensure, CLIA, state or payer rules.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const TYPES = [
  { id: "routine", label: "Routine home or office draws" },
  { id: "stat", label: "STAT or priority draws" },
  { id: "facility", label: "Facility or batch visits" },
];

const NUMERIC = [
  "routineQty", "routinePrice", "routineMin", "routineMat", "routineBatch",
  "statQty", "statPrice", "statPremium", "statMin", "statMat",
  "facilityVisits", "facilityDraws", "facilityPrice", "facilityMin", "facilityMat",
  "tripFee", "failedPct", "failedPayPct", "failedMin",
  "driveMiles", "driveMin", "mileCost",
  "insuranceMonth", "certYear", "otherFixedMonth", "labRunHours", "ownerRate", "hoursAvailable", "targetMarginPct",
  "agencyTakePct", "agencyVolumePct", "agencySupplies", "employedWage", "employedMileReimb",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    routineQty: f("routineQty"), routinePrice: f("routinePrice", 45), routineMin: f("routineMin", 15), routineMat: f("routineMat", 4), routineBatch: f("routineBatch", 1),
    statQty: f("statQty"), statPrice: f("statPrice", 45), statPremium: f("statPremium", 25), statMin: f("statMin", 20), statMat: f("statMat", 4),
    facilityVisits: f("facilityVisits"), facilityDraws: f("facilityDraws", 6), facilityPrice: f("facilityPrice", 28), facilityMin: f("facilityMin", 8), facilityMat: f("facilityMat", 3),
    tripFee: f("tripFee"), failedPct: f("failedPct", 8), failedPayPct: f("failedPayPct"), failedMin: f("failedMin", 10),
    driveMiles: f("driveMiles", 9), driveMin: f("driveMin", 18), mileCost: f("mileCost", 0.7),
    insuranceMonth: f("insuranceMonth", 85), certYear: f("certYear", 150), otherFixedMonth: f("otherFixedMonth"), labRunHours: f("labRunHours", 3),
    ownerRate: f("ownerRate", 30), hoursAvailable: f("hoursAvailable", 40), targetMarginPct: f("targetMarginPct", 30),
    agencyTakePct: f("agencyTakePct", 30), agencyVolumePct: f("agencyVolumePct", 25), agencySupplies: f("agencySupplies"),
    employedWage: f("employedWage", 24), employedMileReimb: f("employedMileReimb", 0.6),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["routineQty", "statQty", "facilityVisits", "facilityDraws", "routineBatch"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number.` };
  if (v.routineBatch < 1) return { error: "Draws per home or office stop must be at least 1." };
  if (v.routineBatch > 20) return { error: "More than 20 draws at one home or office stop is a facility visit: use the facility line instead." };
  if (v.facilityVisits > 0 && v.facilityDraws < 1) return { error: "A facility visit needs at least 1 draw." };
  if (v.facilityDraws > 100) return { error: "More than 100 draws in one facility visit: check the number." };
  if (v.routineQty + v.statQty + v.facilityVisits * v.facilityDraws < 1) return { error: "Enter how many draws you schedule in a typical week." };
  if (v.routineQty + v.statQty + v.facilityVisits * v.facilityDraws > 1000) return { error: "That is far more than one phlebotomist can draw in a week: check the quantities." };
  if (v.failedPct > 90) return { error: "Failed trips are a percent of scheduled stops: keep it at or below 90." };
  if (v.failedPayPct > 100) return { error: "The share of the fee you still collect on a failed trip is a percent: keep it at or below 100." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the fee." };
  if (v.agencyTakePct >= 100) return { error: "The agency's take is a percent of what it bills: keep it below 100." };
  if (v.agencyVolumePct > 500) return { error: "Extra volume from an agency is a percent change in weekly draws: keep it at or below 500." };
  if (v.agencySupplies !== 0 && v.agencySupplies !== 1) return { error: "Agency supplies must be 0 (you buy them) or 1 (the agency supplies them)." };
  if (v.hoursAvailable <= 0 || v.hoursAvailable > 168) return { error: "Working hours per week must be above 0 and at most 168." };
  return { v };
}

export function fixedCosts(v) {
  const insurance = (v.insuranceMonth * 12) / 52;
  const cert = v.certYear / 52;
  const other = (v.otherFixedMonth * 12) / 52;
  const cash = insurance + cert + other;
  return { insurance: round2(insurance), cert: round2(cert), other: round2(other), total: round2(cash), cash, labRun: round2(v.labRunHours * v.ownerRate), withLabRun: cash + v.labRunHours * v.ownerRate };
}

// Per-type shape: draws per stop, the all-in fee per draw (STAT includes its premium), minutes and supplies per draw.
function shape(v, id, batch) {
  if (id === "routine") return { d: batch, price: v.routinePrice, min: v.routineMin, mat: v.routineMat, stops: v.routineQty / batch };
  if (id === "stat") return { d: 1, price: v.statPrice + v.statPremium, min: v.statMin, mat: v.statMat, stops: v.statQty };
  return { d: v.facilityDraws, price: v.facilityPrice, min: v.facilityMin, mat: v.facilityMat, stops: v.facilityVisits };
}

// Expected economics of ONE scheduled stop of a type: failed trips (a share of stops) drive there, spend a few minutes, and collect only failedPayPct of the stop's fee.
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
  const failedWaste = f * ((v.driveMin + v.failedMin) / 60 * v.ownerRate) + f * mileage; // drive and door time spent on a stop that did not pay in full, expected per scheduled stop
  return { ...s, gross, revenue, supplies, mileage, driveHours, onsiteHours, timeCost, completed: keep * s.d, failedStopsShare: f, failedWaste, failedPaid: gross * f * fp };
}

function totals(v, { scale = 1, batch = v.routineBatch } = {}) {
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

// One draw type: what a completed draw costs and earns once drive, failed trips, supplies and its share of the fixed costs are counted.
export function typeLine(v, type, all = totals(v)) {
  const e = stopEcon(v, type.id, v.routineBatch);
  const fixedPerDraw = all.completed > 0 ? fixedCosts(v).withLabRun / all.completed : 0;
  const revPerDraw = e.revenue / (e.d * (1 - v.failedPct / 100));
  const costPerDraw = (e.supplies + e.mileage + e.timeCost) / (e.d * (1 - v.failedPct / 100)) + fixedPerDraw;
  const profit = revPerDraw - costPerDraw;
  const keep = 1 - v.failedPct / 100, fp = v.failedPayPct / 100;
  const k = (keep + (1 - keep) * fp) / keep; // revenue per completed draw is k * (fee + trip fee / draws per stop)
  const hours = e.driveHours + e.onsiteHours;
  const qty = type.id === "facility" ? v.facilityVisits * v.facilityDraws : type.id === "routine" ? v.routineQty : v.statQty;
  const targetFee = Math.max(0, costPerDraw / (1 - v.targetMarginPct / 100) / k - v.tripFee / e.d);
  return {
    id: type.id, label: type.label, qty, drawsPerStop: e.d, fee: round2(e.price), minutes: v[type.id === "facility" ? "facilityMin" : type.id + "Min"],
    stopCost: round2(e.mileage + e.driveHours * v.ownerRate), cost: round2(costPerDraw), profit: round2(profit), marginPct: revPerDraw > 0 ? round1((profit / revPerDraw) * 100) : 0,
    perHour: hours > 0 ? round2((e.revenue - e.supplies - e.mileage) / hours) : 0, // take per working hour for this kind of stop, before fixed cost and before your own pay
    targetFee: round2(targetFee), targetBaseFee: type.id === "stat" ? round2(Math.max(0, targetFee - v.statPremium)) : null,
  };
}

// The same route done three ways, per week. "Net" is cash kept before the value of your own time; "afterPay" subtracts hours worked at the owner rate.
export function modes(v, { scale = 1, batch = v.routineBatch } = {}) {
  const fx = fixedCosts(v);
  const t = totals(v, { scale, batch });
  const soloNet = t.revenue - t.supplies - t.mileage - fx.cash;
  const a = totals(v, { scale: scale * (1 + v.agencyVolumePct / 100), batch });
  const keepShare = 1 - v.agencyTakePct / 100;
  const agencyNet = a.revenue * keepShare - (v.agencySupplies ? 0 : a.supplies) - a.mileage - fx.cash;
  const miles = v.mileCost > 0 ? t.mileage / v.mileCost : t.stops * v.driveMiles;
  const empNet = v.employedWage * t.workHours + v.employedMileReimb * miles - t.mileage;
  // Agency take at which the contractor nets the same as solo, and the hourly wage at which employed nets the same as solo.
  const equalTake = a.revenue > 0 ? (1 - (soloNet + (v.agencySupplies ? 0 : a.supplies) + a.mileage + fx.cash) / a.revenue) * 100 : null;
  const equalWage = t.workHours > 0 ? (soloNet + t.mileage - v.employedMileReimb * miles) / t.workHours : null;
  return {
    t, a, fx, miles,
    solo: { net: soloNet, afterPay: soloNet - t.workHours * v.ownerRate, hours: t.workHours },
    agency: { net: agencyNet, afterPay: agencyNet - a.workHours * v.ownerRate, hours: a.workHours, revenue: a.revenue, kept: a.revenue * keepShare, draws: a.scheduled },
    employed: { net: empNet, afterPay: empNet - t.workHours * v.ownerRate, hours: t.workHours },
    equalTake, equalWage,
  };
}

// Scheduled draws per week at which solo work covers fixed cost and your own time, at the current mix.
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
  const failedDirect = t.failedWasteCost - t.failedPaid; // out of pocket on trips that failed: drive and door time and mileage, less anything still collected
  const season = {
    lines, fixed: fx, scheduled: round1(t.scheduled), completed: round1(t.completed), stops: round1(t.stops), revenue: round2(t.revenue),
    driveHours: round1(t.driveHours), onsiteHours: round1(t.onsiteHours), labRunHours: v.labRunHours, workHours: round1(t.workHours), utilizationPct,
    soloNet: round2(m.solo.net), soloAfterPay: round2(m.solo.afterPay),
    profitPerDraw: t.completed > 0 ? round2(m.solo.afterPay / t.completed) : 0,
    profitPerHour: round2(m.solo.net / t.workHours), profitPerHourAfterPay: round2(m.solo.afterPay / t.workHours),
    failedStops: round1(t.failedStops), failedCost: round2(t.failedWasteCost - t.failedPaid), failedLostMargin: round2(t.lostMargin),
    failedCostYear: round2((failedDirect + t.lostMargin) * 52), failedPaid: round2(t.failedPaid),
    agencyNet: round2(m.agency.net), agencyAfterPay: round2(m.agency.afterPay), agencyHours: round1(m.agency.hours), agencyDraws: round1(m.agency.draws), agencyKept: round2(m.agency.kept),
    employedNet: round2(m.employed.net), employedAfterPay: round2(m.employed.afterPay),
    soloPerHour: round2(m.solo.net / m.solo.hours), agencyPerHour: round2(m.agency.net / m.agency.hours), employedPerHour: round2(m.employed.net / m.employed.hours),
    equalTake: m.equalTake === null ? null : round1(m.equalTake), equalWage: m.equalWage === null ? null : round2(m.equalWage),
    breakEven: be,
  };
  season.failedTotalWeek = round2(failedDirect + t.lostMargin);
  const advice = [];
  advice.push(`Solo and independent, per week: ${season.scheduled} draws scheduled over ${season.stops} stops, ${season.completed} completed, ${usd(season.revenue)} collected, ${usd(season.soloNet)} kept after supplies, mileage, insurance and certification, and ${usd(season.soloAfterPay)} after valuing your ${season.workHours} working hours at ${usd(v.ownerRate)}.`);
  advice.push(`That is ${usd(season.profitPerDraw)} profit per completed draw after your own time, and ${usd(season.profitPerHour)} per working hour with drive time counted (${usd(season.profitPerHourAfterPay)} after your time value). The week is ${season.driveHours} drive hours, ${season.onsiteHours} on site and ${v.labRunHours} on lab drop-off and paperwork.`);
  const active = lines.filter((l) => l.qty > 0);
  if (active.length > 1) {
    const best = [...active].sort((a, b) => b.perHour - a.perHour)[0], worst = [...active].sort((a, b) => a.perHour - b.perHour)[0];
    if (best.id !== worst.id) advice.push(`Per working hour, before fixed cost and your pay: ${active.map((l) => `${l.label.toLowerCase()} ${usd(l.perHour)}`).join(", ")}. ${best.label} earn the most for the time, ${worst.label.toLowerCase()} the least.`);
  }
  for (const l of active) {
    if (l.fee < l.targetFee) advice.push(`${l.label} at ${usd(l.fee)} a draw earn ${l.marginPct}% once drive, failed trips, supplies and a share of fixed cost are counted. For a ${v.targetMarginPct}% margin the fee would need to be ${usd(l.targetFee)} a draw${l.id === "stat" ? ` (${usd(l.targetBaseFee)} base plus the ${usd(v.statPremium)} STAT premium)` : ""}.`);
  }
  if (v.failedPct > 0) advice.push(`Failed trips: ${v.failedPct}% of ${season.stops} stops is about ${season.failedStops} wasted trips a week. You still drive there and stand at the door, so they cost ${usd(season.failedCost)} a week in mileage and the time you spent, plus ${usd(season.failedLostMargin)} of draw margin that did not happen, about ${usd(season.failedCostYear)} a year. ${v.failedPayPct > 0 ? `Collecting ${v.failedPayPct}% of the fee recovers ${usd(season.failedPaid)} a week of that.` : "None of the fee is collected on a failed trip: a cancel-at-door fee or a confirmation call is worth testing."}`);
  if (be) advice.push(`Break-even for working solo, covering fixed costs and your own time: about ${be.scheduled} scheduled draws a week at this mix (${be.completed} completed, ${be.stops} stops), against ${season.scheduled} planned.${season.scheduled >= be.scheduled ? "" : " You plan fewer than that."}`);
  else advice.push("At these fees, each stop earns less than the drive, the supplies and your own time, so more draws do not cover fixed costs. Raise a fee, add a trip fee, or batch stops first.");
  advice.push(`Same route, three ways, per week: solo ${usd(season.soloNet)} kept (${usd(season.soloPerHour)} an hour worked), a per-draw agency contractor keeping ${100 - v.agencyTakePct}% at ${season.agencyDraws} draws ${usd(season.agencyNet)} (${usd(season.agencyPerHour)} an hour), an employee at ${usd(v.employedWage)} an hour plus ${usd(v.employedMileReimb)} a mile ${usd(season.employedNet)} (${usd(season.employedPerHour)} an hour). Employed assumes your employer pays supplies, insurance and certification.`);
  if (m.equalTake !== null) advice.push(`The agency matches solo when its take is about ${season.equalTake}% with ${v.agencyVolumePct}% more draws; at your ${v.agencyTakePct}% take ${m.agency.net >= m.solo.net ? "the agency work pays more" : "solo pays more"}. An hourly wage of ${usd(season.equalWage)} would match solo's take per hour.`);
  if (utilizationPct > 100) advice.push(`The week needs ${season.workHours} working hours against ${v.hoursAvailable} available (${utilizationPct}%). That route is not possible as planned.`);
  else advice.push(`The week uses ${season.workHours} of ${v.hoursAvailable} hours (${utilizationPct}%), and ${round1(season.driveHours / season.workHours * 100)}% of the hours worked are driving. Grouping stops usually raises profit per hour faster than raising fees.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((s) => {
    const r = modes(v, { scale: s });
    return { pct: Math.round(s * 100), scheduled: round1(r.t.scheduled), hours: round1(r.t.workHours), utilizationPct: round1((r.t.workHours / v.hoursAvailable) * 100), solo: round2(r.solo.afterPay), agency: round2(r.agency.afterPay), employed: round2(r.employed.afterPay) };
  });
  const batchTable = [1, 2, 3, 4, 6].map((b) => {
    const r = modes(v, { batch: b });
    return { batch: b, stops: round1(r.t.stops), hours: round1(r.t.workHours), driveHours: round1(r.t.driveHours), net: round2(r.solo.net), afterPay: round2(r.solo.afterPay), perHour: round2(r.solo.net / r.t.workHours) };
  });
  return { error: null, input: v, season, table, batchTable, advice };
}

export function sampleInput() {
  return {
    routineQty: "20", routinePrice: "45", routineMin: "15", routineMat: "4", routineBatch: "1",
    statQty: "5", statPrice: "45", statPremium: "25", statMin: "20", statMat: "4",
    facilityVisits: "3", facilityDraws: "6", facilityPrice: "28", facilityMin: "8", facilityMat: "3",
    tripFee: "0", failedPct: "8", failedPayPct: "0", failedMin: "10", driveMiles: "9", driveMin: "18", mileCost: "0.70",
    insuranceMonth: "85", certYear: "150", otherFixedMonth: "40", labRunHours: "3", ownerRate: "30", hoursAvailable: "40", targetMarginPct: "30",
    agencyTakePct: "30", agencyVolumePct: "25", agencySupplies: "0", employedWage: "24", employedMileReimb: "0.60",
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
  const head = "volume_pct,scheduled_draws_per_week,work_hours,hours_used_pct,solo_after_pay,agency_contractor_after_pay,employed_after_pay";
  return [head, ...result.table.map((r) => [r.pct, r.scheduled, r.hours, r.utilizationPct, r.solo, r.agency, r.employed].join(","))].join("\n");
}
