"""Evaluation metrics for a SimulationResult.

Includes an empirical analogue of the manipulation-vulnerability bound from
Gensyn's "Credibly Neutral AI Oracles" (Monroe & Andrade): that paper bounds
the probability a supermajority-dispute mechanism reaches the wrong verdict
by eps * (1 - eps), where eps is the fraction of misreporting participants.
Here we measure the empirical wrong-verdict rate of a majority-vote
aggregator as a function of the fraction of non-honest verifiers, for
comparison against that theoretical curve.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List

from .agents import STRATEGIES
from .simulation import SimulationResult


def average_payoff_by_strategy(
    result: SimulationResult, payoff: Dict[int, float]
) -> Dict[str, float]:
    totals: Dict[str, float] = defaultdict(float)
    counts: Dict[str, int] = defaultdict(int)
    for v in result.verifiers:
        totals[v.strategy] += payoff[v.id]
        counts[v.strategy] += 1
    return {
        strategy: totals[strategy] / counts[strategy]
        for strategy in STRATEGIES
        if counts[strategy] > 0
    }


def incentive_compatibility_gap(payoff_by_strategy: Dict[str, float]) -> float:
    """honest average payoff minus the best-performing deviating strategy.

    Positive means honest reporting is (empirically) the strictly best
    strategy on average -- the mechanism is incentive-compatible against
    the deviations modeled here.
    """
    if "honest" not in payoff_by_strategy:
        raise ValueError("no honest verifiers in this simulation")
    others = [v for k, v in payoff_by_strategy.items() if k != "honest"]
    if not others:
        return float("inf")
    return payoff_by_strategy["honest"] - max(others)


def market_brier_score(result: SimulationResult) -> float:
    """Mean Brier score of the LMSR price against ground truth (lower is
    better calibrated; 0 is perfect, 0.25 is an uninformative p=0.5 market
    when the base rate is 50/50)."""
    errors = [
        (p - gt) ** 2 for p, gt in zip(result.market_price, result.ground_truth)
    ]
    return sum(errors) / len(errors)


def majority_vote_verdicts(result: SimulationResult) -> List[int]:
    verdicts = []
    for t in range(result.config.n_tasks):
        votes = [result.reports[v.id][t] for v in result.verifiers]
        verdicts.append(1 if sum(votes) * 2 >= len(votes) else 0)
    return verdicts


def majority_vote_error_rate(result: SimulationResult) -> float:
    verdicts = majority_vote_verdicts(result)
    wrong = sum(1 for v, gt in zip(verdicts, result.ground_truth) if v != gt)
    return wrong / len(verdicts)


def non_honest_fraction(result: SimulationResult) -> float:
    non_honest = sum(1 for v in result.verifiers if v.strategy != "honest")
    return non_honest / len(result.verifiers)


def theoretical_manipulation_bound(eps: float) -> float:
    """The eps * (1 - eps) bound from Credibly Neutral AI Oracles."""
    return eps * (1 - eps)


def average_trust_weight_by_strategy(result: SimulationResult) -> Dict[str, float]:
    """Average calibration-window trust weight (see reputation.py) per
    strategy -- shows whether the trust bootstrap actually separates honest
    reporters from lazy/colluding/adversarial ones without being told which
    is which ahead of time."""
    totals: Dict[str, float] = defaultdict(float)
    counts: Dict[str, int] = defaultdict(int)
    for v in result.verifiers:
        totals[v.strategy] += result.trust_weight.get(v.id, 0.0)
        counts[v.strategy] += 1
    return {
        strategy: totals[strategy] / counts[strategy]
        for strategy in STRATEGIES
        if counts[strategy] > 0
    }


def scoring_window_market_brier_scores(result: SimulationResult) -> Dict[str, float]:
    """Brier score of the unweighted vs. trust-weighted LMSR market, both
    measured only on `result.scoring_tasks` (held out from trust
    calibration) -- a fair apples-to-apples comparison of whether
    reputation-weighting trade size (see reputation.py) improves
    calibration."""
    truths = [result.ground_truth[t] for t in result.scoring_tasks]

    def _brier(prices: List[float]) -> float:
        return sum((p - gt) ** 2 for p, gt in zip(prices, truths)) / len(truths)

    return {
        "plain": _brier(result.market_price_scoring),
        "trust_weighted": _brier(result.market_price_trust),
    }


def audit_cost_savings(result: SimulationResult) -> float:
    """Fraction of tasks that avoid full ground-truth recomputation.

    1.0 means every task was priced by peer prediction alone; 0.0 means
    every task still needed a full recompute (Verde's baseline).
    """
    n_audited = len(result.audited_tasks)
    return 1.0 - (n_audited / result.config.n_tasks)
