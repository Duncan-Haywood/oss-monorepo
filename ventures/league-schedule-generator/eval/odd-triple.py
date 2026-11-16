#!/usr/bin/env python3
"""Odd leagues of n = 3k + 2 teams (k odd: 17, 23, 29, 35, ...) on 9 time slots: a season with a
rename of order 3, for the case eval/odd-orbit.py cannot reach. Measurements: eval/odd-triple.txt
(no design found yet: 29 on 5 x 9 ran 50 minutes with no answer; 11 and 17 are UNSAT here).

Why odd-orbit.py's idea fails here (README, "29 teams on 5 x 9"): with N = n + 1 = 3(k + 1) vertices
(team n the bye), the k full nights cannot be one orbit of any group of order k. Take any prime p
dividing k (odd) and an element h of order p. h must fix the bye (a rename that moves the bye moves
a sitting-out team onto a court), and it fixes F points with F = N = 3 (mod p) (or F = 0 when p = 3),
so F >= 3. A pair of h-fixed points lies on a night X with hX = X, and in one regular orbit of
nights only the short (two-round) night is fixed. So every pair of the F >= 3 fixed points is in
those two rounds; three of them make a triangle, which two matchings cannot hold.

What may work instead is a smaller group with some nights fixed. Let g turn m = (n - 5) / 3
3-cycles (eight at 29 teams) on teams 0 .. 3m - 1 (cycle c is 3c, 3c + 1, 3c + 2), fixing the
five teams 3m .. n - 1 and the bye n (F = 6 fixed points). A round fixed by g must match the fixed points among themselves (three pairs) and
the 3-cycles in pairs (3c + i with 3c' + i + s); the five fixed rounds hold the 15 pairs of the
six fixed points as a 1-factorization of K6 (unique up to renaming), and those five rounds are the
short night plus one more fixed night. The other n - 5 rounds fall into (n - 5) / 3 orbits
{R, gR, g^2 R}. Nights from them are either

  - an orbit of three nights {H, gH, g^2 H} with H one round from each of three round orbits: one
    layout serves all three (the same rows, teams renamed), or
  - a "turned" night {R, gR, g^2 R}, fixed by g, laid out on its own.

`--turned C` sets how many turned nights (the rest, a multiple of 3 round orbits, are night orbits).
For 29 teams there are 8 round orbits: C = 2 (two night orbits, six nights from two layouts),
C = 5 or C = 8. The model lays out only the distinct nights (C + 2 + 2 * (orbits - C) / 3 of them)
instead of all n / 3 + 1, and the round robin's pair variables are tied by g (x[gR, ge] = x[R, e]).

Symmetry fixed without loss: the fixed points' 1-factorization (GK6) with the bye's round of
each factor, and round 0's cycle pairing (cycle 2c with 2c + 1, shift 0).

Output: the JSON odd-night-sat.py prints (rounds night by night, the short night last; rows per
night), re-checked by odd-night-sat.check, so eval/write-odd-designs.mjs stores it unchanged.
It only finds designs (UNSAT rules out this structure only).
Needs python-sat (pip install python-sat; MIT), for this eval script only.
  python3 eval/odd-triple.py 29 --courts 5 [--turned 2] [--solver cd15]
"""
import argparse
import importlib.util
import json
import os
import time

from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ons", os.path.join(HERE, "odd-night-sat.py"))
ons = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ons)

# GK6, the 1-factorization of K6 (vertices 0..5, 5 is the bye's slot), five factors
GK6 = [[(0, 5), (1, 4), (2, 3)], [(1, 5), (2, 0), (3, 4)], [(2, 5), (3, 1), (4, 0)],
       [(3, 5), (4, 2), (0, 1)], [(4, 5), (0, 3), (1, 2)]]


def perm(n):
    m = (n - 5) // 3
    g = list(range(n + 1))
    for c in range(m):
        for i in range(3):
            g[3 * c + i] = 3 * c + (i + 1) % 3
    return g, m


def plan(n, turned):
    """Rounds and nights: rounds 0-4 fixed (0-2 the fixed night, 3-4 the short night); orbit j is
    rounds 5 + 3j + i = g^i R_j. Returns (night list of round lists, layouts to solve as
    (night index, rounds), renames: night index -> (base night index, power of g))."""
    m = (n - 5) // 3
    assert (m - turned) % 3 == 0 and 0 <= turned <= m
    nights, solve, rename = [], [], {}
    orb = lambda j, i: 5 + 3 * j + i
    for a in range((m - turned) // 3):
        js = [3 * a, 3 * a + 1, 3 * a + 2]
        base = len(nights)
        for i in range(3):
            if i:
                rename[len(nights)] = (base, i)
            nights.append([orb(j, i) for j in js])
        solve.append(base)
    for j in range(m - turned, m):
        solve.append(len(nights))
        nights.append([orb(j, 0), orb(j, 1), orb(j, 2)])
    solve.append(len(nights)); nights.append([0, 1, 2])
    solve.append(len(nights)); nights.append([3, 4])
    return nights, solve, rename


def model(n, courts, times, turned, shape=True):
    N = n + 1
    g, m = perm(n)
    F0 = 3 * m  # first fixed real team; fixed points F0 .. n (n is the bye)
    pool = IDPool()
    cnf = CNF()

    def card(lits, bound, kind, extra=()):
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost}[kind]
        for cl in enc(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter).clauses:
            cnf.append(cl + list(extra))

    R = n
    key = lambda a, b: (min(a, b), max(a, b))
    pairs = [(i, j) for i in range(N) for j in range(i + 1, N)]
    x = {(r, i, j): pool.id(("x", r, i, j)) for r in range(R) for (i, j) in pairs}
    for (i, j) in pairs:
        card([x[r, i, j] for r in range(R)], 1, "eq")
    for r in range(R):
        for v in range(N):
            card([x[(r,) + key(v, u)] for u in range(N) if u != v], 1, "eq")
    # g ties: fixed rounds are fixed by g; orbit rounds turn into the next one
    gr = lambda r: r if r < 5 else 5 + 3 * ((r - 5) // 3) + ((r - 5) % 3 + 1) % 3
    for r in range(R):
        for (i, j) in pairs:
            a, b = x[r, i, j], x[(gr(r),) + key(g[i], g[j])]
            cnf.append([-a, b]); cnf.append([a, -b])
    # the fixed points' factorization, the bye last
    fixed = list(range(F0, n + 1))
    for r in range(5):
        for (a, b) in GK6[r]:
            cnf.append([x[(r,) + key(fixed[a], fixed[b])]])
    # round 0: cycle 2c with cycle 2c + 1, shift 0
    for c in range(0, m - 1, 2):
        for i in range(3):
            cnf.append([x[0, 3 * c + i, 3 * (c + 1) + i]])

    nights, solve, rename = plan(n, turned)
    real = [(i, j) for (i, j) in pairs if j < n]
    p = {}
    for t in solve:
        rs = nights[t]
        q = {}
        for (i, j) in real:
            ps = [pool.id(("p", t, i, j, h)) for h in range(times)]
            for h, v in enumerate(ps):
                p[t, i, j, h] = v
                cnf.append([-v] + [x[r, i, j] for r in rs])
            for r in rs:
                cnf.append([-x[r, i, j]] + ps)
            card(ps, 1, "le")
        for v in range(n):
            for h in range(times):
                lits = [p[(t,) + key(v, u) + (h,)] for u in range(n) if u != v]
                qv = pool.id(("q", t, v, h))
                q[v, h] = qv
                for l in lits:
                    cnf.append([-l, qv])
                cnf.append([-qv] + lits)
                card(lits, 1, "le")
            for a in range(times):
                for c in range(a + 2, times):
                    for b in range(a + 1, c):
                        cnf.append([-q[v, a], -q[v, c], q[v, b]])
        if shape and len(rs) == 3:
            shapes = ons.window_shapes(n - 3, 3, 3, courts, times)
            assert shapes, "no window shape fits"
            kinds = sorted({(f, 3) for F, _ in shapes for f in F} | {(s, 2) for _, S in shapes for s in S})
            w = {(v, kk): pool.id(("w", t, v, kk)) for v in range(n) for kk in kinds}
            for v in range(n):
                card([w[v, kk] for kk in kinds], 1, "eq")
                bye = [x[r, v, n] for r in rs]
                for kk in kinds:
                    st, ln = kk
                    for h in range(times):
                        cnf.append([-w[v, kk], q[v, h] if st <= h < st + ln else -q[v, h]])
                    if ln == 2:
                        cnf.append([-w[v, kk]] + bye)
                    else:
                        for b in bye:
                            cnf.append([-w[v, kk], -b])
            z = [pool.id(("z", t, i)) for i in range(len(shapes))]
            card(z, 1, "eq")
            for zi, (F, S) in zip(z, shapes):
                for kk in kinds:
                    cnt = F.count(kk[0]) if kk[1] == 3 else S.count(kk[0])
                    card([w[v, kk] for v in range(n)], cnt, "eq", extra=[] if len(shapes) == 1 else [-zi])
        for h in range(times):
            card([p[t, i, j, h] for (i, j) in real], courts, "le")
    return cnf, x, p, pairs, real, nights, solve, rename, g


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--times", type=int, default=9)
    ap.add_argument("--turned", type=int, default=2)
    ap.add_argument("--solver", default="cd15")
    ap.add_argument("--no-shape", action="store_true")
    args = ap.parse_args()
    n, courts, times = args.n, args.courts, args.times
    assert n % 2 == 1 and (n - 5) % 3 == 0 and ((n - 5) // 3) % 2 == 0, "n = 3m + 5 with m even"
    t0 = time.time()
    cnf, x, p, pairs, real, nights, solve, rename, g = model(n, courts, times, args.turned, not args.no_shape)
    head = {"n": n, "courts": courts, "times": times, "method": "triple", "turned": args.turned,
            "vars": cnf.nv, "clauses": len(cnf.clauses)}
    with Solver(name=args.solver, bootstrap_with=cnf.clauses) as s:
        ok = s.solve()
        mdl = set(v for v in s.get_model() if v > 0) if ok else None
    head["sat"] = ok
    head["seconds"] = round(time.time() - t0, 1)
    if not ok:
        print(json.dumps(head))
        return
    key = lambda a, b: (min(a, b), max(a, b))
    rnd = [[e for e in pairs if x[(r,) + e] in mdl] for r in range(n)]
    lay = {t: {e: h for e in real for h in range(times) if p[(t,) + e + (h,)] in mdl} for t in solve}
    for t, (b, k) in rename.items():
        rows = {}
        for e, h in lay[b].items():
            a, c = e
            for _ in range(k):
                a, c = g[a], g[c]
            rows[key(a, c)] = h
        lay[t] = rows
    rounds, night_idx, rows = [], [], []
    for t, rs in enumerate(nights):
        night_idx.append(list(range(len(rounds), len(rounds) + len(rs))))
        rounds += [sorted(rnd[r]) for r in rs]
        rows.append(lay[t])
    ons.check(n, rounds, night_idx, rows, courts, times)
    head["rounds"] = [[list(e) for e in r] for r in rounds]
    head["rows"] = [[[i, j, h] for (i, j), h in sorted(r.items())] for r in rows]
    print(json.dumps(head))


if __name__ == "__main__":
    main()
