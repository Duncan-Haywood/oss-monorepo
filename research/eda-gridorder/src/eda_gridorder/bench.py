"""Hypervolume-vs-budget curves of each order, on the `eda-proposers` table (stdlib; reuses its hypervolume and Space)."""
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "eda-proposers", "src"))
from eda_proposers import hv, table  # noqa: E402
from .orders import ORDERS  # noqa: E402

REF = (1.1, 1.1, 1.1)


_TRUE = {}


def true_hv(space):
    if id(space) not in _TRUE:
        _TRUE[id(space)] = hv.hypervolume(hv.nondominated([space.evaluate(x) for x in space.all()]), REF)
    return _TRUE[id(space)]


def curve(space, order, budgets):
    """Fraction of the true-front hypervolume after the first b designs of `order`, for each b in budgets (incremental front)."""
    true, front, last, out, want = true_hv(space), [], 0.0, [], set(budgets)
    for i, x in enumerate(order[:max(budgets)], 1):
        y = space.evaluate(x)
        if not any(q == y or hv.dominated(y, q) for q in front):
            front = [q for q in front if not hv.dominated(q, y)] + [y]
            last = hv.hypervolume(front, REF) / true
        if i in want:
            out.append(last)
    return out


def all_curves(space, budgets, seeds):
    sizes, ds = space.sizes, space.all()
    out = {}
    for name, (fn, stoch) in ORDERS.items():
        n = seeds if stoch else 1
        out[name] = [curve(space, fn(ds, sizes, random.Random(s) if stoch else None), budgets) for s in range(n)]
    return out


def mean_ci(vals, seed=0, n=2000):
    """Mean and 95% bootstrap percentile interval; (m, None, None) for a single run."""
    if len(vals) == 1:
        return vals[0], None, None
    r = random.Random(seed)
    ms = sorted(sum(r.choice(vals) for _ in vals) / len(vals) for _ in range(n))
    return sum(vals) / len(vals), ms[int(.025 * n)], ms[int(.975 * n)]


def first_budget_at(curve_full, frac):
    """Smallest budget whose found front reaches `frac` of the true hypervolume; curve_full[b-1] is the value at budget b."""
    return next(b for b, v in enumerate(curve_full, 1) if v >= frac)
