"""Input uncertainty of a digital twin fitted to finite real data.  A shared lab instrument is an M/M/1 queue with arrival rate
lam and service rate mu.  The twin's rates are the MLEs from n1 real interarrival times and n2 real service times.  However long
the twin is simulated, its steady-state mean wait is the deterministic number wq(lam_hat, mu_hat), so its error against the real
system is input error, not simulation noise.  Everything here is exact or a stated delta-method approximation."""
import math, random

__all__ = ["wq", "rel_sd", "n_required", "p_unstable", "fit", "delta_bound", "boot_bound", "post_bound", "betainc", "Z95"]

Z95 = 1.6448536269514722  # one-sided 95%


def wq(lam, mu):
    """Steady-state mean queueing wait of M/M/1; +inf when the fitted twin is unstable (lam >= mu)."""
    return lam / (mu * (mu - lam)) if lam < mu else math.inf


def rel_sd(rho, n1, n2=None):
    """Delta-method relative sd of wq(lam_hat, mu_hat).  d ln W/d ln lam = 1/(1-rho), d ln W/d ln mu = -(2-rho)/(1-rho), and
    Var ln(lam_hat) ~ 1/n1, Var ln(mu_hat) ~ 1/n2 (exponential MLE)."""
    n2 = n1 if n2 is None else n2
    return math.sqrt(1.0 / n1 + (2.0 - rho) ** 2 / n2) / (1.0 - rho)


def n_required(rho, r):
    """Real observations per stream (n1=n2=n) so that the delta-method relative sd of the twin's wait is r."""
    return (1.0 + (2.0 - rho) ** 2) / ((1.0 - rho) * r) ** 2


def betainc(a, b, x):
    """Regularised incomplete beta I_x(a,b) by Lentz's continued fraction (Numerical Recipes 6.4)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log1p(-x)
    if x > (a + 1.0) / (a + b + 2.0):
        return 1.0 - betainc(b, a, 1.0 - x)
    tiny = 1e-300
    c, d = 1.0, 1.0 - (a + b) * x / (a + 1.0)
    d = 1.0 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, 10000):
        for num in (m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)), -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))):
            d = 1.0 + num * d
            d = 1.0 / (d if abs(d) > tiny else tiny)
            c = 1.0 + num / c
            c = c if abs(c) > tiny else tiny
            h *= d * c
        if abs(d * c - 1.0) < 1e-15:
            break
    return math.exp(lbeta) * h / a


def p_unstable(rho, n1, n2=None, mu=1.0):
    """Exact P(lam_hat >= mu_hat): the fitted twin has no steady state.  With G1~Gamma(n1), G2~Gamma(n2) this is
    P[(G2/n2)/(G1/n1) >= mu/lam] = P[F(2 n2, 2 n1) >= 1/rho]."""
    n2 = n1 if n2 is None else n2
    x = mu / (rho * mu)  # = 1/rho
    z = 2 * n2 * x / (2 * n2 * x + 2 * n1)
    return 1.0 - betainc(n2, n1, z)


def fit(rng, rho, n1, n2=None, mu=1.0):
    """Draw n1 interarrival and n2 service times from the real system and return the MLE rates (lam_hat, mu_hat)."""
    n2 = n1 if n2 is None else n2
    lam = rho * mu
    return n1 / sum(rng.expovariate(lam) for _ in range(n1)), n2 / sum(rng.expovariate(mu) for _ in range(n2))


def delta_bound(lh, mh, n1, n2, z=Z95):
    """Upper confidence bound on the real wait from the log-scale delta method at the fitted rates."""
    if lh >= mh:
        return math.inf
    r = lh / mh
    e = z * rel_sd(r, n1, n2)
    return wq(lh, mh) * math.exp(e) if e < 500 else math.inf


def boot_bound(rng, lh, mh, n1, n2, B=400, q=0.95):
    """Parametric-bootstrap percentile upper bound: refit from data simulated at the fitted rates; unstable refits count as +inf."""
    ws = sorted(wq(n1 / (rng.gammavariate(n1, 1.0) / lh), n2 / (rng.gammavariate(n2, 1.0) / mh)) for _ in range(B))
    return ws[min(B - 1, int(math.ceil(q * B)) - 1)]


def post_bound(rng, sa, ss, n1, n2, B=400, q=0.95):
    """Posterior upper bound under the scale-invariant prior 1/lam, 1/mu: lam ~ Gamma(n1, rate sum A), mu ~ Gamma(n2, rate sum S)."""
    ws = sorted(wq(rng.gammavariate(n1, 1.0) / sa, rng.gammavariate(n2, 1.0) / ss) for _ in range(B))
    return ws[min(B - 1, int(math.ceil(q * B)) - 1)]
