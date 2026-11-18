"""Repair the lane search's near miss into a SAT answer, a few weeks at a time (large neighbourhood search).

    /usr/bin/python3 eval/bowling-avoid-lns.py <teams> <weeks> '<shape>' [budget_s] [rng_seed]

For the lane-limit shapes whose whole-season SAT model (eval/bowling-avoid-shapes.py) gave no answer
in 300 s. Start: the page's own search on the shape's dealing (eval/bowling-avoid-start.mjs), a plan
with every limit kept and a few team-pair counts outside laneTargets(). Each step frees k weeks (the
weeks where an off-target count can move, plus random ones), keeps the rest as they are, and asks
Glucose (interruptible, 20 s) for those weeks' pairs with every count inside its target, the bans
hard. That sub-model is far smaller than the season's. A step with no answer (UNSAT or out of time)
tries another window and k grows by one every 6 failures. With no full answer yet, a step instead
asks for at most `off - 1` counts outside (soft per team-pair slack, a cardinality bound on the
slack), so the plan creeps towards the target. Prints {"n,W|shape": code} when every count is in
target (the code of eval/bowling-avoid-shapes.py); progress on stderr.
"""
import json, random, subprocess, sys, threading, time
from pathlib import Path
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Glucose4

here = Path(__file__).resolve().parent
n, W, shape = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
budget = float(sys.argv[4]) if len(sys.argv) > 4 else 1800
rng = random.Random(int(sys.argv[5]) if len(sys.argv) > 5 else 1)
P = n // 2
DIG = "0123456789abcdefghijklmnopqrstuvwxyz"
spec = [[int(t), [int(p) for p in ps.split(",")]] for t, ps in (part.split(":") for part in shape.split(";"))]
d = json.loads(subprocess.check_output(["node", str(here / "bowling-avoid-start.mjs"), str(n), str(W), json.dumps(spec)]))
rounds, avoid, lo, hi, plan = d["rounds"], d["avoid"], d["lo"], d["hi"], d["plan"]
plays = [[(w, m) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)] for t in range(n)]


def counts(pl):
    c = [[0] * P for _ in range(n)]
    for w, wk in enumerate(rounds):
        for m, (a, b) in enumerate(wk):
            c[a][pl[w][m]] += 1
            c[b][pl[w][m]] += 1
    return c


def off_cells(pl):
    c = counts(pl)
    return [(t, p, max(0, c[t][p] - hi[t][p]) + max(0, lo[t][p] - c[t][p])) for t in range(n) for p in range(P)
            if c[t][p] > hi[t][p] or c[t][p] < lo[t][p]]


def total_off(pl):
    return sum(o for _, _, o in off_cells(pl))


def solve_window(pl, weeks, max_off, limit=20.0):
    """Re-solve `weeks`; every other week stays. max_off: how many counts may be outside (0 = all in)."""
    weeks = set(weeks)
    pool = IDPool()
    x = lambda w, m, p: pool.id(("x", w, m, p))
    cnf = CNF()
    for w in weeks:
        for m, (a, b) in enumerate(rounds[w]):
            cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
            for p in set(avoid[a]) | set(avoid[b]):
                cnf.append([-x(w, m, p)])
        for p in range(P):
            cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
    slacks = []
    for t in range(n):
        fixed = [0] * P
        free = [(w, m) for w, m in plays[t] if w in weeks]
        for w, m in plays[t]:
            if w not in weeks:
                fixed[pl[w][m]] += 1
        for p in range(P):
            lits = [x(w, m, p) for w, m in free]
            L = len(lits)
            l0, h0 = lo[t][p] - fixed[p], hi[t][p] - fixed[p]
            atmost = lambda h: [[]] if h < 0 else ([] if h >= L else CardEnc.atmost(lits, h, vpool=pool, encoding=EncType.seqcounter).clauses)
            atleast = lambda l: [[]] if l > L else ([] if l <= 0 else CardEnc.atleast(lits, l, vpool=pool, encoding=EncType.seqcounter).clauses)
            if max_off == 0:
                cnf.extend(atmost(h0) + atleast(l0))
            else:
                # the count may miss its target by one if this team-pair's slack literal is set
                sl = pool.id(("s", t, p))
                slacks.append(sl)
                cnf.extend(atmost(h0 + 1) + atleast(l0 - 1))
                cnf.extend([c + [sl] for c in atmost(h0) + atleast(l0)])
    if max_off and slacks:
        cnf.extend(CardEnc.atmost(slacks, max_off, vpool=pool, encoding=EncType.seqcounter).clauses)
    with Glucose4(bootstrap_with=cnf.clauses) as s:
        # start from the current plan's pairs
        s.set_phases([x(w, m, pl[w][m]) for w in weeks for m in range(P)])
        timer = threading.Timer(limit, s.interrupt)
        timer.start()
        ok = s.solve_limited(expect_interrupt=True)
        timer.cancel()
        if not ok:
            return None
        model = set(v for v in s.get_model() if v > 0)
    new = [wk[:] for wk in pl]
    for w in weeks:
        for m in range(P):
            new[w][m] = next(p for p in range(P) if x(w, m, p) in model)
    return new


t0 = time.time()
cur = plan
off = total_off(cur)
print(f"{n} x {W} {shape}: start {off} off ({len(off_cells(cur))} cells)", file=sys.stderr, flush=True)
k, fails, steps = max(3, W // 4), 0, 0
while off and time.time() - t0 < budget:
    steps += 1
    bad = off_cells(cur)
    t, p, _ = rng.choice(bad)
    hot = [w for w, m in plays[t] if cur[w][m] == p] or [w for w, _ in plays[t]]
    weeks = set(rng.sample(hot, min(len(hot), max(1, k // 2))))
    while len(weeks) < min(k, W):
        weeks.add(rng.randrange(W))
    # first ask for a full answer; failing that, one fewer count outside
    new = solve_window(cur, weeks, 0)
    if new is None and off > 1:
        new = solve_window(cur, weeks, len(bad) - 1)
    if new is not None and total_off(new) < off:
        cur, off, fails = new, total_off(new), 0
        print(f"  step {steps}, k {k}, {time.time() - t0:.0f} s: {off} off", file=sys.stderr, flush=True)
    else:
        fails += 1
        if fails % 6 == 0 and k < W:
            k += 1
            print(f"  step {steps}, {time.time() - t0:.0f} s: k -> {k}", file=sys.stderr, flush=True)
dt = time.time() - t0
if off == 0:
    assert all(not (set(avoid[a]) | set(avoid[b])) & {cur[w][m]} for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk))
    print(f"{n} teams x {W} weeks, shape {shape}: SAT (LNS) in {dt:.1f} s, {steps} steps", file=sys.stderr, flush=True)
    print(json.dumps({f"{n},{W}|{shape}": "".join(DIG[cur[w][m]] for w in range(W) for m in range(P))}))
else:
    print(f"{n} teams x {W} weeks, shape {shape}: {off} off after {dt:.1f} s, {steps} steps", file=sys.stderr, flush=True)
    print("{}")
