// Isolation forest: which rows of a table are unusual? (Liu, Ting & Zhou
// 2008; journal version 2012.) Anomalies are few and different, so random
// axis-parallel cuts isolate them in fewer steps than ordinary rows; the
// anomaly score is 2^(-E[h(x)] / c(psi)), where E[h(x)] is the average path
// length over an ensemble of random trees grown on small subsamples.
// Pure functions, no DOM, no network; randomness comes only from a seeded
// generator, so the same seed gives the same forest. Implemented from the
// papers' algorithms (iForest, iTree, PathLength); no third-party code was
// ported. scikit-learn's IsolationForest was used only to produce
// eval/reference.json, which the tests compare against.

export const PAPERS = [
  {
    authors: "Fei Tony Liu, Kai Ming Ting, Zhi-Hua Zhou",
    title: "Isolation Forest",
    venue: "Proceedings of the 8th IEEE International Conference on Data Mining (ICDM 2008), 413-422",
    year: 2008,
    url: "https://doi.org/10.1109/ICDM.2008.17",
    doi: "10.1109/ICDM.2008.17",
    implemented:
      "Algorithm 1 (iForest: t trees, each on a subsample of psi rows drawn without replacement, height limit ceil(log2 psi)), Algorithm 2 (iTree: pick an attribute at random, split at a value drawn uniformly between its minimum and maximum in the node, recurse until one row is left, all rows are identical, or the height limit is reached) and Algorithm 3 (PathLength: edges to the external node plus c(size) for the unbuilt subtree), with the anomaly score s(x, psi) = 2^(-E[h(x)] / c(psi)) and c(n) = 2H(n - 1) - 2(n - 1)/n, H(i) ~ ln(i) + 0.5772156649. Defaults t = 100 and psi = 256 are the paper's.",
    deviations:
      "The attribute is drawn among those that are not constant in the node (a constant attribute cannot split; the paper's pseudo-code leaves this case open), and a node whose rows are all identical is a leaf. c(2) = 1 (the exact value; the ln approximation gives 0.15) and c(n) = 0 for n < 2, as in scikit-learn. Missing values are filled with the column median before fitting, which the paper does not cover.",
  },
  {
    authors: "Fei Tony Liu, Kai Ming Ting, Zhi-Hua Zhou",
    title: "Isolation-Based Anomaly Detection",
    venue: "ACM Transactions on Knowledge Discovery from Data 6(1), article 3",
    year: 2012,
    url: "https://doi.org/10.1145/2133360.2133363",
    doi: "10.1145/2133360.2133363",
    implemented: "The journal version's presentation of the same algorithms and score; used for the reading of s: close to 1 means anomaly, well below 0.5 means normal, and all scores near 0.5 means no distinct anomaly.",
    deviations: "Its SCiForest variant (split-selection criterion, hyperplanes) is not implemented.",
  },
];

export const DEFAULTS = {
  trees: 100,
  sampleSize: 256,
  seed: 42,
  // "auto": flag rows with score > 0.5, scikit-learn's contamination="auto".
  // A number in (0, 0.5]: flag that share of rows with the highest scores.
  contamination: "auto",
  top: 20,
};

const EULER = 0.5772156649015329;

/** Average path length of an unsuccessful search in a binary search tree of n points (the paper's c(n)). */
export function averagePathLength(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + EULER) - (2 * (n - 1)) / n;
}

/** mulberry32: a small, fast, seedable 32-bit generator. Returns floats in [0, 1). */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ forest
// A tree is stored flat: for node k, feat[k] = -1 marks a leaf whose
// size[k] rows were left when growth stopped; otherwise rows with
// x[feat] < thr[k] go to left[k] and the rest to right[k].

function growTree(X, d, idx, limit, rand) {
  const feat = [], thr = [], left = [], right = [], size = [];
  const lo = new Float64Array(d), hi = new Float64Array(d);
  const live = new Int32Array(d);
  function node(rows, depth) {
    const k = feat.length;
    feat.push(-1); thr.push(0); left.push(-1); right.push(-1); size.push(rows.length);
    if (depth >= limit || rows.length <= 1) return k;
    lo.fill(Infinity); hi.fill(-Infinity);
    for (const r of rows) {
      const x = X[r];
      for (let j = 0; j < d; j++) {
        const v = x[j];
        if (v < lo[j]) lo[j] = v;
        if (v > hi[j]) hi[j] = v;
      }
    }
    let m = 0;
    for (let j = 0; j < d; j++) if (hi[j] > lo[j]) live[m++] = j;
    if (m === 0) return k; // every row identical: nothing can split them
    const q = live[Math.floor(rand() * m)];
    const a = lo[q], b = hi[q];
    let p = a + rand() * (b - a);
    if (p <= a) p = (a + b) / 2; // rand() = 0 would send every row right
    const L = [], R = [];
    for (const r of rows) (X[r][q] < p ? L : R).push(r);
    feat[k] = q; thr[k] = p;
    left[k] = node(L, depth + 1);
    right[k] = node(R, depth + 1);
    return k;
  }
  node(idx, 0);
  return { feat: Int32Array.from(feat), thr: Float64Array.from(thr), left: Int32Array.from(left), right: Int32Array.from(right), size: Int32Array.from(size) };
}

/**
 * Grow an isolation forest on X (array of numeric rows, no missing values).
 * Options: { trees, sampleSize, seed }. Returns a model that `pathLengths`
 * and `scoreRows` accept.
 */
export function fitForest(X, opts = {}) {
  const n = X.length;
  if (!n) throw new Error("No rows to fit.");
  const d = X[0].length;
  const trees = Math.max(1, Math.floor(opts.trees ?? DEFAULTS.trees));
  const psi = Math.max(1, Math.min(n, Math.floor(opts.sampleSize ?? DEFAULTS.sampleSize)));
  const limit = Math.ceil(Math.log2(Math.max(psi, 2)));
  const rand = rng(opts.seed ?? DEFAULTS.seed);
  const pool = Int32Array.from({ length: n }, (_, i) => i);
  const forest = [];
  for (let t = 0; t < trees; t++) {
    // Partial Fisher-Yates: the first psi entries become a uniform sample without replacement.
    for (let i = 0; i < psi; i++) {
      const j = i + Math.floor(rand() * (n - i));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    forest.push(growTree(X, d, Array.from(pool.subarray(0, psi)), limit, rand));
  }
  return { trees: forest, sampleSize: psi, heightLimit: limit, dims: d, cPsi: averagePathLength(psi) };
}

/** Mean path length E[h(x)] of each row over the forest, plus per-feature split counts along the paths. */
export function pathLengths(model, X) {
  const d = model.dims;
  const mean = new Float64Array(X.length);
  const splits = X.map(() => new Float64Array(d));
  for (const tr of model.trees) {
    for (let i = 0; i < X.length; i++) {
      const x = X[i];
      let k = 0, e = 0;
      while (tr.feat[k] >= 0) {
        const q = tr.feat[k];
        splits[i][q] += 1;
        k = x[q] < tr.thr[k] ? tr.left[k] : tr.right[k];
        e++;
      }
      mean[i] += e + averagePathLength(tr.size[k]);
    }
  }
  const t = model.trees.length;
  for (let i = 0; i < X.length; i++) {
    mean[i] /= t;
    for (let j = 0; j < d; j++) splits[i][j] /= t;
  }
  return { mean: Array.from(mean), splits: splits.map((s) => Array.from(s)) };
}

/** Anomaly scores s(x, psi) = 2^(-E[h(x)] / c(psi)) in (0, 1]. */
export function scoreRows(model, X) {
  const { mean } = pathLengths(model, X);
  if (model.cPsi === 0) return mean.map(() => 0.5);
  return mean.map((h) => 2 ** (-h / model.cPsi));
}

/** Area under the ROC curve of scores against 0/1 labels (ties count half). */
export function auc(scores, labels) {
  const pairs = scores.map((s, i) => [s, labels[i] ? 1 : 0]).sort((a, b) => a[0] - b[0]);
  let pos = 0, neg = 0, rankSum = 0;
  for (let i = 0; i < pairs.length; ) {
    let j = i;
    while (j < pairs.length && pairs[j][0] === pairs[i][0]) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (pairs[k][1]) { rankSum += avgRank; pos++; } else neg++;
    i = j;
  }
  if (!pos || !neg) return null;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

// --------------------------------------------------------------------- CSV

const isMissing = (s) => /^\s*(|na|n\/a|nan|null|none|\?|-)\s*$/i.test(String(s ?? ""));
const numText = (s) => String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,%\s]/g, "");
const isNum = (s) => {
  const t = numText(s);
  return t !== "" && Number.isFinite(Number(t));
};

function splitLine(line, delim) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parse a delimited table with a header row (comma, tab or semicolon). Headerless numeric tables get c1, c2, ... */
export function parseCsv(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with a header row and at least one numeric column." };
  const delim = ["\t", ";", ","].map((dl) => [dl, splitLine(lines[0], dl).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  let columns, start = 1, headerless = false;
  if (cells[0].every((c) => isNum(c) || isMissing(c))) {
    columns = cells[0].map((_, i) => `c${i + 1}`);
    start = 0;
    headerless = true;
  } else {
    columns = cells[0].map((c, i) => c || `c${i + 1}`);
    const seen = new Set();
    for (const c of columns) {
      if (seen.has(c)) return { error: `Column name "${c}" appears twice in the header. Rename one of them.` };
      seen.add(c);
    }
  }
  const rows = [];
  for (let i = start; i < cells.length; i++) {
    if (cells[i].length !== columns.length) return { error: `Line ${i + 1} has ${cells[i].length} fields but the header has ${columns.length}. Check the delimiter and quoting.` };
    rows.push(cells[i]);
  }
  if (!rows.length) return { error: "The CSV has a header but no data rows." };
  return { columns, rows, headerless, delimiter: delim };
}

const ID_NAME = /^(#|id|.*[ _-]id|index|row|row ?number|record)$/i;

/** Describe each column: numeric, share missing, distinct values, and whether it looks like an ID or a category code. */
export function profileColumns(parsed) {
  return parsed.columns.map((name, j) => {
    const cells = parsed.rows.map((r) => r[j]);
    const present = cells.filter((c) => !isMissing(c));
    const numeric = present.length > 0 && present.every(isNum);
    const values = numeric ? present.map((c) => Number(numText(c))) : [];
    const distinct = new Set(numeric ? values : present).size;
    const integer = numeric && values.every(Number.isInteger);
    const increasing = integer && values.length > 2 && values.every((v, i) => i === 0 || v > values[i - 1]);
    const idLike = ID_NAME.test(name.trim()) || increasing;
    const code = integer && !idLike && distinct <= 3 && present.length >= 10;
    return { name, numeric, missing: cells.length - present.length, distinct, idLike, code };
  });
}

function median(sorted) {
  const n = sorted.length;
  if (!n) return NaN;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

const listOf = (v) => (Array.isArray(v) ? v.map(String) : String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean));

export const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e9 || a < 1e-3)) return v.toExponential(2);
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return Number(v.toPrecision(Math.max(digits, Math.ceil(Math.log10(a + 1)) + 1))).toLocaleString("en-US", { maximumFractionDigits: 6 });
};

/** One CSV cell, with a spreadsheet formula-injection guard on text that starts with = + - @ tab or CR. */
export function csvCell(c) {
  let s = String(c ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Score every row of a table. Input: { csv | rows (array of objects or of
 * arrays, with `columns`), columns? (features to use), labelColumn?,
 * trees?, sampleSize?, seed?, contamination? ("auto" or a share such as
 * 0.05), top? }. Returns per-row scores, the flagged rows with the features
 * that stand out, a score histogram and a plain-language summary;
 * { error } when the input cannot be scored.
 */
export function analyze(input = {}) {
  const warnings = [];
  let parsed;
  if (Array.isArray(input.rows)) {
    if (!input.rows.length) return { error: "rows is empty." };
    if (Array.isArray(input.rows[0])) {
      const columns = Array.isArray(input.columnNames) ? input.columnNames.map(String) : input.rows[0].map((_, i) => `c${i + 1}`);
      parsed = { columns, rows: input.rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v)))) };
    } else {
      const columns = Object.keys(input.rows[0]);
      parsed = { columns, rows: input.rows.map((o) => columns.map((c) => (o[c] === null || o[c] === undefined ? "" : String(o[c])))) };
    }
  } else {
    parsed = parseCsv(input.csv);
    if (parsed.error) return { error: parsed.error };
  }
  const prof = profileColumns(parsed);
  const byName = new Map(prof.map((p, j) => [p.name, j]));

  // Feature columns: as given, or every numeric column that is not an ID or a small category code.
  let features;
  const asked = listOf(input.columns);
  if (asked.length) {
    for (const c of asked) {
      if (!byName.has(c)) return { error: `There is no column "${c}". Columns: ${parsed.columns.join(", ")}.` };
      if (!prof[byName.get(c)].numeric) return { error: `Column "${c}" is not numeric, so it cannot be used as a feature.` };
    }
    features = asked.map((c) => byName.get(c));
  } else {
    features = prof.map((p, j) => (p.numeric && !p.idLike && !p.code ? j : -1)).filter((j) => j >= 0);
    const skipped = prof.filter((p) => p.numeric && (p.idLike || p.code));
    if (skipped.length) warnings.push(`Left out ${skipped.map((p) => `"${p.name}" (${p.idLike ? "looks like an ID" : `a code with ${p.distinct} values`})`).join(", ")}. Choose the columns yourself to include ${skipped.length === 1 ? "it" : "them"}.`);
    const text = prof.filter((p) => !p.numeric);
    if (text.length) warnings.push(`Text column${text.length === 1 ? "" : "s"} ${text.map((p) => `"${p.name}"`).join(", ")} ${text.length === 1 ? "is" : "are"} not used as features.`);
  }
  if (!features.length) return { error: "No numeric columns to score. The tool needs at least one column of numbers." };

  let labelIdx = -1;
  if (input.labelColumn) {
    if (!byName.has(String(input.labelColumn))) return { error: `There is no column "${input.labelColumn}" to use as the row label.` };
    labelIdx = byName.get(String(input.labelColumn));
  } else {
    labelIdx = prof.findIndex((p) => p.idLike || !p.numeric);
  }
  const lineOffset = parsed.headerless ? 1 : 2;
  const labels = parsed.rows.map((r, i) => (labelIdx >= 0 && !isMissing(r[labelIdx]) ? r[labelIdx] : `row ${i + 1}`));

  // Numeric matrix; missing cells filled with the column median.
  const n = parsed.rows.length;
  const names = features.map((j) => parsed.columns[j]);
  const X = parsed.rows.map(() => new Array(features.length));
  const filled = [];
  const med = [], mad = [];
  features.forEach((j, f) => {
    const vals = [];
    for (let i = 0; i < n; i++) {
      const c = parsed.rows[i][j];
      const v = isMissing(c) ? NaN : Number(numText(c));
      X[i][f] = v;
      if (Number.isFinite(v)) vals.push(v);
    }
    vals.sort((a, b) => a - b);
    const m = median(vals);
    med.push(m);
    let miss = 0;
    for (let i = 0; i < n; i++) if (!Number.isFinite(X[i][f])) { X[i][f] = m; miss++; }
    if (miss) filled.push({ column: names[f], count: miss });
    const dev = vals.map((v) => Math.abs(v - m)).sort((a, b) => a - b);
    let s = 1.4826 * median(dev);
    if (!(s > 0)) s = (1.2533 * dev.reduce((a, b) => a + b, 0)) / Math.max(1, dev.length); // MAD 0: mean absolute deviation
    mad.push(s > 0 ? s : 0);
  });
  if (filled.length) warnings.push(`Missing values were filled with the column median: ${filled.map((f) => `${f.count} in "${f.column}"`).join(", ")}.`);
  if (n < 8) return { error: `Only ${plural(n, "row")}. An isolation forest needs a few dozen rows at least to tell usual from unusual.` };
  if (n < 50) warnings.push(`Only ${plural(n, "row")}: scores from so few rows are rough; treat the ranking as a hint.`);
  const constant = names.filter((_, f) => X.every((x) => x[f] === X[0][f]));
  if (constant.length === names.length) return { error: "Every feature column holds a single value in every row, so no row differs from another." };
  if (constant.length) warnings.push(`${constant.map((c) => `"${c}"`).join(", ")} ${constant.length === 1 ? "has" : "have"} the same value in every row and cannot help.`);

  const trees = Math.floor(Number(input.trees ?? DEFAULTS.trees));
  if (!(trees >= 1 && trees <= 20000)) return { error: "trees must be a whole number from 1 to 20,000." };
  const sampleSize = Math.floor(Number(input.sampleSize ?? DEFAULTS.sampleSize));
  if (!(sampleSize >= 2)) return { error: "sampleSize must be a whole number of at least 2." };
  const seed = Math.floor(Number(input.seed ?? DEFAULTS.seed));
  if (!Number.isFinite(seed)) return { error: "seed must be a whole number." };
  let contamination = input.contamination ?? DEFAULTS.contamination;
  if (contamination === "" || contamination === null) contamination = "auto";
  if (contamination !== "auto") {
    contamination = Number(contamination);
    if (!(contamination > 0 && contamination <= 0.5)) return { error: 'contamination must be "auto" or a share between 0 and 0.5 (for example 0.05 for the top 5%).' };
  }
  const top = Math.max(1, Math.floor(Number(input.top ?? DEFAULTS.top)));

  const model = fitForest(X, { trees, sampleSize, seed });
  const { mean, splits } = pathLengths(model, X);
  const scores = mean.map((h) => (model.cPsi === 0 ? 0.5 : 2 ** (-h / model.cPsi)));

  const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
  const rank = new Array(n);
  order.forEach((i, r) => { rank[i] = r + 1; });
  let threshold, flaggedIdx;
  if (contamination === "auto") {
    threshold = 0.5;
    flaggedIdx = order.filter((i) => scores[i] > 0.5);
  } else {
    const k = Math.max(1, Math.round(contamination * n));
    flaggedIdx = order.slice(0, k);
    threshold = scores[order[k - 1]];
  }
  const flagged = new Set(flaggedIdx);

  // Why a row stands out: robust z of each feature (distance from the median
  // in units of 1.4826 x MAD), and how often the forest's paths split on it.
  const explain = (i) => {
    const total = splits[i].reduce((a, b) => a + b, 0) || 1;
    const feats = names.map((name, f) => ({
      column: name,
      value: X[i][f],
      median: med[f],
      z: mad[f] > 0 ? (X[i][f] - med[f]) / mad[f] : 0,
      splitShare: splits[i][f] / total,
    }));
    return feats.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  };
  const describe = (feats) => feats.filter((f) => Math.abs(f.z) >= 2).slice(0, 3);
  const topRows = order.slice(0, Math.min(top, n)).map((i) => {
    const feats = explain(i);
    return { index: i, line: i + lineOffset, label: labels[i], score: scores[i], pathLength: mean[i], rank: rank[i], flagged: flagged.has(i), features: feats, standsOut: describe(feats) };
  });

  // Histogram of scores, 0.30 to 0.80 in steps of 0.025 with open ends.
  const lo = Math.min(0.3, Math.floor(Math.min(...scores) * 40) / 40);
  const hi = Math.max(0.8, Math.ceil(Math.max(...scores) * 40) / 40);
  const bins = Math.round((hi - lo) / 0.025);
  const histogram = Array.from({ length: bins }, (_, b) => ({ from: lo + b * 0.025, to: lo + (b + 1) * 0.025, count: 0, flagged: 0 }));
  scores.forEach((s, i) => {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((s - lo) / 0.025)));
    histogram[b].count++;
    if (flagged.has(i)) histogram[b].flagged++;
  });

  const sorted = [...scores].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * (n - 1)))];
  const stats = { min: sorted[0], median: median(sorted), p90: q(0.9), p99: q(0.99), max: sorted[n - 1] };

  // Plain-language summary.
  const lead = topRows[0];
  const reasons = (r) => {
    const bits = r.standsOut.map((f) => `${f.column} ${fmt(f.value)} (${Math.abs(f.z).toFixed(1)} robust SDs ${f.z > 0 ? "above" : "below"} the median ${fmt(f.median)})`);
    return bits.length ? bits.join(", ") : "no single column is far from its median, so it is the combination of values that is rare";
  };
  let summary;
  const spread = stats.max - stats.median;
  if (contamination === "auto") {
    summary = flaggedIdx.length
      ? `${plural(flaggedIdx.length, "row")} of ${n.toLocaleString("en-US")} (${((100 * flaggedIdx.length) / n).toFixed(1)}%) score above 0.5, the point past which a row is isolated faster than a typical one.`
      : `No row of ${n.toLocaleString("en-US")} scores above 0.5, so nothing stands out sharply; the ranking below still shows the least typical rows.`;
  } else {
    summary = `Flagging the top ${(contamination * 100).toFixed(contamination * 100 < 1 ? 1 : 0)}% as asked: ${plural(flaggedIdx.length, "row")} of ${n.toLocaleString("en-US")}, scores ${fmt(threshold)} and above.`;
  }
  summary += ` The most unusual is ${lead.label}${lead.label.startsWith("row ") ? "" : ` (line ${lead.line})`} at ${lead.score.toFixed(3)}: ${reasons(lead)}.`;
  if (spread < 0.08) summary += ` Scores are bunched (median ${stats.median.toFixed(3)}, highest ${stats.max.toFixed(3)}): the paper reads that as no distinct anomaly in the data.`;
  else if (stats.max >= 0.7) summary += ` Scores near 1 mean near-certain outliers; this data's highest is ${stats.max.toFixed(3)} against a median of ${stats.median.toFixed(3)}.`;

  return {
    n,
    features: names,
    labelColumn: labelIdx >= 0 ? parsed.columns[labelIdx] : null,
    params: { trees, sampleSize: model.sampleSize, heightLimit: model.heightLimit, seed, contamination },
    cPsi: model.cPsi,
    threshold,
    flaggedCount: flaggedIdx.length,
    scores,
    pathLengths: mean,
    rank,
    flagged: scores.map((_, i) => flagged.has(i)),
    labels,
    lines: scores.map((_, i) => i + lineOffset),
    top: topRows,
    histogram,
    stats,
    medians: med,
    matrix: X,
    scales: mad,
    filled,
    warnings,
    summary,
  };
}

/** The result as CSV: every input row's label, score, rank and flag. */
export function toCsv(result) {
  const lines = ["label,line,score,rank,flagged,mean_path_length"];
  for (let i = 0; i < result.n; i++) lines.push([result.labels[i], result.lines[i], result.scores[i].toFixed(6), result.rank[i], result.flagged[i] ? 1 : 0, result.pathLengths[i].toFixed(4)].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
