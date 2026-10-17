"""Effort elicitation with proper scoring rules (Beta-Bernoulli model, exact computation).

A verifier draws n i.i.d. Bernoulli(p) samples (p ~ Beta(a,b)) at cost c per sample, reports the posterior mean q_n
(optimal under any strictly proper rule), and is paid alpha * S(q_n, y) on a fresh outcome y ~ Bernoulli(p).
Expected payment is alpha * E[G(q_n)], G = expected-score function of the rule, so the value of n samples is
V(n) = E[G(q_n)] - G(q_0), exactly computable from the beta-binomial law.
"""
import math

def _lbeta(x, y):
    return math.lgamma(x) + math.lgamma(y) - math.lgamma(x + y)

def G_brier(q):
    return 1.0 - q * (1.0 - q)

def G_log(q):
    return sum(x * math.log(x) for x in (q, 1.0 - q) if x > 0)

def G_spherical(q):
    return math.sqrt(q * q + (1.0 - q) ** 2)

RULES = {"brier": G_brier, "log": G_log, "spherical": G_spherical}

# score S(q, y) for realised outcomes (used for payout spread)
def S_brier(q, y): return 1.0 - (y - q) ** 2
def S_log(q, y): return math.log(q if y else 1.0 - q)
def S_spherical(q, y): return (q if y else 1.0 - q) / math.sqrt(q * q + (1.0 - q) ** 2)
SCORES = {"brier": S_brier, "log": S_log, "spherical": S_spherical}

def value_curve(rule, a, b, nmax):
    """V(n) for n = 0..nmax (exact)."""
    G = RULES[rule]
    base = G(a / (a + b))
    out = [0.0]
    for n in range(1, nmax + 1):
        tot = 0.0
        for k in range(n + 1):
            lp = (math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
                  + _lbeta(a + k, b + n - k) - _lbeta(a, b))
            tot += math.exp(lp) * G((a + k) / (a + b + n))
        out.append(tot - base)
    return out

def best_effort(V, alpha, c):
    """argmax_n alpha*V(n) - c*n (smallest maximiser)."""
    vals = [alpha * v - c * n for n, v in enumerate(V)]
    return max(range(len(V)), key=lambda n: (vals[n], -n))

def implementable_interval(V, n, c):
    """Set of alpha making n optimal: (lo, hi), empty iff lo > hi. Exact."""
    lo, hi = 0.0, math.inf
    for m, v in enumerate(V):
        if m < n:
            d = V[n] - v
            lo = max(lo, c * (n - m) / d) if d > 0 else math.inf
        elif m > n:
            d = v - V[n]
            hi = min(hi, c * (m - n) / d) if d > 0 else hi
    return lo, hi

def concave_envelope_vertices(V):
    """Indices n on the upper concave envelope of (n, V(n)): exactly the implementable efforts (with ties)."""
    hull = []
    for i in range(len(V)):
        while len(hull) >= 2:
            i0, i1 = hull[-2], hull[-1]
            if (V[i1] - V[i0]) * (i - i0) <= (V[i] - V[i0]) * (i1 - i0):
                hull.pop()
            else:
                break
        hull.append(i)
    return hull

def payout_spread(rule, a, b, n):
    """Max minus min realised score over reports reachable after n samples and outcomes y in {0,1}."""
    S = SCORES[rule]
    qs = [(a + k) / (a + b + n) for k in range(n + 1)]
    vals = [S(q, y) for q in qs for y in (0, 1)]
    return max(vals) - min(vals)

def design(rule, a, b, n_target, c, nmax=None):
    """Cheapest alpha (alpha_lo) implementing n_target, its rent, and payout spread. None if not implementable."""
    nmax = nmax or 4 * n_target
    V = value_curve(rule, a, b, nmax)
    lo, hi = implementable_interval(V, n_target, c)
    if lo > hi:
        return None
    rent = lo * V[n_target] - c * n_target
    return {"alpha": lo, "rent": rent, "rent_per_cost": rent / (c * n_target),
            "spread": lo * payout_spread(rule, a, b, n_target), "V": V}
