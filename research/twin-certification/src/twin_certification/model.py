"""Certify "real failure probability p < eps" from n real trials with k failures, with a digital twin supplying a Beta prior.
Bayesian rule: certify iff P(p >= eps | k, n) <= delta. The posterior exceedance is increasing in k, so the rule is
"certify iff k <= c" for a threshold c. For k ~ Bin(n, p) the family is monotone in p, so the worst-case false-certification
probability over the composite null p >= eps is exactly P(Bin(n, eps) <= c) (attained at p = eps), and by Karlin-Rubin the
size-delta test with the most power is c* = the largest c with P(Bin(n, eps) <= c) <= delta: no prior can beat it validly."""
import math

__all__ = ["betainc", "binom_cdf", "prior", "power_prior", "post_exceed", "c_bayes", "c_freq", "n_zero_freq", "n_zero_bayes",
           "false_cert", "power", "n_for_power", "max_weight", "prior_false_cert"]


def _lbeta(a, b):
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def _cf(a, b, x):
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, 5000):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d; d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / c; c = c if abs(c) > tiny else tiny
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d; d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / c; c = c if abs(c) > tiny else tiny
        de = d * c
        h *= de
        if abs(de - 1.0) < 1e-15:
            break
    return h


def betainc(a, b, x):
    """Regularised incomplete beta I_x(a, b) (continued fraction)."""
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    bt = math.exp(a * math.log(x) + b * math.log1p(-x) - _lbeta(a, b))
    if x < (a + 1) / (a + b + 2):
        return bt * _cf(a, b, x) / a
    return 1.0 - bt * _cf(b, a, 1.0 - x) / b


def binom_cdf(k, n, p):
    """P(Bin(n,p) <= k), exact log-space sum."""
    if k < 0: return 0.0
    if k >= n: return 1.0
    if p <= 0: return 1.0
    if p >= 1: return 0.0
    lp, lq = math.log(p), math.log1p(-p)
    terms = [math.lgamma(n + 1) - math.lgamma(j + 1) - math.lgamma(n - j + 1) + j * lp + (n - j) * lq for j in range(k + 1)]
    m = max(terms)
    return min(1.0, math.exp(m) * sum(math.exp(t - m) for t in terms))


def prior(p_twin, m):
    """Beta prior with mean p_twin worth m pseudo-trials."""
    return m * p_twin, m * (1.0 - p_twin)


def power_prior(f, n_sim, w):
    """Power prior: Jeffreys prior updated with f failures in n_sim twin rollouts, each discounted to weight w real trials."""
    return 0.5 + w * f, 0.5 + w * (n_sim - f)


def post_exceed(a, b, n, k, eps):
    """P(p >= eps | k failures in n trials) under a Beta(a, b) prior."""
    return 1.0 - betainc(a + k, b + n - k, eps)


def c_bayes(n, a, b, eps, delta):
    """Largest k with post_exceed <= delta (-1 if none)."""
    if post_exceed(a, b, n, 0, eps) > delta: return -1
    lo, hi = 0, n
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if post_exceed(a, b, n, mid, eps) <= delta: lo = mid
        else: hi = mid - 1
    return lo


def c_freq(n, eps, delta):
    """Largest c with P(Bin(n, eps) <= c) <= delta (-1 if none): the exact size-delta test."""
    if binom_cdf(0, n, eps) > delta: return -1
    lo, hi = 0, n
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if binom_cdf(mid, n, eps) <= delta: lo = mid
        else: hi = mid - 1
    return lo


def n_zero_freq(eps, delta):
    """Zero-failure sample size ceil(ln delta / ln(1-eps))."""
    return math.ceil(math.log(delta) / math.log1p(-eps))


def n_zero_bayes(a, b, eps, delta):
    """Smallest n at which zero failures certify under the Beta(a, b) prior."""
    lo, hi = 0, 1
    while post_exceed(a, b, hi, 0, eps) > delta: hi *= 2
    while lo < hi:
        mid = (lo + hi) // 2
        if post_exceed(a, b, mid, 0, eps) <= delta: hi = mid
        else: lo = mid + 1
    return lo


def false_cert(n, c, eps):
    """Worst-case (over p >= eps) probability of certifying with threshold c: exactly P(Bin(n, eps) <= c)."""
    return binom_cdf(c, n, eps)


def power(n, c, p):
    """Probability of certifying when the real failure probability is p."""
    return binom_cdf(c, n, p)


def n_for_power(rule, p, target, nmax=200000):
    """Smallest n with power >= target; rule(n) returns the threshold c."""
    lo, hi = 1, 1
    while hi < nmax and power(hi, rule(hi), p) < target: hi *= 2
    while lo < hi:
        mid = (lo + hi) // 2
        if power(mid, rule(mid), p) >= target: hi = mid
        else: lo = mid + 1
    return lo


def max_weight(f, n_sim, eps, delta, n, tol):
    """Largest twin weight w in [0, 1] whose worst-case size at sample size n is <= tol (bisection; size is
    nondecreasing in w when the twin is more optimistic than eps). Returns 0 if even w=0 (Jeffreys) exceeds tol."""
    def size(w):
        a, b = power_prior(f, n_sim, w)
        return false_cert(n, c_bayes(n, a, b, eps, delta), eps)
    if size(1.0) <= tol: return 1.0
    if size(0.0) > tol: return 0.0
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if size(mid) <= tol: lo = mid
        else: hi = mid
    return lo


def prior_false_cert(n, c, a, b, eps):
    """P(certify and p >= eps) with p drawn from the Beta(a, b) prior: sum over k <= c of the beta-binomial mass times
    the posterior exceedance. Bounded by delta when c = c_bayes(n, a, b, eps, delta)."""
    tot = 0.0
    for k in range(c + 1):
        lm = (math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
              + _lbeta(a + k, b + n - k) - _lbeta(a, b))
        tot += math.exp(lm) * post_exceed(a, b, n, k, eps)
    return tot
