// Item response theory for right/wrong test items: 1PL and 2PL models fitted
// by marginal maximum likelihood (Bock & Aitkin 1981), item fit by S-X2
// (Orlando & Thissen 2000), summed-score probabilities by the Lord-Wingersky
// (1984) recursion, EAP ability scores (Bock & Mislevy 1982), test
// information, marginal reliability, and a classical item and distractor
// table beside them. Pure functions, no imports, no network.
//
// Implemented from the papers listed in PAPERS; no third-party code was
// ported. The independent reference used in testing is the Python package
// girth (MIT), run outside this module (eval/reference.py).

export const PAPERS = [
  {
    key: "bock1981",
    cite: "Bock, R. D. & Aitkin, M. (1981). Marginal maximum likelihood estimation of item parameters: Application of an EM algorithm. Psychometrika, 46(4), 443-459.",
    title: "Marginal maximum likelihood estimation of item parameters: Application of an EM algorithm",
    doi: "10.1007/BF02293801",
    implemented: "EM over a fixed quadrature of a standard normal ability distribution: the E-step accumulates expected attempts and expected correct answers at each node, the M-step maximises each item's expected complete-data log-likelihood by Newton's method.",
    deviations: "A rectangular grid of 61 nodes on [-6, 6] with normal weights instead of Gauss-Hermite nodes (the same choice as mirt and girth). The 1PL shares one slope across items and is fitted jointly in its M-step. Standard errors come from the observed information, found by differencing the exact marginal score (Fisher's identity), not from the EM itself.",
  },
  {
    key: "birnbaum1968",
    cite: "Birnbaum, A. (1968). Some latent trait models and their use in inferring an examinee's ability. In F. M. Lord & M. R. Novick, Statistical Theories of Mental Test Scores (pp. 397-479). Addison-Wesley.",
    title: "Some latent trait models and their use in inferring an examinee's ability",
    doi: null,
    implemented: "The two-parameter logistic model P(correct | theta) = 1 / (1 + exp(-a (theta - b))) and the item information a^2 P (1 - P).",
    deviations: "No scaling constant D = 1.7: slopes are on the logistic metric. Multiply a normal-ogive slope by 1.7 to compare.",
  },
  {
    key: "rasch1960",
    cite: "Rasch, G. (1960). Probabilistic Models for Some Intelligence and Attainment Tests. Danish Institute for Educational Research.",
    title: "Probabilistic Models for Some Intelligence and Attainment Tests",
    doi: null,
    implemented: "The one-parameter model: every item has the same slope, so the summed score carries all the information about ability. The 1PL here is reported both with the common slope and an N(0,1) ability, and in the Rasch metric (slope 1, ability standard deviation equal to the common slope).",
    deviations: "Fitted by marginal maximum likelihood with a normal ability distribution, not by Rasch's conditional maximum likelihood; the item difficulties agree closely when the ability distribution is near normal.",
  },
  {
    key: "orlando2000",
    cite: "Orlando, M. & Thissen, D. (2000). Likelihood-based item-fit indices for dichotomous item response theory models. Applied Psychological Measurement, 24(1), 50-64.",
    title: "Likelihood-based item-fit indices for dichotomous item response theory models",
    doi: "10.1177/01466216000241003",
    implemented: "S-X2: for each summed score 1 to J-1, the observed proportion correct on the item against the model's proportion among people with that score, the latter from the Lord-Wingersky distribution of the other items' score; Pearson X2 with degrees of freedom = score groups - item parameters.",
    deviations: "Neighbouring score groups are pooled from the low end until both expected counts reach 1 (the paper's rule); for the 1PL the item has one free parameter. Computed only when every answer is present (no missing responses), as in the paper.",
  },
  {
    key: "lord1984",
    cite: "Lord, F. M. & Wingersky, M. S. (1984). Comparison of IRT true-score and equipercentile observed-score \"equatings\". Applied Psychological Measurement, 8(4), 453-461.",
    title: "Comparison of IRT true-score and equipercentile observed-score \"equatings\"",
    doi: "10.1177/014662168400800409",
    implemented: "The recursion that builds the distribution of the summed score at each ability one item at a time.",
    deviations: "None.",
  },
  {
    key: "bock1982",
    cite: "Bock, R. D. & Mislevy, R. J. (1982). Adaptive EAP estimation of ability in a microcomputer environment. Applied Psychological Measurement, 6(4), 431-444.",
    title: "Adaptive EAP estimation of ability in a microcomputer environment",
    doi: "10.1177/014662168200600405",
    implemented: "Expected a posteriori ability and its posterior standard deviation for every response pattern, by the same quadrature as the fit.",
    deviations: "None.",
  },
  {
    key: "thissen1995",
    cite: "Thissen, D., Pommerich, M., Billeaud, K. & Williams, V. S. L. (1995). Item response theory for scores on tests including polytomous items with ordered responses. Applied Psychological Measurement, 19(1), 39-49.",
    title: "Item response theory for scores on tests including polytomous items with ordered responses",
    doi: "10.1177/014662169501900105",
    implemented: "A conversion table from summed score to EAP ability and posterior standard deviation, from the Lord-Wingersky score distribution, for scoring paper tests without the pattern.",
    deviations: "Dichotomous items only.",
  },
  {
    key: "bock1970",
    cite: "Bock, R. D. & Lieberman, M. (1970). Fitting a response model for n dichotomously scored items. Psychometrika, 35(2), 179-197.",
    title: "Fitting a response model for n dichotomously scored items",
    doi: "10.1007/BF02291262",
    implemented: "Source of the LSAT Section 6 example (1,000 examinees, 5 items), as distributed with the R package ltm.",
    deviations: "Data only; their full-information normal-ogive estimator is not implemented.",
  },
];

export const LIMITS = { minPeople: 20, maxItems: 100, maxPeople: 20000, quadNodes: 61, quadBound: 6 };

export const SAMPLE_TEXT = `student,q1,q2,q3,q4,q5,q6
key,B,D,A,C,A,B
Ana,B,D,A,C,A,B
Ben,B,D,C,C,A,D
Cai,B,A,A,C,B,B
Dee,B,D,A,B,A,B
Eli,C,D,C,C,D,B
Fay,B,D,A,C,A,C
Gus,B,B,B,A,C,B
Hal,B,D,A,C,A,B
Ivy,A,D,C,C,A,D
Jon,B,D,A,D,C,B
Kim,B,C,A,C,A,B
Lou,D,D,B,A,C,B
Mae,B,D,A,C,A,B
Ned,B,A,D,C,B,A
Ola,B,D,A,C,A,B
Pat,C,B,C,A,D,C
Quinn,B,D,A,C,C,B
Ray,B,D,C,B,A,B
Sol,A,C,A,C,B,D
Tia,B,D,A,C,A,B
`;

// ---------------------------------------------------------------- parsing

const MISSING = new Set(["", "na", "n/a", ".", "-", "nan", "null", "missing", "?"]);
const ID_HEADER = /^(id|name|student|person|respondent|examinee|candidate|learner|participant|user|email)\b/i;
const WEIGHT_HEADER = /^(count|freq|frequency|weight|n|cases)$/i;

function splitLine(line, sep) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function score01(v) {
  const s = v.trim().toLowerCase();
  if (MISSING.has(s)) return -1;
  if (s === "1" || s === "1.0" || s === "true" || s === "yes" || s === "correct" || s === "right") return 1;
  if (s === "0" || s === "0.0" || s === "false" || s === "no" || s === "incorrect" || s === "wrong") return 0;
  return null;
}

/**
 * Parse a response table. Rows are people, columns are items. Cells are
 * 0/1 (also true/false, yes/no, right/wrong), or raw answers (letters,
 * numbers) scored against a row whose first cell is "key" or the `key`
 * option. Blank, NA, "." and "-" are missing. A column headed id, name,
 * student ... holds labels; one headed count, freq or weight holds how many
 * people gave that row (pattern tables).
 */
export function parseResponses(text, opts = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("No data: paste a table with one row per person and one column per item.");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "" && !/^\s*#/.test(l));
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  let rows = lines.map((l) => splitLine(l, sep));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  rows = rows.map((r) => (r.length < width ? r.concat(Array(width - r.length).fill("")) : r));

  // A header is a first row with a cell that is neither a response, a key
  // letter nor a number in every other row's alphabet. Practically: it has
  // a cell longer than 3 characters that is not a 0/1 word, or it repeats
  // the word "item"/"q".
  const first = rows[0];
  const looksHeader = first.some((c) => /^(item|q|question|i)[\s_-]*\d+$/i.test(c) || ID_HEADER.test(c) || WEIGHT_HEADER.test(c)) ||
    first.filter((c) => c.length > 1 && score01(c) === null && !/^-?\d+(\.\d+)?$/.test(c)).length >= Math.max(1, Math.ceil(first.length / 2));
  // Or: every later cell (past a possible label column) is a 0/1 answer and the first row is not.
  const binaryBody = rows.length > 1 && rows.slice(1).every((r) => r.slice(1).every((c) => score01(c) !== null));
  const headerByContrast = binaryBody && first.slice(1).some((c) => score01(c) === null);
  const isHeader = looksHeader || headerByContrast;
  let header = isHeader ? first : first.map((_, j) => `Item ${j + 1}`);
  let body = isHeader ? rows.slice(1) : rows;

  let idCol = header.findIndex((h) => ID_HEADER.test(h));
  const weightCol = header.findIndex((h, j) => j !== idCol && WEIGHT_HEADER.test(h));
  // A first column that holds text labels (or "key") is an id column even unheaded.
  if (idCol < 0 && body.length && body.every((r) => r[0] !== "") && new Set(body.map((r) => r[0])).size === body.length &&
      body.some((r) => r[0].length > 1 && score01(r[0]) === null && !/^-?\d+(\.\d+)?$/.test(r[0]))) idCol = 0;

  let keyRow = null;
  if (idCol >= 0) {
    const k = body.findIndex((r) => /^(key|answer[\s_-]*key|answers|correct)$/i.test(r[idCol]));
    if (k >= 0) { keyRow = body[k]; body = body.filter((_, i) => i !== k); }
  }
  const itemCols = header.map((_, j) => j).filter((j) => j !== idCol && j !== weightCol);
  if (itemCols.length < 2) throw new Error("Need at least two item columns.");
  if (itemCols.length > LIMITS.maxItems) throw new Error(`At most ${LIMITS.maxItems} items.`);

  let key = null;
  if (opts.key != null && opts.key !== "") {
    const k = Array.isArray(opts.key) ? opts.key.map(String) : String(opts.key).includes(",") ? splitLine(String(opts.key), ",") : String(opts.key).replace(/\s+/g, "").split("");
    if (k.length !== itemCols.length) throw new Error(`The answer key has ${k.length} answers but the table has ${itemCols.length} items.`);
    key = k;
  } else if (keyRow) key = itemCols.map((j) => keyRow[j]);

  const items = itemCols.map((j) => header[j] || `Item ${j + 1}`);
  const ids = [];
  const weights = [];
  const X = [];
  const raw = [];
  body.forEach((r, i) => {
    let w = 1;
    if (weightCol >= 0) {
      w = Number(r[weightCol]);
      if (!Number.isFinite(w) || w < 0) throw new Error(`Row ${i + 1}: the ${header[weightCol]} column must be a non-negative number.`);
      if (w === 0) return;
    }
    const x = new Int8Array(itemCols.length);
    const rr = [];
    itemCols.forEach((j, t) => {
      const v = r[j] ?? "";
      rr.push(v);
      if (key) {
        x[t] = MISSING.has(v.trim().toLowerCase()) ? -1 : v.trim().toLowerCase() === String(key[t]).trim().toLowerCase() ? 1 : 0;
      } else {
        const s = score01(v);
        if (s === null) throw new Error(`Row ${i + 1}, ${items[t]}: "${v}" is not 0 or 1. Raw answers need an answer key (a row whose first cell is "key", or the key option).`);
        x[t] = s;
      }
    });
    X.push(x);
    raw.push(rr);
    weights.push(w);
    ids.push(idCol >= 0 ? r[idCol] : `Row ${i + 1}`);
  });
  if (!X.length) throw new Error("No response rows.");
  const total = weights.reduce((s, v) => s + v, 0);
  if (total > LIMITS.maxPeople) throw new Error(`At most ${LIMITS.maxPeople.toLocaleString("en-US")} people.`);
  return { items, ids, weights, X, raw: key ? raw : null, key, n: total };
}

// ---------------------------------------------------------------- numerics

const logistic = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

function quadrature(nodes = LIMITS.quadNodes, bound = LIMITS.quadBound) {
  const theta = new Float64Array(nodes);
  const w = new Float64Array(nodes);
  let s = 0;
  for (let q = 0; q < nodes; q++) {
    theta[q] = -bound + (2 * bound * q) / (nodes - 1);
    w[q] = Math.exp(-0.5 * theta[q] * theta[q]);
    s += w[q];
  }
  for (let q = 0; q < nodes; q++) w[q] /= s;
  return { theta, w };
}

function solve(A, b) {
  // Gaussian elimination with partial pivoting; A is an array of rows.
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

function invert(A) {
  const n = A.length;
  const cols = [];
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const c = solve(A, e);
    if (!c) return null;
    cols.push(c);
  }
  return A.map((_, i) => cols.map((c) => c[i]));
}

function logGamma(x) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Upper tail of the chi-square distribution, P(X > x) with k degrees of freedom. */
export function chiSquareSurvival(x, k) {
  if (!(k > 0) || !Number.isFinite(x)) return null;
  if (x <= 0) return 1;
  const a = k / 2;
  const z = x / 2;
  const lg = logGamma(a);
  if (z < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= z / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-z + a * Math.log(z) - lg));
  }
  // Continued fraction (Lentz) for the upper incomplete gamma.
  let b = z + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.min(1, Math.exp(-z + a * Math.log(z) - lg) * h);
}

// ---------------------------------------------------------------- patterns

/** Collapse identical response rows into weighted patterns (fitting is per pattern). */
export function compressPatterns(X, weights) {
  const map = new Map();
  const patterns = [];
  const counts = [];
  const rowPattern = new Int32Array(X.length);
  X.forEach((x, i) => {
    const k = Array.from(x).join(",");
    let p = map.get(k);
    if (p === undefined) {
      p = patterns.length;
      map.set(k, p);
      patterns.push(x);
      counts.push(0);
    }
    counts[p] += weights[i];
    rowPattern[i] = p;
  });
  return { patterns, counts, rowPattern };
}

// ---------------------------------------------------------------- the model

/** Item response probabilities at every quadrature node, from slopes a and intercepts d (logit = a theta + d). */
function itemProbs(a, d, theta) {
  const J = a.length;
  const Q = theta.length;
  const P = [];
  for (let j = 0; j < J; j++) {
    const row = new Float64Array(Q);
    for (let q = 0; q < Q; q++) row[q] = logistic(a[j] * theta[q] + d[j]);
    P.push(row);
  }
  return P;
}

/**
 * E-step: posterior weights of every pattern over the nodes, the marginal
 * log-likelihood, and the expected attempts (n) and expected correct (r)
 * at each node for each item.
 */
function estep(pat, a, d, quad) {
  const { theta, w } = quad;
  const J = a.length;
  const Q = theta.length;
  const P = itemProbs(a, d, theta);
  const logP = P.map((row) => row.map((p) => Math.log(Math.max(p, 1e-300))));
  const log1P = P.map((row) => row.map((p) => Math.log(Math.max(1 - p, 1e-300))));
  const r = Array.from({ length: J }, () => new Float64Array(Q));
  const n = Array.from({ length: J }, () => new Float64Array(Q));
  const logw = Array.from(w, (v) => Math.log(v));
  let ll = 0;
  const post = [];
  const lp = new Float64Array(Q);
  for (let i = 0; i < pat.patterns.length; i++) {
    const x = pat.patterns[i];
    const c = pat.counts[i];
    let mx = -Infinity;
    for (let q = 0; q < Q; q++) {
      let s = logw[q];
      for (let j = 0; j < J; j++) {
        if (x[j] === 1) s += logP[j][q];
        else if (x[j] === 0) s += log1P[j][q];
      }
      lp[q] = s;
      if (s > mx) mx = s;
    }
    let tot = 0;
    const pq = new Float64Array(Q);
    for (let q = 0; q < Q; q++) { pq[q] = Math.exp(lp[q] - mx); tot += pq[q]; }
    for (let q = 0; q < Q; q++) pq[q] /= tot;
    ll += c * (mx + Math.log(tot));
    post.push(pq);
    for (let j = 0; j < J; j++) {
      if (x[j] < 0) continue;
      const nj = n[j];
      for (let q = 0; q < Q; q++) nj[q] += c * pq[q];
      if (x[j] === 1) { const rj = r[j]; for (let q = 0; q < Q; q++) rj[q] += c * pq[q]; }
    }
  }
  return { ll, r, n, post, P };
}

/** Score (gradient of the expected complete-data log-likelihood) per item: [d/da, d/dd]. */
function itemScore(rj, nj, a, d, theta) {
  let ga = 0;
  let gd = 0;
  for (let q = 0; q < theta.length; q++) {
    const p = logistic(a * theta[q] + d);
    const e = rj[q] - nj[q] * p;
    ga += e * theta[q];
    gd += e;
  }
  return [ga, gd];
}

function expectedItemLL(rj, nj, a, d, theta) {
  let s = 0;
  for (let q = 0; q < theta.length; q++) {
    const z = a * theta[q] + d;
    // log p = -log(1+e^-z), log(1-p) = -log(1+e^z)
    const lp = z >= 0 ? -Math.log1p(Math.exp(-z)) : z - Math.log1p(Math.exp(z));
    const l1p = z >= 0 ? -z - Math.log1p(Math.exp(-z)) : -Math.log1p(Math.exp(z));
    s += rj[q] * lp + (nj[q] - rj[q]) * l1p;
  }
  return s;
}

function mstep2pl(E, a, d, theta) {
  const J = a.length;
  const na = a.slice();
  const nd = d.slice();
  for (let j = 0; j < J; j++) {
    let aj = a[j];
    let dj = d[j];
    let cur = expectedItemLL(E.r[j], E.n[j], aj, dj, theta);
    for (let it = 0; it < 25; it++) {
      let ga = 0, gd = 0, haa = 0, had = 0, hdd = 0;
      for (let q = 0; q < theta.length; q++) {
        const p = logistic(aj * theta[q] + dj);
        const e = E.r[j][q] - E.n[j][q] * p;
        const v = E.n[j][q] * p * (1 - p);
        ga += e * theta[q]; gd += e;
        haa += v * theta[q] * theta[q]; had += v * theta[q]; hdd += v;
      }
      const det = haa * hdd - had * had;
      if (!(det > 1e-12)) break;
      let sa = (hdd * ga - had * gd) / det;
      let sd = (haa * gd - had * ga) / det;
      let step = 1;
      let next;
      for (let h = 0; h < 30; h++) {
        next = expectedItemLL(E.r[j], E.n[j], aj + step * sa, dj + step * sd, theta);
        if (next >= cur - 1e-12) break;
        step /= 2;
      }
      aj += step * sa; dj += step * sd;
      const moved = Math.abs(step * sa) + Math.abs(step * sd);
      cur = next;
      if (moved < 1e-10) break;
    }
    na[j] = aj; nd[j] = dj;
  }
  return { a: na, d: nd };
}

function mstep1pl(E, a, d, theta) {
  // Joint Newton on (common slope, J intercepts).
  const J = d.length;
  let A = a[0];
  let D = d.slice();
  const total = (A2, D2) => { let s = 0; for (let j = 0; j < J; j++) s += expectedItemLL(E.r[j], E.n[j], A2, D2[j], theta); return s; };
  let cur = total(A, D);
  for (let it = 0; it < 25; it++) {
    const g = new Array(J + 1).fill(0);
    const H = Array.from({ length: J + 1 }, () => new Array(J + 1).fill(0));
    for (let j = 0; j < J; j++) {
      for (let q = 0; q < theta.length; q++) {
        const p = logistic(A * theta[q] + D[j]);
        const e = E.r[j][q] - E.n[j][q] * p;
        const v = E.n[j][q] * p * (1 - p);
        g[0] += e * theta[q]; g[j + 1] += e;
        H[0][0] += v * theta[q] * theta[q]; H[0][j + 1] += v * theta[q]; H[j + 1][j + 1] += v;
      }
      H[j + 1][0] = H[0][j + 1];
    }
    const s = solve(H, g);
    if (!s) break;
    let step = 1;
    let next;
    for (let h = 0; h < 30; h++) {
      next = total(A + step * s[0], D.map((v, j) => v + step * s[j + 1]));
      if (next >= cur - 1e-12) break;
      step /= 2;
    }
    A += step * s[0];
    D = D.map((v, j) => v + step * s[j + 1]);
    cur = next;
    if (s.reduce((m, v) => m + Math.abs(step * v), 0) < 1e-10) break;
  }
  return { a: new Array(J).fill(A), d: D };
}

/**
 * Fit a 1PL or 2PL by marginal maximum likelihood (Bock & Aitkin 1981).
 * Returns slopes a, intercepts d, difficulties b = -d / a, the
 * log-likelihood, iteration count and whether EM converged.
 */
export function fitModel(pat, J, model = "2pl", opts = {}) {
  const quad = opts.quad || quadrature();
  const { theta } = quad;
  // Start: intercepts from the logit of each item's proportion correct, slope 1.
  const pc = new Array(J).fill(0);
  const nn = new Array(J).fill(0);
  pat.patterns.forEach((x, i) => { for (let j = 0; j < J; j++) if (x[j] >= 0) { nn[j] += pat.counts[i]; pc[j] += x[j] * pat.counts[i]; } });
  let a = new Array(J).fill(1);
  let d = pc.map((s, j) => { const p = Math.min(0.99, Math.max(0.01, s / nn[j])); return 1.3 * Math.log(p / (1 - p)); });
  const maxIter = opts.maxIter ?? 5000;
  const tol = opts.tol ?? 1e-9;
  let E = estep(pat, a, d, quad);
  let prev = E.ll;
  let it = 0;
  let converged = false;
  for (it = 1; it <= maxIter; it++) {
    const m = model === "1pl" ? mstep1pl(E, a, d, theta) : mstep2pl(E, a, d, theta);
    const change = m.a.reduce((s, v, j) => Math.max(s, Math.abs(v - a[j]), Math.abs(m.d[j] - d[j])), 0);
    a = m.a; d = m.d;
    E = estep(pat, a, d, quad);
    if (Math.abs(E.ll - prev) < tol * (1 + Math.abs(prev)) && change < 1e-6) { converged = true; break; }
    prev = E.ll;
  }
  return { model, a, d, b: a.map((v, j) => -d[j] / v), ll: E.ll, iterations: Math.min(it, maxIter), converged, E, quad };
}

/** Marginal log-likelihood of slopes a and intercepts d (logit = a theta + d). */
export function marginalLogLik(pat, a, d) {
  return estep(pat, a, d, quadrature()).ll;
}

/** The exact marginal score at (a, d), by Fisher's identity: the expected complete-data score under the posterior at those values. */
function marginalScore(pat, a, d, quad, model) {
  const E = estep(pat, a, d, quad);
  const J = a.length;
  if (model === "1pl") {
    const g = new Array(J + 1).fill(0);
    for (let j = 0; j < J; j++) {
      const [ga, gd] = itemScore(E.r[j], E.n[j], a[j], d[j], quad.theta);
      g[0] += ga; g[j + 1] = gd;
    }
    return g;
  }
  const g = [];
  for (let j = 0; j < J; j++) g.push(...itemScore(E.r[j], E.n[j], a[j], d[j], quad.theta));
  return g;
}

/** Covariance of the estimates from the observed information (central differences of the exact score). */
export function standardErrors(pat, fit) {
  const { a, d, quad, model } = fit;
  const J = a.length;
  const pack = model === "1pl" ? [a[0], ...d] : a.flatMap((v, j) => [v, d[j]]);
  const unpack = (p) => (model === "1pl" ? { a: new Array(J).fill(p[0]), d: p.slice(1) } : { a: p.filter((_, i) => i % 2 === 0), d: p.filter((_, i) => i % 2 === 1) });
  const k = pack.length;
  const H = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    const h = 1e-4 * Math.max(1, Math.abs(pack[i]));
    const up = pack.slice(); up[i] += h;
    const dn = pack.slice(); dn[i] -= h;
    const u = unpack(up), v = unpack(dn);
    const gu = marginalScore(pat, u.a, u.d, quad, model);
    const gd = marginalScore(pat, v.a, v.d, quad, model);
    for (let r = 0; r < k; r++) H[r][i] = -(gu[r] - gd[r]) / (2 * h);
  }
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const m = (H[i][j] + H[j][i]) / 2; H[i][j] = H[j][i] = m; }
  const C = invert(H);
  if (!C || C.some((row, i) => !(row[i] > 0))) return null;
  const items = [];
  for (let j = 0; j < J; j++) {
    const ia = model === "1pl" ? 0 : 2 * j;
    const id = model === "1pl" ? j + 1 : 2 * j + 1;
    const va = C[ia][ia], vd = C[id][id], cad = C[ia][id];
    const aj = a[j], bj = -d[j] / a[j];
    // b = -d / a: gradient (db/da, db/dd) = (-b / a, -1 / a)
    const vb = (bj * bj * va + vd + 2 * bj * cad) / (aj * aj);
    items.push({ a: Math.sqrt(va), d: Math.sqrt(vd), b: vb > 0 ? Math.sqrt(vb) : null });
  }
  return { items, cov: C };
}

// ---------------------------------------------------------------- scoring and fit

/** Lord-Wingersky: P(summed score = s | theta_q) over items in `which`, for every node. */
export function summedScoreDistribution(P, which, Q) {
  const out = [];
  for (let q = 0; q < Q; q++) {
    let f = [1];
    for (const j of which) {
      const p = P[j][q];
      const g = new Array(f.length + 1).fill(0);
      for (let s = 0; s < f.length; s++) { g[s] += f[s] * (1 - p); g[s + 1] += f[s] * p; }
      f = g;
    }
    out.push(f);
  }
  return out; // out[q][s]
}

/** Summed score to EAP ability (Thissen et al. 1995). */
export function scoreTable(P, quad) {
  const J = P.length;
  const Q = quad.theta.length;
  const L = summedScoreDistribution(P, [...Array(J).keys()], Q);
  const rows = [];
  for (let s = 0; s <= J; s++) {
    let m = 0, m2 = 0, t = 0;
    for (let q = 0; q < Q; q++) { const v = L[q][s] * quad.w[q]; t += v; m += v * quad.theta[q]; m2 += v * quad.theta[q] ** 2; }
    m /= t;
    rows.push({ score: s, eap: m, psd: Math.sqrt(Math.max(0, m2 / t - m * m)), expectedShare: t });
  }
  return rows;
}

/** S-X2 item fit (Orlando & Thissen 2000) for complete data. */
export function sx2(pat, fit) {
  const J = fit.a.length;
  const { P, quad } = { P: fit.E.P, quad: fit.quad };
  const Q = quad.theta.length;
  const all = [...Array(J).keys()];
  const Lall = summedScoreDistribution(P, all, Q);
  const Nk = new Array(J + 1).fill(0);
  const obs = Array.from({ length: J }, () => new Array(J + 1).fill(0));
  pat.patterns.forEach((x, i) => {
    let s = 0;
    for (let j = 0; j < J; j++) s += x[j];
    Nk[s] += pat.counts[i];
    for (let j = 0; j < J; j++) if (x[j] === 1) obs[j][s] += pat.counts[i];
  });
  const denom = new Array(J + 1).fill(0);
  for (let s = 0; s <= J; s++) for (let q = 0; q < Q; q++) denom[s] += Lall[q][s] * quad.w[q];
  const nPar = fit.model === "1pl" ? 1 : 2;
  return all.map((j) => {
    const others = all.filter((t) => t !== j);
    const Lo = summedScoreDistribution(P, others, Q);
    const groups = [];
    let g = { N: 0, O: 0, E: 0 };
    for (let k = 1; k <= J - 1; k++) {
      let num = 0;
      for (let q = 0; q < Q; q++) num += P[j][q] * Lo[q][k - 1] * quad.w[q];
      const e = num / denom[k];
      g.N += Nk[k]; g.O += obs[j][k]; g.E += Nk[k] * e;
      if (g.E >= 1 && g.N - g.E >= 1) { groups.push(g); g = { N: 0, O: 0, E: 0 }; }
    }
    if (g.N > 0) {
      if (groups.length) { const last = groups[groups.length - 1]; last.N += g.N; last.O += g.O; last.E += g.E; } else groups.push(g);
    }
    let x2 = 0;
    for (const G of groups) {
      if (G.N <= 0) continue;
      const pe = G.E / G.N;
      x2 += (G.O - G.E) ** 2 / (G.N * pe * (1 - pe));
    }
    const df = groups.length - nPar;
    return df >= 1 ? { statistic: x2, df, p: chiSquareSurvival(x2, df), groups: groups.length } : { statistic: null, df: null, p: null, groups: groups.length };
  });
}

/** Test information and the standard error of measurement along ability. */
export function testInformation(a, d, from = -4, to = 4, step = 0.1) {
  const out = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const theta = Math.round(t * 1e6) / 1e6;
    let info = 0;
    const per = a.map((aj, j) => { const p = logistic(aj * theta + d[j]); const v = aj * aj * p * (1 - p); info += v; return v; });
    out.push({ theta, info, se: 1 / Math.sqrt(info), items: per });
  }
  return out;
}

// ---------------------------------------------------------------- classical

function classical(data) {
  const { X, weights, items } = data;
  const J = items.length;
  const out = [];
  for (let j = 0; j < J; j++) {
    let n = 0, c = 0;
    let sw = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    X.forEach((x, i) => {
      if (x[j] < 0) return;
      const w = weights[i];
      n += w; c += w * x[j];
      if (x.some((v) => v < 0)) return;
      let rest = 0;
      for (let t = 0; t < J; t++) if (t !== j) rest += x[t];
      sw += w; sx += w * x[j]; sy += w * rest; sxx += w * x[j] * x[j]; syy += w * rest * rest; sxy += w * x[j] * rest;
    });
    const cov = sxy / sw - (sx / sw) * (sy / sw);
    const vx = sxx / sw - (sx / sw) ** 2;
    const vy = syy / sw - (sy / sw) ** 2;
    out.push({ item: items[j], answered: n, pCorrect: n ? c / n : null, itemRest: vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null });
  }
  return out;
}

/** Distractor table: for each item, each answer's share and the mean rest score of those choosing it. */
function distractors(data) {
  if (!data.raw) return null;
  const J = data.items.length;
  return data.items.map((item, j) => {
    const by = new Map();
    let total = 0;
    data.raw.forEach((r, i) => {
      const v = r[j].trim() === "" || MISSING.has(r[j].trim().toLowerCase()) ? "(blank)" : r[j].trim().toUpperCase();
      let rest = 0, seen = 0;
      for (let t = 0; t < J; t++) if (t !== j && data.X[i][t] >= 0) { rest += data.X[i][t]; seen++; }
      const e = by.get(v) || { answer: v, n: 0, restSum: 0 };
      e.n += data.weights[i];
      e.restSum += data.weights[i] * (seen ? (rest / seen) * (J - 1) : 0);
      by.set(v, e);
      total += data.weights[i];
    });
    const key = String(data.key[j]).trim().toUpperCase();
    const options = [...by.values()].sort((x, y) => (x.answer < y.answer ? -1 : 1)).map((e) => ({ answer: e.answer, keyed: e.answer === key, share: e.n / total, meanRest: e.restSum / e.n }));
    const keyed = options.find((o) => o.keyed);
    const flagged = options.filter((o) => !o.keyed && o.answer !== "(blank)" && keyed && o.meanRest > keyed.meanRest && o.share >= 0.05);
    // The answer chosen by the strongest group (among answers at least 5% chose): a candidate key when it is not the key.
    const strongest = options.filter((o) => o.answer !== "(blank)" && o.share >= 0.05).reduce((x, y) => (!x || y.meanRest > x.meanRest ? y : x), null);
    return { item, key, options, flagged: flagged.map((o) => o.answer), strongest: strongest ? strongest.answer : null };
  });
}

// ---------------------------------------------------------------- analysis

function eapForPatterns(fit) {
  const { theta } = fit.quad;
  return fit.E.post.map((pq) => {
    let m = 0, m2 = 0;
    for (let q = 0; q < theta.length; q++) { m += pq[q] * theta[q]; m2 += pq[q] * theta[q] ** 2; }
    return { eap: m, psd: Math.sqrt(Math.max(0, m2 - m * m)) };
  });
}

function describeFit(fit, pat, n, J, withSE) {
  const k = fit.model === "1pl" ? J + 1 : 2 * J;
  const se = withSE ? standardErrors(pat, fit) : null;
  return {
    model: fit.model,
    logLik: fit.ll,
    parameters: k,
    aic: -2 * fit.ll + 2 * k,
    bic: -2 * fit.ll + Math.log(n) * k,
    iterations: fit.iterations,
    converged: fit.converged,
    se,
  };
}

/**
 * Run the whole analysis. Options: model "auto" | "1pl" | "2pl" (auto fits
 * both and keeps the lower BIC), key (answer key for raw answers),
 * standardErrors (default true), maxIter.
 */
export function analyze(input = {}) {
  const data = input.data || parseResponses(input.text, { key: input.key });
  const J = data.items.length;
  const pat = compressPatterns(data.X, data.weights);
  const complete = data.X.every((x) => x.every((v) => v >= 0));
  const warnings = [];
  const cls = classical(data);
  const bad = cls.filter((c) => c.pCorrect === 0 || c.pCorrect === 1 || c.answered === 0);
  if (bad.length) throw new Error(`Every item needs at least one right and one wrong answer to be fitted: ${bad.map((c) => c.item).join(", ")} ${bad.length > 1 ? "do" : "does"} not. Remove ${bad.length > 1 ? "them" : "it"} and run again.`);
  if (data.n < LIMITS.minPeople) throw new Error(`At least ${LIMITS.minPeople} people are needed to fit an IRT model; with ${data.n} the estimates run away. Item p-values and item-rest correlations are the better guide at that size.`);
  if (data.n < 100) warnings.push(`Only ${data.n} people: IRT estimates from fewer than a few hundred people are rough. The standard errors show how rough; the classical table is the steadier guide at this size.`);
  const choice = String(input.model || "auto").toLowerCase();
  if (!["auto", "1pl", "2pl", "rasch"].includes(choice)) throw new Error('model must be "auto", "1pl" (or "rasch") or "2pl".');
  const withSE = input.standardErrors !== false;
  const opts = { maxIter: input.maxIter };
  const fits = {};
  if (choice !== "2pl") fits["1pl"] = fitModel(pat, J, "1pl", opts);
  if (choice === "auto" || choice === "2pl") fits["2pl"] = fitModel(pat, J, "2pl", opts);
  const summaries = Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, describeFit(f, pat, data.n, J, withSE)]));
  let chosen = choice === "rasch" ? "1pl" : choice;
  if (choice === "auto") chosen = summaries["2pl"].bic < summaries["1pl"].bic ? "2pl" : "1pl";
  const fit = fits[chosen];
  const S = summaries[chosen];
  for (const [k, f] of Object.entries(fits)) if (!f.converged) warnings.push(`The ${k.toUpperCase()} did not converge in ${f.iterations} EM iterations; treat its estimates as approximate.`);

  let comparison = null;
  if (fits["1pl"] && fits["2pl"]) {
    const lr = Math.max(0, 2 * (fits["2pl"].ll - fits["1pl"].ll));
    comparison = { lr, df: J - 1, p: chiSquareSurvival(lr, J - 1), bic1pl: summaries["1pl"].bic, bic2pl: summaries["2pl"].bic, aic1pl: summaries["1pl"].aic, aic2pl: summaries["2pl"].aic, chosen };
  }

  const fitStats = complete ? sx2(pat, fit) : null;
  if (!complete) warnings.push("Some answers are missing: the fit treats them as not presented (missing at random). S-X2 item fit and the score table need complete answers and are left out.");
  const itemRows = data.items.map((item, j) => {
    const se = S.se?.items[j];
    const f = fitStats?.[j];
    const flags = [];
    if (fit.a[j] < 0) flags.push("negative slope: people who do well overall are less likely to get this right (check the key)");
    else if (fit.a[j] < 0.5) flags.push("weak slope: tells strong and weak apart poorly");
    if (fit.b[j] < -3) flags.push("very easy");
    if (fit.b[j] > 3) flags.push("very hard");
    if (f && f.p !== null && f.p < 0.01) flags.push("misfit (S-X2 p < 0.01)");
    if (fit.a[j] > 6) flags.push("very steep slope: possibly an estimate running away; check with more people");
    return {
      item,
      a: fit.a[j], aSE: se?.a ?? null,
      b: fit.b[j], bSE: se?.b ?? null,
      d: fit.d[j],
      pCorrect: cls[j].pCorrect,
      itemRest: cls[j].itemRest,
      answered: cls[j].answered,
      sx2: f?.statistic ?? null, sx2df: f?.df ?? null, sx2p: f?.p ?? null,
      flags,
    };
  });

  const eaps = eapForPatterns(fit);
  const people = data.ids.map((id, i) => {
    const x = data.X[i];
    let s = 0, seen = 0;
    for (const v of x) if (v >= 0) { s += v; seen++; }
    const e = eaps[pat.rowPattern[i]];
    return { id, weight: data.weights[i], score: s, answered: seen, eap: e.eap, psd: e.psd };
  });
  let mw = 0, m = 0, m2 = 0, ev = 0;
  for (const p of people) { mw += p.weight; m += p.weight * p.eap; m2 += p.weight * p.eap ** 2; ev += p.weight * p.psd ** 2; }
  const varEap = m2 / mw - (m / mw) ** 2;
  const marginalReliability = varEap / (varEap + ev / mw);
  const info = testInformation(fit.a, fit.d);
  const peak = info.reduce((best, r) => (r.info > best.info ? r : best), info[0]);
  const table = complete ? scoreTable(fit.E.P, fit.quad) : null;

  return {
    n: data.n,
    rows: data.X.length,
    patterns: pat.patterns.length,
    items: J,
    itemNames: data.items,
    complete,
    keyed: Boolean(data.key),
    model: chosen,
    fit: S,
    fits: summaries,
    comparison,
    itemTable: itemRows,
    rasch: chosen === "1pl" ? { abilitySD: fit.a[0], difficulties: fit.b.slice() } : null,
    people,
    scoreTable: table,
    information: { curve: info, peakTheta: peak.theta, peakInfo: peak.info, peakSE: peak.se },
    marginalReliability,
    distractors: distractors(data),
    warnings,
    quadrature: { nodes: fit.quad.theta.length, bound: LIMITS.quadBound },
  };
}

// ---------------------------------------------------------------- reporting

const f2 = (v) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(2));
const fp = (v) => (v == null ? "–" : v < 0.001 ? "<0.001" : v.toFixed(3));

/** Plain-language headline for a result. */
export function summarize(r) {
  const lines = [];
  const name = r.model === "2pl" ? "2PL (a slope and a difficulty per item)" : "1PL (one shared slope, a difficulty per item)";
  lines.push(`${r.n.toLocaleString("en-US")} people, ${r.items} items: the ${name} fits best by BIC${r.comparison ? `; likelihood-ratio test of 2PL against 1PL: chi-square ${f2(r.comparison.lr)} on ${r.comparison.df} df, p = ${fp(r.comparison.p)}` : ""}.`);
  const easiest = r.itemTable.reduce((x, y) => (y.b < x.b ? y : x));
  const hardest = r.itemTable.reduce((x, y) => (y.b > x.b ? y : x));
  lines.push(`Easiest item ${easiest.item} (difficulty ${f2(easiest.b)}), hardest ${hardest.item} (${f2(hardest.b)}), on a scale where the average person is at 0 and most people lie between -2 and 2.`);
  lines.push(`The test measures most precisely at ability ${f2(r.information.peakTheta)} (standard error ${f2(r.information.peakSE)}); marginal reliability ${f2(r.marginalReliability)}.`);
  const flagged = r.itemTable.filter((i) => i.flags.length);
  if (flagged.length) lines.push(`Look at: ${flagged.map((i) => `${i.item} (${i.flags.join("; ")})`).join(", ")}.`);
  else lines.push("No item is flagged.");
  if (r.distractors) {
    const d = r.distractors.filter((x) => x.flagged.length);
    if (d.length) lines.push(`Distractors chosen by stronger students than the key: ${d.map((x) => `${x.item} ${x.flagged.join("/")}`).join(", ")}. Check those keys and wordings.`);
  }
  return lines;
}

/** A CSV cell, quoted when needed, with a leading apostrophe on text that a spreadsheet would run as a formula. */
export function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const c3 = (v) => (v == null || !Number.isFinite(v) ? "" : v.toFixed(3));
const cp = (v) => (v == null ? "" : v.toPrecision(4));

export function itemCsv(r) {
  const head = "item,a,a_se,b,b_se,p_correct,item_rest_r,sx2,sx2_df,sx2_p,flags";
  return [head, ...r.itemTable.map((i) => [i.item, c3(i.a), c3(i.aSE), c3(i.b), c3(i.bSE), c3(i.pCorrect), c3(i.itemRest), c3(i.sx2), i.sx2df ?? "", cp(i.sx2p), i.flags.join("; ")].map(csvCell).join(","))].join("\n") + "\n";
}

export function peopleCsv(r) {
  const head = "id,weight,score,answered,eap,posterior_sd";
  return [head, ...r.people.map((p) => [p.id, p.weight, p.score, p.answered, c3(p.eap), c3(p.psd)].map(csvCell).join(","))].join("\n") + "\n";
}

export function report(r) {
  const out = ["# Item response theory report", "", ...summarize(r).map((l) => `- ${l}`), ""];
  out.push("| Item | a (slope) | SE | b (difficulty) | SE | p correct | item-rest r | S-X2 (df) | p |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const i of r.itemTable) out.push(`| ${i.item} | ${f2(i.a)} | ${f2(i.aSE)} | ${f2(i.b)} | ${f2(i.bSE)} | ${f2(i.pCorrect)} | ${f2(i.itemRest)} | ${i.sx2 == null ? "–" : `${f2(i.sx2)} (${i.sx2df})`} | ${fp(i.sx2p)} |`);
  if (r.scoreTable) {
    out.push("", "| Summed score | EAP ability | Posterior SD |", "| --- | --- | --- |");
    for (const s of r.scoreTable) out.push(`| ${s.score} | ${f2(s.eap)} | ${f2(s.psd)} |`);
  }
  if (r.warnings.length) out.push("", ...r.warnings.map((w) => `> ${w}`));
  out.push("", "A statistical estimate from the answers given, not a substitute for a psychometrician's review of a high-stakes test. No warranty.");
  return out.join("\n") + "\n";
}
