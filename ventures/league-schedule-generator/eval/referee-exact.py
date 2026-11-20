"""Least possible empty referee slots per case, by CP-SAT, against assignReferees.

    node eval/referee-exact.mjs 60 1 > /tmp/ref-cases.json
    python3 eval/referee-exact.py /tmp/ref-cases.json   (needs ortools: pip install ortools)

Rules modelled (the hard rules of tournament-referees.mjs): an official takes a slot only where
the case's static `ok` says so (hours, divisions, roles, own club, own team playing); one slot per
official per game; two games overlap for an official unless the second starts at or after the
first ends (same field) or ends plus the turnover (different field); caps a day and in all; and no
more than `run` games in a row, a row being games whose gaps are under the break. The objective is
the fewest empty slots; each case gets a 20 s cap, and the status is printed with the bound.
"""
import json
import sys
from ortools.sat.python import cp_model

cases = json.load(open(sys.argv[1]))
rows = []
for c in cases:
    m = cp_model.CpModel()
    S, O = c["slots"], range(c["officials"])
    buf, brk = c["buffer"], c["breakMinutes"]
    x = {(o, s): m.NewBoolVar(f"x{o}_{s}") for o in O for s in range(len(S)) if c["ok"][o][s]}
    for s in range(len(S)):
        m.Add(sum(x[o, s] for o in O if (o, s) in x) <= 1)
    for o in O:
        mine = [s for s in range(len(S)) if (o, s) in x]
        cap = c["caps"][o]
        for i, a in enumerate(mine):
            for b in mine[i + 1:]:
                A, B = S[a], S[b]
                gap = 0 if A["field"] == B["field"] else buf
                if A["game"] == B["game"] or (A["start"] < B["end"] + gap and B["start"] < A["end"] + gap):
                    m.Add(x[o, a] + x[o, b] <= 1)
        for d in {S[s]["day"] for s in mine}:
            if cap["day"] is not None:
                m.Add(sum(x[o, s] for s in mine if S[s]["day"] == d) <= cap["day"])
        if cap["total"] is not None:
            m.Add(sum(x[o, s] for s in mine) <= cap["total"])
        # Runs: every chain of run+1 games, each pair free of overlap and under the break apart.
        R = cap["run"]
        games = {}
        for s in mine:
            games.setdefault(S[s]["game"], []).append(s)
        g_ids = sorted(games, key=lambda g: S[games[g][0]]["start"])
        # One indicator per game: the official is on it in some role.
        on = {}
        for g in g_ids:
            on[g] = m.NewBoolVar(f"on{o}_{g}")
            m.Add(on[g] == sum(x[o, s] for s in games[g]))

        def ok_next(g, h):
            A, B = S[games[g][0]], S[games[h][0]]
            gap = 0 if A["field"] == B["field"] else buf
            return A["day"] == B["day"] and B["start"] >= A["end"] + gap and B["start"] - A["end"] < brk

        def chains(path):
            if len(path) == R + 1:
                m.Add(sum(on[g] for g in path) <= R)
                return
            last = path[-1]
            for h in g_ids:
                if S[games[h][0]]["start"] > S[games[last][0]]["start"] and ok_next(last, h):
                    chains(path + [h])

        for g in g_ids:
            chains([g])
    m.Maximize(sum(x.values()))
    sol = cp_model.CpSolver()
    sol.parameters.max_time_in_seconds = 20
    sol.parameters.num_workers = 4
    st = sol.Solve(m)
    best = len(S) - int(sol.ObjectiveValue())
    bound = len(S) - int(sol.BestObjectiveBound())
    status = sol.StatusName(st)
    if status == "FEASIBLE" and best == 0:
        status, bound = "OPTIMAL", 0  # no empty slot: nothing can be lower
    rows.append((c["case"], c["games"], c["officials"], len(S), c["one"]["empty"], c["many"]["empty"], best, bound, status, c["one"]["check"] + c["many"]["check"], c["many"]["koRisk"]))

print("case games officials slots | empty: 1 pass, 80 passes, CP-SAT best (proved least) status | rule breaks | ko club risk")
for r in rows:
    print(f"{r[0]:4d} {r[1]:5d} {r[2]:9d} {r[3]:5d} | {r[4]:6d} {r[5]:10d} {r[6]:13d} ({r[7]}) {r[8]:8s} | {r[9]:11d} | {r[10]}")
opt = [r for r in rows if r[8] == "OPTIMAL"]
print(f"\n{len(rows)} cases, {len(opt)} proved optimal by CP-SAT within 20 s")
print(f"rule breaks in the search's output (1 pass and 80): {sum(r[9] for r in rows)}")
for name, k in (("1 pass", 4), ("80 passes", 5)):
    hit = sum(1 for r in opt if r[k] == r[6])
    gap = sum(r[k] - r[6] for r in opt)
    print(f"{name}: matches the least empty slots in {hit} of {len(opt)}; {gap} empty slots above the least in all (of {sum(r[3] for r in opt)} slots)")
print(f"cases where every slot can be filled: {sum(1 for r in opt if r[6] == 0)}; of those, 80 passes fill every slot in {sum(1 for r in opt if r[6] == 0 and r[5] == 0)}")
