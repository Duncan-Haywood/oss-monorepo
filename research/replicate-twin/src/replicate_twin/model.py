"""Replication-deletion for a digital-twin run with an initial transient.  A fixed budget of N twin draws is split into r
independent replications of n = N/r draws, each started at offset `delta` from steady state (AR(1), autocorrelation phi) and
each with its first d draws deleted.  Replication means are iid Gaussian, so the MSE of the grand mean and the coverage of the
Student-t interval built from them are EXACT (noncentral-t integral), not simulated."""
import math, random

__all__ = ["ar1_bias", "ar1_var", "rep_mse", "best_d", "t_cdf", "t_quant", "coverage", "half_width", "min_d_valid",
           "ar1_from", "rep_ci", "batch_ci", "mm1_waits", "mm1_wait_mean"]


def ar1_bias(n, phi, delta, d=0):
    """E[mean of draws d..n-1] - mu for an AR(1) whose draw 0 is mu+delta: delta phi^d (1-phi^m)/(m(1-phi)), m = n-d."""
    m = n - d
    if phi == 1.0:
        return delta
    return delta * phi ** d * (1.0 - phi ** m) / (m * (1.0 - phi))


def ar1_var(n, phi, d=0, s2=1.0):
    """Exact Var of the mean of draws d..n-1 from the fixed start (marginal variance s2)."""
    m = n - d
    if phi == 0.0:
        return s2 / m
    a = 1.0 - phi
    stat = m + 2.0 * phi * (m * a - (1.0 - phi ** m)) / (a * a)   # sum_{k<m}(m-k)phi^k in closed form
    tail = phi ** d * (1.0 - phi ** m) / a
    return s2 / (m * m) * (stat - tail * tail)


def rep_mse(N, r, phi, delta, d, s2=1.0):
    """Exact MSE of the grand mean of r iid replications of n = N//r draws each, first d deleted from each."""
    n = N // r
    if d >= n:
        return float("inf")
    return ar1_bias(n, phi, delta, d) ** 2 + ar1_var(n, phi, d, s2) / r


def best_d(N, r, phi, delta, s2=1.0, dmax=None):
    """(d, mse) minimising the exact MSE over d = 0..dmax (default n-2)."""
    n = N // r
    dmax = n - 2 if dmax is None else min(dmax, n - 2)
    d = min(range(dmax + 1), key=lambda k: rep_mse(N, r, phi, delta, k, s2))
    return d, rep_mse(N, r, phi, delta, d, s2)


def _betacf(a, b, x):
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = tiny if abs(d) < tiny else d
    d = 1.0 / d
    h = d
    for m in range(1, 400):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d; d = tiny if abs(d) < tiny else d
        c = 1.0 + aa / c; c = tiny if abs(c) < tiny else c
        d = 1.0 / d; h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d; d = tiny if abs(d) < tiny else d
        c = 1.0 + aa / c; c = tiny if abs(c) < tiny else c
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < 1e-15:
            break
    return h


def _betai(a, b, x):
    """Regularised incomplete beta I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbt = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1.0 - x)
    if x < (a + 1.0) / (a + b + 2.0):
        return math.exp(lbt) * _betacf(a, b, x) / a
    return 1.0 - math.exp(lbt) * _betacf(b, a, 1.0 - x) / b


def t_cdf(t, df):
    x = df / (df + t * t)
    tail = 0.5 * _betai(df / 2.0, 0.5, x)
    return 1.0 - tail if t > 0 else tail


def t_quant(p, df):
    """Student-t quantile by bisection on t_cdf."""
    lo, hi = 0.0, 1.0
    while t_cdf(hi, df) < p:
        hi *= 2.0
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if t_cdf(mid, df) < p else (lo, mid)
    return 0.5 * (lo + hi)


def _phi(z):
    return 0.5 * math.erfc(-z / math.sqrt(2.0))


def coverage(N, r, phi, delta, d, level=0.95, s2=1.0, pts=2000):
    """EXACT coverage of the two-sided Student-t interval from r iid replication means.  With Z=(xbar-mu)/sd(xbar) ~ N(lam,1),
    lam = bias sqrt(r)/sd_rep, and S^2/sd_rep^2 ~ chi2_{r-1}/(r-1) independent, the interval covers iff |Z| <= t sqrt(Q/(r-1)),
    Q ~ chi2_{r-1}; integrated over Q by Simpson in w=sqrt(Q)."""
    n = N // r
    k = r - 1
    t = t_quant(0.5 + level / 2.0, k)
    lam = ar1_bias(n, phi, delta, d) * math.sqrt(r) / math.sqrt(ar1_var(n, phi, d, s2))
    wmax = math.sqrt(k + 14.0 * math.sqrt(2.0 * k) + 40.0)
    h = wmax / pts
    lc = -(k / 2.0) * math.log(2.0) - math.lgamma(k / 2.0)

    def f(w):
        if w == 0.0:
            return 0.0 if k > 1 else math.exp(lc) * 2.0 * (_phi(0.0 - lam) - _phi(-0.0 - lam))
        q = w * w
        dens = math.exp(lc + (k / 2.0 - 1.0) * math.log(q) - q / 2.0) * 2.0 * w
        c = t * w / math.sqrt(k)
        return dens * (_phi(c - lam) - _phi(-c - lam))
    tot = f(0.0) + f(wmax)
    for i in range(1, pts):
        tot += (4 if i % 2 else 2) * f(i * h)
    return tot * h / 3.0


def half_width(N, r, phi, d, level=0.95, s2=1.0):
    """Exact mean half-width t sqrt(Var_rep/r) E[sqrt(Q/(r-1))], E sqrt(chi2_k/k) = sqrt(2/k) G((k+1)/2)/G(k/2)."""
    n = N // r
    k = r - 1
    t = t_quant(0.5 + level / 2.0, k)
    es = math.sqrt(2.0 / k) * math.exp(math.lgamma((k + 1) / 2.0) - math.lgamma(k / 2.0))
    return t * math.sqrt(ar1_var(n, phi, d, s2) / r) * es


def min_d_valid(N, r, phi, delta, level=0.95, floor=0.94, s2=1.0):
    """Smallest d whose exact coverage is >= floor (None if none below n-1 does).  Doubling then bisection: assumes coverage
    is nondecreasing in d over the range searched (checked on the tables in experiments/run.py)."""
    n = N // r
    ok = lambda d: coverage(N, r, phi, delta, d, level, s2) >= floor
    if ok(0):
        return 0
    hi = 1
    while hi < n - 2 and not ok(hi):
        hi *= 2
    hi = min(hi, n - 2)
    if not ok(hi):
        return None
    lo = 0
    while hi - lo > 1:
        mid = (lo + hi) // 2
        lo, hi = (lo, mid) if ok(mid) else (mid, hi)
    return hi


def ar1_from(phi, n, rng, delta, s2=1.0):
    innov = math.sqrt(s2 * (1.0 - phi * phi))
    x, out = delta, []
    for _ in range(n):
        out.append(x)
        x = phi * x + rng.gauss(0.0, innov)
    return out


def rep_ci(means, t):
    """(grand mean, half-width) of a t interval from iid replication means."""
    r = len(means)
    m = sum(means) / r
    sd = math.sqrt(sum((x - m) ** 2 for x in means) / (r - 1))
    return m, t * sd / math.sqrt(r)


def batch_ci(xs, t, b=30):
    """Batch-means interval from b contiguous batches of one run."""
    L = len(xs) // b
    return rep_ci([sum(xs[i * L:(i + 1) * L]) / L for i in range(b)], t)


def mm1_waits(rho, n, rng, start=0.0):
    w, out = start, []
    for _ in range(n):
        out.append(w)
        w = max(0.0, w + rng.expovariate(1.0) - rng.expovariate(rho))
    return out


def mm1_wait_mean(rho):
    return rho / (1.0 - rho)
