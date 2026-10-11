// Home inspection business profit. Pure arithmetic over what an independent home inspector types in: inspections per week by type (a standard inspection priced
// from a base fee plus a rate per square foot above a threshold, sewer scope, radon and mold or WDO add-ons that ride on a standard inspection, and re-inspections),
// on-site, report and drive hours, mileage, the share of booked inspections that fall through, fixed cost (E&O insurance, software, equipment), the share of fees
// paid out for agent marketing or referrals, and what the owner's hour is worth. It also compares working solo with hiring an associate inspector paid per inspection.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Every line is either a "visit" (a trip to a property: standard inspection, re-inspection) or an add-on that rides on a standard inspection's trip.
export const LINES = [
  { id: "std", label: "Standard inspection", visit: true },
  { id: "sewer", label: "Sewer scope add-on", visit: false },
  { id: "radon", label: "Radon test add-on", visit: false },
  { id: "wdo", label: "WDO or mold add-on", visit: false },
  { id: "re", label: "Re-inspection", visit: true },
];

const NUMERIC = [
  "stdQty", "avgSqft", "baseFee", "thresholdSqft", "perSqft", "stdOnsiteHrs", "stdReportHrs", "stdCost",
  "sewerQty", "sewerFee", "sewerHrs", "sewerCost", "radonQty", "radonFee", "radonHrs", "radonCost", "wdoQty", "wdoFee", "wdoHrs", "wdoCost",
  "reQty", "reFee", "reHrs", "reCost",
  "driveHrs", "milesPerTrip", "costPerMile", "fallThroughPct", "wastedPct",
  "eoMonth", "softwareMonth", "otherFixedMonth", "equipmentCost", "equipmentYears", "referralPct",
  "ownerRate", "workHoursPerWeek", "targetMarginPct",
  "assocExtraQty", "assocPayStd", "assocAddonPct", "assocReviewHrs", "assocFixedMonth",
];
const QTY_KEYS = ["stdQty", "sewerQty", "radonQty", "wdoQty", "reQty", "assocExtraQty"];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    stdQty: f("stdQty"), avgSqft: f("avgSqft", 2000), baseFee: f("baseFee", 375), thresholdSqft: f("thresholdSqft", 1500), perSqft: f("perSqft", 0.15),
    stdOnsiteHrs: f("stdOnsiteHrs", 2.75), stdReportHrs: f("stdReportHrs", 1.5), stdCost: f("stdCost", 5),
    sewerQty: f("sewerQty"), sewerFee: f("sewerFee", 150), sewerHrs: f("sewerHrs", 0.75), sewerCost: f("sewerCost", 10),
    radonQty: f("radonQty"), radonFee: f("radonFee", 150), radonHrs: f("radonHrs", 0.25), radonCost: f("radonCost", 30),
    wdoQty: f("wdoQty"), wdoFee: f("wdoFee", 100), wdoHrs: f("wdoHrs", 0.5), wdoCost: f("wdoCost", 15),
    reQty: f("reQty"), reFee: f("reFee", 175), reHrs: f("reHrs", 1.25), reCost: f("reCost"),
    driveHrs: f("driveHrs", 0.75), milesPerTrip: f("milesPerTrip", 40), costPerMile: f("costPerMile", 0.7), fallThroughPct: f("fallThroughPct", 10), wastedPct: f("wastedPct", 25),
    eoMonth: f("eoMonth"), softwareMonth: f("softwareMonth"), otherFixedMonth: f("otherFixedMonth"), equipmentCost: f("equipmentCost"), equipmentYears: f("equipmentYears", 5),
    referralPct: f("referralPct"), ownerRate: f("ownerRate", 45), workHoursPerWeek: f("workHoursPerWeek", 45), targetMarginPct: f("targetMarginPct", 35),
    assocExtraQty: f("assocExtraQty", 4), assocPayStd: f("assocPayStd", 220), assocAddonPct: f("assocAddonPct", 40), assocReviewHrs: f("assocReviewHrs", 0.75), assocFixedMonth: f("assocFixedMonth"),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of QTY_KEYS) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number of inspections per week.` };
  if (v.stdQty < 1) return { error: "Enter how many standard inspections you book in a typical week (add-ons ride on those)." };
  if (v.stdQty + v.reQty > 100) return { error: "That is far more trips than one inspector can make in a week: check the quantities." };
  for (const k of ["sewerQty", "radonQty", "wdoQty"]) if (v[k] > v.stdQty) return { error: `${k} counts add-ons that ride on a standard inspection, so it cannot exceed the standard inspections per week.` };
  if (v.fallThroughPct > 90) return { error: "Fall-through is a percent of booked inspections: keep it at or below 90." };
  if (v.wastedPct > 100) return { error: "The share of a fallen-through slot's hours you lose is a percent: keep it at or below 100." };
  if (v.referralPct >= 100) return { error: "Referral and agent marketing is a percent of fees: keep it below 100." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the fee." };
  if (v.referralPct + v.targetMarginPct >= 100) return { error: "Referral cost and target margin together must stay below 100 percent of the fee, or no fee can reach the target." };
  if (v.equipmentYears < 0.5) return { error: "The equipment must be spread over at least half a year." };
  if (v.workHoursPerWeek <= 0 || v.workHoursPerWeek > 168) return { error: "Work hours per week must be above 0 and at most 168." };
  if (v.assocAddonPct > 100) return { error: "The associate's share of add-on and re-inspection fees is a percent: keep it at or below 100." };
  if (v.assocExtraQty > 100) return { error: "That many extra associate inspections per week is not plausible: check the number." };
  return { v };
}

export const standardFee = (v) => v.baseFee + Math.max(0, v.avgSqft - v.thresholdSqft) * v.perSqft;

function lineSpec(v, id) {
  if (id === "std") return { qty: v.stdQty, fee: standardFee(v), hrs: v.stdOnsiteHrs + v.stdReportHrs, cost: v.stdCost };
  return { qty: v[id + "Qty"], fee: v[id + "Fee"], hrs: v[id + "Hrs"], cost: v[id + "Cost"] };
}

const keepOf = (v) => 1 - v.fallThroughPct / 100;
// A fallen-through booking earns nothing, but a share of its hours cannot be refilled. Spread over the inspections that do happen.
const lossFactor = (v) => 1 + (v.fallThroughPct / 100 / keepOf(v)) * (v.wastedPct / 100);

export function fixedCosts(v) {
  const insurance = (v.eoMonth * 12) / 52;
  const software = (v.softwareMonth * 12) / 52;
  const equipment = v.equipmentCost / v.equipmentYears / 52;
  const other = (v.otherFixedMonth * 12) / 52;
  const total = insurance + software + equipment + other;
  return { insurance: round2(insurance), software: round2(software), equipment: round2(equipment), other: round2(other), total: round2(total), totalRaw: total };
}

// Expected week for the owner working solo.
function week(v) {
  const keep = keepOf(v), c = v.fallThroughPct / 100, w = v.wastedPct / 100;
  let booked = 0, completedVisits = 0, revenue = 0, referral = 0, direct = 0, mileage = 0, hours = 0, lostFees = 0;
  for (const l of LINES) {
    const s = lineSpec(v, l.id);
    const h = s.hrs + (l.visit ? v.driveHrs : 0);
    const done = s.qty * keep;
    revenue += done * s.fee;
    referral += done * s.fee * (v.referralPct / 100);
    direct += done * s.cost;
    if (l.visit) { mileage += done * v.milesPerTrip * v.costPerMile; completedVisits += done; booked += s.qty; }
    hours += done * h + s.qty * c * w * h;
    lostFees += s.qty * c * s.fee;
  }
  const fixed = fixedCosts(v).totalRaw;
  const net = revenue - referral - direct - mileage - fixed;
  const ownerPay = hours * v.ownerRate;
  return { booked, completedVisits, revenue, referral, direct, mileage, hours, lostFees, fixed, net, ownerPay, afterPay: net - ownerPay };
}

export function lineResult(v, l, wk = week(v)) {
  const s = lineSpec(v, l.id);
  const f = lossFactor(v);
  const hrsTotal = s.hrs + (l.visit ? v.driveHrs : 0);
  const labor = hrsTotal * v.ownerRate * f;
  const mileageEach = l.visit ? v.milesPerTrip * v.costPerMile : 0;
  const fixedShare = l.visit && wk.completedVisits > 0 ? wk.fixed / wk.completedVisits : 0;
  const ref = s.fee * (v.referralPct / 100);
  const cost = labor + mileageEach + s.cost + ref + fixedShare;
  const profit = s.fee - cost;
  const hoursAll = hrsTotal * f; // includes the unrefillable hours of fallen-through bookings
  const beforePay = s.fee - ref - mileageEach - s.cost - fixedShare;
  return {
    id: l.id, label: l.label, visit: l.visit, qty: s.qty, fee: round2(s.fee), hours: round2(hrsTotal), hoursLoaded: round2(hoursAll),
    labor: round2(labor), mileage: round2(mileageEach), direct: round2(s.cost), referral: round2(ref), fixedShare: round2(fixedShare),
    cost: round2(cost), profit: round2(profit), marginPct: s.fee > 0 ? round1((profit / s.fee) * 100) : 0,
    perHourAllIn: hoursAll > 0 ? round2(beforePay / hoursAll) : 0, // what an hour of this earns after every cost, before the owner's own pay
    targetFee: round2((labor + mileageEach + s.cost + fixedShare) / (1 - v.targetMarginPct / 100 - v.referralPct / 100)),
  };
}

// Completed trips per week at which the business covers its fixed cost, at the current mix.
export function breakEven(v) {
  const wk = week(v);
  if (wk.completedVisits <= 0) return { owner: null, cash: null };
  const keep = keepOf(v);
  const cashPer = (wk.revenue - wk.referral - wk.direct - wk.mileage) / wk.completedVisits;
  const ownerPer = (wk.revenue - wk.referral - wk.direct - wk.mileage - wk.ownerPay) / wk.completedVisits;
  const calc = (per) => {
    if (!(per > 0)) return null;
    const perWeek = wk.fixed / per;
    return { completedWeek: round1(perWeek), bookedWeek: round1(perWeek / keep), bookedMonth: round1((perWeek / keep) * 52 / 12), completedMonth: round1((perWeek * 52) / 12), contribution: round2(per) };
  };
  return { owner: calc(ownerPer), cash: calc(cashPer) };
}

// Hiring an associate who runs `extra` more standard inspections a week at the same add-on and re-inspection mix, paid per completed inspection.
// The associate is paid only for inspections that happen and supplies their own vehicle; the owner reviews every report.
export function associate(v, extra = v.assocExtraQty) {
  const keep = keepOf(v);
  const stdFee = standardFee(v);
  let addonRev = 0, direct = v.stdCost;
  for (const l of LINES) {
    if (l.id === "std") continue;
    const s = lineSpec(v, l.id);
    const ratio = s.qty / v.stdQty;
    addonRev += ratio * s.fee;
    direct += ratio * s.cost;
  }
  const bundleRev = stdFee + addonRev;
  const referral = bundleRev * (v.referralPct / 100);
  const pay = v.assocPayStd + addonRev * (v.assocAddonPct / 100);
  const review = v.assocReviewHrs * v.ownerRate;
  const perCompleted = bundleRev - referral - direct - pay - review;
  const done = extra * keep;
  const fixedWeek = (v.assocFixedMonth * 12) / 52;
  const added = done * perCompleted - fixedWeek;
  const breakEvenBooked = perCompleted > 0 ? fixedWeek / perCompleted / keep : null;
  const maxPayStd = bundleRev * (1 - v.targetMarginPct / 100 - v.referralPct / 100) - direct - addonRev * (v.assocAddonPct / 100) - review;
  return {
    extra, completed: round2(done), bundleRev: round2(bundleRev), pay: round2(pay), review: round2(review), perCompleted: round2(perCompleted),
    payWeek: round2(done * pay), reviewHours: round2(done * v.assocReviewHrs), fixedWeek: round2(fixedWeek), added: round2(added),
    breakEvenBooked: breakEvenBooked === null ? null : round1(breakEvenBooked), maxPayStd: round2(maxPayStd),
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const wk = week(v);
  const lines = LINES.map((l) => lineResult(v, l, wk));
  const be = breakEven(v);
  const fixed = fixedCosts(v);
  const assoc = associate(v);
  const soloFieldHours = round1(wk.hours);
  const season = {
    lines, fixed, booked: wk.booked, completed: round1(wk.completedVisits), revenue: round2(wk.revenue), referral: round2(wk.referral), mileage: round2(wk.mileage), direct: round2(wk.direct),
    hours: soloFieldHours, utilizationPct: round1((wk.hours / v.workHoursPerWeek) * 100), net: round2(wk.net), ownerPay: round2(wk.ownerPay), afterPay: round2(wk.afterPay),
    profitPerInspection: wk.completedVisits > 0 ? round2(wk.afterPay / wk.completedVisits) : 0,
    profitPerHour: wk.hours > 0 ? round2(wk.net / wk.hours) : 0, profitPerHourAfterPay: wk.hours > 0 ? round2(wk.afterPay / wk.hours) : 0,
    fallThroughLostFees: round2(wk.lostFees), fallThroughLostFeesYear: round2(wk.lostFees * 52), breakEven: be, assoc,
    soloAfterPay: round2(wk.afterPay), withAssociateAfterPay: round2(wk.afterPay + assoc.added),
  };
  const advice = [];
  advice.push(`Working solo, per week: ${season.booked} trips booked, ${season.completed} completed, ${usd(season.revenue)} of fees. After referral cost, mileage, direct cost and fixed cost that leaves ${usd(season.net)}, and ${usd(season.afterPay)} after paying your own ${season.hours} hours at ${usd(v.ownerRate)}.`);
  advice.push(`That is ${usd(season.profitPerInspection)} per completed inspection after your own pay, and ${usd(season.profitPerHour)} per hour all-in before your pay (${usd(season.profitPerHourAfterPay)} after it). Hours include on-site time, report writing, driving and the hours fallen-through bookings cost you.`);
  const used = lines.filter((l) => l.qty > 0);
  const addons = used.filter((l) => !l.visit);
  const std = lines[0];
  for (const a of addons) {
    advice.push(`${a.label}: ${usd(a.fee)} for ${a.hours} extra hours is ${usd(a.perHourAllIn)} an hour after its cost${a.perHourAllIn > std.perHourAllIn ? `, more than the ${usd(std.perHourAllIn)} an hour a standard inspection earns once the drive and its share of fixed cost are counted` : `, less than the ${usd(std.perHourAllIn)} an hour a standard inspection earns`}.`);
  }
  for (const l of used) {
    if (l.fee < l.targetFee) advice.push(`${l.label} at ${usd(l.fee)} earns ${l.marginPct}% after your time and every cost. For a ${v.targetMarginPct}% margin it would need ${usd(l.targetFee)}.`);
  }
  if (v.fallThroughPct > 0) advice.push(`Fall-through: ${v.fallThroughPct}% of ${season.booked} booked trips is about ${round1(season.booked - season.completed)} a week. They cost ${usd(season.fallThroughLostFees)} of fees a week (${usd(season.fallThroughLostFeesYear)} a year) and, at ${v.wastedPct}% of their hours you cannot refill, are already counted in your hours above.`);
  if (be.owner) advice.push(`Break-even with your own hours paid: about ${be.owner.completedWeek} completed trips a week (${be.owner.bookedMonth} booked a month at your fall-through rate), against ${season.completed} planned a week.${be.cash ? ` Counting only cash, with your time free, it is ${be.cash.bookedMonth} booked a month.` : ""}`);
  else advice.push("At these fees, each trip earns less than your own hourly pay plus its direct cost, so more inspections do not cover the fixed cost. Raise a fee first.");
  if (assoc.extra > 0) {
    advice.push(`Hiring an associate for ${assoc.extra} extra standard inspections a week (booked) at your add-on mix: each completed one brings ${usd(assoc.bundleRev)}, pays the associate ${usd(assoc.pay)}, and costs you ${usd(assoc.review)} of review time, leaving ${usd(assoc.perCompleted)}. That adds ${usd(assoc.added)} a week after the associate's fixed cost, taking you from ${usd(season.soloAfterPay)} to ${usd(season.withAssociateAfterPay)} a week.`);
  } else advice.push(`Set extra associate inspections above zero to see what hiring one adds. Each completed inspection would leave ${usd(assoc.perCompleted)} after the associate's pay and your review time.`);
  if (assoc.breakEvenBooked !== null && assoc.fixedWeek > 0) advice.push(`The associate's fixed cost of ${usd(assoc.fixedWeek)} a week is covered at about ${assoc.breakEvenBooked} extra booked inspections a week.`);
  advice.push(`To keep a ${v.targetMarginPct}% margin on the whole bundle, the most you can pay an associate for a standard inspection is about ${usd(assoc.maxPayStd)} (with ${v.assocAddonPct}% of the add-on fees on top) before their fixed cost.`);
  if (season.utilizationPct > 100) advice.push(`The week needs ${season.hours} hours against ${v.workHoursPerWeek} you work (${season.utilizationPct}%). That is more than you have, which is the case for an associate.`);
  else advice.push(`The week uses ${season.hours} of ${v.workHoursPerWeek} hours (${season.utilizationPct}%).${assoc.reviewHours > 0 ? ` An associate adds ${assoc.reviewHours} hours a week of report review for you.` : ""}`);
  const table = [0, 2, 4, 8, 12].map((e) => {
    const a = associate(v, e);
    return { extra: e, completed: a.completed, associatePay: a.payWeek, reviewHours: a.reviewHours, added: a.added, totalAfterPay: round2(wk.afterPay + a.added) };
  });
  return { error: null, input: v, season, table, advice };
}

export function sampleInput() {
  return {
    stdQty: "8", avgSqft: "2000", baseFee: "375", thresholdSqft: "1500", perSqft: "0.15", stdOnsiteHrs: "2.75", stdReportHrs: "1.5", stdCost: "5",
    sewerQty: "2", sewerFee: "150", sewerHrs: "0.75", sewerCost: "10", radonQty: "3", radonFee: "150", radonHrs: "0.25", radonCost: "30",
    wdoQty: "2", wdoFee: "100", wdoHrs: "0.5", wdoCost: "15", reQty: "1", reFee: "175", reHrs: "1.25", reCost: "0",
    driveHrs: "0.75", milesPerTrip: "40", costPerMile: "0.7", fallThroughPct: "10", wastedPct: "25",
    eoMonth: "180", softwareMonth: "120", otherFixedMonth: "150", equipmentCost: "6000", equipmentYears: "5", referralPct: "4",
    ownerRate: "45", workHoursPerWeek: "45", targetMarginPct: "35",
    assocExtraQty: "4", assocPayStd: "220", assocAddonPct: "40", assocReviewHrs: "0.75", assocFixedMonth: "150",
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
  const head = "extra_associate_inspections_booked,completed,associate_pay_per_week,owner_review_hours,added_per_week,total_after_your_pay_per_week";
  return [head, ...result.table.map((r) => [r.extra, r.completed, r.associatePay, r.reviewHours, r.added, r.totalAfterPay].join(","))].join("\n");
}
