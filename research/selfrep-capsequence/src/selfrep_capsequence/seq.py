"""In what ORDER should a replicating shop learn process capabilities?

``selfrep-capability`` picks the best SET for a budget. A shop learns one capability at a time, so the real choice is
a sequence. Score a sequence by closure-weeks: the area under the closure-against-time curve up to a horizon, where
closure steps up when each capability finishes (efforts are ASSUMED, in weeks, from ``selfrep-capability``). With 9
capabilities all 9! = 362,880 orders are enumerated, so the optimum is exact. Compared with the order that follows the
set-optimal frontier of ``selfrep-capability`` (cheapest-first nesting is not guaranteed) and two simple rules.
"""
import itertools
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-capability" / "src"))
from selfrep_capability import capability as K  # noqa: E402

CAPS = K.CAPS


def curve(order, metric, costs=CAPS, g=None):
    """Step curve [(finish time, closure after)] for learning ``order`` one capability at a time."""
    g = g or K.L.gains()
    t, have, pts = 0.0, set(), [(0.0, 0.0)]
    for c in order:
        t += costs[c]
        have.add(c)
        pts.append((t, K.gain(have, metric, g)))
    return pts


def area(order, metric, horizon, costs=CAPS, g=None):
    """Closure-weeks (closure fraction times time) over [0, horizon]; closure holds its last value after the last step."""
    pts = curve(order, metric, costs, g)
    tot = 0.0
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        tot += v0 * (min(t1, horizon) - min(t0, horizon))
    return tot + pts[-1][1] * max(0.0, horizon - pts[-1][0])


def best_order(metric, horizon, costs=CAPS, g=None):
    """Exact optimum over all orders (ties: lexicographically smallest order)."""
    g = g or K.L.gains()
    return max(itertools.permutations(sorted(costs)), key=lambda o: (round(area(o, metric, horizon, costs, g), 12), tuple(-ord(ch) for c in o for ch in c)))


def best_orders_fast(metric, horizon, costs=CAPS, g=None):
    """Same optimum via subset DP (order of the first k capabilities only matters through their set and elapsed time)."""
    g = g or K.L.gains()
    keys = sorted(costs)
    memo = {}

    def go(have):
        if have in memo:
            return memo[have]
        t = K.total_cost(have, costs)
        v = K.gain(have, metric, g)
        rest = [c for c in keys if c not in have]
        if not rest:
            memo[have] = (v * max(0.0, horizon - t), ())
            return memo[have]
        best = None
        for c in rest:
            t2 = t + costs[c]
            seg = v * (min(t2, horizon) - min(t, horizon))
            sub, tail = go(have | {c})
            cand = (seg + sub, (c,) + tail)
            if best is None or cand[0] > best[0] + 1e-12:
                best = cand
        memo[have] = best
        return best

    val, order = go(frozenset())
    return order, val


def greedy_next(metric, horizon, costs=CAPS, g=None, rule="rate"):
    """Myopic rule: next capability maximising gain per week of effort ('rate') or immediate gain ('gain').

    'rate' looks one capability ahead only, so a capability that unlocks nothing alone (heat-treat) is ranked last.
    """
    g = g or K.L.gains()
    have, order = set(), []
    while len(have) < len(costs):
        base = K.gain(have, metric, g)
        def score(c):
            d = K.gain(have | {c}, metric, g) - base
            return (-(d / costs[c] if rule == "rate" else d), c)
        c = min((c for c in costs if c not in have), key=score)
        order.append(c)
        have.add(c)
    return tuple(order)


def lookahead_order(metric, costs=CAPS, g=None):
    """Greedy with lookahead: repeatedly take the capability SET extension with the best gain per week (like a knapsack
    ratio rule over bundles), learning its new capabilities cheapest first. Ties: fewer weeks, then alphabetical."""
    g = g or K.L.gains()
    have, order = frozenset(), []
    while len(have) < len(costs):
        base = K.gain(have, metric, g)
        rest = sorted(set(costs) - have)
        best = None
        for r in range(1, len(rest) + 1):
            for add in itertools.combinations(rest, r):
                w = sum(costs[c] for c in add)
                key = ((K.gain(have | set(add), metric, g) - base) / w, -w, tuple(-ord(ch) for c in add for ch in c))
                if best is None or key > best[0]:
                    best = (key, add)
        for c in sorted(best[1], key=lambda c: (costs[c], c)):
            order.append(c)
        have |= set(best[1])
    return tuple(order)


def frontier_order(metric, costs=CAPS, g=None):
    """Learn along the set-optimal frontier of ``selfrep-capability``: add what each frontier step adds (leftovers last)."""
    g = g or K.L.gains()
    have, order = set(), []
    for _, _, s in K.frontier(metric, costs, g):
        for c in sorted(s - have, key=lambda c: costs[c]):
            order.append(c)
        have |= s
    order += sorted(set(costs) - have, key=lambda c: costs[c])
    return tuple(order)


def stability(metric, horizon, n=1000, spread=(0.5, 2.0), seed=0):
    """Scale efforts by independent log-uniform factors; share of draws where the nominal order is within 1% of the draw's
    optimum area, and its mean shortfall (as a share of the draw's optimum)."""
    rng = random.Random(seed)
    g = K.L.gains()
    nominal, _ = best_orders_fast(metric, horizon, CAPS, g)
    lo, hi = math.log(spread[0]), math.log(spread[1])
    close, short = 0, []
    for _ in range(n):
        costs = {c: v * math.exp(rng.uniform(lo, hi)) for c, v in CAPS.items()}
        _, ov = best_orders_fast(metric, horizon, costs, g)
        s = 1 - area(nominal, metric, horizon, costs, g) / ov if ov > 0 else 0.0
        short.append(s)
        close += s <= 0.01
    return close / n, sum(short) / n
