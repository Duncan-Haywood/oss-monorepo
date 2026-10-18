// Price floor, frequency discounts and profit per visit for a residential cleaning quote.
// Pure functions, no DOM. Arithmetic on figures the user types; no market rate, wage law or
// productivity benchmark is asserted anywhere in here.

export const DEFAULTS = Object.freeze({
  homeSqft: 0,
  bathrooms: 0,
  sqftPerLaborHour: 0,
  minutesPerBathroom: 0,
  crewSize: 1,
  wagePerHour: 0,
  burdenPct: 0,
  suppliesPerVisit: 0,
  driveMinutesOneWay: 0,
  milesRoundTrip: 0,
  costPerMile: 0,
  cardFeePct: 3,
  targetMarginPct: 30,
  basePrice: 0,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const cells = (line) => (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

// Lines: "label, visits per year, time multiplier, discount %". Header optional.
// The time multiplier scales labor hours (a recurring clean on a kept-up home usually takes less
// than a first clean); the discount comes off the base price you quote for a one-time clean.
export function parseFrequencies(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cells(line);
    if (c.length < 2) { skipped++; continue; }
    const visits = num(c[1], NaN);
    if (!Number.isFinite(visits)) { if (rows.length || !/visit|label|frequency/i.test(line)) skipped++; continue; }
    const mult = num(c[2], 1), disc = num(c[3], 0);
    if (visits <= 0 || !(mult > 0) || !(disc >= 0) || disc >= 100) { skipped++; continue; }
    rows.push({ label: c[0] || "Visit", visitsPerYear: visits, timeMultiplier: mult, discountPct: disc });
  }
  const warnings = skipped ? [`${skipped} frequency line(s) skipped (need a label, visits per year above 0, a time multiplier above 0 and a discount from 0 to under 100).`] : [];
  if (!rows.length) return { error: "Add at least one frequency line: label, visits per year, time multiplier, discount %." };
  return { rows, warnings };
}

// Lines: "add-on, extra labor minutes, extra supplies $, price you charge $". Optional.
export function parseAddOns(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cells(line);
    const minutes = num(c[1], NaN);
    if (c.length < 2 || !Number.isFinite(minutes)) { if (rows.length || !/add|minute|name/i.test(line)) skipped++; continue; }
    const supplies = num(c[2], 0), price = num(c[3], 0);
    if (minutes < 0 || !(supplies >= 0) || !(price >= 0)) { skipped++; continue; }
    rows.push({ name: c[0] || "Add-on", minutes, supplies, price });
  }
  return { rows, warnings: skipped ? [`${skipped} add-on line(s) skipped.`] : [] };
}

const clean = (job) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (job && job[k] !== undefined) o[k] = num(job[k], DEFAULTS[k]);
  return o;
};

export function analyze(jobIn, frequencies, addOns = []) {
  const o = clean(jobIn);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.homeSqft <= 0) return { error: "Enter the home size in square feet." };
  if (o.sqftPerLaborHour <= 0) return { error: "Enter your own square feet cleaned per labor hour (one person, one hour)." };
  if (o.crewSize < 1 || !Number.isInteger(o.crewSize)) return { error: "Crew size must be a whole number of at least 1." };
  if (o.wagePerHour <= 0) return { error: "Enter the hourly wage you pay each cleaner (or pay yourself)." };
  if (o.cardFeePct + o.targetMarginPct >= 100) return { error: "Card fee plus target margin must be under 100%." };
  if (o.basePrice <= 0) return { error: "Enter the price you quote for a one-time clean of this home." };

  const warnings = [];
  const burden = 1 + o.burdenPct / 100;
  const fee = o.cardFeePct / 100, margin = o.targetMarginPct / 100;
  const addMinutes = addOns.reduce((a, x) => a + x.minutes, 0);
  const addSupplies = addOns.reduce((a, x) => a + x.supplies, 0);
  const addRevenue = addOns.reduce((a, x) => a + x.price, 0);

  // Person-hours of cleaning, before the frequency's time multiplier.
  const cleanHours = o.homeSqft / o.sqftPerLaborHour + (o.bathrooms * o.minutesPerBathroom) / 60 + addMinutes / 60;
  // Paid drive time is per person who rides; mileage is per vehicle.
  const driveHours = (2 * o.driveMinutesOneWay * o.crewSize) / 60;
  const mileage = o.milesRoundTrip * o.costPerMile;

  const lines = frequencies.map((f) => {
    const personHours = cleanHours * f.timeMultiplier;
    const onSiteHoursPerPerson = personHours / o.crewSize;
    const wages = (personHours + driveHours) * o.wagePerHour * burden;
    const supplies = o.suppliesPerVisit + addSupplies;
    const cost = wages + supplies + mileage;
    const listPrice = o.basePrice + addRevenue;
    const price = listPrice * (1 - f.discountPct / 100);
    const cardFee = price * fee;
    const profit = price - cardFee - cost;
    const floor = cost / (1 - fee - margin);
    const maxDiscountPct = listPrice > 0 ? Math.max(0, (1 - floor / listPrice) * 100) : 0;
    return {
      ...f, personHours, onSiteHoursPerPerson, wages, supplies, mileage, cost, price, cardFee, profit,
      marginPct: price > 0 ? (profit / price) * 100 : 0,
      profitPerPersonHour: personHours + driveHours > 0 ? profit / (personHours + driveHours) : 0,
      floor, listPrice, maxDiscountPct,
      meetsTarget: price + 1e-9 >= floor,
      annualRevenue: price * f.visitsPerYear,
      annualProfit: profit * f.visitsPerYear,
      // List price at which this frequency's discount still lands on the target margin.
      listPriceNeeded: floor / (1 - f.discountPct / 100),
    };
  });

  const below = lines.filter((l) => !l.meetsTarget);
  const losing = lines.filter((l) => l.profit < 0);
  const neededList = Math.max(...lines.map((l) => l.listPriceNeeded));
  const binding = lines.find((l) => l.listPriceNeeded === neededList);
  let verdict;
  if (!below.length) verdict = `Every frequency clears your ${o.targetMarginPct}% target margin at a ${money2(o.basePrice + addRevenue)} list price.`;
  else verdict = `${below.length} of ${lines.length} frequency line(s) fall below your ${o.targetMarginPct}% target; to clear all of them, list a one-time clean at ${money2(neededList)} or more (${binding.label} sets that).`;
  if (losing.length) warnings.push(`${losing.map((l) => l.label).join(", ")} loses money on every visit at these figures.`);

  return { job: o, addMinutes, addRevenue, cleanHours, driveHours, mileage, lines, verdict, neededListPrice: neededList, warnings };
}

export function sampleJob() {
  return {
    frequencies: "label,visits per year,time multiplier,discount %\nOne-time deep clean,1,1.5,0\nWeekly,52,0.8,20\nEvery 2 weeks,26,0.9,12\nMonthly,12,1.1,5",
    addOns: "add-on,extra labor minutes,extra supplies,price\nInside oven,30,2,35\nInside fridge,20,1,25",
    job: { homeSqft: 1800, bathrooms: 2, sqftPerLaborHour: 450, minutesPerBathroom: 20, crewSize: 2, wagePerHour: 18, burdenPct: 12, suppliesPerVisit: 6, driveMinutesOneWay: 15, milesRoundTrip: 14, costPerMile: 0.6, cardFeePct: 3, targetMarginPct: 30, basePrice: 190 },
  };
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Frequency", "Visits per year", "Price per visit", "Cost per visit", "Profit per visit", "Margin %", "Price floor for target", "Max discount % off list", "Annual profit"]];
  for (const l of r.lines) out.push([l.label, l.visitsPerYear, f2(l.price), f2(l.cost), f2(l.profit), f2(l.marginPct), f2(l.floor), f2(l.maxDiscountPct), f2(l.annualProfit)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => v.toFixed(d) + "%";
