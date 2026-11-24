// Mix calibration: the datum temperature (Nurse-Saul) and activation energy
// (equivalent age) of one mix, from mortar cubes cured at three or more
// constant temperatures, the procedure ASTM C1074's Annex A1 describes.
//
//   1. At each curing temperature, cubes are broken at increasing ages, and
//      final setting time is measured (ASTM C403) on mortar from the same batch.
//   2. A rate constant k is found per temperature by fitting the hyperbola
//         S(t) = Su * k (t - t0) / (1 + k (t - t0))
//      where t0 is the age when strength gain starts (final setting).
//      Two ways are offered: the annex's straight line through 1/S against
//      1/(t - t0) (k = intercept / slope), and a direct least-squares fit of
//      the hyperbola to the strengths themselves.
//   3. Datum temperature: the temperature at which the straight line through
//      k against T reaches zero. Activation energy: -R times the slope of the
//      straight line through ln k against 1/T (kelvin).
//
// Pure functions; the page, the CLI and the tests share them. Nothing here
// is a determination: it is regression on the numbers given.

import { R_GAS, DEFAULTS, maturityRate, fitStrength } from './maturity.mjs';

const KELVIN = 273.15;

// ---------------------------------------------------------------- input

/**
 * Parse cube results. One cube per line: "temperature, age, strength".
 * A line starting with "set" gives final setting time at a temperature:
 * "set, temperature, hours". Blank lines and "#" comments are skipped; a
 * first line without numbers is taken as a header.
 */
export function parseCubeText(text, { tempUnit = 'C', ageUnit = 'h' } = {}) {
  const cubes = []; const setting = []; const errors = [];
  const toC = v => (tempUnit === 'F' ? (v - 32) * 5 / 9 : v);
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const isSet = /^set(ting)?\b/i.test(line);
    const nums = splitCells(line.replace(/^set(ting)?\b/i, '')).map(toNum);
    if (!nums.length || nums.some(n => !Number.isFinite(n))) {
      if (i === 0 && !isSet) return; // header
      errors.push(`Line ${i + 1}: expected numbers, got "${raw.trim()}".`);
      return;
    }
    if (isSet) {
      if (nums.length !== 2 || !(nums[1] > 0)) { errors.push(`Line ${i + 1}: a setting line is "set, temperature, hours".`); return; }
      setting.push({ tempC: round1(toC(nums[0])), hours: nums[1] });
      return;
    }
    if (nums.length !== 3) { errors.push(`Line ${i + 1}: expected temperature, age, strength.`); return; }
    const [t, age, s] = nums;
    if (!(age > 0) || !(s > 0)) { errors.push(`Line ${i + 1}: age and strength must be positive.`); return; }
    cubes.push({ tempC: round1(toC(t)), ageH: ageUnit === 'd' ? age * 24 : age, strength: s });
  });
  return { cubes, setting, errors };
}

// "10, 26.2, 6,000" is three cells: a comma followed by a space, a semicolon,
// a tab or a space separates cells, and a comma inside a cell is a thousands
// separator. Only a line with no such separator ("10,26.2,6000") is split on
// bare commas, as plain CSV.
function splitCells(line) {
  const t = line.trim().replace(/^[,;]\s*/, '');
  const cells = t.split(/,\s+|\s*;\s*|\t+|\s+/).filter(Boolean);
  return cells.length === 1 && t.includes(',') ? t.split(',').filter(Boolean) : cells;
}
function toNum(cell) { return /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(cell) ? Number(cell.replace(/,/g, '')) : Number(cell); }

function round1(v) { return Math.round(v * 10) / 10; }

/** Cubes grouped by curing temperature, coldest first. */
export function groupByTemperature(cubes) {
  const m = new Map();
  for (const c of cubes) { if (!m.has(c.tempC)) m.set(c.tempC, []); m.get(c.tempC).push(c); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([tempC, list]) => ({ tempC, cubes: list.sort((a, b) => a.ageH - b.ageH) }));
}

// ---------------------------------------------------------------- regression

/** Ordinary least squares y = a + b x, with standard errors. */
export function ols(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0; let sxy = 0; let syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx; const a = my - b * mx;
  const sse = Math.max(0, syy - b * sxy);
  const s2 = n > 2 ? sse / (n - 2) : NaN;
  return {
    a, b, n, mx, sxx,
    r2: syy > 0 ? 1 - sse / syy : 1,
    seA: Math.sqrt(s2 * (1 / n + mx * mx / sxx)),
    seB: Math.sqrt(s2 / sxx),
    covAB: -mx * s2 / sxx,
  };
}

// Golden-section search for a minimum of a one-variable function on [lo, hi].
function golden(f, lo, hi, iters = 120) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo; let b = hi;
  let c = b - g * (b - a); let d = a + g * (b - a);
  let fc = f(c); let fd = f(d);
  for (let i = 0; i < iters && b - a > 1e-12 * (1 + Math.abs(a)); i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

function hyperShape(k, t0, ages) { return ages.map(t => { const u = k * (t - t0); return u > 0 ? u / (1 + u) : 0; }); }
function scaleFor(g, ys) { let num = 0; let den = 0; for (let i = 0; i < g.length; i++) { num += g[i] * ys[i]; den += g[i] * g[i]; } return den > 0 ? num / den : 0; }
function sseOf(g, su, ys) { let s = 0; for (let i = 0; i < g.length; i++) s += (ys[i] - su * g[i]) ** 2; return s; }

/**
 * Rate constant by the annex's straight line: 1/S = 1/Su + (1/(k Su)) * 1/(t - t0).
 * Only cubes older than t0 are used.
 */
export function rateReciprocal(cubes, t0 = 0) {
  const use = cubes.filter(c => c.ageH > t0);
  if (new Set(use.map(c => c.ageH)).size < 2) return { ok: false, reason: 'needs cubes at two or more ages after final setting' };
  const fit = ols(use.map(c => 1 / (c.ageH - t0)), use.map(c => 1 / c.strength));
  if (!fit || !(fit.a > 0) || !(fit.b > 0)) return { ok: false, reason: 'the 1/strength against 1/age line does not have a positive intercept and slope' };
  const k = fit.a / fit.b; const su = 1 / fit.a;
  return { ok: true, k, su, t0, n: use.length, r2Line: fit.r2, rmse: rmseOf(use, k, t0, su) };
}

/**
 * Rate constant by fitting the hyperbola to the strengths directly (least
 * squares in strength, so the early, weak cubes do not dominate). With t0
 * given it is held; without, it is fitted between 0 and the first break age.
 */
export function rateHyperbolic(cubes, t0 = null) {
  const ages = cubes.map(c => c.ageH); const ys = cubes.map(c => c.strength);
  const distinct = new Set(ages).size;
  if (distinct < (t0 == null ? 3 : 2)) return { ok: false, reason: t0 == null ? 'needs cubes at three or more ages when final setting is not given' : 'needs cubes at two or more ages' };
  const minAge = Math.min(...ages); const maxAge = Math.max(...ages);
  const lossK = (lk, tz) => { const g = hyperShape(Math.exp(lk), tz, ages); return sseOf(g, scaleFor(g, ys), ys); };
  const lkLo = Math.log(1e-4 / maxAge); const lkHi = Math.log(1e4 / Math.max(minAge - (t0 ?? 0), 1e-6));
  const bestLk = (tz) => {
    // coarse scan, then golden section around the best cell: the loss in ln k can have flat shoulders
    let bi = 0; let bv = Infinity; const N = 60;
    for (let i = 0; i <= N; i++) { const v = lossK(lkLo + (lkHi - lkLo) * i / N, tz); if (v < bv) { bv = v; bi = i; } }
    const step = (lkHi - lkLo) / N;
    return golden(lk => lossK(lk, tz), lkLo + step * Math.max(0, bi - 1), lkLo + step * Math.min(N, bi + 1));
  };
  let tz = t0; let lk;
  if (t0 == null) {
    if (!(minAge > 0)) return { ok: false, reason: 'ages must be positive' };
    const profile = z => lossK(bestLk(z), z);
    let bz = 0; let bv = Infinity; const N = 40;
    for (let i = 0; i < N; i++) { const z = minAge * i / N; const v = profile(z); if (v < bv) { bv = v; bz = i; } }
    const step = minAge / N;
    tz = golden(profile, step * Math.max(0, bz - 1), Math.min(minAge * 0.999, step * (bz + 1)));
  }
  lk = bestLk(tz);
  const k = Math.exp(lk); const g = hyperShape(k, tz, ages); const su = scaleFor(g, ys);
  if (!Number.isFinite(k) || !(su > 0)) return { ok: false, reason: 'did not converge' };
  const atEdge = lk <= lkLo + 1e-6 || lk >= lkHi - 1e-6;
  if (atEdge) return { ok: false, reason: 'strength did not level off or rise within the tested ages, so k is not determined' };
  return { ok: true, k, su, t0: tz, n: cubes.length, rmse: Math.sqrt(sseOf(g, su, ys) / ys.length) };
}

function rmseOf(cubes, k, t0, su) {
  const g = hyperShape(k, t0, cubes.map(c => c.ageH));
  return Math.sqrt(sseOf(g, su, cubes.map(c => c.strength)) / cubes.length);
}

// ---------------------------------------------------------------- the whole calibration

/**
 * Rate constants per temperature, then the datum temperature and activation
 * energy. `rateMethod`: 'hyperbolic' (default) or 'reciprocal'.
 * Final setting times, when given, fix t0 at each temperature; without them
 * the hyperbolic fit estimates t0 and the reciprocal line uses t0 = 0.
 */
export function calibrateMix(cubes, setting = [], { rateMethod = 'hyperbolic' } = {}) {
  const warnings = [];
  const groups = groupByTemperature(cubes);
  const setAt = new Map(setting.map(s => [s.tempC, s.hours]));
  const rates = groups.map(({ tempC, cubes: list }) => {
    const t0 = setAt.has(tempC) ? setAt.get(tempC) : null;
    const r = rateMethod === 'reciprocal' ? rateReciprocal(list, t0 ?? 0) : rateHyperbolic(list, t0);
    return { tempC, cubes: list.length, ages: new Set(list.map(c => c.ageH)).size, t0Source: t0 != null ? 'measured' : rateMethod === 'reciprocal' ? 'zero' : 'fitted', ...r };
  });
  for (const s of setting) if (!groups.some(g => g.tempC === s.tempC)) warnings.push(`A setting time at ${s.tempC} °C has no cubes at that temperature and was not used.`);
  if (rateMethod === 'reciprocal' && rates.some(r => r.t0Source === 'zero')) warnings.push('Without final setting times the straight-line method counts age from casting (t0 = 0), which makes k too small at cold temperatures, where setting is slowest.');
  const good = rates.filter(r => r.ok);
  const result = { rateMethod, rates, warnings, datum: null, activation: null };
  if (good.length < 2) { warnings.push('Needs a rate constant at two or more temperatures; the annex uses three.'); return result; }
  if (good.length === 2) warnings.push('Only two temperatures: the lines go exactly through both points, so there is no check on how straight they are. The annex uses three.');
  const span = good[good.length - 1].tempC - good[0].tempC;
  if (span < 15) warnings.push(`The temperatures span only ${span.toFixed(1)} °C; the fitted values are sensitive to small errors in k. Cover the range the concrete will see.`);

  const lin = ols(good.map(r => r.tempC), good.map(r => r.k));
  if (lin && lin.b > 0) {
    const T0 = -lin.a / lin.b;
    // delta method: T0 = -a/b
    const varT0 = (lin.seA ** 2) / lin.b ** 2 + (lin.a ** 2) * (lin.seB ** 2) / lin.b ** 4 - 2 * lin.a * lin.covAB / lin.b ** 3;
    result.datum = { datumC: T0, se: Math.sqrt(Math.max(0, varT0)), r2: lin.r2, slope: lin.b, intercept: lin.a };
    if (T0 > good[0].tempC) warnings.push(`The datum temperature (${T0.toFixed(1)} °C) is above the coldest curing temperature, where k is still positive: the k-temperature points curve, so the straight line is a poor summary. Prefer equivalent age.`);
  } else warnings.push('k does not rise with temperature, so no datum temperature can be found. Check the temperatures and breaks.');

  const arr = ols(good.map(r => 1 / (r.tempC + KELVIN)), good.map(r => Math.log(r.k)));
  if (arr && arr.b < 0) {
    const Q = -arr.b;
    result.activation = { activationEnergy: Q * R_GAS, se: arr.seB * R_GAS, Q, r2: arr.r2 };
  } else warnings.push('ln k does not fall with 1/T, so no activation energy can be found.');
  return result;
}

/**
 * How well one strength-maturity curve explains every cube once age is
 * converted to maturity with the given function: the RMSE of a single
 * hyperbolic fit on all cubes pooled. A good datum temperature or activation
 * energy brings the three temperatures onto one curve.
 */
export function collapseRmse(cubes, opts) {
  const pts = cubes.map(c => ({ index: maturityRate(c.tempC, { ...DEFAULTS, ...opts }) * c.ageH, strength: c.strength }));
  const fit = fitStrength(pts, 'hyperbolic');
  return fit.chosen ? fit.chosen.rmse : NaN;
}

/**
 * Not in the annex: the datum temperature (or activation energy) that brings
 * every cube closest to one hyperbolic strength-maturity curve, found by
 * minimising collapseRmse directly. This is the job the value does in the
 * field (one curve read at whatever temperature the slab ran), and it uses
 * every cube at once instead of three rate constants.
 */
export function collapseFit(cubes, method = 'nurse-saul') {
  const temps = cubes.map(c => c.tempC);
  const [lo, hi] = method === 'equivalent-age' ? [10000, 90000] : [-20, Math.min(...temps) - 0.5];
  if (!(hi > lo)) return null;
  const f = v => collapseRmse(cubes, method === 'equivalent-age' ? { method, activationEnergy: v } : { method, datumC: v });
  const N = 24; let bi = 0; let bv = Infinity;
  for (let i = 0; i <= N; i++) { const v = f(lo + (hi - lo) * i / N); if (v < bv) { bv = v; bi = i; } }
  const step = (hi - lo) / N;
  const x = golden(f, lo + step * Math.max(0, bi - 1), lo + step * Math.min(N, bi + 1), 30);
  const rmse = f(x);
  const edge = Math.abs(x - lo) < step * 0.05 || Math.abs(x - hi) < step * 0.05;
  return { value: x, rmse, atEdge: edge };
}

/** Compare the defaults with the fitted values by how tightly the cubes collapse onto one curve. */
export function collapseReport(cubes, cal, best = {}) {
  const rows = [];
  rows.push({ label: `Nurse-Saul, datum ${DEFAULTS.datumC} °C (default)`, rmse: collapseRmse(cubes, { method: 'nurse-saul', datumC: DEFAULTS.datumC }) });
  if (cal.datum) rows.push({ label: `Nurse-Saul, datum ${cal.datum.datumC.toFixed(1)} °C (fitted)`, rmse: collapseRmse(cubes, { method: 'nurse-saul', datumC: cal.datum.datumC }) });
  if (best.datum) rows.push({ label: `Nurse-Saul, datum ${best.datum.value.toFixed(1)} °C (best single curve)`, rmse: best.datum.rmse });
  rows.push({ label: `Equivalent age, ${(DEFAULTS.activationEnergy / 1000).toFixed(0)} kJ/mol (default)`, rmse: collapseRmse(cubes, { method: 'equivalent-age', activationEnergy: DEFAULTS.activationEnergy }) });
  if (cal.activation) rows.push({ label: `Equivalent age, ${(cal.activation.activationEnergy / 1000).toFixed(1)} kJ/mol (fitted)`, rmse: collapseRmse(cubes, { method: 'equivalent-age', activationEnergy: cal.activation.activationEnergy }) });
  if (best.energy) rows.push({ label: `Equivalent age, ${(best.energy.value / 1000).toFixed(1)} kJ/mol (best single curve)`, rmse: best.energy.rmse });
  return rows;
}

// ---------------------------------------------------------------- made-up example

/** Seeded generator (mulberry32) so the example and the tests are repeatable. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function gaussian(rand) { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); }

/**
 * Synthetic cubes from a known mix: k(T) Arrhenius with `activationEnergy`,
 * k = kRef at 23 deg C, final setting at setK / k hours, breaks at 2, 4, 8,
 * 16, 32 and 64 times final setting (the annex's doubling schedule), three
 * cubes per age, multiplicative noise with coefficient of variation `cv`.
 */
export function syntheticCubes({ temps = [10, 23, 38], activationEnergy = 42000, kRef = 0.02, su = 6000, setK = 0.12, cv = 0.04, perAge = 3, seed = 1 } = {}) {
  const rand = rng(seed);
  const cubes = []; const setting = [];
  for (const T of temps) {
    const k = kRef * Math.exp(-(activationEnergy / R_GAS) * (1 / (T + KELVIN) - 1 / (23 + KELVIN)));
    const ts = setK / k;
    setting.push({ tempC: T, hours: ts });
    for (const m of [2, 4, 8, 16, 32, 64]) {
      const t = m * ts; const u = k * (t - ts); const s = su * u / (1 + u);
      for (let j = 0; j < perAge; j++) cubes.push({ tempC: T, ageH: t, strength: s * (1 + cv * gaussian(rand)) });
    }
  }
  return { cubes, setting };
}

/** The page's made-up example as text (rounded the way a lab sheet would be). */
export function exampleCubeText() {
  const { cubes, setting } = syntheticCubes({ seed: 7 });
  const lines = ['# Made-up example: temperature (°C), age (hours), strength (psi)'];
  for (const s of setting) lines.push(`set, ${s.tempC}, ${s.hours.toFixed(1)}`);
  for (const c of cubes) lines.push(`${c.tempC}, ${c.ageH.toFixed(1)}, ${Math.round(c.strength / 10) * 10}`);
  return lines.join('\n') + '\n';
}
