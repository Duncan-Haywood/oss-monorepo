"""Piecewise-stationary, recurring-regime forecasting stream.

Each round a latent probability q_t is drawn; the outcome is Bernoulli(q_t).
There are K regimes that cycle 0,1,...,K-1,0,1,... every `period` rounds
(recurrence is the point: a module that was best earlier must be able to
regain influence). Module k is a *specialist*: accurate (noise `sigma_good`)
in regime k, noisy (`sigma_bad`) elsewhere. Extra non-specialist modules
model free-riders and adversaries.
"""
import random
from typing import Callable, List


def _clip(x: float) -> float:
    return min(0.999, max(0.001, x))


class RegimeEnvironment:
    def __init__(self, k: int = 3, period: int = 100, seed: int = 0):
        self.k, self.period = k, period
        self.rng = random.Random(seed)

    def regime(self, t: int) -> int:
        return (t // self.period) % self.k

    def draw(self, t: int):
        q = self.rng.uniform(0.1, 0.9)
        return q, int(self.rng.random() < q)


def make_experts(k: int, sigma_good: float = 0.05, sigma_bad: float = 0.35,
                 extras=("lazy", "adversary")) -> List[Callable]:
    """Return report functions f(q, regime, rng) -> probability."""
    def specialist(j):
        def f(q, regime, rng):
            s = sigma_good if regime == j else sigma_bad
            return _clip(q + rng.gauss(0, s))
        return f
    experts = [specialist(j) for j in range(k)]
    if "lazy" in extras:
        experts.append(lambda q, regime, rng: 0.5)
    if "adversary" in extras:
        experts.append(lambda q, regime, rng: _clip(1 - q + rng.gauss(0, 0.05)))
    return experts
