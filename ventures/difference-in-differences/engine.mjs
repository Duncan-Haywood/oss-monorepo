// Difference-in-differences with staggered adoption: group-time effects
// (Callaway & Sant'Anna 2021), their event-study and overall aggregations,
// the two-way fixed effects regression and its Goodman-Bacon (2021)
// decomposition. Pure functions, no DOM, no network, seeded randomness only.
// Implemented from the papers' definitions; no third-party code was ported.

export const PAPERS = [
  {
    authors: "Brantly Callaway, Pedro H. C. Sant'Anna",
    title: "Difference-in-Differences with Multiple Time Periods",
    venue: "Journal of Econometrics 225(2), 200-230",
    year: 2021,
    url: "https://doi.org/10.1016/j.jeconom.2020.12.001",
    doi: "10.1016/j.jeconom.2020.12.001",
    implemented: "Group-time average treatment effects ATT(g,t) under unconditional parallel trends, with never-treated or not-yet-treated units as controls, a varying or universal base period and an anticipation window; their influence functions; the simple, event-time (dynamic) and cohort aggregations including the estimation effect of the cohort-share weights; a Wald pre-test of the pre-treatment ATT(g,t); a multiplier bootstrap (Mammen weights) for simultaneous event-study bands.",
    deviations: "No covariates, so the doubly robust, outcome-regression and inverse-probability estimators all reduce to the same unconditional difference of mean changes. Balanced panels only (units missing a period are dropped). Pointwise standard errors are analytical from the influence function; the bootstrap is used only for the simultaneous band's critical value, standardised by the analytical standard errors.",
  },
  {
    authors: "Andrew Goodman-Bacon",
    title: "Difference-in-Differences with Variation in Treatment Timing",
    venue: "Journal of Econometrics 225(2), 254-277",
    year: 2021,
    url: "https://doi.org/10.1016/j.jeconom.2021.03.014",
    doi: "10.1016/j.jeconom.2021.03.014",
    implemented: "The decomposition of the two-way fixed effects DiD coefficient into every 2x2 comparison (treated vs never treated, earlier vs later-treated controls, later vs already-treated controls) with its weight, from the sample shares and the variance of treatment within each pair.",
    deviations: "None for a balanced panel with no covariates. The weights are checked to sum to one and to reproduce the regression coefficient exactly.",
  },
  {
    authors: "David Card, Alan B. Krueger",
    title: "Minimum Wages and Employment: A Case Study of the Fast-Food Industry in New Jersey and Pennsylvania",
    venue: "American Economic Review 84(4), 772-793",
    year: 1994,
    url: "https://www.jstor.org/stable/2118030",
    implemented: "The canonical 2x2 design (one treated group, one comparison group, before and after) that every ATT(g,t) is built from.",
    deviations: "Cited for the design only; their data are not used.",
  },
  {
    authors: "Cheng Cheng, Mark Hoekstra",
    title: "Does Strengthening Self-Defense Law Deter Crime or Escalate Violence? Evidence from Expansions to Castle Doctrine",
    venue: "Journal of Human Resources 48(3), 821-854",
    year: 2013,
    url: "https://doi.org/10.3368/jhr.48.3.821",
    doi: "10.3368/jhr.48.3.821",
    implemented: "Source of the example panel (state homicide rates from FBI Uniform Crime Reports, 2000-2010, and the year each state's castle-doctrine law took effect).",
    deviations: "The example uses the unweighted log homicide rate with no covariates or region-by-year effects, so it is a teaching example, not a replication of the paper's specification.",
  },
];

export const DEFAULTS = { control: "never", base: "varying", anticipation: 0, alpha: 0.05, bootstrap: 999, seed: 20211, minCohort: 1 };

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("The CSV is empty.");
  const header = rows[0].map((h) => h.trim());
  return { header, records: rows.slice(1).map((r) => Object.fromEntries(header.map((h, j) => [h, (r[j] ?? "").trim()]))) };
}

export const num = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const t = String(v).trim();
  if (t === "" || /^(na|nan|null|-)$/i.test(t)) return NaN;
  return Number(t.replace(/,/g, ""));
};

const NEVER = /^(|0|never|none|inf|infinity|na|nan|null|-)$/i;

// ---------- numerics ----------

export function normalCdf(x) {
  // Abramowitz & Stegun 7.1.26 is too coarse for p-values; use erfc by continued fraction / series.
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 3) {
    // erf series: erf(x) = 2/sqrt(pi) * sum (-1)^n x^(2n+1) / (n! (2n+1))
    let sum = 0, term = x, n = 0;
    while (Math.abs(term) > 1e-17 * Math.abs(sum) || n < 3) {
      sum += term / (2 * n + 1);
      n++;
      term *= (-x * x) / n;
      if (n > 200) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  // continued fraction (Lentz) for large x
  const tiny = 1e-300;
  let f = x, C = x, D = 0;
  for (let i = 1; i < 300; i++) {
    const a = i / 2;
    D = x + a * D; D = Math.abs(D) < tiny ? tiny : D; D = 1 / D;
    C = x + a / C; C = Math.abs(C) < tiny ? tiny : C;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (f * Math.sqrt(Math.PI));
}

function logGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Upper tail of chi-square with k degrees of freedom: Q(k/2, x/2).
export function chi2Sf(x, k) {
  if (!(x > 0)) return 1;
  const a = k / 2, z = x / 2;
  if (z < a + 1) {
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 1000; n++) { term *= z / (a + n); sum += term; if (term < sum * 1e-15) break; }
    return Math.max(0, 1 - sum * Math.exp(-z + a * Math.log(z) - logGamma(a)));
  }
  const tiny = 1e-300;
  let b = z + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-z + a * Math.log(z) - logGamma(a)) * h;
}

// Inverse normal (Acklam), refined by one Newton step.
export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// Symmetric eigendecomposition (cyclic Jacobi) for the Wald pre-test's pseudo-inverse.
export function symEigen(A) {
  const n = A.length;
  const a = A.map((r) => r.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: V };
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- panel ----------

// Long records -> balanced panel { units, times, Y[i][t], G[i] (period value or 0 = never) }.
export function buildPanel(records, { unit, time, outcome, cohort = null, treatment = null }) {
  if (!unit || !time || !outcome) throw new Error("Choose the unit, time and outcome columns.");
  if (!cohort && !treatment) throw new Error("Choose either a first-treated (cohort) column or a 0/1 treatment column.");
  const notes = [];
  const timeSet = new Set();
  const byUnit = new Map();
  let skipped = 0;
  for (const r of records) {
    const u = r[unit];
    const t = num(r[time]);
    if (u === undefined || u === "" || !Number.isFinite(t)) { skipped++; continue; }
    timeSet.add(t);
    if (!byUnit.has(u)) byUnit.set(u, new Map());
    const m = byUnit.get(u);
    if (m.has(t)) throw new Error(`Unit "${u}" has more than one row for ${time} ${t}. Each unit needs one row per period.`);
    m.set(t, r);
  }
  if (skipped) notes.push(`${skipped} rows had no unit or a non-numeric time and were skipped.`);
  const times = [...timeSet].sort((a, b) => a - b);
  if (times.length < 2) throw new Error("The panel needs at least two periods.");
  const units = [], Y = [], G = [];
  const dropped = [];
  for (const [u, m] of byUnit) {
    const y = times.map((t) => (m.has(t) ? num(m.get(t)[outcome]) : NaN));
    if (y.some((v) => !Number.isFinite(v))) { dropped.push(u); continue; }
    let g = 0;
    if (cohort) {
      const vals = [...new Set([...m.values()].map((r) => String(r[cohort] ?? "").trim()))];
      if (vals.length > 1) throw new Error(`Unit "${u}" has more than one value in "${cohort}" (${vals.slice(0, 3).join(", ")}). The first-treated period must be the same in every row of a unit.`);
      const v = vals[0];
      if (NEVER.test(v)) g = 0;
      else {
        g = num(v);
        if (!Number.isFinite(g)) throw new Error(`Unit "${u}": "${v}" in "${cohort}" is not a period. Use the first treated period, or 0 or blank for never treated.`);
      }
    } else {
      const d = times.map((t) => num(m.get(t)[treatment]));
      if (d.some((v) => v !== 0 && v !== 1)) throw new Error(`Unit "${u}": "${treatment}" must be 0 or 1 in every period.`);
      const first = d.indexOf(1);
      if (first >= 0) {
        if (d.slice(first).some((v) => v === 0)) throw new Error(`Unit "${u}" switches treatment off after switching it on. These estimators assume treatment, once started, stays on (staggered adoption).`);
        g = times[first];
      }
    }
    units.push(u); Y.push(y); G.push(g);
  }
  if (dropped.length) notes.push(`${dropped.length} unit${dropped.length === 1 ? "" : "s"} with a missing or non-numeric outcome in some period ${dropped.length === 1 ? "was" : "were"} dropped to keep the panel balanced (${dropped.slice(0, 5).join(", ")}${dropped.length > 5 ? ", ..." : ""}).`);
  if (units.length < 2) throw new Error("Fewer than two units have a complete outcome series.");
  // A first-treated period between observed periods starts at the next observed one;
  // one after the last period means "not treated within the window".
  let late = 0;
  for (let i = 0; i < G.length; i++) {
    if (G[i] === 0) continue;
    if (G[i] > times[times.length - 1]) { G[i] = 0; late++; continue; }
    if (!timeSet.has(G[i])) G[i] = times.find((t) => t >= G[i]);
  }
  if (late) notes.push(`${late} unit${late === 1 ? " is" : "s are"} first treated after the last period and ${late === 1 ? "counts" : "count"} as never treated within this window.`);
  return { units, times, Y, G, notes };
}

// ---------- Callaway & Sant'Anna ----------

export function attGt(panel, { control = "never", base = "varying", anticipation = 0 } = {}) {
  const { times, Y, G } = panel;
  const T = times.length;
  const idx = new Map(times.map((t, i) => [t, i]));
  const n = Y.length;
  const gi = G.map((g) => (g === 0 ? Infinity : idx.get(g))); // period index of first treatment
  const cohorts = [...new Set(G.filter((g) => g !== 0))].sort((a, b) => a - b);
  const delta = anticipation;
  const out = [];
  for (const g of cohorts) {
    const k = idx.get(g);
    const members = [];
    for (let i = 0; i < n; i++) if (G[i] === g) members.push(i);
    for (let ti = 0; ti < T; ti++) {
      const post = ti >= k - delta;
      let bi;
      if (base === "universal") bi = k - 1 - delta;
      else bi = post ? k - 1 - delta : ti - 1;
      if (bi < 0) continue;
      if (base === "universal" && ti === bi) continue;
      const ctrl = [];
      for (let i = 0; i < n; i++) {
        if (G[i] === g) continue;
        if (control === "never" ? gi[i] === Infinity : gi[i] > Math.max(ti, bi) + delta) ctrl.push(i);
      }
      if (!ctrl.length) {
        out.push({ g, t: times[ti], e: ti - k, base: times[bi], post, att: NaN, se: NaN, nTreated: members.length, nControl: 0, inf: null });
        continue;
      }
      const dT = members.map((i) => Y[i][ti] - Y[i][bi]);
      const dC = ctrl.map((i) => Y[i][ti] - Y[i][bi]);
      const mT = dT.reduce((s, v) => s + v, 0) / dT.length;
      const mC = dC.reduce((s, v) => s + v, 0) / dC.length;
      const inf = new Float64Array(n);
      members.forEach((i, j) => { inf[i] = (n * (dT[j] - mT)) / members.length; });
      ctrl.forEach((i, j) => { inf[i] = (-n * (dC[j] - mC)) / ctrl.length; });
      let ss = 0;
      for (let i = 0; i < n; i++) ss += inf[i] * inf[i];
      out.push({ g, t: times[ti], e: ti - k, base: times[bi], post, att: mT - mC, se: Math.sqrt(ss) / n, nTreated: members.length, nControl: ctrl.length, inf });
    }
  }
  return out;
}

// Aggregate a set of ATT(g,t) with cohort-share weights, including the
// influence-function term for estimating those shares (CS 2021, sec. 4).
function aggregate(cells, panel, shares) {
  const n = panel.Y.length;
  const ok = cells.filter((c) => Number.isFinite(c.att));
  if (!ok.length) return null;
  const pg = ok.map((c) => shares.get(c.g));
  const S = pg.reduce((s, v) => s + v, 0);
  const w = pg.map((p) => p / S);
  const att = ok.reduce((s, c, j) => s + w[j] * c.att, 0);
  const inf = new Float64Array(n);
  // sum_k (1{G=g_k} - pg_k) for every unit, used by the second wif term
  for (let i = 0; i < n; i++) {
    let sumDev = 0;
    const dev = ok.map((c, j) => { const d = (panel.G[i] === c.g ? 1 : 0) - pg[j]; sumDev += d; return d; });
    let v = 0;
    for (let j = 0; j < ok.length; j++) {
      const wif = dev[j] / S - (sumDev * pg[j]) / (S * S);
      v += w[j] * ok[j].inf[i] + wif * ok[j].att;
    }
    inf[i] = v;
  }
  let ss = 0;
  for (let i = 0; i < n; i++) ss += inf[i] * inf[i];
  return { att, se: Math.sqrt(ss) / n, inf, cells: ok.length };
}

function equalAverage(cells, n) {
  const ok = cells.filter((c) => Number.isFinite(c.att));
  if (!ok.length) return null;
  const att = ok.reduce((s, c) => s + c.att, 0) / ok.length;
  const inf = new Float64Array(n);
  for (const c of ok) for (let i = 0; i < n; i++) inf[i] += c.inf[i] / ok.length;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += inf[i] * inf[i];
  return { att, se: Math.sqrt(ss) / n, inf };
}

// Wald test that a set of pre-treatment estimates is jointly zero, from their
// influence functions. Returns null when the covariance is singular (R's did
// refuses then too: rcond <= machine epsilon), with the reason.
export function waldTest(rows, n) {
  const use = rows.filter((c) => Number.isFinite(c.att) && c.inf && c.se > 0);
  if (!use.length) return { statistic: NaN, df: 0, pValue: NaN, cells: 0, singular: false };
  const k = use.length;
  const V = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += use[a].inf[i] * use[b].inf[i];
    return s / (n * n);
  }));
  const { values, vectors } = symEigen(V);
  const top = Math.max(...values), bottom = Math.min(...values);
  if (!(top > 0) || bottom <= top * 2.220446049250313e-16) return { statistic: NaN, df: k, pValue: NaN, cells: k, singular: true };
  let W = 0;
  for (let j = 0; j < k; j++) {
    let proj = 0;
    for (let a = 0; a < k; a++) proj += vectors[a][j] * use[a].att;
    W += (proj * proj) / values[j];
  }
  return { statistic: W, df: k, pValue: chi2Sf(W, k), cells: k, singular: false };
}

// Simultaneous band over event times by the multiplier bootstrap (Mammen weights).
export function uniformCritical(rows, n, { B = 999, seed = 20211, alpha = 0.05 } = {}) {
  const use = rows.filter((r) => r.se > 0 && Number.isFinite(r.se) && r.inf);
  if (!use.length || B < 1) return null;
  const rand = mulberry32(seed);
  const s5 = Math.sqrt(5);
  const lo = (1 - s5) / 2, hi = (1 + s5) / 2, pLo = (s5 + 1) / (2 * s5);
  const maxes = new Float64Array(B);
  const v = new Float64Array(n);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) v[i] = rand() < pLo ? lo : hi;
    let m = 0;
    for (const r of use) {
      let s = 0;
      for (let i = 0; i < n; i++) s += v[i] * r.inf[i];
      m = Math.max(m, Math.abs(s / n) / r.se);
    }
    maxes[b] = m;
  }
  maxes.sort();
  const pos = Math.min(B - 1, Math.max(0, Math.ceil((1 - alpha) * B) - 1));
  return maxes[pos];
}

// ---------- TWFE and the Goodman-Bacon decomposition ----------

export function twfe(panel) {
  const { times, Y, G } = panel;
  const N = Y.length, T = times.length;
  const D = G.map((g) => times.map((t) => (g !== 0 && t >= g ? 1 : 0)));
  const dm = (M) => {
    const ri = M.map((r) => r.reduce((s, v) => s + v, 0) / T);
    const ct = times.map((_, t) => M.reduce((s, r) => s + r[t], 0) / N);
    const all = ri.reduce((s, v) => s + v, 0) / N;
    return M.map((r, i) => r.map((v, t) => v - ri[i] - ct[t] + all));
  };
  const Dt = dm(D), Yt = dm(Y);
  let sdd = 0, sdy = 0;
  for (let i = 0; i < N; i++) for (let t = 0; t < T; t++) { sdd += Dt[i][t] * Dt[i][t]; sdy += Dt[i][t] * Yt[i][t]; }
  if (sdd < 1e-12) return null;
  const beta = sdy / sdd;
  let meat = 0;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let t = 0; t < T; t++) s += Dt[i][t] * (Yt[i][t] - beta * Dt[i][t]);
    meat += s * s;
  }
  // CR1 by unit, with the small-sample factor fixest uses by default for
  // unit-clustered errors with unit and time effects: G/(G-1) * (NT-1)/(NT-K),
  // K = 1 + T (unit effects are nested in the clusters and not counted; checked
  // against pyfixest 0.70.0 on the example and a simulated panel).
  const NT = N * T, K = 1 + T;
  const se = Math.sqrt(((N / (N - 1)) * ((NT - 1) / (NT - K)) * meat) / (sdd * sdd));
  return { beta, se, varD: sdd / NT, D };
}

export function baconDecomposition(panel) {
  const { times, Y, G } = panel;
  const N = Y.length, T = times.length;
  const fit = twfe(panel);
  if (!fit) return null;
  const groups = new Map(); // key: g (0 = never)
  G.forEach((g, i) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
  const info = [...groups.entries()].map(([g, idx]) => {
    const share = idx.length / N;
    const Dbar = g === 0 ? 0 : times.filter((t) => t >= g).length / T;
    const mean = times.map((_, t) => idx.reduce((s, i) => s + Y[i][t], 0) / idx.length);
    return { g, share, Dbar, mean };
  });
  const avg = (series, pred) => {
    let s = 0, c = 0;
    times.forEach((t, j) => { if (pred(t)) { s += series[j]; c++; } });
    return c ? s / c : NaN;
  };
  const VD = fit.varD;
  const never = info.find((x) => x.g === 0);
  const timing = info.filter((x) => x.g !== 0).sort((a, b) => a.g - b.g);
  const comps = [];
  if (never) for (const k of timing) {
    if (k.Dbar <= 0 || k.Dbar >= 1) continue;
    const nkU = k.share / (k.share + never.share);
    const w = ((k.share + never.share) ** 2 * nkU * (1 - nkU) * k.Dbar * (1 - k.Dbar)) / VD;
    const est = (avg(k.mean, (t) => t >= k.g) - avg(k.mean, (t) => t < k.g)) - (avg(never.mean, (t) => t >= k.g) - avg(never.mean, (t) => t < k.g));
    comps.push({ type: "treated vs never treated", treated: k.g, control: "never", estimate: est, weight: w });
  }
  for (let a = 0; a < timing.length; a++) for (let b = a + 1; b < timing.length; b++) {
    const k = timing[a], l = timing[b]; // k earlier (larger Dbar), l later
    const nkl = k.share / (k.share + l.share);
    const s = (k.share + l.share) ** 2 * nkl * (1 - nkl);
    // earlier k treated, later l as control, over the window before l starts
    if (k.Dbar < 1) {
      const pre = (t) => t < k.g, mid = (t) => t >= k.g && t < l.g;
      const est = (avg(k.mean, mid) - avg(k.mean, pre)) - (avg(l.mean, mid) - avg(l.mean, pre));
      const w = (s * (1 - l.Dbar) ** 2 * ((k.Dbar - l.Dbar) / (1 - l.Dbar)) * ((1 - k.Dbar) / (1 - l.Dbar))) / VD;
      comps.push({ type: "earlier vs later treated", treated: k.g, control: l.g, estimate: est, weight: w });
    }
    // later l treated, already-treated k as control, over the window from k's start
    if (l.Dbar > 0) {
      const mid = (t) => t >= k.g && t < l.g, post = (t) => t >= l.g;
      const est = (avg(l.mean, post) - avg(l.mean, mid)) - (avg(k.mean, post) - avg(k.mean, mid));
      const w = (s * k.Dbar ** 2 * (l.Dbar / k.Dbar) * ((k.Dbar - l.Dbar) / k.Dbar)) / VD;
      comps.push({ type: "later vs already treated", treated: l.g, control: k.g, estimate: est, weight: w });
    }
  }
  const types = ["treated vs never treated", "earlier vs later treated", "later vs already treated"];
  const byType = types.map((type) => {
    const cs = comps.filter((c) => c.type === type);
    const w = cs.reduce((s, c) => s + c.weight, 0);
    return { type, weight: w, estimate: w > 0 ? cs.reduce((s, c) => s + c.weight * c.estimate, 0) / w : NaN, comparisons: cs.length };
  }).filter((x) => x.comparisons);
  const weightSum = comps.reduce((s, c) => s + c.weight, 0);
  const reconstructed = comps.reduce((s, c) => s + c.weight * c.estimate, 0);
  return { beta: fit.beta, components: comps, byType, weightSum, reconstructed };
}

// ---------- top level ----------

const fmtN = (x, d = 3) => (Number.isFinite(x) ? Number(x.toFixed(d)).toString() : "n/a");

export function analyze(input = {}) {
  const opts = { ...DEFAULTS, ...input };
  const control = opts.control === "notyet" ? "notyet" : "never";
  const base = opts.base === "universal" ? "universal" : "varying";
  const anticipation = Math.max(0, Math.floor(Number(opts.anticipation) || 0));
  const alpha = Number(opts.alpha) > 0 && Number(opts.alpha) < 1 ? Number(opts.alpha) : 0.05;
  const B = Math.max(0, Math.min(20000, Math.floor(Number(opts.bootstrap ?? 999))));
  const records = input.records ?? parseCsv(input.csv).records;
  const full = buildPanel(records, { unit: opts.unit, time: opts.time, outcome: opts.outcome, cohort: opts.cohort || null, treatment: opts.treatment || null });
  const notes = [...full.notes];
  const first = full.times[0];
  // Units treated in the first period have no untreated period: CS drops them.
  const keep = full.G.map((g) => !(g !== 0 && g <= first));
  const nAlways = keep.filter((k) => !k).length;
  if (nAlways) notes.push(`${nAlways} unit${nAlways === 1 ? " was" : "s were"} already treated in the first period. They are left out of the group-time estimates (nothing untreated to compare) but stay in the two-way fixed effects regression, as they would in a standard regression.`);
  // Cohort sizes: a one-unit cohort's own variation never reaches a standard error.
  const minCohort = Math.max(1, Math.floor(Number(opts.minCohort) || 1));
  const size = new Map();
  full.G.forEach((g, i) => { if (keep[i] && g !== 0) size.set(g, (size.get(g) || 0) + 1); });
  const small = [...size.entries()].filter(([, c]) => c < minCohort).map(([g]) => g).sort((a, b) => a - b);
  if (small.length) {
    full.G.forEach((g, i) => { if (small.includes(g)) keep[i] = false; });
    notes.push(`Cohort${small.length === 1 ? "" : "s"} ${small.join(", ")} (fewer than ${minCohort} units) ${small.length === 1 ? "was" : "were"} left out of the group-time estimates by the minimum cohort size; the two-way fixed effects regression still uses every unit.`);
  }
  const panel = { units: full.units.filter((_, i) => keep[i]), times: full.times, Y: full.Y.filter((_, i) => keep[i]), G: full.G.filter((_, i) => keep[i]) };
  const n = panel.Y.length;
  const cohortList = [...new Set(panel.G.filter((g) => g !== 0))].sort((a, b) => a - b);
  if (!cohortList.length) throw new Error("No unit is treated within the window. Check the first-treated or treatment column.");
  const nNever = panel.G.filter((g) => g === 0).length;
  if (control === "never" && !nNever) throw new Error("There are no never-treated units. Switch the comparison group to not-yet-treated units.");
  if (control === "never" && nNever < 5) notes.push(`Only ${nNever} never-treated unit${nNever === 1 ? "" : "s"}: standard errors from so few controls are unreliable.`);
  const singletons = cohortList.filter((g) => panel.G.filter((x) => x === g).length === 1);
  const fewUnits = cohortList.filter((g) => { const c = panel.G.filter((x) => x === g).length; return c > 1 && c < 5; });
  if (singletons.length) notes.push(`Cohort${singletons.length === 1 ? "" : "s"} ${singletons.join(", ")} ${singletons.length === 1 ? "has" : "have"} a single unit. A one-unit cohort's own year-to-year noise cannot be estimated, so its standard errors reflect only the comparison group and are too small; no joint pre-test is reported. Set the minimum cohort size to 2 to leave such cohorts out.`);
  if (fewUnits.length) notes.push(`Cohort${fewUnits.length === 1 ? "" : "s"} ${fewUnits.join(", ")} ${fewUnits.length === 1 ? "has" : "have"} fewer than five units; standard errors that lean on ${fewUnits.length === 1 ? "it" : "them"} are rough.`);
  const shares = new Map(cohortList.map((g) => [g, panel.G.filter((x) => x === g).length / n]));
  const cells = attGt(panel, { control, base, anticipation });
  const missing = cells.filter((c) => !Number.isFinite(c.att));
  if (missing.length) notes.push(`${missing.length} group-time cell${missing.length === 1 ? " has" : "s have"} no comparison units and ${missing.length === 1 ? "is" : "are"} left out (typically the last cohort's late periods when the comparison group is not-yet-treated units).`);
  const z = normalQuantile(1 - alpha / 2);
  const withCi = (r) => (r ? { att: r.att, se: r.se, lo: r.att - z * r.se, hi: r.att + z * r.se, pValue: r.se > 0 ? 2 * (1 - normalCdf(Math.abs(r.att / r.se))) : NaN } : null);

  const postCells = cells.filter((c) => c.t >= c.g); // simple aggregation: periods at or after the first treated period
  const simpleAgg = aggregate(postCells, panel, shares);
  const events = [...new Set(cells.map((c) => c.e))].sort((a, b) => a - b);
  const eventRows = [];
  for (const e of events) {
    const r = aggregate(cells.filter((c) => c.e === e), panel, shares);
    if (r) eventRows.push({ e, ...r, cohorts: cells.filter((c) => c.e === e && Number.isFinite(c.att)).map((c) => c.g) });
  }
  const crit = B > 0 ? uniformCritical(eventRows, n, { B, seed: Number(opts.seed) || DEFAULTS.seed, alpha }) : null;
  if (base === "universal") eventRows.push({ e: -1 - anticipation, att: 0, se: 0, inf: null, cells: 0, cohorts: [], reference: true });
  eventRows.sort((a, b) => a.e - b.e);
  const postEvents = eventRows.filter((r) => r.e >= 0);
  const dynAvg = equalAverage(postEvents.map((r) => ({ att: r.att, inf: r.inf })), n);
  const groupRows = cohortList.map((g) => {
    const r = equalAverage(cells.filter((c) => c.g === g && c.t >= g), n);
    return r ? { g, units: panel.G.filter((x) => x === g).length, inf: r.inf, ...withCi(r) } : null;
  }).filter(Boolean);
  const groupAgg = aggregate(groupRows, panel, shares);
  // Pre-test: every pre-treatment ATT(g,t), as in Callaway & Sant'Anna. When
  // their covariance is singular (a one-unit cohort shares its control mean
  // with another cohort, for example) fall back to the pre-treatment
  // event-time averages, which are fewer and usually not collinear.
  const cellTest = waldTest(cells.filter((c) => !c.post), n);
  let pretest = null;
  if (singletons.length) pretest = null;
  else if (cellTest.cells && !cellTest.singular) pretest = { ...cellTest, level: "group-time" };
  else {
    const evTest = waldTest(eventRows.filter((r) => r.e < -anticipation && !r.reference), n);
    if (evTest.cells && !evTest.singular) pretest = { ...evTest, level: "event-time", cellLevelSingular: cellTest.singular };
    else if (cellTest.cells) notes.push("The pre-treatment estimates have a singular covariance matrix, so no joint pre-test is reported; read the pre-treatment points of the event study instead.");
  }
  const tw = twfe(full);
  const bacon = baconDecomposition(full);

  const overall = withCi(simpleAgg);
  const eventStudy = eventRows.map((r) => ({ e: r.e, att: r.att, se: r.se, lo: r.att - z * r.se, hi: r.att + z * r.se, ulo: crit ? r.att - crit * r.se : null, uhi: crit ? r.att + crit * r.se : null, cohorts: r.cohorts, ...(r.reference ? { reference: true } : {}) }));

  // cohort mean paths for the chart
  const paths = [...cohortList, 0].filter((g) => g !== 0 || nNever).map((g) => {
    const idx = panel.G.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0);
    return { g, units: idx.length, mean: panel.times.map((_, t) => idx.reduce((s, i) => s + panel.Y[i][t], 0) / idx.length) };
  });

  const forbidden = bacon ? bacon.byType.find((b) => b.type === "later vs already treated") : null;
  const summary = [];
  if (overall) {
    const sig = overall.lo > 0 || overall.hi < 0;
    summary.push(`Averaged over every treated cohort and post-treatment period, the estimated effect on ${opts.outcome} is ${fmtN(overall.att)} (${Math.round((1 - alpha) * 100)}% CI ${fmtN(overall.lo)} to ${fmtN(overall.hi)}, p = ${fmtN(overall.pValue)}), comparing ${cohortList.length} cohort${cohortList.length === 1 ? "" : "s"} of treated units with ${control === "never" ? `${nNever} never-treated units` : "units not yet treated"}${sig ? "" : "; the interval includes zero"}.`);
  }
  if (pretest) {
    if (pretest.level === "event-time") notes.push("The joint pre-test uses the pre-treatment event-time averages: the covariance of the individual pre-treatment group-time estimates is singular (R's did package reports no pre-test in that case).");
    summary.push(pretest.pValue < 0.05
      ? `Before treatment the cohorts already moved differently from the comparison group (pre-test chi-square ${fmtN(pretest.statistic, 2)} on ${pretest.df} df, p = ${fmtN(pretest.pValue)}): parallel trends is in doubt, so read the effect with caution.`
      : `The pre-treatment estimates are jointly consistent with zero (chi-square ${fmtN(pretest.statistic, 2)} on ${pretest.df} df, p = ${fmtN(pretest.pValue)}), which is what parallel trends predicts, though a pre-test cannot prove it.`);
  }
  if (tw && overall) {
    summary.push(`The two-way fixed effects regression gives ${fmtN(tw.beta)} (cluster-robust SE ${fmtN(tw.se)})${forbidden && forbidden.weight > 0.005 ? `; ${Math.round(forbidden.weight * 100)}% of its weight comes from comparing later-treated units with already-treated ones, which is biased when effects change over time` : ""}.`);
  }
  return {
    summary: summary.join(" "),
    notes,
    outcome: opts.outcome,
    options: { control, base, anticipation, alpha, bootstrap: B, seed: Number(opts.seed) || DEFAULTS.seed, minCohort },
    units: n,
    unitsTotal: full.units.length,
    neverTreated: nNever,
    periods: panel.times,
    cohorts: cohortList.map((g) => ({ g, units: panel.G.filter((x) => x === g).length })),
    overall,
    dynamicAverage: withCi(dynAvg),
    eventStudy,
    uniformCritical: crit,
    groupAverage: withCi(groupAgg),
    groups: groupRows.map(({ inf, ...g }) => g),
    attgt: cells.map(({ inf, ...c }) => c),
    pretest,
    twfe: tw ? { beta: tw.beta, se: tw.se, lo: tw.beta - z * tw.se, hi: tw.beta + z * tw.se } : null,
    bacon: bacon ? { components: bacon.components, byType: bacon.byType, weightSum: bacon.weightSum, reconstructed: bacon.reconstructed } : null,
    paths,
  };
}
