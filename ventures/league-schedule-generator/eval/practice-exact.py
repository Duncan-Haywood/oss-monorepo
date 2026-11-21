# The least possible score of each practice case (CP-SAT), against the search's score.
# python3 eval/practice-exact.py cases.json [seconds]      # pip install ortools
# Same rules as practice.mjs: capacity, one practice a team a day, coach overlap, and the score
# sum over teams of 10000 * unplaced + miss^2 (miss: option misses + 1 per back-to-back day pair).
import json, sys
from ortools.sat.python import cp_model

UNPLACED = 10000
cases = json.load(open(sys.argv[1]))
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 20
adj = lambda a, b: (a - b) % 7 in (1, 6)
rows = []
for c in cases:
    m = cp_model.CpModel()
    teams, opts, blocks = c["teams"], c["options"], c["blocks"]
    x = [[m.NewBoolVar("") for _ in opts[t]] for t in range(len(teams))]
    obj = []
    for t, team in enumerate(teams):
        has = {}
        for d in range(7):
            vs = [x[t][i] for i, o in enumerate(opts[t]) if o["day"] == d]
            if vs:
                h = m.NewBoolVar("")
                m.Add(sum(vs) == h)
                has[d] = h
        placed = sum(x[t]) if x[t] else 0
        m.Add(placed <= team["times"])
        pairs = []
        ds = sorted(has)
        for i in range(len(ds)):
            for j in range(i + 1, len(ds)):
                if adj(ds[i], ds[j]):
                    y = m.NewBoolVar("")
                    m.Add(y >= has[ds[i]] + has[ds[j]] - 1)
                    pairs.append(y)
        maxmiss = sum(o["miss"] for o in opts[t]) + len(pairs) + 1
        miss = m.NewIntVar(0, maxmiss, "")
        m.Add(miss == sum(o["miss"] * x[t][i] for i, o in enumerate(opts[t])) + sum(pairs))
        sq = m.NewIntVar(0, maxmiss * maxmiss, "")
        m.AddMultiplicationEquality(sq, [miss, miss])
        obj.append(UNPLACED * (team["times"] - placed) + sq)
    for b, blk in enumerate(blocks):
        terms = [teams[t]["units"] * x[t][i] for t in range(len(teams)) for i, o in enumerate(opts[t]) if o["b"] == b]
        if terms:
            m.Add(sum(terms) <= blk["cap"])
    for t in range(len(teams)):
        for u in range(t + 1, len(teams)):
            if teams[t]["coach"] and teams[t]["coach"].lower() == teams[u]["coach"].lower():
                for i, o in enumerate(opts[t]):
                    for k, p in enumerate(opts[u]):
                        if o["day"] == p["day"] and o["start"] < p["end"] and p["start"] < o["end"]:
                            m.AddBoolOr([x[t][i].Not(), x[u][k].Not()])
    m.Minimize(sum(obj))
    sv = cp_model.CpSolver()
    sv.parameters.max_time_in_seconds = secs
    sv.parameters.num_workers = 4
    st = sv.Solve(m)
    best = round(sv.ObjectiveValue()) if st in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None
    lb = round(sv.BestObjectiveBound())
    proved = st == cp_model.OPTIMAL
    rows.append((c["id"], len(teams), sum(t["times"] for t in teams), c["search"], best, lb, proved, c["bound"], c["ms"]))
    print(f"case {c['id']:3d} teams {len(teams):2d} practices {rows[-1][2]:3d}  search {c['search']:6d}  cp-sat {best} (bound {lb}{', proved' if proved else ''})  solo bound {c['bound']}  {c['ms']} ms", flush=True)
proved = [r for r in rows if r[6]]
eq = [r for r in proved if r[3] == r[4]]
worse = [r for r in rows if r[4] is not None and r[3] > r[4]]
better = [r for r in rows if r[4] is not None and r[3] < r[4]]
print(f"\n{len(rows)} cases, {len(proved)} proved optimal by CP-SAT in {secs:g} s")
print(f"search equals the proved optimum: {len(eq)} of {len(proved)}")
print(f"search worse than CP-SAT's best: {len(worse)}; better than CP-SAT's best (CP-SAT unproved): {len(better)}")
for r in worse:
    print(f"  case {r[0]}: search {r[3]} vs {r[4]} (gap {r[3]-r[4]})")
print(f"search met the solo bound (proved on the page): {sum(1 for r in rows if r[3]==r[7])} of {len(rows)}")
print(f"search time: median {sorted(r[8] for r in rows)[len(rows)//2]} ms, max {max(r[8] for r in rows)} ms")
