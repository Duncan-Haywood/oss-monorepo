// UK simplified expenses (HMRC) vs actual costs for sole traders and partnerships:
// vehicle mileage rates and the use of home flat rate. Living at business premises is not covered.
// Browser-only, no network. Not tax advice.

// Rates in force for 2025/26 and unchanged since 2011 (mileage) and 2013 (home).
// Source to verify: GOV.UK "Simplified expenses if you're self-employed".
export const RATES = {
  carFirst: 0.45, carAfter: 0.25, carThreshold: 10000,
  motorcycle: 0.24, bicycle: 0.2,
  // hours worked at home per month -> flat monthly sum
  homeBands: [{ min: 25, max: 50, sum: 10 }, { min: 51, max: 100, sum: 18 }, { min: 101, max: Infinity, sum: 26 }],
};

export const SAMPLE = {
  carMiles: "7200", motorcycleMiles: "0", bicycleMiles: "0",
  totalCarMiles: "9000", carRunningCosts: "3100", carCapitalAllowance: "1400",
  homeHours: "120", homeMonths: "12", householdCosts: "4200", roomsUsed: "1", roomsTotal: "5",
  taxRate: "29",
};

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === "" || v == null ? 0 : Number(v));
const money = (n) => "£" + round2(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function carSimplified(miles) {
  const first = Math.min(miles, RATES.carThreshold);
  const after = Math.max(0, miles - RATES.carThreshold);
  return round2(first * RATES.carFirst + after * RATES.carAfter);
}

export function homeFlatMonthly(hours) {
  const b = RATES.homeBands.find((x) => hours >= x.min && hours <= x.max);
  // A fractional 50.5 falls between the published bands; treat it as the higher.
  if (!b && hours > 50 && hours < 51) return 18;
  if (!b && hours > 100 && hours < 101) return 26;
  return b ? b.sum : 0;
}

export function compute(raw) {
  const errors = [];
  const f = {};
  for (const k of Object.keys(SAMPLE)) {
    const v = num(raw[k]);
    if (!Number.isFinite(v) || v < 0) errors.push(`"${k}" must be a number that is zero or more.`);
    f[k] = v;
  }
  if (f.taxRate > 70) errors.push("The tax rate must be a percentage up to 70.");
  if (f.homeMonths > 12) errors.push("Months working from home cannot be more than 12.");
  if (f.carMiles > 0 && f.totalCarMiles > 0 && f.carMiles > f.totalCarMiles) errors.push("Business car miles cannot be more than total car miles for the year.");
  if (f.roomsUsed > 0 && f.roomsTotal > 0 && f.roomsUsed > f.roomsTotal) errors.push("Rooms used for work cannot exceed the rooms in the home.");
  if (errors.length) return { errors };

  const t = f.taxRate / 100;
  const rows = [];
  const findings = [];

  // Car or van
  if (f.carMiles > 0) {
    const simple = carSimplified(f.carMiles);
    const share = f.totalCarMiles > 0 ? f.carMiles / f.totalCarMiles : 0;
    const hasActual = f.carRunningCosts > 0 || f.carCapitalAllowance > 0;
    const actual = hasActual && share > 0 ? round2((f.carRunningCosts + f.carCapitalAllowance) * share) : null;
    rows.push({ key: "vehicle", label: "Car or van", simplified: simple, actual, basis: `${f.carMiles.toLocaleString("en-GB")} business miles at 45p to 10,000 then 25p` + (actual !== null ? `; actual = running costs + capital allowances x ${Math.round(share * 100)}% business use` : "") });
    if (actual === null) findings.push({ severity: "info", title: "Enter total car miles, running costs and any capital allowance to compare simplified against actual for the car." });
  }
  // Motorcycle / bicycle
  if (f.motorcycleMiles > 0) rows.push({ key: "motorcycle", label: "Motorcycle", simplified: round2(f.motorcycleMiles * RATES.motorcycle), actual: null, basis: `${f.motorcycleMiles.toLocaleString("en-GB")} miles at 24p` });
  if (f.bicycleMiles > 0) rows.push({ key: "bicycle", label: "Bicycle", simplified: round2(f.bicycleMiles * RATES.bicycle), actual: null, basis: `${f.bicycleMiles.toLocaleString("en-GB")} miles at 20p (not claimable in a normal sole trader return; shown for reference)` });

  // Use of home
  if (f.homeHours > 0 && f.homeMonths > 0) {
    const monthly = homeFlatMonthly(f.homeHours);
    const simple = round2(monthly * f.homeMonths);
    const timeShare = Math.min(1, f.homeHours / 730);
    const roomShare = f.roomsTotal > 0 && f.roomsUsed > 0 ? f.roomsUsed / f.roomsTotal : 0;
    const actual = f.householdCosts > 0 && roomShare > 0 ? round2(f.householdCosts * (f.homeMonths / 12) * roomShare * timeShare) : null;
    rows.push({ key: "home", label: "Use of home", simplified: simple, actual, basis: monthly ? `${f.homeHours} hours a month = ${money(monthly)} a month x ${f.homeMonths} months` + (actual !== null ? `; actual = household costs x ${f.roomsUsed}/${f.roomsTotal} rooms x ${(timeShare * 100).toFixed(1)}% of the month` : "") : "Under 25 hours a month: no flat rate is available" });
    if (!monthly) findings.push({ severity: "medium", title: "Fewer than 25 hours a month at home is below the flat rate. Only a proportion of actual household costs can be claimed." });
    if (actual === null) findings.push({ severity: "info", title: "Enter household costs and rooms to compare the flat rate against an actual-cost claim." });
  }

  if (!rows.length) return { errors: ["Enter business miles, hours worked at home, or both."] };

  let totalSimple = 0, totalBest = 0;
  for (const r of rows) {
    r.better = r.actual !== null && r.actual > r.simplified ? "actual" : "simplified";
    r.best = r.better === "actual" ? r.actual : r.simplified;
    r.gap = r.actual !== null ? round2(Math.abs(r.actual - r.simplified)) : 0;
    totalSimple += r.simplified;
    totalBest += r.best;
  }
  totalSimple = round2(totalSimple);
  totalBest = round2(totalBest);
  const extra = round2(totalBest - totalSimple);
  const taxSaved = round2(totalBest * t);

  for (const r of rows) {
    if (r.actual !== null) {
      findings.push({ severity: r.gap >= 100 ? "high" : "medium", title: `${r.label}: ${r.better === "actual" ? "actual costs" : "the simplified rate"} claims ${money(r.gap)} more (${money(r.best)} against ${money(r.better === "actual" ? r.simplified : r.actual)}).` });
    }
  }
  findings.push({ severity: "info", title: `Estimated tax saved by the best claim at ${f.taxRate}% (income tax plus Class 4 NIC): ${money(taxSaved)}.` });
  if (rows.some((r) => r.key === "vehicle" && r.better === "actual")) findings.push({ severity: "medium", title: "Actual costs for a vehicle mean keeping receipts and claiming capital allowances; once you use the simplified rate for a vehicle you cannot switch to capital allowances on it later." });

  const obligations = [
    { title: "Pick one method per vehicle", why: "Simplified mileage and actual costs cannot be mixed on the same vehicle in the same year, and a vehicle claimed under the simplified rate stays on it." },
    { title: "Keep a mileage log", why: "Date, journey, business purpose and miles for each trip. Commuting from home to a regular workplace is not business mileage." },
    { title: "Home: flat rate covers only running costs", why: "The flat rate covers heat, light and broadband in the home. Mortgage interest, rent and council tax are separate and are not part of it." },
    { title: "Limited company directors differ", why: "These rules are for sole traders and partnerships. A company reimburses mileage under the approved rates (also 45p/25p) and a small employee home-working sum; this tool does not cover that." },
  ];

  return { errors: [], rows, totalSimple, totalBest, extra, taxSaved, taxRate: f.taxRate, findings, obligations };
}

export function summaryText(r) {
  const lines = ["UK simplified expenses vs actual costs (HMRC, sole traders and partnerships)"];
  for (const row of r.rows) lines.push(`${row.label}: simplified ${money(row.simplified)}${row.actual !== null ? `, actual ${money(row.actual)}` : ""} -> best ${row.better} ${money(row.best)}`);
  lines.push(`Total simplified ${money(r.totalSimple)}; best mix ${money(r.totalBest)} (${money(r.extra)} more); estimated tax saved ${money(r.taxSaved)} at ${r.taxRate}%`);
  lines.push("Verify the rates and rules on GOV.UK before filing. Not tax advice.");
  return lines.join("\n");
}
