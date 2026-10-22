"""Geometric verification before bundle adjustment: fit a fundamental matrix to the matches of each
view pair by RANSAC (normalised 8-point, Hartley and Zisserman 2004, ch. 11), score every match by its
Sampson distance, and keep an observation if most of the pairs it appears in accept it.

The fit uses the observations only, never the supplied (wrong) camera poses. Reuses the rig, pose
perturbation, scoring and robust adjustment of `sensing-recon`, `sensing-ba` and `sensing-baoutlier`.
"""
import sys
from pathlib import Path
import numpy as np

_SIB = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_SIB / "sensing-baoutlier" / "src"))
from sensing_baoutlier.outlier import (robust_adjust, ransac_triangulate, contaminate,  # noqa: E402
                                       perturb_cameras, _score, make_object, orbit_cameras,
                                       project, visible, triangulate_all, W, H)


def mismatch(kind, clean, vis, frac, rng, cams=None, pts=None, near_px=40.0):
    """Corrupt a fraction of the visible observations. Returns (uvs, mask).

    `uniform`: a random pixel anywhere in the image (as sensing-baoutlier).
    `near`: shifted by 10 to `near_px` px in a random direction (a neighbouring feature on repeated texture).
    `along`: the worst case for an epipolar test: shifted 10 to `near_px` px along the true epipolar line
    of a random other view, so that view's pair accepts it."""
    if kind == "uniform":
        return contaminate(clean, vis, frac, rng)
    out = clean.copy()
    mask = (rng.random(vis.shape) < frac) & vis
    nv = vis.shape[0]
    for v, i in zip(*np.nonzero(mask)):
        d = rng.uniform(10.0, near_px)
        if kind == "near":
            a = rng.uniform(0, 2 * np.pi)
            u = np.array([np.cos(a), np.sin(a)])
        else:
            w = (v + rng.integers(1, nv)) % nv
            c = cams[w].centre()
            q = project(cams[v], np.array([pts[i], c + 1.3 * (pts[i] - c)]))
            u = q[1] - q[0]
            u = u / np.linalg.norm(u)
            u = u if rng.random() < 0.5 else -u
        out[v, i] = clean[v, i] + d * u
    return out, mask


def _norm(x):
    m = x.mean(0)
    s = np.sqrt(2) / np.mean(np.linalg.norm(x - m, axis=1))
    T = np.array([[s, 0, -s * m[0]], [0, s, -s * m[1]], [0, 0, 1.0]])
    return (np.c_[x, np.ones(len(x))] @ T.T), T


def _eight(x1, x2):
    a, T1 = _norm(x1)
    b, T2 = _norm(x2)
    A = np.stack([b[:, 0] * a[:, 0], b[:, 0] * a[:, 1], b[:, 0], b[:, 1] * a[:, 0], b[:, 1] * a[:, 1],
                  b[:, 1], a[:, 0], a[:, 1], np.ones(len(a))], axis=1)
    F = np.linalg.svd(A)[2][-1].reshape(3, 3)
    U, S, Vt = np.linalg.svd(F)
    F = U @ np.diag([S[0], S[1], 0.0]) @ Vt
    return T2.T @ F @ T1


def sampson(F, x1, x2):
    """Squared Sampson distance (px^2) of each match under F."""
    h1, h2 = np.c_[x1, np.ones(len(x1))], np.c_[x2, np.ones(len(x2))]
    Fx1, Ftx2 = h1 @ F.T, h2 @ F
    num = (h2 * Fx1).sum(1) ** 2
    den = Fx1[:, 0] ** 2 + Fx1[:, 1] ** 2 + Ftx2[:, 0] ** 2 + Ftx2[:, 1] ** 2
    return num / np.maximum(den, 1e-12)


def fundamental_ransac(x1, x2, thresh_px, iters, rng):
    """RANSAC fundamental matrix. Returns (F, inlier mask); (None, all False) with under 8 matches."""
    n = len(x1)
    if n < 8:
        return None, np.zeros(n, bool)
    best, best_n = None, -1
    for _ in range(iters):
        s = rng.choice(n, 8, replace=False)
        F = _eight(x1[s], x2[s])
        k = int((sampson(F, x1, x2) < thresh_px ** 2).sum())
        if k > best_n:
            best, best_n = F, k
    inl = sampson(best, x1, x2) < thresh_px ** 2
    if inl.sum() >= 8:
        best = _eight(x1[inl], x2[inl])
        inl = sampson(best, x1, x2) < thresh_px ** 2
    return best, inl


def epipolar_gate(uvs, vis, thresh_px=2.0, offsets=(1, 2, 3), iters=300, vote=0.5, seed=0):
    """Boolean (V, n) mask of observations to keep: visible, and accepted by at least `vote` of the
    view pairs (v, v+k mod V), k in `offsets`, in which the point is matched. A pair is fitted only on
    the points visible in both views. An observation in no fitted pair is dropped."""
    rng = np.random.default_rng(seed)
    V = vis.shape[0]
    acc = np.zeros(vis.shape)
    tot = np.zeros(vis.shape)
    for a in range(V):
        for k in offsets:
            b = (a + k) % V
            if b == a:
                continue
            both = np.flatnonzero(vis[a] & vis[b])
            F, inl = fundamental_ransac(uvs[a, both], uvs[b, both], thresh_px, iters, rng)
            if F is None:
                continue
            for v in (a, b):
                tot[v, both] += 1
                acc[v, both] += inl
    return vis & (tot > 0) & (acc >= vote * np.maximum(tot, 1))


def run_trial(kind="uniform", frac=0.1, n_views=12, sigma_px=0.5, rot_deg=0.5, trans=0.02, seed=0,
              n_feat=300, max_nfev=300, thresh_px=2.0, vote=0.5, near_px=40.0):
    """Surface error (object radii, after similarity alignment) with wrong poses and mismatches.

    All methods are scored on the points the clean data triangulate and the gated data still
    triangulate (`n_pts`; `cover` is the fraction of the clean set kept). Methods: `clean_ba` (floor),
    `tri`, `cauchy` (all-view start), `ri_cauchy` (RANSAC start), then `g_tri`, `g_linear`, `g_cauchy`
    (the same after the epipolar gate). `recall` is the share of mismatches the gate removed and `lost`
    the share of good observations it removed."""
    rng = np.random.default_rng(3000 + seed)
    pts, nrm = make_object(n_feat, seed=seed)
    true_cams = orbit_cameras(n_views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in true_cams])
    clean = np.array([project(c, pts) + rng.normal(0, sigma_px, (len(pts), 2)) for c in true_cams])
    noisy = perturb_cameras(true_cams, rot_deg, trans, rng)
    uvs, mask = mismatch(kind, clean, vis, frac, rng, true_cams, pts, near_px)
    rec0, idx0 = triangulate_all(noisy, clean, vis)
    keep = epipolar_gate(uvs, vis, thresh_px, vote=vote, seed=seed)
    rec_g, idx_g = triangulate_all(noisy, uvs, keep, min_angle_deg=0.0)
    rec_a, idx_a = triangulate_all(noisy, uvs, vis, min_angle_deg=0.0)
    idx = np.intersect1d(idx0, idx_g)
    gt = pts[idx]
    f = 3 * sigma_px
    out = {"n_pts": len(idx), "cover": len(idx) / len(idx0),
           "recall": float((~keep & mask).sum() / max(mask.sum(), 1)) if mask.any() else float("nan"),
           "lost": float((~keep & vis & ~mask).sum() / max((vis & ~mask).sum(), 1))}
    _, p = robust_adjust(noisy, clean, vis, rec0[np.searchsorted(idx0, idx)], idx)
    out["clean_ba"] = _score(p, gt, True)
    ra = rec_a[np.searchsorted(idx_a, idx)]
    out["tri"] = _score(ra, gt, True)
    _, p = robust_adjust(noisy, uvs, vis, ra, idx, "cauchy", f, max_nfev=max_nfev)
    out["cauchy"] = _score(p, gt, True)
    rr = ransac_triangulate(noisy, uvs, vis, idx)
    _, p = robust_adjust(noisy, uvs, vis, rr, idx, "cauchy", f, max_nfev=max_nfev)
    out["ri_cauchy"] = _score(p, gt, True)
    rg = rec_g[np.searchsorted(idx_g, idx)]
    out["g_tri"] = _score(rg, gt, True)
    for name, kw in [("g_linear", {}), ("g_cauchy", {"loss": "cauchy", "f_scale": f})]:
        _, p = robust_adjust(noisy, uvs, keep, rg, idx, max_nfev=max_nfev, **kw)
        out[name] = _score(p, gt, True)
    return out
