#!/usr/bin/env python3
"""Odd leagues with three wait-free games a night, found (or ruled out) by a SAT solver.

The question (README, "Three games a night", open item "odd leagues by groups"): an odd league of n
teams plays n rounds, and each round one team sits out. On a night of 3 rounds, three teams sit
out one round each and play 2 games; the rest play 3. The closed-block designs of
session-design-sat.py do not apply (sessionBlocks returns null for odd n): a block cannot hold a
2-game team whose bye falls in the middle of the block's order. So this script asks for the
layout itself, match by match, the way nightRowsExact in nights.mjs places a night:

  x[r, i, j]     teams i < j of N = n + 1 meet in round r (team n is the bye). A 1-factorization
                 of K_N: each pair exactly once, each team exactly once a round.
  p[t, i, j, h]  real teams i < j < n play their night-t match in time row h (0 .. times - 1):
                 exactly one row when they meet on night t, none otherwise.
  q[t, v, h]     team v plays in row h on night t (at most one match per team per row).
  rows:          at most `courts` matches in a row.
  back to back:  q[t, v, a] and q[t, v, c] imply q[t, v, b] for every a < b < c.

Nights are rounds 3t, 3t + 1, 3t + 2, the last one shorter when 3 does not divide n (nightGroups
in nights.mjs), and every night is laid out. Symmetry: round 0 is (0 1)(2 3)...(n-1 n).

A model is decoded to n rounds over N teams, re-checked here (1-factorization; every night's rows
hold each team's games in consecutive rows, at most `courts` a row) and printed as JSON. nights.mjs
stores them (session-designs.mjs, ODD_DESIGNS) and the tests re-check them in JS with the tool's
own layout.

Needs python-sat (pip install python-sat; MIT), used by this eval script only, not by the tool.
  python3 eval/odd-night-sat.py 9 --courts 2 [--times 6] [--solver cd15]
"""
import argparse
import json
import time

from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver


def window_shapes(full, short, g, courts, times):
    """Every way to start `full` windows of g rows and `short` of g - 1 in `times` rows so that no
    row holds more than 2 x courts teams and every row an even number (two per match), as (full
    starts, short starts). A fully booked night allows only shapes that fill every row exactly:
    9 teams on 2 x 6, 13 on 3 x 6, 17 on 4 x 6 and 21 on 5 x 6 have one shape each; 15 on 4 x 6,
    19 on 5 x 6 and 23 on 6 x 6 have six."""
    from itertools import combinations_with_replacement as cwr
    out = []
    for F in cwr(range(times - g + 1), full):
        for S in cwr(range(times - g + 2), short):
            load = [0] * times
            for f in F:
                for r in range(f, f + g):
                    load[r] += 1
            for x in S:
                for r in range(x, x + g - 1):
                    load[r] += 1
            if max(load) <= 2 * courts and all(c % 2 == 0 for c in load):
                out.append((F, S))
    return out


def build(n, courts, times, g=3, only=None, shape=False, fix_round0=True):
    assert n % 2 == 1
    N = n + 1
    R = n
    pool = IDPool()
    cnf = CNF()

    def card(lits, bound, kind):
        enc = {"eq": CardEnc.equals, "le": CardEnc.atmost}[kind]
        cnf.extend(enc(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter).clauses)

    pairs = [(i, j) for i in range(N) for j in range(i + 1, N)]
    x = {(r, i, j): pool.id(("x", r, i, j)) for r in range(R) for (i, j) in pairs}
    for (i, j) in pairs:
        card([x[r, i, j] for r in range(R)], 1, "eq")
    for r in range(R):
        for v in range(N):
            card([x[r, min(v, u), max(v, u)] for u in range(N) if u != v], 1, "eq")
    for (i, j) in pairs if fix_round0 else ():  # off when a caller fixes its own structure (odd-orbit.py)
        cnf.append([x[0, i, j]] if (i % 2 == 0 and j == i + 1) else [-x[0, i, j]])

    nights = [list(range(s, min(s + g, R))) for s in range(0, R, g)]
    if only is not None:
        nights = nights[:only]  # lay out only the first `only` nights (a one-night question)
    real = [(i, j) for (i, j) in pairs if j < n]
    p, q = {}, {}
    for t, rs in enumerate(nights):
        for (i, j) in real:
            ps = [pool.id(("p", t, i, j, h)) for h in range(times)]
            for h, v in enumerate(ps):
                p[t, i, j, h] = v
                # a row only when they meet tonight
                cnf.append([-v] + [x[r, i, j] for r in rs])
            for r in rs:
                cnf.append([-x[r, i, j]] + ps)
            card(ps, 1, "le")
        for v in range(n):
            for h in range(times):
                lits = [p[t, min(v, u), max(v, u), h] for u in range(n) if u != v]
                qv = pool.id(("q", t, v, h))
                q[t, v, h] = qv
                for l in lits:
                    cnf.append([-l, qv])
                cnf.append([-qv] + lits)
                card(lits, 1, "le")
            for a in range(times):
                for c in range(a + 2, times):
                    for b in range(a + 1, c):
                        cnf.append([-q[t, v, a], -q[t, v, c], q[t, v, b]])

        full = (n - 1) // 2 * len(rs) == courts * times
        if shape and len(rs) == g:
            # implied constraints (window_shapes): every team takes one window, the night follows
            # one of the shapes the rows allow, as many teams per window as that shape says, and the
            # 2-game windows go to the night's bye teams. Sound (each wait-free night has a shape),
            # and it saves the solver from rediscovering the row counts (README, "Odd leagues, three
            # games a night"). With several shapes a selector z picks one; its counts are
            # cardinality constraints with -z added to every clause, so they bind only when chosen.
            shapes = window_shapes(n - g, g, g, courts, times)
            assert shapes, "no window shape fits: the night cannot be wait-free"
            kinds = sorted({(f, g) for F, _ in shapes for f in F} | {(x, g - 1) for _, S in shapes for x in S})
            w = {(v, k): pool.id(("w", t, v, k)) for v in range(n) for k in kinds}
            for v in range(n):
                card([w[v, k] for k in kinds], 1, "eq")
                bye = [x[r, v, n] for r in rs]
                for k in kinds:
                    st, ln = k
                    for h in range(times):
                        cnf.append([-w[v, k], q[t, v, h] if st <= h < st + ln else -q[t, v, h]])
                    if ln == g - 1:
                        cnf.append([-w[v, k]] + bye)
                    else:
                        for b in bye:
                            cnf.append([-w[v, k], -b])
            z = [pool.id(("z", t, i)) for i in range(len(shapes))]
            card(z, 1, "eq")
            for zi, (F, S) in zip(z, shapes):
                for k in kinds:
                    m = F.count(k[0]) if k[1] == g else S.count(k[0])
                    lits = [w[v, k] for v in range(n)]
                    if len(shapes) == 1:
                        card(lits, m, "eq")
                    else:
                        for cl in CardEnc.equals(lits=lits, bound=m, vpool=pool, encoding=EncType.seqcounter).clauses:
                            cnf.append(cl + [-zi])
        for h in range(times):
            # a fully booked night (every slot used): say so, so the solver propagates exact rows
            card([p[t, i, j, h] for (i, j) in real], courts, "eq" if full else "le")
    return cnf, x, p, pairs, real, nights


def check(n, rounds, nights, rows, courts, times):
    N = n + 1
    seen = set()
    for r in rounds:
        assert sorted(t for m in r for t in m) == list(range(N)), "a round is not a perfect matching"
        for a, b in r:
            key = (min(a, b), max(a, b))
            assert key not in seen, "a pair meets twice"
            seen.add(key)
    assert len(seen) == N * (N - 1) // 2
    for t, rs in enumerate(nights):
        tonight = {(min(a, b), max(a, b)) for r in rs for (a, b) in rounds[r] if max(a, b) < n}
        assert set(rows[t]) == tonight, f"night {t}: rows do not hold its matches"
        per_row = [0] * times
        played = {v: [] for v in range(n)}
        for (a, b), h in rows[t].items():
            per_row[h] += 1
            played[a].append(h)
            played[b].append(h)
        assert max(per_row) <= courts, f"night {t}: a row over {courts} courts"
        for v, hs in played.items():
            hs.sort()
            assert len(set(hs)) == len(hs), f"night {t}: team {v} twice in a row"
            assert not hs or hs[-1] - hs[0] == len(hs) - 1, f"night {t}: team {v} waits"
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--courts", type=int, required=True)
    ap.add_argument("--times", type=int, default=6)
    ap.add_argument("--solver", default="cd15")
    ap.add_argument("--shape", action="store_true", help="add the window shapes a night's rows allow (implied constraints)")
    ap.add_argument("--nights", type=int, default=None, help="lay out only the first K nights")
    args = ap.parse_args()
    n = args.n
    t0 = time.time()
    cnf, x, p, pairs, real, nights = build(n, args.courts, args.times, only=args.nights, shape=args.shape)
    with Solver(name=args.solver, bootstrap_with=cnf.clauses) as s:
        ok = s.solve()
        model = set(v for v in s.get_model() if v > 0) if ok else None
    dt = time.time() - t0
    head = {"n": n, "courts": args.courts, "times": args.times, "nights": args.nights, "shape": args.shape, "sat": ok, "seconds": round(dt, 1), "vars": cnf.nv, "clauses": len(cnf.clauses)}
    if not ok:
        print(json.dumps(head))
        return
    rounds = [[[i, j] for (i, j) in pairs if x[r, i, j] in model] for r in range(n)]
    rows = [{(i, j): h for (i, j) in real for h in range(args.times) if p[t, i, j, h] in model} for t in range(len(nights))]
    check(n, rounds, nights, rows, args.courts, args.times)
    head["rounds"] = rounds
    head["rows"] = [[[i, j, h] for (i, j), h in sorted(r.items())] for r in rows]
    print(json.dumps(head))


if __name__ == "__main__":
    main()
