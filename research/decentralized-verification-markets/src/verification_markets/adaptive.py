"""Rolling (prequential) trust: a defense against trust-farming adversaries.

``reputation.py`` bootstraps trust from a single early calibration window
and freezes it. README Limitation 4 flagged that a mechanism-aware
adversary can exploit exactly that: behave honestly through the calibration
window, collect a high trust weight, then defect for the rest of the stream
(the ``sleeper`` strategy in ``agents.py``). Frozen weights never notice.

Here trust is re-estimated continuously. The scoring stream is cut into
blocks; the trust weight applied to block ``k`` is computed *only* from PTS
payoffs on earlier blocks (so it is still out-of-sample, as in
``reputation.py``), with exponential decay so old good behavior is
forgotten at a rate set by ``decay`` (the trade-off: low decay reacts fast
to defection but is noisier for honest agents, which is the same
noise/latency trade-off as in online learning / no-regret analyses of
market makers). Trust is a lagging signal, so a sleeper still gets roughly
one block of undetected defection; ``defection_lag`` measures it.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, List

from .market_maker import LMSRMarketMaker
from .peer_prediction import empirical_prior, peer_truth_serum
from .reputation import reputation_weighted_trade_size, trust_weights
from .simulation import SimulationResult


@dataclass
class RollingTrustResult:
    block_starts: List[int]
    trust_history: Dict[int, List[float]]  # per verifier, weight applied in each block
    market_price: List[float]  # rolling-trust LMSR price per scoring task


def _block_pts_scores(result: SimulationResult, tasks: List[int], rng: random.Random) -> Dict[int, float]:
    ids = [v.id for v in result.verifiers]
    prior = empirical_prior(result.reports[i][t] for i in ids for t in tasks)
    totals = {i: 0.0 for i in ids}
    for t in tasks:
        for i in ids:
            peer = rng.choice([p for p in ids if p != i])
            totals[i] += peer_truth_serum(result.reports[i][t], result.reports[peer][t], prior)
    return {i: totals[i] / len(tasks) for i in ids}


def rolling_trust_market(
    result: SimulationResult,
    block_size: int = 50,
    decay: float = 0.5,
    seed: int = 0,
    recovery_decay: float | None = None,
) -> RollingTrustResult:
    """Re-run the trust-weighted LMSR over ``result.scoring_tasks`` with
    per-block trust from exponentially-decayed PTS scores of prior blocks
    (the calibration window seeds block 0).

    ``recovery_decay`` makes the update asymmetric ("fast down, slow up"):
    ``decay`` is used when a verifier's fresh block score is *below* its
    running score (bad news is absorbed quickly), ``recovery_decay`` when
    it is above (good news is absorbed slowly). ``None`` -> symmetric.
    Aimed at intermittent adversaries, which exploit symmetric averaging by
    letting honest phases buy back trust."""
    if not 0.0 <= decay <= 1.0:
        raise ValueError("decay must be in [0, 1]")
    if recovery_decay is not None and not 0.0 <= recovery_decay <= 1.0:
        raise ValueError("recovery_decay must be in [0, 1]")
    up = decay if recovery_decay is None else recovery_decay
    cfg = result.config
    rng = random.Random(seed)
    ids = [v.id for v in result.verifiers]

    running = _block_pts_scores(result, result.calibration_tasks, rng)
    scoring = result.scoring_tasks
    history: Dict[int, List[float]] = {i: [] for i in ids}
    prices: List[float] = []
    starts: List[int] = []
    for b in range(0, len(scoring), block_size):
        block = scoring[b : b + block_size]
        weights = trust_weights(running, steepness=cfg.trust_steepness, floor=cfg.trust_floor)
        starts.append(block[0])
        for i in ids:
            history[i].append(weights[i])
        for t in block:
            market = LMSRMarketMaker(liquidity=cfg.market_liquidity)
            order = list(ids)
            rng.shuffle(order)
            for i in order:
                market.trade(
                    result.reports[i][t],
                    reputation_weighted_trade_size(cfg.market_trade_size, weights[i]),
                )
            prices.append(market.price_yes())
        # Fold this block's (now-observed) behavior into the running score.
        fresh = _block_pts_scores(result, block, rng)
        running = {
            i: (d := decay if fresh[i] < running[i] else up) * running[i] + (1 - d) * fresh[i]
            for i in ids
        }
    return RollingTrustResult(starts, history, prices)


def brier(prices: List[float], result: SimulationResult, tasks: List[int]) -> float:
    return sum((p - result.ground_truth[t]) ** 2 for p, t in zip(prices, tasks)) / len(tasks)


def defection_lag(rr: RollingTrustResult, verifier_id: int, switch_task: int, threshold: float = 0.5) -> int:
    """Number of tasks after ``switch_task`` until the verifier's applied
    trust weight first falls below ``threshold`` (measured at block starts).
    Returns -1 if it never does."""
    for start, w in zip(rr.block_starts, rr.trust_history[verifier_id]):
        if start > switch_task and w < threshold:
            return start - switch_task
    return -1
