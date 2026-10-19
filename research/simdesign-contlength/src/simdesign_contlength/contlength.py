"""SIMP with a penalty ramp of chosen length, reusing the FE, filter and start tools of simdesign-starts."""
import os, sys
import numpy as np
_R = os.path.join(os.path.dirname(__file__), "..", "..", "..")
sys.path.insert(0, os.path.join(_R, "simdesign-starts", "src"))
sys.path.insert(0, os.path.join(_R, "simdesign-topopt", "src"))
from simdesign_topopt.simp import fe_compliance, _filter_matrix, mbb_problem


def penal_schedule(iters, ramp, penal=3.0, step=0.5):
    """Penalty per iteration: 1 -> `penal` in steps of `step`, spread evenly over the first `ramp` iterations, then held.

    ramp = 0 is plain fixed-penalty SIMP (p = penal throughout).
    """
    if ramp <= 0:
        return np.full(iters, penal)
    levels = np.arange(1.0, penal + 1e-9, step)
    return np.array([levels[min(len(levels) - 1, int(it / (ramp / len(levels))))] if it < ramp else penal
                     for it in range(iters)])


def run_ramp(x0, nelx, nely, ramp, volfrac=0.5, penal=3.0, rmin=1.5, iters=150, move=0.2):
    """Sensitivity-filtered OC for `iters` iterations from x0 with a penalty ramp of `ramp` iterations."""
    f, fixed = mbb_problem(nelx, nely)
    H = _filter_matrix(nelx, nely, rmin)
    rowsum = np.asarray(H.sum(axis=1)).ravel()
    x = x0.copy()
    for p in penal_schedule(iters, ramp, penal):
        c, _, dc = fe_compliance(x, nelx, nely, f, fixed, p)
        xv = x.reshape(-1)
        dc = ((H @ (xv * dc.reshape(-1))) / (np.maximum(xv, 1e-3) * rowsum)).reshape(nely, nelx)
        l1, l2 = 0.0, 1e9
        while (l2 - l1) / (l1 + l2) > 1e-4:
            lmid = 0.5 * (l1 + l2)
            xnew = np.clip(x * np.sqrt(np.maximum(-dc, 0) / lmid), np.maximum(0.001, x - move), np.minimum(1.0, x + move))
            if xnew.mean() - volfrac > 0: l1 = lmid
            else: l2 = lmid
        x = xnew
    c, _, _ = fe_compliance(x, nelx, nely, f, fixed, penal)
    return {"x": x, "compliance": c}
