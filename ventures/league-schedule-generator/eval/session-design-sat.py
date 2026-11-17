#!/usr/bin/env python3
"""Round robins whose three-game nights split into closed sessions, found by a SAT solver.

The question (README, "Designed round robins for two sessions a night"): with 3 games a night on
6 time slots, a night holds an early and a late session, and when the courts are tight every
night must split into blocks of teams that only play each other (sessionBlocks in nights.mjs).
The halves and XOR designs cover multiples of 12 and powers of two. For 14, 18, 20 and 28 teams
the annealing (sessionNights) stops at 2 crossing matches and no design was known. This script
asks a SAT solver for one directly.

Encoding (n even, n - 1 rounds, night t = rounds 3t, 3t + 1, 3t + 2; leftover rounds free):
  x[r, i, j]  teams i < j meet in round r. Each pair meets exactly once, each team plays exactly
              once per round (a 1-factorization of K_n).
  y[t, v, k]  team v plays in block k on night t (exactly one k per team per night; block k holds
              between lo and hi teams, hi = 2 x courts so a block's matches fit one session's rows).
  x[r, i, j] -> (y[t, i, k] <-> y[t, j, k]) for the night t of round r and every block k.
Symmetry: round 0 is (0 1)(2 3)...; team 0 is in block 0 every night.

A model is decoded to rounds, re-checked here (every pair once, every round a perfect matching,
every night's matches inside one block, block sizes) and printed as JSON. nights.mjs stores them
(session-designs.mjs) and nights.test / the eval re-check them in JS.

Needs python-sat (pip install python-sat; MIT), used by this eval script only, not by the tool.
  python3 eval/session-design-sat.py 20 --courts 5 --sessions 2 [--seed 1] [--solver cd15]
"""
import argparse
import json
import sys
import time

from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver


def build(n, courts, sessions, g=3):
    pool = IDPool()
    cnf = CNF()
    R = n - 1
    nights = R // g
    hi = 2 * courts
    lo = max(0, n - hi * (sessions - 1))
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
    x = {(r, i, j): pool.id(("x", r, i, j)) for r in range(R) for (i, j) in pairs}
    y = {(t, v, k): pool.id(("y", t, v, k)) for t in range(nights) for v in range(n) for k in range(sessions)}

    def add_card(lits, bound, kind):
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost, "ge": CardEnc.atleast}[kind]
        f = enc(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter if kind != "eq" or len(lits) > 6 else EncType.pairwise)
        cnf.extend(f.clauses)

    for (i, j) in pairs:
        add_card([x[r, i, j] for r in range(R)], 1, "eq")
    for r in range(R):
        for v in range(n):
            add_card([x[r, min(v, u), max(v, u)] for u in range(n) if u != v], 1, "eq")
    # round 0 fixed
    for (i, j) in pairs:
        cnf.append([x[0, i, j]] if (i % 2 == 0 and j == i + 1) else [-x[0, i, j]])
    for t in range(nights):
        for v in range(n):
            add_card([y[t, v, k] for k in range(sessions)], 1, "eq")
        for k in range(sessions):
            col = [y[t, v, k] for v in range(n)]
            add_card(col, hi, "le")
            if lo > 0:
                add_card(col, lo, "ge")
        cnf.append([y[t, 0, 0]])
        for r in range(g * t, g * t + g):
            for (i, j) in pairs:
                for k in range(sessions):
                    cnf.append([-x[r, i, j], -y[t, i, k], y[t, j, k]])
                    cnf.append([-x[r, i, j], y[t, i, k], -y[t, j, k]])
    return cnf, x, y, pairs, R, nights, lo, hi


def check(n, rounds, sessions, lo, hi, g=3):
    seen = set()
    for r in rounds:
        teams = sorted(t for p in r for t in p)
        assert teams == list(range(n)), "a round is not a perfect matching"
        for a, b in r:
            key = (min(a, b), max(a, b))
            assert key not in seen, "a pair meets twice"
            seen.add(key)
    assert len(seen) == n * (n - 1) // 2
    for t in range(len(rounds) // g):
        # closed blocks: connected components of the night's matches, packed into sessions
        par = list(range(n))

        def f(a):
            while par[a] != a:
                par[a] = par[par[a]]
                a = par[a]
            return a
        for r in rounds[g * t:g * t + g]:
            for a, b in r:
                par[f(a)] = f(b)
        comps = {}
        for v in range(n):
            comps[f(v)] = comps.get(f(v), 0) + 1
        sizes = sorted(comps.values(), reverse=True)
        # first-fit decreasing into `sessions` bins of hi (enough for a check of the solver's own split)
        bins = [0] * sessions
        for s in sizes:
            k = min(range(sessions), key=lambda i: bins[i])
            bins[k] += s
        assert max(bins) <= hi, f"night {t}: components {sizes} do not fit {sessions} sessions of {hi}"
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--sessions", type=int, default=2)
    ap.add_argument("--solver", default="cd15")
    args = ap.parse_args()
    n = args.n
    t0 = time.time()
    cnf, x, y, pairs, R, nights, lo, hi = build(n, args.courts, args.sessions)
    with Solver(name=args.solver, bootstrap_with=cnf.clauses) as s:
        ok = s.solve()
        model = set(v for v in s.get_model() if v > 0) if ok else None
    dt = time.time() - t0
    if not ok:
        print(json.dumps({"n": n, "courts": args.courts, "sessions": args.sessions, "sat": False, "seconds": round(dt, 1)}))
        return
    rounds = [[[i, j] for (i, j) in pairs if x[r, i, j] in model] for r in range(R)]
    blocks = [[next(k for k in range(args.sessions) if y[t, v, k] in model) for v in range(n)] for t in range(nights)]
    check(n, rounds, args.sessions, lo, hi)
    print(json.dumps({"n": n, "courts": args.courts, "sessions": args.sessions, "sat": True, "seconds": round(dt, 1),
                      "vars": cnf.nv, "clauses": len(cnf.clauses), "rounds": rounds, "blocks": blocks}))


if __name__ == "__main__":
    main()
