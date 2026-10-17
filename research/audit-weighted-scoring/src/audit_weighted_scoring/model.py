"""Scoring a verifier's probability report r when ground truth is revealed only on an audited subset.
Binary Y with the verifier's true posterior p. Brier loss B=(r-Y)^2, so E[B]=L(r)=r^2-2pr+p and E[B^2]=m4(r,p).
Audit probability g(r) may depend on the report (e.g. audit confident claims more). Audit coin is independent of Y."""
import math
import random

__all__ = ["loss", "m4", "naive_objective", "naive_report", "naive_shift_first_order", "ipw_objective",
           "ipw_variance", "m2_truthful", "grid", "payment_variance", "neyman_rate", "variance_ratio",
           "max_payout", "simulate_ipw", "simulate_naive"]


def loss(r, p):
    """Expected Brier loss of report r under true posterior p."""
    return r * r - 2 * p * r + p


def m4(r, p):
    """E[B^2] = p(1-r)^4 + (1-p) r^4."""
    return p * (1 - r) ** 4 + (1 - p) * r ** 4


def m2_truthful(p):
    """E[B^2] at r=p: p(1-p)(1-3p+3p^2)."""
    return p * (1 - p) * (1 - 3 * p + 3 * p * p)


def naive_objective(r, p, g):
    """Naive scheme: pay -B only when audited (0 otherwise). Expected loss g(r) L(r)."""
    return g(r) * loss(r, p)


def naive_report(p, a, b):
    """Best report against linear audit rate g(r)=a+b r under the naive scheme: minimise (a+br)(r^2-2pr+p).
    Stationarity 3b r^2 + (2a-4bp) r + (bp-2ap) = 0; choose the minimiser in [0,1]."""
    cands = [0.0, 1.0]
    if abs(b) < 1e-15:
        cands.append(p)
    else:
        A, B, C = 3 * b, 2 * a - 4 * b * p, b * p - 2 * a * p
        disc = B * B - 4 * A * C
        if disc >= 0:
            for s in (1, -1):
                x = (-B + s * math.sqrt(disc)) / (2 * A)
                if 0 <= x <= 1:
                    cands.append(x)
    return min(cands, key=lambda r: naive_objective(r, p, lambda x: a + b * x))


def naive_shift_first_order(p, a, b):
    """r*-p ~ -b p(1-p) / (2(a+bp)): the verifier hides confident claims from audit."""
    return -b * p * (1 - p) / (2 * (a + b * p))


def ipw_objective(r, p):
    """Inverse-propensity scheme: loss B/g(r) when audited. E = g(r) L(r)/g(r) = L(r): proper for ANY g>0."""
    return loss(r, p)


def ipw_variance(r, p, g):
    """Var of the IPW loss for one task: E[B^2]/g(r) - L(r)^2."""
    return m4(r, p) / g(r) - loss(r, p) ** 2


def grid(n=2000, alpha=1.0, beta=1.0):
    """Midpoint grid for p ~ Beta(alpha,beta); returns list of (p, weight)."""
    pts = [(i + 0.5) / n for i in range(n)]
    ws = [x ** (alpha - 1) * (1 - x) ** (beta - 1) for x in pts]
    z = sum(ws)
    return [(x, w / z) for x, w in zip(pts, ws)]


def payment_variance(rate, dist):
    """Average per-task IPW payment variance with truthful reports and audit rate rate(p): E[m2/g] - E[L^2]."""
    return sum(w * (m2_truthful(p) / rate(p) - (p * (1 - p)) ** 2) for p, w in dist)


def neyman_rate(gamma, dist, gmin=0.0, gmax=1.0):
    """Audit rate g(p)=clip(lam*sqrt(m2(p)), gmin, gmax) with E g = gamma; minimises E[m2/g] (water-filling).
    Bisection on lam."""
    lo, hi = 0.0, 1e6
    for _ in range(200):
        lam = (lo + hi) / 2
        mean = sum(w * min(gmax, max(gmin, lam * math.sqrt(m2_truthful(p)))) for p, w in dist)
        lo, hi = (lam, hi) if mean < gamma else (lo, lam)
    lam = (lo + hi) / 2
    return lambda p: min(gmax, max(gmin, lam * math.sqrt(m2_truthful(p))))


def variance_ratio(gamma, dist, gmin=0.0):
    """Var(Neyman) / Var(uniform rate gamma) of the per-task payment second moment."""
    rate = neyman_rate(gamma, dist, gmin)
    num = sum(w * m2_truthful(p) / rate(p) for p, w in dist)
    den = sum(w * m2_truthful(p) for p, w in dist) / gamma
    return num / den


def max_payout(gmin):
    """Largest single-task payment of the IPW scheme: B<=1 so the loss paid is at most 1/gmin."""
    return 1.0 / gmin


def simulate_ipw(r, p, g, tasks, seed=0):
    """Monte Carlo mean and variance of the IPW loss."""
    rng = random.Random(seed)
    gr = g(r)
    tot = tot2 = 0.0
    for _ in range(tasks):
        y = rng.random() < p
        x = ((r - y) ** 2 / gr) if rng.random() < gr else 0.0
        tot += x
        tot2 += x * x
    m = tot / tasks
    return m, tot2 / tasks - m * m


def simulate_naive(r, p, g, tasks, seed=0):
    rng = random.Random(seed)
    gr = g(r)
    tot = 0.0
    for _ in range(tasks):
        y = rng.random() < p
        if rng.random() < gr:
            tot += (r - y) ** 2
    return tot / tasks
