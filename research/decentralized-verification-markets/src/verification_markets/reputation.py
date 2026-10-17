"""Reputation / trust weighting for peer-prediction mechanisms.

Motivated by two limitations flagged in this package's README as "natural
next steps":

1. Correlated Agreement's pooled delta-matrix estimate is not
   collusion-resistant against a *simultaneously* deviating block, because
   it pools every reporter's history into one shared same-task-correlation
   estimate (see ``peer_prediction.py``'s module docstring and
   ``tests/test_simulation.py::test_ca_is_vulnerable_to_simultaneous_correlated_deviation``).
   The README names "per-agent-pair delta estimation ... or an explicit
   collusion-detection pass before scoring" as the fix.
2. The LMSR aggregator weights every trade equally regardless of the
   trader's track record; the README names down-weighting known-bad actors
   by their historical peer-prediction score as the natural extension.

This module bootstraps a per-verifier trust weight from Peer Truth Serum
payoffs measured on a *held-out calibration window* -- so estimating trust
and scoring on it later never touch the same reports, closing this
package's third README limitation (circular in-sample prior/delta
estimation) along the way -- then uses that trust weight to:

- down-weight low-trust reporter pairs out of the Correlated Agreement
  delta-matrix estimate (``trust_weighted_correlated_agreement_matrix``),
  and
- scale their LMSR trade size (``reputation_weighted_trade_size``),

so persistent free-riders and colluders are discovered from their own
calibration-window behavior and discounted automatically, rather than
needing to be labeled ahead of time. PTS, not CA, is used as the trust
signal, because this package's own simulation already found PTS robust to
simultaneous correlated deviation where CA is not -- bootstrapping CA's
robustness off of PTS's is the point.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from typing import Dict, List, Tuple

from .peer_prediction import peer_truth_serum

_EPS = 1e-9


def pts_calibration_scores(
    reports_by_agent: Dict[int, Dict[int, int]],
    calibration_tasks: List[int],
    prior_prob_one: float,
    rng: random.Random,
) -> Dict[int, float]:
    """Average per-task PTS payoff for each agent, measured only on
    ``calibration_tasks`` and scored against one random peer per task.

    Intended to be called on a task window disjoint from whatever window is
    later used to *score* mechanisms with the resulting trust weights, so
    trust estimation cannot be gamed by the very reports it is scoring.
    """
    agents = list(reports_by_agent)
    totals: Dict[int, float] = {a: 0.0 for a in agents}
    for t in calibration_tasks:
        for a in agents:
            peers = [p for p in agents if p != a]
            if not peers:
                continue
            peer = rng.choice(peers)
            totals[a] += peer_truth_serum(
                reports_by_agent[a][t], reports_by_agent[peer][t], prior_prob_one
            )
    n = max(1, len(calibration_tasks))
    return {a: totals[a] / n for a in agents}


def trust_weights(
    calibration_scores: Dict[int, float], steepness: float = 1.0, floor: float = 0.02
) -> Dict[int, float]:
    """Squash calibration-window PTS scores into trust weights in [floor, 1].

    A logistic squash centered at 0: an agent whose calibration-window
    average PTS payoff is comfortably positive (honest reporting under PTS
    earns strictly positive expected payoff) gets weight -> 1; an agent whose
    score is ~0 or negative (any uninformative fixed/random strategy earns
    ~0 under PTS; adversarial/anti-correlated strategies earn negative) gets
    weight -> ``floor``. ``floor`` is kept strictly positive rather than 0 so
    a temporarily-unlucky honest agent is discounted, not permanently
    silenced, by one calibration window.
    """
    weights = {}
    for agent, score in calibration_scores.items():
        w = 1.0 / (1.0 + math.exp(-steepness * score))
        weights[agent] = max(floor, min(1.0, w))
    return weights


def trust_weighted_correlated_agreement_matrix(
    reports_by_agent: Dict[int, Dict[int, int]],
    weights: Dict[int, float],
    rng: random.Random,
    n_shuffles: int = 200,
) -> Dict[Tuple[int, int], float]:
    """Same estimator as ``peer_prediction.correlated_agreement_matrix``, but
    each pair's contribution to the same-task / different-task counts is
    weighted by ``min(weight_a, weight_b)``, so a pair where either side has
    low calibration-window trust barely influences the estimate. A
    coordinated low-trust block's mutual "always agree" correlation is
    exactly what this is meant to filter out, since it is what let such a
    block free-ride on the unweighted estimator
    (see the module docstring and this package's README, Limitations §1).
    """
    agents = list(reports_by_agent)
    same_counts: Dict[Tuple[int, int], float] = defaultdict(float)
    same_total = 0.0
    for a_idx, agent_a in enumerate(agents):
        for agent_b in agents[a_idx + 1 :]:
            pair_w = min(weights.get(agent_a, 0.0), weights.get(agent_b, 0.0))
            if pair_w <= 0:
                continue
            shared_tasks = set(reports_by_agent[agent_a]) & set(reports_by_agent[agent_b])
            for t in shared_tasks:
                x = reports_by_agent[agent_a][t]
                y = reports_by_agent[agent_b][t]
                same_counts[(x, y)] += pair_w
                same_total += pair_w

    diff_counts: Dict[Tuple[int, int], float] = defaultdict(float)
    diff_total = 0.0
    for a_idx, agent_a in enumerate(agents):
        tasks_a = list(reports_by_agent[agent_a])
        for agent_b in agents[a_idx + 1 :]:
            pair_w = min(weights.get(agent_a, 0.0), weights.get(agent_b, 0.0))
            if pair_w <= 0:
                continue
            tasks_b = list(reports_by_agent[agent_b])
            if not tasks_a or not tasks_b:
                continue
            for _ in range(n_shuffles):
                t_a = rng.choice(tasks_a)
                t_b = rng.choice(tasks_b)
                if t_a == t_b:
                    continue
                x = reports_by_agent[agent_a][t_a]
                y = reports_by_agent[agent_b][t_b]
                diff_counts[(x, y)] += pair_w
                diff_total += pair_w

    delta: Dict[Tuple[int, int], float] = {}
    for x in (0, 1):
        for y in (0, 1):
            p_same = same_counts[(x, y)] / same_total if same_total else 0.0
            p_diff = diff_counts[(x, y)] / diff_total if diff_total else 0.0
            delta[(x, y)] = p_same - p_diff
    return delta


def reputation_weighted_trade_size(base_size: float, weight: float) -> float:
    """Scale an LMSR trade's share size by the trader's trust weight, so a
    low-trust reporter's trade moves the market price less."""
    return base_size * weight


def reputation_weighted_payment(payment: float, own_weight: float) -> float:
    """Scale a peer-prediction payment by the *payee's own* calibration-window
    trust weight.

    This turned out to be necessary in addition to, not instead of,
    ``trust_weighted_correlated_agreement_matrix``: down-weighting low-trust
    pairs out of the delta-matrix *estimate* concentrates that estimate on
    genuine honest-honest correlation and so *increases* its magnitude
    (verified empirically -- see ``tests/test_reputation.py``), which on its
    own makes a colluding block's free ride on ``delta[(1, 1)]`` more, not
    less, lucrative. Also discounting the final payment by the payee's own
    trust weight closes that gap: a colluding/lazy agent's calibration-window
    PTS score already flags it as low-trust, so its CA payment is discounted
    directly, on top of (not merely via) the cleaner delta matrix.
    """
    return payment * own_weight
