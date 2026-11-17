"""Milestone 3h: a bundle adjustment with chosen intrinsics held fixed, on milestone 3b's solver.

Milestones 3f and 3g predicted, to first order from the solver's covariance, where a window's focal
length would move if its distortion (k1, k2) were pinned at a prior calibration. This module runs the
re-solve itself: the same robust (soft-L1, 1 px) Levenberg-Marquardt with a Schur complement on the
points as `nfba.bundle`, with the pinned intrinsics' columns dropped from the normal equations. With no
pinned index it reproduces `nfba.bundle` step for step (tests/test_m3h.py).
"""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m3b_natural"))
import nfba  # noqa: E402
from nfba import NI  # noqa: E402

IDX = {"f": 0, "cx": 1, "cy": 2, "k1": 3, "k2": 4}


def _reduce(U, Wp, gc, keep):
    return U[np.ix_(keep, keep)], Wp[:, keep, :], gc[keep]


def bundle_pinned(prob, intr0, rv, tv, X, pinned=(), max_iter=400, tol=1e-7):
    """As nfba.bundle, with intrinsics indices `pinned` held at their values in intr0."""
    q = prob.pack(np.asarray(intr0, float), rv, tv, X)
    nc = NI + 6 * (prob.nv - 1) - 1
    keep = np.array([j for j in range(nc) if j not in set(pinned)])

    def cost(q):
        return nfba.robust_cost((prob.residuals(q).reshape(-1, 2) ** 2).sum(1))

    c = cost(q)
    lam, it, status, rel = 1e-3, 0, 0, 1.0
    while it < max_iter:
        it += 1
        U, Wp, V, gc, gp, _, _ = nfba.normal_blocks(prob, q)
        Ur, Wr, gr = _reduce(U, Wp, gc, keep)
        while True:
            try:
                dcr, dp = nfba.schur_solve(Ur, Wr, V, gr, gp, lam)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            dc = np.zeros(nc)
            dc[keep] = dcr
            qn = q + np.concatenate([dc, dp.ravel()])
            cn = cost(qn)
            if np.isfinite(cn) and cn < c:
                rel = (c - cn) / c
                q, c = qn, cn
                lam = max(lam / 3, 1e-9)
                break
            lam *= 10
            if lam > 1e12:
                break
        if lam > 1e12:
            status = 2
            break
        if rel < tol:
            status = 1
            break
    return {"status": status, "iters": it, "cost": c}, prob.unpack(q), q


def intr_cov_pinned(prob, q, pinned=()):
    """Covariance of the free intrinsics (in index order) with `pinned` held, as nfba.intr_cov:
    IRLS-weighted Gauss-Newton matrix, points eliminated, sigma^2 = weighted SSR / dof.
    Returns (cov over the free intrinsics, list of their indices, sigma)."""
    U, Wp, V, gc, gp, r2, w = nfba.normal_blocks(prob, q)
    nc = U.shape[0]
    keep = np.array([j for j in range(nc) if j not in set(pinned)])
    Ur, Wr, _ = _reduce(U, Wp, gc, keep)
    Vi = np.linalg.pinv(V)
    S = Ur - np.einsum("kil,klm,kjm->ij", Wr, Vi, Wr)
    dof = 2 * len(r2) - (len(q) - len(pinned))
    sig2 = float((w * r2).sum() / max(dof, 1))
    free = [j for j in range(NI) if j not in set(pinned)]
    cov = np.linalg.pinv(S)[:len(free), :len(free)] * sig2
    return cov, free, float(np.sqrt(sig2))


def condition(intr, cov, which, ref):
    """First-order (Gaussian conditioning) f given intrinsics[which] = ref, as milestone 3g.
    Returns (f_c, conditional/marginal sd ratio of f)."""
    intr, cov = np.asarray(intr, float), np.asarray(cov, float)
    j = list(which)
    S_fk = cov[0, j]
    S_kk = cov[np.ix_(j, j)]
    g = np.linalg.solve(S_kk, S_fk)
    fc = intr[0] + g @ (np.asarray(ref, float) - intr[j])
    var_c = cov[0, 0] - S_fk @ g
    return float(fc), float(np.sqrt(max(var_c, 0.0) / cov[0, 0]))
