"""Can every team sit inside its lane target with some teams banned from some pairs? SAT check.

The season of eval/bowling-lane-avoid.mjs: n teams on P = n/2 pairs, W circle-method weeks, the
avoided pairs as hard bans, every team-pair count inside laneTargets() lo..hi. SAT means the page's
search missed a deal that exists; UNSAT proves no deal of those weeks reaches every target.

    python3 eval/bowling-lane-avoid-sat.py 6 32 '[[0,[-1]],[1,[-1]]]'
(a negative pair counts from the end: -1 is the last pair). Needs python-sat.
"""
import json, subprocess, sys
from pathlib import Path
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153

n, W, spec = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
here = Path(__file__).resolve().parent
d = json.loads(subprocess.check_output(["node", str(here / "bowling-avoid-case.mjs"), str(n), str(W), spec]))
rounds, avoid, lo, hi = d["rounds"], d["avoid"], d["lo"], d["hi"]
P = n // 2
pool = IDPool()
x = lambda w, m, p: pool.id(("x", w, m, p))
cnf = CNF()
for w, wk in enumerate(rounds):
    for m, (a, b) in enumerate(wk):
        cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
        for p in set(avoid[a]) | set(avoid[b]):
            cnf.append([-x(w, m, p)])
    for p in range(P):
        cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
for t in range(n):
    for p in range(P):
        lits = [x(w, m, p) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)]
        cnf.extend(CardEnc.atmost(lits, hi[t][p], vpool=pool, encoding=EncType.seqcounter).clauses)
        if lo[t][p] > 0:
            cnf.extend(CardEnc.atleast(lits, lo[t][p], vpool=pool, encoding=EncType.seqcounter).clauses)
# CaDiCaL in python-sat has no interrupt, so this runs to an answer (each of the seven seasons
# in eval/bowling-lane-avoid.txt answered in under a minute here).
s = Cadical153(bootstrap_with=cnf.clauses)
print(f"{n} teams x {W} weeks, avoid {spec}: " + ("SAT" if s.solve() else "UNSAT"))
