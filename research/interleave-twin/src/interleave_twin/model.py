"""Repeat-spacing on a bursty link: i.i.d.-loss link twin vs a two-state (Gilbert) loss chain, stylised.

A map update is sent r times, copies g slots apart (last copy at latency (r-1)g). Real link: a stationary two-state Markov chain,
slot lost with marginal probability p and lag-1 correlation lam, so P(lost | previous lost) = q = p + lam(1-p) and, g slots
apart, q_g = p + lam^g (1-p). The chain observed every g-th slot is again a chain, so
    P(all r copies lost) = p * q_g^(r-1)            (real)
    P(all r copies lost) = p^r                      (twin: independent loss, same p)
"""
import itertools
import math


def q_lag(p, lam, g):
    """P(lost at t+g | lost at t) for the stationary chain."""
    return p + lam ** g * (1 - p)


def residual_real(p, lam, r, g):
    return p * q_lag(p, lam, g) ** (r - 1)


def residual_twin(p, r):
    return p ** r


def residual_enum(p, lam, offsets):
    """Brute force over all loss patterns of the copies at the given slot offsets (checks the closed form).
    Joint law from the chain's lag-k transition matrices, P(s' | s) at lag k: p_lost_given(s, k)."""
    total = 0.0
    n = len(offsets)
    for pat in itertools.product((0, 1), repeat=n):   # 1 = lost
        pr = p if pat[0] else 1 - p
        for i in range(1, n):
            k = offsets[i] - offsets[i - 1]
            pl = p + lam ** k * ((1 if pat[i - 1] else 0) - p)
            pr *= pl if pat[i] else 1 - pl
        if all(pat):
            total += pr
    return total


def copies_needed_twin(p, eps):
    """Smallest r with p^r <= eps (sent back to back, latency r-1)."""
    return max(1, math.ceil(math.log(eps) / math.log(p) - 1e-12))


def copies_needed_real(p, lam, eps, g):
    """Smallest r with p q_g^(r-1) <= eps at spacing g, or None if q_g = 1."""
    qg = q_lag(p, lam, g)
    if p <= eps:
        return 1
    if qg >= 1:
        return None
    return 1 + math.ceil(math.log(eps / p) / math.log(qg) - 1e-12)


def best_design(p, lam, eps, r_max, g_max=400):
    """Minimum-latency (r, g) with residual <= eps and r <= r_max; latency (r-1)g. Returns (latency, r, g, residual) or None."""
    if p <= eps:
        return (0, 1, 1, p)
    best = None
    for r in range(2, r_max + 1):
        for g in range(1, g_max + 1):
            lat = (r - 1) * g
            if best is not None and lat >= best[0]:
                break
            res = residual_real(p, lam, r, g)
            if res <= eps:
                best = (lat, r, g, res)
                break
    return best


def best_spacing_for_deadline(p, lam, D, r):
    """Best integer gap g with (r-1)g <= D for r copies; returns (g, residual)."""
    g = max(1, D // (r - 1))
    return g, residual_real(p, lam, r, g)


def simulate(p, lam, r, g, trials, rng):
    """Monte Carlo of the chain for the all-lost probability (checks the closed form)."""
    q = p + lam * (1 - p)
    a = p * (1 - lam)           # P(lost | previous ok)
    span = (r - 1) * g + 1
    hits = 0
    for _ in range(trials):
        s = 1 if rng.random() < p else 0
        lost = [s]
        for _ in range(span - 1):
            s = 1 if rng.random() < (q if s else a) else 0
            lost.append(s)
        if all(lost[i * g] for i in range(r)):
            hits += 1
    return hits / trials
