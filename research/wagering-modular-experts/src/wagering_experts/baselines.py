"""Non-incentive baselines that see the same reports."""
import math
from typing import Sequence

from .scoring import brier_loss


class EqualWeights:
    name = "equal"

    def __init__(self, n: int):
        self.n = n

    def aggregate(self, reports: Sequence[float]) -> float:
        return sum(reports) / self.n

    def update(self, reports: Sequence[float], outcome: int) -> None:
        pass


class Hedge:
    """Exponential weights on Brier loss, with optional fixed share."""

    def __init__(self, n: int, eta: float = 2.0, alpha: float = 0.0):
        self.w = [1.0 / n] * n
        self.eta, self.alpha, self.n = eta, alpha, n
        self.name = f"hedge(eta={eta},a={alpha})"

    def aggregate(self, reports: Sequence[float]) -> float:
        return sum(w * r for w, r in zip(self.w, reports))

    def update(self, reports: Sequence[float], outcome: int) -> None:
        w = [wi * math.exp(-self.eta * brier_loss(r, outcome))
             for wi, r in zip(self.w, reports)]
        z = sum(w)
        w = [x / z for x in w]
        self.w = [(1 - self.alpha) * x + self.alpha / self.n for x in w]
