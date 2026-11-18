// Dynamic time warping (DTW) for two series or many, and subsequence search.
// Zero dependencies; the page, the CLI and the agent tool all call analyze().
//
// Implemented from the papers' definitions (PAPERS below); no third-party code
// was ported. The step patterns, windows and normalisations follow the
// definitions in Giorgino (2009), so results can be checked against the
// dtw-python package: eval/reference.py writes eval/reference.json, and
// engine.test.mjs checks every number in it.

export const PAPERS = [
  {
    authors: "Sakoe, H. & Chiba, S.",
    year: 1978,
    title: "Dynamic programming algorithm optimization for spoken word recognition",
    venue: "IEEE Transactions on Acoustics, Speech, and Signal Processing 26(1), 43-49",
    doi: "10.1109/TASSP.1978.1163055",
    used: "The dynamic-programming recursion, the symmetric step pattern with weight 2 on the diagonal and normalisation by N + M, and the adjustment window (band) around the diagonal.",
  },
  {
    authors: "Itakura, F.",
    year: 1975,
    title: "Minimum prediction residual principle applied to speech recognition",
    venue: "IEEE Transactions on Acoustics, Speech, and Signal Processing 23(1), 67-72",
    doi: "10.1109/TASSP.1975.1162641",
    used: "The parallelogram global constraint (slopes between 1/2 and 2).",
  },
  {
    authors: "Giorgino, T.",
    year: 2009,
    title: "Computing and visualizing dynamic time warping alignments in R: the dtw package",
    venue: "Journal of Statistical Software 31(7), 1-24",
    doi: "10.18637/jss.v031.i07",
    used: "The step-pattern catalogue (symmetric1, symmetric2, asymmetric), which pattern is normalisable by what, the slanted band and the 0-based Itakura window, so results match the dtw package and its Python port.",
  },
  {
    authors: "Tormene, P., Giorgino, T., Quaglini, S. & Stefanelli, M.",
    year: 2009,
    title: "Matching incomplete time series with dynamic time warping: an algorithm and an application to post-stroke rehabilitation",
    venue: "Artificial Intelligence in Medicine 45(1), 11-34",
    doi: "10.1016/j.artmed.2008.11.007",
    used: "Open-begin and open-end alignment, which lets a short query match any stretch of a long series.",
  },
  {
    authors: "Müller, M.",
    year: 2007,
    title: "Information Retrieval for Music and Motion, chapter 4: Dynamic Time Warping",
    venue: "Springer",
    doi: "10.1007/978-3-540-74048-3",
    used: "Subsequence DTW: a free start row so one pass gives the best match ending at every point, and taking several non-overlapping matches in order of cost.",
  },
];

export const DEFAULTS = {
  mode: "pair", // pair | subsequence
  step: "symmetric2", // symmetric1 | symmetric2 | asymmetric
  windowType: "band", // band | itakura | none
  window: null, // band half-width in steps; null = 10% of the longer series
  dist: "abs", // abs | squared
  znorm: false,
  smooth: 0, // centred moving-average half-width
  matches: 5, // subsequence mode: how many non-overlapping matches
  segments: 12, // pair mode: rows in the lag summary
  maxCells: 25_000_000,
};

export const STEPS = {
  symmetric1: { label: "symmetric1 (every step weight 1; not normalisable)", norm: null },
  symmetric2: { label: "symmetric2 (diagonal weight 2; divided by N + M)", norm: "N+M" },
  asymmetric: { label: "asymmetric (one step of the first series per step; divided by N)", norm: "N" },
};

const cost = (a, b, dist) => {
  const d = a - b;
  return dist === "squared" ? d * d : Math.abs(d);
};

// ---------- windows ----------

export function windowFn(n, m, windowType = "band", w = null) {
  if (windowType === "none") return () => true;
  if (windowType === "itakura") {
    // Giorgino's itakuraWindow, translated from the R package to 0-based indices.
    return (i, j) => j <= 2 * i && i <= 2 * j + 1 && i >= n - 2 * m + 2 * j && j > m - 2 * n + 2 * i;
  }
  if (windowType === "band") {
    const width = w === null || w === undefined ? defaultWindow(n, m) : w;
    const slope = n > 1 ? (m - 1) / (n - 1) : 0;
    return (i, j) => Math.abs(j - i * slope) <= width;
  }
  throw new Error(`unknown window type "${windowType}"`);
}

export const defaultWindow = (n, m) => Math.max(1, Math.ceil(0.1 * Math.max(n, m)));

// Column range [lo, hi] of row i that the window allows (the windows above are
// all convex in j for fixed i, so a scan from both ends is exact).
function rowRange(i, m, inWin) {
  let lo = 0;
  while (lo < m && !inWin(i, lo)) lo++;
  let hi = m - 1;
  while (hi >= lo && !inWin(i, hi)) hi--;
  return [lo, hi];
}

// ---------- the recursion ----------

// Moves are coded 1 = from (i-1, j-1), 2 = from (i-1, j), 3 = from (i, j-1),
// 4 = from (i-1, j-2) (the asymmetric pattern's slope-2 step), 0 = start.
const MOVES = { 1: [1, 1], 2: [1, 0], 3: [0, 1], 4: [1, 2] };

function checkSeries(x, name) {
  if (!Array.isArray(x) && !(x instanceof Float64Array)) throw new Error(`${name} must be an array of numbers`);
  if (x.length < 2) throw new Error(`${name} needs at least 2 values`);
  for (const v of x) if (!Number.isFinite(v)) throw new Error(`${name} has a value that is not a finite number`);
}

/**
 * Full DTW between x (rows, the "query" in Giorgino's terms) and y (columns).
 * Returns { distance, normalizedDistance, path: [[i, j], ...] } or
 * { distance: Infinity } when the window admits no path.
 */
export function dtw(x, y, opts = {}) {
  const { step = "symmetric2", windowType = "band", window = null, dist = "abs", maxCells = DEFAULTS.maxCells } = opts;
  checkSeries(x, "the first series");
  checkSeries(y, "the second series");
  if (!Object.hasOwn(STEPS, step)) throw new Error(`unknown step pattern "${step}"`);
  const n = x.length;
  const m = y.length;
  if (n * m > maxCells) throw new Error(`${n} × ${m} = ${(n * m).toLocaleString("en-US")} cells is over the limit of ${maxCells.toLocaleString("en-US")}; shorten or aggregate the series`);
  const inWin = windowFn(n, m, windowType, window);
  const D = new Float64Array(n * m).fill(Infinity);
  const move = new Uint8Array(n * m);
  for (let i = 0; i < n; i++) {
    const [lo, hi] = rowRange(i, m, inWin);
    for (let j = lo; j <= hi; j++) {
      const c = cost(x[i], y[j], dist);
      const k = i * m + j;
      if (i === 0 && j === 0) {
        D[k] = c;
        continue;
      }
      let best = Infinity;
      let mv = 0;
      if (step === "asymmetric") {
        if (i > 0) {
          const diag = j > 0 ? D[k - m - 1] : Infinity;
          const up = D[k - m];
          const skip = j > 1 ? D[k - m - 2] : Infinity;
          best = diag; mv = 1;
          if (up < best) { best = up; mv = 2; }
          if (skip < best) { best = skip; mv = 4; }
          best += c;
        }
      } else {
        const w2 = step === "symmetric2" ? 2 : 1;
        const diag = i > 0 && j > 0 ? D[k - m - 1] + w2 * c : Infinity;
        const up = i > 0 ? D[k - m] + c : Infinity;
        const left = j > 0 ? D[k - 1] + c : Infinity;
        best = diag; mv = 1;
        if (up < best) { best = up; mv = 2; }
        if (left < best) { best = left; mv = 3; }
      }
      if (best < Infinity) {
        D[k] = best;
        move[k] = mv;
      }
    }
  }
  const distance = D[n * m - 1];
  if (!Number.isFinite(distance)) return { distance: Infinity, normalizedDistance: null, path: [], n, m };
  const path = [];
  let i = n - 1;
  let j = m - 1;
  for (;;) {
    path.push([i, j]);
    const mv = move[i * m + j];
    if (mv === 0) break;
    i -= MOVES[mv][0];
    j -= MOVES[mv][1];
  }
  path.reverse();
  return { distance, normalizedDistance: normalize(distance, step, n, m), path, n, m };
}

export function normalize(distance, step, n, m) {
  const norm = Object.hasOwn(STEPS, step) ? STEPS[step].norm : null;
  if (norm === "N+M") return distance / (n + m);
  if (norm === "N") return distance / n;
  return null;
}

/** DTW distance only, in O(m) memory (used for the distance matrix). */
export function dtwDistance(x, y, opts = {}) {
  const { step = "symmetric2", windowType = "band", window = null, dist = "abs" } = opts;
  const n = x.length;
  const m = y.length;
  const inWin = windowFn(n, m, windowType, window);
  let prev = new Float64Array(m).fill(Infinity);
  let cur = new Float64Array(m).fill(Infinity);
  for (let i = 0; i < n; i++) {
    cur.fill(Infinity);
    const [lo, hi] = rowRange(i, m, inWin);
    for (let j = lo; j <= hi; j++) {
      const c = cost(x[i], y[j], dist);
      if (i === 0 && j === 0) { cur[0] = c; continue; }
      if (step === "asymmetric") {
        if (i > 0) cur[j] = c + Math.min(j > 0 ? prev[j - 1] : Infinity, prev[j], j > 1 ? prev[j - 2] : Infinity);
      } else {
        const w2 = step === "symmetric2" ? 2 : 1;
        cur[j] = Math.min(i > 0 && j > 0 ? prev[j - 1] + w2 * c : Infinity, i > 0 ? prev[j] + c : Infinity, j > 0 ? cur[j - 1] + c : Infinity);
      }
    }
    [prev, cur] = [cur, prev];
  }
  const distance = prev[m - 1];
  return { distance, normalizedDistance: Number.isFinite(distance) ? normalize(distance, step, n, m) : null };
}

/** The cost a given path would be charged under a step pattern (used for the no-warping comparison and in tests). */
export function pathCost(x, y, path, step = "symmetric2", dist = "abs") {
  let total = 0;
  for (let k = 0; k < path.length; k++) {
    const [i, j] = path[k];
    const c = cost(x[i], y[j], dist);
    if (k > 0 && step === "symmetric2") {
      const [pi, pj] = path[k - 1];
      total += i - pi === 1 && j - pj === 1 ? 2 * c : c;
    } else total += c;
  }
  return total;
}

// ---------- subsequence search (open begin, open end, asymmetric) ----------

/**
 * Best matches of the short query x anywhere inside the long series y.
 * One pass with a free start row gives, for every end point j, the cheapest
 * alignment of all of x that ends at y[j] and where it started (Müller 2007).
 * Matches are then taken in order of cost, skipping any that overlaps one
 * already taken.
 */
export function subsequenceSearch(x, y, opts = {}) {
  const { dist = "abs", matches = DEFAULTS.matches, maxCells = DEFAULTS.maxCells } = opts;
  checkSeries(x, "the query");
  checkSeries(y, "the series searched");
  const n = x.length;
  const m = y.length;
  if (n * m > maxCells) throw new Error(`${n} × ${m} = ${(n * m).toLocaleString("en-US")} cells is over the limit of ${maxCells.toLocaleString("en-US")}`);
  let prev = new Float64Array(m);
  let cur = new Float64Array(m);
  let prevS = new Int32Array(m);
  let curS = new Int32Array(m);
  for (let j = 0; j < m; j++) {
    prev[j] = cost(x[0], y[j], dist);
    prevS[j] = j;
  }
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let best = prev[j];
      let s = prevS[j];
      if (j > 0 && prev[j - 1] <= best) { best = prev[j - 1]; s = prevS[j - 1]; }
      if (j > 1 && prev[j - 2] < best) { best = prev[j - 2]; s = prevS[j - 2]; }
      cur[j] = best + cost(x[i], y[j], dist);
      curS[j] = s;
    }
    [prev, cur] = [cur, prev];
    [prevS, curS] = [curS, prevS];
  }
  const order = [...prev.keys()].filter((j) => Number.isFinite(prev[j])).sort((a, b) => prev[a] - prev[b] || a - b);
  const taken = [];
  for (const j of order) {
    if (taken.length >= matches) break;
    const s = prevS[j];
    if (taken.some((t) => s <= t.end && j >= t.start)) continue;
    taken.push({ start: s, end: j, distance: prev[j], normalizedDistance: prev[j] / n });
  }
  for (const t of taken) {
    if (t.start === t.end) {
      t.path = Array.from(x, (_, i) => [i, t.start]);
      continue;
    }
    const seg = Array.from(y.slice(t.start, t.end + 1));
    const local = dtw(Array.from(x), seg, { step: "asymmetric", windowType: "none", dist });
    t.path = local.path.map(([i, j]) => [i, j + t.start]);
  }
  return { n, m, matches: taken, profile: Array.from(prev, (d) => d / n) };
}

// ---------- reading the alignment ----------

export function mean(a) {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

export function sd(a) {
  const mu = mean(a);
  let s = 0;
  for (const v of a) s += (v - mu) ** 2;
  return Math.sqrt(s / a.length);
}

/**
 * Per point of x: the mean index of y it is matched to minus its own index
 * (the lag: positive means the same value comes later in y), and how much of
 * the gap at that point the warp removes. When warping leaves most of the
 * gap in place, the difference there is one of level, not timing; when the
 * point sits near a peak or trough of x (x barely changes there, or changes
 * the other way from y at the matched point), the lag is a hop over the turn. Neither should be read as a delay ("level", "turn"); only "timing"
 * points are.
 */
export function lagProfile(x, y, path, h = null) {
  const n = x.length;
  const m = y.length;
  const js = Array.from({ length: n }, () => []);
  for (const [i, j] of path) js[i].push(j);
  const slope = n > 1 ? (m - 1) / (n - 1) : 0;
  const scale = sd(x) || 1;
  if (h === null) h = Math.max(1, Math.ceil(n / 40));
  return js.map((list, i) => {
    const jbar = mean(list);
    const residual = mean(list.map((j) => Math.abs(x[i] - y[j])));
    const jd = Math.round(i * slope);
    const gap = Math.abs(x[i] - y[jd]);
    // Is x itself changing here, the same way y is at the matched point? A
    // value near a peak or trough of x occurs on both sides of it, so the warp
    // can match it to either limb of y, and the lag is a hop across the turn,
    // not a delay. Slopes are taken over +/- h steps.
    const jm = Math.min(m - 1, Math.max(0, Math.round(jbar)));
    const sx = x[Math.min(n - 1, i + h)] - x[Math.max(0, i - h)];
    const sy = y[Math.min(m - 1, jm + h)] - y[Math.max(0, jm - h)];
    const turn = Math.abs(sx) < 0.5 * gap || Math.sign(sx) !== Math.sign(sy);
    let reading;
    if (gap < 0.05 * scale) reading = "same";
    else if (residual > 0.5 * gap) reading = "level";
    else if (turn) reading = "turn";
    else reading = "timing";
    return { i, lag: jbar - i * slope, matched: list, residual, gap, reading };
  });
}

export function segmentSummary(profile, labels, segments = 12) {
  const n = profile.length;
  const k = Math.max(1, Math.min(segments, n));
  const out = [];
  for (let s = 0; s < k; s++) {
    const a = Math.floor((s * n) / k);
    const b = Math.floor(((s + 1) * n) / k) - 1;
    if (b < a) continue;
    const part = profile.slice(a, b + 1);
    const timing = part.filter((p) => p.reading === "timing");
    out.push({
      from: labels ? labels[a] : a + 1,
      to: labels ? labels[b] : b + 1,
      meanLag: mean(part.map((p) => p.lag)),
      timingLag: timing.length ? mean(timing.map((p) => p.lag)) : null,
      timingShare: timing.length / part.length,
      levelShare: part.filter((p) => p.reading === "level").length / part.length,
      turnShare: part.filter((p) => p.reading === "turn").length / part.length,
      meanGap: mean(part.map((p) => p.gap)),
      meanResidual: mean(part.map((p) => p.residual)),
    });
  }
  return out;
}

// ---------- preparing series ----------

export function smooth(x, h) {
  if (!h) return x.slice();
  const n = x.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) { s += x[k]; c++; }
    out[i] = s / c;
  }
  return out;
}

export function znormalize(x) {
  const mu = mean(x);
  const s = sd(x);
  if (!(s > 0)) throw new Error("a series with no variation cannot be z-normalised");
  return x.map((v) => (v - mu) / s);
}

const NA = new Set(["", "na", "n/a", "nan", "null", "none", "-", "."]);

export function parseNumber(s) {
  const t = String(s ?? "").trim();
  if (NA.has(t.toLowerCase())) return null;
  const v = Number(t.replace(/,(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(v) ? v : undefined;
}

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) || "";
  if (!firstLine) return { error: "The table is empty." };
  const counts = { ",": 0, "\t": 0, ";": 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let k = 0; k < src.length; k++) {
    const ch = src[k];
    if (quoted) {
      if (ch === '"' && src[k + 1] === '"') { cell += '"'; k++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[k + 1] === "\n") k++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (rows.length < 3) return { error: "Need a header row and at least two rows of data." };
  const columns = rows[0].map((c, k) => c.trim() || `column ${k + 1}`);
  return { columns, rows: rows.slice(1).map((r) => columns.map((_, k) => (r[k] ?? "").trim())) };
}

/** Which columns are numeric (every non-blank cell parses), and the first other column as row labels. */
export function profileColumns(parsed) {
  const numeric = [];
  let label = null;
  parsed.columns.forEach((name, k) => {
    let good = 0;
    let bad = 0;
    for (const r of parsed.rows) {
      const v = parseNumber(r[k]);
      if (v === undefined) bad++;
      else if (v !== null) good++;
    }
    if (bad === 0 && good >= 2) numeric.push(name);
    else if (label === null) label = name;
  });
  return { numeric, label };
}

/**
 * One column as a series: leading and trailing blanks dropped, interior
 * blanks filled by straight lines between neighbours (and counted).
 */
export function columnSeries(parsed, name) {
  const k = parsed.columns.indexOf(name);
  if (k < 0) return { error: `No column named "${name}".` };
  const raw = parsed.rows.map((r) => parseNumber(r[k]));
  if (raw.some((v) => v === undefined)) return { error: `Column "${name}" has text that is not a number.` };
  let first = raw.findIndex((v) => v !== null);
  if (first < 0) return { error: `Column "${name}" is empty.` };
  let last = raw.length - 1;
  while (raw[last] === null) last--;
  const values = raw.slice(first, last + 1);
  let filled = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) continue;
    let r = i;
    while (values[r] === null) r++;
    const a = values[i - 1];
    const b = values[r];
    for (let t = i; t < r; t++) { values[t] = a + ((b - a) * (t - i + 1)) / (r - i + 1); filled++; }
    i = r;
  }
  if (values.length < 2) return { error: `Column "${name}" needs at least 2 values.` };
  return { values, offset: first, filled };
}

// ---------- the whole analysis ----------

export const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "-∞";
  if (v !== 0 && Math.abs(v) < 10 ** -digits) return v.toExponential(2);
  return Number(v.toFixed(digits)).toString();
};

function prepare(values, opts) {
  let v = smooth(values, opts.smooth);
  if (opts.znorm) v = znormalize(v);
  return v;
}

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== "")) };
  if (o.window !== null && o.window !== undefined) o.window = Number(o.window);
  o.smooth = Math.max(0, Math.floor(Number(o.smooth) || 0));
  o.matches = Math.max(1, Math.min(50, Math.floor(Number(o.matches) || DEFAULTS.matches)));
  o.znorm = o.znorm === true || o.znorm === "true" || o.znorm === 1;
  if (!["pair", "subsequence"].includes(o.mode)) return { error: `Mode must be pair or subsequence, not "${o.mode}".` };
  if (!Object.hasOwn(STEPS, o.step)) return { error: `Step pattern must be one of ${Object.keys(STEPS).join(", ")}.` };
  if (!["band", "itakura", "none"].includes(o.windowType)) return { error: "Window must be band, itakura or none." };
  if (!["abs", "squared"].includes(o.dist)) return { error: "Distance must be abs or squared." };
  if (o.window !== null && !(o.window >= 0)) return { error: "The band width must be a number of steps, 0 or more." };

  const parsed = parseCsv(o.csv);
  if (parsed.error) return { error: parsed.error };
  const prof = profileColumns(parsed);
  const labelCol = o.label && parsed.columns.includes(o.label) ? o.label : prof.label;
  if (prof.numeric.length < 2 && !(o.mode === "subsequence" && prof.numeric.length >= 1 && o.queryRows)) {
    return { error: "Need at least two numeric columns: one series per column, one row per time step." };
  }
  const a = o.a && prof.numeric.includes(o.a) ? o.a : prof.numeric[0];
  const b = o.b && prof.numeric.includes(o.b) ? o.b : prof.numeric.find((c) => c !== a);
  if (o.a && !prof.numeric.includes(o.a)) return { error: `"${o.a}" is not a numeric column.` };
  if (o.b && !prof.numeric.includes(o.b)) return { error: `"${o.b}" is not a numeric column.` };
  if (a === b) return { error: "Choose two different columns." };
  const sa = columnSeries(parsed, a);
  const sb = columnSeries(parsed, b);
  if (sa.error) return { error: sa.error };
  if (sb.error) return { error: sb.error };
  // Row names: the label column, else the row number in the table (1 = first data row).
  const labelsOf = (s) => (labelCol ? parsed.rows.slice(s.offset, s.offset + s.values.length).map((r) => r[parsed.columns.indexOf(labelCol)]) : s.values.map((_, i) => `row ${s.offset + i + 1}`));
  const notes = [];
  if (sa.filled) notes.push(`${sa.filled} blank value${sa.filled === 1 ? "" : "s"} inside "${a}" filled by straight lines between neighbours.`);
  if (sb.filled) notes.push(`${sb.filled} blank value${sb.filled === 1 ? "" : "s"} inside "${b}" filled by straight lines between neighbours.`);
  let x;
  let y;
  try {
    x = prepare(sa.values, o);
    y = prepare(sb.values, o);
  } catch (e) {
    return { error: e.message };
  }
  const base = {
    columns: prof.numeric,
    label: labelCol,
    a,
    b,
    settings: { mode: o.mode, step: o.step, windowType: o.windowType, window: o.window, dist: o.dist, znorm: o.znorm, smooth: o.smooth },
    notes,
    series: { a: x, b: y, labelsA: labelsOf(sa), labelsB: labelsOf(sb), rawA: sa.values, rawB: sb.values },
  };

  if (o.mode === "subsequence") {
    if (x.length > y.length) return { error: `The query ("${a}", ${x.length} points) must be shorter than the series it is searched in ("${b}", ${y.length} points).` };
    let s;
    try {
      s = subsequenceSearch(x, y, { dist: o.dist, matches: o.matches, maxCells: o.maxCells });
    } catch (e) {
      return { error: e.message };
    }
    base.settings.step = "asymmetric";
    base.settings.windowType = "none";
    const lb = base.series.labelsB;
    base.subsequence = {
      ...s,
      matches: s.matches.map((t, k) => ({ rank: k + 1, ...t, from: lb[t.start], to: lb[t.end], length: t.end - t.start + 1 })),
    };
    base.summary = s.matches.length
      ? `The best match for "${a}" (${x.length} points) in "${b}" runs from ${base.subsequence.matches[0].from} to ${base.subsequence.matches[0].to}, an average of ${fmt(s.matches[0].normalizedDistance)} per query point${o.znorm ? " (z-normalised units)" : ""}.`
      : "No match found.";
    return base;
  }

  const n = x.length;
  const m = y.length;
  const width = o.windowType === "band" ? (o.window === null ? defaultWindow(n, m) : o.window) : null;
  base.settings.window = width;
  if (o.windowType === "itakura" && (m > 2 * n || n > 2 * m)) return { error: "The Itakura window needs one series at most twice as long as the other." };
  let r;
  try {
    r = dtw(x, y, { step: o.step, windowType: o.windowType, window: width, dist: o.dist, maxCells: o.maxCells });
  } catch (e) {
    return { error: e.message };
  }
  if (!Number.isFinite(r.distance)) {
    return { error: `The window allows no path from the first to the last point${o.windowType === "band" ? `: with series of ${n} and ${m} points a band of ${width} is too narrow` : ""}. Widen it or choose no window.` };
  }
  let lockstep = null;
  if (n === m) {
    const diag = Array.from({ length: n }, (_, i) => [i, i]);
    const c = pathCost(x, y, diag, o.step, o.dist);
    lockstep = { distance: c, normalizedDistance: normalize(c, o.step, n, m) };
  }
  const profile = lagProfile(x, y, r.path, Math.max(o.smooth, Math.ceil(n / 40)));
  const labelsA = base.series.labelsA;
  let edge = 0;
  if (o.windowType === "band") {
    const slope = n > 1 ? (m - 1) / (n - 1) : 0;
    for (const [i, j] of r.path) if (Math.abs(j - i * slope) >= width - 0.5 && width > 0) edge++;
    if (edge > 0.05 * r.path.length) notes.push(`The path runs along the edge of the band at ${edge} of ${r.path.length} points: the series may be shifted by more than ${width} steps. Widen the band to check.`);
  }
  const counts = { timing: 0, level: 0, turn: 0, same: 0 };
  for (const p of profile) counts[p.reading]++;
  const diagSteps = r.path.slice(1).filter(([i, j], k) => i - r.path[k][0] === 1 && j - r.path[k][1] === 1).length;
  const timing = profile.filter((p) => p.reading === "timing");
  base.pair = {
    n,
    m,
    distance: r.distance,
    normalizedDistance: r.normalizedDistance,
    lockstep,
    saved: lockstep ? 1 - r.distance / lockstep.distance : null,
    path: r.path,
    pathLength: r.path.length,
    diagonalShare: diagSteps / Math.max(1, r.path.length - 1),
    edgePoints: edge,
    profile,
    readings: counts,
    meanTimingLag: timing.length ? mean(timing.map((p) => p.lag)) : null,
    segments: segmentSummary(profile, labelsA, o.segments),
  };
  const unit = o.znorm ? " (z-normalised units)" : "";
  const nd = r.normalizedDistance !== null ? `${fmt(r.normalizedDistance)} per step${unit}` : `${fmt(r.distance)} in total${unit} (this step pattern has no per-step normalisation)`;
  const savedText = lockstep && lockstep.distance > 0 ? ` Matching point for point without warping costs ${fmt(lockstep.distance)}; warping removes ${fmt(100 * base.pair.saved, 1)}% of that.` : "";
  base.summary = `DTW distance between "${a}" and "${b}": ${fmt(r.distance)}, or ${nd}.${savedText} The warp explains the gap as timing at ${counts.timing} of ${n} points of "${a}", as level at ${counts.level}, as a hop across a peak or trough at ${counts.turn}, and finds no real gap at ${counts.same}.${timingText(base.pair.segments, a, b)}`;

  if (o.matrix !== false && prof.numeric.length >= 2 && prof.numeric.length <= 25) {
    const cols = prof.numeric;
    const prepared = {};
    for (const c of cols) {
      const s = columnSeries(parsed, c);
      if (s.error) continue;
      try { prepared[c] = prepare(s.values, o); } catch { /* left out */ }
    }
    const names = cols.filter((c) => prepared[c]);
    const cells = names.map(() => names.map(() => null));
    for (let p = 0; p < names.length; p++) {
      cells[p][p] = 0;
      for (let q = p + 1; q < names.length; q++) {
        const u = prepared[names[p]];
        const v = prepared[names[q]];
        if (u.length * v.length > o.maxCells) continue;
        if (o.windowType === "itakura" && (u.length > 2 * v.length || v.length > 2 * u.length)) continue;
        const w = o.windowType === "band" ? (o.window === null ? defaultWindow(u.length, v.length) : o.window) : null;
        const d = dtwDistance(u, v, { step: o.step, windowType: o.windowType, window: w, dist: o.dist });
        const val = d.normalizedDistance ?? d.distance;
        cells[p][q] = Number.isFinite(val) ? val : null;
        cells[q][p] = cells[p][q];
      }
    }
    const nearest = names.map((c, p) => {
      let best = null;
      names.forEach((d, q) => { if (q !== p && cells[p][q] !== null && (best === null || cells[p][q] < cells[p][best])) best = q; });
      return { column: c, nearest: best === null ? null : names[best], distance: best === null ? null : cells[p][best] };
    });
    base.matrix = { columns: names, cells, normalized: Object.hasOwn(STEPS, o.step) && STEPS[o.step].norm !== null, nearest };
  }
  return base;
}

// The stretches where "b" runs furthest ahead of and behind "a", counting only
// points the warp reads as timing.
function timingText(segments, a, b) {
  const t = segments.filter((s) => s.timingLag !== null && s.timingShare >= 0.5);
  if (!t.length) return "";
  const ahead = t.reduce((p, s) => (s.timingLag < p.timingLag ? s : p));
  const behind = t.reduce((p, s) => (s.timingLag > p.timingLag ? s : p));
  const parts = [];
  if (ahead.timingLag < -0.5) parts.push(`"${b}" runs furthest ahead of "${a}" over ${ahead.from} to ${ahead.to}, by ${fmt(-ahead.timingLag, 1)} steps`);
  if (behind.timingLag > 0.5) parts.push(`furthest behind over ${behind.from} to ${behind.to}, by ${fmt(behind.timingLag, 1)} steps`);
  return parts.length ? ` Where the gap is timing, ${parts.join("; ")}.` : "";
}

export function csvCell(c) {
  let s = c === null || c === undefined ? "" : String(c);
  // Spreadsheet formula guard: defuse = + - @ tab CR at the start, but let a plain number through.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The alignment as a CSV: one row per path point (pair mode) or per match (subsequence mode). */
export function toCsv(r) {
  const lines = [];
  if (r.subsequence) {
    lines.push(["rank", "from", "to", "start_index", "end_index", "length", "distance", "distance_per_query_point"].join(","));
    for (const t of r.subsequence.matches) lines.push([t.rank, t.from, t.to, t.start + 1, t.end + 1, t.length, fmt(t.distance, 6), fmt(t.normalizedDistance, 6)].map(csvCell).join(","));
    return lines.join("\n") + "\n";
  }
  const la = r.series.labelsA;
  const lb = r.series.labelsB;
  lines.push(["step", "index_a", "index_b", "label_a", "label_b", `value_${r.a}`, `value_${r.b}`, "lag", "gap_removed"].map(csvCell).join(","));
  r.pair.path.forEach(([i, j], k) => {
    const p = r.pair.profile[i];
    lines.push([k + 1, i + 1, j + 1, la ? la[i] : "", lb ? lb[j] : "", fmt(r.series.a[i], 6), fmt(r.series.b[j], 6), fmt(j - i * ((r.pair.m - 1) / Math.max(1, r.pair.n - 1)), 3), p.reading].map(csvCell).join(","));
  });
  return lines.join("\n") + "\n";
}
