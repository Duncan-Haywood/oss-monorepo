// Pure arithmetic for the tow / roadside motor-club call calculator.
// Every input is typed by the user; nothing here is a rate, a rule or a fact
// about any motor club. No network, no clock, no randomness.

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const pos = (v, d = 0) => Math.max(0, num(v, d));
export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

export const DEFAULTS = {
  // Truck cost helper (per month unless noted)
  truckPayment: 1800, insurance: 900, overhead: 600, hoursOnDuty: 240, billableSharePct: 55,
  driverWage: 24, burdenPct: 20, fuelPrice: 4, mpg: 7, maintPerMile: 0.35,
  // Job
  avgMph: 30, deadheadMiles: 12, loadedMiles: 15, returnMiles: 0, waitMinutes: 20,
  afterHours: false, afterHoursWagePct: 25, weatherSlowdownPct: 0,
  // Offer
  flat: 95, includedMiles: 10, perMile: 4,
  // Club
  clubFeePct: 0, clubFixedFee: 0, chargebackPct: 3, payDays: 45, capitalAprPct: 12,
  // Decision
  thresholdMarginPct: 15, altProfitPerHour: 0,
};

/** Fully-loaded truck cost per billable hour, plus per-mile running cost. */
export function truckRates(i = {}) {
  const o = { ...DEFAULTS, ...i };
  const billableHours = pos(o.hoursOnDuty) * (pos(o.billableSharePct) / 100);
  const fixedMonthly = pos(o.truckPayment) + pos(o.insurance) + pos(o.overhead);
  const fixedPerHour = billableHours > 0 ? fixedMonthly / billableHours : null;
  const wageLoaded = pos(o.driverWage) * (1 + pos(o.burdenPct) / 100);
  const fuelPerMile = pos(o.mpg) > 0 ? pos(o.fuelPrice) / pos(o.mpg) : null;
  if (fixedPerHour === null || fuelPerMile === null) {
    return { error: billableHours > 0 ? "Miles per gallon must be above zero." : "Billable hours per month must be above zero (hours on duty times billable share)." };
  }
  // The truck sits idle for unbilled hours, so fixed cost is spread over billable hours only.
  const costPerHour = fixedPerHour + wageLoaded;
  const costPerMile = fuelPerMile + pos(o.maintPerMile);
  return { billableHours, fixedPerHour, wageLoaded, fuelPerMile, costPerHour, costPerMile };
}

/** Gross payout the club offers: flat covers includedMiles of loaded miles, per-mile beyond. */
export function grossPayout(i = {}) {
  const o = { ...DEFAULTS, ...i };
  const extra = Math.max(0, pos(o.loadedMiles) - pos(o.includedMiles));
  return pos(o.flat) + pos(o.perMile) * extra;
}

/** Share of gross payout that survives the club: 1 - fee - chargebacks - carrying cost of late pay. */
export function keepFactor(i = {}) {
  const o = { ...DEFAULTS, ...i };
  const carry = (pos(o.capitalAprPct) / 100) * (pos(o.payDays) / 365);
  return 1 - pos(o.clubFeePct) / 100 - pos(o.chargebackPct) / 100 - carry;
}

export function evaluate(i = {}, rates = null) {
  const o = { ...DEFAULTS, ...i };
  const r = rates || truckRates(o);
  if (r.error) return { error: r.error };
  const mph = pos(o.avgMph);
  if (mph <= 0) return { error: "Average speed must be above zero." };
  const miles = pos(o.deadheadMiles) + pos(o.loadedMiles) + pos(o.returnMiles);
  const weather = 1 + pos(o.weatherSlowdownPct) / 100;
  const hours = ((miles / mph) + pos(o.waitMinutes) / 60) * weather;
  if (hours <= 0) return { error: "The job needs some miles or wait time." };
  const hourCost = hours * r.costPerHour;
  const mileCost = miles * r.costPerMile;
  const afterHoursCost = o.afterHours ? hours * r.wageLoaded * (pos(o.afterHoursWagePct) / 100) : 0;
  const cost = hourCost + mileCost + afterHoursCost;
  const gross = o.grossOverride !== undefined ? pos(o.grossOverride) : grossPayout(o);
  const k = keepFactor(o);
  const net = gross * k - pos(o.clubFixedFee);
  const profit = net - cost;
  const profitPerHour = profit / hours;
  const marginPct = gross > 0 ? (profit / gross) * 100 : null;
  const opp = pos(o.altProfitPerHour) * hours;
  // Break-even gross payout: net = cost.
  const breakEven = k > 0 ? (cost + pos(o.clubFixedFee)) / k : null;
  // Minimum acceptable gross: profit >= threshold * gross AND profit >= opportunity cost.
  const t = pos(o.thresholdMarginPct) / 100;
  const byOpp = k > 0 ? (cost + pos(o.clubFixedFee) + opp) / k : null;
  const byMargin = k - t > 0 ? (cost + pos(o.clubFixedFee)) / (k - t) : null;
  const minAcceptable = byOpp === null || byMargin === null ? null : Math.max(byOpp, byMargin);
  const reasons = [];
  if (profit < 0) reasons.push(`loses $${round2(-profit).toFixed(2)} after cost`);
  else if (marginPct !== null && marginPct < pos(o.thresholdMarginPct)) reasons.push(`margin ${marginPct.toFixed(1)}% is below your ${pos(o.thresholdMarginPct)}% threshold`);
  if (profit >= 0 && profit < opp) reasons.push(`earns $${profitPerHour.toFixed(2)}/truck-hour, below the $${pos(o.altProfitPerHour).toFixed(2)}/hour you could earn on a cash call`);
  if (k <= 0) reasons.push("club deductions consume the whole payout");
  const verdict = reasons.length ? "decline" : "accept";
  return {
    hours, miles, cost, hourCost, mileCost, afterHoursCost, gross, keep: k, net, profit, profitPerHour, marginPct,
    opportunityCost: opp, breakEven, minAcceptable, verdict, reasons,
    costPerHour: r.costPerHour, costPerMile: r.costPerMile,
  };
}

export const SENS_DEADHEAD = [0, 5, 10, 20, 30, 45];
export const SENS_WAIT = [0, 15, 30, 45, 60, 90];

/** Profit ($) for deadhead miles by wait minutes, everything else as typed. */
export function sensitivity(i = {}, deadheads = SENS_DEADHEAD, waits = SENS_WAIT) {
  const o = { ...DEFAULTS, ...i };
  const rates = truckRates(o);
  if (rates.error) return { error: rates.error };
  const rows = deadheads.map((d) => ({
    deadhead: d,
    cells: waits.map((w) => {
      const e = evaluate({ ...o, deadheadMiles: d, waitMinutes: w }, rates);
      return e.error ? { profit: null, profitPerHour: null, verdict: "n/a" } : { profit: e.profit, profitPerHour: e.profitPerHour, verdict: e.verdict };
    }),
  }));
  return { waits, rows };
}

const splitLine = (line) => {
  const bare = line.replace(/"[^"]*"/g, "");
  const d = bare.includes("\t") ? "\t" : bare.includes(";") ? ";" : bare.includes("|") ? "|" : ",";
  const out = [];
  let cur = "", q = false;
  for (let n = 0; n < line.length; n++) {
    const ch = line[n];
    if (q) {
      if (ch === '"' && line[n + 1] === '"') { cur += '"'; n++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};
const parseNum = (s) => {
  if (s === undefined || s === "") return NaN;
  const c = String(s).replace(/[$,\s]/g, "");
  return /^-?\d*\.?\d+$/.test(c) ? Number(c) : NaN;
};
const truthy = (s) => /^(y|yes|1|true|ah|night|after)/i.test(String(s || "").trim());

/**
 * Batch lines: label, deadhead miles, loaded miles, wait minutes, total offered payout[, after-hours y/n].
 * A header line (non-numeric miles) is skipped silently; other unreadable lines are reported.
 */
export function parseCalls(text) {
  const calls = [], skipped = [];
  let sawHeader = false;
  String(text || "").split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = splitLine(line);
    const [label, dh, ld, wt, pay, ah] = f;
    const nums = [dh, ld, wt, pay].map(parseNum);
    if (nums.slice(0, 3).every(Number.isNaN) && !calls.length && !skipped.length && !sawHeader) { sawHeader = true; return; }
    if (f.length < 5) { skipped.push({ line: idx + 1, reason: "needs label, deadhead, loaded, wait minutes, payout" }); return; }
    if (nums.some((n) => !Number.isFinite(n))) { skipped.push({ line: idx + 1, reason: "deadhead, loaded, wait and payout must be numbers" }); return; }
    if (nums.some((n) => n < 0)) { skipped.push({ line: idx + 1, reason: "negative number" }); return; }
    calls.push({ label: label || `Call ${calls.length + 1}`, deadheadMiles: nums[0], loadedMiles: nums[1], waitMinutes: nums[2], gross: nums[3], afterHours: truthy(ah) });
  });
  return { calls, skipped };
}

/** Rank calls by profit per truck-hour, best first. */
export function rankCalls(text, i = {}) {
  const o = { ...DEFAULTS, ...i };
  const rates = truckRates(o);
  if (rates.error) return { error: rates.error };
  const { calls, skipped } = parseCalls(text);
  const rows = [];
  for (const c of calls) {
    const e = evaluate({ ...o, deadheadMiles: c.deadheadMiles, loadedMiles: c.loadedMiles, waitMinutes: c.waitMinutes, afterHours: c.afterHours || o.afterHours, grossOverride: c.gross }, rates);
    if (e.error) skipped.push({ line: null, reason: `${c.label}: ${e.error}` });
    else rows.push({ label: c.label, ...e });
  }
  rows.sort((a, b) => b.profitPerHour - a.profitPerHour);
  rows.forEach((r, n) => { r.rank = n + 1; });
  return { rows, skipped };
}

export const money = (v) => (v === null || v === undefined ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.abs(round2(v)).toFixed(2));
export const pct = (v) => (v === null || v === undefined ? "n/a" : v.toFixed(1) + "%");

export function summaryText(e, batch) {
  if (e.error) return e.error;
  const lines = [
    `Truck-hours: ${e.hours.toFixed(2)} (${e.miles.toFixed(1)} miles)`,
    `Cost of the job: ${money(e.cost)}`,
    `Gross payout: ${money(e.gross)}; kept after club deductions: ${money(e.net)}`,
    `Profit: ${money(e.profit)} (${money(e.profitPerHour)} per truck-hour, margin ${pct(e.marginPct)})`,
    `Break-even payout: ${money(e.breakEven)}; minimum acceptable payout: ${money(e.minAcceptable)}`,
    `Verdict: ${e.verdict.toUpperCase()}${e.reasons.length ? " - " + e.reasons.join("; ") : ""}`,
    "Arithmetic on numbers typed by the user; not rate, legal or financial advice.",
  ];
  if (batch && batch.rows.length) {
    lines.push("", "Ranked by profit per truck-hour:");
    batch.rows.forEach((r) => lines.push(`${r.rank}. ${r.label}: ${money(r.profitPerHour)}/hr, profit ${money(r.profit)}, ${r.verdict}`));
  }
  return lines.join("\n");
}

export function sampleCalls() {
  return [
    "label,deadhead miles,loaded miles,wait minutes,payout,after hours",
    "Jump start - Elm St,4,0,15,45,n",
    "Tow 8 mi - dealership,14,8,20,110,n",
    "Winch out - county road,22,10,60,150,y",
    "Long tow 35 mi - highway,18,35,25,260,n",
    "Lockout - mall lot,9,0,10,40,n",
  ].join("\n");
}
