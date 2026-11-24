"""Bowling lane-pair seasons at the bound as a CP-SAT model, with an optional mirror symmetry.

    python3 eval/bowling-mirror-cpsat.py <teams> <weeks> <seconds> [--mirror] [--workers N] > answer.json
Same model as eval/bowling-encoding.py: each week a permutation of its matches onto the
P lane pairs (week 1 fixed, match m on pair m, without --mirror), and every team on every pair floor(W/P)..ceil(W/P) times (off = 0). At a
limit of 1 (W <= P) written as one AllDifferent per week and per team; otherwise as linear counts. --mirror adds the reflection of the circle method: t -> W-1-t (mod n-1,
the fixed team fixed) maps round r's match k to round W-1-r's match k, and the answer is asked to send
that match to pi(pair) for pi(p) = p xor 1 (P odd: the last pair fixed). With W odd the middle round is its own
image, which forces pi = identity. The fixed team then bowls on the same pair in weeks r and W-1-r, so
every pair's count for it is even except the middle week's: impossible at a limit of 1, and for
22 x 33 (every pair 3 times) and 26 x 25 (every pair 1-2 times, 13 pairs from 7 values) too
(22 x 33 checked: INFEASIBLE in 0.0 s). So --mirror refuses odd W.
--soft lets counts leave floor..ceil and minimises the total out-of-bounds count (offBound in bowling.mjs),
so with --hint it can return a stored near answer made closer rather than nothing; Ctrl-free: the best
answer at the time limit is printed with its "off" and the solver's proved lower "bound" (OPTIMAL when equal).
--hint starts the search from the stored near answer (bowling-lane-near.mjs) for this season: without
--mirror its pair labels are renamed so week 1 reads 0..P-1 (counts are unchanged by a renaming); with
--mirror the hint is the near answer as stored (not symmetric, so only a starting point).
Prints {"n","W","status","plan","seconds"}; plan[w][m] = pair of match m of week w (roundRobin order).
Needs ortools (pip install ortools).
"""
import sys, json, subprocess, time
from ortools.sat.python import cp_model
args = sys.argv[1:]
n, W, secs = int(args[0]), int(args[1]), float(args[2])
mirror = "--mirror" in args
workers = int(args[args.index("--workers") + 1]) if "--workers" in args else 4
here = __import__("pathlib").Path(__file__).resolve().parent
rounds = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(W)]))["rounds"]
P = n // 2
lo, hi = W // P, -(-W // P)
m = cp_model.CpModel()
L = [[m.NewIntVar(0, P - 1, f"L{w}_{k}") for k in range(P)] for w in range(W)]
X = [[[m.NewBoolVar("") for p in range(P)] for k in range(P)] for w in range(W)]
for w in range(W):
    for k in range(P):
        m.AddExactlyOne(X[w][k])
        for p in range(P): m.Add(L[w][k] == p).OnlyEnforceIf(X[w][k][p])
    for p in range(P): m.AddExactlyOne(X[w][k][p] for k in range(P))
    m.AddAllDifferent(L[w])
soft = "--soft" in args
offs = []
for t in range(n):
    seen = [(w, k) for w, wk in enumerate(rounds) for k, (a, b) in enumerate(wk) if t in (a, b)]
    if soft:  # counts outside lo..hi allowed and paid for: the objective is offBound's total
        for p in range(P):
            c = sum(X[w][k][p] for w, k in seen)
            ov, un = m.NewIntVar(0, W, ""), m.NewIntVar(0, W, "")
            m.Add(c - ov <= hi); m.Add(c + un >= lo); offs += [ov, un]
    elif hi == 1:
        m.AddAllDifferent([L[w][k] for w, k in seen])
        for p in range(P): m.AddAtMostOne(X[w][k][p] for w, k in seen)
    else:
        for p in range(P): m.AddLinearConstraint(sum(X[w][k][p] for w, k in seen), lo, hi)
if not mirror:  # with --mirror, pi already uses the label freedom: fixing week 1 too would over-constrain
    for k in range(P): m.Add(L[0][k] == k)
if mirror:
    if W % 2: sys.exit("--mirror needs an even number of weeks (see the header)")
    q = n - 1 if n % 2 == 0 else n
    # match of round r identified by its unordered team pair; image under t -> W-1-t (mod q), q-1 fixed... the
    # fixed team of roundRobin is N-1 = n-1 (n even).
    img = lambda t: t if t == n - 1 else (W - 1 - t) % (n - 1)
    pi = lambda p: p ^ 1 if p ^ 1 < P else p   # P odd: the last pair is pi's one fixed point
    idx = [{frozenset(ab): k for k, ab in enumerate(wk)} for wk in rounds]
    for w in range(W // 2):
        for k, (a, b) in enumerate(rounds[w]):
            k2 = idx[W - 1 - w][frozenset((img(a), img(b)))]
            for p in range(P): m.Add(X[W - 1 - w][k2][pi(p)] == X[w][k][p])
if "--hint" in args:
    near = subprocess.check_output(["node", "--input-type=module", "-e",
        f"import {{ LANE_NEAR }} from '{here.parent / 'bowling-lane-near.mjs'}'; process.stdout.write(LANE_NEAR['{n},{W}'].code)"]).decode()
    plan = [[int(near[w * P + k], 36) for k in range(P)] for w in range(W)]
    if not mirror:
        ren = {plan[0][k]: k for k in range(P)}
        plan = [[ren[p] for p in row] for row in plan]
    for w in range(W):
        for k in range(P):
            m.AddHint(L[w][k], plan[w][k])
            for p in range(P): m.AddHint(X[w][k][p], int(plan[w][k] == p))
    out_hint = True
if soft: m.Minimize(sum(offs))
s = cp_model.CpSolver(); s.parameters.max_time_in_seconds = secs; s.parameters.num_workers = workers
t0 = time.time(); r = s.Solve(m)
out = {"n": n, "W": W, "status": s.StatusName(r), "mirror": mirror, "hint": "--hint" in args, "seconds": round(time.time() - t0, 1)}
if r in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    if soft: out["off"], out["bound"] = int(s.ObjectiveValue()), int(round(s.BestObjectiveBound()))
    out["plan"] = [[s.Value(L[w][k]) for k in range(P)] for w in range(W)]
print(json.dumps(out), flush=True)
