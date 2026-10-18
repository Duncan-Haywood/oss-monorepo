// Wedding / event videographer profit per booking. No network, no state.
//
// A videographer's shoot day is the small part of the job: the highlight film,
// the full ceremony and speeches edit, and the revision rounds that follow are
// usually most of the hours. A package price divided by shoot hours therefore
// flatters the business badly. This file turns one booking into the hours
// actually worked, the true hourly rate, the profit, the minimum package price
// for a target hourly rate, and how fast that rate collapses as edit hours grow.
//
// Every number is user-editable; the example presets are unverified
// approximations, never market data this file vouches for.

function number(value, name, { min = 0, max = null } = {}) {
  if (value === "" || value === null || value === undefined) throw new Error(`${name} is required`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

const opt = (v, d) => (v === "" || v === null || v === undefined ? d : v);

/**
 * Example bookings, USD. Unverified approximations from general knowledge, not
 * survey data: the page tells the visitor to replace every number with their own.
 */
export const PRESETS = [
  { id: "highlight-only", name: "Highlight film only", price: 1800, shootHours: 6, secondShooterHours: 0, highlightEditHours: 8, ceremonyEditHours: 0, speechesEditHours: 0, revisionRoundsUsed: 1, note: "Short film, no full ceremony edit." },
  { id: "highlight-ceremony", name: "Highlight + full ceremony", price: 2800, shootHours: 8, secondShooterHours: 8, highlightEditHours: 8, ceremonyEditHours: 5, speechesEditHours: 0, revisionRoundsUsed: 2, note: "Adds a multi-cam ceremony edit." },
  { id: "full-day", name: "Full day, all deliverables", price: 4200, shootHours: 10, secondShooterHours: 10, highlightEditHours: 8, ceremonyEditHours: 5, speechesEditHours: 6, revisionRoundsUsed: 3, note: "Highlight, ceremony and speeches/reception edits." },
];

export const DEFAULT_LADDER = [
  { name: "Highlight film", price: 1800, editHours: 8 },
  { name: "Highlight + ceremony", price: 2600, editHours: 13 },
  { name: "Highlight + ceremony + speeches", price: 3400, editHours: 19 },
];

export const EDIT_MULTIPLIERS = [0.75, 1, 1.25, 1.5, 2];

function clean(input) {
  const c = {
    price: number(input.price, "Package price"),
    shootHours: number(input.shootHours, "Shoot hours"),
    secondShooterHours: number(opt(input.secondShooterHours, 0), "Second shooter hours"),
    secondShooterRate: number(opt(input.secondShooterRate, 0), "Second shooter hourly pay"),
    travelHours: number(opt(input.travelHours, 0), "Travel hours"),
    travelCost: number(opt(input.travelCost, 0), "Travel cost"),
    prepHours: number(opt(input.prepHours, 0), "Planning and admin hours"),
    highlightEditHours: number(opt(input.highlightEditHours, 0), "Highlight edit hours"),
    ceremonyEditHours: number(opt(input.ceremonyEditHours, 0), "Ceremony edit hours"),
    speechesEditHours: number(opt(input.speechesEditHours, 0), "Speeches and reception edit hours"),
    revisionRoundsIncluded: number(opt(input.revisionRoundsIncluded, 0), "Included revision rounds"),
    revisionRoundsUsed: number(opt(input.revisionRoundsUsed, 0), "Revision rounds used"),
    hoursPerRevision: number(opt(input.hoursPerRevision, 0), "Hours per revision round"),
    extraRevisionFee: number(opt(input.extraRevisionFee, 0), "Fee per extra revision round"),
    gearAnnualCost: number(opt(input.gearAnnualCost, 0), "Gear, software and insurance per year"),
    bookingsPerYear: number(opt(input.bookingsPerYear, 1), "Bookings per year"),
    deliveryCost: number(opt(input.deliveryCost, 0), "Delivery and storage cost"),
    processingPercent: number(opt(input.processingPercent, 0), "Processing fee %", { max: 99 }),
    targetHourly: number(opt(input.targetHourly, 0), "Target hourly rate"),
  };
  if (c.price <= 0) throw new Error("Package price must be greater than zero");
  if (c.bookingsPerYear < 1) throw new Error("Bookings per year must be at least 1");
  return c;
}

function core(c, editScale = 1) {
  const extraRounds = Math.max(0, c.revisionRoundsUsed - c.revisionRoundsIncluded);
  const revisionHours = c.revisionRoundsUsed * c.hoursPerRevision;
  const revisionRevenue = extraRounds * c.extraRevisionFee;
  const editHours = (c.highlightEditHours + c.ceremonyEditHours + c.speechesEditHours) * editScale;
  const hoursWorked = c.shootHours + c.travelHours + c.prepHours + editHours + revisionHours;
  const revenue = c.price + revisionRevenue;
  const processing = revenue * (c.processingPercent / 100);
  const secondShooter = c.secondShooterHours * c.secondShooterRate;
  const gear = c.gearAnnualCost / c.bookingsPerYear;
  const fixedCosts = secondShooter + c.travelCost + gear + c.deliveryCost;
  const costs = fixedCosts + processing;
  const profit = revenue - costs;
  return {
    revenue, revisionRevenue, extraRounds, revisionHours, editHours, hoursWorked,
    processing, secondShooter, gear, fixedCosts, costs, profit,
    trueHourly: hoursWorked > 0 ? profit / hoursWorked : null,
  };
}

/** Smallest package price that reaches `targetHourly` for the same hours and costs. */
export function minimumPrice(c, editScale = 1) {
  const b = core(c, editScale);
  const need = c.targetHourly * b.hoursWorked + b.fixedCosts;
  const price = need / (1 - c.processingPercent / 100) - b.revisionRevenue;
  return Math.max(0, price);
}

export function calculateBooking(input) {
  let c;
  try { c = clean(input); } catch (e) { return { error: e.message }; }
  const b = core(c);
  const headlineHourly = c.shootHours > 0 ? c.price / c.shootHours : null;
  const editShare = b.hoursWorked > 0 ? (b.editHours + b.revisionHours) / b.hoursWorked : 0;
  const minPrice = c.targetHourly > 0 ? minimumPrice(c) : null;

  // Sensitivity: the true rate as edit hours grow or shrink, because edit
  // hours are the line a videographer controls least and under-quotes most.
  const sensitivity = EDIT_MULTIPLIERS.map((m) => {
    const s = core(c, m);
    return { multiplier: m, editHours: s.editHours, hoursWorked: s.hoursWorked, profit: s.profit, trueHourly: s.trueHourly,
      minPrice: c.targetHourly > 0 ? minimumPrice(c, m) : null };
  });

  // Edit hours at which the booking falls exactly to the target rate.
  let breakEvenEditHours = null;
  if (c.targetHourly > 0) {
    const hoursAtTarget = b.profit / c.targetHourly;
    const nonEdit = b.hoursWorked - b.editHours;
    breakEvenEditHours = Math.max(0, hoursAtTarget - nonEdit);
  }

  const findings = [];
  if (b.trueHourly !== null && c.targetHourly > 0 && b.trueHourly < c.targetHourly) {
    findings.push({ severity: "high", title: `True rate ${money(b.trueHourly)}/hr is below your ${money(c.targetHourly)}/hr target`,
      detail: `At this package you would need ${money(minPrice)} to reach the target, ${money(minPrice - c.price)} more than you quote.` });
  }
  if (editShare >= 0.5) {
    findings.push({ severity: "high", title: `${Math.round(editShare * 100)}% of the hours are editing and revisions`,
      detail: `The shoot is ${c.shootHours} of ${b.hoursWorked.toFixed(1)} hours worked. Pricing on shoot hours alone hides most of the job.` });
  }
  if (headlineHourly !== null && b.trueHourly !== null) {
    findings.push({ severity: "medium", title: `Headline ${money(headlineHourly)}/hr shrinks to ${money(b.trueHourly)}/hr`,
      detail: "The headline is package price over shoot hours. The true rate is profit after costs over every hour worked." });
  }
  if (b.extraRounds > 0) {
    findings.push({ severity: "medium", title: `Revision creep: ${b.extraRounds} round(s) past the cap`,
      detail: `You included ${c.revisionRoundsIncluded} and used ${c.revisionRoundsUsed}, about ${(b.revisionHours).toFixed(1)} hours of revisions. ${c.extraRevisionFee > 0 ? `Charging ${money(c.extraRevisionFee)} per extra round recovers ${money(b.revisionRevenue)}.` : "No extra-round fee is set, so those hours are unpaid."}` });
  }
  findings.push({ severity: "info", title: "Check the numbers before you rely on this",
    detail: "Example presets are unverified approximations. Replace every figure with your own hours, costs and fees." });

  return { input: c, ...b, headlineHourly, editShare, minPrice, sensitivity, breakEvenEditHours, findings };
}

/** Same booking at each deliverable tier: price and edit hours replace the base ones. */
export function deliverableLadder(input, tiers = DEFAULT_LADDER) {
  let c;
  try { c = clean(input); } catch (e) { return { error: e.message }; }
  if (!Array.isArray(tiers) || tiers.length < 2) return { error: "Add at least two deliverable tiers" };
  const rows = [];
  for (const [i, t] of tiers.entries()) {
    let price, edit;
    try {
      price = number(t.price, `Tier ${i + 1} price`);
      edit = number(t.editHours, `Tier ${i + 1} edit hours`);
    } catch (e) { return { error: e.message }; }
    if (price <= 0) return { error: `Tier ${i + 1} price must be greater than zero` };
    const tc = { ...c, price, highlightEditHours: edit, ceremonyEditHours: 0, speechesEditHours: 0 };
    const b = core(tc);
    rows.push({ name: String(t.name || "").trim() || `Tier ${i + 1}`, price, editHours: edit, hoursWorked: b.hoursWorked,
      profit: b.profit, trueHourly: b.trueHourly, minPrice: c.targetHourly > 0 ? minimumPrice(tc) : null });
  }
  const best = rows.reduce((a, r) => (r.trueHourly > a.trueHourly ? r : a), rows[0]);
  return { rows, best };
}

export function money(n) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
