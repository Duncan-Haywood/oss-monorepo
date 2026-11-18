#!/usr/bin/env python3
"""Exact search for low non-cyclic carry-over round robins, as a SAT problem.

The question (README, "Refilled rounds"): at 12 teams the annealing and refill searches stop at a
non-cyclic carry-over of 136, against a floor of 120. Is there a timetable below 136, or is 120
impossible? A heuristic search cannot answer either way; a SAT solver can, given time: SAT gives a
timetable at or under the asked value, UNSAT proves none exists.

Encoding (n teams, n - 1 rounds, n even, all teams playing):
  x[r, i, j]  teams i < j meet in round r. Each pair meets in exactly one round, each team plays
              exactly once per round. Symmetry: teams are labelled so team 0 meets team r + 1 in
              round r (any round robin can be relabelled that way, and relabelling keeps the value).
  p[t, r, a, b]  t met a in round r and b in round r + 1 (clause x[r,t,a] & x[r+1,t,b] -> p), so p
              feeds carry-over cell (a, b). Only this direction is needed: every constraint below
              bounds counts from above, so a model with a spare true p still has true counts at or
              under the bound, and the decoded timetable is re-scored from the opponents anyway.
  Each cell (a, b) counts its p's with a totalizer whose outputs o_k mean "cell >= k + 1".

The non-cyclic entries always sum to n(n - 2) (each team has n - 2 steps), so
  value = sum c^2 = n(n - 2) + 2 E,   E = sum over cells of C(c, 2) = sum_k k [c >= k + 1].
`--value V` asks for value <= V: a totalizer over o_1 once, o_2 twice, o_3 three times and so on
(capped at `--cap`, default 4: a cell of 5 would cost 10 of E on its own) is held to E <= (V -
n(n - 2)) / 2. So `--value 120` asks for the floor at 12 teams and `--value 134` for anything
below 136. Cells above `--cap` are forbidden, so an UNSAT is exact only when C(cap + 1, 2) > E,
which the script checks and says.

A model is decoded to opp[r][t] (the format of TIMETABLES in carryover.mjs), re-scored here from
the opponents alone and printed as JSON; carryover.test.mjs re-checks stored ones in JS.

Needs python-sat (pip install python-sat; MIT), used by this eval script only, not by the tool.

  python3 eval/carryover-sat.py --teams 12 --value 134 --seconds 3600
"""
import argparse
import itertools
import json
import sys
import multiprocessing as mp
import time

from pysat.card import CardEnc, EncType, ITotalizer
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver


def build(n, excess, cap):
    R = n - 1
    pool = IDPool()
    cnf = CNF()

    def x(r, i, j):
        if i > j:
            i, j = j, i
        return pool.id(("x", r, i, j))

    def exactly_one(lits):
        enc = CardEnc.equals(lits=lits, bound=1, vpool=pool, encoding=EncType.seqcounter)
        cnf.extend(enc.clauses)

    for i, j in itertools.combinations(range(n), 2):
        exactly_one([x(r, i, j) for r in range(R)])
    for r in range(R):
        for t in range(n):
            exactly_one([x(r, t, u) for u in range(n) if u != t])
    for r in range(R):
        cnf.append([x(r, 0, r + 1)])

    cells = {}
    for t in range(n):
        for r in range(R - 1):
            for a in range(n):
                if a == t:
                    continue
                for b in range(n):
                    if b == t or b == a:
                        continue
                    p = pool.id(("p", t, r, a, b))
                    cnf.append([-x(r, t, a), -x(r + 1, t, b), p])
                    cells.setdefault((a, b), []).append(p)

    weighted = []  # o_k repeated k times: their count is E
    for (a, b), lits in sorted(cells.items()):
        tot = ITotalizer(lits=lits, ubound=cap + 1, top_id=pool.top)  # rhs[k]: at least k + 1
        pool.top = tot.top_id
        cnf.extend(tot.cnf.clauses)
        cnf.append([-tot.rhs[cap]])  # no cell above cap
        for k in range(1, cap):
            weighted.extend([tot.rhs[k]] * k)
    if excess == 0:
        cnf.extend([[-l] for l in set(weighted)])
    else:
        tot = ITotalizer(lits=weighted, ubound=excess + 1, top_id=pool.top)
        pool.top = tot.top_id
        cnf.extend(tot.cnf.clauses)
        cnf.append([-tot.rhs[excess]])
    return cnf, x


def decode(n, model, x):
    true = set(l for l in model if l > 0)
    opp = [[None] * n for _ in range(n - 1)]
    for r in range(n - 1):
        for i, j in itertools.combinations(range(n), 2):
            if x(r, i, j) in true:
                opp[r][i] = j
                opp[r][j] = i
    return opp


def score(opp):
    """Non-cyclic carry-over value and largest cell, from the opponents alone, after checking opp
    is a round robin (same counting as carryOverFromOpponents in carryover.mjs)."""
    n = len(opp[0])
    assert all(row[row[t]] == t and row[t] != t for row in opp for t in range(n))
    for t in range(n):
        assert sorted(opp[r][t] for r in range(len(opp))) == [u for u in range(n) if u != t]
    m = [[0] * n for _ in range(n)]
    for t in range(n):
        for r in range(len(opp) - 1):
            m[opp[r][t]][opp[r + 1][t]] += 1
    return sum(v * v for row in m for v in row), max(v for row in m for v in row)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teams", type=int, default=12)
    ap.add_argument("--value", type=int, required=True, help="ask for non-cyclic carry-over <= this")
    ap.add_argument("--cap", type=int, default=4, help="largest cell allowed")
    ap.add_argument("--solver", default="cadical195")
    ap.add_argument("--seconds", type=float, default=600)
    a = ap.parse_args()
    n = a.teams
    floor = n * (n - 2)
    excess = (a.value - floor) // 2
    if excess < 0:
        print(f"{a.value} is below the floor {floor}")
        return 1
    exact = (a.cap + 1) * a.cap // 2 > excess
    t0 = time.time()
    cnf, x = build(n, excess, a.cap)
    print(f"teams {n}, value <= {floor + 2 * excess} (E <= {excess}), cells <= {a.cap}"
          f"{'' if exact else ' (cap binds: an UNSAT here is not exact)'}: {cnf.nv} vars, "
          f"{len(cnf.clauses)} clauses, built in {time.time() - t0:.1f} s; {a.solver}, limit {a.seconds:.0f} s",
          flush=True)
    # The solver holds the GIL, so a timer thread cannot interrupt it: solve in a child process
    # and kill it at the limit.
    q = mp.Queue()
    xs = sorted(x(r, i, j) for r in range(n - 1) for i, j in itertools.combinations(range(n), 2))
    child = mp.Process(target=solve, args=(a.solver, cnf.clauses, xs, q))
    t1 = time.time()
    child.start()
    child.join(a.seconds)
    dt = time.time() - t1
    if child.is_alive():
        child.terminate()
        child.join()
        print(f"UNKNOWN after {dt:.0f} s (time limit)", flush=True)
        return 2
    res, model = q.get()
    if res is False:
        print(f"UNSAT in {dt:.1f} s: no {n}-team round robin has non-cyclic carry-over <= {floor + 2 * excess}"
              f"{'' if exact else f' with every cell <= {a.cap}'}", flush=True)
        return 1
    opp = decode(n, model, x)
    value, mx = score(opp)
    print(f"SAT in {dt:.1f} s: non-cyclic carry-over {value}, largest cell {mx}")
    print(json.dumps(opp), flush=True)
    return 0


def solve(name, clauses, xs, q):
    # Only the true match variables go back: a whole model is large enough to fill the pipe, and a
    # child blocked on a full pipe would look like a timeout.
    with Solver(name=name, bootstrap_with=clauses) as s:
        res = s.solve()
        if res:
            model = s.get_model()
            q.put((True, [v for v in xs if model[v - 1] > 0]))
        else:
            q.put((False, None))


if __name__ == "__main__":
    sys.exit(main())
