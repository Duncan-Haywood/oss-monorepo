"""SAT answers for lane limits on the seasons the page's search misses, one per limit *shape*.

    python3 eval/bowling-avoid-shapes.py 20 30 '0:0' '0:0;1:0' ... > part.json

A lane limit's shape is which teams avoid which pairs, up to renaming teams and pairs. Balance
does not see names: the round robin can deal any team any slot of the circle method (the
organiser typed names, not slots), and every pair plays the same role. So one answer per shape
covers every league of that size with that shape: bowling.mjs maps the organiser's limited teams
onto the shape's slots and its pairs onto the shape's pairs (`avoidShapePlan`). A shape is
"team:pair,pair;team:pair" on slot and pair numbers (slots 0, 1, 2 ... in order, pairs too).

For each shape: CaDiCaL (python-sat) on roundRobin(n)'s first W rounds in order, the shape's
bans hard, every team-pair count inside laneTargets() lo..hi (eval/bowling-avoid-case.mjs, the
encoding of eval/bowling-lane-avoid-sat.py). Prints {"n,W|shape": "<pair of each match, week by
week, base 36>"} for SAT, and the time and UNSAT shapes on stderr. pysat's CaDiCaL cannot be
interrupted: cap a slow shape from outside (`timeout 600 python3 ...`).
"""
import json, subprocess, sys, time
from pathlib import Path
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153

here = Path(__file__).resolve().parent
n, W, shapes = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3:]
P = n // 2
DIG = "0123456789abcdefghijklmnopqrstuvwxyz"
out = {}
for shape in shapes:
    spec = [[int(t), [int(p) for p in ps.split(",")]] for t, ps in (part.split(":") for part in shape.split(";"))]
    d = json.loads(subprocess.check_output(["node", str(here / "bowling-avoid-case.mjs"), str(n), str(W), json.dumps(spec)]))
    rounds, avoid, lo, hi = d["rounds"], d["avoid"], d["lo"], d["hi"]
    pool = IDPool(); x = lambda w, m, p: pool.id(("x", w, m, p)); cnf = CNF()
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
    t0 = time.time()
    s = Cadical153(bootstrap_with=cnf.clauses)
    ok = s.solve()
    dt = time.time() - t0
    if ok:
        model = set(v for v in s.get_model() if v > 0)
        code = "".join(DIG[next(p for p in range(P) if x(w, m, p) in model)] for w in range(W) for m in range(P))
        out[f"{n},{W}|{shape}"] = code
    print(f"{n} teams x {W} weeks, shape {shape}: {'SAT' if ok else 'UNSAT'} in {dt:.1f} s", file=sys.stderr, flush=True)
print(json.dumps(out))
