#!/usr/bin/env python3
"""Least breaks for a fixed timetable, exactly (MaxSAT), against the breaks the tool's search found.

The question (README, "Exact grounds for a fixed timetable"): the frontier of carry-over against
back-to-back home or away games has gaps the squeezes cannot close (20 teams single: 360 / 52 to
546 / 36). Carry-over depends only on who meets whom in which round, not on grounds. So for each
season the page lists, the least breaks its own timetable allows is a point on the frontier at the
same carry-over. If the tool's ground search (assignVenues, the shift orientation, the squeezes)
already reaches it, the gaps are in the timetables; if not, better grounds alone close part of them.

Encoding. One variable per match (pair in a leg): true when the first-listed team hosts. In a
home-and-away season the second meeting is at the other ground, so leg two reuses leg one's
variable negated. For each team and two rounds in a row where it plays both (a bye resets the run,
as teamBreaks / hostBreaks count), two soft clauses (h1 or h2) and (not h1 or not h2) of weight 1:
exactly one is broken when h1 == h2, so the cost is the break count. Hard: each team's home games
in leg one within one of its away games (the page's balance rule; a season is then n - 1 each).
RC2 (python-sat, MIT) returns an optimum, so "exact" below means proven least, not a better guess.

Needs python-sat (pip install python-sat), used by this eval script only, not by the tool.

  node eval/venue-exact-dump.mjs --sizes 12,20 --seeds 1 --out cache
  python3 eval/venue-exact.py cache/*.json
"""
import json
import sys
import threading
import time

from pysat.card import CardEnc, EncType
from pysat.card import ITotalizer
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver


def season_breaks(rounds, n):
    last = [None] * n
    b = 0
    for rnd in rounds:
        playing = set()
        for h, a in rnd["matches"]:
            for t, v in ((h, 1), (a, 0)):
                if last[t] == v:
                    b += 1
                last[t] = v
                playing.add(t)
        for t in range(n):
            if t not in playing:
                last[t] = None
    return b


def least_breaks(rounds, n, double, ub, seconds):
    """(least breaks found, proven) for this timetable: a linear SAT-UNSAT search downward from
    `ub` (the tool's own count), each step asking for fewer breaks than the last model had. UNSAT
    proves the last count least; running out of `seconds` leaves it an upper bound only."""
    R = len(rounds) // (2 if double else 1)
    pool = IDPool()
    cnf = CNF()
    home = []
    for r, rnd in enumerate(rounds):
        row = {}
        for h, a in rnd["matches"]:
            i, j = min(h, a), max(h, a)
            v = pool.id((i, j))  # i hosts in leg one
            lit_i = v if r < R else -v
            row[i] = lit_i
            row[j] = -lit_i
        home.append(row)
    breaks = []
    for t in range(n):
        for r in range(len(rounds) - 1):
            if t in home[r] and t in home[r + 1]:
                a, b = home[r][t], home[r + 1][t]
                x = pool.id(("b", t, r))
                breaks.append(x)
                cnf.append([a, b, x])
                cnf.append([-a, -b, x])
        lits = [home[r][t] for r in range(R) if t in home[r]]
        g = len(lits)
        cnf.extend(CardEnc.atmost(lits, bound=(g + 1) // 2, vpool=pool, encoding=EncType.seqcounter).clauses)
        cnf.extend(CardEnc.atleast(lits, bound=g // 2, vpool=pool, encoding=EncType.seqcounter).clauses)
    cnf.append([1])  # flipping every ground keeps breaks and balance: fix one match
    if ub == 0:
        return 0, True
    tot = ITotalizer(lits=breaks, ubound=ub, top_id=pool.top)
    best, proven = ub, False
    deadline = time.time() + seconds
    with Solver(name="g4", bootstrap_with=cnf.clauses + tot.cnf.clauses) as s:
        k = ub - 1
        while k >= 0:
            left = deadline - time.time()
            if left <= 0:
                break
            timer = threading.Timer(left, s.interrupt)
            timer.start()
            res = s.solve_limited(assumptions=[-tot.rhs[k]], expect_interrupt=True)
            timer.cancel()
            s.clear_interrupt()
            if res is None:
                break
            if res is False:
                proven = True
                break
            m = set(l for l in s.get_model() if l > 0)
            best = sum(1 for b in breaks if b in m)
            k = best - 1
        if k < 0:
            proven = True
    return best, proven


def frontier(points):
    f = [p for p in points if not any(q[0] <= p[0] and q[1] <= p[1] and (q[0] < p[0] or q[1] < p[1]) for q in points)]
    return sorted(set(f))


def main(files, seconds):
    rows = []
    for path in files:
        d = json.load(open(path))
        n, double = d["n"], d["double"]
        before, after, res = [], [], []
        for s in d["seasons"]:
            t0 = time.time()
            got = season_breaks(s["rounds"], n)
            assert got == s["breaks"], (path, s["index"], got, s["breaks"])
            cost, proven = least_breaks(s["rounds"], n, double, s["breaks"], seconds)
            res.append({"index": s["index"], "coe": s["coe"], "breaks": s["breaks"], "least": cost, "proven": proven, "s": round(time.time() - t0, 1)})
            before.append((s["coe"], s["breaks"]))
            after.append((s["coe"], cost))
        fb, fa = frontier(before), frontier(after)
        row = {"kind": "double" if double else "single", "teams": n, "seed": d["seed"],
               "seasons": len(res), "improved": sum(r["least"] < r["breaks"] for r in res),
               "proven": sum(r["proven"] for r in res),
               "frontierBefore": [f"{c}/{b}" for c, b in fb], "frontierAfter": [f"{c}/{b}" for c, b in fa],
               "detail": res}
        print(json.dumps(row), flush=True)
        rows.append(row)
    return rows


if __name__ == "__main__":
    args = sys.argv[1:]
    seconds = 20.0
    if args[:1] == ["--seconds"]:
        seconds, args = float(args[1]), args[2:]
    main(args, seconds)
