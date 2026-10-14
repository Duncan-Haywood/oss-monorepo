"""Model-substitution detection for decentralised inference. Stdlib only.

A provider claims to serve model P (a next-token distribution) but on each query
independently serves a cheaper model Q with probability p, saving s per cheated query.
A verifier re-scores a random fraction f of responses under P and runs a mixture
e-process for H0: tokens ~ P against the family (1-p)P + pQ, p unknown.
"""
import math, random, bisect

__all__ = ["zipf", "tilt", "kl", "chi2", "mix", "p_grid", "EProcess", "detect_time",
           "delay_theory", "savings_curve", "p_star", "savings_star", "audit_rate_for_budget",
           "total_cost", "f_star", "false_alarm_rate"]


def zipf(V, a=1.1):
    w = [1 / (i + 1) ** a for i in range(V)]
    z = sum(w)
    return [x / z for x in w]


def tilt(P, beta):
    """Q proportional to P**beta: beta<1 flatter (a noisier, cheaper model), beta>1 sharper."""
    w = [x ** beta for x in P]
    z = sum(w)
    return [x / z for x in w]


def kl(a, b):
    return sum(x * math.log(x / y) for x, y in zip(a, b) if x > 0)


def chi2(Q, P):
    return sum((q - p) ** 2 / p for q, p in zip(Q, P))


def mix(P, Q, p):
    return [(1 - p) * x + p * y for x, y in zip(P, Q)]


def p_grid(G=16, lo=0.02, hi=1.0):
    """Log-spaced grid of candidate cheating fractions with uniform prior weight."""
    return [lo * (hi / lo) ** (i / (G - 1)) for i in range(G)]


class EProcess:
    """E_t = mean_g prod_s (1 - p_g + p_g r_s), r_s = Q[x_s]/P[x_s]. A nonnegative martingale
    with mean 1 under H0 (each factor has mean 1), so P(sup_t E_t >= 1/alpha) <= alpha (Ville)."""

    def __init__(self, ratio, grid):
        self.ratio, self.grid = ratio, grid
        self.e = [1.0] * len(grid)

    def update(self, tok):
        r = self.ratio[tok]
        self.e = [v * (1 - p + p * r) for v, p in zip(self.e, self.grid)]
        return sum(self.e) / len(self.e)


def _sampler(D):
    cdf, s = [], 0.0
    for x in D:
        s += x
        cdf.append(s)
    return lambda rng: min(bisect.bisect_left(cdf, rng.random() * s), len(D) - 1)


def detect_time(P, Q, p, f, alpha, nmax, rng, grid, sp=None, sq=None):
    """Queries until the e-process crosses 1/alpha (None if not within nmax queries).
    Each query is cheated w.p. p and checked w.p. f, independently."""
    ratio = [q / x for q, x in zip(Q, P)]
    ep = EProcess(ratio, grid)
    sp, sq = sp or _sampler(P), sq or _sampler(Q)
    thr = 1 / alpha
    for t in range(1, nmax + 1):
        tok = sq(rng) if rng.random() < p else sp(rng)
        if rng.random() < f and ep.update(tok) >= thr:
            return t
    return None


def false_alarm_rate(P, Q, f, alpha, nmax, sims, rng, grid):
    hits = sum(detect_time(P, Q, 0.0, f, alpha, nmax, rng, grid) is not None for _ in range(sims))
    return hits / sims


def delay_theory(P, Q, p, f, alpha, G):
    """Heuristic detection delay in queries: the correctly-guessed grid component grows like
    exp(n*KL(mix_p || P)) per checked query, and must beat 1/alpha after the 1/G prior weight."""
    return math.log(G / alpha) / (f * kl(mix(P, Q, p), P))


def savings_curve(times, p, s, N, nmax):
    """Mean savings by a cheater over N queries given simulated detection times
    (censored at nmax): p*s*E[min(T,N)] (a run never detected is cheating all N)."""
    m = sum(min(t if t is not None else nmax + 1, N) for t in times) / len(times)
    return p * s * m


def p_star(c2, f, alpha, G, N):
    """Small-p optimum of p*s*min(T(p),N) with T = 2L/(f p^2 chi2), L=ln(G/alpha):
    the cheater sets T(p)=N."""
    return math.sqrt(2 * math.log(G / alpha) / (f * N * c2))


def savings_star(c2, f, alpha, G, N, s=1.0):
    """Maximal undetected savings: s*sqrt(2 L N /(f chi2)): grows as sqrt(N), not N."""
    return s * math.sqrt(2 * math.log(G / alpha) * N / (f * c2))


def audit_rate_for_budget(c2, alpha, G, N, s, B):
    """Smallest check rate f keeping the sqrt-law savings under budget B."""
    return 2 * math.log(G / alpha) * N * s * s / (c2 * B * B)


def total_cost(f, c2, alpha, G, N, s, h, c_check):
    """Checking cost + harm h per unit of savings-equivalent damage (h scales the cheater's savings)."""
    return f * N * c_check + h * savings_star(c2, f, alpha, G, N, s)


def f_star(c2, alpha, G, N, s, h, c_check):
    """Minimiser of total_cost: f* = (h K / (2 N c))^(2/3) with K = s sqrt(2 L N / chi2); capped at 1."""
    K = s * math.sqrt(2 * math.log(G / alpha) * N / c2)
    return min(1.0, (h * K / (2 * N * c_check)) ** (2 / 3))
