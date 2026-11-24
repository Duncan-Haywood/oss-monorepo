"""The lane-pair bound model of eval/bowling-lane-table.py with a choice of count encoding and solver.

    python3 eval/bowling-encoding.py <teams> <weeks> <seq|tot|card|kmt|direct> <solver> > answer.json
Each week a permutation of matches onto pairs (pairwise exactly-one), week 1 fixed, every team on every
pair floor(W/P)..ceil(W/P) times. A limit of 1 is always written pairwise; otherwise `direct` forbids
every hi+1 of a team's matches on one pair and writes "at least 1" as one clause, the others are
python-sat cardinality encodings. Solver: any python-sat name (cadical153, kissat404, ...). Prints
{"n", "W", "status", "plan"}; plan[w][m] = pair of match m of week w (roundRobin order).
2026-11-24: 22x10 SAT in 1.5 s; 22x21 SAT (kissat404 + tot, ~23 min; cadical153 + direct, ~4 min);
24x23 SAT (kissat404 + tot, ~21 min). eval/bowling-encoding-2026-11-24.txt. Needs python-sat.
"""
import sys, json, subprocess
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver
n, W, enc, solver = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
E = {"seq": EncType.seqcounter, "tot": EncType.totalizer, "card": EncType.cardnetwrk, "kmt": EncType.kmtotalizer, "direct": None}[enc]
here = __import__("pathlib").Path(__file__).resolve().parent
rounds = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(W)]))["rounds"]
P = n // 2; pool = IDPool(); x = lambda w, m, p: pool.id(("x", w, m, p)); cnf = CNF()
for w in range(W):
    for m in range(P):
        cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.pairwise).clauses)
    for p in range(P):
        cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.pairwise).clauses)
lo, hi = W // P, -(-W // P)
for t in range(n):
    for p in range(P):
        lits = [x(w, m, p) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)]
        if hi == 1: cnf.extend(CardEnc.atmost(lits, 1, vpool=pool, encoding=EncType.pairwise).clauses)
        elif enc == "direct":
            from itertools import combinations
            for c in combinations(lits, hi + 1): cnf.append([-l for l in c])
            if lo == 1: cnf.append(lits)
            elif lo > 1: cnf.extend(CardEnc.atleast(lits, lo, vpool=pool, encoding=EncType.totalizer).clauses)
        else:
            cnf.extend(CardEnc.atmost(lits, hi, vpool=pool, encoding=E).clauses)
            if lo > 0: cnf.extend(CardEnc.atleast(lits, lo, vpool=pool, encoding=E).clauses)
for m in range(P): cnf.append([x(0, m, m)])
with Solver(name=solver, bootstrap_with=cnf.clauses) as s:
    r = s.solve()
    out = {"n": n, "W": W, "status": "SAT" if r else "UNSAT", "enc": enc, "solver": solver}
    if r:
        md = set(l for l in s.get_model() if l > 0)
        out["plan"] = [[next(p for p in range(P) if x(w, m, p) in md) for m in range(P)] for w in range(W)]
    print(json.dumps(out), flush=True)
