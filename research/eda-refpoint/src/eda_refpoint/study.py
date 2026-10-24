"""Run each proposer once per seed to budget B, then score the same runs under many indicators.

Reuses `eda-proposers` (table, proposers, run_once) unchanged; only the scoring is new."""
import os
import sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "eda-proposers", "src"))
from eda_proposers import bench, proposers, table          # noqa: E402
from eda_proposers.hv import nondominated                  # noqa: E402
from . import indicators as ind                            # noqa: E402

TABLE = os.path.join(HERE, "..", "..", "..", "eda-proposers", "experiments", "table.jsonl")
STOCH = [c for c in proposers.ALL if c.name != "grid"]


def logspace(rows):
    """The same space with cell counts on a log scale before min-max scaling (a ratio, not a difference, of cells matters)."""
    rows = [dict(r, cells=float(np.log(r["cells"]))) for r in rows]
    return table.Space(rows)


def orders(space, budget, seeds):
    return {c.name: [bench.run_once(space, c, budget, s) for s in range(seeds)] for c in STOCH}


def score(space, order_lists, budget, metric):
    """metric(found_points, true_front) -> float; returns {proposer: array over seeds}."""
    true = nondominated([space.evaluate(x) for x in space.all()])
    return {n: np.array([metric([space.evaluate(x) for x in o[:budget]], true) for o in os_])
            for n, os_ in order_lists.items()}


def kendall(a, b):
    """Kendall tau-a between two score vectors over the same items (ties count as neither)."""
    n, s = len(a), 0
    for i in range(n):
        for j in range(i + 1, n):
            s += np.sign(a[i] - a[j]) * np.sign(b[i] - b[j])
    return s / (n * (n - 1) / 2)
