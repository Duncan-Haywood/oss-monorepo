"""Weighted-score wagering mechanism (WSWM) with a wealth-redistribution tax.

Lambert, Langford, Wortman, Vaughan, Chen, Pennock, Waggoner, Frongillo
("Self-financed wagering mechanisms for forecasting", EC 2008) define, for
wagers m_i and scores s_i in [0, 1]:

    payoff_i = m_i * (1 + s_i - sum_j m_j s_j / sum_j m_j)

This is budget balanced (sum payoff = sum wager), pays every participant
>= 0 (so a wager can lose at most itself), is truthful for a proper score, and
is sybil-proof (splitting a wager across identities changes nothing).

Here each participant i holds *wealth* w_i and wagers m_i = f * w_i, so

    w_i <- w_i * (1 + f * (s_i - s_bar)),   s_bar = wager-weighted mean score

i.e. a multiplicative-weights update with gain s_i - s_bar and learning rate
f in (0, 1]. The aggregate forecast is the wager-weighted linear pool.

`alpha` adds a *fixed-share* tax: after settlement every participant gives up
a fraction alpha of wealth, redistributed equally. Total wealth stays
conserved (still budget balanced) but no module can be permanently priced out
of the pool, which is what continual learning with recurring regimes needs.
This departs from plain WSWM and is not incentive-neutral: the tax is a
subsidy toward low-wealth participants (quantified in the experiments).
"""
from dataclasses import dataclass
from typing import Sequence

from .scoring import brier_score


@dataclass
class Round:
    aggregate: float
    payoffs: list  # net payoff (payoff - wager) per participant
    wagers: list


class WageringMechanism:
    def __init__(self, n: int, fraction: float = 0.5, alpha: float = 0.0):
        if not 0 < fraction <= 1:
            raise ValueError("fraction must be in (0, 1]")
        if not 0 <= alpha < 1:
            raise ValueError("alpha must be in [0, 1)")
        self.f, self.alpha = fraction, alpha
        self.wealth = [1.0] * n

    def wagers(self) -> list:
        return [self.f * w for w in self.wealth]

    def aggregate(self, reports: Sequence[float]) -> float:
        m = self.wagers()
        return sum(mi * r for mi, r in zip(m, reports)) / sum(m)

    def settle(self, reports: Sequence[float], outcome: int) -> Round:
        m = self.wagers()
        agg = sum(mi * r for mi, r in zip(m, reports)) / sum(m)
        s = [brier_score(r, outcome) for r in reports]
        s_bar = sum(mi * si for mi, si in zip(m, s)) / sum(m)
        net = [mi * (si - s_bar) for mi, si in zip(m, s)]
        self.wealth = [w + d for w, d in zip(self.wealth, net)]
        if self.alpha:
            pot = self.alpha * sum(self.wealth)
            n = len(self.wealth)
            self.wealth = [(1 - self.alpha) * w + pot / n for w in self.wealth]
        return Round(agg, net, m)
