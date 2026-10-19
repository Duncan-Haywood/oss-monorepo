// Project estimate calibrator. Pure functions, no DOM, no network.
// Input: past projects as estimate and actual (hours or dollars, one unit).
// Model: ln(actual) = a + b*ln(estimate) + e. b is pinned to 1 (a plain overrun
// ratio) unless the data show overruns change with project size. Prediction
// quantiles use the empirical residuals with a finite-sample correction
// (split-conformal style), so no normality is assumed and a p that n cannot
// support is flagged instead of extrapolated. Uncertainty is a seeded bootstrap.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_N = 12;
const GOOD_N = 25;
const BOOT = 300;
const LEVELS = [0.5, 0.7, 0.8, 0.9, 0.95];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "").replace(/h(rs?|ours?)?$/i, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

// Rows: estimate, actual[, type]. A header row may reorder the columns by name.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload rows of estimate and actual (hours or dollars), one row per finished project." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { est: 0, act: 1, type: rows[0].length >= 3 ? 2 : -1 };
  const hasHeader = rows[0].slice(0, 2).some((c) => /[a-z]/i.test(c) && !Number.isFinite(moneyNum(c)));
  if (hasHeader) {
    const head = rows[0].map((h) => h.toLowerCase());
    const find = (re) => head.findIndex((h) => re.test(h));
    const e = find(/estimat|quote|budget|planned|bid|expected/), a = find(/actual|spent|final|real|took|worked|logged/), t = find(/type|categor|kind|service|client|project type|job type/);
    ci = { est: e >= 0 ? e : 0, act: a >= 0 ? a : 1, type: t >= 0 ? t : head.length >= 3 ? 2 : -1 };
    if (ci.est === ci.act) ci.act = ci.est === 0 ? 1 : 0;
    if (ci.type === ci.est || ci.type === ci.act) ci.type = -1;
    rows = rows.slice(1);
  }
  if ((rows[0]?.length || 0) < 2) return { error: "Each row needs at least an estimate and an actual." };
  const out = [];
  let bad = 0;
  for (const r of rows) {
    const est = moneyNum(r[ci.est] ?? ""), act = moneyNum(r[ci.act] ?? "");
    if (!(est > 0) || !(act > 0)) { bad++; continue; }
    const row = { est, act };
    if (ci.type >= 0 && (r[ci.type] || "").trim()) row.type = r[ci.type].trim();
    out.push(row);
  }
  if (bad) warnings.push(`${bad} row${bad === 1 ? "" : "s"} skipped: an estimate or actual was missing, zero or not a number. Projects still in progress belong out of this list.`);
  if (!out.length) return { error: "No readable rows. Use positive numbers for both the estimate and the actual." };
  return { rows: out, warnings };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const sortedNum = (a) => [...a].sort((x, y) => x - y);
function quantileSorted(s, p) {
  if (!s.length) return NaN;
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const median = (a) => quantileSorted(sortedNum(a), 0.5);

// Split-conformal upper quantile of residuals: the ceil((n+1)p)-th smallest.
// Returns {value, capped}: capped when (n+1)p > n, i.e. n cannot support p.
export function conformalQuantile(sortedRes, p) {
  const n = sortedRes.length;
  const k = Math.ceil((n + 1) * p);
  if (k > n) return { value: sortedRes[n - 1], capped: true };
  return { value: sortedRes[Math.max(0, k - 1)], capped: false };
}

// OLS of y on x with the slope's standard error.
function ols(x, y) {
  const mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < x.length; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  if (sxx < 1e-12) return { a: my, b: 0, se: Infinity, degenerate: true };
  const b = sxy / sxx, a = my - b * mx;
  let ss = 0;
  for (let i = 0; i < x.length; i++) ss += (y[i] - a - b * x[i]) ** 2;
  const se = Math.sqrt(ss / Math.max(1, x.length - 2) / sxx);
  return { a, b, se, degenerate: false };
}

// Fit the model. Pure ratio (b = 1, location = median log ratio) unless the
// size trend is clear: n >= 20 and |b - 1| > 2 standard errors.
export function fitModel(est, act) {
  const x = est.map(Math.log), y = act.map(Math.log);
  const lr = y.map((v, i) => v - x[i]);
  const f = ols(x, y);
  const sized = est.length >= 20 && !f.degenerate && Math.abs(f.b - 1) > 2 * f.se;
  let a, b;
  if (sized) { a = f.a; b = f.b; } else { a = median(lr); b = 1; }
  const res = y.map((v, i) => v - a - b * x[i]);
  // Centre residuals on their median so P50 is the median of past outcomes.
  const m = median(res);
  return { a: a + m, b, sized, slopeSe: f.se, res: res.map((r) => r - m), slopeRaw: f.b };
}

const predictLn = (m, e) => m.a + m.b * Math.log(e);

function quantilesFor(m, e, levels = LEVELS) {
  const s = sortedNum(m.res);
  return levels.map((p) => {
    const q = p === 0.5 ? { value: 0, capped: false } : conformalQuantile(s, p);
    return { p, value: Math.exp(predictLn(m, e) + q.value), capped: q.capped };
  });
}

// Chance actual*rate exceeds price, from the residual set, with the +1 that
// keeps a small sample from claiming a zero chance.
export function lossChance(m, e, price, rate) {
  const n = m.res.length, need = Math.log(price / rate) - predictLn(m, e);
  const over = m.res.filter((r) => r > need).length;
  return (over + 1) / (n + 1);
}

function expectedOverrun(m, e, price, rate) {
  const mu = predictLn(m, e);
  return mean(m.res.map((r) => Math.max(0, Math.exp(mu + r) * rate - price)));
}

export function analyze(rows, o = {}) {
  const warnings = [];
  const n = rows.length;
  if (n < MIN_N) return { error: `Only ${n} project${n === 1 ? "" : "s"}. At least ${MIN_N} finished projects are needed to say anything about how your estimates miss; ${GOOD_N} or more gives a usable answer.` };
  const est = rows.map((r) => r.est), act = rows.map((r) => r.act);
  const lr = act.map((v, i) => Math.log(v / est[i]));
  if (sd(lr) < 0.01) return { error: "Your actuals matched your estimates almost exactly on every project, so there is no miss to measure. Check that the two columns are not the same numbers." };
  const m = fitModel(est, act);
  const ratios = act.map((v, i) => v / est[i]);
  const medianRatio = median(ratios);
  const overPct = ratios.filter((r) => r > 1.0001).length / n;
  const ratioSorted = sortedNum(ratios);
  const worst = ratioSorted[n - 1];

  const typical = median(est);
  const e = Number.isFinite(o.estimate) && o.estimate > 0 ? o.estimate : typical;
  const usedTypical = !(Number.isFinite(o.estimate) && o.estimate > 0);
  const rate = Number.isFinite(o.rate) && o.rate > 0 ? o.rate : null;
  const price = Number.isFinite(o.price) && o.price > 0 ? o.price : null;

  // Extrapolation guard: the model only knows the estimate sizes it has seen.
  const lo = Math.min(...est), hi = Math.max(...est);
  const outside = e < lo * 0.999 || e > hi * 1.001;
  if (outside) warnings.push(`Your new estimate (${num(e, 1)}) is outside the ${num(lo, 1)} to ${num(hi, 1)} range of past projects. The result below is an extrapolation, so treat it as a guess.`);
  if (m.sized) warnings.push(`Overruns change with size in your history (actual grows like estimate^${m.b.toFixed(2)}), so larger and smaller projects are not treated alike.`);

  const quant = quantilesFor(m, e);
  const capped95 = quant.find((q) => q.p === 0.95)?.capped;
  if (capped95) warnings.push(`With ${n} projects the 95% level cannot be estimated beyond your worst one; it is shown as your worst residual. Use 80% or 90%.`);

  // Bootstrap: refit on resampled projects; 80% range of the P80 multiplier at e.
  const rnd = mulberry32(o.seed ?? 20260930);
  const p80s = [], medMult = [];
  for (let b = 0; b < BOOT; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rnd() * n));
    const be = idx.map((i) => est[i]), ba = idx.map((i) => act[i]);
    const bl = ba.map((v, i) => Math.log(v / be[i]));
    if (sd(bl) < 1e-9) continue;
    const bm = fitModel(be, ba);
    const q80 = conformalQuantile(sortedNum(bm.res), 0.8).value;
    p80s.push(Math.exp(predictLn(bm, e) + q80) / e);
    medMult.push(Math.exp(predictLn(bm, e)) / e);
  }
  const p80Mult = quant.find((q) => q.p === 0.8).value / e;
  const medMultPoint = quant[0].value / e;
  const s80 = sortedNum(p80s), sMed = sortedNum(medMult);

  // Back-test: fit on the first 75% in the order given, score the last 25%.
  let holdout = null;
  const test = Math.floor(n * 0.25), train = n - test;
  if (train >= MIN_N && test >= 5) {
    const tm = fitModel(est.slice(0, train), act.slice(0, train));
    const s = sortedNum(tm.res);
    const q80 = conformalQuantile(s, 0.8).value, q10 = quantileSorted(s, 0.1), q90 = conformalQuantile(s, 0.9).value;
    let under80 = 0, inside = 0, errModel = 0, errNaive = 0;
    for (let i = train; i < n; i++) {
      const mu = predictLn(tm, est[i]), ly = Math.log(act[i]);
      if (ly <= mu + q80) under80++;
      if (ly >= mu + q10 && ly <= mu + q90) inside++;
      errModel += Math.abs(ly - mu);
      errNaive += Math.abs(ly - Math.log(est[i]));
    }
    holdout = {
      train, test,
      coverage80: under80 / test, // share of held-out projects at or under the P80 prediction (nominal 80%)
      coverageBand: inside / test, // share inside the P10..P90 band (nominal 80%)
      maeModel: errModel / test, maeNaive: errNaive / test,
      helps: errModel < errNaive * 0.98,
    };
  }

  const spread = sd(m.res);
  let verdict;
  if (n >= GOOD_N && holdout && holdout.helps && Math.abs(holdout.coverage80 - 0.8) <= 0.2) verdict = "usable";
  else if (n >= GOOD_N && holdout && Math.abs(holdout.coverage80 - 0.8) <= 0.2) verdict = "calibrated";
  else verdict = "weak";
  if (n < GOOD_N) warnings.push(`Only ${n} projects: the range is wide and the back-test is thin. ${GOOD_N} or more makes it far steadier.`);

  // Per-type medians when a type column is given and groups are big enough.
  const byType = [];
  const groups = new Map();
  rows.forEach((r, i) => { if (r.type) { if (!groups.has(r.type)) groups.set(r.type, []); groups.get(r.type).push(ratios[i]); } });
  for (const [type, rs] of groups) if (rs.length >= 5) byType.push({ type, n: rs.length, medianRatio: median(rs), p80Ratio: quantileSorted(sortedNum(rs), 0.8) });
  byType.sort((a, b) => b.medianRatio - a.medianRatio);
  if (groups.size && !byType.length) warnings.push("Project types were given but none has 5 or more projects, so no per-type overrun is shown.");

  const scenarios = quant.map((q) => ({
    p: q.p, units: q.value, buffer: q.value / e - 1, capped: q.capped,
    price: rate ? q.value * rate : null,
    lossChance: rate ? lossChance(m, e, q.value * rate, rate) : null,
  }));
  let proposal = null;
  if (price && rate) {
    const pLoss = lossChance(m, e, price, rate);
    proposal = {
      price, rate, breakEvenUnits: price / rate, breakEvenMultiple: price / rate / e,
      lossChance: pLoss, expectedOverrun: expectedOverrun(m, e, price, rate),
      medianUnits: quant[0].value, p80Units: quant[2].value,
    };
  }
  if (price && !rate) warnings.push("Enter your hourly cost or rate as well to see the chance a fixed price loses money.");

  return {
    n, estimate: e, usedTypical, rate, price, outside, verdict, sized: m.sized,
    medianRatio, overPct, worst, spread, model: { a: m.a, b: m.b },
    median: quant[0].value, p80: quant[2].value, p90: quant[3].value,
    p80Mult, medianMult: medMultPoint,
    p80Range80: [quantileSorted(s80, 0.1), quantileSorted(s80, 0.9)],
    medianRange80: [quantileSorted(sMed, 0.1), quantileSorted(sMed, 0.9)],
    scenarios, proposal, holdout, byType, warnings,
  };
}

// A project made of several tasks. Each task estimate is scaled by the fitted
// miss, and the project total is simulated two ways because the truth sits
// between them: "independent" draws a separate past residual per task (misses
// cancel out, so the total looks tighter); "shared" applies one residual to
// every task (a bad project is bad everywhere, e.g. unclear scope). Price from
// the shared figure unless your tasks are truly unrelated.
export function parseTasks(text) {
  const out = [], bad = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(/[,\t;]/);
    // "name, 12" or "12": the last numeric field is the estimate.
    let v = NaN;
    for (let k = parts.length - 1; k >= 0 && !(v > 0); k--) v = moneyNum(parts[k]);
    if (v > 0) out.push({ name: parts.length > 1 ? parts.slice(0, -1).join(",").trim() : `Task ${out.length + 1}`, est: v });
    else if (i > 0 || /\d/.test(line)) bad.push(i + 1);
  });
  return { tasks: out, skipped: bad.length };
}

export function analyzeTasks(rows, tasks, o = {}) {
  if (!tasks || !tasks.length) return { error: "Add at least one task estimate." };
  const n = rows.length;
  if (n < MIN_N) return { error: `Only ${n} finished projects in your history. At least ${MIN_N} are needed.` };
  const est = rows.map((r) => r.est), act = rows.map((r) => r.act);
  if (sd(act.map((v, i) => Math.log(v / est[i]))) < 0.01) return { error: "Your actuals matched your estimates almost exactly, so there is no miss to measure." };
  const m = fitModel(est, act);
  const mus = tasks.map((t) => predictLn(m, t.est));
  const rate = Number.isFinite(o.rate) && o.rate > 0 ? o.rate : null;
  const price = Number.isFinite(o.price) && o.price > 0 ? o.price : null;
  const sumEst = tasks.reduce((a, t) => a + t.est, 0);
  const levels = [0.5, 0.8, 0.9];
  const warnings = [];
  const lo = Math.min(...est), hi = Math.max(...est);
  const out = tasks.filter((t) => t.est < lo * 0.999 || t.est > hi * 1.001).length;
  if (out) warnings.push(`${out} task estimate${out === 1 ? " is" : "s are"} outside the ${num(lo, 1)} to ${num(hi, 1)} range of the projects in your history, so those are extrapolations. Tasks are usually smaller than whole projects: for best results, put your history at task size.`);

  // Shared: one residual for all tasks.
  const totals = m.res.map((r) => mus.reduce((a, mu) => a + Math.exp(mu + r), 0));
  const sT = sortedNum(totals);
  const shared = levels.map((p) => (p === 0.5 ? quantileSorted(sT, 0.5) : conformalQuantile(sT, p).value));
  // Independent: Monte Carlo over the same residual set.
  const rnd = mulberry32(o.seed ?? 20261019), TRIALS = 20000, ind = new Array(TRIALS);
  for (let t = 0; t < TRIALS; t++) {
    let tot = 0;
    for (let k = 0; k < mus.length; k++) tot += Math.exp(mus[k] + m.res[Math.floor(rnd() * n)]);
    ind[t] = tot;
  }
  const sI = sortedNum(ind);
  const independent = levels.map((p) => quantileSorted(sI, p));
  const sumOfP80 = tasks.reduce((a, t) => a + quantilesFor(m, t.est, [0.8])[0].value, 0);
  const lossOf = (arr, pr) => (arr.filter((v) => v * rate > pr).length + 1) / (arr.length + 1);
  const proposal = price && rate ? { price, rate, sharedLoss: lossOf(totals, price), independentLoss: lossOf(ind, price), breakEvenUnits: price / rate } : null;
  if (price && !rate) warnings.push("Enter your hourly cost or rate as well to see the chance a fixed price loses money.");
  if (tasks.length === 1) warnings.push("With one task the two views are the same.");
  return {
    n, count: tasks.length, sumEst, warnings, rate,
    shared: levels.map((p, i) => ({ p, units: shared[i], buffer: shared[i] / sumEst - 1, price: rate ? shared[i] * rate : null })),
    independent: levels.map((p, i) => ({ p, units: independent[i], buffer: independent[i] / sumEst - 1, price: rate ? independent[i] * rate : null })),
    sumOfP80, sumOfP80Buffer: sumOfP80 / sumEst - 1, proposal,
    tasks: tasks.map((t, i) => ({ name: t.name, est: t.est, median: Math.exp(mus[i]), p80: quantilesFor(m, t.est, [0.8])[0].value })),
  };
}

// Deterministic invented history: 60 finished projects, median overrun about 25%.
export function sampleText() {
  let s = 4242;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const types = ["website", "app feature", "data work", "audit"];
  const lines = ["estimate_hours,actual_hours,type"];
  for (let i = 0; i < 60; i++) {
    const est = Math.round(8 + rnd() ** 2 * 120);
    const t = types[Math.floor(rnd() * types.length)];
    const base = t === "app feature" ? 0.5 : t === "audit" ? 0.1 : 0.3;
    const act = Math.max(1, Math.round(est * Math.exp(base + 0.28 * gauss())));
    lines.push(`${est},${act},${t}`);
  }
  return lines.join("\n");
}

export function reportCsv(r) {
  const q = (v) => (v === null || v === undefined ? "" : v);
  const lines = ["chance_actual_is_at_or_below,units,buffer_over_estimate_pct,price_to_cover,chance_fixed_price_at_that_level_loses"];
  for (const s of r.scenarios) lines.push([s.p, s.units.toFixed(2), (s.buffer * 100).toFixed(1), q(s.price === null ? null : s.price.toFixed(2)), q(s.lossChance === null ? null : s.lossChance.toFixed(3))].join(","));
  return lines.join("\n") + "\n";
}
