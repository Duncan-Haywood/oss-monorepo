"""Build and improve whole solutions. A solution is a list of customer sequences (routes).

repair():  split any route that has no legal charging plan (route-first, charge-second).
improve(): local search whose every move is judged by the exact charging plan of the routes it
           changes, so a move that needs a different charging stop is seen, not guessed.
Cost is total distance, charging detours included (the Schneider et al. objective); the vehicle count is
reported, not optimised, so the plan is comparable with a distance-only baseline.
"""
import random
import time

from .evrptw import route_cost


class Evaluator:
    def __init__(self, inst):
        self.inst = inst
        self.cache = {}
        self.calls = 0

    def cost(self, route):
        key = tuple(route)
        if key not in self.cache:
            self.calls += 1
            self.cache[key] = route_cost(self.inst, key)
        return self.cache[key]

    def total(self, routes):
        tot = 0.0
        for r in routes:
            c = self.cost(r)
            if c is None:
                return None
            tot += c[0]
        return tot


def repair(ev, routes):
    """Cut each route greedily into the longest feasible prefixes. None if a customer is hopeless."""
    out = []
    for r in routes:
        cur = []
        for c in r:
            if cur and ev.cost(cur + [c]) is None:
                out.append(cur)
                cur = []
            cur.append(c)
            if ev.cost(cur) is None:
                return None
        if cur:
            out.append(cur)
    return out


def _key(ev, routes):
    return ev.total(routes)


def improve(ev, routes, seconds, seed=0, kick=8):
    """Iterated local search: descend with relocate / swap / 2-opt*, then repeatedly remove `kick` random
    customers, reinsert them greedily, descend again and keep the result if it is shorter."""
    rng = random.Random(seed)
    deadline = time.time() + seconds
    cur, stats = _descend(ev, [list(r) for r in routes if r], deadline, rng)
    best, best_t = cur, _key(ev, cur)
    kicks = 0
    while time.time() < deadline:
        trial = _ruin_recreate(ev, best, kick, rng)
        if trial is None:
            continue
        kicks += 1
        trial, st = _descend(ev, trial, deadline, rng)
        stats["moves"] += st["moves"]
        t = _key(ev, trial)
        if t is not None and t < best_t - 1e-7:
            best, best_t = trial, t
    stats.update(kicks=kicks, evals=ev.calls)
    return best, stats


def _descend(ev, routes, deadline, rng):
    best = _key(ev, routes)
    moves = 0
    while time.time() < deadline:
        improved = False
        order = sorted(range(len(routes)), key=lambda i: len(routes[i]))
        for ri in order[:2]:
            trial = _eliminate(ev, routes, ri, deadline)
            k = _key(ev, trial) if trial is not None else None
            if k is not None and k < best - 1e-7:
                routes, best, improved = trial, k, True
                moves += 1
                break
        if improved:
            continue
        for _, new in _neighbourhood(routes, rng):
            if time.time() > deadline:
                break
            new = [r for r in new if r]
            k = _key(ev, new)
            if k is not None and k < best - 1e-7:
                routes, best, improved = new, k, True
                moves += 1
                break
        if not improved:
            break
    return routes, {"moves": moves}


def _ruin_recreate(ev, routes, kick, rng):
    allc = [c for r in routes for c in r]
    out = set(rng.sample(allc, min(kick, len(allc))))
    rest = [[c for c in r if c not in out] for r in routes]
    rest = [r for r in rest if r]
    for c in rng.sample(sorted(out), len(out)):
        best, where = None, None
        for k, r in enumerate(rest):
            base = ev.cost(r)[0]
            for pos in range(len(r) + 1):
                cc = ev.cost(r[:pos] + [c] + r[pos:])
                if cc is not None and (best is None or cc[0] - base < best):
                    best, where = cc[0] - base, (k, pos)
        if where is None:
            if ev.cost([c]) is None:
                return None
            rest.append([c])
        else:
            rest[where[0]].insert(where[1], c)
    return rest


def _neighbourhood(routes, rng):
    """Yield (kind, routes) lazily in random order; nothing is built until it is asked for."""
    moves = []
    R = len(routes)
    for a in range(R):
        for i in range(len(routes[a])):
            for b in range(R):
                for j in range(len(routes[b]) + (0 if a == b else 1)):
                    if a == b and j in (i, i + 1):
                        continue
                    moves.append(("relocate", a, i, b, j))
            for b in range(a + 1, R):
                for j in range(len(routes[b])):
                    moves.append(("swap", a, i, b, j))
                    moves.append(("2opt*", a, i, b, j))
    rng.shuffle(moves)
    for m in moves:
        yield m[0], _apply(routes, m)


def _apply(routes, m):
    kind, a, i, b, j = m
    new = [list(r) for r in routes]
    if kind == "relocate":
        c = new[a].pop(i)
        if a == b and j > i:
            j -= 1
        new[b].insert(j, c)
    elif kind == "swap":
        new[a][i], new[b][j] = new[b][j], new[a][i]
    else:
        ta, tb = new[a][i:], new[b][j:]
        new[a], new[b] = new[a][:i] + tb, new[b][:j] + ta
    return new


def _eliminate(ev, routes, ri, deadline):
    rest = [list(r) for k, r in enumerate(routes) if k != ri]
    for c in routes[ri]:
        best, where = None, None
        for k, r in enumerate(rest):
            if time.time() > deadline:
                return None
            base = ev.cost(r)[0]
            for pos in range(len(r) + 1):
                cand = r[:pos] + [c] + r[pos:]
                cc = ev.cost(cand)
                if cc is not None and (best is None or cc[0] - base < best):
                    best, where = cc[0] - base, (k, pos)
        if where is None:
            return None
        k, pos = where
        rest[k].insert(pos, c)
    return rest
