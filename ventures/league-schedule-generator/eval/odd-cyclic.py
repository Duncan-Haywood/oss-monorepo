#!/usr/bin/env python3
"""Odd leagues, three wait-free games a night, from the cyclic round robin: one night at a time.

eval/odd-night-sat.py asks for the round robin and every night's layout at once, and timed out on
19 teams on 3 courts x 9 slots, 21 on 4 x 9, 23 on 4 x 9, 29 on 5 x 9 and 27 on 7 x 6 (README,
"Odd leagues, three games a night"; eval/odd-night-sat.txt). This script fixes the round robin
instead and asks a much smaller question.

The cyclic (1-rotational) round robin of n odd teams, team n the bye: in round r team r sits out
and teams r - k and r + k meet (k = 1 .. (n - 1) / 2, mod n). Adding 1 to every real team maps
round r to round r + 1, so any set of rounds {s, s + a, s + b} is the set {0, a, b} relabelled:
if the night of rounds {0, a, b} has a wait-free layout, every translate has one (the same rows,
teams shifted). So:

  1. for every pattern {0, a, b} (0 < a < b < n), ask a SAT solver for one night's layout of
     rounds 0, a, b on `courts` x `times` (each match a row, at most `courts` a row, no team twice
     a row, each team's rows consecutive): about 3n matches, a few hundred variables;
  2. cover Z_n with disjoint translates of the patterns that pass, leaving n mod 3 rounds for the
     last, shorter night (laid out the same way), by depth-first search;
  3. order the rounds night by night, re-check the season, and print it as the JSON
     eval/odd-night-sat.py prints, so eval/write-odd-designs.mjs stores it unchanged.

The round robin comes from a starter: pairs {x, y} of the nonzero residues mod n using every
difference +-d once; round r is the starter shifted by r. The patterned starter {-k, k} (the circle
method) is tried first, then `--starters - 1` random ones. Measured (eval/odd-cyclic.txt): it
finds designs quickly when a night has spare slots and fails on fully booked nights (13 on 3 x 6,
17 on 4 x 6, 19 on 3 x 9), where the whole-season model still wins.

It only finds designs (a pattern set that fails proves nothing about other round robins).
Needs python-sat (pip install python-sat; MIT), for this eval script only.
  python3 eval/odd-cyclic.py 19 --courts 3 --times 9 [--budget 60] [--starters 50 --seed 1]
"""
import argparse
import importlib.util
import json
import os
import sys
import time

from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ons", os.path.join(HERE, "odd-night-sat.py"))
ons = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ons)


STARTER = None  # set in main: the base round's pairs {x, y} of nonzero residues


def patterned(n):
    """The patterned starter {-k, k}: the circle method's round robin."""
    return [((-k) % n, k) for k in range(1, (n - 1) // 2 + 1)]


def random_starter(n, rng):
    """A random starter of Z_n: the nonzero residues paired so that every difference +-d
    (d = 1 .. (n - 1) / 2) occurs exactly once. Any starter gives a round robin by translation
    (round r: team r sits out, x + r meets y + r), so the night argument above still holds."""
    half = (n - 1) // 2
    while True:
        free = set(range(1, n))
        used = set()
        pairs = []

        def dfs():
            if not free:
                return True
            x = min(free)
            ys = [y for y in free if y != x and min((y - x) % n, (x - y) % n) not in used]
            rng.shuffle(ys)
            for y in ys:
                d = min((y - x) % n, (x - y) % n)
                free.discard(x); free.discard(y); used.add(d); pairs.append((x, y))
                if dfs():
                    return True
                pairs.pop(); used.discard(d); free.add(x); free.add(y)
            return False

        if dfs() and len(used) == half:
            return pairs


def round_pairs(n, r):
    """Round r of the 1-rotational round robin from STARTER on teams 0 .. n - 1 plus the bye team n."""
    out = [(r % n, n)]
    for x, y in STARTER:
        a, b = (x + r) % n, (y + r) % n
        out.append((min(a, b), max(a, b)))
    return out


def lay_night(n, rs, courts, times, solver="cd15"):
    """A wait-free layout of the real matches of rounds `rs`, as {(i, j): row}, or None."""
    matches = [m for r in rs for m in round_pairs(n, r) if m[1] < n]
    if len(matches) > courts * times:
        return None
    pool = IDPool()
    cnf = CNF()
    p = {(m, h): pool.id(("p", m, h)) for m in matches for h in range(times)}

    def card(lits, bound, kind):
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost}[kind]
        cnf.extend(enc(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter).clauses)

    for m in matches:
        card([p[m, h] for h in range(times)], 1, "eq")
    full = len(matches) == courts * times
    for h in range(times):
        card([p[m, h] for m in matches], courts, "eq" if full else "le")
    teams = sorted({v for m in matches for v in m})
    for v in teams:
        mine = [m for m in matches if v in m]
        q = []
        for h in range(times):
            lits = [p[m, h] for m in mine]
            qv = pool.id(("q", v, h))
            for l in lits:
                cnf.append([-l, qv])
            cnf.append([-qv] + lits)
            card(lits, 1, "le")
            q.append(qv)
        for a in range(times):
            for c in range(a + 2, times):
                for b in range(a + 1, c):
                    cnf.append([-q[a], -q[c], q[b]])
    # symmetry: rows can be read backwards; the first match of the first round sits in the first half
    m0 = matches[0]
    for h in range((times + 1) // 2, times):
        cnf.append([-p[m0, h]])
    with Solver(name=solver, bootstrap_with=cnf.clauses) as s:
        if not s.solve():
            return None
        model = set(v for v in s.get_model() if v > 0)
    return {m: h for m in matches for h in range(times) if p[m, h] in model}


def cover(n, patterns, rest_ok):
    """Disjoint translates of the patterns covering Z_n but for a leftover the last night can lay out."""
    want = n // 3 * 3
    used = [False] * n
    chosen = []

    def dfs():
        if len(chosen) * 3 == want:
            left = tuple(r for r in range(n) if not used[r])
            return rest_ok(left)
        r0 = next(r for r in range(n) if not used[r])
        # r0 is either in a night (as its smallest member after translation) or in the leftover
        for P in patterns:
            for off in P:
                s = (r0 - off) % n
                rs = [(s + d) % n for d in P]
                if all(not used[r] for r in rs):
                    for r in rs:
                        used[r] = True
                    chosen.append(rs)
                    if dfs():
                        return True
                    chosen.pop()
                    for r in rs:
                        used[r] = False
        if sum(not u for u in used) - (want - 3 * len(chosen)) > 0:
            used[r0] = True  # leave r0 for the last night
            if dfs():
                return True
            used[r0] = False
        return False

    return chosen if dfs() else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--times", type=int, default=6)
    ap.add_argument("--budget", type=float, default=600, help="seconds to spend testing patterns")
    ap.add_argument("--solver", default="cd15")
    ap.add_argument("--starters", type=int, default=1, help="starters to try: the patterned one, then random ones")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--random-only", action="store_true", help="skip the patterned starter (random ones only)")
    args = ap.parse_args()
    n, courts, times = args.n, args.courts, args.times
    assert n % 2 == 1
    import random
    rng = random.Random(args.seed)
    t_all = time.time()
    for k in range(args.starters):
        global STARTER
        STARTER = patterned(n) if k == 0 and not args.random_only else random_starter(n, rng)
        head = search(args, n, courts, times)
        head["starter_index"] = k
        head["starter"] = STARTER
        if head["sat"] or time.time() - t_all > args.budget:
            break
    head["seconds_total"] = round(time.time() - t_all, 1)
    print(json.dumps(head))


def search(args, n, courts, times):
    t0 = time.time()
    good, tried = [], 0
    rest_cache = {}

    def rest_ok(left):
        if not left:
            return True
        key = tuple(sorted((r - left[0]) % n for r in left))
        if key not in rest_cache:
            rest_cache[key] = lay_night(n, list(key), courts, times, args.solver) is not None
        return rest_cache[key]

    seen = set()
    found = None
    for a in range(1, n):
        for b in range(a + 1, n):
            # {0, a, b} and its translates {0, b - a, n - a}, {0, n - b, n - b + a} are one pattern
            canon = min(tuple(sorted(((d - s) % n) for d in (0, a, b))) for s in (0, a, b))
            if canon in seen:
                continue
            seen.add(canon)
            if time.time() - t0 > args.budget:
                break
            tried += 1
            if lay_night(n, list(canon), courts, times, args.solver) is not None:
                good.append(canon)
                print(f"# pattern {canon} lays out ({time.time() - t0:.1f} s)", file=sys.stderr)
                found = cover(n, good, rest_ok)
                if found is not None:
                    break
        if found is not None or time.time() - t0 > args.budget:
            break
    dt = round(time.time() - t0, 1)
    head = {"n": n, "courts": courts, "times": times, "method": "cyclic", "patterns_tried": tried,
            "patterns_ok": len(good), "sat": found is not None, "seconds": dt}
    print(f"# starter {STARTER}: {tried} patterns, {len(good)} lay out, cover {'found' if found else 'none'} ({dt} s)", file=sys.stderr)
    if found is None:
        return head
    left = [r for r in range(n) if not any(r in rs for rs in found)]
    nights = [sorted(rs) for rs in found] + ([left] if left else [])
    order = [r for rs in nights for r in rs]
    rounds = [[list(m) for m in round_pairs(n, r)] for r in order]
    rows, idx, night_idx = [], 0, []
    for rs in nights:
        lay = lay_night(n, rs, courts, times, args.solver)
        assert lay is not None
        rows.append({m: h for m, h in lay.items()})
        night_idx.append(list(range(idx, idx + len(rs))))
        idx += len(rs)
    ons.check(n, rounds, night_idx, rows, courts, times)
    head["nights_rounds"] = nights
    head["rounds"] = rounds
    head["rows"] = [[[i, j, h] for (i, j), h in sorted(r.items())] for r in rows]
    return head


if __name__ == "__main__":
    main()
