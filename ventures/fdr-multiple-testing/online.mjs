// Online false discovery rate control: tests arrive one at a time, and each
// must be kept or dropped before the next arrives, without knowing how many
// will come. The batch procedures in engine.mjs (Benjamini-Hochberg and the
// rest) need the whole list first; these do not.
//
// Implemented from the papers' definitions (no third-party code ported):
//   LOND          Javanmard & Montanari (2018), Annals of Statistics 46(2)
//   LORD++        Ramdas, Yang, Wainwright & Jordan (2017), NeurIPS 30
//   SAFFRON       Ramdas, Zrnic, Wainwright & Jordan (2018), ICML, PMLR 80
//   alpha-spending (online Bonferroni), the FWER baseline
// Every test level alpha_t depends only on the p-values before t, so an
// earlier decision never changes when a later p-value arrives (asserted in
// online.test.mjs). Pure functions, no DOM, no network, no randomness.

export const ONLINE_PAPERS = [
  {
    authors: "Adel Javanmard, Andrea Montanari",
    title: "Online Rules for Control of False Discovery Rate and False Discovery Exceedance",
    venue: "Annals of Statistics 46(2), 526-554",
    year: 2018,
    url: "https://doi.org/10.1214/17-AOS1559",
    doi: "10.1214/17-AOS1559",
    implemented: "LOND: test t at level alpha_t = alpha gamma_t (D(t-1) + 1), with D(t-1) the discoveries so far. The gamma sequence gamma_j = c log(max(j, 2)) / (j exp(sqrt(log j))) is the one the paper proposes for LORD; it is used here for LOND, LORD++ and alpha-spending.",
    deviations: "LORD 1, 2 and 3 and the false discovery exceedance rules are not implemented; LORD++ (below) supersedes LORD 1 and 2. The dependent-test variants are not offered.",
  },
  {
    authors: "Aaditya Ramdas, Fanny Yang, Martin J. Wainwright, Michael I. Jordan",
    title: "Online control of the false discovery rate with decaying memory",
    venue: "Advances in Neural Information Processing Systems 30 (NeurIPS 2017), 5650-5659",
    year: 2017,
    url: "https://arxiv.org/abs/1710.00499",
    doi: null,
    implemented: "LORD++: alpha_t = gamma_t W0 + (alpha - W0) gamma_(t - tau_1) + alpha sum over later rejections j of gamma_(t - tau_j), with tau_j the time of the j-th rejection and initial wealth W0 <= alpha.",
    deviations: "Decaying memory, penalty weights, prior weights and the abstinence (mem-LORD) variants are not implemented.",
  },
  {
    authors: "Aaditya Ramdas, Tijana Zrnic, Martin J. Wainwright, Michael I. Jordan",
    title: "SAFFRON: an adaptive algorithm for online control of the false discovery rate",
    venue: "Proceedings of the 35th International Conference on Machine Learning (ICML 2018), PMLR 80, 4286-4294",
    year: 2018,
    url: "https://proceedings.mlr.press/v80/ramdas18a.html",
    doi: null,
    implemented: "SAFFRON (Algorithm 1): a p-value at or below lambda is a candidate; alpha_t = min(lambda, W0 gamma_(t - C_0+) + ((1 - lambda) alpha - W0) gamma_(t - tau_1 - C_1+) + (1 - lambda) alpha sum over later rejections j of gamma_(t - tau_j - C_j+)), with C_j+ the candidates after the j-th rejection and before t, W0 <= (1 - lambda) alpha, and gamma_j proportional to j^(-1.6).",
    deviations: "Only a constant candidate threshold lambda; the time-varying lambda_t and alpha-investing variant are not implemented.",
  },
];

// gamma_j = c log(max(j,2)) / (j exp(sqrt(log j))), Javanmard & Montanari (2018).
// c = 0.07720838 is the constant the online-fdr Python package (1.0.0)
// uses. The series converges very slowly; summed to infinity (partial sum to
// 10^7 plus the closed-form integral tail, online.test.mjs) this c gives
// sum gamma = 0.9763, not 1, so the rules spend about 97.6% of the budget:
// valid (the proofs need sum <= 1) and slightly conservative. The constant
// that sums to exactly 1 is 0.0790819667.
export const LORD_GAMMA_C = 0.07720838;
export const lordGamma = (j) => (j < 1 ? 0 : (LORD_GAMMA_C * Math.log(Math.max(j, 2))) / (j * Math.exp(Math.sqrt(Math.log(j)))));
// gamma_j = j^(-1.6) / zeta(1.6), the SAFFRON paper's choice; 1/zeta(1.6) from scipy.special.zeta.
export const SAFFRON_GAMMA_C = 0.4374901657744737;
export const saffronGamma = (j) => (j < 1 ? 0 : SAFFRON_GAMMA_C / Math.pow(j, 1.6));

export const ONLINE_DEFAULTS = { alpha: 0.05, method: "lordpp", w0Share: 0.5, lambda: 0.5 };

export const ONLINE_METHODS = [
  { id: "lordpp", name: "LORD++", controls: "FDR", assumption: "independent tests", paper: "Ramdas, Yang, Wainwright & Jordan (2017)" },
  { id: "saffron", name: "SAFFRON", controls: "FDR", assumption: "independent tests", paper: "Ramdas, Zrnic, Wainwright & Jordan (2018)" },
  { id: "lond", name: "LOND", controls: "FDR", assumption: "independent tests", paper: "Javanmard & Montanari (2018)" },
  { id: "spending", name: "Alpha-spending (online Bonferroni)", controls: "FWER", assumption: "any dependence", paper: "Bonferroni over a summable sequence" },
];

/** Alpha-spending: alpha_t = alpha gamma_t; the levels sum to at most alpha, so FWER <= alpha under any dependence. */
export function spending(p, alpha) {
  const level = p.map((_, i) => alpha * lordGamma(i + 1));
  return { level, reject: p.map((x, i) => x <= level[i]) };
}

/** LOND: alpha_t = alpha gamma_t (D(t-1) + 1). */
export function lond(p, alpha) {
  const level = [], reject = [];
  let D = 0;
  for (let t = 1; t <= p.length; t++) {
    const a = alpha * lordGamma(t) * (D + 1);
    level.push(a);
    const r = p[t - 1] <= a;
    reject.push(r);
    if (r) D++;
  }
  return { level, reject };
}

/** LORD++ with initial wealth w0 (0 < w0 <= alpha). Also returns the wealth after each test. */
export function lordpp(p, alpha, w0 = alpha / 2) {
  const level = [], reject = [], wealth = [];
  const taus = [];
  let W = w0;
  for (let t = 1; t <= p.length; t++) {
    let a = w0 * lordGamma(t);
    if (taus.length) a += (alpha - w0) * lordGamma(t - taus[0]);
    for (let j = 1; j < taus.length; j++) a += alpha * lordGamma(t - taus[j]);
    level.push(a);
    const r = p[t - 1] <= a;
    reject.push(r);
    W -= a;
    if (r) { W += taus.length ? alpha : alpha - w0; taus.push(t); }
    wealth.push(W);
  }
  return { level, reject, wealth };
}

/** SAFFRON with candidate threshold lambda and initial wealth w0 (0 < w0 <= (1 - lambda) alpha). */
export function saffron(p, alpha, lambda = 0.5, w0 = ((1 - lambda) * alpha) / 2) {
  const level = [], reject = [], candidate = [];
  const taus = [];
  // cand[i] = number of candidates among tests 1..i (cand[0] = 0)
  const cand = [0];
  for (let t = 1; t <= p.length; t++) {
    const before = cand[t - 1]; // candidates among 1..t-1
    let a = w0 * saffronGamma(t - before);
    taus.forEach((tau, j) => {
      const after = before - cand[tau]; // candidates in tau+1..t-1
      a += (j === 0 ? (1 - lambda) * alpha - w0 : (1 - lambda) * alpha) * saffronGamma(t - tau - after);
    });
    a = Math.min(lambda, a);
    level.push(a);
    const x = p[t - 1];
    const c = x <= lambda;
    candidate.push(c);
    cand.push(before + (c ? 1 : 0));
    const r = x <= a;
    reject.push(r);
    if (r) taus.push(t);
  }
  return { level, reject, candidate };
}

/**
 * Run every online rule on one ordered list of p-values.
 * opts: { alpha, w0Share (initial wealth as a share of its maximum, 0 < s <= 1), lambda (SAFFRON) }
 */
export function runOnline(p, opts = {}) {
  const alpha = opts.alpha ?? ONLINE_DEFAULTS.alpha;
  const share = opts.w0Share ?? ONLINE_DEFAULTS.w0Share;
  const lambda = opts.lambda ?? ONLINE_DEFAULTS.lambda;
  return {
    lordpp: lordpp(p, alpha, share * alpha),
    saffron: saffron(p, alpha, lambda, share * (1 - lambda) * alpha),
    lond: lond(p, alpha),
    spending: spending(p, alpha),
  };
}
