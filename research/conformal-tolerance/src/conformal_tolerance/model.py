"""Split-conformal calibration of a drift tolerance.

Calibrate on n honest drift scores X_1..X_n (exchangeable, continuous).  The tolerance is the k-th order
statistic t = X_(k); a fresh honest score is slashed iff it exceeds t.  Ranks are uniform, so everything
about the false-slash law depends only on (n, k) and not on the drift distribution.
"""
import math, random, struct

__all__ = ["cal_index", "marginal_fpr", "pac_prob", "pac_index", "min_n_pac", "cond_fpr_var",
           "conformal_threshold", "pareto_sample", "lognormal_sf", "gauss_plugin_fpr_lognormal",
           "pareto_inflation", "pooled_threshold", "shifted_fpr", "f32", "honest_residual", "z_quantile"]


def cal_index(n, alpha):
    """standard split-conformal rank k = ceil((n+1)(1-alpha)); k > n means the threshold is +inf."""
    return math.ceil((n + 1) * (1 - alpha))


def marginal_fpr(n, k):
    """P(fresh honest score > X_(k)) = (n+1-k)/(n+1), exactly, for any continuous distribution."""
    return (n + 1 - k) / (n + 1)


def pac_prob(n, k, alpha):
    """P over the calibration set that the conditional false-slash rate 1-F(X_(k)) is <= alpha.
    1-F(X_(k)) ~ 1-Beta(k, n+1-k); U_(k) >= 1-alpha iff Bin(n, 1-alpha) <= k-1."""
    top = min(k - 1, n)
    if top < 0:
        return 0.0
    if top >= n:
        return 1.0
    la, lq = math.log(alpha), math.log(1 - alpha)
    tot = 0.0
    for j in range(0, top + 1):
        lg = math.lgamma(n + 1) - math.lgamma(j + 1) - math.lgamma(n - j + 1)
        tot += math.exp(lg + j * lq + (n - j) * la)
    return min(tot, 1.0)


def pac_index(n, alpha, delta):
    """smallest rank k whose conditional false-slash rate is <= alpha w.p. >= 1-delta; None if even k=n fails."""
    if pac_prob(n, n, alpha) < 1 - delta:
        return None
    lo, hi = 1, n                       # pac_prob is nondecreasing in k
    while lo < hi:
        mid = (lo + hi) // 2
        if pac_prob(n, mid, alpha) >= 1 - delta:
            hi = mid
        else:
            lo = mid + 1
    return lo


def min_n_pac(alpha, delta):
    """fewest calibration runs for any finite PAC tolerance: threshold = sample max, 1-(1-alpha)^n >= 1-delta."""
    return math.ceil(math.log(delta) / math.log(1 - alpha))


def cond_fpr_var(n, k):
    """variance over calibration sets of the conditional false-slash rate (Beta(n+1-k, k))."""
    a, b = n + 1 - k, k
    return a * b / ((a + b) ** 2 * (a + b + 1))


def conformal_threshold(scores, k):
    s = sorted(scores)
    return s[k - 1] if k <= len(s) else math.inf


def pareto_sample(a, rng):
    return (1 - rng.random()) ** (-1 / a)


def lognormal_sf(t, mu, s):
    """P(LN(mu, s) > t)"""
    return 0.5 * math.erfc((math.log(t) - mu) / (s * math.sqrt(2)))


def z_quantile(p):
    lo, hi = -10.0, 10.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if 0.5 * (1 + math.erf(mid / math.sqrt(2))) < p:
            lo = mid
        else:
            hi = mid
    return lo


def gauss_plugin_fpr_lognormal(alpha, s):
    """Fit a normal to lognormal(0, s) drift by its exact mean and sd, set t = mean + z_{1-alpha} sd;
    return the true false-slash rate of that threshold (no sampling noise)."""
    mean = math.exp(s * s / 2)
    sd = math.sqrt((math.exp(s * s) - 1) * math.exp(s * s))
    t = mean + z_quantile(1 - alpha) * sd
    return lognormal_sf(t, 0.0, s)


def pareto_inflation(n, alpha, delta, a):
    """Threshold of the PAC rank relative to the true (1-alpha)-quantile for Pareto(a) drift, using the
    nominal tail mass w=(n+1-k)/(n+1) of the PAC rank: (w/alpha)^(-1/a) >= 1 is the hiding-room factor."""
    k = pac_index(n, alpha, delta)
    if k is None:
        return math.inf
    w = (n + 1 - k) / (n + 1)
    return (w / alpha) ** (-1 / a)


def pooled_threshold(pis, mus, s, alpha):
    """t with sum_h pi_h P(LN(mu_h, s) > t) = alpha (pooled calibration over hardware classes)."""
    lo, hi = 1e-9, 1e9
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if sum(p * lognormal_sf(mid, m, s) for p, m in zip(pis, mus)) > alpha:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


def shifted_fpr(t, mu, s, c):
    """false-slash rate after drift is silently scaled by c (e.g. a driver update): P(c X > t)."""
    return lognormal_sf(t / c, mu, s)


def f32(x):
    return struct.unpack("f", struct.pack("f", x))[0]


def _matvec32(A, x):
    out = []
    for row in A:
        s = 0.0
        for a, b in zip(row, x):
            s = f32(s + f32(a * b))
        out.append(s)
    return out


def honest_residual(n, rng):
    """||A(Br) - Cr|| in emulated float32 (sequential accumulation) for an honest n x n product."""
    sc = 1 / math.sqrt(n)
    A = [[f32(rng.gauss(0, sc)) for _ in range(n)] for _ in range(n)]
    B = [[f32(rng.gauss(0, sc)) for _ in range(n)] for _ in range(n)]
    Bt = list(zip(*B))
    C = []
    for row in A:
        crow = []
        for col in Bt:
            s = 0.0
            for a, b in zip(row, col):
                s = f32(s + f32(a * b))
            crow.append(s)
        C.append(crow)
    r = [f32(rng.gauss(0, 1)) for _ in range(n)]
    d = [a - b for a, b in zip(_matvec32(A, _matvec32(B, r)), _matvec32(C, r))]
    return math.sqrt(sum(v * v for v in d))
