"""Multi-load SIMP topology optimisation on the cantilever of simdesign-topopt.

The design is optimised for a weighted sum of compliances over a set of tip-load directions;
a single-direction set is the usual nominal design. Everything else (Q4 plane-stress element,
SIMP p = 3, sensitivity filter, OC update with move limit 0.2) is simdesign-topopt's, imported
rather than copied. Units are dimensionless (E0 = 1, unit load).
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-topopt", "src"))
from simdesign_topopt import fe_compliance, cantilever_problem
from simdesign_topopt.simp import _filter_matrix


def angled_cantilever(theta_deg):
    """Cantilever problem factory: unit tip load at mid-height, `theta_deg` from straight down
    (0 = vertical, +90 = pointing along +x, away from the wall)."""
    t = np.radians(theta_deg)

    def problem(nelx, nely):
        f, fixed = cantilever_problem(nelx, nely)
        node = int(np.argmax(np.abs(f))) // 2
        f = np.zeros_like(f)
        f[2 * node] = np.sin(t); f[2 * node + 1] = -np.cos(t)
        return f, fixed
    return problem


def compliance_at(x, theta_deg, penal=3.0, nelx=None, nely=None):
    nely_, nelx_ = x.shape
    f, fixed = angled_cantilever(theta_deg)(nelx_, nely_)
    return fe_compliance(x, nelx_, nely_, f, fixed, penal)[0]


def multiload_simp(nelx, nely, volfrac, penal, rmin, angles, weights=None, max_iter=150,
                   tol=0.01, move=0.2):
    """Minimise sum_k w_k c_k(x) s.t. mean(x) = volfrac. Returns dict(x, compliance, iterations)."""
    angles = list(angles)
    w = np.full(len(angles), 1.0 / len(angles)) if weights is None else np.asarray(weights, float)
    probs = [angled_cantilever(a)(nelx, nely) for a in angles]
    H = _filter_matrix(nelx, nely, rmin); Hs = np.asarray(H.sum(axis=1)).ravel()
    x = np.full((nely, nelx), volfrac)
    for it in range(1, max_iter + 1):
        dc = np.zeros((nely, nelx))
        for wk, (f, fixed) in zip(w, probs):
            dc += wk * fe_compliance(x, nelx, nely, f, fixed, penal)[2]
        xv = x.reshape(-1)
        dc = ((H @ (xv * dc.reshape(-1))) / (np.maximum(xv, 1e-3) * Hs)).reshape(nely, nelx)
        l1, l2 = 0.0, 1e9
        while (l2 - l1) / (l1 + l2) > 1e-4:
            lmid = 0.5 * (l1 + l2)
            xn = np.clip(x * np.sqrt(np.maximum(-dc, 0) / lmid), np.maximum(0.001, x - move),
                         np.minimum(1.0, x + move))
            if xn.mean() > volfrac: l1 = lmid
            else: l2 = lmid
        change = float(np.abs(xn - x).max()); x = xn
        if change < tol:
            break
    c = sum(wk * fe_compliance(x, nelx, nely, f, fixed, penal)[0] for wk, (f, fixed) in zip(w, probs))
    return {"x": x, "compliance": float(c), "iterations": it}


def angle_sweep(x, angles, penal=3.0):
    """Compliance of density field x under each load direction."""
    return np.array([compliance_at(x, a, penal) for a in angles])
