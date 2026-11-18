"""Milestone 3c: covariances of f that do not trust the residual model, for milestone 3b's
natural-feature bundle adjustment (../m3b_natural/nfba.py, imported unchanged).

- `delete_view`: the problem with one keyframe removed (tracks keep >= 2 remaining views); removing
  keyframe 0 re-anchors the gauge on keyframe 1.
- `jackknife`: delete-one-keyframe solves warm-started from the full solution.
- `sandwich`: S^-1 B S^-1 on the camera block after eliminating the points, B summed from the
  points-adjusted robust scores per cluster (track or keyframe), with a G/(G-1) factor.
- `lag1_corr`: correlation of inlier residuals along a track between consecutive keyframes.
"""
import os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m3b_natural"))
import nfba  # noqa: E402

NI = nfba.NI


def reanchor(rv, tv, X, a):
    """Express poses and points in keyframe a's camera frame (keyframe a becomes the identity)."""
    Ra = cv2.Rodrigues(rv[a])[0]
    ta = tv[a]
    Xn = X @ Ra.T + ta
    rvn, tvn = np.zeros_like(rv), np.zeros_like(tv)
    for j in range(len(rv)):
        Rj = cv2.Rodrigues(rv[j])[0] @ Ra.T
        rvn[j] = cv2.Rodrigues(Rj)[0].ravel()
        tvn[j] = tv[j] - Rj @ ta
    return rvn, tvn, Xn


def delete_view(vi, pi, uv, rv, tv, X, v, min_views=2):
    """Remove keyframe v. Returns (vi, pi, uv, nv, npt, rv, tv, X) of the reduced problem."""
    nv = len(rv)
    if v == 0:
        rv, tv, X = reanchor(rv, tv, X, 1)
    keep = vi != v
    vi2, pi2, uv2 = vi[keep], pi[keep], uv[keep]
    cnt = np.bincount(pi2, minlength=len(X))
    good = cnt >= min_views
    sel = good[pi2]
    vi2, pi2, uv2 = vi2[sel], pi2[sel], uv2[sel]
    remap = -np.ones(len(X), int)
    remap[good] = np.arange(good.sum())
    pi2 = remap[pi2]
    vi2 = np.where(vi2 > v, vi2 - 1, vi2)
    vs = [j for j in range(nv) if j != v]
    return vi2, pi2, uv2, nv - 1, int(good.sum()), rv[vs], tv[vs], X[good]


def solve(vi, pi, uv, nv, npt, intr, rv, tv, X):
    prob = nfba.Problem(vi, pi, uv, nv, npt, tv)
    info, (intr2, rv2, tv2, X2), q = nfba.bundle(prob, intr, rv, tv, X)
    return info, intr2, prob, q


def jackknife(vi, pi, uv, intr, rv, tv, X):
    """Delete-one-keyframe f values, each warm-started from the full solution.
    Returns list of dicts (view, status, f, iters)."""
    out = []
    for v in range(len(rv)):
        try:
            a = delete_view(vi, pi, uv, rv, tv, X, v)
            info, intr2, _, _ = solve(*a[:5], np.array(intr, float), *a[5:])
            st = "ok" if info["status"] > 0 else "maxiter"
            f = float(intr2[0])
            if st == "ok" and not 300 < f < 1000:
                st = "f_range"
            out.append({"view": v, "status": st, "f": f, "iters": info["iters"]})
        except (np.linalg.LinAlgError, ValueError) as e:
            out.append({"view": v, "status": "error:" + type(e).__name__, "f": None, "iters": 0})
    return out


def jk_sd(fs):
    fs = np.asarray(fs, float)
    n = len(fs)
    return float(np.sqrt((n - 1) / n * ((fs - fs.mean()) ** 2).sum()))


def camera_jac(prob, q):
    """Robust-weighted per-observation camera Jacobian (gauge column dropped), point Jacobian and
    residuals, as in nfba.normal_blocks. Returns Jc_w (n,2,nc), Jx_w (n,2,3), r_w (n,2), r2 (n)."""
    intr, rv, tv, X = prob.unpack(q)
    vi, pi, nv = prob.vi, prob.pi, prob.nv
    pr, _ = nfba.project(intr, rv[vi], tv[vi], X[pi])
    r = pr - prob.uv
    r2 = (r ** 2).sum(1)
    w = nfba.robust_weights(r2)
    Ji, Jp, Jx = nfba.obs_jac(intr, rv, tv, X, vi, pi)
    n = len(vi)
    nfc = NI + 6 * (nv - 1)
    Jc = np.zeros((n, 2, nfc))
    Jc[:, :, :NI] = Ji
    idx = np.nonzero(vi > 0)[0]
    for j in range(3):
        Jc[idx, :, NI + 3 * (vi[idx] - 1) + j] = Jp[idx, :, j]
        Jc[idx, :, NI + 3 * (nv - 1) + 3 * (vi[idx] - 1) + j] = Jp[idx, :, 3 + j]
    keep = np.array([j for j in range(nfc) if j != prob.jfix])
    sw = np.sqrt(w)[:, None, None]
    return Jc[:, :, keep] * sw, Jx * sw, r * np.sqrt(w)[:, None], r2


def sandwich(prob, q, clusters):
    """Cluster-robust covariance of the 5 intrinsics. clusters: (n,) integer label per observation."""
    Jc, Jx, r, _ = camera_jac(prob, q)
    pi, npt = prob.pi, prob.npt
    U = np.einsum("kai,kaj->ij", Jc, Jc)
    Wp = np.zeros((npt, Jc.shape[2], 3)); np.add.at(Wp, pi, np.einsum("kai,kaj->kij", Jc, Jx))
    V = np.zeros((npt, 3, 3)); np.add.at(V, pi, np.einsum("kai,kaj->kij", Jx, Jx))
    Vi = np.linalg.pinv(V)
    S = U - np.einsum("kil,klm,kjm->ij", Wp, Vi, Wp)
    sc = np.einsum("kai,ka->ki", Jc, r)                       # camera score per observation
    sp = np.einsum("kai,ka->ki", Jx, r)                       # point score per observation
    adj = sc - np.einsum("kil,klm,km->ki", Wp[pi], Vi[pi], sp)   # points profiled out
    lab, inv = np.unique(clusters, return_inverse=True)
    G = len(lab)
    Gs = np.zeros((G, adj.shape[1])); np.add.at(Gs, inv, adj)
    B = Gs.T @ Gs * G / max(G - 1, 1)
    Si = np.linalg.pinv(S)
    return (Si @ B @ Si)[:NI, :NI]


def lag1_corr(prob, q, inlier_px=3.0):
    """Correlation of residual components along a track between keyframes v and v+1 (both inliers).
    Returns (corr_x, corr_y, n_pairs)."""
    intr, rv, tv, X = prob.unpack(q)
    vi, pi = prob.vi, prob.pi
    pr, _ = nfba.project(intr, rv[vi], tv[vi], X[pi])
    r = pr - prob.uv
    inl = (r ** 2).sum(1) < inlier_px ** 2
    key = {(int(p), int(v)): k for k, (p, v) in enumerate(zip(pi, vi)) if inl[k]}
    a, b = [], []
    for (p, v), k in key.items():
        k2 = key.get((p, v + 1))
        if k2 is not None:
            a.append(r[k]); b.append(r[k2])
    if len(a) < 10:
        return None, None, len(a)
    a, b = np.array(a), np.array(b)
    return (float(np.corrcoef(a[:, 0], b[:, 0])[0, 1]), float(np.corrcoef(a[:, 1], b[:, 1])[0, 1]), len(a))
