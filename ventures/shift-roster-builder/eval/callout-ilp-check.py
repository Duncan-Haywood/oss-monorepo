# Least open hours on the call-out study's weeks (dumped by eval/callout-ilp-export.mjs), by an independent ILP
# (HiGHS via scipy). Hard rules only, written from the engine's validList: availability (with the day off), one
# person per shift copy, the rest gap between any two of a person's shifts (which also rules out overlaps), the
# weekly hour cap, a daily hour cap when set, and at most maxConsec days worked in a row. No pay terms.
#   node eval/callout-ilp-export.mjs > /tmp/w.json && python3 eval/callout-ilp-check.py /tmp/w.json   (pip install scipy)
import json, sys, time
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix

def solve(w):
    sl, el, rest = w['slots'], w['elig'], w['rest']
    P, S = len(el), len(sl)
    days = sorted({s[2] for s in sl})
    D = len(days)
    # variables: x[p,s], open[s], y[p,d] (works day d)
    nx = P * S; no = S; ny = P * D; nv = nx + no + ny
    X = lambda p, s: p * S + s
    O = lambda s: nx + s
    Y = lambda p, k: nx + no + p * D + k
    cost = np.zeros(nv)
    for s in range(S): cost[O(s)] = (sl[s][1] - sl[s][0]) / 60
    rows = []
    def row(coefs, lo, hi): rows.append((coefs, lo, hi))
    for s in range(S): row([(X(p, s), 1) for p in range(P)] + [(O(s), 1)], 1, 1)
    for p in range(P):
        row([(X(p, s), (sl[s][1] - sl[s][0]) / 60) for s in range(S)], 0, w['maxH'][p])
        for a in range(S):
            for b in range(a + 1, S):
                if not (el[p][a] and el[p][b]): continue
                x, y = (a, b) if sl[a][0] <= sl[b][0] else (b, a)
                if sl[y][0] < sl[x][1] + rest: row([(X(p, a), 1), (X(p, b), 1)], 0, 1)
        for k, d in enumerate(days):
            on = [s for s in range(S) if sl[s][2] == d]
            for s in on: row([(X(p, s), 1), (Y(p, k), -1)], -1, 0)  # x <= y
            if w['maxDaily'][p] > 0: row([(X(p, s), (sl[s][1] - sl[s][0]) / 60) for s in on], 0, w['maxDaily'][p])
        m = w['maxConsec']
        for k in range(D - m):
            if all(days[k + j] == days[k] + j for j in range(m + 1)):
                row([(Y(p, k + j), 1) for j in range(m + 1)], 0, m)
    A = lil_matrix((len(rows), nv))
    for r, (coefs, _, _) in enumerate(rows):
        for v, c in coefs: A[r, v] = c
    ub = np.ones(nv)
    for p in range(P):
        for s in range(S):
            if not el[p][s]: ub[X(p, s)] = 0
    res = milp(cost, constraints=LinearConstraint(A.tocsr(), [r[1] for r in rows], [r[2] for r in rows]),
               integrality=np.ones(nv), bounds=Bounds(0, ub), options={'time_limit': 300})
    return res

if __name__ == '__main__':
    W = json.load(open(sys.argv[1]))
    worse = 0
    for w in W:
        t = time.time(); res = solve(w)
        best = round(res.fun, 6) if res.status == 0 else None
        eng = w.get('engineOpen')
        flag = '' if eng is None or best is None else ('  ENGINE ABOVE ILP' if eng > best + 1e-6 else ('  ENGINE BELOW ILP?' if eng < best - 1e-6 else ''))
        if flag.strip() == 'ENGINE ABOVE ILP': worse += 1
        print(f"{w['set']:6} {w['case']:9} ilp open {best} h  engine {eng} h floor {w.get('engineFloor')} {w.get('status', '')}{flag}  {time.time() - t:.1f}s")
    print(f"{len(W)} weeks; engine above the ILP optimum on {worse}")
