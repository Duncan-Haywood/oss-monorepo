"""Simulation harness: a population of verifiers reports on a stream of
synthetic decentralized-ML-training "tasks" (steps that are either computed
correctly or are faulty/fraudulent), and three mechanisms price / aggregate
those reports:

1. Peer Truth Serum (PTS) payments per verifier.
2. Correlated Agreement (CA) payments per verifier.
3. An LMSR market maker that aggregates all reports on a task into a single
   calibrated probability of correctness.

The goal is to measure, without ever using ground truth to pay verifiers
(ground truth is only used for audit-cost accounting and for evaluating
mechanism quality after the fact):

- Incentive compatibility: does the "honest" strategy earn a higher average
  payoff than "lazy", "colluding", or "adversarial" strategies?
- Aggregate accuracy: how well does the LMSR price (or a majority vote of
  reports) track ground truth?
- Cost savings vs. Verde-style "recompute everything": how much of the task
  stream needs true ground-truth auditing if peer prediction handles the
  rest?
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List

from .agents import Verifier, generate_tasks
from .market_maker import LMSRMarketMaker
from .peer_prediction import (
    ca_payment,
    correlated_agreement_matrix,
    empirical_prior,
    peer_truth_serum,
)
from .reputation import (
    pts_calibration_scores,
    reputation_weighted_payment,
    reputation_weighted_trade_size,
    trust_weighted_correlated_agreement_matrix,
)
from .reputation import trust_weights as compute_trust_weights


@dataclass
class SimulationConfig:
    n_tasks: int = 400
    corruption_rate: float = 0.15
    signal_noise: float = 0.1
    n_honest: int = 12
    n_lazy: int = 3
    n_colluding: int = 3
    n_adversarial: int = 2
    n_sleeper: int = 0
    n_intermittent: int = 0
    n_whitewash: int = 0
    n_late_whitewash: int = 0
    n_intermittent_whitewash: int = 0
    whitewash_prob: float = 0.5
    intermittent_period: int = 100
    intermittent_defect_fraction: float = 0.5
    # Task index at which sleepers defect; None -> end of calibration window.
    sleeper_switch_task: int | None = None
    market_liquidity: float = 5.0
    market_trade_size: float = 1.0
    audit_fraction: float = 0.05
    calibration_fraction: float = 0.3
    trust_steepness: float = 12.0
    trust_floor: float = 0.02
    seed: int = 0


@dataclass
class SimulationResult:
    config: SimulationConfig
    verifiers: List[Verifier]
    ground_truth: List[int]
    reports: Dict[int, Dict[int, int]]  # {verifier_id: {task_id: report}}
    pts_payoff: Dict[int, float]
    ca_payoff: Dict[int, float]
    market_price: List[float]  # per task, price_yes after all reports traded
    audited_tasks: List[int] = field(default_factory=list)
    # Held-out calibration / trust-weighting extension (see reputation.py):
    # everything below is estimated from `calibration_tasks` and scored only
    # on the disjoint `scoring_tasks`, so trust estimation and mechanism
    # scoring never share reports.
    calibration_tasks: List[int] = field(default_factory=list)
    scoring_tasks: List[int] = field(default_factory=list)
    trust_weight: Dict[int, float] = field(default_factory=dict)
    ca_scoring_payoff: Dict[int, float] = field(default_factory=dict)
    ca_trust_payoff: Dict[int, float] = field(default_factory=dict)
    market_price_scoring: List[float] = field(default_factory=list)
    market_price_trust: List[float] = field(default_factory=list)


def _build_verifiers(config: SimulationConfig) -> List[Verifier]:
    verifiers: List[Verifier] = []
    vid = 0
    for _ in range(config.n_honest):
        verifiers.append(Verifier(vid, "honest", config.signal_noise))
        vid += 1
    for _ in range(config.n_lazy):
        verifiers.append(Verifier(vid, "lazy", config.signal_noise))
        vid += 1
    for _ in range(config.n_colluding):
        verifiers.append(Verifier(vid, "colluding", config.signal_noise))
        vid += 1
    for _ in range(config.n_adversarial):
        verifiers.append(Verifier(vid, "adversarial", config.signal_noise))
        vid += 1
    switch = config.sleeper_switch_task
    if switch is None:
        switch = int(round(config.n_tasks * config.calibration_fraction))
    for _ in range(config.n_sleeper):
        verifiers.append(Verifier(vid, "sleeper", config.signal_noise, switch_task=switch))
        vid += 1
    for _ in range(config.n_intermittent):
        verifiers.append(
            Verifier(
                vid, "intermittent", config.signal_noise, switch_task=switch,
                period=config.intermittent_period,
                defect_fraction=config.intermittent_defect_fraction,
            )
        )
        vid += 1
    for _ in range(config.n_whitewash):
        verifiers.append(
            Verifier(vid, "whitewash", config.signal_noise, whitewash_prob=config.whitewash_prob)
        )
        vid += 1
    for _ in range(config.n_late_whitewash):
        verifiers.append(
            Verifier(
                vid, "late_whitewash", config.signal_noise, switch_task=switch,
                whitewash_prob=config.whitewash_prob,
            )
        )
        vid += 1
    for _ in range(config.n_intermittent_whitewash):
        verifiers.append(
            Verifier(
                vid, "intermittent_whitewash", config.signal_noise, switch_task=switch,
                period=config.intermittent_period,
                defect_fraction=config.intermittent_defect_fraction,
                whitewash_prob=config.whitewash_prob,
            )
        )
        vid += 1
    return verifiers


def run_simulation(config: SimulationConfig) -> SimulationResult:
    rng = random.Random(config.seed)
    verifiers = _build_verifiers(config)
    ground_truth = generate_tasks(config.n_tasks, config.corruption_rate, rng)

    # Each verifier reports on every task.
    reports: Dict[int, Dict[int, int]] = {v.id: {} for v in verifiers}
    for t, truth in enumerate(ground_truth):
        for v in verifiers:
            reports[v.id][t] = v.report(truth, rng, t)

    all_reports_flat = [r for by_task in reports.values() for r in by_task.values()]
    global_prior = empirical_prior(all_reports_flat)

    # Peer Truth Serum: pay each verifier against one random peer per task.
    pts_payoff: Dict[int, float] = {v.id: 0.0 for v in verifiers}
    for t in range(config.n_tasks):
        reporters = [v for v in verifiers]
        for v in reporters:
            peers = [p for p in reporters if p.id != v.id]
            if not peers:
                continue
            peer = rng.choice(peers)
            pts_payoff[v.id] += peer_truth_serum(
                reports[v.id][t], reports[peer.id][t], global_prior
            )

    # Correlated Agreement: build the delta matrix from the full report
    # history, then pay each verifier against one random peer per task.
    delta = correlated_agreement_matrix(reports, rng)
    ca_payoff: Dict[int, float] = {v.id: 0.0 for v in verifiers}
    for t in range(config.n_tasks):
        reporters = [v for v in verifiers]
        for v in reporters:
            peers = [p for p in reporters if p.id != v.id]
            if not peers:
                continue
            peer = rng.choice(peers)
            ca_payoff[v.id] += ca_payment(reports[v.id][t], reports[peer.id][t], delta)

    # LMSR aggregation: one fresh market per task, verifiers trade in a
    # random order, final price is the aggregate probability the step was
    # computed correctly.
    market_price: List[float] = []
    for t in range(config.n_tasks):
        market = LMSRMarketMaker(liquidity=config.market_liquidity)
        order = list(verifiers)
        rng.shuffle(order)
        for v in order:
            market.trade(reports[v.id][t], config.market_trade_size)
        market_price.append(market.price_yes())

    n_audited = max(1, int(round(config.n_tasks * config.audit_fraction)))
    audited_tasks = rng.sample(range(config.n_tasks), k=min(n_audited, config.n_tasks))

    # --- Held-out calibration / trust-weighting extension ---
    # Split the stream into an early calibration window and a later scoring
    # window. Trust weights are bootstrapped from PTS payoffs measured only
    # on the calibration window, then used to (a) down-weight low-trust
    # pairs out of the CA delta-matrix estimate and (b) scale LMSR trade
    # sizes -- both estimated/measured only on the scoring window, so no
    # step here reuses reports it has already used to estimate something it
    # is about to score.
    n_calibration = max(1, min(config.n_tasks - 1, int(round(config.n_tasks * config.calibration_fraction))))
    calibration_tasks = list(range(n_calibration))
    scoring_tasks = list(range(n_calibration, config.n_tasks))

    calibration_reports = {
        v.id: {t: reports[v.id][t] for t in calibration_tasks} for v in verifiers
    }
    calibration_prior = empirical_prior(
        r for by_task in calibration_reports.values() for r in by_task.values()
    )
    calibration_scores = pts_calibration_scores(
        calibration_reports, calibration_tasks, calibration_prior, rng
    )
    trust_weight = compute_trust_weights(
        calibration_scores, steepness=config.trust_steepness, floor=config.trust_floor
    )

    trust_delta = trust_weighted_correlated_agreement_matrix(calibration_reports, trust_weight, rng)
    plain_calibration_delta = correlated_agreement_matrix(calibration_reports, rng)

    ca_scoring_payoff: Dict[int, float] = {v.id: 0.0 for v in verifiers}
    ca_trust_payoff: Dict[int, float] = {v.id: 0.0 for v in verifiers}
    for t in scoring_tasks:
        for v in verifiers:
            peers = [p for p in verifiers if p.id != v.id]
            if not peers:
                continue
            peer = rng.choice(peers)
            ca_scoring_payoff[v.id] += ca_payment(
                reports[v.id][t], reports[peer.id][t], plain_calibration_delta
            )
            ca_trust_payoff[v.id] += reputation_weighted_payment(
                ca_payment(reports[v.id][t], reports[peer.id][t], trust_delta),
                trust_weight.get(v.id, 1.0),
            )

    market_price_scoring: List[float] = []
    market_price_trust: List[float] = []
    for t in scoring_tasks:
        plain_market = LMSRMarketMaker(liquidity=config.market_liquidity)
        trust_market = LMSRMarketMaker(liquidity=config.market_liquidity)
        order = list(verifiers)
        rng.shuffle(order)
        for v in order:
            plain_market.trade(reports[v.id][t], config.market_trade_size)
            trust_market.trade(
                reports[v.id][t],
                reputation_weighted_trade_size(config.market_trade_size, trust_weight.get(v.id, 1.0)),
            )
        market_price_scoring.append(plain_market.price_yes())
        market_price_trust.append(trust_market.price_yes())

    return SimulationResult(
        config=config,
        verifiers=verifiers,
        ground_truth=ground_truth,
        reports=reports,
        pts_payoff=pts_payoff,
        ca_payoff=ca_payoff,
        market_price=market_price,
        audited_tasks=audited_tasks,
        calibration_tasks=calibration_tasks,
        scoring_tasks=scoring_tasks,
        trust_weight=trust_weight,
        ca_scoring_payoff=ca_scoring_payoff,
        ca_trust_payoff=ca_trust_payoff,
        market_price_scoring=market_price_scoring,
        market_price_trust=market_price_trust,
    )
