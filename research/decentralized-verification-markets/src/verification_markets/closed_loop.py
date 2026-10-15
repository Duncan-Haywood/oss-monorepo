"""Closed-loop (trust-observing) whitewash adversary vs. rolling minority trust.

README Follow-up 6 could only sweep a *static* lie rate, because in
``simulation.py`` reports are generated before any mechanism runs, so an
agent cannot see its own trust weight. Here the loop is closed: reports for
block ``k`` are generated *after* the mechanism has computed the weights it
will apply to block ``k`` (from blocks ``< k``, as in
``stealth.rolling_minority_trust_market``), and each adversary picks its
lie probability for the block from its own weight -- a white-box adversary,
which is the worst case for a defender whose weights are public on-chain.

Adversaries start from the honest reports of a ``late_whitewash`` population
built with ``whitewash_prob=0`` (their private signal is their honest
report); on "faulty" (0) signals they report "correct" with the block's lie
probability. Controllers:

- ``fixed``: constant lie probability (the static baseline).
- ``threshold``: lie always while weight >= ``high``, stop until weight has
  recovered to ``high`` once it falls below ``low`` (hysteresis: spend trust,
  then farm it back).
- ``proportional``: ``p = clip(gain * (w - w_min), 0, 1)``: lie more the more
  trust is banked, ease off as it drains.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, replace
from typing import Callable, Dict, List

from .market_maker import LMSRMarketMaker
from .reputation import reputation_weighted_trade_size
from .simulation import SimulationResult
from .stealth import minority_pts_scores, minority_trust_weights


@dataclass
class ClosedLoopOutcome:
    prices: List[float]
    lie_prob_history: List[float]  # mean adversary lie prob applied in each block
    adv_weight_history: List[float]  # mean adversary trust weight in each block
    lie_rate: float  # realised: fraction of adversary "faulty" signals reported "correct"
    missed_fraud: float  # fraction of faulty scoring tasks priced > 0.5 (accepted)
    plain_prices: List[float]  # unweighted LMSR on the same (adaptively lied) reports


Controller = Callable[[float, "dict"], float]  # (own weight, state) -> lie prob


def fixed(p: float) -> Controller:
    return lambda w, s: p


def threshold(low: float = 0.3, high: float = 0.8) -> Controller:
    def ctl(w: float, s: dict) -> float:
        if s.get("lying", True) and w < low:
            s["lying"] = False
        elif not s.get("lying", True) and w >= high:
            s["lying"] = True
        return 1.0 if s.get("lying", True) else 0.0

    return ctl


def proportional(gain: float = 2.0, w_min: float = 0.2) -> Controller:
    return lambda w, s: max(0.0, min(1.0, gain * (w - w_min)))


def run_closed_loop(
    base: SimulationResult,
    adversary_ids: List[int],
    controller: Callable[[], Controller],
    block_size: int = 50,
    decay: float = 0.5,
    steepness: float = 12.0,
    seed: int = 0,
    observation_noise: float | None = 0.0,
    recovery_decay: float | None = None,
) -> ClosedLoopOutcome:
    """Defences (README Follow-up 8): ``observation_noise`` is the s.d. of
    Gaussian noise added to the weight each adversary *observes* (private /
    randomised weights; ``None`` hides the weight entirely, the controller
    then sees a constant 1.0). ``recovery_decay`` is the slower decay applied
    when a block's score beats the running score (fast-down / slow-up, as in
    ``stealth.rolling_minority_trust_market``); ``None`` = symmetric.

    ``base`` must hold *honest* reports for the adversaries (build it with
    ``whitewash_prob=0.0``); ``controller`` is a factory so each adversary
    keeps its own state. Adversaries only lie inside the scoring window."""
    cfg = base.config
    rng = random.Random(cfg.seed + seed + 23)
    ids = [v.id for v in base.verifiers]
    reports = {i: dict(base.reports[i]) for i in ids}
    work = replace(base, reports=reports)
    ctls = {a: controller() for a in adversary_ids}
    states: Dict[int, dict] = {a: {} for a in adversary_ids}

    running = minority_pts_scores(work, work.calibration_tasks)
    scoring = work.scoring_tasks
    prices: List[float] = []
    lie_hist: List[float] = []
    w_hist: List[float] = []
    lied = seen = 0
    for b in range(0, len(scoring), block_size):
        block = scoring[b : b + block_size]
        w = minority_trust_weights(running, steepness, cfg.trust_floor)
        # Adversaries observe their weight, then choose this block's lie rate.
        def seen_w(a: int) -> float:
            if observation_noise is None:
                return 1.0
            if observation_noise == 0.0:
                return w[a]
            return max(0.0, min(1.0, w[a] + rng.gauss(0.0, observation_noise)))

        probs = {a: ctls[a](seen_w(a), states[a]) for a in adversary_ids}
        for a in adversary_ids:
            for t in block:
                if reports[a][t] == 0:
                    seen += 1
                    if rng.random() < probs[a]:
                        reports[a][t] = 1
                        lied += 1
        lie_hist.append(sum(probs.values()) / len(probs))
        w_hist.append(sum(w[a] for a in adversary_ids) / len(adversary_ids))
        mass = sum(w.values()) / len(w)
        for t in block:
            m = LMSRMarketMaker(liquidity=cfg.market_liquidity * mass)
            order = list(ids)
            rng.shuffle(order)
            for i in order:
                m.trade(reports[i][t], reputation_weighted_trade_size(cfg.market_trade_size, w[i]))
            prices.append(m.price_yes())
        fresh = minority_pts_scores(work, block)
        up = decay if recovery_decay is None else recovery_decay
        running = {
            i: (d := decay if fresh[i] < running[i] else up) * running[i] + (1 - d) * fresh[i]
            for i in ids
        }
    faulty = [(p, t) for p, t in zip(prices, scoring) if base.ground_truth[t] == 0]
    missed = sum(p > 0.5 for p, _ in faulty) / len(faulty) if faulty else 0.0
    plain: List[float] = []
    for t in scoring:
        m = LMSRMarketMaker(liquidity=cfg.market_liquidity)
        for i in ids:
            m.trade(reports[i][t], cfg.market_trade_size)
        plain.append(m.price_yes())
    return ClosedLoopOutcome(prices, lie_hist, w_hist, lied / seen if seen else 0.0, missed, plain)
