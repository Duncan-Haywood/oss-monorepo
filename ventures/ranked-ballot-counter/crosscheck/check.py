"""Recount crosscheck/gen.mjs output with a separately written IRV and Schulze; ties are skipped."""
import json, sys
cases = json.load(open(sys.argv[1]))
def irv(cands, ballots):
    live = set(cands); hist = []
    while True:
        t = {c: 0 for c in live}
        for b in ballots:
            for c in b:
                if c in live: t[c] += 1; break
        act = sum(t.values())
        for c, v in t.items():
            if 2 * v > act: return c, False
        if len(live) == 1: return next(iter(live)), False
        low = min(t.values()); tied = [c for c in live if t[c] == low]
        if len(tied) > 1: return None, True  # skip tie cases
        hist.append(t); live.remove(tied[0])
def schulze(cands, ballots):
    n = len(cands); ix = {c: i for i, c in enumerate(cands)}
    d = [[0]*n for _ in range(n)]
    for b in ballots:
        pos = {c: k for k, c in enumerate(b)}
        for a in cands:
            for c in cands:
                if a != c and pos.get(a, 1e9) < pos.get(c, 1e9): d[ix[a]][ix[c]] += 1
    p = [[d[i][j] if d[i][j] > d[j][i] else 0 for j in range(n)] for i in range(n)]
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if len({i, j, k}) == 3: p[i][j] = max(p[i][j], min(p[i][k], p[k][j]))
    wins = [sum(1 for j in range(n) if p[i][j] > p[j][i]) for i in range(n)]
    groups = {}
    for i in range(n): groups.setdefault(wins[i], []).append(cands[i])
    return [sorted(groups[w]) for w in sorted(groups, reverse=True)]
irv_same = irv_n = sch_same = 0
for c in cases:
    bs = [b.split(" > ") for b in c["ballots"]]
    w, tie = irv(c["cands"], bs)
    if not tie and not c["anyTie"]:
        irv_n += 1; irv_same += (w == c["irv"])
    sch_same += (schulze(c["cands"], bs) == [sorted(g) for g in c["schulze"]])
print(f"IRV: {irv_same} of {irv_n} untied elections agree; Schulze full ranking: {sch_same} of {len(cases)} agree")
