# LP relaxations of the least-open-hours problem on weeks dumped by eval/ilp-export.mjs: how far below the integer optimum
# each stays. Hard rules only (availability, one person per shift copy, no overlap, rest gap, weekly cap), as in ilp-check.py.
#   node eval/ilp-export.mjs 12 30 2 > w.json && python3 eval/relaxation-check.py w.json 1   (pip install scipy)
# Prints the pairwise-conflict LP, the maximal-clique LP, the clique LP with weekly-hours cover cuts, and the Dantzig-Wolfe
# LP over every feasible shift set of each person (the strongest of the four; exponential in shifts per person).
import json, sys, numpy as np
from scipy.optimize import linprog
from scipy.sparse import lil_matrix

W = json.load(open(sys.argv[1]))[int(sys.argv[2]) if len(sys.argv) > 2 else 0]
sl, el, rest, mx = W['slots'], W['elig'], W['rest'], W['maxH']
P, S = len(el), len(sl)
h = [(b - a) / 60 for a, b in sl]
idx = lambda p, s: p * S + s
nv = P * S + S

def conf(a, b):
    x, y = (a, b) if sl[a][0] <= sl[b][0] else (b, a)
    return sl[y][0] < sl[x][1] + rest or sl[x][0] == sl[y][0]

def cliques(its):
    adj = {a: {b for b in its if b != a and conf(a, b)} for a in its}
    out = []
    def bk(R, Pp, X):
        if not Pp and not X: out.append(R); return
        for v in list(Pp):
            bk(R | {v}, Pp & adj[v], X & adj[v]); Pp = Pp - {v}; X = X | {v}
    bk(set(), set(its), set())
    return [q for q in out if len(q) > 1]

cost = np.zeros(nv); cost[P * S:] = h
Aeq = lil_matrix((S, nv))
for s in range(S):
    for p in range(P): Aeq[s, idx(p, s)] = 1
    Aeq[s, P * S + s] = 1
bounds = [(0, 0 if (i < P * S and not el[i // S][i % S]) else 1) for i in range(nv)]

def lp(rows, rhs):
    A = lil_matrix((len(rows), nv))
    for i, r in enumerate(rows):
        for k, v in r.items(): A[i, k] = v
    return linprog(cost, A_ub=A.tocsr(), b_ub=rhs, A_eq=Aeq.tocsr(), b_eq=np.ones(S), bounds=bounds, method='highs')

week = [({idx(p, s): h[s] for s in range(S)}, mx[p]) for p in range(P)]
pair = [({idx(p, a): 1, idx(p, b): 1}, 1) for p in range(P) for a in range(S) for b in range(a + 1, S) if el[p][a] and el[p][b] and conf(a, b)]
clq = [({idx(p, a): 1 for a in q}, 1) for p in range(P) for q in cliques([s for s in range(S) if el[p][s]])]
print('pairwise conflicts      %.2f' % lp(*zip(*(week + pair))).fun)
r = lp(*zip(*(week + clq)))
print('maximal cliques         %.2f' % r.fun)
cuts = []
for _ in range(30):
    r = lp(*zip(*(week + clq + cuts))); x = r.x; added = 0
    for p in range(P):
        its = sorted([s for s in range(S) if el[p][s] and x[idx(p, s)] > 1e-6], key=lambda s: (1 - x[idx(p, s)]) / h[s])
        tot, C = 0, []
        for s in its:
            C.append(s); tot += h[s]
            if tot > mx[p] + 1e-9: break
        if tot > mx[p] + 1e-9 and sum(1 - x[idx(p, s)] for s in C) < 1 - 1e-6:
            m = max(h[s] for s in C)
            cuts.append(({idx(p, s): 1 for s in C + [t for t in range(S) if el[p][t] and t not in C and h[t] >= m]}, len(C) - 1)); added += 1
    if not added: break
print('cliques + cover cuts    %.2f (%d cuts)' % (r.fun, len(cuts)))
pats = []
for p in range(P):
    its = sorted([s for s in range(S) if el[p][s]], key=lambda s: sl[s][0])
    def go(i, cur, w):
        if i == len(its): pats.append((p, tuple(cur))); return
        go(i + 1, cur, w); s = its[i]
        if w + h[s] <= mx[p] + 1e-9 and all(not conf(s, t) for t in cur): cur.append(s); go(i + 1, cur, w + h[s]); cur.pop()
    go(0, [], 0)
n = len(pats)
c2 = np.zeros(n + S); c2[n:] = h
A = lil_matrix((S, n + S)); B = lil_matrix((P, n + S))
for j, (p, st) in enumerate(pats):
    B[p, j] = 1
    for s in st: A[s, j] = 1
for s in range(S): A[s, n + s] = 1
r = linprog(c2, A_eq=A.tocsr(), b_eq=np.ones(S), A_ub=B.tocsr(), b_ub=np.ones(P), bounds=(0, 1), method='highs')
print('Dantzig-Wolfe (%d sets) %.2f' % (n, r.fun))
