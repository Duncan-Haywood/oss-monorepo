// Exact and asymptotic tests for contingency tables: 2x2 (Fisher, mid-p,
// Barnard, Boschloo, chi-square, G), r x c (Fisher-Freeman-Halton by the
// Mehta-Patel network idea, chi-square, residuals), stratified 2x2xK
// (Cochran-Mantel-Haenszel, exact conditional, Breslow-Day-Tarone) and paired
// 2x2 (McNemar). Implemented from the papers' mathematics in PAPERS; no
// third-party code was ported. Rows are groups, the first column is the event.

export const PAPERS = [
  {
    authors: "R. A. Fisher",
    title: "The logic of inductive inference",
    venue: "Journal of the Royal Statistical Society 98(1), 39-82",
    year: 1935,
    url: "https://doi.org/10.2307/2342435",
    doi: "10.2307/2342435",
    implemented: "The exact conditional test of a 2x2 table: with both margins fixed, the count in the first cell is hypergeometric, and the p-value sums the probabilities of tables as or less probable than the one observed (two-sided) or as or more extreme (one-sided).",
    deviations: "Two-sided by the minimum-likelihood rule with a relative tolerance of 1e-7 on ties, as R's fisher.test and scipy do.",
  },
  {
    authors: "G. H. Freeman and J. H. Halton",
    title: "Note on an exact treatment of contingency, goodness of fit and other problems of significance",
    venue: "Biometrika 38(1/2), 141-149",
    year: 1951,
    url: "https://doi.org/10.2307/2332323",
    doi: "10.2307/2332323",
    implemented: "Fisher's exact test extended to r x c tables: the probability of a table given both margins, summed over every table no more probable than the one observed.",
    deviations: "None in the statistic; the enumeration follows Mehta & Patel's network below. Past a work limit the p-value is estimated by Monte Carlo and labelled as such.",
  },
  {
    authors: "Cyrus R. Mehta and Nitin R. Patel",
    title: "A network algorithm for performing Fisher's exact test in r x c contingency tables",
    venue: "Journal of the American Statistical Association 78(382), 427-434",
    year: 1983,
    url: "https://doi.org/10.1080/01621459.1983.10477989",
    doi: "10.1080/01621459.1983.10477989",
    implemented: "Tables are built a column at a time; a node is the multiset of remaining row totals. Each node carries the longest and shortest remaining path and the closed-form total probability below it, so a whole subtree is added or dropped at once, and partial paths with equal probability reaching the same node are merged.",
    deviations: "The longest and shortest paths are computed exactly by memoised search over the node's columns rather than by the paper's bounds; this is slower per node but never prunes wrongly.",
  },
  {
    authors: "G. A. Barnard",
    title: "A new test for 2 x 2 tables",
    venue: "Nature 156, 177",
    year: 1945,
    url: "https://doi.org/10.1038/156177a0",
    doi: "10.1038/156177a0",
    implemented: "The unconditional exact test of two independent binomials: tables are ordered by the Wald statistic (pooled or unpooled variance), and the p-value is the largest, over the common success probability, of the probability of a table at least as extreme.",
    deviations: "The ordering statistic is the Wald z (as scipy's barnard_exact), not Barnard's original CSM ordering. The maximum over the nuisance parameter is taken on a 1,000-point grid and polished by golden-section search around the best points.",
  },
  {
    authors: "R. D. Boschloo",
    title: "Raised conditional level of significance for the 2 x 2-table when testing the equality of two probabilities",
    venue: "Statistica Neerlandica 24(1), 1-9",
    year: 1970,
    url: "https://doi.org/10.1111/j.1467-9574.1970.tb00104.x",
    doi: "10.1111/j.1467-9574.1970.tb00104.x",
    implemented: "The unconditional test that orders tables by Fisher's one-sided p-value; uniformly more powerful than Fisher's test.",
    deviations: "Two-sided p-value is twice the smaller one-sided p-value, capped at 1, as scipy's boschloo_exact.",
  },
  {
    authors: "H. O. Lancaster",
    title: "Significance tests in discrete distributions",
    venue: "Journal of the American Statistical Association 56(294), 223-234",
    year: 1961,
    url: "https://doi.org/10.1080/01621459.1961.10482105",
    doi: "10.1080/01621459.1961.10482105",
    implemented: "The mid-p value: the exact p-value with only half the probability of the observed table counted.",
    deviations: "Two-sided mid-p is Fisher's two-sided p minus half the observed table's probability, the form Lydersen, Fagerland & Laake (2009) evaluate.",
  },
  {
    authors: "Stian Lydersen, Morten W. Fagerland and Petter Laake",
    title: "Recommended tests for association in 2 x 2 tables",
    venue: "Statistics in Medicine 28(7), 1159-1175",
    year: 2009,
    url: "https://doi.org/10.1002/sim.3531",
    doi: "10.1002/sim.3531",
    implemented: "Not an algorithm here: the review whose recommendation (unconditional or mid-p tests over Fisher's exact test) the page reports, and which eval/size.mjs checks by computing each test's exact size.",
    deviations: "Our size table is computed from scratch for equal arms of 10 to 50 at the 5% level; it is not a copy of the paper's tables.",
  },
  {
    authors: "Karl Pearson",
    title: "On the criterion that a given system of deviations from the probable in the case of a correlated system of variables is such that it can be reasonably supposed to have arisen from random sampling",
    venue: "Philosophical Magazine, Series 5, 50(302), 157-175",
    year: 1900,
    url: "https://doi.org/10.1080/14786440009463897",
    doi: "10.1080/14786440009463897",
    implemented: "The chi-square statistic, sum of (observed - expected)^2 / expected, with (r-1)(c-1) degrees of freedom.",
    deviations: "None.",
  },
  {
    authors: "F. Yates",
    title: "Contingency tables involving small numbers and the chi-square test",
    venue: "Supplement to the Journal of the Royal Statistical Society 1(2), 217-235",
    year: 1934,
    url: "https://doi.org/10.2307/2983604",
    doi: "10.2307/2983604",
    implemented: "The continuity correction for 2x2 tables: each |observed - expected| reduced by 0.5.",
    deviations: "The reduction is capped at |observed - expected|, as R and scipy do, so a table at its expected counts scores 0.",
  },
  {
    authors: "Shelby J. Haberman",
    title: "The analysis of residuals in cross-classified tables",
    venue: "Biometrics 29(1), 205-220",
    year: 1973,
    url: "https://doi.org/10.2307/2529686",
    doi: "10.2307/2529686",
    implemented: "Adjusted (standardised) residuals (O - E) / sqrt(E (1 - row share)(1 - column share)), approximately standard normal under independence, to say which cells drive a significant r x c test.",
    deviations: "None.",
  },
  {
    authors: "Nathan Mantel and William Haenszel",
    title: "Statistical aspects of the analysis of data from retrospective studies of disease",
    venue: "Journal of the National Cancer Institute 22(4), 719-748",
    year: 1959,
    url: "https://doi.org/10.1093/jnci/22.4.719",
    doi: "10.1093/jnci/22.4.719",
    implemented: "The stratified test of no association across K 2x2 tables (sum of a_k minus its expectation, over its hypergeometric variance) and the Mantel-Haenszel common odds ratio.",
    deviations: "Continuity correction of 0.5 on by default, applied only when |sum(a - E)| >= 0.5, as R's mantelhaen.test.",
  },
  {
    authors: "James Robins, Norman Breslow and Sander Greenland",
    title: "Estimators of the Mantel-Haenszel variance consistent in both sparse data and large-strata limiting models",
    venue: "Biometrics 42(2), 311-323",
    year: 1986,
    url: "https://doi.org/10.2307/2531052",
    doi: "10.2307/2531052",
    implemented: "The variance of the log Mantel-Haenszel odds ratio, for its confidence interval.",
    deviations: "None.",
  },
  {
    authors: "Robert E. Tarone",
    title: "On heterogeneity tests based on efficient scores",
    venue: "Biometrika 72(1), 91-95",
    year: 1985,
    url: "https://doi.org/10.1093/biomet/72.1.91",
    doi: "10.1093/biomet/72.1.91",
    implemented: "The correction to Breslow & Day's (1980) test that the strata share one odds ratio, which the plain Breslow-Day statistic needs because the Mantel-Haenszel estimate is not efficient.",
    deviations: "None. Strata with an undefined expected cell are left out of the test and listed.",
  },
  {
    authors: "Quinn McNemar",
    title: "Note on the sampling error of the difference between correlated proportions or percentages",
    venue: "Psychometrika 12(2), 153-157",
    year: 1947,
    url: "https://doi.org/10.1007/BF02295996",
    doi: "10.1007/BF02295996",
    implemented: "The paired test on the discordant pairs: chi-square (b - c)^2 / (b + c), with and without the continuity correction, and the exact binomial form and its mid-p.",
    deviations: "None.",
  },
  {
    authors: "Robert G. Newcombe",
    title: "Interval estimation for the difference between independent proportions: comparison of eleven methods",
    venue: "Statistics in Medicine 17(8), 873-890",
    year: 1998,
    url: "https://doi.org/10.1002/(SICI)1097-0258(19980430)17:8<873::AID-SIM779>3.0.CO;2-I",
    doi: "10.1002/(SICI)1097-0258(19980430)17:8<873::AID-SIM779>3.0.CO;2-I",
    implemented: "The hybrid score interval for a risk difference (method 10), built from each group's Wilson interval.",
    deviations: "None.",
  },
  {
    authors: "D. Katz, J. Baptista, S. P. Azen and M. C. Pike",
    title: "Obtaining confidence intervals for the risk ratio in cohort studies",
    venue: "Biometrics 34(3), 469-474",
    year: 1978,
    url: "https://doi.org/10.2307/2530610",
    doi: "10.2307/2530610",
    implemented: "The log-scale interval for a risk ratio.",
    deviations: "With a zero cell, 0.5 is added to every cell first, and the output says so.",
  },
  {
    authors: "Barnet Woolf",
    title: "On estimating the relation between blood group and disease",
    venue: "Annals of Human Genetics 19(4), 251-253",
    year: 1955,
    url: "https://doi.org/10.1111/j.1469-1809.1955.tb01348.x",
    doi: "10.1111/j.1469-1809.1955.tb01348.x",
    implemented: "The log odds ratio's standard error sqrt(1/a + 1/b + 1/c + 1/d), for the sample odds ratio's interval.",
    deviations: "With a zero cell, 0.5 is added to every cell first (Haldane-Anscombe), and the output says so.",
  },
];

/** Largest n1 x n2 for which Barnard and Boschloo run (500 x 500); bigger tables are past where they differ from chi-square. */
export const UNCONDITIONAL_LIMIT = 250000;

export const DEFAULTS = { alpha: 0.05, confidence: 0.95, alternative: "two-sided", pooled: true, correct: true, mode: "auto" };

// ---------- special functions ----------

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const LF = [0];
/** log(n!) for a non-negative integer, exact summation below 1e5 (cached). */
export function lfact(n) {
  if (n < 0) return -Infinity;
  if (n < 100000) {
    while (LF.length <= n) LF.push(LF[LF.length - 1] + Math.log(LF.length));
    return LF[n];
  }
  return lgamma(n + 1);
}
const lchoose = (n, k) => (k < 0 || k > n ? -Infinity : lfact(n) - lfact(k) - lfact(n - k));

function logSumExp(arr) {
  let m = -Infinity;
  for (const v of arr) if (v > m) m = v;
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const v of arr) s += Math.exp(v - m);
  return m + Math.log(s);
}

/** Regularised upper incomplete gamma Q(a, x). */
export function gammaQ(a, x) {
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
  // Lentz's continued fraction for Q.
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

/** Upper tail of chi-square with df degrees of freedom. */
export function chi2sf(x, df) { return x <= 0 ? 1 : gammaQ(df / 2, x / 2); }

/** Standard normal upper tail P(Z > z). */
export function normsf(z) {
  if (z < 0) return 1 - normsf(-z);
  return 0.5 * gammaQ(0.5, (z * z) / 2);
}

/** Standard normal quantile (Acklam's rational approximation, one Halley step). */
export function normppf(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let q, r, x;
  if (p < 0.02425) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - 0.02425) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    q = p - 0.5; r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const e = (1 - normsf(x)) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Root of a monotone function on [lo, hi] by bisection on the value's sign. */
function bisect(f, lo, hi, iters = 200) {
  let flo = f(lo);
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    const fm = f(mid);
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- the hypergeometric family ----------

/** Central hypergeometric log-pmf over the support of the first cell, for row totals m, n and first-column total k. */
function hyperLog(m, n, k) {
  const lo = Math.max(0, k - n), hi = Math.min(k, m);
  const logd = [];
  const base = lchoose(m + n, k);
  for (let x = lo; x <= hi; x++) logd.push(lchoose(m, x) + lchoose(n, k - x) - base);
  return { lo, hi, logd };
}

/** Normalised probabilities of a support whose central log-pmf is logd, tilted by odds ratio psi. */
function tilt(logd, lo, logPsi) {
  const w = logd.map((v, i) => v + logPsi * (lo + i));
  const z = logSumExp(w);
  return w.map((v) => Math.exp(v - z));
}

function conditionalOR(logd, lo, hi, x, conf, alternative) {
  // Conditional maximum likelihood (Cornfield 1956; as R's fisher.test and scipy's odds_ratio 'conditional').
  const mean = (lp) => tilt(logd, lo, lp).reduce((s, p, i) => s + p * (lo + i), 0);
  const lower = (lp) => tilt(logd, lo, lp).reduce((s, p, i) => s + (lo + i <= x ? p : 0), 0);
  const upper = (lp) => tilt(logd, lo, lp).reduce((s, p, i) => s + (lo + i >= x ? p : 0), 0);
  const L = 60;
  let estimate;
  if (lo === hi) estimate = NaN;
  else if (x === lo) estimate = 0;
  else if (x === hi) estimate = Infinity;
  else estimate = Math.exp(bisect((lp) => mean(lp) - x, -L, L));
  const ciU = (a) => (x === hi ? Infinity : Math.exp(bisect((lp) => lower(lp) - a, -L, L)));
  const ciL = (a) => (x === lo ? 0 : Math.exp(bisect((lp) => upper(lp) - a, -L, L)));
  let ci;
  if (alternative === "less") ci = [0, ciU(1 - conf)];
  else if (alternative === "greater") ci = [ciL(1 - conf), Infinity];
  else ci = [ciL((1 - conf) / 2), ciU((1 - conf) / 2)];
  return { estimate, ci };
}

function exactP(logd, lo, x, alternative) {
  const d = logd.map(Math.exp);
  const ix = x - lo;
  if (alternative === "less") return Math.min(1, d.slice(0, ix + 1).reduce((s, v) => s + v, 0));
  if (alternative === "greater") return Math.min(1, d.slice(ix).reduce((s, v) => s + v, 0));
  const lim = d[ix] * (1 + 1e-7);
  return Math.min(1, d.reduce((s, v) => s + (v <= lim ? v : 0), 0));
}

/**
 * Fisher's exact test of a 2x2 table [[a, b], [c, d]] (rows are groups, the first column is the event).
 * Returns the p-value, the mid-p, the observed table's probability and the conditional MLE odds ratio with its exact interval.
 */
export function fisherExact(table, { alternative = "two-sided", confidence = 0.95 } = {}) {
  const [[a, b], [c, d]] = table;
  const { lo, hi, logd } = hyperLog(a + b, c + d, a + c);
  const p = exactP(logd, lo, a, alternative);
  const pObs = Math.exp(logd[a - lo]);
  const or = conditionalOR(logd, lo, hi, a, confidence, alternative);
  return { p, midP: Math.max(0, p - pObs / 2), pObserved: pObs, oddsRatio: or.estimate, ci: or.ci, support: [lo, hi] };
}

// ---------- unconditional tests ----------

function nuisanceMax(logw, N) {
  // max over pi of sum_s w_s pi^s (1-pi)^(N-s); logw[s] = -Infinity where empty.
  const f = (pi) => {
    if (pi <= 0) return logw[0];
    if (pi >= 1) return logw[N];
    const l1 = Math.log(pi), l0 = Math.log1p(-pi);
    const terms = [];
    for (let s = 0; s <= N; s++) if (logw[s] > -Infinity) terms.push(logw[s] + s * l1 + (N - s) * l0);
    return logSumExp(terms);
  };
  const G = 1000;
  const vals = [];
  for (let i = 0; i <= G; i++) vals.push(f(i / G));
  let best = -Infinity, bestPi = 0;
  const peaks = [];
  for (let i = 0; i <= G; i++) {
    if (vals[i] > best) { best = vals[i]; bestPi = i / G; }
    const left = i === 0 ? -Infinity : vals[i - 1], right = i === G ? -Infinity : vals[i + 1];
    if (vals[i] >= left && vals[i] >= right) peaks.push(i);
  }
  peaks.sort((u, v) => vals[v] - vals[u]);
  for (const i of peaks.slice(0, 4)) {
    let lo = Math.max(0, (i - 1) / G), hi = Math.min(1, (i + 1) / G);
    const gr = (Math.sqrt(5) - 1) / 2;
    let x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo), f1 = f(x1), f2 = f(x2);
    for (let k = 0; k < 80; k++) {
      if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = f(x2); }
      else { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = f(x1); }
    }
    const m = (lo + hi) / 2, fm = f(m);
    if (fm > best) { best = fm; bestPi = m; }
  }
  return { p: Math.min(1, Math.exp(best)), pi: bestPi };
}

function waldGrid(n1, n2, pooled) {
  const T = [];
  for (let x1 = 0; x1 <= n1; x1++) {
    const row = [];
    for (let x2 = 0; x2 <= n2; x2++) {
      const p1 = x1 / n1, p2 = x2 / n2;
      if (p1 === p2) { row.push(0); continue; }
      let v;
      if (pooled) { const p = (x1 + x2) / (n1 + n2); v = p * (1 - p) * (1 / n1 + 1 / n2); }
      else v = (p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2;
      row.push((p1 - p2) / Math.sqrt(v));
    }
    T.push(row);
  }
  return T;
}

function regionMax(n1, n2, inRegion) {
  const N = n1 + n2;
  const buckets = Array.from({ length: N + 1 }, () => []);
  for (let x1 = 0; x1 <= n1; x1++) for (let x2 = 0; x2 <= n2; x2++) if (inRegion(x1, x2)) buckets[x1 + x2].push(lchoose(n1, x1) + lchoose(n2, x2));
  return nuisanceMax(buckets.map(logSumExp), N);
}

/** Barnard's unconditional exact test with the Wald ordering (pooled or unpooled), for x1 of n1 against x2 of n2. */
export function barnardExact(x1, n1, x2, n2, { alternative = "two-sided", pooled = true } = {}) {
  if (n1 === 0 || n2 === 0) return { statistic: NaN, p: 1, pi: null };
  const T = waldGrid(n1, n2, pooled);
  const t0 = T[x1][x2];
  // Ties within 1e-12 (relative) are ties: mirror-image tables have equal |T| but can differ in the last bit.
  const tol = Number.isFinite(t0) ? 1e-12 * Math.max(1, Math.abs(t0)) : 0;
  const inR = alternative === "less" ? (a, b) => T[a][b] <= t0 + tol
    : alternative === "greater" ? (a, b) => T[a][b] >= t0 - tol
      : (a, b) => Math.abs(T[a][b]) >= Math.abs(t0) - tol;
  const r = regionMax(n1, n2, inR);
  return { statistic: t0, p: r.p, pi: r.pi };
}

function fisherOneSidedGrid(n1, n2, side) {
  // side 'greater': P(X >= x1 | x1 + x2) with X the first group's events; 'less': P(X <= x1).
  const P = [];
  for (let x1 = 0; x1 <= n1; x1++) P.push(new Array(n2 + 1));
  for (let s = 0; s <= n1 + n2; s++) {
    const { lo, hi, logd } = hyperLog(n1, n2, s);
    const d = logd.map(Math.exp);
    let acc = 0;
    if (side === "less") for (let x = lo; x <= hi; x++) { acc += d[x - lo]; P[x][s - x] = Math.min(1, acc); }
    else for (let x = hi; x >= lo; x--) { acc += d[x - lo]; P[x][s - x] = Math.min(1, acc); }
  }
  return P;
}

/** Boschloo's unconditional test (tables ordered by Fisher's one-sided p-value). */
export function boschlooExact(x1, n1, x2, n2, { alternative = "two-sided" } = {}) {
  if (n1 === 0 || n2 === 0) return { statistic: NaN, p: NaN };
  if (alternative === "two-sided") {
    const l = boschlooExact(x1, n1, x2, n2, { alternative: "less" });
    const g = boschlooExact(x1, n1, x2, n2, { alternative: "greater" });
    const m = l.p < g.p ? l : g;
    return { statistic: m.statistic, p: Math.min(1, 2 * m.p), pi: m.pi };
  }
  const P = fisherOneSidedGrid(n1, n2, alternative);
  const s0 = P[x1][x2];
  const r = regionMax(n1, n2, (a, b) => P[a][b] <= s0 * (1 + 1e-13));
  return { statistic: s0, p: r.p, pi: r.pi };
}

// ---------- chi-square family ----------

function margins(t) {
  const r = t.map((row) => row.reduce((s, v) => s + v, 0));
  const c = t[0].map((_, j) => t.reduce((s, row) => s + row[j], 0));
  return { r, c, n: r.reduce((s, v) => s + v, 0) };
}

/** Pearson chi-square (optionally Yates-corrected for 2x2), likelihood-ratio G, expected counts, adjusted residuals and Cramér's V. */
export function chiSquare(t, { correct = false } = {}) {
  const { r, c, n } = margins(t);
  const R = r.length, C = c.length;
  const E = t.map((row, i) => row.map((_, j) => (r[i] * c[j]) / n));
  const df = (r.filter((v) => v > 0).length - 1) * (c.filter((v) => v > 0).length - 1);
  let x2 = 0, g = 0;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
    if (E[i][j] === 0) continue;
    let o = t[i][j];
    if (correct && df === 1) { const diff = E[i][j] - o; o += Math.sign(diff) * Math.min(0.5, Math.abs(diff)); }
    x2 += ((o - E[i][j]) ** 2) / E[i][j];
    if (o > 0) g += 2 * o * Math.log(o / E[i][j]);
  }
  const residuals = t.map((row, i) => row.map((o, j) => {
    const v = E[i][j] * (1 - r[i] / n) * (1 - c[j] / n);
    return v > 0 ? (o - E[i][j]) / Math.sqrt(v) : 0;
  }));
  const k = Math.min(r.filter((v) => v > 0).length, c.filter((v) => v > 0).length);
  const cramerV = k > 1 ? Math.sqrt(x2 / (n * (k - 1))) : NaN;
  const small = E.flat().filter((e) => e < 5).length;
  return {
    statistic: x2, df, p: df > 0 ? chi2sf(x2, df) : 1, g, gP: df > 0 ? chi2sf(g, df) : 1,
    expected: E, residuals, cramerV, cellsBelow5: small, cells: R * C, minExpected: Math.min(...E.flat()),
  };
}

// ---------- r x c exact (network) ----------

function partitions(total, caps) {
  // Every vector x with sum total and 0 <= x_i <= caps[i].
  const out = [];
  const k = caps.length;
  const suffix = new Array(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + caps[i];
  const x = new Array(k);
  (function rec(i, left) {
    if (i === k - 1) { if (left <= caps[i]) { x[i] = left; out.push(x.slice()); } return; }
    const lo = Math.max(0, left - suffix[i + 1]), hi = Math.min(caps[i], left);
    for (let v = lo; v <= hi; v++) { x[i] = v; rec(i + 1, left - v); }
  })(0, total);
  return out;
}

/**
 * Fisher-Freeman-Halton exact p-value for an r x c table (network algorithm after Mehta & Patel 1983).
 * Returns null when the work exceeds maxWork steps or maxMs milliseconds, so the caller can fall back to Monte Carlo.
 */
export function fisherRxC(t, { maxWork = 5e6, maxMs = 6000 } = {}) {
  const started = Date.now();
  let { r, c, n } = margins(t);
  // Drop empty rows and columns; put the longer dimension across the columns.
  let tab = t.filter((_, i) => r[i] > 0).map((row) => row.filter((_, j) => c[j] > 0));
  ({ r, c } = margins(tab));
  if (r.length > c.length) { tab = tab[0].map((_, j) => tab.map((row) => row[j])); ({ r, c } = margins(tab)); }
  if (r.length < 2 || c.length < 2) return { p: 1, pObserved: 1, work: 0, exact: true };
  const order = c.map((v, j) => [v, j]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const cols = order.map((j) => c[j]);
  const obsCols = order.map((j) => tab.map((row) => row[j]));
  const K = cols.length;
  const colTerm = (x) => -x.reduce((s, v) => s + lfact(v), 0);
  const obs = obsCols.reduce((s, x) => s + colTerm(x), 0);
  const konst = r.reduce((s, v) => s + lfact(v), 0) + c.reduce((s, v) => s + lfact(v), 0) - lfact(n);
  const thr = obs + 1e-7;
  const key = (j, R) => j + ":" + R.slice().sort((u, v) => u - v).join(",");
  const restCols = (j) => cols.slice(j);
  // log of the closed-form total below a node: sum over completions of prod 1/x! = m!/(prod R! prod c!).
  const logTotal = (j, R) => lfact(R.reduce((s, v) => s + v, 0)) - R.reduce((s, v) => s + lfact(v), 0) - restCols(j).reduce((s, v) => s + lfact(v), 0);
  let work = 0;
  // Cheap valid bounds on the remaining log-probability (Mehta & Patel's idea, relaxed): drop one set of
  // margins and solve each line alone. The most probable fill of a line spreads it evenly (lfact is convex);
  // the least probable piles it into the largest cells. Each relaxation bounds the true value, so the
  // tighter of the two is used and nothing is ever pruned wrongly.
  const evenMax = (total, caps) => {
    const x = caps.map(() => 0);
    let left = total;
    const order = caps.map((v, i) => i);
    while (left > 0) {
      let open = order.filter((i) => x[i] < caps[i]);
      const share = Math.max(1, Math.floor(left / open.length));
      for (const i of open) { if (left === 0) break; const add = Math.min(share, caps[i] - x[i], left); x[i] += add; left -= add; }
    }
    return -x.reduce((s, v) => s + lfact(v), 0);
  };
  const pileMin = (total, caps) => {
    let left = total, s = 0;
    for (const cap of caps.slice().sort((u, v) => v - u)) { const t = Math.min(cap, left); s += lfact(t); left -= t; if (!left) break; }
    return -s;
  };
  // Key of a node within one stage: its sorted remaining row margins, packed base (largest margin + 1) into one
  // number when that is exact (below 2^53), else joined as text. Either spelling is one-to-one, and a stage's
  // nodes are visited in insertion order, so the key's type changes nothing but the cost of the lookup.
  const nr = r.length, base = Math.max(...r) + 1;
  const nodeKey = base ** nr < 2 ** 53
    ? (R2) => { let k = 0; for (let i = 0; i < nr; i++) k = k * base + R2[i]; return k; }
    : (R2) => R2.join(",");
  const scratch = new Array(nr).fill(0);
  const boundMemo = new Map();
  function bounds(j, R) {
    if (j === K) return [0, 0];
    const kk = key(j, R);
    const hit = boundMemo.get(kk);
    if (hit) return hit;
    const rest = cols.slice(j);
    let mxC = 0, mnC = 0, mxR = 0, mnR = 0;
    for (const cj of rest) { mxC += evenMax(cj, R); mnC += pileMin(cj, R); }
    for (const ri of R) { mxR += evenMax(ri, rest); mnR += pileMin(ri, rest); }
    const res = [Math.min(mxC, mxR), Math.max(mnC, mnR)];
    boundMemo.set(kk, res);
    return res;
  }
  try {
    let stage = new Map([[key(0, r), { R: r.slice(), pasts: new Map([["0", { v: 0, w: 1 }]]) }]]);
    let logs = [];
    for (let j = 0; j < K; j++) {
      const next = new Map();
      for (const { R, pasts } of stage.values()) {
        const [mx, mn] = bounds(j, R);
        const lt = logTotal(j, R);
        const expand = [];
        for (const { v, w } of pasts.values()) {
          if (v + mx <= thr) logs.push(Math.log(w) + v + lt);
          else if (v + mn > thr) continue;
          else expand.push({ v, w });
        }
        if (!expand.length) continue;
        for (const x of partitions(cols[j], R)) {
          if (++work > maxWork) throw new Error("work");
          // Sort once: the sorted remaining margins are both the node's key and its stored R.
          const R2 = scratch;
          for (let i = 0; i < nr; i++) {
            const u = R[i] - x[i];
            let q = i;
            while (q > 0 && R2[q - 1] > u) { R2[q] = R2[q - 1]; q--; }
            R2[q] = u;
          }
          const ct = colTerm(x);
          const k2 = nodeKey(R2);
          let node = next.get(k2);
          if (!node) { node = { R: R2.slice(), pasts: new Map() }; next.set(k2, node); }
          for (const { v, w } of expand) {
            if (++work > maxWork || ((work & 0xffff) === 0 && Date.now() - started > maxMs)) throw new Error("work");
            const nv = v + ct;
            const pk = pastKey(nv);
            const e = node.pasts.get(pk);
            if (e) e.w += w; else node.pasts.set(pk, { v: nv, w });
          }
        }
      }
      stage = next;
    }
    for (const { pasts } of stage.values()) for (const { v, w } of pasts.values()) if (v <= thr) logs.push(Math.log(w) + v);
    const p = Math.min(1, Math.exp(logSumExp(logs) + konst));
    return { p, pObserved: Math.exp(obs + konst), work, exact: true };
  } catch (e) {
    if (e.message === "work") return null;
    throw e;
  }
}

/**
 * The merge key of a partial log-probability: the integer nv.toFixed(9) spells, without building the string
 * on the common path. nv * 1e9 is within 1e-5 of the exact scaled value for |nv| < 1e6, so away from a
 * rounding tie (a fraction within 1e-3 of one half) its nearest integer is the one toFixed rounds to; near a
 * tie, and for huge values, the string decides. Two values share a key exactly when their toFixed(9) strings
 * match (nv is 0 or at most -log 2 here, so the "-0.000000000" spelling never arises).
 */
function pastKey(nv) {
  if (!(Math.abs(nv) < 1e6)) return nv.toFixed(9);
  const y = nv * 1e9, fl = Math.floor(y), f = y - fl;
  if (Math.abs(f - 0.5) < 1e-3) return Math.round(Number(nv.toFixed(9)) * 1e9);
  return f < 0.5 ? fl : fl + 1;
}

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

/** One draw from the hypergeometric: successes in n draws without replacement from N items, K of them successes. */
function hypergeometric(N, K, n, rnd) {
  const lo = Math.max(0, n - (N - K)), hi = Math.min(n, K);
  if (lo === hi) return lo;
  // Inversion from the mode outward ("chop-down"): the expected cost is about one standard deviation, not N.
  const m = Math.min(hi, Math.max(lo, Math.floor(((n + 1) * (K + 1)) / (N + 2))));
  const pm = Math.exp(lchoose(K, m) + lchoose(N - K, n - m) - lchoose(N, n));
  let u = rnd() - pm;
  if (u <= 0) return m;
  let up = m, pu = pm, dn = m, pd = pm;
  while (up < hi || dn > lo) {
    if (up < hi) { pu *= ((K - up) * (n - up)) / ((up + 1) * (N - K - n + up + 1)); up++; u -= pu; if (u <= 0) return up; }
    if (dn > lo) { pd *= (dn * (N - K - n + dn)) / ((K - dn + 1) * (n - dn + 1)); dn--; u -= pd; if (u <= 0) return dn; }
  }
  return m;
}

/**
 * Monte Carlo Fisher-Freeman-Halton p-value: random tables with both margins fixed. Each row takes its count
 * from what is left of the column totals, one hypergeometric draw per cell, so the cost per table grows with
 * r x c and the square root of n rather than with n (a 3 x 3 table of 18,000 took 13 s by shuffling labels; 2026-11-17).
 */
export function fisherRxCMonteCarlo(t, { samples = 20000, seed = 1 } = {}) {
  const { r, c, n } = margins(t);
  const score = (tab) => -tab.flat().reduce((s, v) => s + lfact(v), 0);
  const obs = score(t);
  const rnd = mulberry32(seed);
  let hits = 0;
  const tab = r.map(() => new Array(c.length).fill(0));
  const colLeft = c.slice();
  for (let s = 0; s < samples; s++) {
    for (let j = 0; j < c.length; j++) colLeft[j] = c[j];
    let pool = n;
    for (let i = 0; i < r.length; i++) {
      let left = r[i], rest = pool;
      for (let j = 0; j < c.length; j++) {
        const x = j === c.length - 1 ? left : hypergeometric(rest, colLeft[j], left, rnd);
        tab[i][j] = x; rest -= colLeft[j]; colLeft[j] -= x; left -= x;
      }
      pool -= r[i];
    }
    if (score(tab) <= obs + 1e-7) hits++;
  }
  const p = (hits + 1) / (samples + 1);
  const se = Math.sqrt((p * (1 - p)) / samples);
  return { p, se, samples, seed, exact: false };
}

// ---------- effect sizes for a 2x2 ----------

function wilson(x, n, z) {
  const p = x / n, den = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / den;
  const half = (z / den) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [mid - half, mid + half];
}

/** Risk difference (Wald and Newcombe hybrid score), risk ratio (Katz log), sample odds ratio (Woolf), phi and NNT. */
export function effectSizes(table, confidence = 0.95) {
  const [[a, b], [c, d]] = table;
  const n1 = a + b, n2 = c + d;
  const z = normppf(1 - (1 - confidence) / 2);
  const p1 = a / n1, p2 = c / n2;
  const rd = p1 - p2;
  const seRd = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const [l1, u1] = wilson(a, n1, z), [l2, u2] = wilson(c, n2, z);
  const newcombe = [rd - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), rd + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
  const zero = a === 0 || b === 0 || c === 0 || d === 0;
  const [A, B, Cc, D] = zero ? [a + 0.5, b + 0.5, c + 0.5, d + 0.5] : [a, b, c, d];
  const rr = (A / (A + B)) / (Cc / (Cc + D));
  const seLogRr = Math.sqrt(1 / A - 1 / (A + B) + 1 / Cc - 1 / (Cc + D));
  const or = (A * D) / (B * Cc);
  const seLogOr = Math.sqrt(1 / A + 1 / B + 1 / Cc + 1 / D);
  const den = Math.sqrt(n1 * n2 * (a + c) * (b + d));
  return {
    risk1: p1, risk2: p2,
    riskDifference: { estimate: rd, wald: [rd - z * seRd, rd + z * seRd], newcombe },
    riskRatio: { estimate: rr, ci: [rr * Math.exp(-z * seLogRr), rr * Math.exp(z * seLogRr)], corrected: zero },
    oddsRatio: { estimate: or, ci: [or * Math.exp(-z * seLogOr), or * Math.exp(z * seLogOr)], corrected: zero },
    phi: den > 0 ? (a * d - b * c) / den : NaN,
    nnt: rd !== 0 ? 1 / Math.abs(rd) : Infinity,
  };
}

// ---------- stratified 2x2xK ----------

/** Cochran-Mantel-Haenszel test, MH odds ratio (Robins-Breslow-Greenland CI), Breslow-Day-Tarone homogeneity, exact conditional test and conditional MLE. */
export function mantelHaenszel(strata, { correct = true, confidence = 0.95, alternative = "two-sided", exact = true } = {}) {
  const z = normppf(1 - (1 - confidence) / 2);
  const used = strata.filter(([[a, b], [c, d]]) => a + b + c + d >= 2);
  let delta = 0, varS = 0, R = 0, S = 0, PR = 0, PSQR = 0, QS = 0;
  let sumA = 0;
  for (const [[a, b], [c, d]] of used) {
    const n = a + b + c + d, n1 = a + b, n2 = c + d, m1 = a + c, m2 = b + d;
    delta += a - (n1 * m1) / n;
    varS += (n1 * n2 * m1 * m2) / (n * n * (n - 1));
    sumA += a;
    const Ri = (a * d) / n, Si = (b * c) / n, Pi = (a + d) / n, Qi = (b + c) / n;
    R += Ri; S += Si; PR += Pi * Ri; PSQR += Pi * Si + Qi * Ri; QS += Qi * Si;
  }
  const yates = correct && Math.abs(delta) >= 0.5 ? 0.5 : 0;
  const stat = varS > 0 ? (Math.abs(delta) - yates) ** 2 / varS : 0;
  let p;
  if (alternative === "two-sided") p = chi2sf(stat, 1);
  else { const zz = Math.sign(delta) * Math.sqrt(stat); p = alternative === "greater" ? normsf(zz) : 1 - normsf(zz); }
  const orMH = R / S;
  const varLog = PR / (2 * R * R) + PSQR / (2 * R * S) + QS / (2 * S * S);
  const ciMH = [orMH * Math.exp(-z * Math.sqrt(varLog)), orMH * Math.exp(z * Math.sqrt(varLog))];
  // Breslow-Day with Tarone's correction.
  let bd = 0, tSum = 0, tVar = 0;
  const skipped = [];
  const perStratum = strata.map(([[a, b], [c, d]], k) => {
    const n1 = a + b, n2 = c + d, m1 = a + c;
    const sample = b * c > 0 ? (a * d) / (b * c) : NaN;
    const lo = Math.max(0, m1 - n2), hi = Math.min(n1, m1);
    let fitted = null;
    if (hi > lo && Number.isFinite(orMH) && orMH > 0) {
      // Solve (A (n2 - m1 + A)) / ((n1 - A)(m1 - A)) = orMH on (lo, hi).
      const f = (A) => A * (n2 - m1 + A) - orMH * (n1 - A) * (m1 - A);
      const A = bisect(f, lo, hi);
      const v = 1 / (1 / A + 1 / (n1 - A) + 1 / (m1 - A) + 1 / (n2 - m1 + A));
      if (Number.isFinite(v) && v > 0) {
        bd += (a - A) ** 2 / v; tSum += a - A; tVar += v; fitted = A;
      } else skipped.push(k);
    } else skipped.push(k);
    return { table: [[a, b], [c, d]], oddsRatio: sample, n: a + b + c + d, fitted };
  });
  const tarone = bd - (tVar > 0 ? (tSum * tSum) / tVar : 0);
  const dfBD = strata.length - skipped.length - 1;
  const out = {
    strata: perStratum, used: used.length,
    cmh: { statistic: stat, df: 1, p, delta, corrected: yates > 0 },
    commonOR: { estimate: orMH, ci: ciMH, logSE: Math.sqrt(varLog) },
    breslowDay: { statistic: bd, tarone, df: dfBD, p: dfBD > 0 ? chi2sf(bd, dfBD) : NaN, taroneP: dfBD > 0 ? chi2sf(tarone, dfBD) : NaN, skipped },
  };
  if (exact) {
    // Conditional distribution of S = sum a_k: convolution of the strata's central hypergeometrics.
    let lo = 0, logd = [0];
    for (const [[a, b], [c, d]] of used) {
      const h = hyperLog(a + b, c + d, a + c);
      const nd = new Array(logd.length + h.logd.length - 1).fill(-Infinity);
      for (let i = 0; i < logd.length; i++) for (let j = 0; j < h.logd.length; j++) {
        const v = logd[i] + h.logd[j], k = i + j;
        nd[k] = nd[k] === -Infinity ? v : Math.max(nd[k], v) + Math.log1p(Math.exp(-Math.abs(nd[k] - v)));
      }
      logd = nd; lo += h.lo;
    }
    const hi = lo + logd.length - 1;
    const pe = exactP(logd, lo, sumA, alternative);
    const or = conditionalOR(logd, lo, hi, sumA, confidence, alternative);
    out.exact = { statistic: sumA, p: pe, oddsRatio: or.estimate, ci: or.ci };
  }
  return out;
}

// ---------- paired ----------

/** McNemar's test on a paired 2x2 [[both, first only], [second only, neither]]. */
export function mcnemar(table, { confidence = 0.95 } = {}) {
  const b = table[0][1], c = table[1][0], m = b + c;
  if (m === 0) return { b, c, chi2: 0, chi2P: 1, corrected: 0, correctedP: 1, exactP: 1, midP: 1, oddsRatio: NaN, ci: [NaN, NaN] };
  const chi2 = ((b - c) ** 2) / m;
  const cc = ((Math.max(0, Math.abs(b - c) - 1)) ** 2) / m;
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(lchoose(m, i) - m * Math.LN2);
  const exactP2 = Math.min(1, 2 * tail);
  const point = Math.exp(lchoose(m, b) - m * Math.LN2);
  const midP = Math.min(1, 2 * tail - point);
  // Clopper-Pearson on b / (b + c), mapped to the conditional odds ratio b / c.
  const alpha = 1 - confidence;
  const binomUpper = (x, n, pp) => { let s = 0; for (let i = x; i <= n; i++) s += Math.exp(lchoose(n, i) + i * Math.log(pp) + (n - i) * Math.log1p(-pp)); return s; };
  const binomLower = (x, n, pp) => { let s = 0; for (let i = 0; i <= x; i++) s += Math.exp(lchoose(n, i) + i * Math.log(pp) + (n - i) * Math.log1p(-pp)); return s; };
  const pl = b === 0 ? 0 : bisect((pp) => binomUpper(b, m, pp) - alpha / 2, 1e-15, 1 - 1e-15);
  const pu = b === m ? 1 : bisect((pp) => alpha / 2 - binomLower(b, m, pp), 1e-15, 1 - 1e-15);
  return {
    b, c, chi2, chi2P: chi2sf(chi2, 1), corrected: cc, correctedP: chi2sf(cc, 1), exactP: exactP2, midP,
    oddsRatio: c > 0 ? b / c : Infinity, ci: [pl / (1 - pl), pu === 1 ? Infinity : pu / (1 - pu)],
  };
}

// ---------- input ----------

/** Parse CSV text into rows of strings (RFC 4180 quotes; comma, semicolon or tab). */
export function parseCSV(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length]).sort((x, y) => y[1] - x[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row.map((v) => v.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row.map((v) => v.trim()));
  return rows;
}

const isCount = (s) => /^\d+$/.test(String(s).trim());

/**
 * Build tables from CSV. Two shapes:
 *  - a grid: a header row of column labels and rows "label, count, count, ...";
 *  - long rows: one row per observation (row, column[, stratum]) or with a count column (count, freq, n, weight).
 * Options name the columns: row, col, stratum, count.
 */
export function tablesFromCSV(text, opts = {}) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("Paste a table: a header row and at least one row of counts.");
  const head = rows[0];
  const body = rows.slice(1);
  const gridLike = !opts.row && !opts.col && body.every((r) => r.length === head.length && r.slice(1).every(isCount)) && head.length >= 3;
  if (gridLike) {
    const colLabels = head.slice(1);
    return { rowLabels: body.map((r) => r[0]), colLabels, table: body.map((r) => r.slice(1).map(Number)), shape: "grid" };
  }
  const idx = (name) => {
    if (name == null) return -1;
    const i = head.findIndex((h) => h.toLowerCase() === String(name).toLowerCase());
    if (i < 0) throw new Error(`No column named "${name}". Columns: ${head.join(", ")}`);
    return i;
  };
  let ci = idx(opts.count);
  if (ci < 0 && opts.count !== null) ci = head.findIndex((h) => /^(count|counts|freq|frequency|n|weight|weights|number|total|cases|people|applicants|patients|subjects)$/i.test(h));
  // Otherwise a last column of whole numbers, with at least two category columns before it, holds the counts.
  if (ci < 0 && opts.count !== null && head.length >= 3 && body.every((r) => isCount(r[head.length - 1]))) ci = head.length - 1;
  const cats = head.map((_, i) => i).filter((i) => i !== ci && !(i === 0 && /^(rownames|)$/i.test(head[0]) && body.every((r) => isCount(r[0]))));
  let ri = idx(opts.row), cj = idx(opts.col), si = idx(opts.stratum);
  let free = cats.filter((i) => i !== ri && i !== cj && i !== si);
  if (ri < 0 && cj < 0 && si < 0 && opts.stratum === undefined && free.length >= 3) {
    // Three category columns and no names: if two of them are binary, they make the 2x2 and the other is the stratum.
    const levels = (i) => new Set(body.map((r) => r[i])).size;
    const binary = free.filter((i) => levels(i) === 2);
    const other = free.filter((i) => levels(i) !== 2);
    if (binary.length >= 2 && other.length) free = [binary[0], binary[1], other[0], ...free.filter((i) => i !== binary[0] && i !== binary[1] && i !== other[0])];
  }
  if (ri < 0) ri = free.shift();
  if (cj < 0) cj = free.shift();
  if (si < 0 && opts.stratum === undefined && free.length) si = free.shift();
  if (ri === undefined || cj === undefined) throw new Error("Need at least two category columns (or a grid of counts).");
  const seen = (arr, v) => { if (!arr.includes(v)) arr.push(v); return arr.indexOf(v); };
  const rowLabels = [], colLabels = [], stratumLabels = [];
  const cellsByStratum = new Map();
  for (const r of body) {
    const w = ci >= 0 ? Number(r[ci]) : 1;
    if (!Number.isFinite(w) || w < 0 || !Number.isInteger(w)) throw new Error(`Counts must be whole numbers: "${r[ci]}".`);
    if (r[ri] === "" || r[cj] === "") continue;
    const i = seen(rowLabels, r[ri]), j = seen(colLabels, r[cj]);
    const s = si >= 0 ? seen(stratumLabels, r[si]) : 0;
    if (!cellsByStratum.has(s)) cellsByStratum.set(s, []);
    cellsByStratum.get(s).push([i, j, w]);
  }
  const build = (cells) => {
    const t = rowLabels.map(() => colLabels.map(() => 0));
    for (const [i, j, w] of cells) t[i][j] += w;
    return t;
  };
  const all = [...cellsByStratum.values()].flat();
  const out = { rowLabels, colLabels, table: build(all), shape: "long", columns: { row: head[ri], col: head[cj], stratum: si >= 0 ? head[si] : null, count: ci >= 0 ? head[ci] : null } };
  if (si >= 0) { out.stratumLabels = stratumLabels; out.strata = stratumLabels.map((_, s) => build(cellsByStratum.get(s) || [])); }
  return out;
}

function validTable(t) {
  if (!Array.isArray(t) || t.length < 2 || !t.every((r) => Array.isArray(r) && r.length === t[0].length) || t[0].length < 2) throw new Error("A table needs at least 2 rows and 2 columns of equal length.");
  for (const v of t.flat()) if (!Number.isInteger(v) || v < 0) throw new Error(`Counts must be non-negative whole numbers, got ${v}.`);
  if (t.flat().reduce((s, v) => s + v, 0) === 0) throw new Error("The table is empty.");
}

// ---------- the one-call analysis ----------

const fmtP = (p) => (p < 0.0001 ? "< 0.0001" : p.toFixed(4));
/** "p = 0.0123" or "p < 0.0001". */
const pIs = (p) => (p < 0.0001 ? "p < 0.0001" : `p = ${p.toFixed(4)}`);
const fmt = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(4)).toString() : x === Infinity ? "∞" : "—");

/**
 * Analyse a table. Input: {table} (2x2 or r x c), {strata: [2x2, ...]}, {paired: 2x2} or {csv} with
 * {row, col, stratum, count} column names; plus alpha, confidence, alternative ('two-sided' | 'less' | 'greater'),
 * pooled (Barnard), correct (Yates / CMH), mode ('auto' | 'independent' | 'paired' | 'stratified').
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const alpha = Number(o.alpha), confidence = Number(o.confidence);
  if (!(alpha > 0 && alpha < 1)) throw new Error("alpha must be between 0 and 1.");
  if (!(confidence > 0 && confidence < 1)) throw new Error("confidence must be between 0 and 1.");
  if (!["two-sided", "less", "greater"].includes(o.alternative)) throw new Error(`alternative must be two-sided, less or greater, not "${o.alternative}".`);
  let table = o.table, strata = o.strata, rowLabels = o.rowLabels, colLabels = o.colLabels, stratumLabels = o.stratumLabels;
  let mode = o.mode;
  if (o.paired) { table = o.paired; mode = "paired"; }
  if (o.csv) {
    const parsed = tablesFromCSV(o.csv, { row: o.row, col: o.col, stratum: o.stratum, count: o.count });
    table = parsed.table; rowLabels = parsed.rowLabels; colLabels = parsed.colLabels;
    if (parsed.strata && mode !== "independent") { strata = parsed.strata; stratumLabels = parsed.stratumLabels; }
  }
  const warnings = [];
  if (strata && mode !== "paired" && !strata.every((s) => s.length === 2 && s[0].length === 2)) {
    warnings.push(`The stratified tests need two groups and two outcomes in each stratum; with ${strata[0].length} x ${strata[0][0].length} strata the pooled table is tested instead.`);
    strata = null;
  }
  if (strata && mode !== "paired") {
    strata.forEach(validTable);
    if (!table) table = [[0, 0], [0, 0]].map((row, i) => row.map((_, j) => strata.reduce((s, t) => s + t[i][j], 0)));
    mode = "stratified";
  }
  validTable(table);
  const R = table.length, C = table[0].length;
  if (mode === "paired") {
    rowLabels = rowLabels || ["First: yes", "First: no"];
    colLabels = colLabels || ["Second: yes", "Second: no"];
  }
  rowLabels = rowLabels || table.map((_, i) => `Group ${i + 1}`);
  colLabels = colLabels || table[0].map((_, j) => (C === 2 ? ["Event", "No event"][j] : `Category ${j + 1}`));
  if (mode === "paired" && (R !== 2 || C !== 2)) throw new Error("McNemar's test needs a 2x2 table of paired outcomes.");
  if (mode === "auto") mode = "independent";
  if (mode !== "paired" && R === 2 && C === 2) {
    const empty = table.findIndex((row) => row[0] + row[1] === 0);
    if (empty >= 0) throw new Error(`${rowLabels[empty]} has no observations: comparing two groups needs counts in both rows.`);
  }
  const out = { mode, alpha, confidence, alternative: o.alternative, rows: R, cols: C, n: table.flat().reduce((s, v) => s + v, 0), table, rowLabels, colLabels, warnings };
  if (mode === "paired") {
    if (o.alternative !== "two-sided") {
      warnings.push(`McNemar's test here is two-sided; the one-sided alternative ("${o.alternative}") was not applied. Halve the exact p-value only if the discordant pairs lean the way you predicted.`);
      out.alternative = "two-sided";
    }
    out.mcnemar = mcnemar(table, { confidence });
    out.summary = summarize(out);
    return out;
  }
  out.chiSquare = chiSquare(table);
  if (R === 2 && C === 2) {
    const [[a, b], [c, d]] = table;
    out.yates = chiSquare(table, { correct: true });
    out.fisher = fisherExact(table, { alternative: o.alternative, confidence });
    if ((a + b) * (c + d) <= UNCONDITIONAL_LIMIT) {
    out.barnardPooled = o.pooled !== false && o.pooled !== "false";
    out.barnard = barnardExact(a, a + b, c, c + d, { alternative: o.alternative, pooled: out.barnardPooled });
      out.boschloo = boschlooExact(a, a + b, c, c + d, { alternative: o.alternative });
    } else {
      const skip = { p: NaN, skipped: `Groups of ${a + b} and ${c + d} are past the ${UNCONDITIONAL_LIMIT.toLocaleString("en-US")}-table limit for the unconditional tests; at this size they agree with the chi-square test.` };
      out.barnard = skip; out.boschloo = skip;
    }
    out.effects = effectSizes(table, confidence);
  } else {
    const ex = fisherRxC(table);
    out.fisherRxC = ex || fisherRxCMonteCarlo(table, { samples: Number(o.samples) || 20000, seed: Number(o.seed) || 1 });
  }
  if (mode === "stratified") {
    out.stratumLabels = stratumLabels || strata.map((_, k) => `Stratum ${k + 1}`);
    out.stratified = mantelHaenszel(strata, { correct: o.correct !== false && o.correct !== "false", confidence, alternative: o.alternative });
    out.stratified.strata.forEach((s, k) => { s.label = out.stratumLabels[k]; });
  }
  out.summary = summarize(out);
  return out;
}

function summarize(r) {
  const a = r.alpha;
  const sig = (p) => (p < a ? "significant" : "not significant");
  const lines = [];
  if (r.mode === "paired") {
    const m = r.mcnemar;
    lines.push(`McNemar's test on ${m.b + m.c} discordant pairs (${m.b} changed one way, ${m.c} the other): exact ${pIs(m.exactP)}, mid-${pIs(m.midP)} (exact ${sig(m.exactP)}, mid-p ${sig(m.midP)} at ${a}). Paired odds ratio ${fmt(m.oddsRatio)} (${Math.round(r.confidence * 100)}% CI ${fmt(m.ci[0])} to ${fmt(m.ci[1])}).`);
    if (m.b + m.c < 25) lines.push("With fewer than 25 discordant pairs, read the exact or mid-p value, not the chi-square.");
    for (const w of r.warnings || []) lines.push(w);
    return lines.join(" ");
  }
  if (r.rows === 2 && r.cols === 2) {
    const e = r.effects, f = r.fisher;
    lines.push(`${r.rowLabels[0]}: ${(e.risk1 * 100).toFixed(1)}% vs ${r.rowLabels[1]}: ${(e.risk2 * 100).toFixed(1)}% ${r.colLabels[0].toLowerCase()}.`);
    const unc = r.boschloo.skipped ? "" : `, Boschloo ${pIs(r.boschloo.p)}, Barnard ${pIs(r.barnard.p)}`;
    lines.push(`Fisher's exact ${pIs(f.p)}, mid-${pIs(f.midP)}${unc}${r.alternative !== "two-sided" ? ` (one-sided, ${r.alternative})` : ""}.`);
    const verdicts = [f.p, f.midP, r.boschloo.p, r.barnard.p].filter((p) => Number.isFinite(p)).map((p) => p < a);
    if (verdicts.every(Boolean)) lines.push(`Every exact test run calls the difference significant at ${a}.`);
    else if (!verdicts.some(Boolean)) lines.push(`No exact test run calls the difference significant at ${a}.`);
    else lines.push(`The tests disagree at ${a}: Fisher's exact test is conservative (its true error rate is below ${a}), so the mid-p and unconditional tests can reject where it does not.`);
    lines.push(`Risk difference ${(e.riskDifference.estimate * 100).toFixed(1)} points (Newcombe ${Math.round(r.confidence * 100)}% CI ${(e.riskDifference.newcombe[0] * 100).toFixed(1)} to ${(e.riskDifference.newcombe[1] * 100).toFixed(1)}); conditional odds ratio ${fmt(f.oddsRatio)} (exact CI ${fmt(f.ci[0])} to ${fmt(f.ci[1])}).`);
    if (r.chiSquare.cellsBelow5) lines.push(`${r.chiSquare.cellsBelow5} of 4 expected counts are below 5, so the chi-square p-value (${fmtP(r.chiSquare.p)}) is unreliable here.`);
  } else {
    const x = r.chiSquare, f = r.fisherRxC;
    lines.push(`${r.rows} x ${r.cols} table, n = ${r.n}: chi-square ${x.statistic.toFixed(2)} on ${x.df} df, ${pIs(x.p)}; Fisher-Freeman-Halton ${f.exact ? "exact" : `Monte Carlo (${f.samples} tables)`} ${pIs(f.p)} (${sig(f.p)} at ${a}). Cramér's V = ${fmt(x.cramerV)}.`);
    if (x.cellsBelow5) lines.push(`${x.cellsBelow5} of ${x.cells} expected counts are below 5; trust the exact p-value over the chi-square.`);
    let best = null;
    x.residuals.forEach((row, i) => row.forEach((v, j) => { if (!best || Math.abs(v) > Math.abs(best.v)) best = { v, i, j }; }));
    if (best && Math.abs(best.v) > 1.96) lines.push(`The largest adjusted residual is ${best.v.toFixed(2)} at ${r.rowLabels[best.i]} x ${r.colLabels[best.j]} (${best.v > 0 ? "more" : "fewer"} than independence predicts).`);
  }
  for (const w of r.warnings || []) lines.push(w);
  if (r.mode === "stratified") {
    const s = r.stratified;
    const crude = r.rows === 2 && r.cols === 2 ? r.effects.oddsRatio.estimate : NaN;
    lines.push(`Across ${s.strata.length} strata: Mantel-Haenszel common odds ratio ${fmt(s.commonOR.estimate)} (${Math.round(r.confidence * 100)}% CI ${fmt(s.commonOR.ci[0])} to ${fmt(s.commonOR.ci[1])}), CMH ${pIs(s.cmh.p)}, exact conditional ${pIs(s.exact.p)}.`);
    const adjustedFinite = Number.isFinite(s.commonOR.estimate) && s.commonOR.estimate > 0;
    if (!adjustedFinite) { /* a zero or infinite common odds ratio: no ratio to compare the crude one with */ }
    else if (Number.isFinite(crude) && (crude - 1) * (s.commonOR.estimate - 1) < 0) lines.push(`The pooled table points the other way (crude odds ratio ${fmt(crude)}): Simpson's paradox: adjusted for the strata, the odds ratio falls on the other side of 1.`);
    else if (Number.isFinite(crude) && Math.abs(Math.log(crude / s.commonOR.estimate)) > Math.log(1.25)) lines.push(`The crude odds ratio (${fmt(crude)}) differs from the adjusted one by more than 25%: the strata confound the pooled table.`);
    if (s.breslowDay.taroneP < a) lines.push(`Breslow-Day-Tarone ${pIs(s.breslowDay.taroneP)}: the strata do not share one odds ratio, so read the per-stratum odds ratios, not just the common one.`);
  }
  return lines.join(" ");
}

// ---------- text report (CLI and the page's download) ----------

const fp = (p) => (!Number.isFinite(p) ? "—" : p < 0.0001 ? "< 0.0001" : p.toFixed(4));
const ci = (v) => `${fmt(v[0])} to ${fmt(v[1])}`;

/** Every test as rows {group, name, statistic, p, note} for tables and the report. */
export function testRows(r) {
  const rows = [];
  if (r.mode === "paired") {
    const m = r.mcnemar;
    rows.push({ group: "Paired", name: "McNemar exact (binomial)", statistic: `${m.b} vs ${m.c}`, p: m.exactP });
    rows.push({ group: "Paired", name: "McNemar mid-p", statistic: "", p: m.midP });
    rows.push({ group: "Paired", name: "McNemar chi-square", statistic: m.chi2.toFixed(3), p: m.chi2P });
    rows.push({ group: "Paired", name: "McNemar chi-square, continuity-corrected", statistic: m.corrected.toFixed(3), p: m.correctedP });
    return rows;
  }
  const x = r.chiSquare;
  if (r.rows === 2 && r.cols === 2) {
    rows.push({ group: "Exact, conditional", name: "Fisher's exact test", statistic: `P(table) = ${fmt(r.fisher.pObserved)}`, p: r.fisher.p });
    rows.push({ group: "Exact, conditional", name: "Fisher mid-p", statistic: "", p: r.fisher.midP });
    if (!r.boschloo.skipped) {
      rows.push({ group: "Exact, unconditional", name: "Boschloo's test", statistic: `Fisher p = ${fmt(r.boschloo.statistic)}`, p: r.boschloo.p, note: `nuisance maximised at π = ${fmt(r.boschloo.pi)}` });
      rows.push({ group: "Exact, unconditional", name: `Barnard's test (${r.barnardPooled === false ? "unpooled" : "pooled"} Wald)`, statistic: `z = ${fmt(r.barnard.statistic)}`, p: r.barnard.p, note: `nuisance maximised at π = ${fmt(r.barnard.pi)}` });
    }
    rows.push({ group: "Asymptotic", name: "Pearson chi-square", statistic: `${x.statistic.toFixed(3)} (1 df)`, p: r.alternative === "two-sided" ? x.p : NaN, note: r.alternative === "two-sided" ? "" : "two-sided only" });
    rows.push({ group: "Asymptotic", name: "Yates-corrected chi-square", statistic: `${r.yates.statistic.toFixed(3)} (1 df)`, p: r.alternative === "two-sided" ? r.yates.p : NaN });
    rows.push({ group: "Asymptotic", name: "Likelihood-ratio G", statistic: `${x.g.toFixed(3)} (1 df)`, p: r.alternative === "two-sided" ? x.gP : NaN });
  } else {
    const f = r.fisherRxC;
    rows.push({ group: "Exact, conditional", name: `Fisher-Freeman-Halton${f.exact ? "" : " (Monte Carlo)"}`, statistic: f.exact ? `P(table) = ${fmt(f.pObserved)}` : `${f.samples} tables, ± ${fmt(1.96 * f.se)}`, p: f.p });
    rows.push({ group: "Asymptotic", name: "Pearson chi-square", statistic: `${x.statistic.toFixed(3)} (${x.df} df)`, p: x.p });
    rows.push({ group: "Asymptotic", name: "Likelihood-ratio G", statistic: `${x.g.toFixed(3)} (${x.df} df)`, p: x.gP });
  }
  if (r.mode === "stratified") {
    const s = r.stratified;
    rows.push({ group: "Stratified", name: `Cochran-Mantel-Haenszel${s.cmh.corrected ? ", continuity-corrected" : ""}`, statistic: `${s.cmh.statistic.toFixed(3)} (1 df)`, p: s.cmh.p });
    rows.push({ group: "Stratified", name: "Exact conditional (stratified Fisher)", statistic: `S = ${s.exact.statistic}`, p: s.exact.p });
    rows.push({ group: "Stratified", name: "Breslow-Day, Tarone-corrected (equal odds ratios)", statistic: `${fmt(s.breslowDay.tarone)} (${s.breslowDay.df} df)`, p: s.breslowDay.taroneP });
  }
  return rows;
}

/** Plain-text report of an analyze() result. */
export function report(r) {
  const L = [];
  const pct = Math.round(r.confidence * 100);
  L.push(r.summary, "");
  const w = Math.max(...r.rowLabels.map((s) => s.length), 6);
  L.push(["".padEnd(w), ...r.colLabels.map((c) => c.padStart(10))].join("  "));
  r.table.forEach((row, i) => L.push([r.rowLabels[i].padEnd(w), ...row.map((v) => String(v).padStart(Math.max(10, r.colLabels[0].length)))].join("  ")));
  L.push("");
  for (const t of testRows(r)) L.push(`${t.name.padEnd(52)} ${String(t.statistic).padEnd(26)} p ${fp(t.p)}${t.note ? `  (${t.note})` : ""}`);
  if (r.effects) {
    const e = r.effects;
    L.push("", `Risks: ${(e.risk1 * 100).toFixed(2)}% vs ${(e.risk2 * 100).toFixed(2)}%`);
    L.push(`Risk difference ${fmt(e.riskDifference.estimate)}  Newcombe ${pct}% CI ${ci(e.riskDifference.newcombe)}  Wald ${ci(e.riskDifference.wald)}`);
    L.push(`Risk ratio ${fmt(e.riskRatio.estimate)}  ${pct}% CI ${ci(e.riskRatio.ci)}${e.riskRatio.corrected ? "  (0.5 added to every cell)" : ""}`);
    L.push(`Odds ratio ${fmt(e.oddsRatio.estimate)}  Woolf ${pct}% CI ${ci(e.oddsRatio.ci)}${e.oddsRatio.corrected ? "  (0.5 added to every cell)" : ""}`);
    L.push(`Conditional MLE odds ratio ${fmt(r.fisher.oddsRatio)}  exact ${pct}% CI ${ci(r.fisher.ci)}`);
    L.push(`Phi ${fmt(e.phi)}  NNT ${fmt(e.nnt)}`);
  }
  if (r.mcnemar) L.push("", `Paired odds ratio (b/c) ${fmt(r.mcnemar.oddsRatio)}  exact ${pct}% CI ${ci(r.mcnemar.ci)}`);
  if (r.chiSquare && !(r.rows === 2 && r.cols === 2)) L.push("", `Cramér's V ${fmt(r.chiSquare.cramerV)}; smallest expected count ${fmt(r.chiSquare.minExpected)}`);
  if (r.stratified) {
    const s = r.stratified;
    L.push("", `Mantel-Haenszel common odds ratio ${fmt(s.commonOR.estimate)}  ${pct}% CI ${ci(s.commonOR.ci)} (Robins-Breslow-Greenland)`);
    L.push(`Conditional MLE common odds ratio ${fmt(s.exact.oddsRatio)}  exact ${pct}% CI ${ci(s.exact.ci)}`);
    for (const t of s.strata) L.push(`  ${String(t.label).padEnd(14)} ${JSON.stringify(t.table).padEnd(28)} odds ratio ${fmt(t.oddsRatio)}`);
  }
  L.push("", "Statistical estimates from the counts you supplied, not legal, tax, financial or medical advice. No warranty.");
  return L.join("\n");
}
