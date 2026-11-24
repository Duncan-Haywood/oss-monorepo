"""Repair a near lane-pair season by SAT: keep most weeks of a near answer, free k weeks, ask for 0 off.

    python3 eval/bowling-week-repair.py <teams> <weeks> <solver> <k> <seconds-per-try> <total-seconds> \
        <start.json | near> [seed] > answer.json

start.json: {"plan": [[pair of match m of week w ...] ...]} (eval/bowling-week-lns.c output), or `near`
to start from bowling-lane-near.mjs's stored entry. Each try frees k random weeks (week 1 never: it names
the pairs), fixes the rest, and asks the solver for every team on every pair floor(W/P)..ceil(W/P) times
(the counts of the fixed weeks moved to the bounds, so only the freed weeks' cells are variables; a limit
of 1 left on a cell is written pairwise, wider limits by a totalizer). A try that finds nothing in its
seconds is dropped; the start is not changed between tries. Prints the first SAT plan, or
{"status": "none"} when the total time runs out. Needs python-sat.
"""
import sys, json, subprocess, random, time, threading
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver

n, W, solver, k, per, tot, start = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), sys.argv[7]
seed = int(sys.argv[8]) if len(sys.argv) > 8 else 1
here = __import__("pathlib").Path(__file__).resolve().parent
rounds = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(W)]))["rounds"]
P = n // 2; lo, hi = W // P, -(-W // P)
if start == "near":
    code = subprocess.check_output(["node", "--input-type=module", "-e",
        f"import {{ LANE_NEAR }} from '{here.parent / 'bowling-lane-near.mjs'}'; process.stdout.write(LANE_NEAR['{n},{W}'].code)"]).decode()
    plan = [[int(code[w * P + m], 36) for m in range(P)] for w in range(W)]
else:
    plan = json.load(open(start))["plan"]

def off(pl):
    c = [[0] * P for _ in range(n)]
    for w, wk in enumerate(rounds):
        for m, (a, b) in enumerate(wk): c[a][pl[w][m]] += 1; c[b][pl[w][m]] += 1
    return sum(max(0, v - hi) + max(0, lo - v) for row in c for v in row)

def attempt(free):
    pool = IDPool(); cnf = CNF(); x = lambda w, m, p: pool.id((w, m, p))
    base = [[0] * P for _ in range(n)]
    for w, wk in enumerate(rounds):
        if w in free: continue
        for m, (a, b) in enumerate(wk): base[a][plan[w][m]] += 1; base[b][plan[w][m]] += 1
    for w in free:
        for m in range(P):
            cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.pairwise).clauses)
        for p in range(P):
            cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.pairwise).clauses)
    for t in range(n):
        for p in range(P):
            lits = [x(w, m, p) for w in free for m, (a, b) in enumerate(rounds[w]) if t in (a, b)]
            l, h = max(0, lo - base[t][p]), hi - base[t][p]
            if h < 0 or l > len(lits): return None  # the fixed weeks already break this cell
            if h == 0: cnf.extend([[-v] for v in lits]); continue
            if h < len(lits):
                cnf.extend(CardEnc.atmost(lits, h, vpool=pool, encoding=EncType.pairwise if h == 1 else EncType.totalizer).clauses)
            if l == 1: cnf.append(lits)
            elif l > 1: cnf.extend(CardEnc.atleast(lits, l, vpool=pool, encoding=EncType.totalizer).clauses)
    with Solver(name=solver, bootstrap_with=cnf.clauses) as s:
        for w in free:  # phase hint: the start's own pairs
            s.set_phases([x(w, m, plan[w][m]) for m in range(P)])
        timer = threading.Timer(per, s.interrupt); timer.start()
        r = s.solve_limited(expect_interrupt=True); timer.cancel()
        if not r: return False if r is False else None
        md = set(v for v in s.get_model() if v > 0)
        out = [row[:] for row in plan]
        for w in free: out[w] = [next(p for p in range(P) if x(w, m, p) in md) for m in range(P)]
        return out

rng = random.Random(seed); t0 = time.time(); tries = 0; unsat = 0
print(f"# start off {off(plan)}", file=sys.stderr)
while time.time() - t0 < tot:
    free = sorted(rng.sample(range(1, W), k)); tries += 1
    r = attempt(set(free))
    if r is False: unsat += 1
    if r:
        assert off(r) == 0
        print(json.dumps({"n": n, "W": W, "status": "SAT", "off": 0, "freed": free, "tries": tries, "seconds": round(time.time() - t0), "plan": r}), flush=True)
        sys.exit(0)
print(json.dumps({"n": n, "W": W, "status": "none", "tries": tries, "unsat": unsat, "seconds": round(time.time() - t0)}), flush=True)
