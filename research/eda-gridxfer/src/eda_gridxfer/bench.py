"""Grid-order replay on the `eda-surrogate` dataset: objectives (cells, cycles) for the `mac` and `fir` families.

Stdlib only. Orders come from `eda-gridorder`, hypervolume from `eda-proposers`; nothing is synthesised here.
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..", "..")
sys.path.insert(0, os.path.join(R, "eda-gridorder", "src"))
sys.path.insert(0, os.path.join(R, "eda-proposers", "src"))
from eda_gridorder.orders import ORDERS  # noqa: E402
from eda_gridorder.bench import mean_ci, first_budget_at  # noqa: E402,F401
from eda_proposers import hv  # noqa: E402

DATA = os.path.join(R, "eda-surrogate", "experiments", "dataset.jsonl")
AXES = {"mac": ("p", "w"), "fir": ("taps", "lanes", "w")}
REF = (1.1, 1.1)


class Space:
    """Index-coded design space; objectives (cells, cycles) scaled to [0, 1] over the family, both minimised."""

    def __init__(self, rows, axes):
        self.levels = [sorted({r["params"][a] for r in rows}) for a in axes]
        self.sizes = [len(v) for v in self.levels]
        raw = {tuple(lv.index(r["params"][a]) for a, lv in zip(axes, self.levels)): (float(r["cells"]), float(r["cycles"])) for r in rows}
        assert len(raw) == len(rows) == len(rows)
        lo = [min(v[i] for v in raw.values()) for i in range(2)]
        hi = [max(v[i] for v in raw.values()) for i in range(2)]
        self.t = {k: tuple((x - l) / (h - l) for x, l, h in zip(v, lo, hi)) for k, v in raw.items()}

    def all(self):
        return list(self.t)

    def evaluate(self, x):
        return self.t[x]


def load(family, path=DATA):
    rows = [json.loads(l) for l in open(path)]
    return Space([r for r in rows if r["family"] == family], AXES[family])


def true_front(space):
    return hv.nondominated(list(space.t.values()))


def curve(space, order, upto=None):
    """Fraction of the true-front hypervolume after each prefix of `order` (list, index b-1 = budget b)."""
    true = hv.hypervolume(true_front(space), REF)
    front, last, out = [], 0.0, []
    for x in order[:upto]:
        y = space.evaluate(x)
        if not any(q == y or hv.dominated(y, q) for q in front):
            front = [q for q in front if not hv.dominated(q, y)] + [y]
            last = hv.hypervolume(front, REF) / true
        out.append(last)
    return out


def all_curves(space, seeds):
    ds, out = space.all(), {}
    for name, (fn, stoch) in ORDERS.items():
        out[name] = [curve(space, fn(ds, space.sizes, random.Random(s) if stoch else None)) for s in range(seeds if stoch else 1)]
    return out
