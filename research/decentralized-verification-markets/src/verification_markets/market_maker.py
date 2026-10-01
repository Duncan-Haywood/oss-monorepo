"""Logarithmic Market Scoring Rule (LMSR) cost-function market maker.

Hanson (2003), "Combinatorial Information Market Design". Included here
because Gensyn's research post "Prediction Markets are Learning Algorithms"
observes that bounded-loss cost-function market makers (LMSR among them) are
mathematically equivalent to no-regret online learning algorithms (Chen &
Vaughan, 2010; Frongillo, Della Penna & Reid, 2012 show Kelly-bettor CFMs are
exactly stochastic mirror descent). We reuse that equivalence here in the
opposite direction from its usual application: instead of a market
aggregating human traders' beliefs, verifiers' peer-prediction-scored
confidence about a training step acts as a stream of "trades" that the
market maker aggregates online into a single calibrated probability that the
step was computed correctly -- a running, regret-bounded consensus estimate
that does not require batching or a central tallying step.
"""

from __future__ import annotations

import math


class LMSRMarketMaker:
    """A two-outcome (yes/no) LMSR market maker.

    Attributes:
        b: liquidity parameter. Larger b means the price moves more slowly
           per unit of shares traded (deeper market, bounded worst-case
           subsidy of b * ln(2)).
    """

    def __init__(self, liquidity: float = 10.0):
        if liquidity <= 0:
            raise ValueError("liquidity must be positive")
        self.b = liquidity
        self.q_yes = 0.0
        self.q_no = 0.0

    def price_yes(self) -> float:
        """Current market-implied probability that the outcome is 'yes'."""
        e_yes = math.exp(self.q_yes / self.b)
        e_no = math.exp(self.q_no / self.b)
        return e_yes / (e_yes + e_no)

    def cost(self) -> float:
        return self.b * math.log(math.exp(self.q_yes / self.b) + math.exp(self.q_no / self.b))

    def trade(self, outcome: int, shares: float) -> float:
        """Buy `shares` (>= 0) of the given outcome (1 = yes, 0 = no).

        Returns the cost paid (== the market subsidy consumed), which is the
        price the market maker charges to move its belief. A negative
        `shares` sells shares back to the market maker.
        """
        before = self.cost()
        if outcome:
            self.q_yes += shares
        else:
            self.q_no += shares
        after = self.cost()
        return after - before

    def worst_case_loss(self) -> float:
        """Hanson's bound on the market maker's maximum possible loss."""
        return self.b * math.log(2)
