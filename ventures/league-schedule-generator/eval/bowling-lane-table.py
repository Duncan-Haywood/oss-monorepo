"""Precompute lane-pair assignments at the bound for the seasons the page's search misses.

    python3 eval/bowling-lane-table.py <grid.jsonl>...  > part.json
    node eval/bowling-lane-table-merge.mjs part*.json > bowling-lane-table.mjs

Reads the JSON lines written by `node eval/bowling-lane-grid.mjs` ({"n", "W", "off"}), and for
every season with off > 0 asks CaDiCaL (python-sat) for an assignment of the circle-method rounds
bowlingSchedule() plays in which every team bowls on every pair floor(W/P) or ceil(W/P) times
(the encoding of eval/bowling-lane-sat.py). Prints {"n,W": "<pair of each match, week by week,
one base-36 digit each>"} for the ones it solves, and lists the rest on stderr. bowling.mjs checks
an entry against the bound before it uses it, so a stale entry is ignored, not trusted.
Needs python-sat (pip install python-sat). pysat's CaDiCaL cannot be interrupted, so cap a hard
season from outside: one grid line per file and `timeout 420 python3 eval/bowling-lane-table.py
case.jsonl` (2026-11-18: 4 cores, xargs -P 4); a season that times out is left to the search.
"""
import json, subprocess, sys, time
from pathlib import Path
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153

here = Path(__file__).resolve().parent
args = sys.argv[1:]
if "--seconds" in args:  # accepted for old command lines; the limit is the outer `timeout`
    i = args.index("--seconds"); del args[i:i + 2]
todo = []
for f in args:
    for line in open(f):
        r = json.loads(line)
        if r["off"] > 0: todo.append((r["n"], r["W"]))
DIG = "0123456789abcdefghijklmnopqrstuvwxyz"

def solve(n, W):
    rounds = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(W)]))["rounds"]
    P = n // 2
    pool = IDPool(); x = lambda w, m, p: pool.id(("x", w, m, p)); cnf = CNF()
    for w, wk in enumerate(rounds):
        for m in range(P):
            cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
        for p in range(P):
            cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
    lo, hi = W // P, -(-W // P)
    for t in range(n):
        for p in range(P):
            lits = [x(w, m, p) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)]
            cnf.extend(CardEnc.atmost(lits, hi, vpool=pool, encoding=EncType.pairwise if hi == 1 else EncType.seqcounter).clauses)  # pairwise at hi 1: 22x10 in 1.5 s, none in 420 s (2026-11-24)
            cnf.extend(CardEnc.atleast(lits, lo, vpool=pool, encoding=EncType.seqcounter).clauses)
    for m in range(P): cnf.append([x(0, m, m)])
    with Cadical153(bootstrap_with=cnf.clauses) as s:
        r = s.solve()
        if not r: return r, None
        model = set(v for v in s.get_model() if v > 0)
    out = []
    for w, wk in enumerate(rounds):
        for m in range(P):
            out.append(DIG[next(p for p in range(P) if x(w, m, p) in model)])
    return True, "".join(out)

table = {}
for n, W in sorted(set(todo)):
    t0 = time.time()
    r, code = solve(n, W)
    status = {True: "SAT", False: "UNSAT", None: "UNKNOWN"}[r]
    print(f"teams {n} weeks {W}: {status} in {time.time() - t0:.1f} s", file=sys.stderr, flush=True)
    if code: table[f"{n},{W}"] = code
print(json.dumps(table, indent=0, sort_keys=True))
