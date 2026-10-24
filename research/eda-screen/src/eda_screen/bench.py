"""Equal-synthesis runner: B distinct designs synthesised per run; hypervolume of the found front / hypervolume of the true front.

The cheap objectives (cycles, error) are treated as free for every design for the screen only; the baselines never use that
freedom. Both are charged one synthesis per design they evaluate, so B is the same for all.
"""
import numpy as np
from .hv import hypervolume, nondominated
from .proposers import Random, TPE
from .screen import Screen

REF = (1.1, 1.1, 1.1)


def make(name, space, rng):
    sizes, allx = space.sizes, space.all()
    if name == "random":
        return Random(sizes, rng, allx)
    if name == "tpe":
        return TPE(sizes, rng, allx)
    if name in ("cheaponly", "oracle"):
        return Screen(sizes, rng, allx, space, k=0, cells="const" if name == "cheaponly" else "oracle")
    if name.startswith("screen"):
        return Screen(sizes, rng, allx, space, k=int(name[6:]))
    raise ValueError(name)


def run_once(space, name, budget, seed):
    rng = np.random.default_rng(seed)
    prop = make(name, space, rng)
    seen, order, miss = {}, [], 0
    allx = space.all()
    while len(order) < budget:
        x = prop.propose(seen)
        if x in seen:
            miss += 1
            if miss > 200:
                x = [d for d in allx if d not in seen][0]
            else:
                continue
        miss = 0
        seen[x] = space.evaluate(x)
        order.append(x)
    return order


def curve(space, order, budgets):
    true = hypervolume(nondominated([space.evaluate(x) for x in space.all()]), REF)
    return [hypervolume(nondominated([space.evaluate(x) for x in order[:b]]), REF) / true for b in budgets]


def ci95(a):
    r = np.random.default_rng(0)
    m = [r.choice(a, len(a)).mean() for _ in range(2000)]
    return float(a.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))
