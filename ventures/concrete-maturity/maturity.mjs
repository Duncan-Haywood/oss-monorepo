// Concrete maturity engine: estimate in-place concrete strength from a
// temperature logger's record, the way ASTM C1074 ("Standard Practice for
// Estimating Concrete Strength by the Maturity Method") describes.
//
// Three steps, each a pure function so the page, the CLI and the tests share
// them:
//   1. parseLoggerCsv: a logger's CSV export -> hours and degrees C per sensor.
//   2. maturitySeries: the running maturity index per reading, either the
//      Nurse-Saul temperature-time factor (deg C * h above a datum) or the
//      Arrhenius equivalent age (hours at a reference temperature).
//   3. fitStrength + estimate: fit the mix's strength-maturity relationship
//      from lab specimens, then read off each sensor's estimated strength now
//      and when it reaches a target.
//
// Nothing here is a determination: it is arithmetic on the numbers given. The
// maturity method is only as good as the mix calibration, and the standard
// itself asks for the estimate to be checked by other tests before critical
// operations such as form removal or post-tensioning.

export const R_GAS = 8.314; // J/(mol K)

export const DEFAULTS = Object.freeze({
  method: 'nurse-saul', // or 'equivalent-age'
  datumC: 0, // Nurse-Saul datum temperature, deg C
  activationEnergy: 40000, // J/mol, equivalent-age method
  referenceC: 20, // equivalent-age reference temperature, deg C
  labCuringC: 23, // standard moist curing (ASTM C511 rooms run 23 +/- 2 deg C)
});

// ---------------------------------------------------------------- parsing

const NUMBER = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/;

function splitRow(line, delim) {
  // Minimal CSV: handles double-quoted cells with the delimiter inside.
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { cells.push(cur.trim()); cur = ''; } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, 20).join('\n');
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of sample) if (ch in counts) counts[ch]++;
  // A semicolon file often uses decimal commas, so prefer ';' and tab when they appear.
  if (counts['\t'] >= lines.slice(0, 20).length) return '\t';
  if (counts[';'] >= lines.slice(0, 20).length) return ';';
  return ',';
}

function toNumber(cell, decimalComma) {
  if (cell == null) return NaN;
  let s = String(cell).trim().replace(/\s*(°\s*[CF]?|deg[CF]?)$/i, '');
  if (!NUMBER.test(s)) return NaN;
  if (decimalComma) s = s.replace(',', '.');
  else if (s.includes(',')) return NaN;
  return Number(s);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Returns milliseconds on a naive (zone-free) clock, or NaN. Only differences
// between readings are ever used, so the zone does not matter as long as the
// whole file uses one.
export function parseTimestamp(cell, { dayFirst = false } = {}) {
  const s = String(cell ?? '').trim();
  if (!s) return NaN;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(s);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    let year = +m[3];
    if (year < 100) year += 2000;
    let month; let day;
    if (a > 12) { day = a; month = b; } else if (b > 12) { month = a; day = b; } else if (dayFirst) { day = a; month = b; } else { month = a; day = b; }
    let hour = +(m[4] || 0);
    const ampm = (m[7] || '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
    return Date.UTC(year, month - 1, day, hour, +(m[5] || 0), +(m[6] || 0));
  }
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return Date.UTC(+m[3], MONTHS[m[2].toLowerCase()] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  return NaN;
}

function unitFromHeader(h) {
  if (/°\s*F|\(F\)|\bdeg\s*F\b|fahrenheit|\btemp[_ ]?f\b|_f$/i.test(h)) return 'F';
  if (/°\s*C|\(C\)|\bdeg\s*C\b|celsius|\btemp[_ ]?c\b|_c$/i.test(h)) return 'C';
  return null;
}

function elapsedScale(h) {
  if (/\bmin(ute)?s?\b|\(min\)/i.test(h)) return 1 / 60;
  if (/\bdays?\b|\(d\)/i.test(h)) return 24;
  if (/\bsec(ond)?s?\b|\(s\)/i.test(h)) return 1 / 3600;
  return 1; // hours
}

/**
 * Parse a temperature logger's CSV export.
 * Accepts a timestamp column (ISO, US m/d/y with AM/PM, d-Mon-yyyy) or an
 * elapsed-time column (hours by default; minutes, days or seconds when the
 * header says so), plus one or more temperature columns.
 * @returns {{sensors: {name, unit, hours: number[], tempC: number[]}[], start: number|null, notes: string[], errors: string[]}}
 */
export function parseLoggerCsv(text, { unit = 'auto', dayFirst = false } = {}) {
  const notes = [];
  const errors = [];
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { sensors: [], start: null, notes, errors: ['The file needs a header row and at least one reading.'] };
  const delim = detectDelimiter(lines);
  const decimalComma = delim === ';';
  const rows = lines.map(l => splitRow(l, delim));

  // A data row has a parseable time in some column and at least one number elsewhere.
  const isTimeCell = c => Number.isFinite(parseTimestamp(c, { dayFirst })) || Number.isFinite(toNumber(c, decimalComma));
  let firstData = -1;
  for (let i = 0; i < rows.length; i++) {
    const nums = rows[i].filter(c => Number.isFinite(toNumber(c, decimalComma))).length;
    const times = rows[i].filter(c => Number.isFinite(parseTimestamp(c, { dayFirst }))).length;
    if (nums + times >= 2 && rows[i].some(isTimeCell)) { firstData = i; break; }
  }
  if (firstData < 0) return { sensors: [], start: null, notes, errors: ['No rows with a time and a temperature were found.'] };
  const header = firstData > 0 ? rows[firstData - 1] : rows[firstData].map((_, j) => (j === 0 ? 'Time (h)' : `Sensor ${j}`));
  if (firstData === 0) notes.push('No header row: the first column was read as elapsed hours and the rest as temperatures.');
  const data = rows.slice(firstData);
  const width = Math.max(...data.slice(0, 50).map(r => r.length));

  // Time column: the first column whose cells mostly parse as timestamps, else
  // the first numeric column whose header looks like time.
  let timeCol = -1;
  let timeKind = null;
  for (let j = 0; j < width && timeCol < 0; j++) {
    const ok = data.slice(0, 50).filter(r => Number.isFinite(parseTimestamp(r[j], { dayFirst }))).length;
    if (ok >= Math.min(50, data.length) * 0.8) { timeCol = j; timeKind = 'stamp'; }
  }
  if (timeCol < 0) {
    for (let j = 0; j < width && timeCol < 0; j++) {
      if (/time|elapsed|hour|\bhrs?\b|age|min|day|sec/i.test(header[j] || '')) { timeCol = j; timeKind = 'elapsed'; }
    }
  }
  if (timeCol < 0) { timeCol = 0; timeKind = 'elapsed'; notes.push(`No time column named; read "${header[0] || 'column 1'}" as elapsed hours.`); }

  // Temperature columns: numeric columns other than time and an index/serial column.
  const tempCols = [];
  for (let j = 0; j < width; j++) {
    if (j === timeCol) continue;
    const h = header[j] || `Column ${j + 1}`;
    if (/^(#|no\.?|index|record|row|id|serial|point)$/i.test(h.trim())) continue;
    if (/humid|\brh\b|battery|volt|signal|dew/i.test(h)) continue;
    const ok = data.slice(0, 50).filter(r => Number.isFinite(toNumber(r[j], decimalComma))).length;
    if (ok >= Math.min(50, data.length) * 0.5) tempCols.push(j);
  }
  if (!tempCols.length) return { sensors: [], start: null, notes, errors: ['No temperature column was found.'] };

  const scale = timeKind === 'elapsed' ? elapsedScale(header[timeCol] || '') : 1;
  let start = null;
  const times = data.map(r => {
    if (timeKind === 'stamp') return parseTimestamp(r[timeCol], { dayFirst });
    const v = toNumber(r[timeCol], decimalComma);
    return Number.isFinite(v) ? v * scale : NaN;
  });
  if (timeKind === 'stamp') start = times.find(Number.isFinite) ?? null;

  const sensors = [];
  for (const j of tempCols) {
    const h = (header[j] || `Sensor ${sensors.length + 1}`).trim();
    let u = unit === 'auto' ? unitFromHeader(h) : unit;
    if (!u) {
      u = 'C';
      notes.push(`"${h}": no unit in the header, read as deg C. Choose deg F if that is wrong.`);
    }
    const pts = [];
    let skipped = 0;
    for (let i = 0; i < data.length; i++) {
      const t = times[i];
      const v = toNumber(data[i][j], decimalComma);
      if (!Number.isFinite(t) || !Number.isFinite(v)) { skipped++; continue; }
      const c = u === 'F' ? (v - 32) * 5 / 9 : v;
      const hours = timeKind === 'stamp' ? (t - start) / 3600000 : t;
      pts.push([hours, c]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    // Drop exact duplicate times (keep the first) so intervals stay positive.
    const clean = pts.filter((p, i) => i === 0 || p[0] > pts[i - 1][0]);
    if (skipped) notes.push(`"${h}": ${skipped} row(s) without a readable time or temperature were skipped.`);
    if (clean.length < 2) { notes.push(`"${h}": fewer than two readings, left out.`); continue; }
    const t0 = clean[0][0];
    const name = h.replace(/\s*\((°?\s*[CF]|deg\s*[CF])\)\s*$/i, '').replace(/\s*°\s*[CF]$/i, '') || `Sensor ${sensors.length + 1}`;
    sensors.push({ name, unit: u, hours: clean.map(p => p[0] - t0), tempC: clean.map(p => p[1]) });
  }
  if (!sensors.length) errors.push('No sensor had two or more readable readings.');
  return { sensors, start, notes, errors };
}

// ------------------------------------------------------------ maturity

/** Rate at which one hour at `tempC` adds to the maturity index. */
export function maturityRate(tempC, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (o.method === 'equivalent-age') {
    const ta = tempC + 273.15;
    const ts = o.referenceC + 273.15;
    return Math.exp(-(o.activationEnergy / R_GAS) * (1 / ta - 1 / ts));
  }
  return Math.max(0, tempC - o.datumC);
}

/**
 * Running maturity index at each reading. Uses the mean temperature of each
 * interval, as ASTM C1074 does. Gaps longer than `gapHours` are still
 * integrated (straight line between the readings either side) but reported.
 */
export function maturitySeries(hours, tempC, opts = {}) {
  const o = { ...DEFAULTS, gapHours: 6, ...opts };
  const index = [0];
  const gaps = [];
  let below = 0;
  for (let i = 1; i < hours.length; i++) {
    const dt = hours[i] - hours[i - 1];
    const ta = (tempC[i] + tempC[i - 1]) / 2;
    if (dt > o.gapHours) gaps.push({ fromHour: hours[i - 1], toHour: hours[i] });
    if (o.method !== 'equivalent-age' && ta <= o.datumC) below += dt;
    index.push(index[i - 1] + maturityRate(ta, o) * dt);
  }
  return { index, gaps, hoursAtOrBelowDatum: below };
}

/** Maturity index of a lab specimen cured at a constant temperature for `ageDays`. */
export function labMaturity(ageDays, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return maturityRate(o.labCuringC, o) * ageDays * 24;
}

export function indexUnit(opts = {}) {
  return (opts.method || DEFAULTS.method) === 'equivalent-age' ? 'h' : '°C·h';
}

// ------------------------------------------------------------ curve fits

// Nelder-Mead simplex minimiser; small and deterministic.
function nelderMead(f, x0, { step = 0.5, iters = 600, tol = 1e-10 } = {}) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; simplex.push(p); }
  let values = simplex.map(f);
  for (let k = 0; k < iters; k++) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map(i => simplex[i]);
    values = order.map(i => values[i]);
    if (Math.abs(values[n] - values[0]) < tol * (1 + Math.abs(values[0]))) break;
    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let d = 0; d < n; d++) centroid[d] += simplex[i][d] / n;
    const along = (t) => centroid.map((c, d) => c + t * (simplex[n][d] - c));
    const xr = along(-1); const fr = f(xr);
    if (fr < values[0]) {
      const xe = along(-2); const fe = f(xe);
      if (fe < fr) { simplex[n] = xe; values[n] = fe; } else { simplex[n] = xr; values[n] = fr; }
    } else if (fr < values[n - 1]) { simplex[n] = xr; values[n] = fr; } else {
      const xc = along(0.5); const fc = f(xc);
      if (fc < values[n]) { simplex[n] = xc; values[n] = fc; } else {
        for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, d) => simplex[0][d] + 0.5 * (v - simplex[0][d])); values[i] = f(simplex[i]); }
      }
    }
  }
  const best = values.indexOf(Math.min(...values));
  return { x: simplex[best], value: values[best] };
}

// For a shape g(x) with the ultimate strength factored out, the best Su is closed form.
function bestScale(g, ys) {
  let num = 0; let den = 0;
  for (let i = 0; i < g.length; i++) { num += g[i] * ys[i]; den += g[i] * g[i]; }
  return den > 0 ? num / den : 0;
}

function sse(pred, ys) { return ys.reduce((s, y, i) => s + (y - pred[i]) ** 2, 0); }

export const MODELS = {
  logarithmic: {
    label: 'Logarithmic: S = a + b ln(M)',
    params: 2,
    predict: (p, x) => (x > 0 ? p.a + p.b * Math.log(x) : -Infinity),
    fit(xs, ys) {
      const lx = xs.map(Math.log);
      const n = xs.length;
      const mx = lx.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let sxy = 0; let sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (lx[i] - mx) * (ys[i] - my); sxx += (lx[i] - mx) ** 2; }
      if (sxx === 0) return null;
      const b = sxy / sxx;
      return { a: my - b * mx, b };
    },
  },
  hyperbolic: {
    label: 'Hyperbolic: S = Su·k(M−M0) / (1 + k(M−M0))',
    params: 3,
    predict: (p, x) => { const u = p.k * (x - p.m0); return u > 0 ? p.su * u / (1 + u) : 0; },
    fit(xs, ys) {
      const minX = Math.min(...xs);
      const shape = (lk, z) => {
        const k = Math.exp(lk); const m0 = minX / (1 + Math.exp(-z)) * 0.999;
        return { k, m0, g: xs.map(x => { const u = k * (x - m0); return u > 0 ? u / (1 + u) : 0; }) };
      };
      const loss = ([lk, z]) => { const s = shape(lk, z); const su = bestScale(s.g, ys); return sse(s.g.map(v => su * v), ys); };
      let best = null;
      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
      for (const lk of [-3, -1.5, 0, 1.5, 3].map(d => -Math.log(meanX) + d)) {
        for (const z of [-4, -1, 1]) {
          const r = nelderMead(loss, [lk, z]);
          if (!best || r.value < best.value) best = r;
        }
      }
      const s = shape(best.x[0], best.x[1]);
      const su = bestScale(s.g, ys);
      return { su, k: s.k, m0: s.m0 };
    },
  },
  exponential: {
    label: 'Exponential: S = Su·exp(−(τ/M)^α)',
    params: 3,
    predict: (p, x) => (x > 0 ? p.su * Math.exp(-((p.tau / x) ** p.alpha)) : 0),
    fit(xs, ys) {
      const shape = (lt, la) => { const tau = Math.exp(lt); const alpha = Math.exp(la); return { tau, alpha, g: xs.map(x => Math.exp(-((tau / x) ** alpha))) }; };
      const loss = ([lt, la]) => { const s = shape(lt, la); const su = bestScale(s.g, ys); return sse(s.g.map(v => su * v), ys); };
      let best = null;
      const geo = Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
      for (const lt of [-2, -0.5, 1].map(d => Math.log(geo) + d)) {
        for (const la of [Math.log(0.4), 0, Math.log(2)]) {
          const r = nelderMead(loss, [lt, la]);
          if (!best || r.value < best.value) best = r;
        }
      }
      const s = shape(best.x[0], best.x[1]);
      return { su: bestScale(s.g, ys), tau: s.tau, alpha: s.alpha };
    },
  },
};

/**
 * Fit the strength-maturity relationship.
 * @param {{index:number, strength:number}[]} points calibration specimens
 * @param {'auto'|'logarithmic'|'hyperbolic'|'exponential'} model
 */
export function fitStrength(points, model = 'auto') {
  const pts = points.filter(p => Number.isFinite(p.index) && p.index > 0 && Number.isFinite(p.strength) && p.strength > 0);
  const xs = pts.map(p => p.index);
  const ys = pts.map(p => p.strength);
  const n = pts.length;
  const distinct = new Set(xs).size;
  const fits = [];
  for (const [name, m] of Object.entries(MODELS)) {
    if (distinct < m.params || n < m.params + 1) { fits.push({ name, label: m.label, ok: false, reason: `needs at least ${m.params} different maturities and ${m.params + 1} specimens` }); continue; }
    const p = m.fit(xs, ys);
    if (!p || !Object.values(p).every(Number.isFinite)) { fits.push({ name, label: m.label, ok: false, reason: 'did not converge' }); continue; }
    const pred = xs.map(x => m.predict(p, x));
    const err = sse(pred, ys);
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const sst = ys.reduce((s, y) => s + (y - my) ** 2, 0);
    const k = m.params;
    const r2 = sst > 0 ? 1 - err / sst : 1;
    const rmse = Math.sqrt(err / n);
    const aicc = n * Math.log(Math.max(err, 1e-12) / n) + 2 * k + (n - k - 1 > 0 ? (2 * k * (k + 1)) / (n - k - 1) : Infinity);
    const increasing = m.predict(p, Math.max(...xs) * 2) > m.predict(p, Math.min(...xs));
    fits.push({ name, label: m.label, ok: increasing, reason: increasing ? null : 'fitted curve does not rise with maturity', params: p, r2, rmse, aicc, n });
  }
  const usable = fits.filter(f => f.ok);
  let chosen = null;
  if (model === 'auto') chosen = usable.slice().sort((a, b) => a.aicc - b.aicc)[0] || null;
  else chosen = usable.find(f => f.name === model) || null;
  return { fits, chosen, range: n ? { min: Math.min(...xs), max: Math.max(...xs) } : null, n };
}

export function predictStrength(fit, index) {
  const model = fit && Object.hasOwn(MODELS, fit.name) ? MODELS[fit.name] : null;
  if (!model) return NaN;
  const v = model.predict(fit.params, index);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** Maturity index needed to reach `strength`, or null if the fitted curve never gets there. */
export function indexForStrength(fit, strength) {
  if (!fit || !(strength > 0)) return null;
  const f = x => predictStrength(fit, x);
  let lo = 1e-6; let hi = 1;
  while (f(hi) < strength) { hi *= 2; if (hi > 1e9) return null; }
  for (let i = 0; i < 200; i++) { const mid = Math.sqrt(lo * hi); if (f(mid) < strength) lo = mid; else hi = mid; if (hi / lo < 1 + 1e-12) break; }
  return hi;
}

// ------------------------------------------------------------ estimate

function downsample(xs, maxPoints = 300) {
  if (xs.length <= maxPoints) return xs.map((_, i) => i);
  const step = (xs.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => Math.round(i * step));
}

/**
 * Per sensor: maturity now, estimated strength now, and when it reaches the
 * target strength (from the record, or projected at an assumed temperature).
 */
export function estimate(sensors, fit, opts = {}) {
  const o = { ...DEFAULTS, target: null, futureC: null, recentHours: 24, ...opts };
  const range = opts.range || null;
  const out = sensors.map(s => {
    const ms = maturitySeries(s.hours, s.tempC, o);
    const last = s.hours.length - 1;
    const now = ms.index[last];
    const strengthNow = predictStrength(fit, now);
    const warnings = [];
    if (ms.gaps.length) warnings.push(`${ms.gaps.length} gap(s) longer than ${o.gapHours ?? 6} h between readings; the maturity across each assumes a straight line between the readings either side.`);
    if (ms.hoursAtOrBelowDatum > 0) warnings.push(`${ms.hoursAtOrBelowDatum.toFixed(1)} h at or below the ${o.datumC} °C datum added no maturity.`);
    const tmin = Math.min(...s.tempC); const tmax = Math.max(...s.tempC);
    if (tmin < 0) warnings.push(`Minimum ${tmin.toFixed(1)} °C: concrete that froze early may never reach the strength the maturity predicts.`);
    if (tmax > 60) warnings.push(`Maximum ${tmax.toFixed(1)} °C: high early temperatures can lower later-age strength below what the maturity predicts.`);
    if (range && now > range.max * 1.05) warnings.push('Maturity now is beyond the oldest calibration specimen; the strength is extrapolated.');
    if (range && now < range.min * 0.95 && now > 0) warnings.push('Maturity now is below the youngest calibration specimen; the strength is extrapolated.');

    let reached = null;
    let projected = null;
    if (o.target > 0 && fit) {
      const need = indexForStrength(fit, o.target);
      if (need == null) {
        reached = { status: 'unreachable' };
      } else {
        if (range && need > range.max * 1.05) warnings.push('The target needs more maturity than the oldest calibration specimen had; the time to reach it is extrapolated.');
        const i = ms.index.findIndex(v => v >= need);
        if (i >= 0) {
          const h = i === 0 ? s.hours[0] : s.hours[i - 1] + (need - ms.index[i - 1]) / (ms.index[i] - ms.index[i - 1]) * (s.hours[i] - s.hours[i - 1]);
          reached = { status: 'reached', hour: h, indexNeeded: need };
        } else {
          // Project forward at an assumed constant temperature.
          const since = s.hours[last] - o.recentHours;
          const recent = s.tempC.filter((_, k) => s.hours[k] >= since);
          const assumedC = Number.isFinite(o.futureC) ? o.futureC : recent.reduce((a, b) => a + b, 0) / recent.length;
          const rate = maturityRate(assumedC, o);
          if (rate > 0) {
            const more = (need - now) / rate;
            projected = { status: 'projected', hour: s.hours[last] + more, hoursMore: more, assumedC, indexNeeded: need };
          } else projected = { status: 'stalled', assumedC, indexNeeded: need };
        }
      }
    }
    const keep = downsample(s.hours);
    return {
      name: s.name,
      readings: s.hours.length,
      spanHours: s.hours[last],
      minC: tmin,
      maxC: tmax,
      maturityNow: now,
      strengthNow,
      reached,
      projected,
      warnings,
      curve: keep.map(i => ({ hour: s.hours[i], tempC: s.tempC[i], index: ms.index[i], strength: predictStrength(fit, ms.index[i]) })),
    };
  });
  const governing = out.length ? out.reduce((a, b) => (b.strengthNow < a.strengthNow ? b : a)) : null;
  return { sensors: out, governing: governing?.name ?? null };
}

/** Calibration rows -> points with a maturity index, from age at lab temperature or a logged index. */
export function calibrationPoints(rows, opts = {}) {
  return rows
    .map(r => {
      const strength = Number(r.strength);
      if (Number.isFinite(Number(r.index)) && r.index !== '' && r.index != null) return { index: Number(r.index), strength, ageDays: null };
      const age = Number(r.ageDays);
      return { index: Number.isFinite(age) ? labMaturity(age, opts) : NaN, strength, ageDays: age };
    })
    .filter(p => Number.isFinite(p.index) && Number.isFinite(p.strength));
}

/** Parse "age_days,strength" or "maturity,strength" lines typed or pasted by a person. */
export function parseCalibrationText(text, { column = 'age' } = {}) {
  const rows = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || /^[A-Za-z#]/.test(t)) return;
    const parts = t.split(/[,;\t ]+/).filter(Boolean).map(Number);
    if (parts.length < 2 || !parts.slice(0, 2).every(Number.isFinite)) { errors.push(`Line ${i + 1}: expected two numbers.`); return; }
    rows.push(column === 'index' ? { index: parts[0], strength: parts[1] } : { ageDays: parts[0], strength: parts[1] });
  });
  return { rows, errors };
}

/** Results as CSV, one row per kept reading per sensor. */
export function toCsv(result, strengthUnit = 'psi', opts = {}) {
  const unit = indexUnit(opts);
  const lines = [`sensor,hour,temp_c,maturity_${unit === 'h' ? 'equivalent_age_h' : 'c_h'},estimated_strength_${strengthUnit}`];
  for (const s of result.sensors) {
    for (const p of s.curve) lines.push([JSON.stringify(s.name), p.hour.toFixed(3), p.tempC.toFixed(2), p.index.toFixed(1), p.strength.toFixed(0)].join(','));
  }
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------ example data

/**
 * A made-up record for the demo button: a slab placed at 14:00 on a cold
 * November day, two embedded sensors (one at mid-depth, one near an exposed
 * edge that runs colder), readings every 30 minutes for 5 days. The heat of
 * hydration bump and the day/night swing are shaped to look like a real
 * record; no real project produced these numbers.
 */
export function exampleCsv() {
  const lines = ['Date/Time,Mid-depth (°F),Slab edge (°F)'];
  const start = Date.UTC(2026, 10, 2, 14, 0, 0);
  for (let i = 0; i <= 240; i++) {
    const h = i * 0.5;
    const air = 42 + 9 * Math.sin(((h + 14 - 9) / 24) * 2 * Math.PI); // deg F, warmest mid-afternoon
    const heat = 34 * (h / 14) * Math.exp(1 - h / 14); // hydration bump peaking near 14 h
    const mid = 0.55 * air + 0.45 * 60 + heat * (1 - Math.exp(-h / 3));
    const edge = 0.75 * air + 0.25 * 55 + 0.55 * heat * (1 - Math.exp(-h / 3));
    const d = new Date(start + h * 3600000);
    const stamp = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${((d.getUTCHours() + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, '0')} ${d.getUTCHours() < 12 ? 'AM' : 'PM'}`;
    lines.push(`${stamp},${mid.toFixed(1)},${edge.toFixed(1)}`);
  }
  return lines.join('\n') + '\n';
}

/** Made-up lab breaks for the demo: two cylinders at each age, psi, moist-cured at 23 deg C. */
export const EXAMPLE_CALIBRATION = '1, 1180\n1, 1240\n3, 2510\n3, 2440\n7, 3420\n7, 3510\n14, 4120\n14, 4060\n28, 4580\n28, 4650\n';
