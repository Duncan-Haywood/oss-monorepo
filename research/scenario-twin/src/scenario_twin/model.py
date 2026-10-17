"""Rare-failure estimation from a digital twin's scenario generator.
The real scenario latent is x ~ p = N(0,1) (e.g. standardised negative log road friction); the system fails iff
x > a, so the real failure probability is P = Q(a).  The twin's scenario generator draws x ~ q = N(0,s^2)
(domain-randomisation width s).  A twin that reports the raw failure rate claims Q(a/s); reweighting each twin
failure by w = p/q gives an unbiased estimate of P, whose per-sample variance is finite iff s^2 > 1/2."""
import math, random

__all__ = ["Q", "Q_inv", "naive_claim", "weight", "second_moment", "rel_var", "n_required", "optimal_width",
           "mixture_second_moment", "mixture_rel_var", "sample_is", "estimate", "braking_threshold",
           "simulate_stopping_distance"]


def Q(x):
    return 0.5 * math.erfc(x / math.sqrt(2.0))


def Q_inv(p):
    lo, hi = -40.0, 40.0
    for _ in range(300):
        mid = 0.5 * (lo + hi)
        if Q(mid) > p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def naive_claim(a, s):
    """Failure rate a twin reports when it runs its own scenario distribution unweighted."""
    return Q(a / s)


def weight(x, s):
    """p(x)/q(x) for p=N(0,1), q=N(0,s^2)."""
    return s * math.exp(-0.5 * x * x * (1.0 - 1.0 / (s * s)))


def second_moment(a, s):
    """E_q[w^2 1{x>a}] = s*tau*Q(a/tau), tau^2 = s^2/(2 s^2 - 1); infinite when s^2 <= 1/2."""
    if 2.0 * s * s <= 1.0:
        return math.inf
    tau = s / math.sqrt(2.0 * s * s - 1.0)
    return s * tau * Q(a / tau)


def rel_var(a, s):
    """Per-sample variance of the reweighted estimator divided by P^2 (plain Monte Carlo on the real
    distribution, s=1, gives (1-P)/P)."""
    P = Q(a)
    return second_moment(a, s) / (P * P) - 1.0


def n_required(a, s, rel_err):
    """Twin runs so that the standard error is rel_err * P."""
    return rel_var(a, s) / (rel_err * rel_err)


def optimal_width(a, lo=None, hi=None):
    """Width minimising rel_var, by golden-section search on (sqrt(1/2)+eps, 2a+2)."""
    hi = 2.0 * a + 2.0 if hi is None else hi
    lo = math.sqrt(0.5) + 1e-3 if lo is None else lo
    g = (math.sqrt(5.0) - 1.0) / 2.0
    x1, x2 = hi - g * (hi - lo), lo + g * (hi - lo)
    f1, f2 = rel_var(a, x1), rel_var(a, x2)
    for _ in range(200):
        if f1 < f2:
            hi, x2, f2 = x2, x1, f1
            x1 = hi - g * (hi - lo)
            f1 = rel_var(a, x1)
        else:
            lo, x1, f1 = x1, x2, f2
            x2 = lo + g * (hi - lo)
            f2 = rel_var(a, x2)
    return 0.5 * (lo + hi)


def _phi(x, s):
    return math.exp(-0.5 * (x / s) ** 2) / (s * math.sqrt(2.0 * math.pi))


def mixture_second_moment(a, s, lam, n=40000):
    """E_q[w^2 1{x>a}] = int_a^inf p^2/q dx for q = (1-lam) N(0,s^2) + lam N(0,1), by Simpson's rule.
    Bounded by P/lam because w <= 1/lam."""
    hi = max(14.0, 10.0 * s)
    h = (hi - a) / n
    tot = 0.0
    for i in range(n + 1):
        x = a + i * h
        p = _phi(x, 1.0)
        f = p * p / ((1.0 - lam) * _phi(x, s) + lam * p)
        tot += f * (1 if i in (0, n) else 4 if i % 2 else 2)
    return tot * h / 3.0


def mixture_rel_var(a, s, lam):
    P = Q(a)
    return mixture_second_moment(a, s, lam) / (P * P) - 1.0


def sample_is(n, a, s, rng, lam=0.0):
    """n twin scenarios from q (mixture with the real prior if lam>0); returns weighted failure indicators
    w*1{x>a} and the failure weights alone."""
    out = []
    for _ in range(n):
        if lam > 0.0 and rng.random() < lam:
            x = rng.gauss(0.0, 1.0)
        else:
            x = rng.gauss(0.0, s)
        if x > a:
            p = _phi(x, 1.0)
            out.append(p / ((1.0 - lam) * _phi(x, s) + lam * p))
        else:
            out.append(0.0)
    return out


def estimate(vals):
    """Mean, standard error and Wald 95% interval of weighted failure indicators."""
    n = len(vals)
    m = sum(vals) / n
    v = sum((x - m) ** 2 for x in vals) / (n - 1)
    se = math.sqrt(v / n)
    return m, se, (m - 1.96 * se, m + 1.96 * se)


def braking_threshold(v, gap, mu0, sigma, g=9.81):
    """Cruise at v, obstacle appears at distance gap, friction mu = mu0*exp(-sigma*x), x~N(0,1).  Stopping
    distance v^2/(2 mu g) > gap iff x > a; returns a."""
    return (math.log(mu0) - math.log(v * v / (2.0 * g * gap))) / sigma


def simulate_stopping_distance(v, mu, dt, g=9.81):
    """Explicit-Euler braking in a fixed-step twin (position updated with the pre-step speed)."""
    pos = 0.0
    while v > 0.0:
        pos += v * dt
        v -= mu * g * dt
    return pos
