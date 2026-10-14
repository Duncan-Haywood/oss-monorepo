"""Use a market as a router over n expert modules and measure regret/sparsity.

Each round the router plays the market's price vector as mixture weights, then
every expert's gain g_t in [0,1]^n is revealed and the market "trades" it
(q += g). ``decay < 1`` multiplies holdings each round (forgetting), a
continual-learning device that keeps the router able to switch experts.
"""
import math
from dataclasses import dataclass


def hedge_regret_bound(n, T, b):
    """Hedge, gains in [0,1], eta=1/b:  regret <= b ln n + T / (8 b)."""
    return b * math.log(n) + T / (8.0 * b)


def ftrl_l2_regret_bound(n, T, b):
    """FTRL with R=1/2||p||^2 scaled by b:  regret <= b (1-1/n)/2 + T n / (2 b).

    Uses ||g_t||_2^2 <= n for g_t in [0,1]^n (loose but valid).
    """
    return b * 0.5 * (1 - 1.0 / n) + T * n / (2.0 * b)


@dataclass
class RoutingResult:
    gain: float
    best_fixed_gain: float
    regret: float
    switching_regret: float
    mean_active: float
    mean_weight_on_best: float


def run_routing(market, gains, decay=1.0, best_seq=None, active_tol=1e-3):
    """gains: list over rounds of length-n gain vectors.

    best_seq: optional per-round index of the currently-best expert; used for
    switching regret (vs. the piecewise comparator) and weight-on-best.
    """
    n = market.n
    total = 0.0
    cum = [0.0] * n
    active = 0.0
    on_best = 0.0
    comp = 0.0
    for t, g in enumerate(gains):
        p = market.prices()
        total += sum(pi * gi for pi, gi in zip(p, g))
        active += sum(1 for x in p if x > active_tol)
        if best_seq is not None:
            on_best += p[best_seq[t]]
            comp += g[best_seq[t]]
        for i in range(n):
            cum[i] += g[i]
        if decay < 1.0:
            market.q = [decay * x for x in market.q]
        market.trade(g)
    T = len(gains)
    bf = max(cum)
    return RoutingResult(
        gain=total, best_fixed_gain=bf, regret=bf - total,
        switching_regret=(comp - total) if best_seq is not None else float("nan"),
        mean_active=active / T,
        mean_weight_on_best=(on_best / T) if best_seq is not None else float("nan"),
    )
