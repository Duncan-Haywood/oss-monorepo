"""Post-hoc (not pre-registered): two-step optimal weights and the q_P profile, from dgrid.npz.

python3 experiments/m1_reproduce/twostep.py   (needs run.py's dgrid.npz; seconds; writes twostep.txt)
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj  # noqa: E402

qn, qp = np.round(bcdj.QN_GRID, 3), np.round(bcdj.QP_GRID, 3)
out = []
for name in ("seed0", "seed1", "seed2"):
    D = np.load(os.path.join(HERE, "dgrid.npz"))[name]
    G = D.shape[2]
    i, j, Q = bcdj.gmm_estimate(D)
    res = []
    # two-step: weight matrix from the village divergences at a first-step point
    for label, (a, b) in (("our first step", (i, j)),
                          ("the code's (0.09 ~ 0.10, 0.45)", (list(qn).index(0.1), list(qp).index(0.45)))):
        Dg = D[a, b]
        W = np.linalg.inv(Dg.T @ Dg / G)
        mom = D.mean(2)
        Q2 = np.einsum("ijm,mk,ijk->ij", mom, W, mom)
        a2, b2 = np.unravel_index(np.argmin(Q2), Q2.shape)
        res.append(f"two-step W from {label}: qN = {qn[a2]:.3f}, qP = {qp[b2]:.3f}")
    out.append(f"{name}: identity W: qN = {qn[i]:.3f}, qP = {qp[j]:.3f}; " + "; ".join(res))
    if name == "seed0":
        a = list(qn).index(0.05)
        prof = " ".join(f"{qp[b]:.2f}:{Q[a, b] / Q.min():.2f}" for b in range(len(qp)) if qp[b] >= 0.1)
        out.append(f"  profile Q/Q_min over qP at qN = 0.05: {prof}")
        a = list(qn).index(0.1)
        prof = " ".join(f"{qp[b]:.2f}:{Q[a, b] / Q.min():.2f}" for b in range(len(qp)) if qp[b] >= 0.1)
        out.append(f"  profile Q/Q_min over qP at qN = 0.10: {prof}")
txt = "\n".join(out) + "\n"
open(os.path.join(HERE, "twostep.txt"), "w").write(txt)
print(txt)
