import random
from dataclasses import dataclass, field
from typing import List

from .environment import RegimeEnvironment, make_experts
from .mechanism import WageringMechanism
from .scoring import brier_loss


@dataclass
class RunResult:
    name: str
    loss: float                     # mean Brier loss of the aggregate
    oracle_loss: float              # mean loss of the best-in-regime expert
    regret_per_round: float
    loss_by_offset: List[float] = field(default_factory=list)  # excess loss vs oracle, by rounds since switch
    final_wealth: List[float] = field(default_factory=list)


def run(aggregators: dict, rounds: int = 3000, k: int = 3, period: int = 100,
        seed: int = 0, window: int = 20, **expert_kw) -> dict:
    """Run every aggregator on one shared stream. `aggregators` maps
    name -> object with aggregate(reports)/update(reports, outcome), or a
    WageringMechanism (settled via `settle`)."""
    env = RegimeEnvironment(k, period, seed)
    experts = make_experts(k, **expert_kw)
    rng = random.Random(seed + 1)
    loss = {n: 0.0 for n in aggregators}
    oracle = 0.0
    off = {n: [0.0] * window for n in aggregators}
    cnt = [0] * window
    for t in range(rounds):
        q, y = env.draw(t)
        reg = env.regime(t)
        reports = [f(q, reg, rng) for f in experts]
        ol = brier_loss(reports[reg], y)
        oracle += ol
        o = t % period
        if o < window:
            cnt[o] += 1
        for n, a in aggregators.items():
            if isinstance(a, WageringMechanism):
                p = a.aggregate(reports)
                a.settle(reports, y)
            else:
                p = a.aggregate(reports)
                a.update(reports, y)
            l = brier_loss(p, y)
            loss[n] += l
            if o < window:
                off[n][o] += l - ol
    out = {}
    for n, a in aggregators.items():
        out[n] = RunResult(
            n, loss[n] / rounds, oracle / rounds,
            (loss[n] - oracle) / rounds,
            [x / c for x, c in zip(off[n], cnt)],
            list(a.wealth) if isinstance(a, WageringMechanism) else [])
    return out
