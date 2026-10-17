"""Fork-join workcell: W minutes of work are split over k parallel stations, each branch takes a random
Gamma(shape kappa) time with mean W/k, one shared arm pays a per-branch handover a (serial), and the batch
finishes when the slowest branch does.  The deterministic twin sees only the branch means."""
import math, random

__all__ = ["gamma_cdf", "emax", "twin_cost", "real_cost", "argmin_k", "promise_prob", "mc_cost",
           "fit_kappa", "continuous_condition", "regret", "quantile_x", "EmaxTable", "chain_cost"]


def gamma_cdf(kappa, x):
    """Regularised lower incomplete gamma P(kappa, x) (series / continued fraction)."""
    if x <= 0:
        return 0.0
    lg = math.lgamma(kappa)
    if x < kappa + 1:
        s, t, n = 1.0 / kappa, 1.0 / kappa, kappa
        for _ in range(10000):
            n += 1
            t *= x / n
            s += t
            if t < s * 1e-16:
                break
        return s * math.exp(-x + kappa * math.log(x) - lg)
    tiny = 1e-300
    b = x + 1 - kappa
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, 10000):
        an = -i * (i - kappa)
        b += 2
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1 / d
        de = d * c
        h *= de
        if abs(de - 1) < 1e-16:
            break
    return 1 - math.exp(-x + kappa * math.log(x) - lg) * h


def emax(k, kappa, steps=4000):
    """E[max of k iid Gamma(shape kappa, mean 1)] = int_0^inf 1 - F(x)^k dx (composite Simpson on [0, X])."""
    if k == 1:
        return 1.0
    sd = kappa ** -0.5
    X = 1.0 + sd * (8.0 + 2.0 * math.sqrt(2 * math.log(k))) + 20.0 * (sd ** 2) * math.log(k + 1) / max(1.0, kappa ** 0.5)
    X = max(X, 12.0 / kappa + 2.0) if kappa < 1 else X
    h = X / steps
    f = lambda x: 1.0 - gamma_cdf(kappa, kappa * x) ** k
    s = f(0) + f(X)
    for i in range(1, steps):
        s += (4 if i % 2 else 2) * f(i * h)
    return s * h / 3


def twin_cost(k, W, a):
    return W / k + a * k


def real_cost(k, W, a, kappa):
    return W / k * emax(k, kappa) + a * k


def argmin_k(cost, kmax=64):
    return min(range(1, kmax + 1), key=cost)


def promise_prob(k, kappa):
    """P(real makespan's parallel part <= what the twin promised) = P(all k branches <= their mean)."""
    return gamma_cdf(kappa, kappa) ** k


def mc_cost(k, W, a, sampler, n, seed):
    """Monte Carlo mean and s.e. of real cost; sampler(rng) draws one unit-mean branch duration."""
    rng = random.Random(seed)
    xs = [W / k * max(sampler(rng) for _ in range(k)) + a * k for _ in range(n)]
    m = sum(xs) / n
    v = sum((x - m) ** 2 for x in xs) / (n - 1)
    return m, math.sqrt(v / n)


def fit_kappa(samples):
    """Moment fit of the gamma shape from unit-normalised branch durations."""
    n = len(samples)
    m = sum(samples) / n
    v = sum((x - m) ** 2 for x in samples) / (n - 1)
    return m * m / v if v > 0 else float("inf")


def continuous_condition(k, W, a):
    """Exponential branches, continuous H_k ~ ln k + gamma: stationarity (k/k_twin)^2 = ln k + gamma - 1."""
    return (k * k * a / W) - (math.log(k) + 0.5772156649015329 - 1)


def regret(k, W, a, kappa, kmax=64):
    """Relative real-cost excess of choosing k instead of the real optimum."""
    best = min(real_cost(j, W, a, kappa) for j in range(1, kmax + 1))
    return real_cost(k, W, a, kappa) / best - 1


def chain_cost(k, N, c, a):
    """Chain model: each of the N unit steps is Gamma(1/c^2) with mean 1; a branch is N/k steps, so its shape is (N/k)/c^2."""
    return N / k * emax(k, (N / k) / c ** 2) + a * k


def quantile_x(k, kappa, q):
    """q-quantile of the max of k unit-mean Gamma(kappa) branches: solves F(x)^k = q exactly by bisection."""
    lo, hi = 0.0, 1.0
    while gamma_cdf(kappa, kappa * hi) ** k < q:
        hi *= 2
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if gamma_cdf(kappa, kappa * mid) ** k < q else (lo, mid)
    return (lo + hi) / 2


class EmaxTable:
    """emax(k, kappa) for k=1..kmax by log-log interpolation on a geometric kappa grid (for repeated fitted-twin evaluations)."""

    def __init__(self, kmax=24, lo=0.25, hi=400.0, m=36, steps=1500):
        self.kmax = kmax
        self.lk = [math.log(lo) + i * (math.log(hi) - math.log(lo)) / (m - 1) for i in range(m)]
        self.tab = [[math.log(emax(k, math.exp(l), steps)) for l in self.lk] for k in range(1, kmax + 1)]

    def __call__(self, k, kappa):
        x = min(max(math.log(kappa), self.lk[0]), self.lk[-1])
        d = self.lk[1] - self.lk[0]
        i = min(int((x - self.lk[0]) / d), len(self.lk) - 2)
        t = (x - self.lk[i]) / d
        row = self.tab[k - 1]
        return math.exp(row[i] * (1 - t) + row[i + 1] * t)
