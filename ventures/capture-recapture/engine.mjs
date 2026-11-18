// Capture-recapture: how many are there, counting the ones you never saw?
// Closed-population abundance from capture histories (or from two-sample
// counts): Lincoln-Petersen and Chapman, the Otis et al. (1978) models M0,
// Mt and Mb by maximum likelihood with profile-likelihood intervals and
// AIC, Chao's (1987) heterogeneity estimator with its log-normal interval,
// and the Burnham & Overton (1978) jackknife. Plain ES module, no imports:
// the page, the CLI and platform/agents/tools.mjs all load this same file.
//
// Written from the papers below; no third-party code was ported. The
// incomplete gamma function is the textbook series and continued fraction
// (DLMF 8.11 and 8.9), solved for quantiles by bisection.

export const PAPERS = [
  {
    key: "otis1978closed",
    cite: "Otis, D. L., Burnham, K. P., White, G. C. & Anderson, D. R. (1978). Statistical inference from capture data on closed animal populations. Wildlife Monographs 62, 3-135.",
    doi: null,
    used: "the closed-population models M0 (constant capture probability), Mt (varies by occasion) and Mb (trap response: first capture differs from recapture), their likelihoods and notation",
  },
  {
    key: "darroch1958multiple",
    cite: "Darroch, J. N. (1958). The multiple-recapture census. I: Estimation of a closed population. Biometrika 45(3/4), 343-359.",
    doi: "10.2307/2333183",
    used: "the maximum-likelihood estimator of N when capture probability varies by occasion (model Mt)",
  },
  {
    key: "chapman1951some",
    cite: "Chapman, D. G. (1951). Some properties of the hypergeometric distribution with applications to zoological sample censuses. University of California Publications in Statistics 1, 131-160.",
    doi: null,
    used: "the nearly unbiased two-sample estimator (n1+1)(n2+1)/(m+1) - 1",
  },
  {
    key: "seber1982estimation",
    cite: "Seber, G. A. F. (1982). The Estimation of Animal Abundance and Related Parameters, 2nd edition. Griffin, London.",
    doi: null,
    used: "the Lincoln-Petersen estimator and the variance of Chapman's estimator, (n1+1)(n2+1)(n1-m)(n2-m) / ((m+1)^2 (m+2))",
  },
  {
    key: "chao1987unequal",
    cite: "Chao, A. (1987). Estimating the population size for capture-recapture data with unequal catchability. Biometrics 43(4), 783-791.",
    doi: "10.2307/2531532",
    used: "the heterogeneity estimator r + f1^2/(2 f2), its variance, and the log-transformed interval for the number never caught",
  },
  {
    key: "burnham1978jackknife",
    cite: "Burnham, K. P. & Overton, W. S. (1978). Estimation of the size of a closed population when capture probabilities vary among animals. Biometrika 65(3), 625-633.",
    doi: "10.1093/biomet/65.3.625",
    used: "the first- and second-order jackknife estimators from the capture frequencies f1 and f2 (point estimates only here)",
  },
  {
    key: "akaike1974new",
    cite: "Akaike, H. (1974). A new look at the statistical model identification. IEEE Transactions on Automatic Control 19(6), 716-723.",
    doi: "10.1109/TAC.1974.1100705",
    used: "AIC to rank M0, Mt and Mb, which share one likelihood for the same capture histories",
  },
];

export const DEFAULTS = {
  confidence: 0.95,
  group: "", // column that splits the rows into separate closed periods (a year, a site)
  history: "", // column holding histories as strings such as 0101
  occasions: "", // occasion columns, comma-separated; default: every 0/1 column
  freq: "", // column giving how many animals share the row's history
};

// A small made-up two-sample example (60 caught, 55 caught later, 22 of them marked) so `analyze(SAMPLE)` runs as is; the page's real
// example is data/lily-pond-chorus-frogs.csv.
export const SAMPLE = { n1: 60, n2: 55, m: 22 };

// ---------------------------------------------------------------- parsing

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const firstLine = src.split(/\r\n|\n|\r/).find((l) => l.trim() !== "");
  if (firstLine == null) throw new Error("No data: paste a CSV with a header row.");
  const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const records = [];
  let row = [];
  let cur = "";
  let q = false;
  const endField = () => { row.push(cur.trim()); cur = ""; };
  const endRow = () => { endField(); if (row.some((c) => c !== "")) records.push(row); row = []; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) endField();
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; endRow(); }
    else cur += c;
  }
  if (q) throw new Error("A quoted field is never closed: check the quotes in the data.");
  endRow();
  if (!records.length) throw new Error("No data: paste a CSV with a header row.");
  return { header: records[0], rows: records.slice(1), delim };
}

const HISTORY_NAMES = ["ch", "history", "capture_history", "capturehistory", "encounter_history"];
const FREQ_NAMES = ["freq", "frequency", "count"];
const ID_NAMES = ["id", "animal", "animal id", "animal i.d.", "tag", "individual", "name", "case", "defect"];

function colIndex(header, name, what) {
  const low = header.map((h) => h.toLowerCase());
  const i = low.indexOf(String(name).trim().toLowerCase());
  if (i < 0) throw new Error(`No column named "${name}" for the ${what}. Columns: ${header.join(", ")}.`);
  return i;
}

const isBit = (v) => v === "0" || v === "1";

// Reads capture histories from CSV text. Returns one entry per group, each
// with the histories as arrays of 0/1 and a count for each.
export function readHistories(text, opts = {}) {
  const { header, rows } = parseCsv(text);
  const low = header.map((h) => h.toLowerCase());
  const ig = opts.group ? colIndex(header, opts.group, "group") : -1;
  let ifq = opts.freq ? colIndex(header, opts.freq, "frequency") : -1;
  if (ifq < 0) {
    const auto = low.findIndex((h) => FREQ_NAMES.includes(h));
    if (auto >= 0 && rows.every((r) => /^\d+$/.test(r[auto] ?? ""))) ifq = auto;
  }
  let ih = opts.history ? colIndex(header, opts.history, "history") : -1;
  if (ih < 0 && !opts.occasions) {
    ih = header.findIndex((h, i) => i !== ig && i !== ifq && (HISTORY_NAMES.includes(h.toLowerCase()) || (rows.length > 0 && rows.every((r) => /^[01]{2,}$/.test(r[i] ?? "")))));
  }
  let occ = [];
  if (ih < 0) {
    if (opts.occasions) {
      const names = Array.isArray(opts.occasions) ? opts.occasions : String(opts.occasions).split(",");
      occ = names.map((n) => colIndex(header, n, "occasion"));
    } else {
      occ = header.map((h, i) => i).filter((i) => i !== ig && i !== ifq && !ID_NAMES.includes(low[i]) && rows.some((r) => isBit(r[i] ?? "")) && rows.every((r) => (r[i] ?? "") === "" || isBit(r[i])));
    }
    if (occ.length < 2) throw new Error("Need at least two capture occasions: one column of 0/1 per occasion (one row per animal), or a history column such as 0101.");
  }
  const groups = new Map();
  rows.forEach((r, k) => {
    const g = ig >= 0 ? (r[ig] ?? "") : "";
    if (ig >= 0 && g === "") throw new Error(`Row ${k + 2}: the ${header[ig]} is blank.`);
    const count = ifq >= 0 ? Number(r[ifq]) : 1;
    if (!Number.isInteger(count) || count < 0) throw new Error(`Row ${k + 2}: the frequency "${r[ifq]}" is not a whole number.`);
    let cells;
    if (ih >= 0) {
      const s = (r[ih] ?? "").replace(/\s+/g, "");
      if (!/^[01]+$/.test(s)) throw new Error(`Row ${k + 2}: "${r[ih] ?? ""}" is not a capture history of 0s and 1s.`);
      cells = s.split("");
    } else cells = occ.map((i) => r[i] ?? "");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ cells, count, row: k + 2 });
  });
  const out = [];
  for (const [g, list] of groups) {
    const width = list.reduce((w, x) => Math.max(w, x.cells.length), 0);
    // An occasion is part of this group when any of its rows has a 0 or 1 there.
    const active = [...Array(width).keys()].filter((j) => list.some((x) => isBit(x.cells[j] ?? "")));
    const histories = [];
    const counts = [];
    for (const x of list) {
      const h = active.map((j) => {
        const v = x.cells[j] ?? "";
        if (!isBit(v)) throw new Error(`Row ${x.row}: occasion ${ih >= 0 ? j + 1 : header[occ[j]]} is blank while other rows${g ? ` of ${g}` : ""} have it. Write 0 for "not caught".`);
        return Number(v);
      });
      histories.push(h);
      counts.push(x.count);
    }
    out.push({
      group: g,
      occasions: ih >= 0 ? active.map((j) => `${j + 1}`) : active.map((j) => header[occ[j]]),
      histories,
      counts,
    });
  }
  return { groups: out, columns: { group: ig >= 0 ? header[ig] : null, history: ih >= 0 ? header[ih] : null, freq: ifq >= 0 ? header[ifq] : null } };
}

// ------------------------------------------------------ special functions

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (!Number.isFinite(x)) return 1;
  const lead = a * Math.log(x) - x - lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 10000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return Math.min(1, sum * Math.exp(lead));
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.max(0, 1 - Math.exp(lead) * h);
}

export const chi2Cdf = (x, df) => gammaP(df / 2, x / 2);

export function chi2Quantile(p, df) {
  let lo = 0;
  let hi = Math.max(1, df * 2);
  while (chi2Cdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (chi2Cdf(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo <= 1e-15 * Math.max(1, hi)) break;
  }
  return 0.5 * (lo + hi);
}

// Two-sided normal critical value: zCrit(0.95) is about 1.959964.
export const zCrit = (confidence) => Math.sqrt(chi2Quantile(confidence, 1));

// x * log(y), with 0 * log(0) = 0.
const xlogy = (x, y) => (x === 0 ? 0 : x * Math.log(y));

// --------------------------------------------------------------- summaries

// Sufficient statistics of a set of capture histories (Otis et al. 1978).
export function summarize(histories, counts = histories.map(() => 1)) {
  const k = histories.length ? histories[0].length : 0;
  for (const h of histories) if (h.length !== k) throw new Error("Every capture history must have the same number of occasions.");
  const n = Array(k).fill(0); // caught at occasion j
  const u = Array(k).fill(0); // first caught at occasion j
  const f = Array(k + 1).fill(0); // caught exactly i times
  const cells = new Map();
  let neverCaught = 0;
  histories.forEach((h, idx) => {
    const c = counts[idx];
    if (!c) return;
    const times = h.reduce((s, x) => s + x, 0);
    if (times === 0) { neverCaught += c; return; }
    f[times] += c;
    const first = h.indexOf(1);
    u[first] += c;
    h.forEach((x, j) => { if (x) n[j] += c; });
    const key = h.join("");
    cells.set(key, (cells.get(key) || 0) + c);
  });
  const r = u.reduce((s, x) => s + x, 0);
  const M = [0]; // marked before occasion j
  for (let j = 1; j < k; j++) M.push(M[j - 1] + u[j - 1]);
  const m = n.map((x, j) => x - u[j]); // recaptures at occasion j
  // Multinomial coefficient over the observed histories (the same for every model).
  let logCells = 0;
  for (const c of cells.values()) logCells += lgamma(c + 1);
  return { k, r, n, u, m, M, f, nDot: n.reduce((s, x) => s + x, 0), neverCaught, distinctHistories: cells.size, logCells };
}

// ---------------------------------------------------------------- models

// Profile log-likelihoods in N for the Otis et al. (1978) models. Each
// returns { ll, params } with the nuisance probabilities at their
// maximum for that N. N is continuous (via lgamma); N >= r.
function logComb(N, s) {
  return lgamma(N + 1) - lgamma(N - s.r + 1) - s.logCells;
}

export const MODELS = {
  M0: {
    label: "M0: one capture probability",
    nParams: () => 2,
    profile(N, s) {
      const trials = s.k * N;
      const p = s.nDot / trials;
      return { ll: logComb(N, s) + xlogy(s.nDot, p) + xlogy(trials - s.nDot, 1 - p), params: { p } };
    },
  },
  Mt: {
    label: "Mt: capture probability varies by occasion",
    nParams: (s) => s.k + 1,
    profile(N, s) {
      let ll = logComb(N, s);
      const p = s.n.map((nj) => nj / N);
      s.n.forEach((nj, j) => { ll += xlogy(nj, p[j]) + xlogy(N - nj, 1 - p[j]); });
      return { ll, params: { p } };
    },
  },
  Mb: {
    label: "Mb: trap response (recapture differs from first capture)",
    nParams: () => 3,
    profile(N, s) {
      // First captures: at occasion j, N - M_j animals are still unmarked.
      let exposed = 0;
      for (let j = 0; j < s.k; j++) exposed += N - s.M[j];
      const p = s.r / exposed;
      let markedTrials = 0;
      let recaps = 0;
      for (let j = 0; j < s.k; j++) { markedTrials += s.M[j]; recaps += s.m[j]; }
      const c = markedTrials > 0 ? recaps / markedTrials : null;
      let ll = logComb(N, s) + xlogy(s.r, p) + xlogy(exposed - s.r, 1 - p);
      if (markedTrials > 0) ll += xlogy(recaps, c) + xlogy(markedTrials - recaps, 1 - c);
      return { ll, params: { p, c } };
    },
  },
};

const CAP_FACTOR = 1e5; // N larger than this many times r counts as "no finite estimate"

// Maximises a profile log-likelihood over N in [r, cap]; returns the MLE,
// the profile-likelihood interval and a curvature standard error.
export function fitModel(name, s, confidence = 0.95) {
  const model = MODELS[name];
  const L = (N) => model.profile(N, s).ll;
  const r = s.r;
  const cap = Math.max(r, 1) * CAP_FACTOR;
  // Coarse scan on N - r over a log grid, then golden-section refinement.
  const grid = [0];
  for (let t = 1e-3; t <= cap; t *= 1.08) grid.push(t);
  grid.push(cap);
  let best = 0;
  let bestLl = -Infinity;
  grid.forEach((t, i) => { const v = L(r + t); if (v > bestLl) { bestLl = v; best = i; } });
  const finite = best < grid.length - 1;
  let Nhat;
  let llTop = bestLl; // the continuous maximum, which the interval is measured from
  if (!finite) Nhat = Infinity;
  else {
    let a = r + grid[Math.max(0, best - 1)];
    let b = r + grid[Math.min(grid.length - 1, best + 1)];
    const g = (Math.sqrt(5) - 1) / 2;
    let x1 = b - g * (b - a);
    let x2 = a + g * (b - a);
    let f1 = L(x1);
    let f2 = L(x2);
    for (let i = 0; i < 200 && b - a > 1e-10 * Math.max(1, b); i++) {
      if (f1 < f2) { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = L(x2); }
      else { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = L(x1); }
    }
    // N counts animals: the estimate is the whole number with the highest
    // likelihood. (Darroch's 1958 closed-form equation replaces the
    // log-factorial differences by logs and can land a few animals higher:
    // 150 rather than 148 for n1 = 60, n2 = 55, m = 22.)
    const centre = 0.5 * (a + b);
    llTop = Math.max(L(centre), bestLl);
    Nhat = r;
    for (let N = Math.max(r, Math.floor(centre) - 2); N <= Math.ceil(centre) + 2; N++) if (L(N) > L(Nhat)) Nhat = N;
  }
  const llMax = finite ? L(Nhat) : bestLl;
  const drop = chi2Quantile(confidence, 1) / 2;
  const target = Math.max(llTop, llMax) - drop;
  const bisect = (lo, hi) => {
    // L(lo) and L(hi) straddle the target; returns the crossing.
    const loAbove = L(lo) > target;
    for (let i = 0; i < 200 && hi - lo > 1e-9 * Math.max(1, hi); i++) {
      const mid = 0.5 * (lo + hi);
      if ((L(mid) > target) === loAbove) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  let lower = null;
  let upper = null;
  if (finite) {
    lower = L(r) >= target ? r : bisect(r, Nhat);
    let hi = Math.max(Nhat * 2, r + 1);
    while (L(hi) > target && hi < cap) hi *= 2;
    upper = L(hi) > target ? null : bisect(Nhat, hi);
  }
  let se = null;
  if (finite && Nhat > r) {
    const h = Math.max(1e-3, Nhat * 1e-4);
    const lo = Math.max(r, Nhat - h);
    // curvature of the log-likelihood near the estimate (continuous N)
    const d2 = (L(lo + 2 * h) - 2 * L(lo + h) + L(lo)) / (h * h);
    if (d2 < 0) se = 1 / Math.sqrt(-d2);
  }
  const params = finite ? model.profile(Nhat, s).params : null;
  const k = model.nParams(s);
  return {
    model: name,
    label: model.label,
    N: finite ? Nhat : null,
    se,
    lower,
    upper,
    logLik: finite ? llMax : null,
    nParams: k,
    aic: finite ? -2 * llMax + 2 * k : null,
    params,
    finite,
  };
}

// Chao (1987): N = r + f1^2 / (2 f2), with its variance and the
// log-transformed interval on the number never caught, f0 = N - r.
export function chao(s, confidence = 0.95) {
  const f1 = s.f[1] ?? 0;
  const f2 = s.f[2] ?? 0;
  const r = s.r;
  // Bias-corrected form, always defined (the usual stand-in when f2 = 0).
  const corrected = r + (f1 * (f1 - 1)) / (2 * (f2 + 1));
  if (f2 === 0) return { N: null, se: null, lower: null, upper: null, corrected, f1, f2, note: "No animal was caught exactly twice (f2 = 0), so Chao's estimator is undefined; the bias-corrected form is shown as a point estimate only." };
  const ratio = f1 / f2;
  const N = r + (f1 * f1) / (2 * f2);
  const variance = f2 * (ratio ** 4 / 4 + ratio ** 3 + ratio ** 2 / 2);
  const f0 = N - r;
  let lower = r;
  let upper = r;
  if (f0 > 0) {
    const C = Math.exp(zCrit(confidence) * Math.sqrt(Math.log(1 + variance / (f0 * f0))));
    lower = r + f0 / C;
    upper = r + f0 * C;
  }
  return { N, se: Math.sqrt(variance), lower, upper, corrected, f1, f2, note: null };
}

// Burnham & Overton (1978) jackknife, orders 1 and 2 (point estimates).
export function jackknife(s) {
  const { k, r } = s;
  const f1 = s.f[1] ?? 0;
  const f2 = s.f[2] ?? 0;
  const j1 = r + ((k - 1) / k) * f1;
  const j2 = k >= 2 ? r + ((2 * k - 3) / k) * f1 - (k > 1 ? ((k - 2) ** 2 / (k * (k - 1))) * f2 : 0) : null;
  return { order1: j1, order2: j2 };
}

// Two samples: Lincoln-Petersen and Chapman, with Seber's variance and a
// normal interval (and the same log-transformed interval as Chao's).
export function twoSample(n1, n2, m, confidence = 0.95) {
  for (const [name, v] of [["n1", n1], ["n2", n2], ["m", m]]) if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a whole number of animals, got ${v}.`);
  if (m > n1 || m > n2) throw new Error(`The recaptures m (${m}) cannot exceed either sample (n1 = ${n1}, n2 = ${n2}).`);
  const r = n1 + n2 - m;
  const lincoln = m > 0 ? (n1 * n2) / m : null;
  const N = ((n1 + 1) * (n2 + 1)) / (m + 1) - 1;
  const variance = ((n1 + 1) * (n2 + 1) * (n1 - m) * (n2 - m)) / ((m + 1) ** 2 * (m + 2));
  const se = Math.sqrt(variance);
  const z = zCrit(confidence);
  const f0 = N - r;
  let logLower = r;
  let logUpper = r;
  if (f0 > 0 && variance > 0) {
    const C = Math.exp(z * Math.sqrt(Math.log(1 + variance / (f0 * f0))));
    logLower = r + f0 / C;
    logUpper = r + f0 * C;
  }
  return { lincoln, N, se, lower: Math.max(r, N - z * se), upper: N + z * se, logLower, logUpper, r };
}

// Two-sample counts as capture histories: m caught twice, n1 - m only
// first, n2 - m only second.
export function countsToHistories(n1, n2, m) {
  return { histories: [[1, 1], [1, 0], [0, 1]], counts: [m, n1 - m, n2 - m] };
}

// ------------------------------------------------------------- analysis

function estimateGroup(group, histories, counts, confidence, frequencyOnly = false) {
  const s = summarize(histories, counts);
  const warnings = [];
  if (s.k < 2) throw new Error(`${group ? `${group}: ` : ""}need at least two capture occasions.`);
  if (s.r === 0) throw new Error(`${group ? `${group}: ` : ""}no animal was caught.`);
  if (s.neverCaught) warnings.push(`${s.neverCaught} row(s) with no capture at all were left out: an animal you never caught cannot be listed.`);
  const recaptured = s.r - (s.f[1] ?? 0);
  if (recaptured === 0) warnings.push("No animal was caught more than once, so recaptures say nothing about how many were missed: M0, Mt and Chao are unbounded. Only Mb can give a number, by reading a fall in newly caught animals as depletion (the removal method).");
  const models = {};
  // From capture frequencies alone only M0 is identifiable (its likelihood
  // needs just r and the total captures); Mt and Mb need the histories.
  for (const name of frequencyOnly ? ["M0"] : Object.keys(MODELS)) models[name] = fitModel(name, s, confidence);
  if (frequencyOnly) warnings.push("Only capture frequencies were given, so Mt and Mb (which need who was caught when) are not fitted.");
  const fitted = Object.values(models).filter((x) => x.finite);
  let best = null;
  if (fitted.length) {
    const minAic = Math.min(...fitted.map((x) => x.aic));
    let wsum = 0;
    for (const x of fitted) { x.deltaAic = x.aic - minAic; x.weight = Math.exp(-x.deltaAic / 2); wsum += x.weight; }
    for (const x of fitted) x.weight /= wsum;
    best = fitted.find((x) => x.deltaAic === 0).model;
  }
  for (const x of Object.values(models)) {
    if (!x.finite) warnings.push(`${x.model} has no finite estimate for these data (its likelihood keeps rising as N grows).`);
    else if (x.upper == null) warnings.push(`${x.model}: the upper ${Math.round(confidence * 100)}% limit is unbounded.`);
  }
  const het = chao(s, confidence);
  const jk = jackknife(s);
  let two = null;
  if (s.k === 2) {
    const mm = s.m[1];
    two = twoSample(s.n[0], s.n[1], mm, confidence);
  }
  return { group, k: s.k, summary: s, models, best, chao: het, jackknife: jk, twoSample: two, warnings, text: describe(group, s, models, best, het, two, confidence) };
}

const round = (x) => (x == null ? "unbounded" : Math.round(x).toLocaleString("en-US"));

function describe(group, s, models, best, het, two, confidence) {
  const pc = Math.round(confidence * 100);
  const where = group ? `${group}: ` : "";
  const parts = [];
  parts.push(`${where}${s.r.toLocaleString("en-US")} different animals were caught over ${s.k} occasions (${s.nDot.toLocaleString("en-US")} captures; ${(s.f[1] ?? 0).toLocaleString("en-US")} caught once).`);
  if (best) {
    const b = models[best];
    const what = Object.keys(models).length === 1 ? `Model ${best}` : `The best-supported model by AIC, ${best}`;
    parts.push(`${what} (${b.label.split(": ")[1]}), gives about ${round(b.N)} in total, ${pc}% interval ${round(b.lower)} to ${round(b.upper)}.`);
  } else parts.push("None of the likelihood models gives a finite estimate.");
  if (het.N != null) parts.push(`If animals differ in how catchable they are, Chao's estimator gives at least about ${round(het.N)} (${round(het.lower)} to ${round(het.upper)}).`);
  if (two) parts.push(`Chapman's two-sample estimate is ${round(two.N)} (normal ${pc}% interval ${round(two.lower)} to ${round(two.upper)}).`);
  return parts.join(" ");
}

export function analyze(input = {}) {
  const opts = { ...DEFAULTS, ...input };
  const confidence = Number(opts.confidence);
  if (!(confidence > 0 && confidence < 1)) throw new Error(`confidence must be between 0 and 1, got ${opts.confidence}.`);
  let groups;
  let source;
  if (opts.n1 != null || opts.n2 != null || opts.m != null) {
    const [n1, n2, m] = [opts.n1, opts.n2, opts.m].map(Number);
    twoSample(n1, n2, m, confidence); // validates
    const { histories, counts } = countsToHistories(n1, n2, m);
    groups = [{ group: "", occasions: ["1", "2"], histories, counts }];
    source = "counts";
  } else if (Array.isArray(opts.frequencies)) {
    // f1, f2, ...: how many animals were caught once, twice, ... over k occasions.
    const f = opts.frequencies.map(Number);
    const k = Number(opts.k ?? f.length);
    if (!Number.isInteger(k) || k < 2) throw new Error("Give the number of occasions k (at least 2) with the capture frequencies.");
    if (f.length > k) throw new Error(`${f.length} frequencies but only ${k} occasions: an animal cannot be caught more times than there were occasions.`);
    if (!f.every((x) => Number.isInteger(x) && x >= 0)) throw new Error("Capture frequencies are whole numbers of animals.");
    // Stand-in histories with the right counts (caught on the first i occasions);
    // only frequency-based estimators are reported from them.
    const histories = f.map((_, i) => Array.from({ length: k }, (_, j) => (j <= i ? 1 : 0)));
    const results = [{ occasions: Array.from({ length: k }, (_, j) => `${j + 1}`), ...estimateGroup("", histories, f, confidence, true) }];
    return { source: "frequencies", confidence, groups: results, summary: results.map((g) => g.text).join("\n"), papers: PAPERS.map((p) => p.key) };
  } else if (Array.isArray(opts.histories)) {
    const hs = opts.histories.map((h) => (Array.isArray(h) ? h.map(Number) : String(h).replace(/\s+/g, "").split("").map(Number)));
    for (const h of hs) if (!h.every((x) => x === 0 || x === 1)) throw new Error("Capture histories hold only 0s and 1s.");
    const counts = Array.isArray(opts.counts) ? opts.counts.map(Number) : hs.map(() => 1);
    groups = [{ group: "", occasions: hs[0] ? hs[0].map((_, j) => `${j + 1}`) : [], histories: hs, counts }];
    source = "histories";
  } else if (opts.text != null) {
    groups = readHistories(opts.text, opts).groups;
    source = "csv";
  } else throw new Error("Give capture histories (CSV text or a list such as [\"101\", \"011\"]) or two-sample counts n1, n2 and m.");
  const results = groups.map((g) => ({ occasions: g.occasions, ...estimateGroup(g.group, g.histories, g.counts, confidence) }));
  return {
    source,
    confidence,
    groups: results,
    summary: results.map((g) => g.text).join("\n"),
    papers: PAPERS.map((p) => p.key),
  };
}

// --------------------------------------------------------------- report

export function report(res) {
  const f = (x, d = 1) => (x == null ? "unbounded" : Number.isFinite(x) ? x.toFixed(d) : "inf");
  const pc = Math.round(res.confidence * 100);
  const lines = [];
  for (const g of res.groups) {
    const s = g.summary;
    lines.push(`${g.group ? `Group ${g.group}: ` : ""}${s.k} occasions, ${s.r} animals caught, ${s.nDot} captures`);
    lines.push(`caught per occasion n = ${s.n.join(" ")}; first captures u = ${s.u.join(" ")}; caught i times f = ${s.f.slice(1).join(" ")}`);
    lines.push(`model,N,se,lower_${pc},upper_${pc},aic,delta_aic,weight`);
    for (const m of Object.values(g.models)) lines.push([m.model, f(m.N), f(m.se), f(m.lower), f(m.upper), f(m.aic, 2), f(m.deltaAic, 2), m.weight == null ? "" : m.weight.toFixed(3)].join(","));
    if (g.chao.N != null) lines.push(["Chao Mh", f(g.chao.N), f(g.chao.se), f(g.chao.lower), f(g.chao.upper), "", "", ""].join(","));
    lines.push(["Chao bias-corrected (point)", f(g.chao.corrected), "", "", "", "", "", ""].join(","));
    lines.push(["Jackknife order 1 (point)", f(g.jackknife.order1), "", "", "", "", "", ""].join(","));
    if (g.jackknife.order2 != null) lines.push(["Jackknife order 2 (point)", f(g.jackknife.order2), "", "", "", "", "", ""].join(","));
    if (g.twoSample) {
      lines.push(["Chapman", f(g.twoSample.N), f(g.twoSample.se), f(g.twoSample.lower), f(g.twoSample.upper), "", "", ""].join(","));
      lines.push(["Lincoln-Petersen (point)", f(g.twoSample.lincoln), "", "", "", "", "", ""].join(","));
    }
    if (g.chao.note) lines.push(`Note: ${g.chao.note}`);
    for (const w of g.warnings) lines.push(`Note: ${w}`);
    lines.push(g.text);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
