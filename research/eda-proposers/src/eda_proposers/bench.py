"""Equal-budget runner: B distinct designs per run, hypervolume of the found front / hypervolume of the true front."""
import numpy as np
from .hv import hypervolume, nondominated
from .proposers import ALL

REF = (1.1, 1.1, 1.1)


def run_once(space, cls, budget, seed):
    rng = np.random.default_rng(seed)
    prop = cls(space.sizes, rng, space.all())
    seen, order, miss = {}, [], 0
    allx = space.all()
    while len(order) < budget:
        x = prop.propose(seen)
        if x in seen:
            miss += 1
            if miss > 200:                       # stuck proposer: fall back to a random unseen design so the budget is still spent
                rest = [d for d in allx if d not in seen]
                x = rest[int(rng.integers(len(rest)))]
            else:
                continue
        miss = 0
        seen[x] = space.evaluate(x)
        order.append(x)
    return order


def curve(space, order, budgets):
    true = hypervolume(nondominated([space.evaluate(x) for x in space.all()]), REF)
    return [hypervolume(nondominated([space.evaluate(x) for x in order[:b]]), REF) / true for b in budgets]


def compare(space, budgets, seeds):
    out = {}
    for cls in ALL:
        n = 1 if cls.name == "grid" else seeds
        out[cls.name] = np.array([curve(space, run_once(space, cls, max(budgets), s), budgets) for s in range(n)])
    return out


def ci95(a):
    """Mean and 95% bootstrap percentile interval over seeds (2000 resamples, fixed seed)."""
    if len(a) == 1:
        return float(a[0]), None, None
    r = np.random.default_rng(0)
    m = [r.choice(a, len(a)).mean() for _ in range(2000)]
    return float(a.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))
