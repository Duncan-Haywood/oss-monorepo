"""Stored lane answers with the fewest back-to-back repeats CaDiCaL finds in a time cap.

    python3 eval/bowling-repeat-sat.py <teams> <weeks> [--cap R] [--start-from-table]  > case.json

The encoding of eval/bowling-lane-table.py (each week a permutation of matches onto pairs, every
team on every pair floor(W/P)..ceil(W/P) times), plus one indicator per team, week and pair for
"on this pair this week and the next" (y >= x(w) + x(w+1) - 1). The repeats are capped with a
totalizer (pysat ITotalizer), and the cap is lowered one solve at a time from the first answer's
count until UNSAT (proved least for this dealing) or the outer `timeout` stops the run. Each answer
is printed as soon as it is found, one JSON line {"key", "repeats", "code", "proved"}, so the last
line is the best; eval/bowling-repeat-merge.mjs keeps the lowest per key.
Needs python-sat (pip install python-sat). pysat's CaDiCaL cannot be interrupted: cap the run
from outside with `timeout`.
"""
import json, subprocess, sys, time
from pathlib import Path
from pysat.card import CardEnc, EncType, ITotalizer
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153

here = Path(__file__).resolve().parent
n, W = int(sys.argv[1]), int(sys.argv[2])
DIG = "0123456789abcdefghijklmnopqrstuvwxyz"
rounds = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(W)]))["rounds"]
P = n // 2
pool = IDPool(); x = lambda w, m, p: pool.id(("x", w, m, p)); cnf = CNF()
for w, wk in enumerate(rounds):
    for m in range(P):
        cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
    for p in range(P):
        cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
lo, hi = W // P, -(-W // P)
at = [{} for _ in range(W)]  # week -> team -> match index
for w, wk in enumerate(rounds):
    for m, (a, b) in enumerate(wk): at[w][a] = m; at[w][b] = m
for t in range(n):
    for p in range(P):
        lits = [x(w, at[w][t], p) for w in range(W)]
        cnf.extend(CardEnc.atmost(lits, hi, vpool=pool, encoding=EncType.seqcounter).clauses)
        cnf.extend(CardEnc.atleast(lits, lo, vpool=pool, encoding=EncType.seqcounter).clauses)
for m in range(P): cnf.append([x(0, m, m)])  # pair labels are free: fix week 1
# A repeat of team t on pair p in weeks w, w+1. When a match is played twice running (it never is
# in the circle method, but a short cycle could), both teams share the indicator's cause; count per team.
ys = []
for w in range(W - 1):
    for t in range(n):
        for p in range(P):
            y = pool.id(("y", w, t, p)); ys.append(y)
            cnf.append([-x(w, at[w][t], p), -x(w + 1, at[w + 1][t], p), y])
tot = ITotalizer(lits=ys, ubound=min(len(ys), 2 * n * W), top_id=pool.top)
cnf.extend(tot.cnf.clauses)

def decode(model):
    out = []
    for w in range(W):
        for m in range(P):
            out.append(DIG[next(p for p in range(P) if model[x(w, m, p) - 1] > 0)])
    return "".join(out)

def count(code):
    r = 0
    for w in range(W - 1):
        for t in range(n):
            if code[w * P + at[w][t]] == code[(w + 1) * P + at[w + 1][t]]: r += 1
    return r

cap = None; best = None
if "--cap" in sys.argv: cap = int(sys.argv[sys.argv.index("--cap") + 1])
t0 = time.time()
with Cadical153(bootstrap_with=cnf.clauses) as s:
    assume = [-tot.rhs[cap]] if cap is not None and cap < len(tot.rhs) else []
    while True:
        ok = s.solve(assumptions=assume)
        if not ok:
            print(f"teams {n} weeks {W}: below {cap + 1 if cap is not None else '?'} repeats UNSAT ({time.time() - t0:.1f} s)", file=sys.stderr, flush=True)
            if cap is not None and best is not None:
                print(json.dumps({"key": f"{n},{W}", "repeats": best[0], "code": best[1], "proved": True}), flush=True)
            break
        code = decode(s.get_model()); r = count(code)
        best = (r, code)
        print(json.dumps({"key": f"{n},{W}", "repeats": r, "code": code, "proved": r == 0}), flush=True)
        print(f"teams {n} weeks {W}: {r} repeats ({time.time() - t0:.1f} s)", file=sys.stderr, flush=True)
        if r == 0: break
        cap = r - 1
        assume = [-tot.rhs[cap]]
