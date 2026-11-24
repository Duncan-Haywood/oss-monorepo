"""Post-hoc comparator for milestone 75 (not registered): the best single per-press eps whose exact chain wall
failure is <= 1% (CAL*: milestone 73's CAL calibrated on the chain instead of 4,000 Monte Carlo paths), per row.
python experiments/m75_riskopt/scan.py > experiments/m75_riskopt/scan.txt  (about 5 minutes on 4 processes)"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as M  # noqa: E402

R74 = json.load(open(os.path.join(M.HERE, "results.json")))


def row(arg):
    (n, plan, d1), a1 = arg
    g, t, a = M.M72.wall(a1)
    _, sig = M.D.matched("RW", d1)
    LS = M.Q.segment_logsurv(g, t, a, M.PERIOD, sig, M.ALPHA, dr_frac=1 / 3)
    best = None
    for eps in np.geomspace(M.ALPHA / len(a), 0.5, 400):       # fewest re-zeros over a fine uniform grid
        st = M.R.greedy(g, t, M.D.deadlines(a, 0.0, sig, eps))
        if st is None:
            continue
        f = M.chain_fail(LS, len(a), st)
        if f <= M.ALPHA and (best is None or len(st) < best[0]):
            best = (len(st), f, float(eps))
    return best


if __name__ == "__main__":
    P = M.M73.plans()
    keys = [(n, plan, d1) for n in P for plan in M.PLANS for d1 in M.D1S]
    with Pool(4) as pool:
        res = pool.map(row, [(k, P[k[0]][k[1]]) for k in keys], chunksize=1)
    print("# robot | plan | D1 N | CAL* n (chain fail; eps) | OPT n | m73 CAL n (chain fail)")
    for k, b in zip(keys, res):
        r = R74["rows"]["|".join(map(str, k))]
        print(f"{k[0]} | {k[1]} | {k[2]} | {b[0]} ({b[1]:.4f}; {b[2]:.2e}) | {r['OPT'][0]} | {r['CAL'][0]} ({r['CAL'][1]:.4f})")
