"""Minority-label trust: a defense against stealth ("whitewash") adversaries.

README Follow-up 4 shows that a verifier which lies only when its signal
says "faulty" keeps a high *averaged* Peer Truth Serum score, because
faulty steps are the minority label and the lie touches few tasks. Averaged
PTS therefore hands it near-full trust while it lets fraud through.

The deviation is loud when scored *conditionally*. PTS pays
``1[match] / p(peer report) - 1``; restricting to reference peers that
reported "faulty" (0) keeps exactly the tasks where the whitewasher
deviates, and the ``1 / p(0)`` factor makes each mismatch there expensive.
``minority_pts_scores`` computes that conditional average; trust is then
centred at half the *median* verifier's score (honest verifiers are assumed
to be the majority, so the median is an honest baseline that needs no
ground truth) instead of at zero.
"""

from __future__ import annotations

import math
from statistics import median
from typing import Dict, List

from .market_maker import LMSRMarketMaker
from .peer_prediction import empirical_prior, peer_truth_serum
from .reputation import reputation_weighted_trade_size
from .simulation import SimulationResult


def minority_pts_scores(result: SimulationResult, tasks: List[int]) -> Dict[int, float]:
    """Mean PTS payoff of each verifier over (task, peer) pairs where the
    peer reported 0 ("faulty"), averaged over *all* peers (no sampling)."""
    ids = [v.id for v in result.verifiers]
    prior = empirical_prior(result.reports[i][t] for i in ids for t in tasks)
    out: Dict[int, float] = {}
    for i in ids:
        total, n = 0.0, 0
        for t in tasks:
            for p in ids:
                if p != i and result.reports[p][t] == 0:
                    total += peer_truth_serum(result.reports[i][t], 0, prior)
                    n += 1
        out[i] = total / n if n else 0.0
    return out


def minority_trust_weights(
    scores: Dict[int, float], steepness: float = 12.0, floor: float = 0.02, midpoint_frac: float = 0.5
) -> Dict[int, float]:
    """Logistic trust on ``score / median - midpoint_frac`` (so a verifier at
    the median scores ``1 - midpoint_frac`` above the midpoint)."""
    med = median(scores.values())
    if med <= 0:
        return {i: floor for i in scores}
    return {
        i: max(floor, min(1.0, 1.0 / (1.0 + math.exp(-steepness * (s / med - midpoint_frac)))))
        for i, s in scores.items()
    }


def minority_trust_market(
    result: SimulationResult,
    steepness: float = 12.0,
    combine_with_avg: bool = True,
    scale_liquidity: bool = True,
) -> List[float]:
    """LMSR prices over the scoring window with trade sizes scaled by the
    calibration-window minority trust (times the plain trust weight if
    ``combine_with_avg``, so it only ever *adds* suspicion).

    ``scale_liquidity`` shrinks the LMSR liquidity parameter ``b`` in
    proportion to the total trust mass (``sum(w) / n``). Down-weighting
    trades without doing this leaves ``b`` fixed while the net share
    position shrinks, so the price is systematically under-confident on
    clean steps. In the no-regret view of LMSR, ``b`` is an inverse learning
    rate and should track the total signal mass."""
    cfg = result.config
    w = minority_trust_weights(minority_pts_scores(result, result.calibration_tasks), steepness, cfg.trust_floor)
    if combine_with_avg:
        w = {i: w[i] * result.trust_weight[i] for i in w}
    import random

    rng = random.Random(cfg.seed + 7)
    ids = [v.id for v in result.verifiers]
    mass = sum(w.values()) / len(w) if scale_liquidity else 1.0
    prices: List[float] = []
    for t in result.scoring_tasks:
        m = LMSRMarketMaker(liquidity=cfg.market_liquidity * mass)
        order = list(ids)
        rng.shuffle(order)
        for i in order:
            m.trade(result.reports[i][t], reputation_weighted_trade_size(cfg.market_trade_size, w[i]))
        prices.append(m.price_yes())
    return prices


def rolling_minority_trust_market(
    result: SimulationResult,
    block_size: int = 50,
    decay: float = 0.5,
    recovery_decay: float | None = None,
    steepness: float = 12.0,
    scale_liquidity: bool = True,
    seed: int = 0,
) -> List[float]:
    """Rolling version of ``minority_trust_market``: block ``k`` is traded
    with weights computed only from minority-label PTS scores of earlier
    blocks (the calibration window seeds block 0), exponentially decayed.
    Defeats ``late_whitewash`` adversaries that are honest through the
    calibration window, which the frozen scheme cannot see.

    ``recovery_decay`` gives the same fast-down / slow-up asymmetry as
    ``adaptive.rolling_trust_market``. Per-block scores are noisy because a
    block holds few faulty steps, so very small blocks are unreliable."""
    import random

    up = decay if recovery_decay is None else recovery_decay
    cfg = result.config
    rng = random.Random(cfg.seed + seed + 11)
    ids = [v.id for v in result.verifiers]
    running = minority_pts_scores(result, result.calibration_tasks)
    scoring = result.scoring_tasks
    prices: List[float] = []
    for b in range(0, len(scoring), block_size):
        block = scoring[b : b + block_size]
        w = minority_trust_weights(running, steepness, cfg.trust_floor)
        mass = sum(w.values()) / len(w) if scale_liquidity else 1.0
        for t in block:
            m = LMSRMarketMaker(liquidity=cfg.market_liquidity * mass)
            order = list(ids)
            rng.shuffle(order)
            for i in order:
                m.trade(result.reports[i][t], reputation_weighted_trade_size(cfg.market_trade_size, w[i]))
            prices.append(m.price_yes())
        fresh = minority_pts_scores(result, block)
        running = {
            i: (d := decay if fresh[i] < running[i] else up) * running[i] + (1 - d) * fresh[i]
            for i in ids
        }
    return prices
