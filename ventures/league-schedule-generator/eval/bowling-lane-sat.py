"""Is perfect lane-pair balance possible? A SAT check for bowling.mjs.

For an even league of n teams on P = n/2 lane pairs and W round-robin weeks (the circle-method
rounds bowlingSchedule() plays, repeated), ask whether every team can bowl on every pair
floor(W/P) or ceil(W/P) times (spread at most 1, or exactly 0 when P divides W). Which week a
round falls in does not change lane counts, so this answers the balance question for the season
whatever the round order. Prints SAT (bound reachable), UNSAT (proved impossible) or UNKNOWN.

    python3 eval/bowling-lane-sat.py 12 30 [seconds]
Needs python-sat (pip install python-sat).
"""
import json, subprocess, sys, threading
from pathlib import Path
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153

n, W = int(sys.argv[1]), int(sys.argv[2])
limit = float(sys.argv[3]) if len(sys.argv) > 3 else 120
here = Path(__file__).resolve().parent
data = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(W)]))
rounds = data["rounds"]
P = n // 2
pool = IDPool()
x = lambda w, m, p: pool.id(("x", w, m, p))
cnf = CNF()
for w, wk in enumerate(rounds):
    for m in range(P):
        lits = [x(w, m, p) for p in range(P)]
        cnf.extend(CardEnc.equals(lits, 1, vpool=pool, encoding=EncType.seqcounter).clauses)
    for p in range(P):
        lits = [x(w, m, p) for m in range(P)]
        cnf.extend(CardEnc.equals(lits, 1, vpool=pool, encoding=EncType.seqcounter).clauses)
lo, hi = W // P, -(-W // P)
for t in range(n):
    for p in range(P):
        lits = [x(w, m, p) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)]
        cnf.extend(CardEnc.atmost(lits, hi, vpool=pool, encoding=EncType.pairwise if hi == 1 else EncType.seqcounter).clauses)  # pairwise at hi 1: 22x10 in 1.5 s, none in 420 s (2026-11-24)
        cnf.extend(CardEnc.atleast(lits, lo, vpool=pool, encoding=EncType.seqcounter).clauses)
# Symmetry: pair labels are interchangeable, so fix week 1's matches to pairs 0..P-1.
for m in range(P):
    cnf.append([x(0, m, m)])
with Cadical153(bootstrap_with=cnf.clauses) as s:
    timer = threading.Timer(limit, s.interrupt)
    timer.start()
    r = s.solve_limited(expect_interrupt=True)
    timer.cancel()
print(f"teams {n} pairs {P} weeks {W} counts {lo}..{hi}:", {True: "SAT", False: "UNSAT", None: "UNKNOWN"}[r])
