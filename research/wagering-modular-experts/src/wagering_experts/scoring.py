"""Bounded proper scoring for binary outcomes."""


def brier_loss(p: float, outcome: int) -> float:
    """Brier loss (p - outcome)^2, in [0, 1]. Strictly proper."""
    return (p - outcome) ** 2


def brier_score(p: float, outcome: int) -> float:
    """Brier *score* 1 - loss, in [0, 1]; higher is better.

    WSWM (Lambert et al. 2008) requires scores in [0, 1] so that payoffs are
    non-negative.
    """
    return 1.0 - brier_loss(p, outcome)
