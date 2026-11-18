"""Can P rounds of the circle method be put on P lane pairs with every team on every pair once?

    python3 eval/bowling-lane-blocks.py <teams> [seed]

seed 0 (default) takes the first P rounds of roundRobin(teams); seed k > 0 takes P rounds chosen at
random with random.seed(k). Prints SAT or UNSAT (CaDiCaL via python-sat). A "yes" would let a
season be split into P-week blocks that are each perfectly even; 2026-11-18 found only UNSAT
(eval/bowling-lane-table.txt, "Blocks").
"""
import json, random, subprocess, sys
from pathlib import Path
from pysat.card import CardEnc
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153

n = int(sys.argv[1]); seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
P = n // 2
here = Path(__file__).resolve().parent
allr = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(n - 1)]))["rounds"]
if seed:
    random.seed(seed); rounds = random.sample(allr, P)
else:
    rounds = allr[:P]
pool = IDPool(); x = lambda w, m, p: pool.id((w, m, p)); cnf = CNF()
for w, wk in enumerate(rounds):
    for m in range(P): cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool).clauses)
    for p in range(P): cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool).clauses)
for t in range(n):
    for p in range(P):
        lits = [x(w, m, p) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)]
        cnf.extend(CardEnc.atmost(lits, 1, vpool=pool).clauses)
with Cadical153(bootstrap_with=cnf.clauses) as s:
    print(f"teams {n} seed {seed}:", "SAT" if s.solve() else "UNSAT")
