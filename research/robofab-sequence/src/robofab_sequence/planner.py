"""Exact search over assembly orders (dynamic programming over subsets of placed parts)."""
import random
from .checker import DIRS, Checker

INF = 10 ** 9


def popcount(x):
    return bin(x).count("1")


def transitions(ck, state):
    """Yield (p, dirmask) for each unplaced part p that can be added to `state` with a stable result."""
    for p in range(1, ck.n):
        if state >> p & 1:
            continue
        m = ck.free_dirs(p, state)
        if m and ck.stable(state | 1 << p):
            yield p, m


def explore(ck):
    """Return (count[state], mincost[state][dir]) for all reachable states.

    count: number of valid orders reaching `state` from the fixtured base.
    mincost: fewest direction changes along a valid order ending in `state` with last insertion dir.
    """
    full = (1 << ck.n) - 1
    count = {1: 1}
    best = {1: {None: 0}}
    layers = [[1]]
    for _ in range(ck.n - 1):
        nxt = {}
        for s in layers[-1]:
            for p, m in transitions(ck, s):
                t = s | 1 << p
                nxt.setdefault(t, []).append((s, p, m))
        for t, srcs in nxt.items():
            count[t] = sum(count[s] for s, _, _ in srcs)
            b = {}
            for s, p, m in srcs:
                for di in range(6):
                    if m >> di & 1:
                        # cost depends on the last dir l: min over l of cost + change(l, di)
                        c = min(v + (0 if (l is None or l == di) else 1) for l, v in best[s].items())
                        if c < b.get(di, INF):
                            b[di] = c
            best[t] = b
        layers.append(list(nxt))
    return count, best, full


def summarise(ck):
    count, best, full = explore(ck)
    n_orders = count.get(full, 0)
    mc = min(best[full].values()) if full in best else None
    return {"valid_orders": n_orders, "min_changes": mc, "states_reached": len(count)}


def order_cost(ck, order):
    """Validate a named order. Return (ok, first_failure, min_direction_changes)."""
    idx = {nm: i for i, nm in enumerate(ck.names)}
    if sorted(order) != sorted(ck.names) or order[0] != "base":
        return False, "not a permutation of all parts starting with the base", None
    state = 1
    costs = {None: 0}
    for nm in order[1:]:
        p = idx[nm]
        m = ck.free_dirs(p, state)
        if not m:
            return False, f"{nm}: no collision-free insertion direction", None
        state |= 1 << p
        if not ck.stable(state):
            return False, f"{nm}: assembly unstable after placing it", None
        costs = {di: min(v + (0 if (l is None or l == di) else 1) for l, v in costs.items())
                 for di in range(6) if m >> di & 1}
    return True, None, min(costs.values())


def random_permutation_validity(ck, trials, seed):
    rng = random.Random(seed)
    names = ck.names[1:]
    ok = 0
    for _ in range(trials):
        rng.shuffle(names)
        if order_cost(ck, ["base"] + names)[0]:
            ok += 1
    return ok / trials


def random_feasible(ck, trials, seed):
    """Random walk over valid transitions (not uniform over orders). Return list of min-change costs."""
    rng = random.Random(seed)
    full = (1 << ck.n) - 1
    costs = []
    for _ in range(trials):
        s, order = 1, ["base"]
        while s != full:
            opts = list(transitions(ck, s))
            if not opts:
                break
            p, _m = rng.choice(opts)
            order.append(ck.names[p])
            s |= 1 << p
        if s == full:
            costs.append(order_cost(ck, order)[2])
    return costs


def greedy_disassembly(ck):
    """Assembly-by-disassembly: from the finished product repeatedly remove the first removable part
    (lowest part index), requiring the remainder to be stable. No backtracking. Return order or None."""
    full = (1 << ck.n) - 1
    s, removed = full, []
    while s != 1:
        for p in range(1, ck.n):
            if s >> p & 1 and ck.free_dirs(p, s & ~(1 << p)) and ck.stable(s & ~(1 << p)):
                s &= ~(1 << p)
                removed.append(ck.names[p])
                break
        else:
            return None
    return ["base"] + removed[::-1]


def optimal_order(ck):
    """One order with the fewest insertion-direction changes (ties broken by lowest part index, then
    direction index). Return (order, changes, directions) or None if no order is valid."""
    full = (1 << ck.n) - 1
    memo = {}

    def go(s, last):
        if s == full:
            return 0, None
        key = (s, last)
        if key in memo:
            return memo[key]
        best = (INF, None)
        for p, m in transitions(ck, s):
            for di in range(6):
                if m >> di & 1:
                    c = (0 if (last is None or last == di) else 1) + go(s | 1 << p, di)[0]
                    if c < best[0]:
                        best = (c, (p, di))
        memo[key] = best
        return best

    cost, _ = go(1, None)
    if cost >= INF:
        return None
    s, last, order, dirs = 1, None, ["base"], []
    while s != full:
        _, (p, di) = go(s, last)
        order.append(ck.names[p]); dirs.append(DIRS[di])
        s |= 1 << p; last = di
    return order, cost, dirs
