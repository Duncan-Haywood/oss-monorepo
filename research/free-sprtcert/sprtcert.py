"""Exact operating characteristics of Wald's SPRT versus the best fixed-n test for certifying a failure rate.

Pure standard library. Everything here is an exact dynamic programme over (trials n, failures k), not a simulation.
Convention: H0 is the unacceptable failure rate p0, H1 the acceptable p1 < p0. The test "accepts" the policy (decides H1).
"""
import math


def log_lr(n, k, p0, p1):
    """log L(p1)/L(p0) after k failures in n trials."""
    return k * math.log(p1 / p0) + (n - k) * math.log((1 - p1) / (1 - p0))


def wald_bounds(alpha, beta):
    """Wald's approximate boundaries on log L(p1)/L(p0): accept H1 at >= log((1-beta)/alpha), reject at <= log(beta/(1-alpha))."""
    return math.log(beta / (1 - alpha)), math.log((1 - beta) / alpha)


def sprt(p, p0, p1, alpha, beta, nmax=20000):
    """Exact run of the SPRT when the true failure rate is p.

    Returns dict: accept (P(decide H1)), reject, undecided (mass still running at nmax), asn (expected trials, with
    undecided mass counted at nmax, so a lower bound), by exact DP over the number of failures.
    """
    lo, hi = wald_bounds(alpha, beta)
    dist = {0: 1.0}
    acc = rej = asn = 0.0
    for n in range(0, nmax):
        asn += sum(dist.values())          # P(still running before trial n+1) = P(N > n)
        nxt = {}
        for k, m in dist.items():
            for kk, pr in ((k, 1 - p), (k + 1, p)):
                w = m * pr
                if w == 0.0:
                    continue
                s = log_lr(n + 1, kk, p0, p1)
                if s >= hi:
                    acc += w
                elif s <= lo:
                    rej += w
                else:
                    nxt[kk] = nxt.get(kk, 0.0) + w
        dist = nxt
        if not dist:
            break
    return {"accept": acc, "reject": rej, "undecided": sum(dist.values()), "asn": asn}


def _binom_tail_le(n, c, p):
    """P(Binomial(n, p) <= c)."""
    return sum(math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in range(c + 1))


def fixed_n(p0, p1, alpha, beta, nmax=5000):
    """Smallest n with a cutoff c so that accepting when failures <= c has P(accept | p0) <= alpha and P(accept | p1) >= 1 - beta.

    Returns (n, c) or None. Exact binomial sums.
    """
    for n in range(1, nmax + 1):
        # largest c with P(X<=c | p0) <= alpha
        c = -1
        cdf = 0.0
        for k in range(n + 1):
            cdf += math.comb(n, k) * p0 ** k * (1 - p0) ** (n - k)
            if cdf <= alpha:
                c = k
            else:
                break
        if c >= 0 and _binom_tail_le(n, c, p1) >= 1 - beta:
            return n, c
    return None


def accept_prob_fixed(n, c, p):
    return _binom_tail_le(n, c, p)
