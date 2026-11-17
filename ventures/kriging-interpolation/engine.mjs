// Kriging: fill in a map from scattered readings (soil samples, wells, rain
// gauges, sensors, survey points), with a standard error at every place, and
// say how well that beats simpler guesses. From the papers: the empirical
// semivariogram (Matheron 1963) and its robust form (Cressie & Hawkins 1980),
// a variogram model fitted by Cressie's (1985) weighted least squares,
// ordinary kriging (Matheron 1963; Krige 1951 is the origin of the name), the
// closed-form leave-one-out check of Dubrule (1983), and, as the baselines it
// has to beat, inverse-distance weighting (Shepard 1968) and the nearest
// reading. Longitude and latitude are handled on the sphere by chordal
// distance, under which the three models stay valid (Gneiting 2013).
//
// Pure functions, no DOM, no network, no randomness except the seeded
// generator the tests use. Implemented from the papers; no third-party code
// was ported.

export const PAPERS = [
  {
    authors: "G. Matheron",
    title: "Principles of geostatistics",
    venue: "Economic Geology 58(8), 1246-1266",
    year: 1963,
    url: "https://doi.org/10.2113/gsecongeo.58.8.1246",
    doi: "10.2113/gsecongeo.58.8.1246",
    implemented: "The semivariogram gamma(h) = half the mean squared difference between readings h apart, its classical estimator from binned pairs, and ordinary kriging: the weighted average of the readings, weights summing to one, that has the smallest expected squared error under the fitted variogram, with its kriging variance. Solved in the variogram form [Gamma 1; 1' 0][lambda; mu] = [gamma0; 1].",
    deviations: "Isotropic only (the same variogram in every direction) and a constant unknown mean (no trend, no universal kriging). The whole data set is one neighbourhood: every reading enters every estimate. Duplicate locations are averaged first. The nugget is treated as micro-scale variation, so the estimate passes exactly through each reading (the usual ordinary kriging convention).",
  },
  {
    authors: "D. G. Krige",
    title: "A statistical approach to some basic mine valuation problems on the Witwatersrand",
    venue: "Journal of the Chemical, Metallurgical and Mining Society of South Africa 52(6), 119-139",
    year: 1951,
    url: "https://www.saimm.co.za/",
    implemented: "Credited as the origin of the method and its name; Matheron formalised it.",
    deviations: "Nothing implemented from this paper directly.",
  },
  {
    authors: "Noel Cressie, Douglas M. Hawkins",
    title: "Robust estimation of the variogram: I",
    venue: "Mathematical Geology 12(2), 115-125",
    year: 1980,
    url: "https://doi.org/10.1007/BF01035243",
    doi: "10.1007/BF01035243",
    implemented: "The robust estimator 2 gamma(h) = [mean of |z_i - z_j|^(1/2)]^4 / (0.457 + 0.494 / N(h)), offered as estimator 'cressie' for data with a few wild readings.",
    deviations: "None.",
  },
  {
    authors: "Noel Cressie",
    title: "Fitting variogram models by weighted least squares",
    venue: "Mathematical Geology 17(5), 563-586",
    year: 1985,
    url: "https://doi.org/10.1007/BF01032109",
    doi: "10.1007/BF01032109",
    implemented: "The fit criterion sum over lags of N(h) [gamma_hat(h) / gamma(h; theta) - 1]^2, which weights lags with many pairs and small semivariance most. For each range the model is linear in nugget and partial sill, solved by iteratively reweighted least squares with both kept non-negative; the range is scanned on a log grid and refined by golden-section search.",
    deviations: "Spherical, exponential and Gaussian models only (and linear for teaching); the range is the practical range (95% of the sill) for the exponential and Gaussian. 'auto' chooses among the three bounded models by leave-one-out error, not by the fit criterion.",
  },
  {
    authors: "Olivier Dubrule",
    title: "Cross validation of kriging in a unique neighborhood",
    venue: "Mathematical Geology 15(6), 687-699",
    year: 1983,
    url: "https://doi.org/10.1007/BF01033232",
    doi: "10.1007/BF01033232",
    implemented: "Leave-one-out errors from one inverse of the kriging matrix: with Q the inverse and b = [z; 0], the error at reading i is (Q b)_i / Q_ii and its kriging variance is -1 / Q_ii (the sign is for the variogram form). Reported as RMSE, mean error and the mean standardised squared error, which is near 1 when the standard errors are honest.",
    deviations: "Dubrule writes it for the covariance form; the variogram form used here changes only the sign of the variance, as the tests check against a refit with each reading removed.",
  },
  {
    authors: "Donald Shepard",
    title: "A two-dimensional interpolation function for irregularly-spaced data",
    venue: "Proceedings of the 1968 23rd ACM National Conference, 517-524",
    year: 1968,
    url: "https://doi.org/10.1145/800186.810616",
    doi: "10.1145/800186.810616",
    implemented: "Inverse-distance weighting with power 2 over every reading, the baseline kriging is compared against in the leave-one-out check.",
    deviations: "Shepard's local neighbourhood and direction terms are not used: plain global 1/d^2 weights.",
  },
  {
    authors: "Tilmann Gneiting",
    title: "Strictly and non-strictly positive definite functions on spheres",
    venue: "Bernoulli 19(4), 1327-1349",
    year: 2013,
    url: "https://doi.org/10.3150/12-BEJSP06",
    doi: "10.3150/12-BEJSP06",
    implemented: "Why chordal distance is used for longitude and latitude: a covariance valid in three dimensions stays valid on the sphere when distance is measured through it, as the spherical, exponential and Gaussian models are. Great-circle distance would not keep the Gaussian model valid.",
    deviations: "The Earth is taken as a sphere of radius 6,371.0088 km.",
  },
];

export const MODELS = ["spherical", "exponential", "gaussian", "linear"];
export const LIMITS = { points: 1000, grid: 40000, predict: 5000 };
export const DEFAULTS = { model: "auto", estimator: "matheron", lags: 15, maxLagFraction: 0.5, gridX: 72, mask: 1.5, idwPower: 2 };
export const EARTH_RADIUS_KM = 6371.0088;

export const fmt = (v, d = 2) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toString() : String(v));
const sig = (v, s = 3) => (Number.isFinite(v) ? (v === 0 ? "0" : Number(v.toPrecision(s)).toString()) : String(v));

// ---------- input ----------

const LON = /^(lon|long|longitude|lng|x_lon)$/i;
const LAT = /^(lat|latitude|y_lat)$/i;
const X = /^(x|easting|east|e|x_m|xcoord|x_coord)$/i;
const Y = /^(y|northing|north|n|y_m|ycoord|y_coord)$/i;

function splitLine(line, sep) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const num = (s) => (s === "" || s == null ? NaN : Number(String(s).replace(/^\+/, "")));

/**
 * Parse CSV/TSV text of readings. Columns: two coordinates and a value.
 * Header names pick them (lon/lat, x/y, easting/northing); without a header,
 * the first three columns are x, y, value. `opts.value` names the value
 * column; `opts.coords` forces 'xy' or 'lonlat'.
 */
export function parsePoints(text, opts = {}) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return { error: "No readings: paste rows of x, y, value (or lon, lat, value)." };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const first = splitLine(lines[0], sep);
  const header = first.some((c) => c !== "" && !Number.isFinite(num(c)));
  const names = header ? first : first.map((_, i) => ["x", "y", "value"][i] ?? `col${i + 1}`);
  const rows = (header ? lines.slice(1) : lines).map((l) => splitLine(l, sep));
  const find = (re) => names.findIndex((n) => re.test(n));
  let ix = -1, iy = -1, coords = opts.coords;
  const lo = find(LON), la = find(LAT);
  if (coords !== "xy" && lo >= 0 && la >= 0) { ix = lo; iy = la; coords = "lonlat"; }
  else {
    ix = find(X); iy = find(Y);
    if (ix < 0 || iy < 0) { ix = 0; iy = 1; }
    coords = coords === "lonlat" ? "lonlat" : "xy";
  }
  let iv;
  if (opts.value != null && opts.value !== "") {
    iv = names.findIndex((n) => n.toLowerCase() === String(opts.value).toLowerCase());
    if (iv < 0) return { error: `No column named "${opts.value}". Columns: ${names.join(", ")}.` };
  } else {
    iv = names.findIndex((n, i) => i !== ix && i !== iy && rows.some((r) => Number.isFinite(num(r[i]))));
    if (iv < 0) return { error: "Need a third column with the values to map." };
  }
  if (iv === ix || iv === iy) return { error: "The value column cannot be a coordinate." };
  const pts = [];
  let skipped = 0;
  for (const r of rows) {
    const x = num(r[ix]), y = num(r[iy]), v = num(r[iv]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(v)) { skipped++; continue; }
    if (coords === "lonlat" && (Math.abs(y) > 90 || Math.abs(x) > 360)) return { error: `Latitude ${y} or longitude ${x} is out of range.` };
    pts.push({ x, y, v });
  }
  return { points: pts, coords, names: { x: names[ix], y: names[iy], value: names[iv] }, skipped, columns: names };
}

// ---------- geometry ----------

function toXYZ(lon, lat) {
  const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
  return [EARTH_RADIUS_KM * Math.cos(p) * Math.cos(l), EARTH_RADIUS_KM * Math.cos(p) * Math.sin(l), EARTH_RADIUS_KM * Math.sin(p)];
}

/** Returns a distance function over {x, y} for the coordinate system. */
export function distanceFn(coords) {
  if (coords === "lonlat") {
    return (a, b) => {
      const A = a._xyz || (a._xyz = toXYZ(a.x, a.y));
      const B = b._xyz || (b._xyz = toXYZ(b.x, b.y));
      return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    };
  }
  return (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
}

/** Great-circle (haversine) distance in km, for reporting only. */
export function greatCircleKm(lon1, lat1, lon2, lat2) {
  const r = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Average readings that share a location (a singular kriging matrix otherwise). */
export function mergeDuplicates(points, coords) {
  const key = (p) => (coords === "lonlat" ? `${(((p.x % 360) + 540) % 360) - 180}|${p.y}` : `${p.x}|${p.y}`);
  const m = new Map();
  for (const p of points) {
    const k = Math.abs(p.y) === 90 && coords === "lonlat" ? `pole${p.y}` : key(p);
    const e = m.get(k);
    if (e) { e.sum += p.v; e.n++; } else m.set(k, { x: p.x, y: p.y, sum: p.v, n: 1 });
  }
  const out = [...m.values()].map((e) => ({ x: e.x, y: e.y, v: e.sum / e.n, n: e.n }));
  return { points: out, merged: points.length - out.length };
}

// ---------- variogram ----------

/** Empirical semivariogram: equal-width lag bins up to maxLag. */
export function empiricalVariogram(points, { coords = "xy", lags = DEFAULTS.lags, maxLag, estimator = "matheron" } = {}) {
  const d = distanceFn(coords);
  const n = points.length;
  let dmax = 0;
  const D = [], G = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const h = d(points[i], points[j]);
    D.push(h); G.push(points[i].v - points[j].v);
    if (h > dmax) dmax = h;
  }
  const hmax = maxLag > 0 ? maxLag : dmax * DEFAULTS.maxLagFraction;
  const w = hmax / lags;
  const bins = Array.from({ length: lags }, () => ({ n: 0, hs: 0, sq: 0, sqrt: 0 }));
  for (let k = 0; k < D.length; k++) {
    if (D[k] > hmax || D[k] === 0) continue;
    const b = bins[Math.min(lags - 1, Math.floor(D[k] / w))];
    b.n++; b.hs += D[k]; b.sq += G[k] * G[k]; b.sqrt += Math.sqrt(Math.abs(G[k]));
  }
  const out = [];
  for (const b of bins) {
    if (!b.n) continue;
    const gamma = estimator === "cressie"
      ? (b.sqrt / b.n) ** 4 / (0.457 + 0.494 / b.n) / 2
      : b.sq / (2 * b.n);
    out.push({ h: b.hs / b.n, gamma, n: b.n });
  }
  return { bins: out, maxLag: hmax, maxDistance: dmax, pairs: D.length, estimator };
}

/** Semivariance of a model at distance h; gamma(0) = 0. */
export function gammaModel(m, h) {
  if (h <= 0) return 0;
  const { nugget: c0, psill: c, range: a } = m;
  switch (m.model) {
    case "spherical": return h >= a ? c0 + c : c0 + c * (1.5 * (h / a) - 0.5 * (h / a) ** 3);
    case "exponential": return c0 + c * (1 - Math.exp((-3 * h) / a));
    case "gaussian": return c0 + c * (1 - Math.exp(-3 * (h / a) ** 2));
    case "linear": return c0 + c * (h / a);
    default: throw new Error(`unknown model ${m.model}`);
  }
}

const shape = (model, h, a) => gammaModel({ model, nugget: 0, psill: 1, range: a }, h);

function wlsFixedRange(model, bins, a) {
  // gamma = c0 + c f(h); minimise sum N (gh/g - 1)^2 ~ sum N/g^2 (gh - g)^2, reweighting.
  const f = bins.map((b) => shape(model, b.h, a));
  const floor = 1e-12 * Math.max(...bins.map((b) => b.gamma), 1e-300);
  let g = bins.map((b) => Math.max(b.gamma, floor));
  let c0 = 0, c = 0;
  for (let it = 0; it < 25; it++) {
    let s = 0, sf = 0, sff = 0, sy = 0, sfy = 0;
    for (let k = 0; k < bins.length; k++) {
      const w = bins[k].n / (g[k] * g[k]);
      s += w; sf += w * f[k]; sff += w * f[k] * f[k]; sy += w * bins[k].gamma; sfy += w * f[k] * bins[k].gamma;
    }
    const det = s * sff - sf * sf;
    let n0 = det > 0 ? (sy * sff - sf * sfy) / det : 0;
    let n1 = det > 0 ? (s * sfy - sf * sy) / det : sfy / sff;
    if (n0 < 0) { n0 = 0; n1 = sff > 0 ? sfy / sff : 0; }
    if (n1 < 0) { n1 = 0; n0 = sy / s; }
    const done = Math.abs(n0 - c0) + Math.abs(n1 - c) <= 1e-10 * (Math.abs(n0) + Math.abs(n1) + floor);
    c0 = n0; c = n1;
    g = f.map((fk) => Math.max(c0 + c * fk, floor));
    if (done) break;
  }
  const m = { model, nugget: c0, psill: c, range: a };
  return { ...m, sse: cressieCriterion(m, bins) };
}

/** Cressie's (1985) weighted least-squares criterion. */
export function cressieCriterion(m, bins) {
  let s = 0;
  for (const b of bins) {
    const g = gammaModel(m, b.h);
    s += g > 0 ? b.n * (b.gamma / g - 1) ** 2 : b.gamma > 0 ? Infinity : 0;
  }
  return s;
}

/** Fit a variogram model to binned estimates by Cressie's WLS. */
export function fitVariogram(bins, model, { maxRange } = {}) {
  if (!bins.length) throw new Error("no lag bins with pairs");
  const hmin = Math.max(bins[0].h, 1e-12);
  const hmax = bins[bins.length - 1].h;
  const lo = hmin / 2, hi = Math.max(maxRange ?? 3 * hmax, 2 * hmin);
  const K = 80;
  const grid = Array.from({ length: K }, (_, i) => lo * (hi / lo) ** (i / (K - 1)));
  const fits = grid.map((a) => wlsFixedRange(model, bins, a));
  let best = 0;
  for (let i = 1; i < K; i++) if (fits[i].sse < fits[best].sse) best = i;
  let A = Math.log(grid[Math.max(0, best - 1)]), B = Math.log(grid[Math.min(K - 1, best + 1)]);
  const phi = (Math.sqrt(5) - 1) / 2;
  const F = (la) => wlsFixedRange(model, bins, Math.exp(la));
  let x1 = B - phi * (B - A), x2 = A + phi * (B - A), f1 = F(x1), f2 = F(x2);
  for (let it = 0; it < 60 && B - A > 1e-9; it++) {
    if (f1.sse <= f2.sse) { B = x2; x2 = x1; f2 = f1; x1 = B - phi * (B - A); f1 = F(x1); }
    else { A = x1; x1 = x2; f1 = f2; x2 = A + phi * (B - A); f2 = F(x2); }
  }
  let out = f1.sse <= f2.sse ? f1 : f2;
  if (fits[best].sse < out.sse) out = fits[best];
  return out;
}

// ---------- linear algebra ----------

/** Inverse of a dense square matrix (array of Float64Array rows) by Gauss-Jordan with partial pivoting. */
export function invert(M) {
  const n = M.length;
  const A = M.map((r) => Float64Array.from(r));
  const I = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
  let maxAbs = 0;
  for (const r of A) for (const v of r) maxAbs = Math.max(maxAbs, Math.abs(v));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) <= 1e-13 * maxAbs) throw new Error("the kriging matrix is singular (repeated locations, or a Gaussian model with no nugget on dense data)");
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [I[p], I[c]] = [I[c], I[p]]; }
    const ac = A[c], ic = I[c], inv = 1 / ac[c];
    for (let k = 0; k < n; k++) { ac[k] *= inv; ic[k] *= inv; }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f === 0) continue;
      const ar = A[r], ir = I[r];
      for (let k = c; k < n; k++) ar[k] -= f * ac[k];
      for (let k = 0; k < n; k++) ir[k] -= f * ic[k];
    }
  }
  return I;
}

// ---------- kriging ----------

/**
 * Ordinary kriging system for points under a variogram model. Returns an
 * object with predict(p) -> {estimate, variance, weights?}.
 */
export function krigingSystem(points, model, coords = "xy") {
  const n = points.length;
  if (n < 2) throw new Error("need at least two distinct locations");
  const d = distanceFn(coords);
  const M = Array.from({ length: n + 1 }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) { const g = gammaModel(model, d(points[i], points[j])); M[i][j] = g; M[j][i] = g; }
    M[i][n] = 1; M[n][i] = 1;
  }
  const Q = invert(M);
  const b = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) b[i] = points[i].v;
  const w = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) { let s = 0; const qi = Q[i]; for (let k = 0; k < n; k++) s += qi[k] * b[k]; w[i] = s; }
  const g = new Float64Array(n + 1);
  function predict(p, { variance = true, weights = false } = {}) {
    for (let i = 0; i < n; i++) g[i] = gammaModel(model, d(p, points[i]));
    g[n] = 1;
    let est = 0;
    for (let i = 0; i <= n; i++) est += w[i] * g[i];
    const out = { estimate: est };
    if (variance || weights) {
      let v = 0;
      const lam = weights ? new Float64Array(n + 1) : null;
      for (let i = 0; i <= n; i++) {
        const qi = Q[i];
        let s = 0;
        for (let k = 0; k <= n; k++) s += qi[k] * g[k];
        v += s * g[i];
        if (lam) lam[i] = s;
      }
      out.variance = Math.max(0, v);
      if (lam) { out.weights = Array.from(lam.subarray(0, n)); out.lagrange = lam[n]; }
    }
    return out;
  }
  function leaveOneOut() {
    return points.map((p, i) => {
      const e = w[i] / Q[i][i];
      return { estimate: p.v - e, error: e, variance: -1 / Q[i][i] };
    });
  }
  return { predict, leaveOneOut, Q, dualWeights: w };
}

/** Leave-one-out by inverse-distance weighting and by the nearest reading. */
export function baselinesLOO(points, coords = "xy", power = DEFAULTS.idwPower) {
  const d = distanceFn(coords);
  const n = points.length;
  return points.map((p, i) => {
    let sw = 0, swv = 0, best = Infinity, near = NaN, sum = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const h = d(p, points[j]);
      const wj = 1 / h ** power;
      sw += wj; swv += wj * points[j].v; sum += points[j].v;
      if (h < best) { best = h; near = points[j].v; }
    }
    return { idw: swv / sw, nearest: near, mean: sum / (n - 1), nearestDistance: best };
  });
}

/** Inverse-distance estimate at p (exact at readings). */
export function idw(points, p, coords = "xy", power = DEFAULTS.idwPower) {
  const d = distanceFn(coords);
  let sw = 0, swv = 0;
  for (const q of points) {
    const h = d(p, q);
    if (h === 0) return q.v;
    const w = 1 / h ** power;
    sw += w; swv += w * q.v;
  }
  return swv / sw;
}

function errStats(obs, est, vars) {
  let se = 0, sa = 0, sm = 0, ss = 0, nz = 0;
  for (let i = 0; i < obs.length; i++) {
    const e = obs[i] - est[i];
    se += e * e; sa += Math.abs(e); sm += e;
    if (vars && vars[i] > 0) { ss += (e * e) / vars[i]; nz++; }
  }
  const n = obs.length;
  const out = { rmse: Math.sqrt(se / n), mae: sa / n, meanError: sm / n };
  if (vars) out.msdr = nz ? ss / nz : NaN;
  return out;
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Seeded generator (mulberry32) for tests and simulations. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- top level ----------

export const SAMPLE_TEXT = `x,y,value
# Made-up example: 12 soil samples (metres, value in mg/kg)
2,3,41
11,4,47
19,2,55
5,12,38
14,11,44
22,13,58
3,21,33
12,19,40
21,22,51
8,7,43
17,17,49
9,25,35`;

/**
 * Analyse readings. input: { text | points:[{x,y,v}], coords, value, model,
 * estimator, lags, maxLag, nugget, psill, range, gridX, mask, predictAt:[[x,y]...] }
 */
export function analyze(input = {}) {
  const warnings = [];
  let parsed;
  if (Array.isArray(input.points)) {
    const pts = input.points.map((p) => (Array.isArray(p) ? { x: +p[0], y: +p[1], v: +p[2] } : { x: +p.x, y: +p.y, v: +(p.v ?? p.value) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.v));
    parsed = { points: pts, coords: input.coords === "lonlat" ? "lonlat" : "xy", names: { x: input.coords === "lonlat" ? "lon" : "x", y: input.coords === "lonlat" ? "lat" : "y", value: "value" }, skipped: input.points.length - pts.length };
  } else parsed = parsePoints(input.text ?? "", { coords: input.coords === "auto" ? undefined : input.coords, value: input.value });
  if (parsed.error) return { error: parsed.error };
  const coords = parsed.coords;
  if (parsed.skipped) warnings.push(`${parsed.skipped} row(s) without three numbers were skipped.`);
  const { points, merged } = mergeDuplicates(parsed.points, coords);
  if (merged) warnings.push(`${merged} reading(s) shared a location with another and were averaged into it.`);
  if (points.length < 5) return { error: `Need at least 5 distinct locations; got ${points.length}.` };
  if (points.length > LIMITS.points) return { error: `At most ${LIMITS.points} locations in one run (got ${points.length}); every reading enters every estimate, so the work grows with the cube of the count.` };
  const vals = points.map((p) => p.v);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
  if (!(variance > 0)) return { error: "Every reading has the same value; there is nothing to interpolate." };
  const unit = coords === "lonlat" ? "km" : "";

  const estimator = input.estimator === "cressie" ? "cressie" : "matheron";
  const lags = Math.max(3, Math.min(50, Math.round(input.lags || DEFAULTS.lags)));
  const ev = empiricalVariogram(points, { coords, lags, maxLag: input.maxLag, estimator });
  if (ev.bins.length < 3) return { error: "Too few distance classes with pairs to fit a variogram; try more lags or a longer maximum lag." };

  const wanted = input.model && input.model !== "auto" ? input.model : "auto";
  if (wanted !== "auto" && !MODELS.includes(wanted)) return { error: `Model is one of auto, ${MODELS.join(", ")}.` };
  const fixed = ["nugget", "psill", "range"].every((k) => Number.isFinite(input[k]));
  if (fixed && wanted === "auto") return { error: "To set nugget, partial sill and range yourself, name the model too." };
  const candidates = wanted === "auto" ? ["spherical", "exponential", "gaussian"] : [wanted];
  const tried = [];
  for (const mname of candidates) {
    let m;
    if (fixed) {
      if (!(input.range > 0) || input.nugget < 0 || input.psill < 0) return { error: "Range must be positive, nugget and partial sill at least 0." };
      m = { model: mname, nugget: input.nugget, psill: input.psill, range: input.range };
      m.sse = cressieCriterion(m, ev.bins);
    } else m = fitVariogram(ev.bins, mname);
    let sys, loo;
    try {
      sys = krigingSystem(points, m, coords);
      loo = sys.leaveOneOut();
    } catch (e) {
      if (mname === "gaussian" && m.nugget === 0) {
        // A Gaussian model with no nugget is numerically singular on close points; add the smallest nugget that works.
        let ok = false;
        for (const f of [1e-6, 1e-4, 1e-2]) {
          const m2 = { ...m, nugget: f * (m.psill || variance) };
          try { sys = krigingSystem(points, m2, coords); loo = sys.leaveOneOut(); m = { ...m2, sse: cressieCriterion(m2, ev.bins), nuggetAdded: true }; ok = true; break; } catch { /* next */ }
        }
        if (!ok) { tried.push({ ...m, failed: e.message }); continue; }
      } else { tried.push({ ...m, failed: e.message }); continue; }
    }
    const st = errStats(vals, loo.map((l) => l.estimate), loo.map((l) => l.variance));
    tried.push({ ...m, loo: st, _sys: sys, _loo: loo });
  }
  const ok = tried.filter((t) => t.loo);
  if (!ok.length) return { error: `Kriging failed: ${tried[0]?.failed ?? "no model"}` };
  ok.sort((a, b) => a.loo.rmse - b.loo.rmse);
  const best = ok[0];
  if (best.nuggetAdded) warnings.push("The Gaussian model with no nugget made the kriging matrix nearly singular, so a tiny nugget was added.");
  const sys = best._sys, loo = best._loo;
  const model = { model: best.model, nugget: best.nugget, psill: best.psill, range: best.range, sill: best.nugget + best.psill, criterion: best.sse };
  if (best.range > ev.maxDistance) warnings.push(`The fitted range (${sig(best.range)} ${unit}) is longer than the widest distance in the data (${sig(ev.maxDistance)} ${unit}): the readings never become unrelated within the area, so the sill is a guess.`.replace(/ \)/g, ")"));
  if (model.psill === 0) warnings.push("The fitted model is pure nugget: nearby readings are no more alike than distant ones, so kriging returns the mean almost everywhere. A map is not supported by these data.");

  const base = baselinesLOO(points, coords, DEFAULTS.idwPower);
  const kr = best.loo;
  const idwS = errStats(vals, base.map((b) => b.idw));
  const nnS = errStats(vals, base.map((b) => b.nearest));
  const meanS = errStats(vals, base.map((b) => b.mean));
  const spacing = median(base.map((b) => b.nearestDistance));

  // grid
  let xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 === x0) { x0 -= 1; x1 += 1; }
  if (y1 === y0) { y0 -= 1; y1 += 1; }
  const nx = Math.max(10, Math.min(200, Math.round(input.gridX || DEFAULTS.gridX)));
  const ny = Math.max(5, Math.min(200, Math.round((nx * (y1 - y0)) / (x1 - x0)) || 1));
  const maskF = Number.isFinite(input.mask) ? Math.max(0, input.mask) : DEFAULTS.mask;
  const d = distanceFn(coords);
  const cells = [];
  if (nx * ny <= LIMITS.grid && input.grid !== false) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = { x: x0 + ((i + 0.5) * (x1 - x0)) / nx, y: y0 + ((j + 0.5) * (y1 - y0)) / ny };
      let near = Infinity;
      for (const q of points) { const h = d(p, q); if (h < near) near = h; }
      if (maskF > 0 && near > maskF * spacing) { cells.push(null); continue; }
      const r = sys.predict(p);
      cells.push({ x: p.x, y: p.y, estimate: r.estimate, sd: Math.sqrt(r.variance) });
    }
  }
  const est = cells.filter(Boolean);

  const predictions = [];
  for (const q of (input.predictAt || []).slice(0, LIMITS.predict)) {
    const p = Array.isArray(q) ? { x: +q[0], y: +q[1] } : { x: +q.x, y: +q.y };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const r = sys.predict(p, { weights: false });
    const sd = Math.sqrt(r.variance);
    predictions.push({ x: p.x, y: p.y, estimate: r.estimate, sd, low95: r.estimate - 1.96 * sd, high95: r.estimate + 1.96 * sd, idw: idw(points, p, coords) });
  }

  const gain = (1 - kr.rmse / idwS.rmse) * 100;
  const worst = loo.map((l, i) => ({ i, z: l.error / Math.sqrt(l.variance) })).filter((e) => Number.isFinite(e.z)).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const outliers = worst.filter((e) => Math.abs(e.z) > 3).slice(0, 20).map((e) => ({ x: points[e.i].x, y: points[e.i].y, value: points[e.i].v, looEstimate: loo[e.i].estimate, z: e.z }));
  const vname = parsed.names.value;
  const rangeTxt = `${sig(model.range)}${unit ? " " + unit : ""}`;
  const nug = model.sill > 0 ? (model.nugget / model.sill) * 100 : 0;
  const summary =
    `Kriged ${points.length} readings of ${vname} with a${model.model === "exponential" ? "n" : ""} ${model.model} variogram: nugget ${sig(model.nugget)}, sill ${sig(model.sill)}, range ${rangeTxt}` +
    ` (${fmt(nug, 0)}% of the variation is at scales below the closest spacing or is measurement noise; ${model.range > ev.maxDistance ? "readings stay related across the whole area" : `readings farther apart than about ${rangeTxt} are unrelated`}). ` +
    `Left out one at a time, kriging misses by ${sig(kr.rmse)} RMS, against ${sig(idwS.rmse)} for inverse-distance weighting and ${sig(nnS.rmse)} for the nearest reading` +
    (gain >= 0 ? ` (${fmt(gain, 0)}% smaller than inverse distance).` : `: inverse distance does ${fmt(-gain, 0)}% better here, so the variogram model may not suit these data.`) +
    ` Its standard errors are ${kr.msdr > 1.5 ? "too small (mean standardised squared error " + fmt(kr.msdr, 2) + ", ideal 1): widen the bands" : kr.msdr < 0.67 ? "too wide (mean standardised squared error " + fmt(kr.msdr, 2) + ", ideal 1)" : "about right (mean standardised squared error " + fmt(kr.msdr, 2) + ", ideal 1)"}.` +
    (outliers.length ? ` ${outliers.length} reading(s) sit more than 3 standard errors from what their neighbours predict.` : "");

  return {
    summary,
    warnings,
    coords,
    names: parsed.names,
    unit,
    n: points.length,
    stats: { mean, variance, spacing },
    variogram: ev,
    model,
    models: tried.map((t) => ({ model: t.model, nugget: t.nugget, psill: t.psill, range: t.range, criterion: t.sse, loo: t.loo ?? null, failed: t.failed ?? null })),
    crossValidation: { kriging: kr, idw: idwS, nearest: nnS, mean: meanS, outliers },
    loo: points.map((p, i) => ({ x: p.x, y: p.y, value: p.v, kriging: loo[i].estimate, sd: Math.sqrt(loo[i].variance), idw: base[i].idw, nearest: base[i].nearest })),
    grid: { nx, ny, x0, x1, y0, y1, mask: maskF, cells, min: est.length ? Math.min(...est.map((c) => c.estimate)) : null, max: est.length ? Math.max(...est.map((c) => c.estimate)) : null, maxSd: est.length ? Math.max(...est.map((c) => c.sd)) : null },
    predictions,
    points: points.map((p) => ({ x: p.x, y: p.y, v: p.v })),
  };
}

export function csvCell(c) {
  let s = c == null ? "" : String(c);
  // CSV formula injection: column names are typed by the visitor, so a leading
  // = + - @ (or tab/CR) would run as a formula in a spreadsheet. Numbers are
  // written by the engine itself and never pass through here.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The grid as CSV (x, y, estimate, standard error); masked cells left out. */
export function toCsv(r) {
  const xn = r.names.x, yn = r.names.y;
  const rows = [[xn, yn, "estimate", "standard_error"].map(csvCell).join(",")];
  for (const c of r.grid.cells) if (c) rows.push([sig(c.x, 8), sig(c.y, 8), sig(c.estimate, 6), sig(c.sd, 6)].join(","));
  return rows.join("\n") + "\n";
}

/** Leave-one-out table as CSV. */
export function looCsv(r) {
  const rows = [[r.names.x, r.names.y, r.names.value, "kriging_loo", "kriging_sd", "idw_loo", "nearest"].map(csvCell).join(",")];
  for (const l of r.loo) rows.push([l.x, l.y, l.value, sig(l.kriging, 6), sig(l.sd, 6), sig(l.idw, 6), l.nearest].join(","));
  return rows.join("\n") + "\n";
}
