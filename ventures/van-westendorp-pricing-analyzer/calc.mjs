// Van Westendorp Price Sensitivity Meter. Pure functions, no I/O, no imports.
//
// Each respondent answers four price questions, in this column order:
//   1. tooCheap      - so cheap you would doubt the quality
//   2. cheap         - a bargain, a good buy for the money
//   3. expensive     - getting expensive, not out of the question
//   4. tooExpensive  - so expensive you would not consider it
// A coherent respondent has tooCheap < cheap < expensive < tooExpensive.
// Incoherent rows are dropped and counted, never silently repaired.

export const COLUMNS = ["tooCheap", "cheap", "expensive", "tooExpensive"];

const num = (s) => {
  if (typeof s === "number") return Number.isFinite(s) ? s : NaN;
  const t = String(s ?? "").trim().replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

// Accepts pasted text: comma, tab, semicolon or whitespace separated, optional
// header row (any first row whose first cell is not a number).
export function parseResponses(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  let skippedHeader = false;
  let unparseable = 0;
  lines.forEach((line, i) => {
    const cells = line.split(/[,;\t]|\s{2,}|\s(?=[$€£\d])/).map((c) => c.trim()).filter((c) => c !== "");
    const first = num(cells[0]);
    if (i === 0 && Number.isNaN(first)) { skippedHeader = true; return; }
    const v = cells.slice(0, 4).map(num);
    if (cells.length < 4 || v.some(Number.isNaN)) { unparseable++; return; }
    rows.push(v);
  });
  return { rows, skippedHeader, unparseable };
}

export function cleanRows(rows) {
  const kept = [];
  let incoherent = 0;
  let nonPositive = 0;
  for (const r of rows) {
    if (r.some((x) => x <= 0)) { nonPositive++; continue; }
    if (!(r[0] < r[1] && r[1] < r[2] && r[2] < r[3])) { incoherent++; continue; }
    kept.push(r);
  }
  return { kept, incoherent, nonPositive };
}

// Cumulative curves at price p, as fractions of respondents.
export function curvesAt(rows, p) {
  const n = rows.length;
  let tc = 0, ch = 0, ex = 0, te = 0;
  for (const r of rows) {
    if (r[0] >= p) tc++;      // still says "too cheap" at p or below
    if (r[1] >= p) ch++;      // still says "cheap" at p
    if (r[2] <= p) ex++;      // already says "expensive" by p
    if (r[3] <= p) te++;      // already says "too expensive" by p
  }
  return { tooCheap: tc / n, cheap: ch / n, expensive: ex / n, tooExpensive: te / n, notCheap: 1 - ch / n, notExpensive: 1 - ex / n };
}

function grid(rows) {
  return [...new Set(rows.flat())].sort((a, b) => a - b);
}

// First crossing of curve a and curve b on the sorted grid, linearly interpolated.
function crossing(rows, g, a, b) {
  let prev = null;
  for (const p of g) {
    const c = curvesAt(rows, p);
    const d = c[a] - c[b];
    if (d === 0) return { price: p, exact: true };
    if (prev && Math.sign(prev.d) !== Math.sign(d)) {
      const t = prev.d / (prev.d - d);
      return { price: prev.p + t * (p - prev.p), exact: false };
    }
    prev = { p, d };
  }
  return null;
}

export function pricePoints(rows) {
  const g = grid(rows);
  const pick = (a, b) => crossing(rows, g, a, b)?.price ?? null;
  return {
    pmc: pick("tooCheap", "notCheap"),
    opp: pick("tooCheap", "tooExpensive"),
    ipp: pick("cheap", "expensive"),
    pme: pick("tooExpensive", "notExpensive"),
  };
}

// Deterministic PRNG so a shared result reproduces.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

// Percentile bootstrap: resample respondents with replacement, recompute the
// four points, report the 5th-95th percentile band for each.
export function bootstrapBands(rows, { resamples = 300, seed = 12345 } = {}) {
  const rand = mulberry32(seed);
  const acc = { pmc: [], opp: [], ipp: [], pme: [] };
  for (let i = 0; i < resamples; i++) {
    const s = Array.from({ length: rows.length }, () => rows[Math.floor(rand() * rows.length)]);
    const pts = pricePoints(s);
    for (const k of Object.keys(acc)) if (pts[k] != null) acc[k].push(pts[k]);
  }
  const bands = {};
  for (const k of Object.keys(acc)) {
    const v = acc[k].sort((a, b) => a - b);
    bands[k] = v.length >= resamples * 0.5 ? { low: quantile(v, 0.05), high: quantile(v, 0.95), used: v.length } : null;
  }
  return bands;
}

export const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

export const MIN_RESPONDENTS = 30;

export function analyze(text, opts = {}) {
  const parsed = parseResponses(text);
  const { kept, incoherent, nonPositive } = cleanRows(parsed.rows);
  if (kept.length < 5) {
    return { error: `Need at least 5 coherent responses; found ${kept.length}. Paste four prices per respondent: too cheap, cheap, expensive, too expensive.` };
  }
  const points = pricePoints(kept);
  const bands = bootstrapBands(kept, opts);
  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail });

  if (kept.length < MIN_RESPONDENTS) {
    add("medium", "Small sample", `${kept.length} coherent respondents. Price sensitivity curves from fewer than ${MIN_RESPONDENTS} are noisy; read the bands, not the points.`);
  }
  if (parsed.rows.length && kept.length / parsed.rows.length < 0.8) {
    add("medium", "Many rows were dropped", `${parsed.rows.length - kept.length} of ${parsed.rows.length} rows were incoherent (prices not rising in order) or non-positive. A high drop rate usually means survey wording confused people.`);
  }
  if (points.pmc == null || points.pme == null || points.opp == null || points.ipp == null) {
    add("medium", "A curve pair never crosses", "At least one price point could not be found. The answers may be clustered at a few round numbers, or the sample is too small.");
  } else {
    if (points.pmc > points.pme) add("medium", "Acceptable range is inverted", "The point of marginal cheapness sits above the point of marginal expensiveness, so there is no price range most respondents accept.");
    add("info", "Acceptable range", `${money(points.pmc)} to ${money(points.pme)}. Below the lower point, more people doubt quality than see a bargain; above the upper, more people find it too expensive than acceptable.`);
    add("info", "Optimal and indifference price", `Optimal price point ${money(points.opp)} (fewest people rejecting on either side); indifference price ${money(points.ipp)} (as many call it cheap as expensive).`);
    if (bands.opp) add("info", "Uncertainty", `Bootstrap 5th-95th percentile: optimal price ${money(bands.opp.low)} to ${money(bands.opp.high)}, upper limit ${bands.pme ? money(bands.pme.low) + " to " + money(bands.pme.high) : "n/a"}.`);
  }
  add("info", "What this does not tell you", "It measures stated price perception, not willingness to pay or demand. It cannot say what revenue a price earns. Use it to bound a test price, then test it.");

  const curves = grid(kept).map((p) => ({ price: p, ...curvesAt(kept, p) }));
  return { n: kept.length, total: parsed.rows.length, incoherent, nonPositive, unparseable: parsed.unparseable, points, bands, findings, curves };
}

export function reportCsv(a) {
  const lines = ["price,too_cheap,cheap,expensive,too_expensive"];
  for (const c of a.curves) lines.push([c.price, c.tooCheap, c.cheap, c.expensive, c.tooExpensive].map((x) => Number(x.toFixed(4))).join(","));
  lines.push("", "point,price,band_low,band_high");
  for (const [k, label] of [["pmc", "marginal_cheapness"], ["opp", "optimal_price"], ["ipp", "indifference_price"], ["pme", "marginal_expensiveness"]]) {
    lines.push([label, a.points[k] == null ? "" : money(a.points[k]), a.bands[k] ? money(a.bands[k].low) : "", a.bands[k] ? money(a.bands[k].high) : ""].join(","));
  }
  return lines.join("\n");
}

// Invented sample: a B2B tool with a central price near 40 per seat.
export function sampleText() {
  const rand = mulberry32(7);
  const lines = ["too cheap,cheap,expensive,too expensive"];
  for (let i = 0; i < 60; i++) {
    const centre = 40 * (0.6 + rand() * 0.9);
    const r = (lo, hi) => Math.round(centre * (lo + rand() * (hi - lo)));
    const tc = Math.max(1, r(0.2, 0.45)), ch = Math.max(tc + 1, r(0.55, 0.85)), ex = Math.max(ch + 1, r(1.05, 1.35)), te = Math.max(ex + 1, r(1.5, 2.1));
    lines.push([tc, ch, ex, te].join(","));
  }
  return lines.join("\n");
}
