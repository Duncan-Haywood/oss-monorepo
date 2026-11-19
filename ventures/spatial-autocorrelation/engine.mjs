// Spatial autocorrelation: global Moran's I, Geary's C and Getis-Ord General G,
// local Moran's I (LISA) clusters and outliers, and Getis-Ord Gi* hot spots,
// from a table of places with coordinates or a neighbour list.
//
// Implemented from the papers' formulas (PAPERS below). The moments follow
// Cliff & Ord (1981) as PySAL's esda states them, and the conventions
// (two-sided normal p for Moran, folded permutation p, conditional
// permutation for LISA) match esda so results can be compared with it;
// eval/reference.py checks every analytic number against esda 2.9.0. No
// third-party code was ported. Pure functions, no DOM, no network, seeded
// randomness only.

export const PAPERS = [
  { authors: "P. A. P. Moran", title: "Notes on continuous stochastic phenomena", venue: "Biometrika 37(1/2), 17-23", year: 1950, url: "https://doi.org/10.2307/2332142", doi: "10.2307/2332142", implemented: "Global Moran's I.", deviations: "None." },
  { authors: "R. C. Geary", title: "The contiguity ratio and statistical mapping", venue: "The Incorporated Statistician 5(3), 115-145", year: 1954, url: "https://doi.org/10.2307/2986645", doi: "10.2307/2986645", implemented: "Geary's contiguity ratio C.", deviations: "None." },
  { authors: "A. D. Cliff and J. K. Ord", title: "Spatial Processes: Models and Applications", venue: "Pion, London", year: 1981, url: "https://openlibrary.org/search?q=Spatial+Processes+Models+and+Applications+Cliff+Ord", implemented: "Means and variances of I and C under the normality and randomisation assumptions (S0, S1, S2 and the kurtosis term).", deviations: "None." },
  { authors: "A. Getis and J. K. Ord", title: "The analysis of spatial association by use of distance statistics", venue: "Geographical Analysis 24(3), 189-206", year: 1992, url: "https://doi.org/10.1111/j.1538-4632.1992.tb00261.x", doi: "10.1111/j.1538-4632.1992.tb00261.x", implemented: "General G with its mean and variance, on binary weights.", deviations: "None." },
  { authors: "J. K. Ord and A. Getis", title: "Local spatial autocorrelation statistics: distributional issues and an application", venue: "Geographical Analysis 27(4), 286-306", year: 1995, url: "https://doi.org/10.1111/j.1538-4632.1995.tb00912.x", doi: "10.1111/j.1538-4632.1995.tb00912.x", implemented: "Standardised Gi* z-scores (each place counts in its own neighbourhood).", deviations: "Gi* always uses the binary neighbour structure plus a self-weight of 1, whatever transform the other statistics use." },
  { authors: "L. Anselin", title: "Local indicators of spatial association - LISA", venue: "Geographical Analysis 27(2), 93-115", year: 1995, url: "https://doi.org/10.1111/j.1538-4632.1995.tb00338.x", doi: "10.1111/j.1538-4632.1995.tb00338.x", implemented: "Local Moran's I, conditional permutation pseudo p-values, Moran scatterplot quadrants (high-high, low-low, high-low, low-high).", deviations: "Our random stream is our own (seeded), so pseudo p-values differ from esda's or GeoDa's by permutation noise only." },
  { authors: "R. R. Sokal, N. L. Oden and B. A. Thomson", title: "Local spatial autocorrelation in a biological model", venue: "Geographical Analysis 30(4), 331-354", year: 1998, url: "https://doi.org/10.1111/j.1538-4632.1998.tb00406.x", doi: "10.1111/j.1538-4632.1998.tb00406.x", implemented: "Analytic mean and variance of local Moran's I under conditional randomisation, for a permutation-free z-score.", deviations: "None." },
  { authors: "Y. Benjamini and Y. Hochberg", title: "Controlling the false discovery rate: a practical and powerful approach to multiple testing", venue: "Journal of the Royal Statistical Society B 57(1), 289-300", year: 1995, url: "https://doi.org/10.1111/j.2517-6161.1995.tb02031.x", doi: "10.1111/j.2517-6161.1995.tb02031.x", implemented: "Optional false-discovery-rate cut-off for the local p-values.", deviations: "None." },
];

export const DEFAULTS = {
  weights: "auto", // knn | band | inverse | list (auto: list when a neighbour list is given, else knn)
  k: 6,
  threshold: null, // distance band / inverse-distance cut-off, in km (geographic) or data units
  power: 1,
  transform: "r", // r (row-standardised) | b (binary) | none (raw inverse distances)
  coordinates: "auto", // auto | geographic | planar
  permutations: 999,
  seed: 12345,
  alpha: 0.05,
  fdr: false,
  bands: 8,
};

/** A small real sample for agents (14 eastern states, 2009 per-capita income, from data/us-state-income.csv). */
export const SAMPLE_INPUT = { text: "state,lon,lat,pci2009\nConnecticut,-72.7252,41.6179,52736\nDelaware,-75.5009,38.9950,40135\nMaine,-69.2348,45.3893,35268\nMaryland,-76.8197,39.0639,47159\nMassachusetts,-71.8031,42.2567,49590\nNew Hampshire,-71.5782,43.6851,41882\nNew Jersey,-74.6770,40.1982,48123\nNew York,-75.5126,42.9466,46844\nOhio,-82.7875,40.2875,35018\nPennsylvania,-77.8031,40.8748,38827\nRhode Island,-71.5615,41.6817,41283\nVermont,-72.6611,44.0722,36752\nVirginia,-78.8518,37.5185,43211\nWest Virginia,-80.6142,38.6411,31843", weights: "knn", k: 4, permutations: 199 };

const MAX_ROWS = 5000;

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  const head = s.split(/\r?\n/, 1)[0];
  const delim = head.includes(",") ? "," : head.includes("\t") ? "\t" : head.includes(";") ? ";" : ",";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("The table is empty.");
  const header = rows[0].map((h) => h.trim());
  return { header, rows: rows.slice(1).map((r) => header.map((_, j) => (r[j] ?? "").trim())) };
}

export const num = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const t = String(v).trim().replace(/^\$/, "");
  if (t === "" || /^(na|n\/a|nan|null|\.|-)$/i.test(t)) return NaN;
  return Number(t.replace(/,(?=\d{3}(\D|$))/g, ""));
};

const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((s) => String(s).trim()).filter(Boolean);

const LON = /^(lon|long|lng|longitude|x_?lon|lon_?x)$/i;
const LAT = /^(lat|latitude|y_?lat|lat_?y)$/i;
const XS = /^(x|easting|east|x_?coord|xcoord|utm_?x|utm_?e)$/i;
const YS = /^(y|northing|north|y_?coord|ycoord|utm_?y|utm_?n)$/i;
const IDS = /^(id|name|place|region|state|county|site|station|area|zone|tract|fips|geoid|code|location)$/i;

/** Which columns are the id, the coordinates and the numeric variables. */
export function detectColumns(header, rows, opts = {}) {
  const pick = (name) => {
    if (!name) return -1;
    const j = header.findIndex((h) => h.toLowerCase() === String(name).toLowerCase());
    if (j < 0) throw new Error(`No column named "${name}". Columns: ${header.join(", ")}.`);
    return j;
  };
  const numeric = header.map((_, j) => {
    let ok = 0, bad = 0;
    for (const r of rows) { const v = r[j]; if (v === "" || /^(na|n\/a|nan|null|\.|-)$/i.test(v)) continue; Number.isFinite(num(v)) ? ok++ : bad++; }
    return ok >= 3 && bad === 0;
  });
  let xi = pick(opts.x), yi = pick(opts.y), geographic = null;
  if (xi < 0 && yi < 0) {
    const lon = header.findIndex((h) => LON.test(h)), lat = header.findIndex((h) => LAT.test(h));
    if (lon >= 0 && lat >= 0) { xi = lon; yi = lat; geographic = true; }
    else {
      const x = header.findIndex((h) => XS.test(h)), y = header.findIndex((h) => YS.test(h));
      if (x >= 0 && y >= 0) { xi = x; yi = y; geographic = false; }
    }
  } else if (xi < 0 || yi < 0) throw new Error("Give both coordinate columns (x and y), or neither.");
  if (geographic === null && xi >= 0) geographic = LON.test(header[xi]) || LAT.test(header[yi]);
  if (opts.coordinates === "geographic") geographic = true;
  if (opts.coordinates === "planar") geographic = false;
  let idi = pick(opts.id);
  if (idi < 0) idi = header.findIndex((h, j) => IDS.test(h) && j !== xi && j !== yi);
  if (idi < 0) idi = header.findIndex((_, j) => !numeric[j] && j !== xi && j !== yi);
  let vars;
  if (opts.variables && list(opts.variables).length) vars = list(opts.variables).map(pick);
  else vars = header.map((_, j) => j).filter((j) => numeric[j] && j !== xi && j !== yi && j !== idi && !/^(fips|geoid|id|code|zip|zipcode)$/i.test(header[j]));
  if (!vars.length) throw new Error("No numeric column to analyse. Add a column of values (rates, prices, counts per area, ...).");
  for (const j of vars) if (!numeric[j]) throw new Error(`Column "${header[j]}" is not numeric.`);
  return { id: idi, x: xi, y: yi, geographic: xi >= 0 ? geographic : null, variables: vars };
}

/** Neighbour list: "place,neighbour;neighbour;..." rows, or one "place,neighbour" pair per row. */
export function parseNeighbors(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const { header, rows } = parseCsv(s);
  const all = [header, ...rows];
  const map = new Map();
  for (const r of all) {
    const id = (r[0] ?? "").trim();
    if (!id) continue;
    const ns = r.slice(1).flatMap((c) => String(c).split(/[;|]/)).map((t) => t.trim()).filter(Boolean);
    if (!map.has(id)) map.set(id, new Set());
    for (const n of ns) if (n !== id) map.get(id).add(n);
  }
  return map;
}

// ---------- distributions (normal tail via the regularised incomplete gamma) ----------

function lgamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (!Number.isFinite(x)) return 0;
  const lead = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 10000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
    }
    return Math.max(0, 1 - sum * Math.exp(lead));
  }
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(lead) * h;
}

/** Upper normal tail P(Z > z). */
export const normsf = (z) => (Number.isNaN(z) ? NaN : z < 0 ? 1 - normsf(-z) : 0.5 * gammaQ(0.5, (z * z) / 2));
/** Two-sided normal p-value. */
export const p2 = (z) => (Number.isFinite(z) ? Math.min(1, 2 * normsf(Math.abs(z))) : NaN);

// ---------- random ----------

export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- distances and weights ----------

const R_EARTH_KM = 6371.0088;
export function haversine(lon1, lat1, lon2, lat2) {
  const r = Math.PI / 180;
  const dl = (lat2 - lat1) * r, dn = (lon2 - lon1) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dn / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceMatrix(xs, ys, geographic) {
  const n = xs.length, D = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = geographic ? haversine(xs[i], ys[i], xs[j], ys[j]) : Math.hypot(xs[i] - xs[j], ys[i] - ys[j]);
    D[i][j] = D[j][i] = d;
  }
  return D;
}

/** The smallest distance band that gives every place at least one neighbour. */
export function minThreshold(D) {
  let t = 0;
  for (let i = 0; i < D.length; i++) {
    let m = Infinity;
    for (let j = 0; j < D.length; j++) if (j !== i && D[i][j] < m) m = D[i][j];
    if (m > t) t = m;
  }
  return t;
}

/**
 * A sparse weights matrix: nbr[i] lists j, wt[i] the raw weights.
 * kind: knn (k nearest), band (binary within threshold), inverse (1/d^power within threshold),
 * list (from a neighbour map keyed by id).
 */
export function buildWeights({ kind, D = null, ids = null, neighbors = null, k = 6, threshold = null, power = 1 }) {
  const n = D ? D.length : ids.length;
  const nbr = [], wt = [];
  let used = null;
  if (kind === "knn") {
    if (!(k >= 1)) throw new Error("k must be at least 1.");
    const kk = Math.min(Math.floor(k), n - 1);
    for (let i = 0; i < n; i++) {
      const o = [];
      for (let j = 0; j < n; j++) if (j !== i) o.push(j);
      o.sort((a, b) => D[i][a] - D[i][b] || a - b);
      nbr.push(o.slice(0, kk));
      wt.push(new Array(kk).fill(1));
    }
    used = { k: kk };
  } else if (kind === "band" || kind === "inverse") {
    const t = threshold != null && threshold !== "" && Number.isFinite(Number(threshold)) && Number(threshold) > 0 ? Number(threshold) : minThreshold(D);
    for (let i = 0; i < n; i++) {
      const a = [], b = [];
      for (let j = 0; j < n; j++) if (j !== i && D[i][j] <= t) {
        a.push(j);
        b.push(kind === "band" ? 1 : D[i][j] > 0 ? D[i][j] ** -power : NaN);
      }
      if (b.some(Number.isNaN)) throw new Error("Two places share the same coordinates, so an inverse-distance weight would be infinite. Use k nearest neighbours or a distance band.");
      nbr.push(a); wt.push(b);
    }
    used = { threshold: t, ...(kind === "inverse" ? { power } : {}) };
  } else if (kind === "list") {
    const index = new Map(ids.map((id, i) => [id, i]));
    const unknown = new Set();
    for (let i = 0; i < n; i++) {
      const set = neighbors.get(ids[i]) || new Set();
      const a = [];
      for (const name of set) { const j = index.get(name); if (j === undefined) unknown.add(name); else if (j !== i) a.push(j); }
      a.sort((p, q) => p - q);
      nbr.push(a); wt.push(new Array(a.length).fill(1));
    }
    used = { unknown: [...unknown] };
  } else throw new Error(`Unknown weights "${kind}". Use knn, band, inverse or list.`);
  return { n, nbr, wt, kind, ...used };
}

/** Row-standardise (r), make binary (b) or keep raw weights (none). */
export function transformWeights(W, transform = "r") {
  const wt = W.wt.map((row) => {
    if (transform === "b") return row.map(() => 1);
    if (transform === "r") { const s = row.reduce((a, b) => a + b, 0); return s > 0 ? row.map((v) => v / s) : row.slice(); }
    if (transform === "none") return row.slice();
    throw new Error(`Unknown transform "${transform}". Use r, b or none.`);
  });
  return { ...W, wt, transform };
}

/** S0, S1, S2 of Cliff and Ord. */
export function weightSums(W) {
  const { n, nbr, wt } = W;
  const cell = new Map();
  const rs = new Float64Array(n), cs = new Float64Array(n);
  let s0 = 0;
  for (let i = 0; i < n; i++) for (let t = 0; t < nbr[i].length; t++) {
    const j = nbr[i][t], w = wt[i][t];
    s0 += w; rs[i] += w; cs[j] += w;
    cell.set(i * n + j, (cell.get(i * n + j) || 0) + w);
  }
  let s1 = 0;
  for (const [key, w] of cell) {
    const i = Math.floor(key / n), j = key % n;
    const back = cell.get(j * n + i) || 0;
    s1 += i === j ? 4 * w * w : (w + back) ** 2;
  }
  // each unordered pair was visited from both sides (or once when the reverse is absent)
  let s1fix = 0;
  for (const [key, w] of cell) {
    const i = Math.floor(key / n), j = key % n;
    if (i !== j && !cell.has(j * n + i)) s1fix += w * w; // the (j,i) side, never visited
  }
  s1 = 0.5 * (s1 + s1fix);
  let s2 = 0;
  for (let i = 0; i < n; i++) s2 += (rs[i] + cs[i]) ** 2;
  return { s0, s1, s2, rowSums: rs };
}

const lag = (W, v) => W.nbr.map((js, i) => { let s = 0; for (let t = 0; t < js.length; t++) s += W.wt[i][t] * v[js[t]]; return s; });

function shuffleInPlace(a, rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/**
 * esda's folded pseudo p-value: (min(#sim >= obs, #sim < obs) + 1) / (perm + 1). It is
 * one-sided in whichever direction the statistic fell, so testing it at 0.05 rejects a true
 * null about 10% of the time (eval/calibration-output.txt); the engine reports twice it as
 * the two-sided p and keeps this one as p_sim_one.
 */
function foldedP(sims, obs) {
  let larger = 0;
  for (const s of sims) if (s >= obs) larger++;
  if (sims.length - larger < larger) larger = sims.length - larger;
  return (larger + 1) / (sims.length + 1);
}

const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

// ---------- global statistics ----------

/** Global Moran's I with moments under normality and randomisation (two-sided p) and a permutation p. */
export function moran(y, W, { permutations = 0, rand = null, sums = null } = {}) {
  const n = y.length, m = mean(y), z = y.map((v) => v - m);
  const { s0, s1, s2 } = sums || weightSums(W);
  const z2 = z.reduce((a, b) => a + b * b, 0);
  if (!(z2 > 0)) throw new Error("Every value is the same, so there is no variation to correlate.");
  const calc = (zz) => { const l = lag(W, zz); let s = 0; for (let i = 0; i < n; i++) s += zz[i] * l[i]; return (n / s0) * s / z2; };
  const I = calc(z), EI = -1 / (n - 1), n2 = n * n, s02 = s0 * s0;
  const VI_norm = (n2 * s1 - n * s2 + 3 * s02) / ((n - 1) * (n + 1) * s02) - EI * EI;
  const k = (z.reduce((a, b) => a + b ** 4, 0) / n) / (z2 / n) ** 2;
  const A = n * ((n2 - 3 * n + 3) * s1 - n * s2 + 3 * s02), B = k * ((n2 - n) * s1 - 2 * n * s2 + 6 * s02);
  const VI_rand = (A - B) / ((n - 1) * (n - 2) * (n - 3) * s02) - EI * EI;
  const z_norm = (I - EI) / Math.sqrt(VI_norm), z_rand = (I - EI) / Math.sqrt(VI_rand);
  const out = { I, EI, VI_norm, z_norm, p_norm: p2(z_norm), VI_rand, z_rand, p_rand: p2(z_rand) };
  if (permutations > 0) {
    const sims = [], zz = z.slice();
    for (let p = 0; p < permutations; p++) sims.push(calc(shuffleInPlace(zz, rand)));
    out.p_sim_one = foldedP(sims, I);
    out.p_sim = Math.min(1, 2 * out.p_sim_one);
    out.EI_sim = mean(sims);
    out.permutations = permutations;
  }
  return out;
}

/** Geary's C with moments under normality and randomisation (two-sided p) and a permutation p. */
export function geary(y, W, { permutations = 0, rand = null, sums = null } = {}) {
  const n = y.length, m = mean(y), z = y.map((v) => v - m);
  const { s0, s1, s2 } = sums || weightSums(W);
  const z2 = z.reduce((a, b) => a + b * b, 0);
  const calc = (v) => { let s = 0; for (let i = 0; i < n; i++) for (let t = 0; t < W.nbr[i].length; t++) s += W.wt[i][t] * (v[i] - v[W.nbr[i][t]]) ** 2; return ((n - 1) * s) / (2 * s0 * z2); };
  const C = calc(y), n2 = n * n, s02 = s0 * s0;
  const k = (z.reduce((a, b) => a + b ** 4, 0) / n) / (z2 / n) ** 2;
  const A = (n - 1) * s1 * (n2 - 3 * n + 3 - (n - 1) * k);
  const B = 0.25 * ((n - 1) * s2 * (n2 + 3 * n - 6 - (n2 - n + 2) * k));
  const Cc = s02 * (n2 - 3 - (n - 1) ** 2 * k);
  const VC_rand = (A - B + Cc) / (n * (n - 2) * (n - 3) * s02);
  const VC_norm = ((2 * s1 + s2) * (n - 1) - 4 * s02) / (2 * (n + 1) * s02);
  const z_norm = (C - 1) / Math.sqrt(VC_norm), z_rand = (C - 1) / Math.sqrt(VC_rand);
  const out = { C, EC: 1, VC_norm, z_norm, p_norm: p2(z_norm), VC_rand, z_rand, p_rand: p2(z_rand) };
  if (permutations > 0) {
    const sims = [], yy = y.slice();
    for (let p = 0; p < permutations; p++) sims.push(calc(shuffleInPlace(yy, rand)));
    out.p_sim_one = foldedP(sims, C);
    out.p_sim = Math.min(1, 2 * out.p_sim_one);
    out.permutations = permutations;
  }
  return out;
}

/** Getis-Ord General G on binary weights; values must be non-negative. */
export function generalG(y, Wb, { permutations = 0, rand = null } = {}) {
  if (y.some((v) => v < 0)) return { G: null, reason: "General G needs non-negative values (counts, rates, prices); this column has negatives." };
  const n = y.length, { s0, s1, s2 } = weightSums(Wb);
  const sy = y.reduce((a, b) => a + b, 0), sy2 = y.reduce((a, b) => a + b * b, 0);
  const sy3 = y.reduce((a, b) => a + b ** 3, 0), sy4 = y.reduce((a, b) => a + b ** 4, 0);
  const den = sy * sy - sy2;
  if (!(den > 0)) return { G: null, reason: "General G needs at least two non-zero values." };
  const calc = (v) => { const l = lag(Wb, v); let s = 0; for (let i = 0; i < n; i++) s += v[i] * l[i]; return s / den; };
  const G = calc(y), EG = s0 / (n * (n - 1)), n2 = n * n, s02 = s0 * s0;
  const b0 = (n2 - 3 * n + 3) * s1 - n * s2 + 3 * s02;
  const b1 = -((n2 - n) * s1 - 2 * n * s2 + 6 * s02);
  const b2 = -(2 * n * s1 - (n + 3) * s2 + 6 * s02);
  const b3 = 4 * (n - 1) * s1 - 2 * (n + 1) * s2 + 8 * s02;
  const b4 = s1 - s2 + s02;
  const EG2 = (b0 * sy2 ** 2 + b1 * sy4 + b2 * sy ** 2 * sy2 + b3 * sy * sy3 + b4 * sy ** 4) / (den ** 2 * n * (n - 1) * (n - 2) * (n - 3));
  const VG = EG2 - EG * EG, z = (G - EG) / Math.sqrt(VG);
  const out = { G, EG, VG, z_norm: z, p_norm: p2(z) };
  if (permutations > 0) {
    const sims = [], yy = y.slice();
    for (let p = 0; p < permutations; p++) sims.push(calc(shuffleInPlace(yy, rand)));
    out.p_sim_one = foldedP(sims, G);
    out.p_sim = Math.min(1, 2 * out.p_sim_one);
    out.permutations = permutations;
  }
  return out;
}

// ---------- local statistics ----------

const QUAD = { 1: "high-high", 2: "low-high", 3: "low-low", 4: "high-low" };

/**
 * Local Moran's I (Anselin 1995) on standardised values, with conditional-permutation pseudo
 * p-values and the Sokal et al. (1998) conditional-randomisation z.
 */
export function localMoran(y, W, { permutations = 999, rand = null } = {}) {
  const n = y.length, m = mean(y);
  const sd = Math.sqrt(y.reduce((a, b) => a + (b - m) ** 2, 0) / n);
  const z = y.map((v) => (v - m) / sd);
  const den = z.reduce((a, b) => a + b * b, 0);
  const zl = lag(W, z);
  const Is = z.map((v, i) => ((n - 1) * v * zl[i]) / den);
  const q = z.map((v, i) => (v > 0 ? (zl[i] > 0 ? 1 : 4) : zl[i] > 0 ? 2 : 3));
  const m2 = den / n, m4 = z.reduce((a, b) => a + b ** 4, 0) / n;
  const wi = W.wt.map((r) => r.reduce((a, b) => a + b, 0)), wi2 = W.wt.map((r) => r.reduce((a, b) => a + b * b, 0));
  const EIc = z.map((v, i) => -(v * v * wi[i]) / ((n - 1) * m2));
  const VIc = z.map((v, i) => (v / m2) ** 2 * (n / (n - 2)) * (wi2[i] - wi[i] ** 2 / (n - 1)) * (m2 - v * v / (n - 1)));
  const zc = Is.map((I, i) => (VIc[i] > 0 ? (I - EIc[i]) / Math.sqrt(VIc[i]) : NaN));
  let p_sim = null, p_sim_one = null;
  if (permutations > 0) {
    p_sim = new Array(n); p_sim_one = new Array(n);
    const pool = new Int32Array(n - 1);
    for (let i = 0; i < n; i++) {
      const ki = W.nbr[i].length;
      if (!ki) { p_sim[i] = p_sim_one[i] = NaN; continue; }
      let c = 0;
      for (let j = 0; j < n; j++) if (j !== i) pool[c++] = j;
      let larger = 0;
      const scale = ((n - 1) * z[i]) / den;
      for (let p = 0; p < permutations; p++) {
        // partial Fisher-Yates: the first ki slots become a random draw without replacement
        let s = 0;
        for (let t = 0; t < ki; t++) {
          const r = t + Math.floor(rand() * (n - 1 - t));
          const tmp = pool[t]; pool[t] = pool[r]; pool[r] = tmp;
          s += W.wt[i][t] * z[pool[t]];
        }
        if (scale * s >= Is[i]) larger++;
      }
      if (permutations - larger < larger) larger = permutations - larger;
      p_sim_one[i] = (larger + 1) / (permutations + 1);
      p_sim[i] = Math.min(1, 2 * p_sim_one[i]);
    }
  }
  return { Is, z, lag: zl, q, quadrant: q.map((v) => QUAD[v]), EIc, VIc, z_cond: zc, p_cond: zc.map(p2), p_sim, p_sim_one };
}

/** Getis-Ord Gi* (Ord & Getis 1995): binary neighbours plus the place itself. */
export function getisOrdGiStar(y, Wb) {
  const n = y.length, m = mean(y);
  const s = Math.sqrt(y.reduce((a, b) => a + b * b, 0) / n - m * m);
  return y.map((yi, i) => {
    let sum = yi, wsum = 1, w2 = 1;
    for (let t = 0; t < Wb.nbr[i].length; t++) { const w = Wb.wt[i][t]; sum += w * y[Wb.nbr[i][t]]; wsum += w; w2 += w * w; }
    const d = s * Math.sqrt((n * w2 - wsum * wsum) / (n - 1));
    return d > 0 ? (sum - m * wsum) / d : NaN;
  });
}

/** Benjamini-Hochberg: the largest p(k) with p(k) <= k alpha / m, or 0 when none passes. */
export function fdrThreshold(ps, alpha) {
  const v = ps.filter(Number.isFinite).sort((a, b) => a - b), m = v.length;
  let t = 0;
  for (let k = 1; k <= m; k++) if (v[k - 1] <= (k * alpha) / m) t = v[k - 1];
  return t;
}

// ---------- correlogram ----------

/** Moran's I in distance rings (binary, row-standardised), randomisation z and p. */
export function correlogram(y, D, { bands = 8, maxDistance = null } = {}) {
  const n = y.length;
  let dmax = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (D[i][j] > dmax) dmax = D[i][j];
  const top = maxDistance > 0 ? maxDistance : dmax / 2;
  const width = top / bands, out = [];
  for (let b = 0; b < bands; b++) {
    const lo = b * width, hi = (b + 1) * width;
    const nbr = [], wt = [];
    let pairs = 0;
    for (let i = 0; i < n; i++) {
      const a = [];
      for (let j = 0; j < n; j++) if (j !== i && D[i][j] > lo && D[i][j] <= hi) a.push(j);
      pairs += a.length;
      nbr.push(a); wt.push(a.map(() => 1));
    }
    const W = transformWeights({ n, nbr, wt }, "r");
    const covered = nbr.filter((a) => a.length).length;
    if (pairs === 0 || covered < 3) { out.push({ from: lo, to: hi, pairs: pairs / 2, I: null, z: null, p: null }); continue; }
    const r = moran(y, W);
    out.push({ from: lo, to: hi, pairs: pairs / 2, places: covered, I: r.I, EI: r.EI, z: r.z_rand, p: r.p_rand });
  }
  return out;
}

// ---------- analyze ----------

const fmt = (v, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : Math.abs(v) >= 1e5 ? v.toExponential(2) : v.toFixed(d));
const fmtP = (p) => (!Number.isFinite(p) ? "n/a" : p < 0.001 ? "< 0.001" : p.toFixed(3));
const fmtD = (d, geo) => `${d >= 100 ? Math.round(d).toLocaleString("en-US") : Number(d.toPrecision(3))}${geo ? " km" : ""}`;

function hotLabel(z) {
  const a = Math.abs(z);
  if (!Number.isFinite(z) || a < 1.6449) return "not significant";
  const lvl = a >= 2.5758 ? "99%" : a >= 1.96 ? "95%" : "90%";
  return `${z > 0 ? "hot" : "cold"} spot ${lvl}`;
}

/**
 * Everything for a table of places:
 * input { text, neighbors?, id?, x?, y?, variables?, weights, k, threshold, power, transform,
 *         coordinates, permutations, seed, alpha, fdr, bands, local? }
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  if (!String(o.text ?? "").trim()) throw new Error("Paste a table: one row per place, a value column, and either coordinates (lon/lat or x/y) or a neighbour list.");
  const { header, rows } = parseCsv(o.text);
  if (rows.length < 5) throw new Error("Spatial autocorrelation needs at least 5 places.");
  if (rows.length > MAX_ROWS) throw new Error(`At most ${MAX_ROWS.toLocaleString("en-US")} places (the page compares every pair). Aggregate or sample first.`);
  const cols = detectColumns(header, rows, o);
  const nbMap = parseNeighbors(o.neighbors);
  let kind = o.weights === "auto" ? (nbMap ? "list" : "knn") : o.weights;
  if (kind === "list" && !nbMap) throw new Error("Neighbour-list weights need a neighbour list (place, then its neighbours separated by semicolons).");
  if (kind !== "list" && cols.x < 0) throw new Error("No coordinate columns found (lon/lat, longitude/latitude or x/y). Add them, name them with x and y, or give a neighbour list.");
  if (kind === "list" && cols.id < 0) throw new Error("A neighbour list needs an id column naming each place.");
  const transform = o.transform === "none" && kind !== "inverse" ? "b" : o.transform;
  const perms = Math.max(0, Math.min(9999, Math.floor(Number(o.permutations) || 0)));
  const alpha = Number(o.alpha) > 0 && Number(o.alpha) < 1 ? Number(o.alpha) : 0.05;
  const ids = rows.map((r, i) => (cols.id >= 0 && r[cols.id] ? r[cols.id] : `row ${i + 2}`));
  if (kind === "list") {
    const dup = ids.find((v, i) => ids.indexOf(v) !== i);
    if (dup) throw new Error(`The id "${dup}" appears twice; a neighbour list needs unique ids.`);
  }
  const xsAll = cols.x >= 0 ? rows.map((r) => num(r[cols.x])) : null;
  const ysAll = cols.x >= 0 ? rows.map((r) => num(r[cols.y])) : null;
  if (cols.geographic && xsAll) {
    const badLat = ysAll.findIndex((v) => Number.isFinite(v) && Math.abs(v) > 90);
    if (badLat >= 0) throw new Error(`Latitude ${ysAll[badLat]} on ${ids[badLat]} is outside -90..90. Are longitude and latitude swapped? Set the coordinate type to planar for projected x/y.`);
  }
  const warnings = [];
  if (nbMap && kind === "list") {
    const missing = ids.filter((id) => !nbMap.has(id));
    if (missing.length) warnings.push(`${missing.length} place(s) are not in the neighbour list and have no neighbours: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}.`);
  }
  const results = [];
  cols.variables.forEach((vj, vIndex) => {
    const keep = [];
    for (let i = 0; i < rows.length; i++) {
      if (!Number.isFinite(num(rows[i][vj]))) continue;
      if (kind !== "list" && !(Number.isFinite(xsAll[i]) && Number.isFinite(ysAll[i]))) continue;
      keep.push(i);
    }
    const name = header[vj];
    if (keep.length < 5) { results.push({ variable: name, n: keep.length, error: "Fewer than 5 places with a value and coordinates." }); return; }
    const y = keep.map((i) => num(rows[i][vj]));
    const pid = keep.map((i) => ids[i]);
    const D = kind === "list" && !xsAll ? null : xsAll ? distanceMatrix(keep.map((i) => xsAll[i]), keep.map((i) => ysAll[i]), cols.geographic) : null;
    const raw = buildWeights({ kind, D, ids: pid, neighbors: nbMap, k: Number(o.k), threshold: o.threshold, power: Number(o.power) || 1 });
    const W = transformWeights(raw, transform);
    const Wb = transformWeights(raw, "b");
    const islands = W.nbr.map((a, i) => (a.length ? null : pid[i])).filter(Boolean);
    // seeded by the column's name, so a column gets the same draws whatever else is in the table
    let h = 2166136261;
    for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const rand = rng(((Number(o.seed) >>> 0) ^ h) >>> 0);
    const sums = weightSums(W);
    let mi;
    try { mi = moran(y, W, { permutations: perms, rand, sums }); }
    catch (e) { results.push({ variable: name, n: y.length, error: e.message }); return; }
    const gc = geary(y, W, { permutations: perms, rand, sums });
    const gg = generalG(y, Wb, { permutations: perms, rand });
    const res = {
      variable: name, n: y.length,
      weights: { kind, transform, ...(raw.k ? { k: raw.k } : {}), ...(raw.threshold ? { threshold: raw.threshold } : {}), ...(raw.power ? { power: raw.power } : {}), links: W.nbr.reduce((a, b) => a + b.length, 0), meanNeighbors: W.nbr.reduce((a, b) => a + b.length, 0) / y.length, islands, s0: sums.s0, s1: sums.s1, s2: sums.s2 },
      moran: mi, geary: gc, generalG: gg,
    };
    if (raw.unknown && raw.unknown.length) warnings.push(`The neighbour list names ${raw.unknown.length} place(s) not in the table (ignored): ${raw.unknown.slice(0, 5).join(", ")}${raw.unknown.length > 5 ? ", ..." : ""}.`);
    if (o.local !== false) {
      // With FDR, the smallest possible two-sided p, 2 / (perm + 1), must be able to pass the
      // first Benjamini-Hochberg step, alpha / n; otherwise nothing can ever be flagged.
      let lperms = perms;
      if (o.fdr && perms > 0) {
        const need = Math.ceil((2 * y.length) / alpha);
        if (perms < need) {
          lperms = Math.min(need, 99999);
          warnings.push(`The false-discovery-rate cut-off needs at least ${need.toLocaleString("en-US")} permutations for ${y.length} places to flag anything, so local Moran used ${lperms.toLocaleString("en-US")}${lperms < need ? " (the cap; few places can pass)" : ""}.`);
        }
      }
      const lm = localMoran(y, W, { permutations: lperms, rand });
      const gi = getisOrdGiStar(y, Wb);
      const pLocal = lm.p_sim || lm.p_cond;
      const cut = o.fdr ? fdrThreshold(pLocal, alpha) : alpha;
      res.local = {
        pValue: lm.p_sim ? "permutation, two-sided" : "analytic (conditional randomisation), two-sided", permutations: lperms,
        cutoff: cut, fdr: Boolean(o.fdr),
        rows: pid.map((id, i) => ({
          id, value: y[i], ...(xsAll ? { x: xsAll[keep[i]], y: ysAll[keep[i]] } : {}),
          z: lm.z[i], lag: lm.lag[i], Ii: lm.Is[i], z_cond: lm.z_cond[i], p_cond: lm.p_cond[i], ...(lm.p_sim ? { p_sim: lm.p_sim[i], p_sim_one: lm.p_sim_one[i] } : {}),
          quadrant: lm.quadrant[i],
          cluster: W.nbr[i].length && pLocal[i] <= cut && cut > 0 ? lm.quadrant[i] : "not significant",
          gi_z: gi[i], gi_p: p2(gi[i]), hotspot: hotLabel(gi[i]),
        })),
      };
      const count = (lab) => res.local.rows.filter((r) => r.cluster === lab).map((r) => r.id);
      res.local.clusters = { "high-high": count("high-high"), "low-low": count("low-low"), "high-low": count("high-low"), "low-high": count("low-high") };
      res.local.hot = res.local.rows.filter((r) => r.gi_z >= 1.96).map((r) => r.id);
      res.local.cold = res.local.rows.filter((r) => r.gi_z <= -1.96).map((r) => r.id);
    }
    if (D && o.bands > 0) res.correlogram = correlogram(y, D, { bands: Math.min(30, Math.floor(o.bands)) });
    res.summary = summarize(res, cols.geographic, alpha);
    results.push(res);
  });
  const ok = results.filter((r) => !r.error);
  const out = {
    columns: { id: cols.id >= 0 ? header[cols.id] : null, x: cols.x >= 0 ? header[cols.x] : null, y: cols.y >= 0 ? header[cols.y] : null, geographic: cols.geographic, variables: cols.variables.map((j) => header[j]) },
    options: { weights: kind, transform, k: Number(o.k), threshold: o.threshold ?? null, permutations: perms, seed: Number(o.seed), alpha, fdr: Boolean(o.fdr) },
    warnings: [...new Set(warnings)], results,
  };
  if (ok.length > 1) {
    out.trend = ok.map((r) => ({ variable: r.variable, n: r.n, I: r.moran.I, z: r.moran.z_rand, p: r.moran.p_rand, p_sim: r.moran.p_sim ?? null, C: r.geary.C }));
    const hi = ok.reduce((a, b) => (b.moran.I > a.moran.I ? b : a)), lo = ok.reduce((a, b) => (b.moran.I < a.moran.I ? b : a));
    out.summary = `${ok.length} columns analysed. Moran's I ranges from ${fmt(lo.moran.I)} (${lo.variable}) to ${fmt(hi.moran.I)} (${hi.variable}); ${ok.filter((r) => (r.moran.p_sim ?? r.moran.p_rand) <= alpha && r.moran.I > r.moran.EI).length} of ${ok.length} show significant clustering at ${alpha}.`;
  } else out.summary = ok[0]?.summary ?? results[0]?.error ?? "";
  return out;
}

function summarize(r, geographic, alpha) {
  const m = r.moran, p = m.p_sim ?? m.p_rand;
  const pTxt = m.p_sim !== undefined ? `permutation p = ${fmtP(m.p_sim)} with ${m.permutations} permutations` : `p = ${fmtP(m.p_rand)} under randomisation`;
  let s;
  if (p > alpha) s = `${r.variable}: no significant spatial pattern. Neighbouring places are about as alike as places paired at random (Moran's I = ${fmt(m.I)}, expected ${fmt(m.EI)} with no pattern, z = ${fmt(m.z_rand, 2)}, ${pTxt}).`;
  else if (m.I > m.EI) s = `${r.variable} is spatially clustered: neighbouring places have more similar values than chance would give (Moran's I = ${fmt(m.I)}, expected ${fmt(m.EI)}, z = ${fmt(m.z_rand, 2)}, ${pTxt}).`;
  else s = `${r.variable} is spatially dispersed: neighbours are less alike than chance, like a checkerboard (Moran's I = ${fmt(m.I)}, expected ${fmt(m.EI)}, z = ${fmt(m.z_rand, 2)}, ${pTxt}).`;
  s += ` Geary's C = ${fmt(r.geary.C)} (1 means no pattern, below 1 clustering).`;
  if (r.local) {
    const c = r.local.clusters, list2 = (a) => (a.length > 6 ? `${a.slice(0, 6).join(", ")} and ${a.length - 6} more` : a.join(", "));
    const parts = [];
    if (c["high-high"].length) parts.push(`${c["high-high"].length} high-high (${list2(c["high-high"])})`);
    if (c["low-low"].length) parts.push(`${c["low-low"].length} low-low (${list2(c["low-low"])})`);
    if (c["high-low"].length) parts.push(`${c["high-low"].length} high-low outlier(s) (${list2(c["high-low"])})`);
    if (c["low-high"].length) parts.push(`${c["low-high"].length} low-high outlier(s) (${list2(c["low-high"])})`);
    s += parts.length ? ` Local Moran at ${r.local.fdr ? `a false-discovery rate of ${alpha}` : `p <= ${alpha}`}: ${parts.join("; ")}.` : ` No place is a significant local cluster or outlier at ${r.local.fdr ? `a false-discovery rate of ${alpha}` : `p <= ${alpha}`}.`;
    if (r.local.rows.length > 20 && !r.local.fdr) s += ` With ${r.local.rows.length} local tests, about ${Math.round(r.local.rows.length * alpha)} would pass by chance alone; turn on the false-discovery-rate option to control that.`;
  }
  const w = r.weights;
  const wTxt = w.kind === "knn" ? `${w.k} nearest neighbours` : w.kind === "band" ? `neighbours within ${fmtD(w.threshold, geographic)}` : w.kind === "inverse" ? `inverse distance${w.power !== 1 ? `^${w.power}` : ""} within ${fmtD(w.threshold, geographic)}` : "your neighbour list";
  s += ` Weights: ${wTxt}, ${w.transform === "r" ? "row-standardised" : w.transform === "b" ? "binary" : "raw"}.`;
  if (w.islands.length) s += ` ${w.islands.length} place(s) have no neighbours and only add to the mean: ${w.islands.slice(0, 5).join(", ")}.`;
  return s;
}

/** Plain-text report for the CLI and the download button. */
export function report(result) {
  const L = [];
  for (const r of result.results) {
    L.push(`== ${r.variable} (n = ${r.n}) ==`);
    if (r.error) { L.push(r.error, ""); continue; }
    L.push(r.summary, "");
    const m = r.moran, c = r.geary, g = r.generalG;
    L.push(`Moran's I   ${fmt(m.I, 4)}  E[I] ${fmt(m.EI, 4)}  z(norm) ${fmt(m.z_norm, 3)} p ${fmtP(m.p_norm)}  z(rand) ${fmt(m.z_rand, 3)} p ${fmtP(m.p_rand)}${m.p_sim !== undefined ? `  p(perm) ${fmtP(m.p_sim)}` : ""}`);
    L.push(`Geary's C   ${fmt(c.C, 4)}  E[C] 1       z(norm) ${fmt(c.z_norm, 3)} p ${fmtP(c.p_norm)}  z(rand) ${fmt(c.z_rand, 3)} p ${fmtP(c.p_rand)}${c.p_sim !== undefined ? `  p(perm) ${fmtP(c.p_sim)}` : ""}`);
    L.push(g.G === null ? `General G   n/a: ${g.reason}` : `General G   ${g.G.toPrecision(4)}  E[G] ${g.EG.toPrecision(4)}  z ${fmt(g.z_norm, 3)} p ${fmtP(g.p_norm)}${g.p_sim !== undefined ? `  p(perm) ${fmtP(g.p_sim)}` : ""}`);
    if (r.local) {
      L.push("", "place\tvalue\tlocal I\tp\tcluster\tGi* z\thot spot");
      for (const x of r.local.rows) L.push([x.id, x.value, fmt(x.Ii, 3), fmtP(x.p_sim ?? x.p_cond), x.cluster, fmt(x.gi_z, 2), x.hotspot].join("\t"));
    }
    if (r.correlogram) {
      L.push("", "distance ring\tpairs\tMoran's I\tz\tp");
      for (const b of r.correlogram) L.push([`${fmt(b.from, 1)}-${fmt(b.to, 1)}`, b.pairs, fmt(b.I, 3), fmt(b.z, 2), fmtP(b.p)].join("\t"));
    }
    L.push("");
  }
  if (result.trend) {
    L.push("== Moran's I by column ==", "column\tI\tz\tp");
    for (const t of result.trend) L.push([t.variable, fmt(t.I, 4), fmt(t.z, 2), fmtP(t.p_sim ?? t.p)].join("\t"));
  }
  return L.join("\n");
}
