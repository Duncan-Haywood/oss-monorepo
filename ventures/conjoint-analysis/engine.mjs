// Choice-based conjoint (CBC) in the browser: design a survey, read the
// answers, fit a multinomial (conditional) logit by maximum likelihood,
// and turn the part-worths into attribute importance, willingness to pay
// and a market simulator. Zero dependencies; the page, the CLI and the
// agent call share this file.

export const PAPERS = [
  { cite: "McFadden, D. (1974). Conditional logit analysis of qualitative choice behavior. In P. Zarembka (ed.), Frontiers in Econometrics, 105-142. Academic Press.", doi: null },
  { cite: "Louviere, J. J. & Woodworth, G. (1983). Design and analysis of simulated consumer choice or allocation experiments: an approach based on aggregate data. Journal of Marketing Research 20(4), 350-367.", doi: "10.1177/002224378302000403" },
  { cite: "Huber, J. & Zwerina, K. (1996). The importance of utility balance in efficient choice designs. Journal of Marketing Research 33(3), 307-317.", doi: "10.1177/002224379603300305" },
  { cite: "Kuhfeld, W. F., Tobias, R. D. & Garratt, M. (1994). Efficient experimental design with marketing research applications. Journal of Marketing Research 31(4), 545-557.", doi: "10.1177/002224379403100408" },
  { cite: "Train, K. E. (2009). Discrete Choice Methods with Simulation, 2nd ed. Cambridge University Press.", doi: "10.1017/CBO9780511805271" },
];

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

function toNum(v) {
  if (v == null) return NaN;
  const s = String(v).trim().replace(/^[$€£¥]/, "").replace(/,(?=\d{3}\b)/g, "");
  if (s === "") return NaN;
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}

const norm = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const NAMES = {
  respondent: ["respondent", "resp", "respid", "id", "respondentid", "participant", "user", "person"],
  task: ["task", "set", "choiceset", "question", "screen", "card"],
  concept: ["concept", "alternative", "alt", "option", "profile", "product"],
  chosen: ["chosen", "choice", "selected", "response", "y", "picked"],
  version: ["version", "block"],
};

function findCol(header, wanted, kind, required) {
  const h = header.map(norm);
  if (wanted) {
    const i = h.indexOf(norm(wanted));
    if (i < 0) throw new Error(`No column named "${wanted}". Columns: ${header.join(", ")}.`);
    return i;
  }
  for (const n of NAMES[kind]) { const i = h.indexOf(n); if (i >= 0) return i; }
  if (required) throw new Error(`Could not find the ${kind} column (tried ${NAMES[kind].join(", ")}). Name it in the options.`);
  return -1;
}

const isNoneCell = (v) => v === "" || /^(none|no ?choice|neither|nothing|-)$/i.test(v);

/**
 * Reads long-format CBC data: one row per concept shown, with respondent,
 * task, chosen (1/0) and one column per attribute. A row whose attribute
 * cells are all empty or "none" is the no-choice option.
 * numeric: attribute names to treat as one linear coefficient (e.g. price).
 * levels: optional attribute list ("Name: a, b, c" per line, "#" after a
 * numeric name) fixing level order; the first level is the reference.
 */
export function readChoices(text, { respondent = "", task = "", chosen = "", concept = "", numeric = [], ignore = [], levels = "" } = {}) {
  const { header, rows } = parseCsv(text);
  const ri = findCol(header, respondent, "respondent", true);
  const ti = findCol(header, task, "task", true);
  const ci = findCol(header, chosen, "chosen", true);
  const ki = findCol(header, concept, "concept", false);
  const vi = findCol(header, "", "version", false);
  const skip = new Set([ri, ti, ci, ki, vi].filter((i) => i >= 0));
  const ign = new Set(ignore.map(norm));
  const attrIdx = header.map((_, i) => i).filter((i) => !skip.has(i) && !ign.has(norm(header[i])) && header[i] !== "");
  if (!attrIdx.length) throw new Error("No attribute columns: besides respondent, task and chosen, each column should be one attribute.");
  const numSet = new Set((Array.isArray(numeric) ? numeric : String(numeric).split(",")).map(norm).filter(Boolean));
  for (const n of numSet) if (!attrIdx.some((i) => norm(header[i]) === n)) throw new Error(`"${n}" is marked numeric but is not an attribute column.`);
  const attributes = attrIdx.map((i) => ({ name: header[i], col: i, numeric: numSet.has(norm(header[i])), levels: [] }));
  const sets = new Map();
  const warnings = [];
  let line = 1;
  for (const r of rows) {
    line++;
    const rid = r[ri] ?? "", tid = r[ti] ?? "";
    if (rid === "" || tid === "") throw new Error(`Row ${line}: respondent and task must not be empty.`);
    const ch = toNum(r[ci]);
    if (!(ch === 0 || ch === 1)) throw new Error(`Row ${line}: chosen must be 1 or 0, found "${r[ci] ?? ""}".`);
    const cells = attributes.map((a) => (r[a.col] ?? "").trim());
    const none = cells.every(isNoneCell);
    if (!none) {
      attributes.forEach((a, j) => {
        if (cells[j] === "" || isNoneCell(cells[j])) throw new Error(`Row ${line}: "${a.name}" is empty in a concept that is not the no-choice option.`);
        if (a.numeric && !Number.isFinite(toNum(cells[j]))) throw new Error(`Row ${line}: "${a.name}" is marked numeric but reads "${cells[j]}".`);
        if (!a.levels.includes(cells[j])) a.levels.push(cells[j]);
      });
    }
    const key = `${rid}\u0000${tid}`;
    if (!sets.has(key)) sets.set(key, { respondent: rid, task: tid, alts: [] });
    sets.get(key).alts.push({ cells, none, chosen: ch });
  }
  // Optional level order (the design's attribute list): its first level is the reference.
  const order = levels ? (typeof levels === "string" ? parseAttributes(levels) : levels) : [];
  for (const o of order) {
    const a = attributes.find((x) => norm(x.name) === norm(o.name));
    if (!a) throw new Error(`The level list names "${o.name}", which is not a column in the data.`);
    if (o.numeric) a.numeric = true;
    const extra = a.levels.filter((l) => !o.levels.includes(l));
    if (extra.length) throw new Error(`${a.name}: the data has level(s) ${extra.map((l) => `"${l}"`).join(", ")} that the level list does not.`);
    a.levels = o.levels.filter((l) => a.levels.includes(l));
    a.ordered = true;
  }
  for (const a of attributes) {
    if (a.numeric && a.levels.some((l) => !Number.isFinite(toNum(l)))) throw new Error(`"${a.name}" is marked numeric but has the level "${a.levels.find((l) => !Number.isFinite(toNum(l)))}".`);
    if (!a.ordered && a.levels.every((l) => Number.isFinite(toNum(l)))) a.levels.sort((x, y) => toNum(x) - toNum(y));
    delete a.ordered;
    if (!a.numeric && a.levels.length < 2) throw new Error(`"${a.name}" has only one level (${a.levels[0] ?? "none"}): an attribute must vary.`);
    if (a.numeric && a.levels.length < 2) throw new Error(`"${a.name}" has only one value: it must vary.`);
  }
  const out = [];
  let dropped0 = 0, droppedMany = 0, droppedOne = 0;
  for (const s of sets.values()) {
    const k = s.alts.reduce((t, a) => t + a.chosen, 0);
    if (s.alts.length < 2) { droppedOne++; continue; }
    if (k === 0) { dropped0++; continue; }
    if (k > 1) { droppedMany++; continue; }
    out.push(s);
  }
  if (dropped0) warnings.push(`${dropped0} task(s) had no concept chosen and were left out. If respondents could pick none, add a no-choice row (attribute cells empty or "none") with chosen = 1.`);
  if (droppedMany) warnings.push(`${droppedMany} task(s) had more than one concept chosen and were left out.`);
  if (droppedOne) warnings.push(`${droppedOne} task(s) showed a single concept and were left out.`);
  if (out.length < 2) throw new Error("Fewer than two usable choice tasks.");
  return { attributes, sets: out, warnings, hasNone: out.some((s) => s.alts.some((a) => a.none)) };
}

// ------------------------------------------------------- design matrix

/** Parameter list: dummies for every non-reference level, one slope per numeric attribute, and a no-choice constant. */
export function parameters(attributes, hasNone) {
  const params = [];
  for (const a of attributes) {
    if (a.numeric) params.push({ attr: a.name, level: null, label: `${a.name} (per unit)` });
    else for (const l of a.levels.slice(1)) params.push({ attr: a.name, level: l, label: `${a.name}: ${l}` });
  }
  if (hasNone) params.push({ attr: null, level: null, label: "None (no-choice constant)", none: true });
  return params;
}

/** Row of the design matrix for one concept. Numeric attributes are centred at their level mean, so estimates do not depend on the price scale's origin. */
export function encoder(attributes, hasNone) {
  const p = parameters(attributes, hasNone).length;
  const centre = attributes.map((a) => (a.numeric ? a.levels.reduce((t, l) => t + toNum(l), 0) / a.levels.length : 0));
  return (cells, none) => {
    const x = new Float64Array(p);
    if (none) { if (hasNone) x[p - 1] = 1; return x; }
    let k = 0;
    attributes.forEach((a, j) => {
      if (a.numeric) { x[k++] = toNum(cells[j]) - centre[j]; return; }
      const li = a.levels.indexOf(cells[j]);
      if (li > 0) x[k + li - 1] = 1;
      else if (li < 0) throw new Error(`Unknown level "${cells[j]}" for ${a.name}.`);
      k += a.levels.length - 1;
    });
    return x;
  };
}

// --------------------------------------------------------- linear algebra

function cholesky(A) {
  const n = A.length;
  const L = A.map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (!(s > 1e-12 * Math.max(1, Math.abs(A[i][i])))) return null; L[i][i] = Math.sqrt(s); }
      else L[i][j] = s / L[j][j];
    }
  }
  return L;
}

function cholSolve(L, b) {
  const n = L.length, y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

export function invertPD(A) {
  const L = cholesky(A);
  if (!L) return null;
  const n = A.length;
  const inv = [];
  for (let j = 0; j < n; j++) { const e = new Float64Array(n); e[j] = 1; inv.push(cholSolve(L, e)); }
  return inv.map((_, i) => Float64Array.from(inv, (col) => col[i]));
}

export function logDetPD(A) {
  const L = cholesky(A);
  if (!L) return -Infinity;
  let s = 0;
  for (let i = 0; i < L.length; i++) s += 2 * Math.log(L[i][i]);
  return s;
}

// ------------------------------------------------------------ the model

/** Choice sets as matrices: X rows per concept, the chosen index, and the respondent. */
export function buildSets(data) {
  const enc = encoder(data.attributes, data.hasNone);
  return data.sets.map((s) => ({
    X: s.alts.map((a) => enc(a.cells, a.none)),
    y: s.alts.findIndex((a) => a.chosen === 1),
    respondent: s.respondent,
  }));
}

/** Log-likelihood, gradient and negative Hessian of the conditional logit at beta, over the sets given (with optional integer weights for the bootstrap). */
export function llGradHess(sets, beta, weights = null) {
  const p = beta.length;
  let ll = 0;
  const g = new Float64Array(p);
  const H = Array.from({ length: p }, () => new Float64Array(p));
  const xbar = new Float64Array(p);
  for (let si = 0; si < sets.length; si++) {
    const w = weights ? weights[si] : 1;
    if (!w) continue;
    const { X, y } = sets[si];
    const J = X.length;
    const u = new Float64Array(J);
    let m = -Infinity;
    for (let j = 0; j < J; j++) { let s = 0; const x = X[j]; for (let k = 0; k < p; k++) s += x[k] * beta[k]; u[j] = s; if (s > m) m = s; }
    let z = 0;
    for (let j = 0; j < J; j++) { u[j] = Math.exp(u[j] - m); z += u[j]; }
    xbar.fill(0);
    for (let j = 0; j < J; j++) { const pr = u[j] / z; u[j] = pr; const x = X[j]; for (let k = 0; k < p; k++) xbar[k] += pr * x[k]; }
    ll += w * Math.log(u[y]);
    const xc = X[y];
    for (let k = 0; k < p; k++) g[k] += w * (xc[k] - xbar[k]);
    for (let j = 0; j < J; j++) {
      const pr = u[j] * w;
      if (!pr) continue;
      const x = X[j];
      for (let a = 0; a < p; a++) { const da = x[a] - xbar[a]; if (!da) continue; const Ha = H[a]; for (let b = 0; b <= a; b++) Ha[b] += pr * da * (x[b] - xbar[b]); }
    }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) H[b][a] = H[a][b];
  return { ll, g, H };
}

/** Maximum likelihood by Newton-Raphson with step halving. */
export function fitLogit(sets, p, { start = null, weights = null, maxIter = 100, tol = 1e-10 } = {}) {
  let beta = start ? Float64Array.from(start) : new Float64Array(p);
  let cur = llGradHess(sets, beta, weights);
  let iter = 0, converged = false, separated = false;
  for (; iter < maxIter; iter++) {
    const L = cholesky(cur.H);
    if (!L) { separated = true; break; }
    const step = cholSolve(L, cur.g);
    const dec = step.reduce((t, s, k) => t + s * cur.g[k], 0);
    if (dec / 2 < tol) {
      // One last full Newton step: quadratic convergence makes it nearly exact.
      beta = beta.map((b, k) => b + step[k]);
      cur = llGradHess(sets, beta, weights);
      converged = true;
      break;
    }
    let t = 1, next, cand;
    for (let h = 0; h < 40; h++) {
      cand = beta.map((b, k) => b + t * step[k]);
      next = llGradHess(sets, cand, weights);
      if (next.ll >= cur.ll - 1e-12) break;
      t /= 2;
    }
    beta = Float64Array.from(cand);
    cur = next;
    if (beta.some((b) => Math.abs(b) > 40)) { separated = true; break; }
  }
  return { beta, ll: cur.ll, g: cur.g, H: cur.H, iterations: iter, converged, separated };
}

// --------------------------------------------------------- distributions

function erfc(x) {
  // Numerical Recipes' erfcc Chebyshev fit: fractional error below 1.2e-7, ample for a p-value.
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** Two-sided normal p-value (Numerical Recipes erfc, about 1e-7 relative). */
export const normP2 = (z) => (Number.isFinite(z) ? erfc(Math.abs(z) / Math.SQRT2) : 0);

/** Standard normal quantile (Acklam's rational approximation). */
export function normQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let q, r, x;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { q = p - 0.5; r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  return x; // Acklam: relative error below 1.15e-9
}

// --------------------------------------------------------------- helpers

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

function quadForm(a, V) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { if (!a[i]) continue; for (let j = 0; j < a.length; j++) s += a[i] * V[i][j] * a[j]; }
  return s;
}

/** Cluster-robust (sandwich) covariance by respondent: H^-1 B H^-1 with the G/(G-1) small-sample factor. */
export function clusterCovariance(sets, beta, Hinv) {
  const p = beta.length;
  const scores = new Map();
  for (const s of sets) {
    const J = s.X.length;
    const u = s.X.map((x) => x.reduce((t, v, k) => t + v * beta[k], 0));
    const m = Math.max(...u);
    const e = u.map((v) => Math.exp(v - m));
    const z = e.reduce((a, b) => a + b, 0);
    const xbar = new Float64Array(p);
    for (let j = 0; j < J; j++) for (let k = 0; k < p; k++) xbar[k] += (e[j] / z) * s.X[j][k];
    if (!scores.has(s.respondent)) scores.set(s.respondent, new Float64Array(p));
    const g = scores.get(s.respondent);
    for (let k = 0; k < p; k++) g[k] += s.X[s.y][k] - xbar[k];
  }
  const G = scores.size;
  const B = Array.from({ length: p }, () => new Float64Array(p));
  for (const g of scores.values()) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) B[a][b] += g[a] * g[b];
  const HB = Hinv.map((row) => Float64Array.from({ length: p }, (_, j) => row.reduce((t, v, k) => t + v * B[k][j], 0)));
  const f = G > 1 ? G / (G - 1) : 1;
  return HB.map((row) => Float64Array.from({ length: p }, (_, j) => f * row.reduce((t, v, k) => t + v * Hinv[k][j], 0)));
}

// ------------------------------------------------- derived quantities

/**
 * From a coefficient vector: zero-centred part-worths per attribute,
 * importance (range share), and willingness to pay against a numeric
 * price attribute. Linear maps of beta, so the same function serves the
 * point estimate and every bootstrap replicate.
 */
export function derive(attributes, hasNone, beta, priceAttr = "") {
  const params = parameters(attributes, hasNone);
  const out = { partWorths: [], ranges: [], wtp: [] };
  let k = 0;
  let priceSlope = null;
  for (const a of attributes) {
    if (a.numeric) {
      const b = beta[k];
      const vals = a.levels.map(toNum);
      const mean = vals.reduce((t, v) => t + v, 0) / vals.length;
      const pw = vals.map((v) => b * (v - mean));
      out.partWorths.push({ attr: a.name, numeric: true, slope: b, levels: a.levels.map((l, i) => ({ level: l, value: pw[i] })) });
      out.ranges.push({ attr: a.name, range: Math.abs(b) * (Math.max(...vals) - Math.min(...vals)) });
      if (norm(a.name) === norm(priceAttr)) priceSlope = b;
      k++;
    } else {
      const raw = [0, ...a.levels.slice(1).map((_, i) => beta[k + i])];
      const mean = raw.reduce((t, v) => t + v, 0) / raw.length;
      out.partWorths.push({ attr: a.name, numeric: false, levels: a.levels.map((l, i) => ({ level: l, value: raw[i] - mean, raw: raw[i] })) });
      out.ranges.push({ attr: a.name, range: Math.max(...raw) - Math.min(...raw) });
      k += a.levels.length - 1;
    }
  }
  const total = out.ranges.reduce((t, r) => t + r.range, 0);
  out.importance = out.ranges.map((r) => ({ attr: r.attr, importance: total > 0 ? (100 * r.range) / total : NaN }));
  out.none = hasNone ? beta[params.length - 1] : null;
  out.priceSlope = priceSlope;
  if (priceSlope != null) {
    k = 0;
    for (const a of attributes) {
      if (a.numeric) {
        if (norm(a.name) !== norm(priceAttr)) out.wtp.push({ attr: a.name, level: "per unit", vs: null, value: -beta[k] / priceSlope });
        k++;
      } else {
        a.levels.slice(1).forEach((l, i) => out.wtp.push({ attr: a.name, level: l, vs: a.levels[0], value: -beta[k + i] / priceSlope }));
        k += a.levels.length - 1;
      }
    }
    if (hasNone) out.wtp.push({ attr: "None", level: "no-choice constant", vs: null, value: -out.none / priceSlope });
  }
  return out;
}

/** Utility of a product given as {attribute: level or number}; numeric attributes may take values between the tested ones. */
export function utility(attributes, hasNone, beta, product) {
  const params = parameters(attributes, hasNone);
  let k = 0, u = 0;
  for (const a of attributes) {
    const v = product[a.name];
    if (a.numeric) {
      const vals = a.levels.map(toNum);
      const mean = vals.reduce((t, x) => t + x, 0) / vals.length;
      const x = toNum(v);
      if (!Number.isFinite(x)) throw new Error(`Product needs a number for ${a.name}.`);
      u += beta[k] * (x - mean);
      k++;
    } else {
      const li = a.levels.indexOf(String(v));
      if (li < 0) throw new Error(`"${v}" is not a level of ${a.name} (levels: ${a.levels.join(", ")}).`);
      if (li > 0) u += beta[k + li - 1];
      k += a.levels.length - 1;
    }
  }
  void params;
  return u;
}

/** Logit shares of preference for a set of products, optionally with the no-choice option. */
export function shares(attributes, hasNone, beta, products, includeNone = true) {
  const u = products.map((p) => utility(attributes, hasNone, beta, p));
  if (hasNone && includeNone) u.push(beta[beta.length - 1]);
  const m = Math.max(...u);
  const e = u.map((v) => Math.exp(v - m));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((v) => (100 * v) / z);
}

/**
 * Market simulator on a finished analysis: logit shares for products given
 * as {name, attribute: level, ...}, with percentile intervals from the
 * analysis's bootstrap replicates (none when the bootstrap was off).
 */
export function simulateShares(result, products, { includeNone = true } = {}) {
  if (!products.length) throw new Error("Add at least one product.");
  const pt = shares(result.attributes, result.hasNone, result.beta, products, includeNone);
  const reps = (result.replicates ?? []).map((b) => shares(result.attributes, result.hasNone, b, products, includeNone));
  const lo = (1 - result.confidence) / 2;
  const names = [...products.map((p, i) => p.name || `Product ${i + 1}`), ...(result.hasNone && includeNone ? ["None"] : [])];
  return names.map((name, i) => {
    const s = reps.map((r) => r[i]).sort((a, b) => a - b);
    return { name, share: pt[i], lower: s.length >= 20 ? quantile(s, lo) : null, upper: s.length >= 20 ? quantile(s, 1 - lo) : null };
  });
}

// ------------------------------------------------------------- analysis

/**
 * Full analysis of pasted long-format data.
 * input: {text, respondent, task, chosen, concept, numeric, price, bootstrap, confidence, seed, products}
 */
export function analyze(input = {}) {
  const data = input.data ?? readChoices(input.text ?? "", input);
  const conf = Number(input.confidence ?? 0.95);
  if (!(conf > 0 && conf < 1)) throw new Error("Confidence must be between 0 and 1.");
  const priceAttr = String(input.price ?? "");
  if (priceAttr && !data.attributes.some((a) => a.numeric && norm(a.name) === norm(priceAttr))) throw new Error(`Price attribute "${priceAttr}" must be one of the attributes marked numeric.`);
  const sets = buildSets(data);
  const params = parameters(data.attributes, data.hasNone);
  const p = params.length;
  const respondents = [...new Set(sets.map((s) => s.respondent))];
  if (sets.length <= p) throw new Error(`${sets.length} choice tasks cannot identify ${p} parameters: collect more answers or drop levels.`);
  const fit = fitLogit(sets, p);
  const warnings = [...data.warnings];
  let Hinv = invertPD(fit.H);
  // Separation: the likelihood keeps rising as a coefficient runs off to
  // infinity, so Newton stops at a huge estimate with a huger SE.
  if (Hinv && fit.beta.some((b, k) => Math.abs(b) > 15 || Math.sqrt(Hinv[k][k]) > 50)) fit.separated = true;
  if (fit.separated) Hinv = null;
  if (fit.separated || !Hinv) {
    warnings.push("The model could not be fitted to finite values: some level was (almost) always or never chosen, or two parameters cannot be told apart in this design. Merge or drop that level, or collect more varied tasks. Estimates below are not reliable.");
  } else if (!fit.converged) warnings.push("Newton-Raphson did not converge in 100 iterations.");
  const z = normQuantile(1 - (1 - conf) / 2);
  const Vm = Hinv ?? params.map(() => new Float64Array(p).fill(NaN));
  const Vr = Hinv ? clusterCovariance(sets, fit.beta, Hinv) : Vm;
  const coefficients = params.map((par, k) => {
    const se = Math.sqrt(Vm[k][k]), seR = Math.sqrt(Vr[k][k]), b = fit.beta[k];
    return { ...par, estimate: b, se, seRobust: seR, z: b / seR, p: normP2(b / seR), lower: b - z * seR, upper: b + z * seR };
  });
  // Null model: every concept equally likely.
  const ll0 = sets.reduce((t, s) => t - Math.log(s.X.length), 0);
  let hits = 0;
  for (const s of sets) {
    const u = s.X.map((x) => x.reduce((t, v, k) => t + v * fit.beta[k], 0));
    if (u.indexOf(Math.max(...u)) === s.y) hits++;
  }
  const chance = sets.reduce((t, s) => t + 1 / s.X.length, 0) / sets.length;
  const point = derive(data.attributes, data.hasNone, fit.beta, priceAttr);

  // Delta-method SEs for part-worths (linear in beta).
  let k0 = 0;
  for (const pw of point.partWorths) {
    const a = data.attributes.find((x) => x.name === pw.attr);
    const nL = a.numeric ? 1 : a.levels.length - 1;
    pw.levels.forEach((lv, i) => {
      const grad = new Float64Array(p);
      if (a.numeric) grad[k0] = toNum(lv.level) - a.levels.map(toNum).reduce((t, v) => t + v, 0) / a.levels.length;
      else { for (let j = 0; j < nL; j++) grad[k0 + j] = -1 / a.levels.length; if (i > 0) grad[k0 + i - 1] += 1; }
      lv.se = Math.sqrt(quadForm(grad, Vr));
      lv.lower = lv.value - z * lv.se;
      lv.upper = lv.value + z * lv.se;
    });
    k0 += nL;
  }
  if (point.priceSlope != null) {
    if (!(point.priceSlope < 0)) warnings.push(`The ${priceAttr} coefficient is not negative (${point.priceSlope.toFixed(4)} per unit): willingness to pay is not meaningful. Check that the price column holds prices and that respondents saw them.`);
    else if (coefficients.find((c) => c.attr && norm(c.attr) === norm(priceAttr)).upper >= 0) warnings.push(`The ${priceAttr} coefficient's interval reaches zero, so willingness-to-pay intervals are unbounded: read the WTP column as rough.`);
  }

  // Respondent bootstrap: importance, WTP and simulator shares.
  const B = Math.max(0, Math.min(2000, Math.round(Number(input.bootstrap ?? 200))));
  const products = Array.isArray(input.products) ? input.products : [];
  const includeNone = input.includeNone !== false;
  const shareFor = (beta) => (products.length ? shares(data.attributes, data.hasNone, beta, products, includeNone) : []);
  const pointShares = shareFor(fit.beta);
  const boot = { importance: point.importance.map(() => []), wtp: point.wtp.map(() => []), shares: pointShares.map(() => []), failed: 0, betas: [] };
  if (B > 0 && Hinv && !fit.separated) {
    const byResp = new Map(respondents.map((r) => [r, []]));
    sets.forEach((s, i) => byResp.get(s.respondent).push(i));
    const groups = [...byResp.values()];
    const rand = rng(Number(input.seed ?? 20261118));
    const w = new Float64Array(sets.length);
    for (let b = 0; b < B; b++) {
      w.fill(0);
      for (let i = 0; i < groups.length; i++) for (const si of groups[Math.floor(rand() * groups.length)]) w[si]++;
      const f = fitLogit(sets, p, { start: fit.beta, weights: w, maxIter: 50, tol: 1e-8 });
      if (f.separated || !f.converged) { boot.failed++; continue; }
      boot.betas.push(Array.from(f.beta));
      const d = derive(data.attributes, data.hasNone, f.beta, priceAttr);
      d.importance.forEach((x, i) => boot.importance[i].push(x.importance));
      d.wtp.forEach((x, i) => boot.wtp[i].push(x.value));
      shareFor(f.beta).forEach((x, i) => boot.shares[i].push(x));
    }
    if (boot.failed) warnings.push(`${boot.failed} of ${B} bootstrap resamples could not be fitted and were left out of the intervals.`);
  }
  const lo = (1 - conf) / 2, hi = 1 - lo;
  const band = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length >= 20 ? [quantile(s, lo), quantile(s, hi)] : [null, null]; };
  point.importance.forEach((x, i) => { [x.lower, x.upper] = band(boot.importance[i]); });
  point.wtp.forEach((x, i) => { [x.lower, x.upper] = band(boot.wtp[i]); });
  const simulator = products.length
    ? { products: [...products.map((pr, i) => ({ name: pr.name ?? `Product ${i + 1}`, ...pr })), ...(data.hasNone && includeNone ? [{ name: "None" }] : [])].map((pr, i) => {
        const [l, u] = band(boot.shares[i]);
        return { name: pr.name, share: pointShares[i], lower: l, upper: u };
      }) }
    : null;

  const perResp = sets.length / respondents.length;
  const conceptsPer = sets.reduce((t, s) => t + s.X.length, 0) / sets.length;
  const maxLevels = Math.max(...data.attributes.map((a) => (a.numeric ? 2 : a.levels.length)));
  const orme = (respondents.length * perResp * (conceptsPer - (data.hasNone ? 1 : 0))) / maxLevels;
  if (orme < 500) warnings.push(`Rule-of-thumb sample size (respondents × tasks × concepts ÷ most levels ≥ 500, Johnson and Orme): this study reaches ${Math.round(orme)}. Intervals will be wide; treat small differences as noise.`);

  return {
    attributes: data.attributes.map((a) => ({ name: a.name, numeric: a.numeric, levels: a.levels })),
    hasNone: data.hasNone,
    price: priceAttr || null,
    counts: { respondents: respondents.length, tasks: sets.length, tasksPerRespondent: perResp, conceptsPerTask: conceptsPer, parameters: p },
    fit: {
      logLik: fit.ll, nullLogLik: ll0, mcfaddenR2: 1 - fit.ll / ll0, aic: -2 * fit.ll + 2 * p, bic: -2 * fit.ll + p * Math.log(sets.length),
      hitRate: hits / sets.length, chance, iterations: fit.iterations, converged: fit.converged && !fit.separated, ormeScore: orme,
    },
    coefficients,
    partWorths: point.partWorths,
    importance: point.importance,
    wtp: point.wtp,
    none: point.none,
    simulator,
    bootstrap: B,
    confidence: conf,
    warnings,
    beta: Array.from(fit.beta),
    replicates: boot.betas,
    covariance: Vr.map((r) => Array.from(r)),
  };
}

// --------------------------------------------------------------- design

/**
 * Parses an attribute list, one attribute per line: "Name: level, level, level".
 * A name ending in "#" (e.g. "Price#: 8, 10, 12") is numeric.
 */
export function parseAttributes(text) {
  const out = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const m = line.match(/^([^:]+):(.*)$/);
    if (!m) throw new Error(`"${line}": write each attribute as Name: level, level, level.`);
    let name = m[1].trim();
    const numeric = name.endsWith("#");
    if (numeric) name = name.slice(0, -1).trim();
    const levels = m[2].split(m[2].includes("|") ? "|" : ",").map((s) => s.trim()).filter(Boolean);
    if (levels.length < 2) throw new Error(`${name} needs at least two levels.`);
    if (new Set(levels).size !== levels.length) throw new Error(`${name} repeats a level.`);
    if (numeric && levels.some((l) => !Number.isFinite(toNum(l)))) throw new Error(`${name} is numeric (#) but has a level that is not a number.`);
    if (out.some((a) => norm(a.name) === norm(name))) throw new Error(`Two attributes are named ${name}.`);
    out.push({ name, numeric, levels });
  }
  if (out.length < 1) throw new Error("List at least one attribute.");
  return out;
}

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Information matrix of a set of tasks for one respondent at beta = 0 (Huber and Zwerina 1996 with zero priors). */
export function information(attributes, hasNone, tasks) {
  const enc = encoder(attributes, hasNone);
  const p = parameters(attributes, hasNone).length;
  const I = Array.from({ length: p }, () => new Float64Array(p));
  for (const t of tasks) {
    const X = t.map((c) => (c === null ? enc(null, true) : enc(c, false)));
    const J = X.length;
    const m = new Float64Array(p);
    for (const x of X) for (let k = 0; k < p; k++) m[k] += x[k] / J;
    for (const x of X) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) I[a][b] += ((x[a] - m[a]) * (x[b] - m[b])) / J;
  }
  return I;
}

function versionTasks(attributes, tasks, concepts, rand) {
  // Balanced overlap: each attribute draws its levels from a shuffled deck,
  // refilled when empty, taking distinct levels within a task whenever the
  // attribute has enough of them. Identical concepts in a task are redrawn.
  const decks = attributes.map(() => []);
  const draw = (j, avoid) => {
    const a = attributes[j];
    if (!decks[j].length) decks[j] = shuffle([...a.levels], rand);
    let idx = decks[j].findIndex((l) => !avoid.has(l));
    if (idx < 0) idx = 0;
    return decks[j].splice(idx, 1)[0];
  };
  const out = [];
  for (let t = 0; t < tasks; t++) {
    for (let attempt = 0; ; attempt++) {
      const cols = attributes.map((a, j) => {
        const used = new Set();
        return Array.from({ length: concepts }, () => {
          const l = draw(j, a.levels.length >= concepts ? used : new Set());
          used.add(l);
          return l;
        });
      });
      const task = Array.from({ length: concepts }, (_, c) => attributes.map((_, j) => cols[j][c]));
      const keys = new Set(task.map((c) => c.join("\u0000")));
      if (keys.size === concepts || attempt > 50) { out.push(task); break; }
    }
  }
  return out;
}

/**
 * Generates a CBC design: versions × tasks × concepts, balanced overlap,
 * keeping the most D-efficient of `candidates` draws per version.
 */
export function generateDesign({ attributes, versions = 10, tasks = 12, concepts = 3, none = true, candidates = 30, seed = 1 } = {}) {
  if (!Array.isArray(attributes) || !attributes.length) throw new Error("List at least one attribute.");
  versions = Math.round(Number(versions)); tasks = Math.round(Number(tasks)); concepts = Math.round(Number(concepts));
  if (!(versions >= 1 && versions <= 999)) throw new Error("Versions must be 1 to 999.");
  if (!(tasks >= 1 && tasks <= 50)) throw new Error("Tasks per respondent must be 1 to 50.");
  if (!(concepts >= 2 && concepts <= 8)) throw new Error("Concepts per task must be 2 to 8.");
  const combos = attributes.reduce((t, a) => t * a.levels.length, 1);
  if (combos < concepts) throw new Error(`Only ${combos} distinct concepts exist; show fewer per task.`);
  const atts = attributes.map((a) => ({ ...a, levels: a.numeric ? [...a.levels].sort((x, y) => toNum(x) - toNum(y)) : [...a.levels] }));
  const p = parameters(atts, none).length;
  const rand = rng(seed);
  const all = [];
  for (let v = 0; v < versions; v++) {
    let best = null, bestLd = -Infinity;
    for (let c = 0; c < Math.max(1, candidates); c++) {
      const cand = versionTasks(atts, tasks, concepts, rand);
      const ld = logDetPD(information(atts, none, cand.map((t) => (none ? [...t, null] : t))));
      if (ld > bestLd || best === null) { best = cand; bestLd = ld; }
    }
    all.push(best);
  }
  const flat = all.flatMap((ts) => ts.map((t) => (none ? [...t, null] : t)));
  const I = information(atts, none, flat).map((r) => r.map((x) => x / versions));
  const ld = logDetPD(I);
  const dError = Number.isFinite(ld) ? Math.exp(-ld / p) : Infinity;
  const Iinv = Number.isFinite(ld) ? invertPD(I) : null;
  const freq = atts.map((a, j) => ({ attr: a.name, counts: a.levels.map((l) => ({ level: l, n: all.flat().reduce((t, task) => t + task.filter((c) => c[j] === l).length, 0) })) }));
  const overlap = atts.map((a, j) => {
    const ts = all.flat();
    const rep = ts.filter((task) => new Set(task.map((c) => c[j])).size < task.length).length;
    return { attr: a.name, tasksWithRepeat: rep, share: rep / ts.length };
  });
  return {
    attributes: atts, versions, tasks, concepts, none, design: all, parameters: parameters(atts, none).map((x) => x.label),
    dError, identified: Iinv !== null,
    // Expected standard error of each coefficient per respondent at beta = 0; divide by sqrt(n).
    unitSe: Iinv ? Iinv.map((r, i) => Math.sqrt(r[i])) : null,
    frequencies: freq, overlap,
  };
}

/** Expected standard errors (at zero utilities) with n respondents. */
export function expectedSe(design, n) {
  if (!design.unitSe) return null;
  return design.unitSe.map((s) => s / Math.sqrt(n));
}

/** The respondents needed for every coefficient's expected SE to fall to `target` (Orme's 0.05 to 0.10 guideline for aggregate logit). */
export function respondentsFor(design, target = 0.05) {
  if (!design.unitSe) return null;
  return Math.ceil(Math.max(...design.unitSe.map((s) => (s / target) ** 2)));
}

// Spreadsheet formula-injection guard: a level or label starting =, +, -, @,
// tab or CR gets an apostrophe, unless it is a plain number such as -5.
function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The design as long CSV: version, task, concept, one column per attribute; the no-choice row has empty cells. */
export function designCsv(d) {
  const lines = [["version", "task", "concept", ...d.attributes.map((a) => a.name)].map(csvCell).join(",")];
  d.design.forEach((ts, v) => ts.forEach((t, ti) => {
    t.forEach((c, ci) => lines.push([v + 1, ti + 1, ci + 1, ...c].map(csvCell).join(",")));
    if (d.none) lines.push([v + 1, ti + 1, t.length + 1, ...d.attributes.map(() => "None")].map(csvCell).join(","));
  }));
  return lines.join("\n");
}

/** A printable questionnaire, one block per version, for building the survey in any form tool. */
export function designText(d) {
  const out = [];
  d.design.forEach((ts, v) => {
    out.push(`=== Version ${v + 1} ===`);
    ts.forEach((t, ti) => {
      out.push(`Task ${ti + 1}: which would you choose?`);
      t.forEach((c, ci) => out.push(`  Option ${ci + 1}: ${d.attributes.map((a, j) => `${a.name}: ${c[j]}`).join("; ")}`));
      if (d.none) out.push(`  Option ${t.length + 1}: None of these`);
    });
    out.push("");
  });
  return out.join("\n");
}

/**
 * Joins a design CSV with answers in wide format (one row per respondent:
 * respondent, version, then one column per task holding the concept number
 * picked) and returns long-format CSV ready for analyze().
 */
export function mergeResponses(designText, answersText) {
  const d = parseCsv(designText);
  const vi = findCol(d.header, "", "version", false);
  const ti = findCol(d.header, "", "task", true);
  const ki = findCol(d.header, "", "concept", true);
  const attrCols = d.header.map((_, i) => i).filter((i) => ![vi, ti, ki].includes(i));
  const byKey = new Map();
  for (const r of d.rows) {
    const key = `${vi >= 0 ? r[vi] : "1"}\u0000${r[ti]}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  const a = parseCsv(answersText);
  const ri = findCol(a.header, "", "respondent", true);
  const avi = findCol(a.header, "", "version", false);
  const taskCols = a.header.map((h, i) => ({ h, i })).filter(({ i }) => i !== ri && i !== avi);
  if (!taskCols.length) throw new Error("The answers need one column per task after respondent (and version).");
  const lines = [["respondent", "task", "concept", ...attrCols.map((i) => d.header[i]), "chosen"].map(csvCell).join(",")];
  let missing = 0;
  a.rows.forEach((r, n) => {
    const v = avi >= 0 ? r[avi] : "1";
    taskCols.forEach(({ h, i }) => {
      const tname = (String(h).match(/(\d+)\s*$/) || [])[1] ?? h;
      const rows = byKey.get(`${v}\u0000${tname}`);
      if (!rows) throw new Error(`Answers row ${n + 2}: the design has no version ${v}, task ${tname}.`);
      const pick = String(r[i] ?? "").trim();
      if (pick === "") { missing++; return; }
      if (!rows.some((x) => String(x[ki]) === pick)) throw new Error(`Answers row ${n + 2}: task ${tname} has no concept "${pick}".`);
      for (const x of rows) lines.push([r[ri], tname, x[ki], ...attrCols.map((c) => x[c]), String(x[ki]) === pick ? 1 : 0].map(csvCell).join(","));
    });
  });
  return { csv: lines.join("\n"), missing };
}

// ------------------------------------------------------------- report

const f4 = (x) => (x == null || !Number.isFinite(x) ? "" : Math.abs(x) >= 1e4 ? x.toExponential(3) : x.toFixed(4));
const f1 = (x) => (x == null || !Number.isFinite(x) ? "" : x.toFixed(1));
const f2 = (x) => (x == null || !Number.isFinite(x) ? "" : x.toFixed(2));

export function report(r) {
  const cl = Math.round(r.confidence * 100);
  const L = [];
  L.push("Choice-based conjoint: multinomial logit (aggregate)");
  L.push(`${r.counts.respondents} respondents, ${r.counts.tasks} tasks, ${f1(r.counts.conceptsPerTask)} concepts per task${r.hasNone ? " (incl. none)" : ""}, ${r.counts.parameters} parameters`);
  L.push(`Log-likelihood ${f4(r.fit.logLik)} (null ${f4(r.fit.nullLogLik)}), McFadden R2 ${f4(r.fit.mcfaddenR2)}, AIC ${f2(r.fit.aic)}, BIC ${f2(r.fit.bic)}, hit rate ${f1(100 * r.fit.hitRate)}% (chance ${f1(100 * r.fit.chance)}%)`);
  L.push("");
  L.push(`coefficient,estimate,se,se_cluster_robust,z,p,lower_${cl},upper_${cl}`);
  for (const c of r.coefficients) L.push([csvCell(c.label), f4(c.estimate), f4(c.se), f4(c.seRobust), f2(c.z), c.p < 1e-4 ? "<0.0001" : f4(c.p), f4(c.lower), f4(c.upper)].join(","));
  L.push("");
  L.push(`attribute,level,part_worth,se,lower_${cl},upper_${cl}`);
  for (const pw of r.partWorths) for (const lv of pw.levels) L.push([csvCell(pw.attr), csvCell(lv.level), f4(lv.value), f4(lv.se), f4(lv.lower), f4(lv.upper)].join(","));
  L.push("");
  L.push(`attribute,importance_pct,lower_${cl},upper_${cl}`);
  for (const x of r.importance) L.push([csvCell(x.attr), f1(x.importance), f1(x.lower), f1(x.upper)].join(","));
  if (r.wtp.length) {
    L.push("");
    L.push(`attribute,level,versus,wtp_in_${csvCell(r.price)}_units,lower_${cl},upper_${cl}`);
    for (const x of r.wtp) L.push([csvCell(x.attr), csvCell(x.level), csvCell(x.vs ?? ""), f2(x.value), f2(x.lower), f2(x.upper)].join(","));
  }
  if (r.simulator) {
    L.push("");
    L.push(`product,share_pct,lower_${cl},upper_${cl}`);
    for (const s of r.simulator.products) L.push([csvCell(s.name), f1(s.share), f1(s.lower), f1(s.upper)].join(","));
  }
  if (r.warnings.length) { L.push(""); for (const w of r.warnings) L.push(`Note: ${w}`); }
  L.push("");
  L.push(`Intervals: coefficients and part-worths use cluster-robust SEs by respondent; importance, WTP and shares use a ${r.bootstrap}-resample respondent bootstrap.`);
  L.push("A statistical estimate from stated choices. Not financial, legal or professional advice. https://marisstella.app/conjoint-analysis/");
  return L.join("\n");
}
