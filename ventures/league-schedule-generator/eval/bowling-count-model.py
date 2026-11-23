"""Lane-limit seasons solved on counts, not weeks: no week-order symmetry left for the solver to search.

    python3 eval/bowling-count-model.py <teams> <weeks> '<shape>' ['<shape>' ...] > part.json
    (shape '-' = no limits, every count at floor..ceil: an entry for bowling-lane-table.mjs, key "n,W")
    (needs ortools: python3 -m venv v && v/bin/pip install ortools; TIME=<s> caps each shape, default 600)

eval/bowling-avoid-shapes.py asks CaDiCaL for a pair per match, week by week. But nothing in that model
looks at the order of the weeks: the bans are per match and the targets (laneTargets() lo..hi) are season
totals per team and pair. And the circle method repeats: roundRobin(n)'s first W rounds hold only n-1
distinct rounds, round r played c_r times. Any two weeks playing the same round can swap their lane
plans, so the week model carries (c_0! c_1! ...) copies of every answer and of every dead end; at
6 teams x 32 weeks that is 7!^2 6!^3 ~ 9.4e15, and CaDiCaL timed out at 300 s (eval/bowling-avoid-slots.txt).

This model keeps, for each distinct round r, only y[r][m][p] = how many of its c_r weeks put match m on
lane pair p. Rows and columns of y[r] sum to c_r (each week is a one-to-one dealing of matches to pairs),
so by Birkhoff-von Neumann / Konig's edge-colouring theorem y[r] splits into exactly c_r permutations:
every integer answer here is a real season, and every real season gives one. The split is done by
repeated perfect matchings on the support (a c-regular bipartite multigraph always has one). Team totals
are linear in y, so the bans and lo..hi go in as-is. Solved with OR-tools CP-SAT; the answer is laid out
week by week and re-checked against the bans and targets before it is printed, in the base-36 code of
bowling-avoid-shapes.mjs ({"n,W|shape": code}), so eval/bowling-avoid-shapes-merge.mjs takes it.
"""
import json, os, subprocess, sys, time
from pathlib import Path
from ortools.sat.python import cp_model

here = Path(__file__).resolve().parent
DIG = "0123456789abcdefghijklmnopqrstuvwxyz"
LIMIT = float(os.environ.get("TIME", "600"))


def perfect_matching(M):
    """A perfect matching on the support of square nonnegative matrix M (Kuhn's augmenting paths)."""
    k = len(M)
    match_col = [-1] * k

    def augment(r, seen):
        for c in range(k):
            if M[r][c] > 0 and not seen[c]:
                seen[c] = True
                if match_col[c] < 0 or augment(match_col[c], seen):
                    match_col[c] = r
                    return True
        return False

    for r in range(k):
        if not augment(r, [False] * k):
            raise RuntimeError("no perfect matching: rows/columns not balanced")
    perm = [0] * k
    for c, r in enumerate(match_col):
        perm[r] = c
    return perm  # perm[m] = pair of match m


def decompose(M, c):
    """Split an integer matrix with all row and column sums c into c permutations."""
    M = [row[:] for row in M]
    out = []
    for _ in range(c):
        perm = perfect_matching(M)
        for m, p in enumerate(perm):
            M[m][p] -= 1
        out.append(perm)
    assert all(v == 0 for row in M for v in row)
    return out


def solve(n, W, shape):
    spec = [] if shape == "-" else [[int(t), [int(p) for p in ps.split(",")]] for t, ps in (part.split(":") for part in shape.split(";"))]
    d = json.loads(subprocess.check_output(["node", str(here / "bowling-avoid-case.mjs"), str(n), str(W), json.dumps(spec)]))
    rounds, avoid, lo, hi = d["rounds"], d["avoid"], d["lo"], d["hi"]
    P = n // 2
    kinds, week_kind = [], []  # distinct rounds (match lists as played), and each week's kind
    for wk in rounds:
        key = json.dumps(wk)
        if key not in kinds:
            kinds.append(key)
        week_kind.append(kinds.index(key))
    kinds = [json.loads(k) for k in kinds]
    count = [week_kind.count(r) for r in range(len(kinds))]

    mdl = cp_model.CpModel()
    y = {}
    for r, wk in enumerate(kinds):
        for m, (a, b) in enumerate(wk):
            banned = set(avoid[a]) | set(avoid[b])
            for p in range(P):
                y[r, m, p] = mdl.NewIntVar(0, 0 if p in banned else count[r], f"y{r}_{m}_{p}")
        for m in range(P):
            mdl.Add(sum(y[r, m, p] for p in range(P)) == count[r])
        for p in range(P):
            mdl.Add(sum(y[r, m, p] for m in range(P)) == count[r])
    if not spec:  # no limits: pairs are interchangeable, so some week of round 0 may be named identity
        for m in range(P):
            mdl.Add(y[0, m, m] >= 1)
    for t in range(n):
        for p in range(P):
            tot = sum(y[r, m, p] for r, wk in enumerate(kinds) for m, (a, b) in enumerate(wk) if t in (a, b))
            mdl.Add(tot >= lo[t][p])
            mdl.Add(tot <= hi[t][p])
    hint = os.environ.get("HINT")  # a code for this season (eval/bowling-lane-tabu.c's "code"), 2026-11-23
    if hint and not spec:
        code = json.loads(open(hint).read())["code"]
        rename = {int(code[m], 36): m for m in range(P)}  # week 1 becomes identity, as the model fixes it
        code = "".join(DIG[rename[int(ch, 36)]] for ch in code)
        h = {}
        for w, r in enumerate(week_kind):
            for m in range(P):
                h[r, m, int(code[w * P + m], 36)] = h.get((r, m, int(code[w * P + m], 36)), 0) + 1
        for key, var in y.items():
            mdl.AddHint(var, h.get(key, 0))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = LIMIT
    solver.parameters.num_workers = int(os.environ.get("WORKERS", "4"))
    t0 = time.time()
    st = solver.Solve(mdl)
    dt = time.time() - t0
    verdict = {cp_model.OPTIMAL: "SAT", cp_model.FEASIBLE: "SAT", cp_model.INFEASIBLE: "UNSAT"}.get(st, "TIMEOUT")
    if verdict != "SAT":
        return verdict, dt, None
    plans = []  # per kind, a queue of week plans
    for r, wk in enumerate(kinds):
        M = [[solver.Value(y[r, m, p]) for p in range(P)] for m in range(P)]
        plans.append(decompose(M, count[r]))
    code, tally = [], [[0] * P for _ in range(n)]
    for w, r in enumerate(week_kind):
        perm = plans[r].pop()
        for m, (a, b) in enumerate(rounds[w]):
            p = perm[m]
            assert p not in avoid[a] and p not in avoid[b], "ban broken"
            tally[a][p] += 1
            tally[b][p] += 1
            code.append(DIG[p])
    for t in range(n):
        for p in range(P):
            assert lo[t][p] <= tally[t][p] <= hi[t][p], f"team {t} pair {p}: {tally[t][p]} outside {lo[t][p]}..{hi[t][p]}"
    return "SAT", dt, "".join(code)


if __name__ == "__main__":
    n, W = int(sys.argv[1]), int(sys.argv[2])
    out = {}
    for shape in sys.argv[3:]:
        verdict, dt, code = solve(n, W, shape)
        if code:
            out[f"{n},{W}" if shape == "-" else f"{n},{W}|{shape}"] = code
        print(f"{n} teams x {W} weeks, shape {shape}: {verdict} in {dt:.1f} s (count model)", file=sys.stderr, flush=True)
    print(json.dumps(out))
