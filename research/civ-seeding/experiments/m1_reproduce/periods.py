"""Post-hoc (not pre-registered): does the period length move the estimate? One seed, identity W.

python3 experiments/m1_reproduce/periods.py   (about 12 minutes on 4 cores; writes periods.txt)
"""
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj  # noqa: E402

_V = _B = None


def _init(pm):
    global _V, _B
    _V = bcdj.load()
    for v in _V:
        v.period_months = pm
    _B = bcdj.leader_logit(_V)[0]


def _row(i):
    return i, np.stack([bcdj.divergence(_V, _B, bcdj.QN_GRID[i], q, 75, 0) for q in bcdj.QP_GRID])


out = []
for pm, name in ((3, "quarters"), (1, "months")):
    D = np.zeros((len(bcdj.QN_GRID), len(bcdj.QP_GRID), 43, 5))
    with ProcessPoolExecutor(4, initializer=_init, initargs=(pm,)) as ex:
        for i, rows in ex.map(_row, range(len(bcdj.QN_GRID))):
            D[i] = rows
    i, j, Q = bcdj.gmm_estimate(D)
    a, b = list(np.round(bcdj.QN_GRID, 3)).index(0.1), list(np.round(bcdj.QP_GRID, 3)).index(0.5)
    out.append(f"{name} (period {pm} months): qN = {bcdj.QN_GRID[i]:.3f}, qP = {bcdj.QP_GRID[j]:.3f}, "
               f"Q = {Q[i, j]:.3e}; Q at (0.10, 0.50) / Q_min = {Q[a, b] / Q[i, j]:.2f}")
    print(out[-1], flush=True)
open(os.path.join(HERE, "periods.txt"), "w").write("\n".join(out) + "\n")
