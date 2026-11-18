#!/usr/bin/env python3
"""Odd leagues on fully booked nights: one night, turned k times by a permutation of the teams.

The open case (README, "Odd leagues one night at a time"): 19 teams on 3 courts x 9 slots and 25 on
4 x 9 use every slot of a 3-round night. The whole-season model (eval/odd-night-sat.py) timed out,
the cyclic round robins (eval/odd-cyclic.py) had no pattern that lays out, and a general packing
of one night's relabelled copies (eval/odd-pack.py) timed out at 25 minutes. Here the copies come
from a group instead.

Let n = 3k + 1 with k even (n = 7, 13, 19, 25, 31, ...), team n the bye, N = n + 1 vertices. Let g
be the permutation of the teams made of three k-cycles A, B, C on the first 3k real teams, fixing
real team f = 3k and the bye team n. The cyclic group <g> acts on the pairs of K_N:

  - a pair {x, g^(k/2) x} inside one cycle is fixed by g^(k/2): orbit of size k/2. There are 3 such
    orbits (one per cycle), 3k/2 pairs in all, and with {f, bye} (fixed by g) they are a perfect
    matching of K_N: every team in A, B, C meets its half-turn opposite, f meets the bye.
  - every other pair has an orbit of exactly k pairs; there are (N(N - 1)/2 - 3k/2 - 1) / k of
    them, which is 30 at 19 teams and 39 at 25: exactly the matches of one night (3 rounds of
    N / 2 pairs, the bye's pairs included).

So if a wait-free night H (three perfect matchings of K_N, laid out on `courts` x `times`) takes
exactly one pair from every full orbit, then H, gH, ..., g^(k-1) H are k wait-free nights (the same
rows, teams renamed) using every full-orbit pair once, and the short orbits plus {f, bye} are the
last round, a night of one game per team. That is the whole round robin: n = 3k + 1 rounds.

The SAT model is odd-night-sat's one-night layout (match rows, at most `courts` a row, each team's
rows consecutive, the window shapes) plus "exactly one pair of each full orbit tonight". It is a
single-night question, so it is small (a few thousand variables). Decoded seasons are re-checked by
odd-night-sat.check and printed as the JSON odd-night-sat.py prints, so eval/write-odd-designs.mjs
stores them unchanged.

It only finds designs (UNSAT rules out this group only, not the size).
Needs python-sat (pip install python-sat; MIT), for this eval script only.
  python3 eval/odd-orbit.py 19 --courts 3 --times 9
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


def perm(n):
    """g as a list: three k-cycles on 0 .. 3k - 1, fixing 3k (= n - 1) and the bye team n."""
    k = (n - 1) // 3
    g = list(range(n + 1))
    for c in range(3):
        for i in range(k):
            g[c * k + i] = c * k + (i + 1) % k
    return g, k


def orbits(n):
    """The orbits of <g> on the pairs of K_(n+1): (full orbits, the short pairs forming the last round)."""
    g, k = perm(n)
    N = n + 1
    seen, full, short = set(), [], []
    for i in range(N):
        for j in range(i + 1, N):
            if (i, j) in seen:
                continue
            orb, e = [], (i, j)
            while e not in orb:
                orb.append(e)
                a, b = g[e[0]], g[e[1]]
                e = (min(a, b), max(a, b))
            seen.update(orb)
            (full if len(orb) == k else short).append(orb)
    return full, [e for o in short for e in o]


def night_model(n, courts, times, full, short, g3=3):
    """One wait-free night of 3 rounds whose pairs take exactly one pair of every full orbit."""
    N = n + 1
    pool = IDPool()
    cnf = CNF()

    def card(lits, bound, kind, extra=()):
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost}[kind]
        for cl in enc(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter).clauses:
            cnf.append(cl + list(extra))

    pairs = [(i, j) for i in range(N) for j in range(i + 1, N)]
    x = {(r, i, j): pool.id(("x", r, i, j)) for r in range(g3) for (i, j) in pairs}
    for r in range(g3):
        for v in range(N):
            card([x[r, min(v, u), max(v, u)] for u in range(N) if u != v], 1, "eq")
    for e in short:
        for r in range(g3):
            cnf.append([-x[(r,) + e]])
    for orb in full:
        card([x[(r,) + e] for r in range(g3) for e in orb], 1, "eq")
    # the night's layout, as odd-night-sat.build lays out night 0 (with --shape)
    real = [(i, j) for (i, j) in pairs if j < n]
    p, q = {}, {}
    for (i, j) in real:
        ps = [pool.id(("p", i, j, h)) for h in range(times)]
        for h, v in enumerate(ps):
            p[i, j, h] = v
            cnf.append([-v] + [x[r, i, j] for r in range(g3)])
        for r in range(g3):
            cnf.append([-x[r, i, j]] + ps)
        card(ps, 1, "le")
    for v in range(n):
        for h in range(times):
            lits = [p[min(v, u), max(v, u), h] for u in range(n) if u != v]
            qv = pool.id(("q", v, h))
            q[v, h] = qv
            for l in lits:
                cnf.append([-l, qv])
            cnf.append([-qv] + lits)
            card(lits, 1, "le")
        for a in range(times):
            for c in range(a + 2, times):
                for b in range(a + 1, c):
                    cnf.append([-q[v, a], -q[v, c], q[v, b]])
    shapes = ons.window_shapes(n - g3, g3, g3, courts, times)
    if not shapes:
        return None
    kinds = sorted({(f, g3) for F, _ in shapes for f in F} | {(s, g3 - 1) for _, S in shapes for s in S})
    w = {(v, kk): pool.id(("w", v, kk)) for v in range(n) for kk in kinds}
    for v in range(n):
        card([w[v, kk] for kk in kinds], 1, "eq")
        bye = [x[r, v, n] for r in range(g3)]
        for kk in kinds:
            st, ln = kk
            for h in range(times):
                cnf.append([-w[v, kk], q[v, h] if st <= h < st + ln else -q[v, h]])
            if ln == g3 - 1:
                cnf.append([-w[v, kk]] + bye)
            else:
                for b in bye:
                    cnf.append([-w[v, kk], -b])
    z = [pool.id(("z", i)) for i in range(len(shapes))]
    card(z, 1, "eq")
    for zi, (F, S) in zip(z, shapes):
        for kk in kinds:
            m = F.count(kk[0]) if kk[1] == g3 else S.count(kk[0])
            card([w[v, kk] for v in range(n)], m, "eq", extra=[] if len(shapes) == 1 else [-zi])
    full_night = (n - 1) // 2 * g3 == courts * times
    for h in range(times):
        card([p[i, j, h] for (i, j) in real], courts, "eq" if full_night else "le")
    return cnf, x, p, pairs, real


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--times", type=int, default=9)
    ap.add_argument("--solver", default="cd15")
    args = ap.parse_args()
    n, courts, times = args.n, args.courts, args.times
    assert n % 6 == 1, "n = 3k + 1 with k even"
    t0 = time.time()
    g, k = perm(n)
    full, short = orbits(n)
    N = n + 1
    assert len(full) == 3 * N // 2 and len(short) == N // 2, (len(full), len(short))
    built = night_model(n, courts, times, full, short)
    head = {"n": n, "courts": courts, "times": times, "method": "orbit", "k": k}
    if built is None:
        head["sat"] = False
        head["note"] = "no window shape fits"
        print(json.dumps(head))
        return
    cnf, x, p, pairs, real = built
    head["vars"], head["clauses"] = cnf.nv, len(cnf.clauses)
    with Solver(name=args.solver, bootstrap_with=cnf.clauses) as s:
        ok = s.solve()
        model = set(v for v in s.get_model() if v > 0) if ok else None
    head["sat"] = ok
    head["seconds"] = round(time.time() - t0, 1)
    if not ok:
        print(json.dumps(head))
        return
    H = [[(i, j) for (i, j) in pairs if x[r, i, j] in model] for r in range(3)]
    lay = {(i, j): h for (i, j) in real for h in range(times) if p[i, j, h] in model}

    def img(e, t):
        a, b = e
        for _ in range(t):
            a, b = g[a], g[b]
        return (min(a, b), max(a, b))

    rounds, rows, nights = [], [], []
    for t in range(k):
        nights.append(list(range(len(rounds), len(rounds) + 3)))
        for r in H:
            rounds.append(sorted(img(e, t) for e in r))
        rows.append({img(e, t): h for e, h in lay.items()})
    nights.append([len(rounds)])
    rounds.append(sorted(short))
    rows.append({e: i // courts for i, e in enumerate(m for m in sorted(short) if m[1] < n)})
    ons.check(n, rounds, nights, rows, courts, times)
    head["rounds"] = [[list(m) for m in r] for r in rounds]
    head["rows"] = [[[i, j, h] for (i, j), h in sorted(r.items())] for r in rows]
    print(json.dumps(head))


if __name__ == "__main__":
    main()
