#!/usr/bin/env python3
"""Three-session round robins for n = 3k + 1 teams (k odd) from one night turned by a group of order k.

The question (README, "Closed sessions for every league size"): with 3 games a night on 9 time
slots and ceil(n / 6) courts, every night must split into three closed blocks of at most
2 x courts teams. eval/session-design-sat.py asks for the whole round robin at once and ran out
of time at 40 and 46 teams (300 s). This script asks for one night only, the way
eval/odd-orbit.py does for odd leagues.

The construction. Teams 0..3k-1 and team 3k (call it oo). g adds 3 mod 3k to every team and fixes
oo, so g has order k and splits the 3k teams into three rings (by residue mod 3). With k odd no
power of g but the identity fixes a pair, so every pair's orbit has exactly k pairs: there are
n (n - 1) / 2 / k = 3 n / 2 orbits, the number of matches in three rounds. So a night H of three
perfect matchings that takes ONE pair from EVERY orbit gives the season: the nights H, gH, ...,
g^(k-1) H are H with its teams renamed (same blocks, same sizes), they use every pair once, and
k nights of 3 rounds are all n - 1 = 3k rounds. Nothing is left over for a short night.

SAT model (one night): z[p, c] "pair p is in round c of H" with exactly one (p, c) per orbit,
every team exactly once per round, y[v, b] "team v is in block b", a match joins two teams of the
same block, each block at most hi = 2 x courts teams. Symmetry: oo is in block 0 and its round-0
opponent is team 0 (g and the round order act on solutions, so this costs no generality).

Needs python-sat (pip install python-sat; MIT), eval only, not the tool.
  python3 eval/session-orbit.py 40 --courts 7 > out/40-3x9.json
  python3 eval/session-orbit.py 46 --courts 8
Prints the same JSON as session-design-sat.py (rounds, blocks), re-checked with its `check`,
so eval/write-session-designs.mjs stores it unchanged.
"""
import argparse
import importlib.util
import json
import os
import time

from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver

_spec = importlib.util.spec_from_file_location(
    "session_design_sat", os.path.join(os.path.dirname(os.path.abspath(__file__)), "session-design-sat.py"))
_sds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sds)


def orbits(n):
    """The pair orbits under g (v -> v + 3 mod 3k, oo fixed). Every orbit has k pairs when k is odd."""
    m = n - 1
    k = m // 3
    oo = m

    def act(v, s):
        return v if v == oo else (v + 3 * s) % m
    seen, out = set(), []
    for i in range(n):
        for j in range(i + 1, n):
            if (i, j) in seen:
                continue
            orb = []
            for s in range(k):
                a, b = act(i, s), act(j, s)
                p = (min(a, b), max(a, b))
                if p in seen:
                    break
                seen.add(p)
                orb.append(p)
            out.append(orb)
    return out


def build(n, courts, sessions=3):
    m = n - 1
    assert m % 3 == 0 and (m // 3) % 2 == 1, "needs n = 3k + 1 with k odd"
    k = m // 3
    hi = 2 * courts
    orbs = orbits(n)
    assert all(len(o) == k for o in orbs) and len(orbs) * 2 == 3 * n
    pool, cnf = IDPool(), CNF()
    z = {}
    for o in orbs:
        for p in o:
            for c in range(3):
                z[p, c] = pool.id(("z", p, c))
    y = {(v, b): pool.id(("y", v, b)) for v in range(n) for b in range(sessions)}

    def card(lits, bound, kind):
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost}[kind]
        cnf.extend(enc(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter).clauses)

    for o in orbs:
        card([z[p, c] for p in o for c in range(3)], 1, "eq")
    inc = {v: [] for v in range(n)}
    for o in orbs:
        for p in o:
            inc[p[0]].append(p)
            inc[p[1]].append(p)
    for v in range(n):
        for c in range(3):
            card([z[p, c] for p in inc[v]], 1, "eq")
        card([y[v, b] for b in range(sessions)], 1, "eq")
    for b in range(sessions):
        card([y[v, b] for v in range(n)], hi, "le")
    for (p, c), lit in z.items():
        i, j = p
        for b in range(sessions):
            cnf.append([-lit, -y[i, b], y[j, b]])
            cnf.append([-lit, y[i, b], -y[j, b]])
    cnf.append([y[m, 0]])
    cnf.append([z[(0, m), 0]])
    return cnf, z, y, k, hi


def season(n, night):
    """The k nights g^s H, rounds in night order."""
    m = n - 1
    k = m // 3

    def act(v, s):
        return v if v == m else (v + 3 * s) % m
    rounds = []
    for s in range(k):
        for r in night:
            rounds.append([[act(a, s), act(b, s)] for a, b in r])
    return rounds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--solver", default="cd15")
    args = ap.parse_args()
    n, sessions = args.n, 3
    t0 = time.time()
    cnf, z, y, k, hi = build(n, args.courts, sessions)
    with Solver(name=args.solver, bootstrap_with=cnf.clauses) as s:
        ok = s.solve()
        model = set(v for v in s.get_model() if v > 0) if ok else None
    dt = time.time() - t0
    head = {"n": n, "courts": args.courts, "sessions": sessions, "method": "orbit", "k": k,
            "vars": cnf.nv, "clauses": len(cnf.clauses)}
    if not ok:
        print(json.dumps({**head, "sat": False, "seconds": round(dt, 1)}))
        return
    night = [[[i, j] for (p, cc), lit in z.items() if cc == c and lit in model for (i, j) in [p]] for c in range(3)]
    rounds = season(n, night)
    blocks0 = [next(b for b in range(sessions) if y[v, b] in model) for v in range(n)]
    _sds.check(n, rounds, sessions, 0, hi)
    print(json.dumps({**head, "sat": True, "seconds": round(dt, 1),
                      "block_sizes": sorted([blocks0.count(b) for b in range(sessions)], reverse=True),
                      "rounds": rounds}))


if __name__ == "__main__":
    main()
