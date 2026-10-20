"""SIMP from an arbitrary starting density field, reusing the FE and filter of simdesign-topopt."""
import os, sys
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-topopt", "src"))
from simdesign_topopt.simp import fe_compliance, _filter_matrix, mbb_problem


def random_start(nelx, nely, volfrac, spread, seed):
    """Uniform noise of half-width `spread` about volfrac, shifted to the exact volume and clipped to [0.01, 1]."""
    rng = np.random.default_rng(seed)
    x = volfrac + spread * (2 * rng.random((nely, nelx)) - 1)
    for _ in range(50):  # re-centre after clipping
        x = np.clip(x + (volfrac - x.mean()), 0.01, 1.0)
    return x


def run_from(x0, nelx, nely, volfrac=0.5, penal=3.0, rmin=1.5, iters=100, continuation=False, move=0.2):
    """Sensitivity-filtered OC (as simdesign-topopt) for a fixed number of iterations from x0.

    continuation: penal rises 1 -> `penal` in steps of 0.5 over the first half of the run, then holds.
    Returns the final field, its compliance at the full penalty, and the history.
    """
    f, fixed = mbb_problem(nelx, nely)
    H = _filter_matrix(nelx, nely, rmin)
    rowsum = np.asarray(H.sum(axis=1)).ravel()
    x = x0.copy()
    hist = []
    steps = np.arange(1.0, penal + 1e-9, 0.5)
    for it in range(iters):
        if continuation:
            p = steps[min(len(steps) - 1, int(it / (iters / 2 / len(steps))))]
        else:
            p = penal
        c, _, dc = fe_compliance(x, nelx, nely, f, fixed, p)
        hist.append(c)
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
    return {"x": x, "compliance": c, "history": hist}


def holes(x, thr=0.5):
    """Number of enclosed void regions (4-connected void components not touching the border) in the solid x>thr."""
    void = x <= thr
    lab, n = ndimage.label(void)
    border = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    return len([i for i in range(1, n + 1) if i not in border])


def distance(a, b, thr=0.5):
    """Fraction of elements on which the two designs, thresholded at thr, disagree."""
    return float(np.mean((a > thr) != (b > thr)))
