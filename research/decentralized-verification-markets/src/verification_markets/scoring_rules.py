"""Strictly proper scoring rules for binary outcomes.

A scoring rule S(p, y) rewards a probabilistic forecast p in [0, 1] for a
realized binary outcome y. It is *strictly proper* when truthfully
reporting one's belief q is the unique maximizer of expected score:

    q == argmax_p  E_{y ~ Bernoulli(q)}[S(p, y)]

Strictly proper scoring rules are the basic building block both of prediction
markets (Hanson's LMSR pays out according to a proper scoring rule) and of
peer-prediction mechanisms (which compose a scoring rule with a peer's report
used as a stand-in for the unknown ground truth).

References:
    Gneiting & Raftery (2007), "Strictly Proper Scoring Rules, Prediction,
    and Estimation", JASA.
"""

from __future__ import annotations

import math

_EPS = 1e-9


def _clip(p: float) -> float:
    return min(max(p, _EPS), 1 - _EPS)


def log_score(p: float, outcome: int) -> float:
    """Logarithmic scoring rule (strictly proper)."""
    p = _clip(p)
    return math.log(p) if outcome else math.log(1 - p)


def brier_score(p: float, outcome: int) -> float:
    """Brier (quadratic) scoring rule (strictly proper), rescaled to [0, 1]."""
    p = _clip(p)
    y = 1.0 if outcome else 0.0
    return 1.0 - (p - y) ** 2


def spherical_score(p: float, outcome: int) -> float:
    """Spherical scoring rule (strictly proper)."""
    p = _clip(p)
    denom = math.sqrt(p ** 2 + (1 - p) ** 2)
    return (p if outcome else (1 - p)) / denom


SCORING_RULES = {
    "log": log_score,
    "brier": brier_score,
    "spherical": spherical_score,
}


def expected_score(rule, report: float, true_belief: float) -> float:
    """E_{y ~ Bernoulli(true_belief)}[rule(report, y)].

    Used to numerically verify strict properness: this should be maximized
    over `report` at `report == true_belief`.
    """
    return true_belief * rule(report, 1) + (1 - true_belief) * rule(report, 0)
