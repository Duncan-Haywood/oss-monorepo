// Reliability from a maintenance history: MTBF, MTTR, observed availability,
// a two-parameter Weibull fit by maximum likelihood with right-censoring, a
// likelihood-ratio interval on the shape, and the age-replacement interval
// that minimises cost per unit of operating time.
//
// Why the shape matters: time-based preventive replacement only pays when
// failures come from wear-out (shape > 1). For random failures (shape near 1)
// or infant mortality (shape < 1) replacing on a schedule spends parts and
// labour and can make things worse; the useful work there is condition
// monitoring, inspection or fixing installation and quality. A plain MTBF
// cannot tell these apart; the shape can, once there are enough failures.

import { parseDay, meterAt } from "./schedule.mjs";

// ln Gamma by Lanczos (g = 7, n = 9); relative error below 1e-13 for x > 0.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
export const gamma = (x) => Math.exp(lnGamma(x));

// Log-likelihood of Weibull(shape b, scale e) for failures `f` and
// right-censored (still running) times `c`.
export function weibullLogLik(b, e, f, c = []) {
  let s = 0;
  for (const t of f) s += Math.log(b) - Math.log(e) + (b - 1) * Math.log(t / e) - (t / e) ** b;
  for (const t of c) s -= (t / e) ** b;
  return s;
}

// The scale that maximises the likelihood for a given shape.
function scaleFor(b, all, r) {
  // computed on times divided by their maximum, so large hour counts and
  // large shapes cannot overflow t^b
  const m = Math.max(...all);
  let s = 0;
  for (const t of all) s += (t / m) ** b;
  return m * (s / r) ** (1 / b);
}

function profile(b, f, c) {
  const all = f.concat(c);
  return weibullLogLik(b, scaleFor(b, all, f.length), f, c);
}

// Maximum-likelihood Weibull fit. `failures` are times to failure (> 0);
// `censored` are times survived so far without failing (> 0).
// Returns { shape, scale, mttf, logLik, shapeCI: [lo, hi] | null, failures, censored }.
export function fitWeibull(failures, censored = [], { level = 0.9 } = {}) {
  const f = failures.filter((t) => t > 0);
  const c = censored.filter((t) => t > 0);
  const r = f.length;
  if (r < 2) return null;
  const all = f.concat(c);
  const m = Math.max(...all);
  const sumLnF = f.reduce((s, t) => s + Math.log(t / m), 0) / r;
  // profile score in the shape; increasing in b, so bisection finds the root
  const g = (b) => {
    let s0 = 0, s1 = 0;
    for (const t of all) { const u = t / m; const p = u ** b; s0 += p; s1 += p * Math.log(u); }
    return s1 / s0 - 1 / b - sumLnF;
  };
  let lo = 1e-3, hi = 1;
  while (g(hi) < 0 && hi < 1e3) hi *= 2;
  if (g(hi) < 0) return null; // every failure at the same time: no finite shape
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid; else hi = mid;
    if (hi - lo < 1e-12 * hi) break;
  }
  const shape = (lo + hi) / 2;
  const scale = scaleFor(shape, all, r);
  const logLik = weibullLogLik(shape, scale, f, c);
  // likelihood-ratio interval: shapes whose profile log-likelihood is within
  // chi2(1, level)/2 of the best
  const chi = chi2Quantile1(level) / 2;
  const inside = (b) => logLik - profile(b, f, c) <= chi;
  const edge = (a, b) => { // a inside, b outside
    for (let i = 0; i < 100; i++) { const mid = (a + b) / 2; if (inside(mid)) a = mid; else b = mid; }
    return (a + b) / 2;
  };
  let out = shape / 2;
  while (inside(out) && out > 1e-3) out /= 2;
  const ciLo = edge(shape, out);
  out = shape * 2;
  while (inside(out) && out < 1e3) out *= 2;
  const ciHi = edge(shape, out);
  return { shape, scale, mttf: scale * gamma(1 + 1 / shape), logLik, shapeCI: [ciLo, ciHi], level, failures: r, censored: c.length };
}

// chi-square(1) quantiles for the usual levels (two-sided normal z squared).
function chi2Quantile1(level) {
  const z = { 0.8: 1.2815515655446004, 0.9: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004 }[level];
  if (!z) throw new Error("level must be 0.8, 0.9, 0.95 or 0.99");
  return z * z;
}

export const weibullR = (t, shape, scale) => Math.exp(-((t / scale) ** shape));

// What the shape says, phrased as an observation the planner acts on.
export function readShape(fit) {
  if (!fit) return { pattern: "too few failures", advice: "Fewer than two failures: record more history before reading a pattern." };
  const [lo, hi] = fit.shapeCI;
  if (lo > 1) return { pattern: "wear-out", advice: `Failures rise with age (shape ${fit.shape.toFixed(2)}, ${Math.round(fit.level * 100)}% interval ${lo.toFixed(2)} to ${hi.toFixed(2)}, above 1). Time- or meter-based replacement can prevent failures; see the interval below.` };
  if (hi < 1) return { pattern: "early-life", advice: `Failures fall with age (shape ${fit.shape.toFixed(2)}, interval ${lo.toFixed(2)} to ${hi.toFixed(2)}, below 1): new or just-repaired units fail most. Scheduled replacement adds early-life risk; look at installation, parts quality and repair practice.` };
  return { pattern: "no clear age pattern", advice: `The history cannot tell wear-out from random failures (shape ${fit.shape.toFixed(2)}, interval ${lo.toFixed(2)} to ${hi.toFixed(2)} includes 1). Scheduled replacement is not shown to help; inspection or condition monitoring is the safer bet until more failures are recorded.` };
}

// Simpson integral of R(t) from 0 to T.
function integralR(T, shape, scale, n = 400) {
  const h = T / n;
  let s = weibullR(0, shape, scale) + weibullR(T, shape, scale);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * weibullR(i * h, shape, scale);
  return (s * h) / 3;
}

// Age replacement (Barlow and Proschan): replace at age T or on failure,
// whichever first. Cost per unit time C(T) = (Cp R(T) + Cf (1 - R(T))) / int_0^T R.
// Returns the T that minimises it, with the run-to-failure cost rate for
// comparison, or { optimal: null, reason } when no finite T helps.
export function ageReplacement(shape, scale, plannedCost, failureCost) {
  const runToFailure = failureCost / (scale * gamma(1 + 1 / shape));
  if (!(failureCost > plannedCost)) return { optimal: null, runToFailure, reason: "A failure costs no more than a planned replacement, so replacing early cannot save money." };
  if (!(shape > 1)) return { optimal: null, runToFailure, reason: "With shape at or below 1 the failure rate does not rise with age, so no replacement age lowers the cost." };
  const cost = (T) => (plannedCost * weibullR(T, shape, scale) + failureCost * (1 - weibullR(T, shape, scale))) / integralR(T, shape, scale);
  // coarse scan, then golden section around the best cell
  const top = scale * 4;
  let best = top, bestC = cost(top);
  const N = 400;
  for (let i = 1; i <= N; i++) { const T = (top * i) / N; const c = cost(T); if (c < bestC) { bestC = c; best = T; } }
  let a = Math.max(top / N / 10, best - top / N), b = Math.min(top, best + top / N);
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = b - phi * (b - a), x2 = a + phi * (b - a), f1 = cost(x1), f2 = cost(x2);
  for (let i = 0; i < 80; i++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - phi * (b - a); f1 = cost(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + phi * (b - a); f2 = cost(x2); }
  }
  const T = (a + b) / 2, cT = cost(T);
  if (cT >= runToFailure * 0.995) return { optimal: null, runToFailure, reason: "No replacement age saves more than half a percent over running to failure at these costs." };
  return { optimal: T, costRate: cT, runToFailure, saving: 1 - cT / runToFailure, reliabilityAtT: weibullR(T, shape, scale) };
}

// History summary for one asset.
//   workOrders: [{ completed: "YYYY-MM-DD", failure: true, downtimeHours, meter? }]
//   inService: "YYYY-MM-DD"; today: day number; readings for meter-based ages.
// Ages between failures are in the meter's unit when the asset has meter
// readings at each failure (operating hours, cycles), otherwise in days.
// `mode` keeps only failures with that failureCode: mixed causes (a belt, a
// sensor, a heater) each with their own clock can look like wear-out when
// pooled, so a pattern is best read per failure mode.
export function assetReliability(asset, workOrders, today, { mode = null } = {}) {
  const start = parseDay(asset.inService);
  const fails = workOrders
    .filter((w) => w.failure && w.assetId === asset.id && (mode === null || (w.failureCode || "") === mode) && parseDay(w.failedOn || w.created || w.completed) !== null)
    .map((w) => ({ day: parseDay(w.failedOn || w.created || w.completed), done: w.status === "done", down: Number(w.downtimeHours) || 0, meter: w.meter === undefined || w.meter === "" || w.meter === null ? null : Number(w.meter) }))
    .filter((w) => w.day <= today && (start === null || w.day >= start))
    .sort((a, b) => a.day - b.day);
  const readings = asset.readings || [];
  const useMeter = readings.length >= 2 && asset.meterUnit;
  const ageAt = (day, meter) => (useMeter ? (meter ?? meterAt(readings, day)) : day);
  const origin = start !== null ? ageAt(start, asset.meterStart ?? null) : null;
  const times = [];
  let prev = origin;
  for (const fl of fails) {
    const a = ageAt(fl.day, fl.meter);
    if (prev !== null && a !== null && a > prev) times.push(a - prev);
    prev = a;
  }
  const nowAge = ageAt(today, null);
  const censored = prev !== null && nowAge !== null && nowAge > prev ? [nowAge - prev] : [];
  const observed = start !== null && nowAge !== null && origin !== null ? nowAge - origin : null;
  const downtime = fails.reduce((s, f) => s + f.down, 0);
  const repaired = fails.filter((f) => f.done);
  const elapsedHours = start !== null ? (today - start) * 24 : null;
  const fit = fitWeibull(times, censored);
  const codes = new Set(workOrders.filter((w) => w.failure && w.assetId === asset.id && (mode === null || (w.failureCode || "") === mode)).map((w) => w.failureCode || "(no code)"));
  let reading = readShape(fit);
  if (fit && mode === null && codes.size > 1) reading = { pattern: `${reading.pattern}, mixed causes`, mixed: true, advice: `These ${fails.length} failures have ${codes.size} different causes, each with its own clock, and pooling them can show a pattern no single cause has. Read each cause on its own once it repeats. Pooled: ${reading.advice}` };
  return {
    unit: useMeter ? asset.meterUnit : "days",
    failures: fails.length,
    times,
    censored,
    mtbf: fails.length && observed !== null ? observed / fails.length : null,
    mttr: repaired.length ? repaired.reduce((s, f) => s + f.down, 0) / repaired.length : null,
    mode,
    downtimeHours: downtime,
    availability: elapsedHours ? 1 - downtime / elapsedHours : null,
    fit,
    causes: codes.size,
    reading,
  };
}

// Failure codes on an asset that repeat, most frequent first.
export function failureModes(asset, workOrders) {
  const n = new Map();
  for (const w of workOrders) if (w.failure && w.assetId === asset.id && w.failureCode) n.set(w.failureCode, (n.get(w.failureCode) || 0) + 1);
  return [...n].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count }));
}
