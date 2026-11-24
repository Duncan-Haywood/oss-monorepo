"""Is the lane-pair bound out of reach? SAT verdicts for the bowling seasons a search misses.

    python3 eval/bowling-bound-proof.py misses.jsonl [seconds per season] > verdicts.jsonl
`misses.jsonl` holds lines from eval/bowling-bound-sweep.mjs ({"n", "W", "off", ...}); lines with
off 0 are skipped. Each miss goes to CaDiCaL with the CNF of eval/bowling-lane-sat.py (exactly one
pair per match and one match per pair each week; every team on every pair floor(W/P)..ceil(W/P)
times; week 1 fixed, as pair labels are interchangeable) over the round-robin weeks
bowlingSchedule() plays (roundRobin(n) in order from round 1). Prints {"n", "W", "status"}:
UNSAT means no lane deal of those weeks puts every team at the bound, whatever the search, so
bowling-proofs.mjs lists it and the page says the even split is out of reach; SAT means one exists
(the search's miss is the search's fault); UNKNOWN means the time ran out. Needs python-sat.
"""
import json, subprocess, sys
from pathlib import Path
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153

here = Path(__file__).resolve().parent


def settle(n, W):
    rounds = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(W)]))["rounds"]
    P = n // 2
    pool = IDPool()
    x = lambda w, m, p: pool.id(("x", w, m, p))
    cnf = CNF()
    for w in range(W):
        for m in range(P):
            cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
        for p in range(P):
            cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
    lo, hi = W // P, -(-W // P)
    for t in range(n):
        for p in range(P):
            lits = [x(w, m, p) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)]
            if hi < len(lits):
                cnf.extend(CardEnc.atmost(lits, hi, vpool=pool, encoding=EncType.pairwise if hi == 1 else EncType.seqcounter).clauses)  # pairwise at hi 1: 22x10 in 1.5 s, none in 420 s (2026-11-24)
            if lo > 0:
                cnf.extend(CardEnc.atleast(lits, lo, vpool=pool, encoding=EncType.seqcounter).clauses)
    for m in range(P):  # pair labels are interchangeable: week 1's match m on pair m
        cnf.append([x(0, m, m)])
    with Cadical153(bootstrap_with=cnf.clauses) as s:
        r = s.solve()
        model = set(l for l in (s.get_model() or []) if l > 0) if r else set()
    if r:
        return "SAT", [[next(p for p in range(P) if x(w, m, p) in model) for m in range(P)] for w in range(W)]
    return "UNSAT", None


def settle_limited(n, W, limit):
    # This pysat's CaDiCaL cannot be interrupted, so each season runs in its own process.
    try:
        got = subprocess.run([sys.executable, __file__, "--one", str(n), str(W)], capture_output=True, text=True, timeout=limit, check=True)
    except subprocess.TimeoutExpired:
        return "UNKNOWN", None
    res = json.loads(got.stdout)
    return res["status"], res.get("plan")


if __name__ == "__main__" and sys.argv[1] == "--one":
    status, plan = settle(int(sys.argv[2]), int(sys.argv[3]))
    print(json.dumps({"status": status, **({"plan": plan} if plan else {})}))
elif __name__ == "__main__":
    src, limit = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 60
    for line in open(src):
        row = json.loads(line)
        if row["off"] == 0:
            continue
        status, plan = settle_limited(row["n"], row["W"], limit)
        print(f"teams {row['n']} weeks {row['W']} search off {row['off']}: {status}", file=sys.stderr, flush=True)
        print(json.dumps({"n": row["n"], "W": row["W"], "status": status}), flush=True)
