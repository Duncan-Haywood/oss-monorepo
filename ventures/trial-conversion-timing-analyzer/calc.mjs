// Trial conversion timing: when do free-trial users convert, and what would a
// shorter trial have cost. Pure functions, no I/O, no imports.

const DAY = 86400000;

export const MIN_TRIALS = 30;
export const MIN_CONVERSIONS = 8;

export function money(v) {
  return "$" + Math.round(v).toLocaleString("en-US");
}
export function pct(v, d = 0) {
  return (v * 100).toFixed(d) + "%";
}

// Seeded generator so the bootstrap range is the same every run.
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

export function parseDate(text) {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?\s*$/.exec(String(text ?? ""));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return Math.round(t / DAY);
}

// Rows: trial_start, converted_on (blank when the user never paid).
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload your trials first: one row per trial, trial start date and the date they first paid (blank if they did not)." };
  const rows = [];
  let skipped = 0, backwards = 0;
  lines.forEach((line, i) => {
    const cells = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const start = parseDate(cells[0]);
    if (start === null) {
      if (i > 0) skipped++;
      return;
    }
    const paidText = cells[1] ?? "";
    if (paidText === "" || /^(null|none|na|n\/a|never|-)$/i.test(paidText)) {
      rows.push({ start, paid: null });
      return;
    }
    const paid = parseDate(paidText);
    if (paid === null) { skipped++; return; }
    if (paid < start) { backwards++; return; }
    rows.push({ start, paid });
  });
  if (skipped) warnings.push(`${skipped} row(s) skipped: dates must look like 2026-03-14.`);
  if (backwards) warnings.push(`${backwards} row(s) skipped: paid before the trial started.`);
  if (!rows.length) return { error: "No usable rows. Each row needs a trial start date like 2026-03-14, then the first payment date or nothing." };
  return { rows, warnings };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

// Share of conversions that happened after day T, and the matching counts.
function lateShare(days, T) {
  if (!days.length) return 0;
  return days.filter((d) => d > T).length / days.length;
}

/**
 * opts: trialDays (length you offer), asOf (YYYY-MM-DD, default latest date in
 * the data), monthlyPrice, paidMonths (expected paid months per conversion),
 * pullForward (0..1, share of late converters assumed to convert anyway if the
 * trial were shorter; default 0 = the worst case).
 */
export function analyze(rows, opts = {}) {
  const warnings = [];
  const L = Math.round(opts.trialDays ?? 14);
  if (!(L >= 2 && L <= 120)) return { error: "Trial length must be between 2 and 120 days." };
  const latest = Math.max(...rows.map((r) => r.paid ?? r.start));
  let asOf = opts.asOf ? parseDate(opts.asOf) : latest;
  if (asOf === null) return { error: "As-of date must look like 2026-03-14." };
  // Only trials whose window has closed can be judged. A trial still running
  // would count as a non-converter and drag the rate down.
  const matured = rows.filter((r) => r.start + L <= asOf);
  const open = rows.length - matured.length;
  if (open) warnings.push(`${open} trial(s) are still inside their ${L}-day window as of ${fmtDate(asOf)} and were left out.`);
  const n = matured.length;
  const conv = matured.filter((r) => r.paid !== null).map((r) => r.paid - r.start);
  if (n < MIN_TRIALS) return { error: `Only ${n} finished trials. At least ${MIN_TRIALS} are needed before the timing means anything.` };
  if (conv.length < MIN_CONVERSIONS) return { error: `Only ${conv.length} trials converted. At least ${MIN_CONVERSIONS} are needed to see when people convert.` };
  conv.sort((a, b) => a - b);
  const late = conv.filter((d) => d > L).length;
  if (late / conv.length > 0.1) warnings.push(`${late} of ${conv.length} conversions happened after day ${L}. Either people convert after the trial ends (reactivation) or the trial length is not what you entered.`);
  if (conv[0] < 0) return { error: "A conversion is dated before its trial." };

  const price = opts.monthlyPrice ?? 0;
  const months = opts.paidMonths ?? 12;
  const value = price * months;
  const pull = Math.min(1, Math.max(0, opts.pullForward ?? 0));

  // Conversions per day, and the cumulative curve.
  const maxDay = Math.min(Math.max(L, ...conv), 120);
  const perDay = [];
  let cum = 0;
  for (let d = 0; d <= maxDay; d++) {
    const c = conv.filter((x) => x === d).length;
    cum += c;
    perDay.push({ day: d, conversions: c, cumulativeShare: cum / conv.length });
  }

  // Deadline effect: conversions piled into the last two days of the trial are
  // the ones a shorter trial would most likely pull forward rather than lose.
  const lastTwo = conv.filter((d) => d >= L - 1 && d <= L).length / conv.length;
  // Two days out of L+1 would hold 2/(L+1) of conversions if timing were flat.
  const deadline = lastTwo >= 0.3 && lastTwo >= 2.5 * (2 / (L + 1));

  const rate = conv.length / n;
  const candidates = [];
  for (let T = 1; T < L; T++) candidates.push(T);

  // Bootstrap the late share: resample the finished trials, seeded.
  const rand = rng(20260930);
  const B = 300;
  const boot = {};
  candidates.forEach((T) => (boot[T] = []));
  for (let b = 0; b < B; b++) {
    const sample = [];
    for (let i = 0; i < n; i++) sample.push(matured[Math.floor(rand() * n)]);
    const cs = sample.filter((r) => r.paid !== null).map((r) => r.paid - r.start);
    if (!cs.length) continue;
    const base = cs.length;
    candidates.forEach((T) => boot[T].push(cs.filter((d) => d > T).length / base));
  }

  const scenarios = candidates.map((T) => {
    const lost = lateShare(conv, T);
    const worst = lost * conv.length / n; // conversions lost per finished trial
    const netLost = worst * (1 - pull);
    const sorted = boot[T].slice().sort((a, b) => a - b);
    const meanDaysToPay = conv.filter((d) => d <= T).reduce((s, d) => s + d, 0) / Math.max(1, conv.filter((d) => d <= T).length);
    return {
      trialDays: T,
      lostShare: lost,
      lostRange80: [quantile(sorted, 0.1), quantile(sorted, 0.9)],
      conversionRate: rate - netLost,
      conversionsLostPer100: netLost * 100,
      valueLostPer100: netLost * 100 * value,
      meanDaysToPay,
    };
  });

  // Hold-out: the share of conversions after day T in the first 75% of trials
  // (by start date) against the last 25%.
  const byStart = matured.slice().sort((a, b) => a.start - b.start);
  const cut = Math.floor(byStart.length * 0.75);
  const fit = byStart.slice(0, cut).filter((r) => r.paid !== null).map((r) => r.paid - r.start);
  const test = byStart.slice(cut).filter((r) => r.paid !== null).map((r) => r.paid - r.start);
  let holdout = null;
  if (fit.length >= 5 && test.length >= 5) {
    const probeT = Math.max(1, Math.round(L / 2));
    holdout = {
      probeDay: probeT,
      fitConversions: fit.length,
      testConversions: test.length,
      fitLate: lateShare(fit, probeT),
      testLate: lateShare(test, probeT),
    };
    holdout.gap = Math.abs(holdout.fitLate - holdout.testLate);
  }

  let verdict = "usable";
  let verdictNote = "";
  if (holdout && holdout.gap > 0.15) {
    verdict = "unstable";
    verdictNote = `The share of conversions arriving after day ${holdout.probeDay} was ${pct(holdout.fitLate)} in your earlier trials and ${pct(holdout.testLate)} in your latest. Timing moved, so do not lean on an older average.`;
  } else if (conv.length < 25) {
    verdict = "weak";
    verdictNote = `Only ${conv.length} conversions: read the ranges, not the point estimates.`;
  }

  return {
    n, open, conversions: conv.length, rate, trialDays: L, asOf,
    median: quantile(conv, 0.5), p90: quantile(conv, 0.9),
    perDay, lastTwoShare: lastTwo, deadline, late, scenarios, holdout, verdict, verdictNote, value, pullForward: pull, warnings,
  };
}

export function fmtDate(day) {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

export function reportCsv(r) {
  const head = "shorter_trial_days,share_of_conversions_after,range80_low,range80_high,conversions_lost_per_100_trials,value_lost_per_100_trials";
  return [head, ...r.scenarios.map((s) => [s.trialDays, s.lostShare.toFixed(4), s.lostRange80[0].toFixed(4), s.lostRange80[1].toFixed(4), s.conversionsLostPer100.toFixed(2), s.valueLostPer100.toFixed(0)].join(","))].join("\n");
}

// Invented data: 14-day trial, conversions bunched at day 0-1 and day 13-14.
export function sampleText() {
  const r = rng(7);
  const out = ["trial_start,first_paid"];
  const base = Date.UTC(2026, 0, 1) / DAY;
  for (let i = 0; i < 160; i++) {
    const s = base + Math.floor(i / 2);
    let paid = "";
    if (r() < 0.22) {
      const u = r();
      const d = u < 0.25 ? Math.floor(r() * 2) : u < 0.45 ? 2 + Math.floor(r() * 4) : u < 0.6 ? 6 + Math.floor(r() * 6) : 12 + Math.floor(r() * 3);
      paid = fmtDate(s + d);
    }
    out.push(`${fmtDate(s)},${paid}`);
  }
  return out.join("\n");
}
