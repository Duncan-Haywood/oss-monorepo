// Retainer versus hourly: what a monthly retainer would have paid, per client,
// against the hours the freelancer's own time log shows. Pure functions, no
// I/O, no imports. A statistical description of supplied data, not advice.

const DAY = 86400000;

export const MIN_MONTHS = 6; // per client
export const HOLDOUT_MIN_MONTHS = 9; // below this there is nothing to hold out
export const BOOTSTRAPS = 300;
export const SEED = 20261001;

export function money(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return "$" + Math.round(v).toLocaleString("en-US");
}
export function rate(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return "$" + v.toFixed(2) + "/h";
}
export function pct(v, d = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return (v * 100).toFixed(d) + "%";
}
export function hrs(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return v.toFixed(1) + " h";
}

// Seeded generator so every range and the sample data are the same every run.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Linear-interpolated quantile (the common "type 7"); q in [0, 1].
export function quantile(values, q) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  if (a.length === 1) return a[0];
  const pos = (a.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function mean(a) {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

function dayOf(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null;
  return Math.round(t / DAY);
}

// 2026-03-14 (or a timestamp starting that way) and US-style 3/14/2026.
export function parseDate(text) {
  const s = String(text ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return dayOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(s);
  if (m) return dayOf(+m[3], +m[1], +m[2]);
  return null;
}

export function isoDate(day) {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

// Month index = year * 12 + (month - 1).
function monthIndex(day) {
  const d = new Date(day * DAY);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
export function monthLabel(idx) {
  const y = Math.floor(idx / 12), m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthEndDay(idx) {
  const y = Math.floor(idx / 12), m = (idx % 12) + 1;
  return Math.round(Date.UTC(y, m, 0) / DAY);
}

// Hours as 1.5, "1,5" is not accepted (comma separates columns), or 1:30.
export function parseHours(text) {
  const s = String(text ?? "").trim().toLowerCase().replace(/\s*(hours?|hrs?|h)$/, "");
  let m = /^(\d+):([0-5]\d)$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

function parseAmount(text) {
  const s = String(text ?? "").trim().replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "");
  if (s === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

// Rows: date, client, hours, optional billed amount. Header optional.
export function parseRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload your time log first: one row per entry with the date, the client, the hours and, if you have it, the amount billed." };
  const warnings = [];
  const rows = [];
  let skipped = 0, nonPositive = 0, header = false;
  lines.forEach((line, i) => {
    const cells = line.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const day = parseDate(cells[0]);
    const client = (cells[1] || "").trim();
    const hours = parseHours(cells[2]);
    const billed = parseAmount(cells[3]);
    if (day === null || !client || hours === null || Number.isNaN(billed)) {
      if (i === 0 && day === null) { header = true; return; }
      skipped++;
      return;
    }
    if (hours <= 0) { nonPositive++; return; }
    rows.push({ day, client, hours, billed: billed === null ? null : billed });
  });
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} could not be read (need date, client, hours) and ${skipped === 1 ? "was" : "were"} skipped.`);
  if (nonPositive) warnings.push(`${nonPositive} row${nonPositive === 1 ? " has" : "s have"} zero or negative hours and ${nonPositive === 1 ? "was" : "were"} ignored.`);
  if (!rows.length) return { error: "No readable rows. Each row needs a date (2026-03-14 or 3/14/2026), a client name and hours (1.5 or 1:30)." };
  return { rows, warnings, header };
}

function bootstrap(values, stat, seed, n = BOOTSTRAPS) {
  const rand = rng(seed);
  const out = [];
  for (let b = 0; b < n; b++) {
    const s = [];
    for (let i = 0; i < values.length; i++) s.push(values[Math.floor(rand() * values.length)]);
    out.push(stat(s));
  }
  out.sort((x, y) => x - y);
  return [quantile(out, 0.1), quantile(out, 0.9)];
}

function hashSeed(name) {
  let h = SEED;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// retainer / hours; a month with no hours has no hourly rate to speak of.
function effective(retainer, h) {
  return h > 0 ? retainer / h : null;
}

function holdoutCheck(hours, retainer, rateH, coverage) {
  const n = hours.length;
  if (n < HOLDOUT_MIN_MONTHS) return null;
  const split = Math.ceil((n * 2) / 3);
  const train = hours.slice(0, split), test = hours.slice(split);
  const trainMean = mean(train), testMean = mean(test);
  const trainQ = quantile(train, coverage);
  const gap = trainMean > 0 ? (testMean - trainMean) / trainMean : null;
  return {
    trainMonths: train.length,
    testMonths: test.length,
    trainMean,
    testMean,
    trainQuantile: trainQ,
    testWithinQuantile: test.filter((h) => h <= trainQ).length / test.length,
    gap,
    testUnderpay: test.filter((h) => h * rateH > retainer).length / test.length,
  };
}

function analyzeClient(name, monthly, p) {
  const hours = monthly.map((m) => m.hours);
  const n = hours.length;
  const seed = hashSeed(name);
  const m = mean(hours);
  const p50 = quantile(hours, 0.5), p80 = quantile(hours, 0.8), pc = quantile(hours, p.coverage);
  const max = Math.max(...hours), min = Math.min(...hours);
  const underCount = hours.filter((h) => h * p.rate > p.retainer).length;
  const under = underCount / n;
  const hold = holdoutCheck(hours, p.retainer, p.rate, p.coverage);
  let verdict = "usable", verdictNote = "";
  if (hold && hold.gap !== null && Math.abs(hold.gap) > 0.25) {
    verdict = "unstable";
    verdictNote = `Hours moved ${hold.gap > 0 ? "up" : "down"} ${pct(Math.abs(hold.gap), 0)} between the first ${hold.trainMonths} months and the last ${hold.testMonths} (${hrs(hold.trainMean)} to ${hrs(hold.testMean)} a month), more than the 25% this tool tolerates. The older months may not describe next year, so read the percentiles as history only.`;
  } else if (!hold) {
    verdict = "weak";
    verdictNote = `Only ${n} months: enough to describe, not enough to hold some back and check that the early months predict the late ones (that needs ${HOLDOUT_MIN_MONTHS}).`;
  } else if (n < 12) {
    verdict = "weak";
    verdictNote = `${n} months covers less than a year, so seasonal swings may be missing. The hold-out passed.`;
  } else {
    verdictNote = `The first ${hold.trainMonths} months predicted the last ${hold.testMonths} within 25% (${hrs(hold.trainMean)} against ${hrs(hold.testMean)} a month).`;
  }
  const cv = m > 0 ? sd(hours) / m : null;
  const volatility = cv === null ? "unknown" : cv >= 0.6 ? "high" : cv >= 0.3 ? "moderate" : "low";
  return {
    name,
    months: monthly,
    n,
    zeroMonths: monthly.filter((x) => x.hours === 0).length,
    totalHours: hours.reduce((s, v) => s + v, 0),
    mean: m,
    p50,
    p80,
    min,
    max,
    sd: sd(hours),
    cv,
    volatility,
    meanRange80: bootstrap(hours, mean, seed),
    p80Range80: bootstrap(hours, (a) => quantile(a, 0.8), seed + 1),
    effective: { p50: effective(p.retainer, p50), p80: effective(p.retainer, p80), worst: effective(p.retainer, max), mean: effective(p.retainer, m) },
    breakEvenHours: p.rate > 0 ? p.retainer / p.rate : null,
    coveredQuantileHours: pc,
    retainerForTarget: p.target * pc,
    coverageAtRetainer: p.target > 0 ? hours.filter((h) => h <= p.retainer / p.target).length / n : null,
    underpayProb: under,
    underpayRange80: bootstrap(hours, (a) => a.filter((h) => h * p.rate > p.retainer).length / a.length, seed + 2),
    hourlyMean: m * p.rate,
    retainerMinusHourly: p.retainer - m * p.rate,
    holdout: hold,
    verdict,
    verdictNote,
  };
}

// opts: rate (hourly, $), retainer (monthly, $), target (effective $/h you want,
// default = rate), coverage (0.5 to 0.99, default 0.8), includeLastMonth.
export function analyze(rows, opts = {}) {
  const warnings = [];
  const coverage = opts.coverage === undefined || opts.coverage === "" ? 0.8 : Number(opts.coverage);
  if (!(coverage >= 0.5 && coverage <= 0.99)) return { error: "Coverage must be between 50% and 99%." };
  const retainer = Number(opts.retainer);
  if (!(retainer > 0)) return { error: "Enter the monthly retainer you are considering, in dollars." };

  // Hourly rate: the one typed, else what the billed column implies.
  let rateH = opts.rate === undefined || opts.rate === "" || opts.rate === null ? null : Number(opts.rate);
  let rateSource = "entered";
  if (rateH === null) {
    const withBill = rows.filter((r) => r.billed !== null && r.billed > 0);
    const hoursB = withBill.reduce((s, r) => s + r.hours, 0);
    if (withBill.length >= rows.length * 0.8 && hoursB > 0) {
      rateH = withBill.reduce((s, r) => s + r.billed, 0) / hoursB;
      rateSource = "billed";
      warnings.push(`No hourly rate entered; used ${rate(rateH)}, your billed amounts divided by your hours.`);
    } else {
      return { error: "Enter your hourly rate (or include a billed amount on most rows so it can be worked out)." };
    }
  }
  if (!(rateH > 0)) return { error: "The hourly rate must be above zero." };
  const target = opts.target === undefined || opts.target === "" || opts.target === null ? rateH : Number(opts.target);
  if (!(target > 0)) return { error: "The target effective rate must be above zero." };

  // Calendar completeness: drop the last month unless the user says it is complete.
  const lastDay = Math.max(...rows.map((r) => r.day));
  let lastIdx = monthIndex(lastDay);
  const includeLast = opts.includeLastMonth !== false;
  if (!includeLast) {
    lastIdx -= 1;
    warnings.push(`The latest month in the log (${monthLabel(lastIdx + 1)}) was left out as incomplete.`);
  } else if (lastDay < monthEndDay(lastIdx) - 6) {
    warnings.push(`The latest entry is ${isoDate(lastDay)}, well before the end of ${monthLabel(lastIdx)}. If that month is not finished, untick "latest month is complete" so a part-month is not counted as a light one.`);
  }

  const byClient = new Map();
  for (const r of rows) {
    const idx = monthIndex(r.day);
    if (idx > lastIdx) continue;
    const key = r.client.toLowerCase();
    if (!byClient.has(key)) byClient.set(key, { name: r.client, hours: new Map() });
    const c = byClient.get(key);
    c.hours.set(idx, (c.hours.get(idx) || 0) + r.hours);
  }

  const clients = [], excluded = [];
  const params = { rate: rateH, retainer, target, coverage };
  for (const c of [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const idxs = [...c.hours.keys()];
    const first = Math.min(...idxs), last = Math.max(...idxs);
    // A month inside the client's span with no entries is a real month of zero hours.
    const monthly = [];
    for (let i = first; i <= last; i++) monthly.push({ month: monthLabel(i), hours: c.hours.get(i) || 0 });
    if (monthly.length < MIN_MONTHS) {
      excluded.push({ name: c.name, months: monthly.length });
      continue;
    }
    clients.push(analyzeClient(c.name, monthly, params));
  }
  if (!clients.length) {
    return { error: `No client has ${MIN_MONTHS} months of history. A retainer is a bet on a typical month, and fewer months than that cannot show what a typical month is. Add older entries or wait.`, excluded };
  }
  for (const e of excluded) warnings.push(`${e.name} has ${e.months} month${e.months === 1 ? "" : "s"} of history (need ${MIN_MONTHS}) and is not analysed.`);

  // Billed history, when supplied: what the client actually paid per hour.
  const billedRows = rows.filter((r) => r.billed !== null && r.billed > 0);
  const billedRate = billedRows.length ? billedRows.reduce((s, r) => s + r.billed, 0) / billedRows.reduce((s, r) => s + r.hours, 0) : null;
  return { params, rateSource, billedRate, clients, excluded, warnings, lastMonth: monthLabel(lastIdx) };
}

export function reportCsv(result) {
  const head = ["client", "months", "mean_hours", "p50_hours", "p80_hours", "max_hours", "mean_range80_low", "mean_range80_high", "effective_rate_p50", "effective_rate_p80", "effective_rate_worst", "break_even_hours", "retainer_for_target", "share_months_retainer_underpays", "verdict"];
  const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "" : v.toFixed(d));
  const lines = [head.join(",")];
  for (const c of result.clients) {
    lines.push([`"${c.name.replace(/"/g, '""')}"`, c.n, f(c.mean), f(c.p50), f(c.p80), f(c.max), f(c.meanRange80[0]), f(c.meanRange80[1]), f(c.effective.p50), f(c.effective.p80), f(c.effective.worst), f(c.breakEvenHours), f(c.retainerForTarget), f(c.underpayProb, 3), c.verdict].join(","));
  }
  return lines.join("\n") + "\n";
}

// Invented example: three clients, 14 to 16 months, one drifting upward.
export function sampleText() {
  const rand = rng(77);
  const out = ["date,client,hours,billed"];
  const clients = [["Northwind Co", 16, 5, 0, 15], ["Harbor Studio", 24, 12, 0, 16], ["Quill & Co", 10, 4, 0.5, 14]];
  for (const [name, mu, spread, drift, months] of clients) {
    for (let k = 0; k < months; k++) {
      const total = Math.max(2, mu + drift * k + (rand() * 2 - 1) * spread);
      const y = 2025 + Math.floor(k / 12), m = (k % 12) + 1;
      const parts = 3;
      for (let j = 0; j < parts; j++) {
        const h = Math.round((total / parts) * 4) / 4;
        const day = new Date(Date.UTC(y, m - 1, 3 + j * 12));
        out.push(`${day.toISOString().slice(0, 10)},${name},${h},${(h * 95).toFixed(2)}`);
      }
    }
  }
  return out.join("\n");
}
