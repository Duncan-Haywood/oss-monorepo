"""Fixed-penalty SIMP run from an arbitrary start, snapshotting the design at chosen iteration counts.

Same FE, filter and OC update as simdesign-starts / simdesign-topopt (imported unchanged); the only addition
is the snapshots and the per-iteration density change, so one long run answers "what if it had stopped at N".
"""
import os, sys
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "simdesign-topopt", "src"))
from simdesign_topopt.simp import fe_compliance, _filter_matrix, mbb_problem


def run_checkpoints(x0, nelx, nely, checkpoints, volfrac=0.5, penal=3.0, rmin=1.5, move=0.2):
    """Run max(checkpoints) OC iterations at fixed penal; return {n: {"x", "compliance", "change"}} for each n.

    compliance is at `penal` on the grey field; change is max |x_new - x| of the last update before the snapshot.
    """
    f, fixed = mbb_problem(nelx, nely)
    H = _filter_matrix(nelx, nely, rmin)
    rowsum = np.asarray(H.sum(axis=1)).ravel()
    x = x0.copy()
    want = set(checkpoints)
    out = {}
    change = float("nan")
    for it in range(1, max(want) + 1):
        c, _, dc = fe_compliance(x, nelx, nely, f, fixed, penal)
        xv = x.reshape(-1)
        dc = ((H @ (xv * dc.reshape(-1))) / (np.maximum(xv, 1e-3) * rowsum)).reshape(nely, nelx)
        l1, l2 = 0.0, 1e9
        while (l2 - l1) / (l1 + l2) > 1e-4:
            lmid = 0.5 * (l1 + l2)
            xnew = np.clip(x * np.sqrt(np.maximum(-dc, 0) / lmid), np.maximum(0.001, x - move), np.minimum(1.0, x + move))
            if xnew.mean() - volfrac > 0: l1 = lmid
            else: l2 = lmid
        change = float(np.abs(xnew - x).max())
        x = xnew
        if it in want:
            cf, _, _ = fe_compliance(x, nelx, nely, f, fixed, penal)
            out[it] = {"x": x.copy(), "compliance": cf, "change": change}
    return out


def pairwise_disagreement(designs, thr=0.5):
    """Median over all pairs of the share of elements whose 0/1 state (x > thr) differs; designs is a list of arrays."""
    b = [(d > thr).ravel() for d in designs]
    v = [float(np.mean(b[i] != b[j])) for i in range(len(b)) for j in range(i + 1, len(b))]
    return float(np.median(v))
