"""Two-hangover endpointing with a sentence-completeness cue (stylised signal-detection model).

At the start of each silence a cue scores "this sentence is complete". Silence at the true end of the turn
scores N(+d/2, 1); a within-turn pause scores N(-d/2, 1) if it sits mid-clause, but with probability `q` the
pause sits at a complete point (a clause boundary) where the cue sees the same distribution as a real end.
Score above `tau` -> short hangover Hs, otherwise long hangover Hl. d = 0 is a cue with no information.
"""
from math import erf, log, sqrt

import numpy as np
from dataclasses import dataclass


@dataclass(frozen=True)
class Pauses:
    n_pauses: float = 2.0   # expected within-turn pauses per turn (Poisson)
    median_ms: float = 250.0
    sigma: float = 0.8      # lognormal shape


def sf(p: Pauses, t_ms: float) -> float:
    """P(pause duration > t)."""
    if t_ms <= 0:
        return 1.0
    z = (log(t_ms) - log(p.median_ms)) / p.sigma
    return 0.5 * (1.0 - erf(z / sqrt(2.0)))


def phi(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def rates(d: float, tau: float, q: float):
    """(TPR, FPR): P(cue says complete | real end), P(cue says complete | within-turn pause)."""
    tpr = phi(d / 2.0 - tau)
    fpr_mid = phi(-d / 2.0 - tau)
    return tpr, q * tpr + (1.0 - q) * fpr_mid


def p_cutoff(p: Pauses, d, tau, q, Hs, Hl):
    """P(a turn is cut off by a pause): pauses scored 'complete' wait Hs, the rest wait Hl."""
    _, fpr = rates(d, tau, q)
    return 1.0 - np.exp(-p.n_pauses * (fpr * sf(p, Hs) + (1.0 - fpr) * sf(p, Hl)))


def mean_wait(d, tau, q, Hs, Hl):
    """Expected silence the assistant waits at the real end of the turn, ms."""
    tpr, _ = rates(d, tau, q)
    return tpr * Hs + (1.0 - tpr) * Hl


def best(p: Pauses, d, q, budget, hs_grid, hl_grid, taus):
    """Lowest mean wait over (Hs, Hl, tau) with Hs <= Hl whose cut-off rate is within `budget`.
    Returns (wait, Hs, Hl, tau, cutoff) or None."""
    out = None
    for tau in taus:
        for Hs in hs_grid:
            for Hl in hl_grid:
                if Hl < Hs:
                    continue
                c = p_cutoff(p, d, tau, q, Hs, Hl)
                if c > budget:
                    continue
                w = mean_wait(d, tau, q, Hs, Hl)
                if out is None or w < out[0]:
                    out = (w, Hs, Hl, tau, float(c))
    return out


def best_fixed(p: Pauses, budget):
    """Shortest single hangover H (ms, bisection) whose cut-off rate is within `budget`."""
    lo, hi = 1.0, 20000.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if 1.0 - np.exp(-p.n_pauses * sf(p, mid)) <= budget:
            hi = mid
        else:
            lo = mid
    return hi


def simulate(p: Pauses, d, tau, q, Hs, Hl, n=200000, seed=0):
    """Monte Carlo check: (cutoff rate, mean wait at the real end)."""
    rng = np.random.default_rng(seed)
    counts = rng.poisson(p.n_pauses, n)
    cut = np.zeros(n, dtype=bool)
    tot = counts.sum()
    turn = np.repeat(np.arange(n), counts)
    dur = np.exp(np.log(p.median_ms) + p.sigma * rng.standard_normal(tot))
    at_end_like = rng.random(tot) < q
    score = rng.standard_normal(tot) + np.where(at_end_like, d / 2.0, -d / 2.0)
    wait = np.where(score > tau, Hs, Hl)
    np.logical_or.at(cut, turn, dur > wait)
    end_score = rng.standard_normal(n) + d / 2.0
    return float(cut.mean()), float(np.where(end_score > tau, Hs, Hl).mean())
