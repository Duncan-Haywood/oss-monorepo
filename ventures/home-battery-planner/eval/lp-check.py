"""Exact reference for the shipped dynamic programme: each case as one linear programme, solved by HiGHS.

python3 eval/lp-check.py cases.json   (cases from eval/lp-cases.mjs; needs numpy and scipy)

Per hour t, variables: grid-side charge c, delivered discharge d, import gi, export ge, stored energy e
above the reserve. gi - ge - c + d = net; e_t = e_(t-1) + eta c - d / eta (e_(-1) = 0, as the tool
starts at the reserve); 0 <= e <= usable - reserve; c <= kW (or the spare solar, without grid charging);
d <= kW (or the house's draw, without battery export). Minimise sum(import price x gi - export credit x ge).
"""
import json, sys, time
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

def solve(c):
    net = np.array(c["net"]); pi = np.array(c["imp"]); pe = np.array(c["exp"]); b = c["battery"]
    n = len(net); eta = b["roundTrip"] ** 0.5; span = b["kwh"] * (1 - b["reserve"]); kw = b["kw"]
    sur, load = np.maximum(0, -net), np.maximum(0, net)
    cmax = np.full(n, kw) if b["gridCharge"] else np.minimum(kw, sur)
    dmax = np.full(n, kw) if b["gridExport"] else np.minimum(kw, load)
    # variable blocks: c, d, gi, ge, e
    C, D, GI, GE, E = (k * n for k in range(5))
    rows, cols, vals = [], [], []
    t = np.arange(n)
    for blk, v in ((GI, 1), (GE, -1), (C, -1), (D, 1)):
        rows += list(t); cols += list(blk + t); vals += [v] * n
    for blk, v in ((E, 1), (C, -eta), (D, 1 / eta)):
        rows += list(n + t); cols += list(blk + t); vals += [v] * n
    rows += list(n + t[1:]); cols += list(E + t[:-1]); vals += [-1] * (n - 1)
    A = coo_matrix((vals, (rows, cols)), shape=(2 * n, 5 * n)).tocsr()
    rhs = np.concatenate([net, np.zeros(n)])
    big = np.abs(net) + 2 * kw + 1
    bounds = [(0, x) for x in cmax] + [(0, x) for x in dmax] + [(0, x) for x in big] + [(0, x) for x in big] + [(0, span)] * n
    cost = np.concatenate([np.zeros(2 * n), pi, -pe, np.zeros(n)])
    t0 = time.time()
    r = linprog(cost, A_eq=A, b_eq=rhs, bounds=bounds, method="highs")
    assert r.status == 0, r.message
    return r.fun, time.time() - t0

cases = json.load(open(sys.argv[1]))
print(f"{'meter':28} {'plan':10} {'battery':34} {'no battery':>10} {'LP saving':>10} {'DP saving':>10} {'gap $':>7} {'gap %':>6} {'DP ms':>6}")
worst = 0
for c in cases:
    lp, secs = solve(c)
    b = c["battery"]
    tag = f"{b['kwh']} kWh {b['kw']} kW{' grid-in' if b['gridCharge'] else ''}{' grid-out' if b['gridExport'] else ''}"
    s_lp, s_dp = c["none"] - lp, c["none"] - c["dp"]
    gap = s_lp - s_dp
    pct = 100 * gap / s_lp if s_lp > 1e-9 else 0
    worst = max(worst, pct)
    print(f"{c['meter'][:28]:28} {c['plan'][:10]:10} {tag:34} {c['none']:10.2f} {s_lp:10.2f} {s_dp:10.2f} {gap:7.2f} {pct:6.3f} {c['ms']:6d}")
print(f"\n{len(cases)} cases; worst gap {worst:.3f}% of the optimal saving")
