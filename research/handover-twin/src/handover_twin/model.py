"""Timeout policy of a collaborative robot waiting for a human response time T (handover, confirmation, hand-guided step).
Policy: wait up to tau, then abort/re-plan. Cost J(tau) = w E[min(T,tau)] + c P(T > tau) (w per unit waiting, c per abort).
dJ/dtau = S(tau) (w - c h(tau)) with survival S and hazard h, so a constant or monotone hazard gives corner policies
(tau = 0 or tau = infinity) and an interior optimum needs a hazard that falls below w/c (e.g. lognormal)."""
import math, random

__all__ = ["Phi", "Lognormal", "Exponential", "Weibull", "cost", "best_timeout", "twin_policy_regret",
           "lognormal_tau_star", "plugin_timeout", "regret_delta", "fit_lognormal", "simulate_cost"]


def Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


class Lognormal:
    def __init__(self, mu, sigma): self.mu, self.sigma = mu, sigma
    def mean(self): return math.exp(self.mu + self.sigma ** 2 / 2)
    def surv(self, t): return 1.0 if t <= 0 else 0.5 * math.erfc((math.log(t) - self.mu) / self.sigma / math.sqrt(2))
    def pdf(self, t):
        if t <= 0: return 0.0
        z = (math.log(t) - self.mu) / self.sigma
        return math.exp(-z * z / 2) / (t * self.sigma * math.sqrt(2 * math.pi))
    def hazard(self, t): return self.pdf(t) / self.surv(t)
    def emin(self, tau):  # E[min(T, tau)], closed form
        if tau <= 0: return 0.0
        z = (math.log(tau) - self.mu) / self.sigma
        return self.mean() * Phi(z - self.sigma) + tau * (1 - Phi(z))
    def sample(self, rng): return math.exp(rng.gauss(self.mu, self.sigma))


class Exponential:
    def __init__(self, mean): self.m = mean
    def mean(self): return self.m
    def surv(self, t): return 1.0 if t <= 0 else math.exp(-t / self.m)
    def hazard(self, t): return 1.0 / self.m
    def emin(self, tau): return 0.0 if tau <= 0 else self.m * (1 - math.exp(-tau / self.m))
    def sample(self, rng): return rng.expovariate(1 / self.m)


class Weibull:
    """shape k, scale s; k > 1 is the light-tailed increasing-hazard twin."""
    def __init__(self, k, s): self.k, self.s = k, s
    @classmethod
    def with_mean(cls, k, mean): return cls(k, mean / math.gamma(1 + 1 / k))
    def mean(self): return self.s * math.gamma(1 + 1 / self.k)
    def surv(self, t): return 1.0 if t <= 0 else math.exp(-((t / self.s) ** self.k))
    def hazard(self, t): return (self.k / self.s) * (t / self.s) ** (self.k - 1)
    def emin(self, tau, n=4000):  # integral of survival, Simpson
        if tau <= 0: return 0.0
        h = tau / n
        acc = self.surv(0) + self.surv(tau)
        for i in range(1, n): acc += (4 if i % 2 else 2) * self.surv(i * h)
        return acc * h / 3
    def sample(self, rng): return self.s * rng.weibullvariate(1, self.k)


def cost(dist, w, c, tau):
    """J(tau); tau = math.inf means never abort."""
    if math.isinf(tau): return w * dist.mean()
    return w * dist.emin(tau) + c * dist.surv(tau)


def best_timeout(dist, w, c, tmax=60.0, n=6000):
    """Grid search over tau in (0, tmax] plus the corners 0 and infinity, refined by golden section on the best cell.
    Returns (tau*, J*); tau* is 0.0 or math.inf at a corner."""
    grid = [tmax * i / n for i in range(1, n + 1)]
    vals = [cost(dist, w, c, t) for t in grid]
    i = min(range(n), key=vals.__getitem__)
    lo, hi = grid[max(i - 1, 0)], grid[min(i + 1, n - 1)]
    g = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    for _ in range(80):
        x1, x2 = b - g * (b - a), a + g * (b - a)
        if cost(dist, w, c, x1) < cost(dist, w, c, x2): b = x2
        else: a = x1
    tau = (a + b) / 2
    cands = [(cost(dist, w, c, 0.0), 0.0), (cost(dist, w, c, math.inf), math.inf), (cost(dist, w, c, tau), tau)]
    j, t = min(cands)
    return t, j


def twin_policy_regret(real, twin, w, c):
    """Real cost of the timeout that is optimal in the twin, minus the real optimum. Returns (tau_twin, tau_real, regret, J_real*)."""
    tt, _ = best_timeout(twin, w, c)
    tr, jr = best_timeout(real, w, c)
    return tt, tr, cost(real, w, c, tt) - jr, jr


def lognormal_tau_star(mu, sigma, w, c):
    """Right crossing of h(tau) = w/c for a lognormal, the interior optimum (bisection above the hazard peak)."""
    d = Lognormal(mu, sigma)
    ts = [math.exp(mu + sigma * z / 20) for z in range(-100, 100)]
    peak = max(ts, key=d.hazard)
    lo, hi = peak, math.exp(mu + 6 * sigma)
    if d.hazard(peak) < w / c: return None
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if d.hazard(mid) > w / c: lo = mid
        else: hi = mid
    return math.sqrt(lo * hi)


def regret_delta(mu, sigma, w, c, n):
    """Delta-method regret of the plug-in timeout from n real trials (lognormal MLE, correctly specified):
    regret ~ 0.5 J''(tau*) Var(tau_hat), J'' = c S(tau*) |h'(tau*)|, Var from Fisher information Var(mu)=s^2/n, Var(sigma)=s^2/2n."""
    ts = lognormal_tau_star(mu, sigma, w, c)
    d = Lognormal(mu, sigma)
    e = 1e-5 * ts
    hp = (d.hazard(ts + e) - d.hazard(ts - e)) / (2 * e)
    jpp = c * d.surv(ts) * abs(hp)
    em, es = 1e-5, 1e-5
    dmu = (lognormal_tau_star(mu + em, sigma, w, c) - lognormal_tau_star(mu - em, sigma, w, c)) / (2 * em)
    dsg = (lognormal_tau_star(mu, sigma + es, w, c) - lognormal_tau_star(mu, sigma - es, w, c)) / (2 * es)
    var = dmu ** 2 * sigma ** 2 / n + dsg ** 2 * sigma ** 2 / (2 * n)
    return 0.5 * jpp * var, ts, var


def fit_lognormal(xs):
    l = [math.log(x) for x in xs]
    mu = sum(l) / len(l)
    return mu, math.sqrt(sum((v - mu) ** 2 for v in l) / len(l))


def simulate_cost(dist, w, c, tau, n, seed):
    rng = random.Random(seed)
    tot = 0.0
    for _ in range(n):
        t = dist.sample(rng)
        tot += w * t if t <= tau else w * tau + c
    return tot / n


def plugin_timeout(mu, sigma, w, c):
    """Timeout optimal for a fitted lognormal: interior root if the hazard ever exceeds w/c, else the better corner
    (never abort if w E[T] <= c, else abort at once); an interior root is kept only if it beats waiting forever."""
    d = Lognormal(mu, sigma)
    ts = lognormal_tau_star(mu, sigma, w, c)
    best = (cost(d, w, c, math.inf), math.inf)
    if c < best[0]: best = (c, 0.0)
    if ts is not None and cost(d, w, c, ts) < best[0]: best = (cost(d, w, c, ts), ts)
    return best[1]
