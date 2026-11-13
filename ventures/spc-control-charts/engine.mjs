// Shewhart control charts, the eight Nelson run rules and process capability.
//
// Everything here is plain arithmetic with no dependencies so the page, the
// CLI and the tests share one engine. The bias-correction constants (d2, d3,
// c4) are computed from their definitions rather than copied from a table;
// spc.test.mjs checks them against the published three- and four-decimal
// tables (ASTM E2587, Montgomery's appendix) and against a seeded simulation.

// ---------------------------------------------------------------- normal CDF
// Hart (1968) double-precision rational approximation, as given by West,
// "Better approximations to cumulative normal functions" (2005). Absolute
// error is around 1e-14 across the line.
export function normCdf(x) {
  const a = Math.abs(x);
  let c;
  if (a > 37) c = 0;
  else {
    const e = Math.exp(-a * a / 2);
    if (a < 7.07106781186547) {
      let b = 3.52624965998911e-2 * a + 0.700383064443688;
      b = b * a + 6.37396220353165;
      b = b * a + 33.912866078383;
      b = b * a + 112.079291497871;
      b = b * a + 221.213596169931;
      b = b * a + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * a + 1.75566716318264;
      b = b * a + 16.064177579207;
      b = b * a + 86.7807322029461;
      b = b * a + 296.564248779674;
      b = b * a + 637.333633378831;
      b = b * a + 793.826512519948;
      b = b * a + 440.413735824752;
      c /= b;
    } else {
      let b = a + 0.65;
      b = a + 4 / b;
      b = a + 3 / b;
      b = a + 2 / b;
      b = a + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

const normPdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

// Lanczos log-gamma (g = 7, nine terms), good to ~1e-15 relative for x > 0.
const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let s = LG[0];
  for (let i = 1; i < 9; i++) s += LG[i] / (x + i);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s);
}

// ---------------------------------------------------------------- constants
export const MIN_N = 2;
export const MAX_N = 25;

// c4(n) = E[s]/sigma for a normal sample of n: sqrt(2/(n-1)) G(n/2) / G((n-1)/2).
export function c4(n) {
  return Math.sqrt(2 / (n - 1)) * Math.exp(lgamma(n / 2) - lgamma((n - 1) / 2));
}

// Grid shared by the range integrals: x in [-L, L] with step H. Phi and phi
// are tabulated once so x + w lands on a grid point when w is a multiple of H.
const H = 0.01, L = 9, NG = Math.round(2 * L / H);
let PHI = null, PDF = null;
function grid() {
  if (PHI) return;
  PHI = new Float64Array(NG + 1);
  PDF = new Float64Array(NG + 1);
  for (let i = 0; i <= NG; i++) { const x = -L + i * H; PHI[i] = normCdf(x); PDF[i] = normPdf(x); }
}
const simpsonW = (i, n) => (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);

const cache = new Map();
// d2(n) = E[R]/sigma = integral of 1 - Phi^n - (1 - Phi)^n over the line.
// d3(n) = sd(R)/sigma, from E[R^2] = 2 * integral_0^inf w P(R > w) dw with
// P(R <= w) = n * integral phi(x) [Phi(x + w) - Phi(x)]^(n-1) dx.
export function rangeConstants(n) {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) throw new RangeError(`subgroup size must be a whole number from ${MIN_N} to ${MAX_N}`);
  if (cache.has(n)) return cache.get(n);
  grid();
  let d2 = 0;
  for (let i = 0; i <= NG; i++) d2 += simpsonW(i, NG) * (1 - PHI[i] ** n - (1 - PHI[i]) ** n);
  d2 *= H / 3;
  // w = k * H for k = 0 .. NW (w up to 16 sigma, where P(R > w) < 1e-13 for
  // n <= 25). Phi beyond the right end of the grid is 1.
  const NW = 1600;
  let m2 = 0;
  for (let k = 0; k <= NW; k++) {
    let cdf = 0;
    for (let i = 0; i <= NG; i++) {
      const up = i + k <= NG ? PHI[i + k] : 1;
      cdf += simpsonW(i, NG) * PDF[i] * (up - PHI[i]) ** (n - 1);
    }
    cdf = Math.min(1, n * cdf * H / 3);
    m2 += simpsonW(k, NW) * k * H * (1 - cdf);
  }
  m2 *= 2 * H / 3;
  const d3 = Math.sqrt(Math.max(0, m2 - d2 * d2));
  const out = { n, d2, d3 };
  cache.set(n, out);
  return out;
}

// The usual chart factors, all derived from d2, d3 and c4.
export function factors(n) {
  const { d2, d3 } = rangeConstants(n);
  const c = c4(n);
  const sc = Math.sqrt(1 - c * c) / c;
  return {
    n, d2, d3, c4: c,
    A2: 3 / (d2 * Math.sqrt(n)),
    A3: 3 / (c * Math.sqrt(n)),
    D3: Math.max(0, 1 - 3 * d3 / d2),
    D4: 1 + 3 * d3 / d2,
    B3: Math.max(0, 1 - 3 * sc),
    B4: 1 + 3 * sc,
    E2: 3 / d2,
  };
}

// ---------------------------------------------------------------- parsing
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

// One subgroup (or one count) per line. An optional label comes first and
// ends with a colon: "Mon 3 Nov: 10.2, 10.4, 9.9". Blank lines and lines
// starting with # are skipped.
export function parseRows(text) {
  const rows = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    let label = null, body = line;
    const colon = line.lastIndexOf(":");
    if (colon >= 0) { label = line.slice(0, colon).trim(); body = line.slice(colon + 1); }
    const parts = body.split(/[\s,;\t]+/).filter(Boolean);
    const bad = parts.find((p) => !NUM.test(p));
    if (bad !== undefined) { errors.push(`Line ${i + 1}: "${bad}" is not a number`); return; }
    if (!parts.length) { errors.push(`Line ${i + 1}: no values`); return; }
    rows.push({ line: i + 1, label: label || String(rows.length + 1), values: parts.map(Number) });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------- statistics
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
const range = (a) => Math.max(...a) - Math.min(...a);

// ---------------------------------------------------------------- Nelson rules
export const RULES = [
  { id: 1, text: "One point more than 3 sigma from the centre line" },
  { id: 2, text: "Nine points in a row on the same side of the centre line" },
  { id: 3, text: "Six points in a row steadily increasing or decreasing" },
  { id: 4, text: "Fourteen points in a row alternating up and down" },
  { id: 5, text: "Two of three points in a row more than 2 sigma from the centre, same side" },
  { id: 6, text: "Four of five points in a row more than 1 sigma from the centre, same side" },
  { id: 7, text: "Fifteen points in a row within 1 sigma of the centre line" },
  { id: 8, text: "Eight points in a row more than 1 sigma from the centre, either side" },
];

// z[i] is the point's distance from the centre in its own sigma units (so
// charts with per-point limits, p and u, use the same code). null = skip
// (an excluded point still plots but breaks no run and starts none).
// Returns, for each point, the list of rules whose pattern it completes.
// A pattern is flagged on its last point, and only if that point belongs to
// it (for rules 5 and 6 the last point is itself beyond the zone line).
export function nelson(z, enabled = [1, 2, 3, 4, 5, 6, 7, 8], v = null) {
  const on = new Set(enabled);
  const out = z.map(() => []);
  const idx = [];
  z.forEach((zi, i) => { if (zi !== null && Number.isFinite(zi)) idx.push(i); });
  const val = v || z; // rules 3 and 4 look at the plotted values' direction
  const Z = idx.map((i) => z[i]);
  const V = idx.map((i) => val[i]);
  const EPS = 1e-12;
  const side = (q) => (q > EPS ? 1 : q < -EPS ? -1 : 0);
  for (let k = 0; k < Z.length; k++) {
    const flag = (r) => out[idx[k]].push(r);
    if (on.has(1) && Math.abs(Z[k]) > 3) flag(1);
    if (on.has(2) && k >= 8) {
      const s = side(Z[k]);
      if (s !== 0 && Z.slice(k - 8, k + 1).every((q) => side(q) === s)) flag(2);
    }
    if (on.has(3) && k >= 5) {
      let up = true, down = true;
      for (let j = k - 4; j <= k; j++) { if (!(V[j] > V[j - 1])) up = false; if (!(V[j] < V[j - 1])) down = false; }
      if (up || down) flag(3);
    }
    if (on.has(4) && k >= 13) {
      let ok = true;
      for (let j = k - 11; j <= k; j++) { // 14 points, 13 steps
        const a = Math.sign(V[j - 1] - V[j - 2]), b = Math.sign(V[j] - V[j - 1]);
        if (a === 0 || b === 0 || a === b) { ok = false; break; }
      }
      if (ok) flag(4);
    }
    for (const [rule, len, need, lim] of [[5, 3, 2, 2], [6, 5, 4, 1]]) {
      if (!on.has(rule) || k < len - 1) continue;
      const s = side(Z[k]);
      if (Math.abs(Z[k]) <= lim) continue;
      const win = Z.slice(k - len + 1, k + 1);
      if (win.filter((q) => side(q) === s && Math.abs(q) > lim).length >= need) flag(rule);
    }
    if (on.has(7) && k >= 14 && Z.slice(k - 14, k + 1).every((q) => Math.abs(q) < 1)) flag(7);
    if (on.has(8) && k >= 7 && Z.slice(k - 7, k + 1).every((q) => Math.abs(q) > 1)) flag(8);
  }
  return out;
}

// ---------------------------------------------------------------- charts
export const CHART_TYPES = ["imr", "xbar-r", "xbar-s", "means-imr", "p", "np", "c", "u"];
export const CHART_NAMES = {
  imr: "Individuals and moving range (I-MR)",
  "xbar-r": "Averages and ranges (X-bar and R)",
  "xbar-s": "Averages and standard deviations (X-bar and S)",
  "means-imr": "Subgroup averages as individuals (I-MR of averages)",
  p: "Proportion defective (p)",
  np: "Number defective (np)",
  c: "Count of defects (c)",
  u: "Defects per unit (u)",
};

// Guess the chart from the shape of the data.
export function suggestType(rows) {
  if (!rows.length) return "imr";
  const sizes = new Set(rows.map((r) => r.values.length));
  if (sizes.size === 1 && rows[0].values.length === 1) return "imr";
  return rows[0].values.length >= 10 ? "xbar-s" : "xbar-r";
}

function limitsFor(points, cl, sig, k = 3) {
  return points.map((p, i) => {
    const s = Array.isArray(sig) ? sig[i] : sig;
    return { cl, ucl: cl + k * s, lcl: cl - k * s, sigma: s };
  });
}

function finishChart(name, values, limits, rules, labels, opts = {}) {
  const z = values.map((v, i) => (opts.excluded?.has(i) || !(limits[i].sigma > 0) ? null : (v - limits[i].cl) / limits[i].sigma));
  const flags = nelson(z, rules, values);
  // A lower limit below zero on a chart of a non-negative statistic is shown as 0.
  const lims = limits.map((l) => ({ ...l, lcl: opts.floor0 ? Math.max(0, l.lcl) : l.lcl }));
  return {
    name,
    points: values.map((v, i) => ({ i, label: labels[i], value: v, ...lims[i], excluded: Boolean(opts.excluded?.has(i)), rules: flags[i] })),
  };
}

// Phase I: compute the limits from the points not excluded. With `revise`,
// points flagged by rule 1 (on either chart; on I-MR the individuals chart) are dropped and the limits
// recomputed until none remain (at most `maxRevisions` passes); the dropped
// points still plot.
export function analyse(input) {
  const { type, rows, rules = [1, 2, 3, 4, 5, 6, 7, 8], exclude = [], revise = false, maxRevisions = 10, n: fixedN } = input;
  if (!CHART_TYPES.includes(type)) throw new Error(`unknown chart type ${type}`);
  const excluded = new Set(exclude.filter((i) => i >= 0 && i < rows.length));
  const dropped = [];
  let res;
  for (let pass = 0; pass <= maxRevisions; pass++) {
    res = build(type, rows, rules, excluded, fixedN);
    if (!revise) break;
    const out = new Set();
    // A moving range spans two points, so on I-MR only the individuals chart
    // decides which point to drop.
    const judges = type === "imr" || type === "means-imr" ? res.charts.slice(0, 1) : res.charts;
    for (const ch of judges) for (const p of ch.points) if (!p.excluded && p.rules.includes(1)) out.add(p.i);
    if (!out.size) break;
    if (pass === maxRevisions) { res.warnings.push(`Stopped revising after ${maxRevisions} passes; points are still out of limits.`); break; }
    for (const i of out) { excluded.add(i); dropped.push(i); }
  }
  res.excluded = [...excluded].sort((a, b) => a - b);
  res.revisedOut = dropped.sort((a, b) => a - b);
  res.signals = summarise(res.charts);
  res.inControl = res.signals.length === 0;
  return res;
}

function summarise(charts) {
  const out = [];
  for (const ch of charts) for (const p of ch.points) for (const r of p.rules) out.push({ chart: ch.name, i: p.i, label: p.label, value: p.value, rule: r });
  return out;
}

function build(type, rows, rules, excluded, fixedN) {
  const warnings = [];
  const labels = rows.map((r) => r.label);
  const keep = (arr) => arr.filter((_, i) => !excluded.has(i));
  if (keep(rows).length < 2) throw new Error("need at least two points that are not excluded");
  const variable = type === "imr" || type === "means-imr" || type === "xbar-r" || type === "xbar-s";
  if (variable && keep(rows).length < 20) warnings.push(`Only ${keep(rows).length} points set the limits; 20 to 25 subgroups (or 100 individual values) is the usual minimum for trial limits.`);

  if (type === "imr" || type === "means-imr") {
    if (type === "imr" && rows.some((r) => r.values.length !== 1)) throw new Error("individuals charts take one value per line; for several values per line use X-bar R, X-bar S or averages as individuals");
    // Averages as individuals: each subgroup's mean is one point and the
    // limits come from the moving range of the means, so they include any
    // variation between subgroups that the within-subgroup range leaves out.
    const x = rows.map((r) => mean(r.values));
    // Moving range i is |x_i - x_{i-1}|; it is skipped if either point is excluded.
    const mr = x.map((v, i) => (i === 0 ? null : Math.abs(v - x[i - 1])));
    const mrUsed = mr.filter((v, i) => v !== null && !excluded.has(i) && !excluded.has(i - 1));
    if (!mrUsed.length) throw new Error("need two neighbouring points that are not excluded");
    const mrBar = mean(mrUsed);
    const f = factors(2);
    const sigma = mrBar / f.d2;
    const xBar = mean(keep(x));
    const iChart = finishChart(type === "imr" ? "Individuals" : "Subgroup averages", x, limitsFor(x, xBar, sigma), rules, labels, { excluded });
    const mrVals = mr.map((v) => (v === null ? NaN : v));
    const mrLim = mr.map(() => ({ cl: mrBar, ucl: f.D4 * mrBar, lcl: f.D3 * mrBar, sigma: f.d3 * sigma }));
    const mrChart = dispersion("Moving range", mrVals, mrLim, labels, (i) => i === 0 || excluded.has(i) || excluded.has(i - 1));
    if (type === "means-imr") return { type, charts: [iChart, mrChart], sigmaMeans: sigma, center: xBar, n: rows[0].values.length, warnings };
    return { type, charts: [iChart, mrChart], sigmaWithin: sigma, center: xBar, n: 1, all: keep(x), warnings };
  }

  if (type === "xbar-r" || type === "xbar-s") {
    const n = rows[0].values.length;
    if (rows.some((r) => r.values.length !== n)) throw new Error(`every subgroup needs the same number of values (the first has ${n}); split or trim unequal subgroups`);
    if (n < MIN_N || n > MAX_N) throw new Error(`subgroups of ${MIN_N} to ${MAX_N} values; for one value per line use the individuals chart`);
    const f = factors(n);
    const xb = rows.map((r) => mean(r.values));
    const xbb = mean(keep(xb));
    let sigma, disp;
    if (type === "xbar-r") {
      const R = rows.map((r) => range(r.values));
      const rBar = mean(keep(R));
      sigma = rBar / f.d2;
      disp = dispersion("Range", R, R.map(() => ({ cl: rBar, ucl: f.D4 * rBar, lcl: f.D3 * rBar, sigma: f.d3 * sigma })), labels, (i) => excluded.has(i));
    } else {
      const S = rows.map((r) => sd(r.values));
      const sBar = mean(keep(S));
      sigma = sBar / f.c4;
      disp = dispersion("Standard deviation", S, S.map(() => ({ cl: sBar, ucl: f.B4 * sBar, lcl: f.B3 * sBar, sigma: sigma * Math.sqrt(1 - f.c4 ** 2) })), labels, (i) => excluded.has(i));
    }
    const xChart = finishChart("Averages", xb, limitsFor(xb, xbb, sigma / Math.sqrt(n)), rules, labels, { excluded });
    // How much do the averages move from one subgroup to the next, against
    // what the spread inside a subgroup predicts? (MR-bar of the averages /
    // d2(2), over sigma-within / sqrt(n); about 1 when subgroups differ only
    // by chance.) A descriptive ratio, not a test.
    const mrs = xb.map((v, i) => (i === 0 || excluded.has(i) || excluded.has(i - 1) ? null : Math.abs(v - xb[i - 1]))).filter((v) => v !== null);
    const between = mrs.length ? mean(mrs) / factors(2).d2 : null;
    const ratio = between !== null && sigma > 0 ? between / (sigma / Math.sqrt(n)) : null;
    return { type, charts: [xChart, disp], sigmaWithin: sigma, center: xbb, n, all: keep(rows).flatMap((r) => r.values), sigmaMeans: between, betweenRatio: ratio, warnings };
  }

  // Attribute charts. p, np and u lines are "count, sample size"; c lines are "count".
  if (type === "c") {
    if (rows.some((r) => r.values.length !== 1)) throw new Error("c charts take one count per line");
  } else if (type === "np" && fixedN) {
    if (rows.some((r) => r.values.length !== 1 && r.values.length !== 2)) throw new Error("np lines are a count, or a count and the sample size");
  } else if (rows.some((r) => r.values.length !== 2)) throw new Error(`${type} lines are "count, sample size"`);
  const cnt = rows.map((r) => r.values[0]);
  if (cnt.some((v) => v < 0 || !Number.isInteger(v))) throw new Error("counts must be whole numbers, zero or more");
  const size = rows.map((r) => (r.values.length === 2 ? r.values[1] : type === "c" ? 1 : fixedN));
  if (size.some((v) => !(v > 0))) throw new Error("every sample size must be above zero");
  if ((type === "p" || type === "np") && cnt.some((v, i) => v > size[i])) throw new Error("a count of defectives cannot exceed its sample size");
  if (type === "np" && new Set(size).size > 1) throw new Error("np charts need one sample size; with varying sizes use a p chart");
  const sumC = keep(cnt).reduce((s, v) => s + v, 0), sumN = keep(size).reduce((s, v) => s + v, 0);
  let values, lim, name;
  if (type === "p" || type === "np") {
    const pBar = sumC / sumN;
    if (pBar === 0 || pBar === 1) warnings.push("Every sample is all good or all bad, so the limits collapse onto the centre line.");
    if (type === "p") {
      name = "Proportion defective";
      values = cnt.map((v, i) => v / size[i]);
      lim = size.map((m) => { const s = Math.sqrt(pBar * (1 - pBar) / m); return { cl: pBar, ucl: Math.min(1, pBar + 3 * s), lcl: pBar - 3 * s, sigma: s }; });
    } else {
      name = "Number defective";
      values = cnt;
      const m = size[0], s = Math.sqrt(m * pBar * (1 - pBar));
      lim = cnt.map(() => ({ cl: m * pBar, ucl: Math.min(m, m * pBar + 3 * s), lcl: m * pBar - 3 * s, sigma: s }));
    }
    if (sumN / keep(size).length * pBar < 5) warnings.push("Average defectives per sample is under 5; the 3-sigma limits rest on a normal approximation that is rough here, so treat rules 2 to 8 with care.");
  } else {
    const uBar = sumC / sumN;
    name = type === "c" ? "Defects" : "Defects per unit";
    values = cnt.map((v, i) => v / size[i]);
    lim = size.map((m) => { const s = Math.sqrt(uBar / m); return { cl: uBar, ucl: uBar + 3 * s, lcl: uBar - 3 * s, sigma: s }; });
    if (uBar * mean(keep(size)) < 5) warnings.push("Average count per sample is under 5; the 3-sigma limits rest on a normal approximation that is rough here, so treat rules 2 to 8 with care.");
  }
  const ch = finishChart(name, values, lim, rules, labels, { excluded, floor0: true });
  return { type, charts: [ch], warnings, center: lim[0].cl };
}

// Range, S and moving-range charts get rule 1 only: their distributions are
// skewed and their zone lines are not where the run rules assume.
function dispersion(name, values, lim, labels, skip) {
  return {
    name,
    points: values.map((v, i) => {
      const s = skip(i) || Number.isNaN(v);
      const rules = !s && (v > lim[i].ucl + 1e-12 || v < lim[i].lcl - 1e-12) ? [1] : [];
      return { i, label: labels[i], value: Number.isNaN(v) ? null : v, ...lim[i], excluded: skip(i) && !Number.isNaN(v), rules };
    }),
  };
}

// ---------------------------------------------------------------- capability
// Cp and Cpk use the within-subgroup sigma from the chart (R-bar/d2,
// S-bar/c4, or MR-bar/d2); Pp and Ppk the overall sample standard deviation.
// The lower 95% bound on Cpk is Bissell's (1990) normal approximation.
export function capability(res, spec) {
  const { lsl, usl } = spec;
  const hasL = Number.isFinite(lsl), hasU = Number.isFinite(usl);
  if (!hasL && !hasU) return null;
  if (hasL && hasU && !(usl > lsl)) throw new Error("the upper spec limit must be above the lower");
  if (!res.all) throw new Error("capability needs single measurements: use an individuals, X-bar R or X-bar S chart");
  const N = res.all.length;
  const mu = mean(res.all);
  const sw = res.sigmaWithin, so = sd(res.all);
  const idx = (s) => ({
    p: hasL && hasU ? (usl - lsl) / (6 * s) : null,
    pu: hasU ? (usl - mu) / (3 * s) : null,
    pl: hasL ? (mu - lsl) / (3 * s) : null,
  });
  const w = idx(sw), o = idx(so);
  const k = (x) => Math.min(...[x.pu, x.pl].filter((v) => v !== null));
  const cpk = k(w), ppk = k(o);
  const ppm = (s) => 1e6 * ((hasL ? normCdf((lsl - mu) / s) : 0) + (hasU ? 1 - normCdf((usl - mu) / s) : 0));
  const observed = 1e6 * res.all.filter((v) => (hasL && v < lsl) || (hasU && v > usl)).length / N;
  const cpkLower = cpk - 1.6448536269514722 * Math.sqrt(1 / (9 * N) + cpk * cpk / (2 * (N - 1)));
  const warnings = [];
  if (!res.inControl) warnings.push("The chart shows signals. Capability describes a stable process; until the causes are found and the limits recomputed, these figures are not a prediction.");
  if (N < 50) warnings.push(`Only ${N} measurements; the confidence bound on Cpk is wide.`);
  return {
    N, mean: mu, sigmaWithin: sw, sigmaOverall: so,
    cp: w.p, cpu: w.pu, cpl: w.pl, cpk,
    pp: o.p, ppu: o.pu, ppl: o.pl, ppk,
    cpkLower95: cpkLower,
    ppmWithin: ppm(sw), ppmOverall: ppm(so), ppmObserved: observed,
    warnings,
  };
}

// ---------------------------------------------------------------- export
export function toCsv(res) {
  // Labels are pasted text: a cell starting =, +, -, @, tab or CR is prefixed
  // with an apostrophe so a spreadsheet does not run it as a formula
  // (plain negative numbers are left alone).
  const q = (c) => {
    let s = String(c);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ["chart,point,label,value,lcl,cl,ucl,excluded,rules"];
  for (const ch of res.charts) for (const p of ch.points) {
    const f = (v) => (v === null || v === undefined || Number.isNaN(v) ? "" : String(+v.toPrecision(10)));
    lines.push([ch.name, p.i + 1, p.label, f(p.value), f(p.lcl), f(p.cl), f(p.ucl), p.excluded ? "yes" : "", p.rules.join(" ")].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- seeded randomness (tests and bench)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// ---------------------------------------------------------------- tool API
export const PAPERS = [
  {
    authors: "Walter A. Shewhart",
    title: "Economic Control of Quality of Manufactured Product",
    venue: "D. Van Nostrand, New York",
    year: 1931,
    url: "https://archive.org/search?query=Economic+Control+of+Quality+of+Manufactured+Product",
    implemented: "Three-sigma control limits around the centre line for averages, ranges, standard deviations, individuals, proportions and counts, with sigma estimated from within-subgroup variation (R-bar/d2, S-bar/c4, MR-bar/d2).",
    deviations: "Limits are trial (Phase I) limits computed from the pasted data; there is no Phase II mode with limits typed in from an earlier study yet.",
  },
  {
    authors: "Lloyd S. Nelson",
    title: "The Shewhart Control Chart: Tests for Special Causes",
    venue: "Journal of Quality Technology 16(4), 237-239",
    year: 1984,
    url: "https://www.tandfonline.com/toc/ujqt20/16/4",
    implemented: "The eight run rules (one beyond 3 sigma; nine on one side; six trending; fourteen alternating; two of three beyond 2 sigma; four of five beyond 1 sigma; fifteen within 1 sigma; eight beyond 1 sigma), each switchable, applied to the location chart.",
    deviations: "Range, S and moving-range charts get rule 1 only, as their distributions are skewed. On p and u charts with varying sample sizes the zones are per point (z-scores).",
  },
  {
    authors: "L. H. C. Tippett",
    title: "On the Extreme Individuals and the Range of Samples Taken from a Normal Population",
    venue: "Biometrika 17(3/4), 364-387",
    year: 1925,
    url: "https://www.jstor.org/action/doBasicSearch?Query=Tippett+extreme+individuals+range+samples+normal+population",
    implemented: "d2 (mean range) and d3 (standard deviation of the range) of a normal sample, computed here by numerical integration of the range distribution rather than read from a table.",
    deviations: "None; values agree with the published three-decimal tables for n = 2 to 25.",
  },
  {
    authors: "A. F. Bissell",
    title: "How Reliable is Your Capability Index?",
    venue: "Journal of the Royal Statistical Society, Series C (Applied Statistics) 39(3), 331-340",
    year: 1990,
    url: "https://www.jstor.org/action/doBasicSearch?Query=Bissell+How+Reliable+is+Your+Capability+Index",
    implemented: "Approximate lower 95% confidence bound on Cpk: Cpk - 1.645 sqrt(1/(9N) + Cpk^2/(2(N-1))).",
    deviations: "N is the number of measurements; with sigma from subgroup ranges the effective degrees of freedom are fewer, so the bound is somewhat optimistic.",
  },
  {
    authors: "Steven E. Rigdon, Emma N. Cruthis and Charles W. Champ",
    title: "Design Strategies for Individuals and Moving Range Control Charts",
    venue: "Journal of Quality Technology 26(4), 274-287",
    year: 1994,
    url: "https://www.tandfonline.com/toc/ujqt20/26/4",
    implemented: "Cited for the finding that the moving-range chart adds little detection power beside the individuals chart; the page says how often it false-alarms (bench/false-alarms.json).",
    deviations: "The moving-range chart is still drawn and checked, and its signals are listed separately.",
  },
];

export const DEFAULTS = {
  type: "auto",
  rules: [1, 2, 3, 4, 5, 6, 7, 8],
  exclude: [],
  revise: false,
  n: null,
  lsl: null,
  usl: null,
};

const fmt = (v) => (v === null || v === undefined ? "" : Math.abs(v) >= 1000 || Math.abs(v) < 0.01 ? Number(v.toPrecision(4)).toString() : Number(v.toFixed(4)).toString());

// One call for the CLI, the agent bridge and the page: text (or rows) in,
// limits, signals, capability and a plain-language summary out.
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  let rows = o.rows, errors = [];
  if (!rows) ({ rows, errors } = parseRows(o.text ?? o.csv ?? ""));
  if (errors.length) throw new Error(errors.slice(0, 5).join("; "));
  if (rows.length < 2) throw new Error("Paste at least two lines of data: one subgroup, value or count per line.");
  if (rows.length > 5000) throw new Error("Up to 5,000 points at a time.");
  const type = o.type === "auto" || !o.type ? suggestType(rows) : o.type;
  const exclude = (o.exclude || []).map((i) => i - 1); // 1-based in, 0-based inside
  const res = analyse({ type, rows, rules: o.rules, exclude, revise: o.revise, n: o.n });
  const spec = { lsl: o.lsl === null || o.lsl === "" ? NaN : Number(o.lsl), usl: o.usl === null || o.usl === "" ? NaN : Number(o.usl) };
  const cap = res.all && (Number.isFinite(spec.lsl) || Number.isFinite(spec.usl)) ? capability(res, spec) : null;
  const main = res.charts[0];
  const flagged = new Set(res.signals.map((s) => s.i));
  const byChart = new Map();
  for (const s of res.signals) {
    if (!byChart.has(s.chart)) byChart.set(s.chart, {});
    const m = byChart.get(s.chart);
    m[s.rule] = (m[s.rule] || 0) + 1;
  }
  const p0 = main.points.find((p) => !p.excluded) || main.points[0];
  const perPoint = main.points.some((p) => Math.abs(p.ucl - p0.ucl) > 1e-12);
  const lines = [];
  lines.push(`${CHART_NAMES[type]}, ${rows.length} points. Centre ${fmt(p0.cl)}; ${perPoint ? "limits vary with sample size" : `limits ${fmt(p0.lcl)} to ${fmt(p0.ucl)}`}.`);
  if (!res.signals.length) lines.push("No point breaks a rule that is switched on: nothing here says the process changed.");
  else {
    const first = res.signals[0];
    lines.push(`${flagged.size} point${flagged.size === 1 ? "" : "s"} signal (${[...byChart].map(([ch, m]) => `${ch.toLowerCase()} chart ${Object.entries(m).map(([r, c]) => `rule ${r} x${c}`).join(", ")}`).join("; ")}). First: ${first.label} on the ${first.chart.toLowerCase()} chart, rule ${first.rule} (${RULES[first.rule - 1].text.toLowerCase()}).`);
  }
  if (res.revisedOut?.length) lines.push(`Limits recomputed without ${res.revisedOut.length} point${res.revisedOut.length === 1 ? "" : "s"} beyond 3 sigma (still plotted).`);
  if (res.betweenRatio && res.betweenRatio > 1.5 && rows.length >= 10) lines.push(`The averages move ${res.betweenRatio.toFixed(1)} times as much from subgroup to subgroup as the spread inside a subgroup predicts. If that between-subgroup variation is part of normal running (batches, wafers, shifts), the X-bar limits are too tight for it: chart the averages as individuals as well.`);
  if (cap) lines.push(`Capability: Cpk ${cap.cpk.toFixed(2)} (95% lower bound ${cap.cpkLower95.toFixed(2)}), Ppk ${cap.ppk.toFixed(2)}; about ${Math.round(cap.ppmOverall).toLocaleString("en-US")} parts per million outside spec on the overall spread.`);
  return { ...res, type, typeName: CHART_NAMES[type], capability: cap, summary: lines.join(" ") };
}
