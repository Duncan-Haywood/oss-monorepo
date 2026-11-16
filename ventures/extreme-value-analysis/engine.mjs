// Extreme value analysis: return levels from block maxima (GEV, Gumbel) and
// from peaks over a threshold (generalized Pareto), with profile-likelihood
// intervals, declustering, threshold-stability checks and a trend test.
//
// Zero dependencies. Implemented from the mathematics in:
//   Coles (2001), An Introduction to Statistical Modeling of Extreme Values (Springer):
//     the GEV and GPD likelihoods, return levels (3.4, 4.3), the delta method (3.10, 4.15),
//     profile likelihood (2.6.5), mean residual life and threshold stability (4.3.4),
//     declustering by runs (5.3.2), a linear trend in the GEV location (6.3).
//   Jenkinson (1955), the GEV distribution; Fisher & Tippett (1928); Gnedenko (1943).
//   Pickands (1975) and Balkema & de Haan (1974), the GPD as the limit of excesses.
//   Hosking, Wallis & Wood (1985) and Hosking (1990), L-moment estimators (starting values
//   and an alternative fit).
//   Davison & Smith (1990), peaks over thresholds.
// No third-party code was ported. scipy 1.18.1 was used only to produce eval/reference.json,
// which engine.test.mjs checks against.
//
// Sign convention: Coles's. Shape xi > 0 is a heavy (Frechet-type) tail, xi = 0 the
// Gumbel/exponential tail, xi < 0 a bounded tail with an upper end point.
// (scipy's genextreme uses c = -xi; Hosking's k = -xi.)

export const PAPERS = [
  { key: "coles2001introduction", authors: "Coles, S.", year: 2001, title: "An Introduction to Statistical Modeling of Extreme Values", venue: "Springer Series in Statistics", doi: "10.1007/978-1-4471-3675-0", url: "https://doi.org/10.1007/978-1-4471-3675-0" },
  { key: "jenkinson1955frequency", authors: "Jenkinson, A. F.", year: 1955, title: "The frequency distribution of the annual maximum (or minimum) values of meteorological elements", venue: "Quarterly Journal of the Royal Meteorological Society 81(348), 158-171", doi: "10.1002/qj.49708134804", url: "https://doi.org/10.1002/qj.49708134804" },
  { key: "pickands1975statistical", authors: "Pickands, J.", year: 1975, title: "Statistical inference using extreme order statistics", venue: "Annals of Statistics 3(1), 119-131", doi: "10.1214/aos/1176343003", url: "https://doi.org/10.1214/aos/1176343003" },
  { key: "davison1990models", authors: "Davison, A. C. and Smith, R. L.", year: 1990, title: "Models for exceedances over high thresholds", venue: "Journal of the Royal Statistical Society B 52(3), 393-442", doi: "10.1111/j.2517-6161.1990.tb01796.x", url: "https://doi.org/10.1111/j.2517-6161.1990.tb01796.x" },
  { key: "hosking1985estimation", authors: "Hosking, J. R. M., Wallis, J. R. and Wood, E. F.", year: 1985, title: "Estimation of the generalized extreme-value distribution by the method of probability-weighted moments", venue: "Technometrics 27(3), 251-261", doi: "10.1080/00401706.1985.10488049", url: "https://doi.org/10.1080/00401706.1985.10488049" },
  { key: "hosking1990lmoments", authors: "Hosking, J. R. M.", year: 1990, title: "L-moments: analysis and estimation of distributions using linear combinations of order statistics", venue: "Journal of the Royal Statistical Society B 52(1), 105-124", doi: "10.1111/j.2517-6161.1990.tb01775.x", url: "https://doi.org/10.1111/j.2517-6161.1990.tb01775.x" },
];

export const DEFAULTS = {
  csv: "",
  value: "",           // value column (default: the last numeric column that is not a year)
  date: "",            // date column (YYYY-MM-DD); default: detected
  year: "",            // year column; default: detected (a column named *year*)
  yearStart: 1,        // month a block year starts (10 = the US water year, October to September)
  method: "auto",      // auto | gev | pot
  threshold: null,     // POT threshold; default: the 98th percentile of the series
  runLength: 3,        // declustering: a cluster ends after this many observations below the threshold
  perYear: null,       // observations per year, for a POT series with no dates
  returnPeriods: [2, 5, 10, 25, 50, 100, 200, 500],
  confidence: 0.95,
  trend: true,         // also fit a GEV whose location changes linearly with the year
  designLife: 50,      // years, for the chance of at least one exceedance over a design life
  profile: true,       // profile-likelihood intervals (slower, better than the delta method)
};

// ---------------------------------------------------------------- numerics

export function erfc(x) {
  // Numerical Recipes erfcc (Chebyshev fit), fractional error below 1.2e-7.
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);

export function normQuantile(p) {
  // Acklam's rational approximation, then one Halley step.
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// Upper tail of chi-square with 1 degree of freedom.
export const chi2Sf1 = (x) => (x <= 0 ? 1 : erfc(Math.sqrt(x / 2)));
// Its quantile at level conf: the square of the normal quantile.
export const chi2Q1 = (conf) => normQuantile((1 + conf) / 2) ** 2;

export function lgamma(x) {
  // Lanczos (g = 7, n = 9).
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
export const gamma = (x) => (x > 0 ? Math.exp(lgamma(x)) : Math.PI / (Math.sin(Math.PI * x) * Math.exp(lgamma(1 - x))));

// Nelder-Mead simplex minimiser with restarts. f returns Infinity outside the support.
export function nelderMead(f, x0, { step = null, tol = 1e-11, maxIter = 4000, restarts = 3 } = {}) {
  const n = x0.length;
  let best = { x: x0.slice(), f: f(x0) };
  for (let r = 0; r <= restarts; r++) {
    const start = best.x.slice();
    const pts = [start];
    for (let i = 0; i < n; i++) {
      const p = start.slice();
      const h = step ? step[i] * (r === 0 ? 1 : 0.25) : (Math.abs(p[i]) > 1e-8 ? 0.05 * Math.abs(p[i]) : 0.00025);
      p[i] += h;
      pts.push(p);
    }
    let vals = pts.map(f);
    for (let it = 0; it < maxIter; it++) {
      const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      const P = order.map((i) => pts[i]);
      const V = order.map((i) => vals[i]);
      pts.splice(0, pts.length, ...P);
      vals = V;
      const spread = Math.abs(vals[n] - vals[0]);
      if (Number.isFinite(vals[n]) && spread <= tol * (Math.abs(vals[0]) + tol)) {
        let size = 0;
        for (let i = 1; i <= n; i++) for (let j = 0; j < n; j++) size = Math.max(size, Math.abs(pts[i][j] - pts[0][j]) / (Math.abs(pts[0][j]) + 1e-8));
        if (size < 1e-9) break;
      }
      const cen = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += pts[i][j] / n;
      const at = (t) => cen.map((c, j) => c + t * (pts[n][j] - c));
      const xr = at(-1), fr = f(xr);
      if (fr < vals[0]) {
        const xe = at(-2), fe = f(xe);
        if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; }
      } else if (fr < vals[n - 1]) {
        pts[n] = xr; vals[n] = fr;
      } else {
        const outside = fr < vals[n];
        const xc = at(outside ? -0.5 : 0.5), fc = f(xc);
        if (fc < (outside ? fr : vals[n])) { pts[n] = xc; vals[n] = fc; }
        else {
          for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); }
        }
      }
    }
    const i0 = vals.indexOf(Math.min(...vals));
    const improved = vals[i0] < best.f - 1e-12 * (Math.abs(best.f) + 1);
    if (vals[i0] <= best.f) best = { x: pts[i0].slice(), f: vals[i0] };
    if (r > 0 && !improved) break;
  }
  return best;
}

// Central-difference Hessian.
export function hessian(f, x, h) {
  const n = x.length;
  const H = Array.from({ length: n }, () => new Array(n).fill(0));
  const fx = f(x);
  const at = (d) => f(x.map((v, i) => v + (d[i] || 0)));
  for (let i = 0; i < n; i++) {
    const ei = []; ei[i] = h[i];
    const mi = []; mi[i] = -h[i];
    H[i][i] = (at(ei) - 2 * fx + at(mi)) / (h[i] * h[i]);
    for (let j = 0; j < i; j++) {
      const pp = []; pp[i] = h[i]; pp[j] = h[j];
      const pm = []; pm[i] = h[i]; pm[j] = -h[j];
      const mp = []; mp[i] = -h[i]; mp[j] = h[j];
      const mm = []; mm[i] = -h[i]; mm[j] = -h[j];
      H[i][j] = H[j][i] = (at(pp) - at(pm) - at(mp) + at(mm)) / (4 * h[i] * h[j]);
    }
  }
  return H;
}

export function invert(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) {
      const k = M[r][c];
      if (k) for (let j = 0; j < 2 * n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row) => row.slice(n));
}

const quad = (g, V) => g.reduce((s, gi, i) => s + gi * g.reduce((t, gj, j) => t + V[i][j] * gj, 0), 0);
const gradient = (f, x, h) => x.map((_, i) => {
  const a = x.slice(), b = x.slice();
  a[i] += h[i]; b[i] -= h[i];
  return (f(a) - f(b)) / (2 * h[i]);
});

// Find where g crosses zero beyond x0 (g(x0) < 0) in direction dir; null if not within maxSteps.
function crossing(g, x0, step, dir, { maxSteps = 40, limit = null } = {}) {
  let lo = x0, hi = null, s = step;
  for (let k = 0; k < maxSteps; k++) {
    let x = x0 + dir * s;
    if (limit !== null && dir * (x - limit) >= 0) x = limit - dir * 1e-12 * (Math.abs(limit) + 1);
    const v = g(x);
    if (Number.isFinite(v) && v > 0) { hi = x; break; }
    if (Number.isFinite(v)) lo = x;
    if (limit !== null && Math.abs(x - limit) < 1e-9 * (Math.abs(limit) + 1)) return null;
    s *= 1.6;
  }
  if (hi === null) return null;
  for (let k = 0; k < 80; k++) {
    const m = 0.5 * (lo + hi);
    const v = g(m);
    if (Number.isFinite(v) && v > 0) hi = m; else lo = m;
    if (Math.abs(hi - lo) <= 1e-9 * (Math.abs(m) + 1e-9)) break;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------- distributions

const TINY_XI = 1e-7;

export function gevNll(x, mu, sigma, xi) {
  if (!(sigma > 0)) return Infinity;
  let s = x.length * Math.log(sigma);
  if (Math.abs(xi) < TINY_XI) {
    for (const v of x) { const z = (v - mu) / sigma; s += z + Math.exp(-z); }
    return s;
  }
  for (const v of x) {
    const w = (xi * (v - mu)) / sigma;
    if (!(w > -1)) return Infinity;
    const l = Math.log1p(w);
    s += (1 + 1 / xi) * l + Math.exp(-l / xi);
  }
  return s;
}

// Location may vary: mu[i] per observation.
function gevNllVec(x, mus, sigma, xi) {
  if (!(sigma > 0)) return Infinity;
  let s = x.length * Math.log(sigma);
  for (let i = 0; i < x.length; i++) {
    const z = (x[i] - mus[i]) / sigma;
    if (Math.abs(xi) < TINY_XI) { s += z + Math.exp(-z); continue; }
    const w = xi * z;
    if (!(w > -1)) return Infinity;
    const l = Math.log1p(w);
    s += (1 + 1 / xi) * l + Math.exp(-l / xi);
  }
  return s;
}

export function gevCdf(v, mu, sigma, xi) {
  const z = (v - mu) / sigma;
  if (Math.abs(xi) < TINY_XI) return Math.exp(-Math.exp(-z));
  const w = 1 + xi * z;
  if (w <= 0) return xi > 0 ? 0 : 1;
  return Math.exp(-Math.pow(w, -1 / xi));
}

// Level exceeded with probability p in one block.
export function gevQuantileUpper(p, mu, sigma, xi) {
  const y = -Math.log1p(-p);
  if (Math.abs(xi) < TINY_XI) return mu - sigma * Math.log(y);
  return mu - (sigma / xi) * (1 - Math.pow(y, -xi));
}

export function gpdNll(y, sigma, xi) {
  if (!(sigma > 0)) return Infinity;
  let s = y.length * Math.log(sigma);
  if (Math.abs(xi) < TINY_XI) { for (const v of y) s += v / sigma; return s; }
  for (const v of y) {
    const w = (xi * v) / sigma;
    if (!(w > -1)) return Infinity;
    s += (1 + 1 / xi) * Math.log1p(w);
  }
  return s;
}

export function gpdCdf(v, sigma, xi) {
  if (v <= 0) return 0;
  if (Math.abs(xi) < TINY_XI) return 1 - Math.exp(-v / sigma);
  const w = 1 + (xi * v) / sigma;
  if (w <= 0) return 1;
  return 1 - Math.pow(w, -1 / xi);
}

export function gpdQuantile(p, sigma, xi) {
  if (Math.abs(xi) < TINY_XI) return -sigma * Math.log1p(-p);
  return (sigma / xi) * (Math.pow(1 - p, -xi) - 1);
}

// Level exceeded on average once every T years, from a POT fit with lambda clusters a year.
export function potReturnLevel(T, u, sigma, xi, lambda) {
  const m = T * lambda;
  if (Math.abs(xi) < TINY_XI) return u + sigma * Math.log(m);
  return u + (sigma / xi) * (Math.pow(m, xi) - 1);
}

// ---------------------------------------------------------------- L-moments

export function sampleLMoments(x) {
  const s = x.slice().sort((a, b) => a - b);
  const n = s.length;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    b0 += s[i];
    b1 += (i / (n - 1)) * s[i];
    b2 += ((i * (i - 1)) / ((n - 1) * (n - 2))) * s[i];
  }
  b0 /= n; b1 /= n; b2 /= n;
  const l1 = b0, l2 = 2 * b1 - b0, l3 = 6 * b2 - 6 * b1 + b0;
  return { l1, l2, l3, t3: l3 / l2 };
}

// Hosking, Wallis & Wood (1985) approximation, in Coles's sign.
export function gevLMoments(x) {
  const { l1, l2, t3 } = sampleLMoments(x);
  const c = 2 / (3 + t3) - Math.LN2 / Math.log(3);
  const k = 7.859 * c + 2.9554 * c * c;
  if (Math.abs(k) < 1e-6) { const sigma = l2 / Math.LN2; return { mu: l1 - 0.5772156649 * sigma, sigma, xi: 0 }; }
  const g = gamma(1 + k);
  const sigma = (l2 * k) / ((1 - Math.pow(2, -k)) * g);
  const mu = l1 - (sigma * (1 - g)) / k;
  return { mu, sigma, xi: -k };
}

export function gumbelLMoments(x) {
  const { l1, l2 } = sampleLMoments(x);
  const sigma = l2 / Math.LN2;
  return { mu: l1 - 0.5772156649 * sigma, sigma, xi: 0 };
}

export function gpdLMoments(y) {
  const { l1, l2 } = sampleLMoments(y);
  const k = l1 / l2 - 2;
  return { sigma: l1 * (1 + k), xi: -k };
}

// ---------------------------------------------------------------- fits

export function fitGev(x, { profile = false, confidence = 0.95 } = {}) {
  const n = x.length;
  if (n < 3) throw new Error("need at least 3 block maxima to fit a GEV");
  const lm = gevLMoments(x);
  const starts = [
    [lm.mu, Math.log(lm.sigma), Math.max(-0.45, Math.min(0.45, lm.xi))],
    [lm.mu, Math.log(lm.sigma), 0.1],
    [lm.mu, Math.log(lm.sigma), -0.1],
  ].filter((s) => s.every(Number.isFinite));
  const f = ([mu, ls, xi]) => (xi <= -1 || xi > 3 ? Infinity : gevNll(x, mu, Math.exp(ls), xi));
  let best = null;
  for (const s0 of starts) {
    if (!Number.isFinite(f(s0))) continue;
    const r = nelderMead(f, s0, { step: [0.1 * Math.exp(s0[1]), 0.1, 0.05] });
    if (!best || r.f < best.f) best = r;
  }
  if (!best) throw new Error("could not start the GEV fit: the data have no spread");
  const [mu, ls, xi] = best.x;
  const sigma = Math.exp(ls);
  const g = ([m, s, k]) => gevNll(x, m, s, k);
  const H = hessian(g, [mu, sigma, xi], [sigma * 1e-4, sigma * 1e-4, 1e-4]);
  const cov = invert(H);
  const se = cov ? cov.map((r, i) => (r[i] > 0 ? Math.sqrt(r[i]) : NaN)) : [NaN, NaN, NaN];
  const fit = { model: "gev", n, mu, sigma, xi, se: { mu: se[0], sigma: se[1], xi: se[2] }, cov, nll: best.f, aic: 2 * best.f + 6, lmom: lm };
  if (profile) fit.xiProfile = profileGevXi(x, fit, confidence);
  return fit;
}

export function fitGumbel(x) {
  const n = x.length;
  const lm = gumbelLMoments(x);
  const f = ([mu, ls]) => gevNll(x, mu, Math.exp(ls), 0);
  const r = nelderMead(f, [lm.mu, Math.log(lm.sigma)], { step: [0.1 * lm.sigma, 0.1] });
  const mu = r.x[0], sigma = Math.exp(r.x[1]);
  const H = hessian(([m, s]) => gevNll(x, m, s, 0), [mu, sigma], [sigma * 1e-4, sigma * 1e-4]);
  const c2 = invert(H);
  const cov = c2 ? [[c2[0][0], c2[0][1], 0], [c2[1][0], c2[1][1], 0], [0, 0, 0]] : null;
  const se = c2 ? [Math.sqrt(c2[0][0]), Math.sqrt(c2[1][1])] : [NaN, NaN];
  return { model: "gumbel", n, mu, sigma, xi: 0, se: { mu: se[0], sigma: se[1], xi: 0 }, cov, nll: r.f, aic: 2 * r.f + 4, lmom: lm };
}

// Profile likelihood interval for the GEV shape.
function profileGevXi(x, fit, confidence) {
  const q = chi2Q1(confidence);
  let warm = [fit.mu, Math.log(fit.sigma)];
  const nllp = (xi) => {
    const r = nelderMead(([m, ls]) => gevNll(x, m, Math.exp(ls), xi), warm, { step: [0.05 * fit.sigma, 0.05], restarts: 1 });
    if (Number.isFinite(r.f)) warm = r.x;
    return r.f;
  };
  const g = (xi) => 2 * (nllp(xi) - fit.nll) - q;
  const step = Number.isFinite(fit.se.xi) && fit.se.xi > 0 ? fit.se.xi : 0.1;
  warm = [fit.mu, Math.log(fit.sigma)];
  const lo = crossing(g, fit.xi, step, -1, { limit: -1 });
  warm = [fit.mu, Math.log(fit.sigma)];
  const hi = crossing(g, fit.xi, step, 1, { limit: 3 });
  return { lower: lo, upper: hi };
}

// GEV with location mu0 + mu1 * (year - centre) / 10 (mu1 per decade).
export function fitGevTrend(x, years, stationary) {
  const centre = years.reduce((s, v) => s + v, 0) / years.length;
  const t = years.map((y) => (y - centre) / 10);
  const f = ([m0, m1, ls, xi]) => (xi <= -1 || xi > 3 ? Infinity : gevNllVec(x, t.map((ti) => m0 + m1 * ti), Math.exp(ls), xi));
  const r = nelderMead(f, [stationary.mu, 0, Math.log(stationary.sigma), stationary.xi], { step: [0.05 * stationary.sigma, 0.05 * stationary.sigma, 0.05, 0.05] });
  const [m0, m1, ls, xi] = r.x;
  const sigma = Math.exp(ls);
  const H = hessian(([a, b, s, k]) => gevNllVec(x, t.map((ti) => a + b * ti), s, k), [m0, m1, sigma, xi], [sigma * 1e-4, sigma * 1e-4, sigma * 1e-4, 1e-4]);
  const cov = invert(H);
  const se = cov ? cov.map((row, i) => (row[i] > 0 ? Math.sqrt(row[i]) : NaN)) : [NaN, NaN, NaN, NaN];
  const deviance = Math.max(0, 2 * (stationary.nll - r.f));
  return {
    model: "gev-trend", centreYear: centre, mu0: m0, muPerDecade: m1, sigma, xi,
    se: { mu0: se[0], muPerDecade: se[1], sigma: se[2], xi: se[3] }, cov, nll: r.f, aic: 2 * r.f + 8,
    lrt: { deviance, df: 1, p: chi2Sf1(deviance) },
    locationAt: (year) => m0 + (m1 * (year - centre)) / 10,
  };
}

export function fitGpd(y, { confidence = 0.95, profile = false } = {}) {
  const k = y.length;
  if (k < 5) throw new Error("need at least 5 exceedances to fit a generalized Pareto distribution");
  const lm = gpdLMoments(y);
  const mean = y.reduce((s, v) => s + v, 0) / k;
  const starts = [
    [Math.log(lm.sigma > 0 ? lm.sigma : mean), Math.max(-0.45, Math.min(0.45, lm.xi))],
    [Math.log(mean), 0],
    [Math.log(mean), 0.2],
  ];
  const f = ([ls, xi]) => (xi <= -1 || xi > 3 ? Infinity : gpdNll(y, Math.exp(ls), xi));
  let best = null;
  for (const s0 of starts) {
    if (!Number.isFinite(f(s0))) continue;
    const r = nelderMead(f, s0, { step: [0.1, 0.05] });
    if (!best || r.f < best.f) best = r;
  }
  if (!best) throw new Error("could not start the GPD fit");
  const sigma = Math.exp(best.x[0]), xi = best.x[1];
  const H = hessian(([s, x]) => gpdNll(y, s, x), [sigma, xi], [sigma * 1e-4, 1e-4]);
  const cov = invert(H);
  const se = cov ? [Math.sqrt(Math.max(cov[0][0], 0)), Math.sqrt(Math.max(cov[1][1], 0))] : [NaN, NaN];
  const fit = { model: "gpd", k, sigma, xi, se: { sigma: se[0], xi: se[1] }, cov, nll: best.f, lmom: lm };
  if (profile) {
    const q = chi2Q1(confidence);
    let warm = [Math.log(sigma)];
    const nllp = (x) => { const r = nelderMead(([ls]) => gpdNll(y, Math.exp(ls), x), warm, { step: [0.05], restarts: 1 }); if (Number.isFinite(r.f)) warm = r.x; return r.f; };
    const g = (x) => 2 * (nllp(x) - fit.nll) - q;
    const step = Number.isFinite(se[1]) && se[1] > 0 ? se[1] : 0.1;
    warm = [Math.log(sigma)];
    const lo = crossing(g, xi, step, -1, { limit: -1 });
    warm = [Math.log(sigma)];
    const hi = crossing(g, xi, step, 1, { limit: 3 });
    fit.xiProfile = { lower: lo, upper: hi };
  }
  return fit;
}

// ---------------------------------------------------------------- return levels

export function gevReturnLevels(x, fit, periods, { confidence = 0.95, profile = true, nYears = null } = {}) {
  const z = normQuantile((1 + confidence) / 2);
  const q = chi2Q1(confidence);
  const isG = fit.model === "gumbel";
  return periods.map((T) => {
    const p = 1 / T;
    const level = gevQuantileUpper(p, fit.mu, fit.sigma, fit.xi);
    const rl = (th) => gevQuantileUpper(p, th[0], th[1], isG ? 0 : th[2]);
    const th = [fit.mu, fit.sigma, fit.xi];
    const grad = gradient(rl, th, [fit.sigma * 1e-5, fit.sigma * 1e-5, 1e-5]);
    if (isG) grad[2] = 0;
    const se = fit.cov ? Math.sqrt(Math.max(quad(grad, fit.cov), 0)) : NaN;
    const row = { T, aep: p, level, se, delta: { lower: level - z * se, upper: level + z * se } };
    if (profile) row.profile = profileGevLevel(x, fit, p, level, se, q);
    if (nYears) row.extrapolated = T > 2 * nYears;
    return row;
  });
}

// A warm start can fall outside the support when the profiled level jumps; scan for a point inside.
function feasibleStart(f, warm, oneDim) {
  let best = warm, bf = f(warm);
  const lss = [0, -0.5, 0.5, -1, 1, -2, 2].map((d) => warm[0] + d);
  const xis = oneDim ? [null] : [-0.9, -0.6, -0.3, -0.1, 0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1, 1.3, 1.7, 2.2, 2.9];
  for (const ls of lss) for (const xi of xis) {
    const p = oneDim ? [ls] : [ls, xi];
    const v = f(p);
    if (v < bf) { bf = v; best = p; }
  }
  return best;
}

function profileGevLevel(x, fit, p, level, se, q) {
  const y = -Math.log1p(-p);
  const isG = fit.model === "gumbel";
  // mu as a function of the level, sigma and xi.
  const muOf = (zp, sigma, xi) => (Math.abs(xi) < TINY_XI ? zp + sigma * Math.log(y) : zp + (sigma / xi) * (1 - Math.pow(y, -xi)));
  let warm;
  const reset = () => { warm = isG ? [Math.log(fit.sigma)] : [Math.log(fit.sigma), fit.xi]; };
  const nllp = (zp) => {
    const f = isG
      ? ([ls]) => gevNll(x, muOf(zp, Math.exp(ls), 0), Math.exp(ls), 0)
      : ([ls, xi]) => (xi <= -1 || xi > 3 ? Infinity : gevNll(x, muOf(zp, Math.exp(ls), xi), Math.exp(ls), xi));
    if (!Number.isFinite(f(warm))) warm = feasibleStart(f, warm, isG);
    const r = nelderMead(f, warm, { step: isG ? [0.05] : [0.05, 0.03], restarts: 1 });
    if (Number.isFinite(r.f)) warm = r.x;
    return r.f;
  };
  const g = (zp) => 2 * (nllp(zp) - fit.nll) - q;
  const step = Number.isFinite(se) && se > 0 ? se : Math.abs(level) * 0.05 + fit.sigma * 0.1;
  reset();
  const lo = crossing(g, level, step, -1);
  reset();
  const hi = crossing(g, level, step, 1, { maxSteps: 30 });
  return { lower: lo, upper: hi };
}

export function potReturnLevels(y, u, fit, lambda, nObs, nYears, periods, { confidence = 0.95, profile = true } = {}) {
  const z = normQuantile((1 + confidence) / 2);
  const q = chi2Q1(confidence);
  const perYear = nObs / nYears;
  const zeta = lambda / perYear; // clusters per observation
  const varZeta = (zeta * (1 - zeta)) / nObs;
  const V = [[varZeta, 0, 0], [0, fit.cov ? fit.cov[0][0] : NaN, fit.cov ? fit.cov[0][1] : NaN], [0, fit.cov ? fit.cov[1][0] : NaN, fit.cov ? fit.cov[1][1] : NaN]];
  return periods.map((T) => {
    const level = potReturnLevel(T, u, fit.sigma, fit.xi, lambda);
    const rl = ([zt, s, k]) => potReturnLevel(T, u, s, k, zt * perYear);
    const grad = gradient(rl, [zeta, fit.sigma, fit.xi], [zeta * 1e-5, fit.sigma * 1e-5, 1e-5]);
    const se = Math.sqrt(Math.max(quad(grad, V), 0));
    const row = { T, level, se, delta: { lower: level - z * se, upper: level + z * se }, aep: 1 - Math.exp(-1 / T), extrapolated: T > 2 * nYears, belowThreshold: T * lambda <= 1 };
    if (profile && T * lambda > 1) row.profile = profilePotLevel(y, u, fit, lambda, T, level, se, q);
    return row;
  });
}

function profilePotLevel(y, u, fit, lambda, T, level, se, q) {
  const m = T * lambda;
  const sigmaOf = (xm, xi) => (Math.abs(xi) < TINY_XI ? (xm - u) / Math.log(m) : ((xm - u) * xi) / (Math.pow(m, xi) - 1));
  let warm = [fit.xi];
  const nllp = (xm) => {
    if (!(xm > u)) return Infinity;
    const f = ([xi]) => (xi <= -1 || xi > 3 ? Infinity : gpdNll(y, sigmaOf(xm, xi), xi));
    if (!Number.isFinite(f(warm))) for (const xi of [-0.9, -0.6, -0.3, -0.1, 0.05, 0.2, 0.4, 0.7, 1, 1.5, 2.2, 2.9]) if (Number.isFinite(f([xi]))) { warm = [xi]; break; }
    const r = nelderMead(f, warm, { step: [0.03], restarts: 1 });
    if (Number.isFinite(r.f)) warm = r.x;
    return r.f;
  };
  const g = (xm) => 2 * (nllp(xm) - fit.nll) - q;
  const step = Number.isFinite(se) && se > 0 ? se : (level - u) * 0.1;
  warm = [fit.xi];
  const lo = crossing(g, level, step, -1, { limit: u });
  warm = [fit.xi];
  const hi = crossing(g, level, step, 1, { maxSteps: 30 });
  return { lower: lo, upper: hi };
}

// Chance of at least one exceedance of the T-year level in L years, and the T a risk needs.
export const riskOverLife = (T, L) => 1 - Math.pow(1 - 1 / T, L);
export const periodForRisk = (risk, L) => 1 / (1 - Math.pow(1 - risk, 1 / L));

// ---------------------------------------------------------------- POT helpers

// Runs declustering: exceedances closer than runLength observations below u share a cluster.
export function decluster(values, u, runLength = 3) {
  const clusters = [];
  let cur = null, below = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > u) {
      if (cur && below < runLength) { if (v > cur.peak) { cur.peak = v; cur.peakIndex = i; } cur.end = i; cur.size++; }
      else { cur = { start: i, end: i, peak: v, peakIndex: i, size: 1 }; clusters.push(cur); }
      below = 0;
    } else below++;
  }
  const nExceed = clusters.reduce((s, c) => s + c.size, 0);
  return { clusters, nExceed, extremalIndex: nExceed ? clusters.length / nExceed : NaN };
}

export function quantile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// Mean residual life (mean excess over u) with a normal interval, over a grid of thresholds.
export function meanResidualLife(values, { from = 0.8, to = 0.995, steps = 25, confidence = 0.95 } = {}) {
  const s = values.slice().sort((a, b) => a - b);
  const z = normQuantile((1 + confidence) / 2);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const p = from + ((to - from) * i) / (steps - 1);
    const u = quantile(s, p);
    const ex = s.filter((v) => v > u).map((v) => v - u);
    if (ex.length < 3) continue;
    const m = ex.reduce((a, b) => a + b, 0) / ex.length;
    const sd = Math.sqrt(ex.reduce((a, b) => a + (b - m) ** 2, 0) / (ex.length - 1));
    out.push({ p, u, n: ex.length, meanExcess: m, lower: m - (z * sd) / Math.sqrt(ex.length), upper: m + (z * sd) / Math.sqrt(ex.length) });
  }
  return out;
}

// Refit the declustered GPD over a grid of thresholds: shape and modified scale should settle.
export function thresholdStability(values, runLength, { from = 0.9, to = 0.995, steps = 12, confidence = 0.95 } = {}) {
  const s = values.slice().sort((a, b) => a - b);
  const z = normQuantile((1 + confidence) / 2);
  const out = [];
  let lastU = null;
  for (let i = 0; i < steps; i++) {
    const p = from + ((to - from) * i) / (steps - 1);
    const u = quantile(s, p);
    if (u === lastU) continue;
    lastU = u;
    const { clusters } = decluster(values, u, runLength);
    const y = clusters.map((c) => c.peak - u);
    if (y.length < 10) continue;
    try {
      const f = fitGpd(y);
      // Modified scale sigma* = sigma_u - xi u is constant above a valid threshold.
      const gs = [1, -u];
      const seStar = f.cov ? Math.sqrt(Math.max(quad(gs, f.cov), 0)) : NaN;
      out.push({ p, u, clusters: y.length, xi: f.xi, xiLower: f.xi - z * f.se.xi, xiUpper: f.xi + z * f.se.xi, sigmaStar: f.sigma - f.xi * u, sigmaStarSe: seStar });
    } catch { /* too few clusters at this threshold */ }
  }
  return out;
}

// ---------------------------------------------------------------- input

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === "," || ch === "\t" || ch === ";") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const toNum = (c) => { const t = String(c).replace(/,/g, "").trim(); return NUM.test(t) ? Number(t) : NaN; };
const DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const DATE_US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

function parseDate(c) {
  let m = String(c).match(DATE);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
  m = String(c).match(DATE_US);
  if (m) return { y: +m[3], mo: +m[1], d: +m[2] };
  return null;
}

export function readSeries(csv, opts = {}) {
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error("paste a CSV: a header row, then one row per observation");
  let header = rows[0];
  let body = rows.slice(1);
  if (header.every((c) => Number.isFinite(toNum(c)))) { header = header.map((_, i) => (header.length === 1 ? "value" : `column${i + 1}`)); body = rows; }
  const idx = (name, what) => {
    if (!name) return -1;
    const i = header.findIndex((h) => h.toLowerCase() === String(name).toLowerCase());
    if (i < 0) throw new Error(`no column named "${name}" for ${what}; columns are: ${header.join(", ")}`);
    return i;
  };
  let di = idx(opts.date, "the date");
  let yi = idx(opts.year, "the year");
  let vi = idx(opts.value, "the value");
  const sample = body.slice(0, 50);
  if (di < 0 && !opts.date) di = header.findIndex((_, j) => sample.filter((r) => parseDate(r[j] ?? "")).length >= Math.max(1, sample.length * 0.8));
  if (yi < 0 && !opts.year) yi = header.findIndex((h, j) => /year/i.test(h) && j !== di && sample.every((r) => /^\d{4}$/.test(r[j] ?? "")));
  if (vi < 0) {
    for (let j = header.length - 1; j >= 0; j--) {
      if (j === di || j === yi) continue;
      if (sample.filter((r) => Number.isFinite(toNum(r[j] ?? ""))).length >= Math.max(1, sample.length * 0.5)) { vi = j; break; }
    }
  }
  if (vi < 0) throw new Error("found no numeric column to analyse; name it with the value option");
  const obs = [];
  let dropped = 0;
  for (const r of body) {
    const v = toNum(r[vi] ?? "");
    if (!Number.isFinite(v)) { dropped++; continue; }
    const o = { value: v };
    if (di >= 0) { const d = parseDate(r[di] ?? ""); if (d) { o.date = d; o.dateText = r[di]; } }
    if (yi >= 0) { const y = toNum(r[yi] ?? ""); if (Number.isFinite(y)) o.year = y; }
    obs.push(o);
  }
  if (!obs.length) throw new Error(`column "${header[vi]}" has no numbers`);
  return { header, valueColumn: header[vi], dateColumn: di >= 0 ? header[di] : null, yearColumn: yi >= 0 ? header[yi] : null, obs, dropped };
}

const dayNumber = ({ y, mo, d }) => Date.UTC(y, mo - 1, d) / 86400000;

// ---------------------------------------------------------------- analysis

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const conf = Number(o.confidence);
  if (!(conf > 0.5 && conf < 0.9999)) throw new Error("confidence must be between 0.5 and 0.9999");
  const periods = (Array.isArray(o.returnPeriods) ? o.returnPeriods : String(o.returnPeriods).split(/[\s,]+/)).map(Number).filter((t) => t > 1);
  if (!periods.length) throw new Error("give at least one return period above 1 year");
  const yearStart = Math.round(Number(o.yearStart) || 1);
  if (yearStart < 1 || yearStart > 12) throw new Error("yearStart is a month, 1 to 12");
  const runLength = Math.max(1, Math.round(Number(o.runLength) || 1));
  const series = readSeries(o.csv, o);
  const warnings = [];
  if (series.dropped) warnings.push(`${series.dropped} row(s) with no number in "${series.valueColumn}" were skipped.`);

  // Block year of each observation.
  const blockYear = (ob) => (ob.year !== undefined ? ob.year : ob.date ? ob.date.y + (yearStart > 1 && ob.date.mo >= yearStart ? 1 : 0) : undefined);
  const hasYears = series.obs.every((ob) => blockYear(ob) !== undefined);
  const counts = new Map();
  if (hasYears) for (const ob of series.obs) counts.set(blockYear(ob), (counts.get(blockYear(ob)) || 0) + 1);
  const onePerYear = hasYears && [...counts.values()].every((c) => c === 1);
  let method = o.method;
  if (method === "auto") method = !hasYears && !o.perYear ? "gev" : onePerYear ? "gev" : "both";
  if (method === "pot" && onePerYear) throw new Error("one value a year is already a set of annual maxima: use the GEV method, or paste the full series for peaks over a threshold");

  const result = {
    input: { valueColumn: series.valueColumn, dateColumn: series.dateColumn, yearColumn: series.yearColumn, rows: series.obs.length, dropped: series.dropped, yearStart, confidence: conf, returnPeriods: periods, method },
    warnings,
  };

  // ---- block maxima
  let maxima, maxYears;
  if (onePerYear || (!hasYears && method === "gev")) {
    maxima = series.obs.map((ob) => ob.value);
    maxYears = hasYears ? series.obs.map(blockYear) : null;
    if (!hasYears) warnings.push("No year or date column: each row is taken as one year's maximum.");
  } else if (hasYears) {
    const med = [...counts.values()].sort((a, b) => a - b)[Math.floor(counts.size / 2)];
    const by = new Map();
    for (const ob of series.obs) { const y = blockYear(ob); if (!by.has(y) || ob.value > by.get(y).value) by.set(y, ob); }
    const full = [...by.keys()].filter((y) => counts.get(y) >= 0.9 * med).sort((a, b) => a - b);
    const short = [...by.keys()].filter((y) => counts.get(y) < 0.9 * med).sort((a, b) => a - b);
    if (short.length) warnings.push(`Left out ${short.length} incomplete year(s) from the annual maxima (fewer than 90% of a typical year's ${med} observations): ${short.join(", ")}.`);
    maxYears = full;
    maxima = full.map((y) => by.get(y).value);
    result.annualMaxima = full.map((y) => ({ year: y, value: by.get(y).value, date: by.get(y).dateText ?? null }));
  }

  if ((method === "gev" || method === "both") && maxima && maxima.length >= 3) {
    const nYears = maxima.length;
    if (nYears < 20) warnings.push(`Only ${nYears} annual maxima: shape estimates from fewer than about 20 blocks are poorly determined, so read the profile intervals, not the point values.`);
    const gev = fitGev(maxima, { profile: o.profile, confidence: conf });
    const gum = fitGumbel(maxima);
    const deviance = Math.max(0, 2 * (gum.nll - gev.nll));
    const lrt = { deviance, df: 1, p: chi2Sf1(deviance) };
    const sorted = maxima.slice().sort((a, b) => a - b);
    const pp = sorted.map((v, i) => ({ empirical: (i + 1) / (nYears + 1), model: gevCdf(v, gev.mu, gev.sigma, gev.xi) }));
    const qq = sorted.map((v, i) => ({ empirical: v, model: gevQuantileUpper(1 - (i + 1) / (nYears + 1), gev.mu, gev.sigma, gev.xi) }));
    const lmomLevels = periods.map((T) => ({ T, level: gevQuantileUpper(1 / T, gev.lmom.mu, gev.lmom.sigma, gev.lmom.xi) }));
    const block = {
      nYears,
      gev: strip(gev),
      gumbel: strip(gum),
      gumbelVsGev: lrt,
      returnLevels: gevReturnLevels(maxima, gev, periods, { confidence: conf, profile: o.profile, nYears }),
      gumbelReturnLevels: gevReturnLevels(maxima, gum, periods, { confidence: conf, profile: o.profile, nYears }),
      lmomReturnLevels: lmomLevels,
      diagnostics: {
        pp, qq,
        maxPpGap: Math.max(...pp.map((d) => Math.abs(d.empirical - d.model))),
        empiricalReturn: sorted.map((v, i) => ({ value: v, T: (nYears + 1) / (nYears - i) })).reverse(),
      },
    };
    if (gev.xi < -0.5) warnings.push(`The GEV shape is ${gev.xi.toFixed(2)}, below -0.5: maximum likelihood loses its usual large-sample properties there (Smith 1985), so the intervals are rough.`);
    if (o.trend && maxYears && maxYears.length >= 10) {
      const tr = fitGevTrend(maxima, maxYears, gev);
      const lastYear = Math.max(...maxYears);
      block.trend = {
        centreYear: tr.centreYear, mu0: tr.mu0, muPerDecade: tr.muPerDecade, sigma: tr.sigma, xi: tr.xi, se: tr.se, nll: tr.nll, aic: tr.aic, lrt: tr.lrt,
        firstYear: Math.min(...maxYears), lastYear,
        levelsAtEnds: periods.filter((T) => T === 100 || T === periods[periods.length - 1]).slice(0, 1).map((T) => ({
          T,
          first: gevQuantileUpper(1 / T, tr.locationAt(Math.min(...maxYears)), tr.sigma, tr.xi),
          last: gevQuantileUpper(1 / T, tr.locationAt(lastYear), tr.sigma, tr.xi),
        })),
      };
    }
    result.block = block;
  }

  // ---- peaks over threshold
  if (method === "pot" || method === "both") {
    const vals = series.obs.map((ob) => ob.value);
    let nYears;
    const dated = series.obs.every((ob) => ob.date);
    if (dated) {
      const days = series.obs.map((ob) => dayNumber(ob.date));
      nYears = (Math.max(...days) - Math.min(...days) + 1) / 365.25;
      for (let i = 1; i < days.length; i++) if (days[i] < days[i - 1]) throw new Error("the dates must be in time order for peaks over a threshold");
    } else if (o.perYear) nYears = vals.length / Number(o.perYear);
    else if (hasYears) nYears = counts.size;
    else throw new Error("peaks over a threshold need dates, a year column or perYear (observations a year)");
    const sorted = vals.slice().sort((a, b) => a - b);
    const u = o.threshold === null || o.threshold === "" || o.threshold === undefined ? quantile(sorted, 0.98) : Number(o.threshold);
    if (!Number.isFinite(u)) throw new Error("threshold must be a number");
    const dc = decluster(vals, u, runLength);
    const y = dc.clusters.map((c) => c.peak - u);
    if (y.length < 10) throw new Error(`only ${y.length} clusters above the threshold ${fmt(u)}: lower it, or shorten the run length`);
    const lambda = y.length / nYears;
    const gpd = fitGpd(y, { confidence: conf, profile: o.profile });
    const ys = y.slice().sort((a, b) => a - b);
    const k = ys.length;
    const pot = {
      threshold: u, thresholdQuantile: sorted.filter((v) => v <= u).length / sorted.length, runLength,
      nYears, nObs: vals.length, nExceed: dc.nExceed, nClusters: y.length, extremalIndex: dc.extremalIndex, ratePerYear: lambda,
      gpd: strip(gpd),
      returnLevels: potReturnLevels(y, u, gpd, lambda, vals.length, nYears, periods, { confidence: conf, profile: o.profile }),
      clusterPeaks: dc.clusters.map((c) => ({ value: c.peak, date: series.obs[c.peakIndex].dateText ?? null, days: c.end - c.start + 1 })),
      diagnostics: {
        pp: ys.map((v, i) => ({ empirical: (i + 1) / (k + 1), model: gpdCdf(v, gpd.sigma, gpd.xi) })),
        qq: ys.map((v, i) => ({ empirical: v + u, model: u + gpdQuantile((i + 1) / (k + 1), gpd.sigma, gpd.xi) })),
        empiricalReturn: ys.map((v, i) => ({ value: v + u, T: (k + 1) / ((k - i) * lambda) })).reverse(),
      },
      meanResidualLife: meanResidualLife(vals, { confidence: conf }),
      stability: thresholdStability(vals, runLength, { confidence: conf }),
    };
    pot.diagnostics.maxPpGap = Math.max(...pot.diagnostics.pp.map((d) => Math.abs(d.empirical - d.model)));
    if (lambda > 12) warnings.push(`${lambda.toFixed(1)} clusters a year above the threshold: that is low for an extreme-value threshold; raise it until the stability table settles.`);
    result.pot = pot;
  }

  const L = Number(o.designLife);
  if (L > 0) {
    result.designLife = {
      years: L,
      risk: periods.map((T) => ({ T, chance: riskOverLife(T, L) })),
      periodFor10pct: periodForRisk(0.1, L),
      periodFor1pct: periodForRisk(0.01, L),
    };
  }
  result.summary = summarize(result);
  return result;
}

function strip(f) {
  const { cov, lmom, ...rest } = f;
  void cov;
  return { ...rest, lmom: lmom ? { mu: lmom.mu, sigma: lmom.sigma, xi: lmom.xi } : undefined };
}

export function fmt(v, digits = 3) {
  if (v === null || v === undefined) return "not found";
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString("en-US");
  if (a >= 1) return Number(v.toPrecision(Math.max(digits, Math.floor(Math.log10(a)) + 1))).toString();
  if (a === 0) return "0";
  return Number(v.toPrecision(digits)).toString();
}

export function formatP(p) {
  if (!Number.isFinite(p)) return "n/a";
  if (p < 1e-4) return p.toExponential(1);
  return p < 0.001 ? p.toFixed(4) : p.toFixed(3);
}

export function tailWord(xi, profile) {
  if (profile) {
    const lo = profile.lower === null ? -1 : profile.lower, hi = profile.upper === null ? 3 : profile.upper;
    if (lo > 0) return "heavy (the interval for the shape is above zero)";
    if (hi < 0) return "bounded above (the interval for the shape is below zero)";
    return `${xi > 0.05 ? "heavy" : xi < -0.05 ? "bounded" : "Gumbel-like"} at the point estimate, but the interval for the shape covers zero, so the tail type is not settled`;
  }
  return xi > 0.05 ? "heavy (point estimate; no interval for the shape)" : xi < -0.05 ? "bounded above (point estimate; no interval for the shape)" : "close to Gumbel";
}

function summarize(r) {
  const lines = [];
  const pct = Math.round(r.input.confidence * 100);
  const ci = (row) => {
    const iv = row.profile && row.profile.lower !== null ? row.profile : row.delta;
    const kind = row.profile && row.profile.lower !== null ? "profile" : "delta-method";
    const up = row.profile && row.profile.upper === null ? "beyond the search range" : fmt(iv.upper);
    return `${pct}% ${kind} interval ${fmt(iv.lower)} to ${up}`;
  };
  if (r.block) {
    const b = r.block, g = b.gev;
    const t100 = b.returnLevels.find((x) => x.T === 100) || b.returnLevels[b.returnLevels.length - 1];
    lines.push(`Annual maxima: ${b.nYears} years. GEV fit: location ${fmt(g.mu)}, scale ${fmt(g.sigma)}, shape ${fmt(g.xi)}; the upper tail looks ${tailWord(g.xi, g.xiProfile)}.`);
    lines.push(`The ${t100.T}-year level (a ${fmt(100 / t100.T)}% chance of being exceeded in any one year) is ${fmt(t100.level)}, ${ci(t100)}.`);
    lines.push(`Gumbel against GEV: likelihood-ratio ${fmt(b.gumbelVsGev.deviance)} on 1 df, p = ${formatP(b.gumbelVsGev.p)}${b.gumbelVsGev.p < 0.05 ? ": the data reject the Gumbel's fixed shape" : ": the data do not reject the Gumbel's simpler tail, but its intervals are narrower because it assumes the shape is exactly zero"}.`);
    if (b.trend) lines.push(`Trend in the location: ${fmt(b.trend.muPerDecade)} per decade (likelihood-ratio p = ${formatP(b.trend.lrt.p)})${b.trend.lrt.p < 0.05 ? ", so a stationary fit may understate or overstate today's risk" : "; no evidence the level has shifted over the record"}.`);
  }
  if (r.pot) {
    const p = r.pot, g = p.gpd;
    const t100 = p.returnLevels.find((x) => x.T === 100) || p.returnLevels[p.returnLevels.length - 1];
    lines.push(`Peaks over ${fmt(p.threshold)} (${fmt(p.thresholdQuantile * 100)}th percentile): ${p.nExceed} exceedances in ${p.nClusters} clusters over ${fmt(p.nYears)} years (${fmt(p.ratePerYear)} a year; extremal index ${fmt(p.extremalIndex)}). GPD scale ${fmt(g.sigma)}, shape ${fmt(g.xi)}.`);
    lines.push(`From the peaks, the level exceeded on average once in ${t100.T} years is ${fmt(t100.level)}, ${ci(t100)}.`);
  }
  if (r.designLife) {
    const d = r.designLife;
    const c100 = d.risk.find((x) => x.T === 100);
    if (c100) lines.push(`Over a ${d.years}-year design life, the 100-year level has a ${fmt(c100.chance * 100)}% chance of being exceeded at least once; keeping that chance to 10% needs about the ${fmt(d.periodFor10pct)}-year level.`);
  }
  return lines;
}

export function sampleInput() {
  return { csv: "water_year,peak_cfs\n2016,119000\n2017,81300\n2018,175000\n2019,156000\n2020,88300\n2021,97600\n2022,118000\n2023,44800\n2024,94100\n2025,156000", profile: false, trend: false };
}
