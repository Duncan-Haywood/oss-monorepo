"""Bundle adjustment when a fraction of the feature observations are mismatches.

Reuses the rig, pose perturbation, residual function and alignment of `sensing-ba` (imported from
the sibling directory). A mismatch replaces an observation by a uniformly random pixel in the
image. Losses compared: plain least squares, Huber and Cauchy (SciPy `least_squares` robust
losses, `f_scale` in pixels) and trimming (fit, drop observations above a residual gate, refit).
"""
import sys
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation

_SIB = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_SIB / "sensing-ba" / "src"))
sys.path.insert(0, str(_SIB / "sensing-recon" / "src"))
from sensing_ba.ba import _residuals, _score, perturb_cameras  # noqa: E402
from sensing_recon import (make_object, orbit_cameras, project, visible,  # noqa: E402
                           triangulate_all, Camera)

W, H = 640, 480


def contaminate(uvs, vis, frac, rng):
    """Replace a fraction of the visible observations by uniform random pixels. Returns (uvs, mask)."""
    out = uvs.copy()
    mask = (rng.random(vis.shape) < frac) & vis
    n = int(mask.sum())
    out[mask] = np.stack([rng.uniform(0, W, n), rng.uniform(0, H, n)], axis=1)
    return out, mask


def _fit(x0, A, n_cam, n_pt, ci, pi, obs, init, loss, f_scale, max_nfev):
    return least_squares(_residuals, x0, jac_sparsity=A, x_scale="jac", method="trf", max_nfev=max_nfev,
                         loss=loss, f_scale=f_scale, xtol=1e-12, ftol=1e-10, args=(n_cam, n_pt, ci, pi, obs, init, 0.0, 0.0))


def _sparsity(n_cam, n_pt, ci, pi):
    n = len(ci)
    A = lil_matrix((2 * n, 6 * n_cam + 3 * n_pt), dtype=int)
    rows = np.arange(n)
    for j in range(6):
        A[2 * rows, 6 * ci + j] = 1
        A[2 * rows + 1, 6 * ci + j] = 1
    for j in range(3):
        A[2 * rows, 6 * n_cam + 3 * pi + j] = 1
        A[2 * rows + 1, 6 * n_cam + 3 * pi + j] = 1
    return A


def robust_adjust(cams, uvs, vis, pts0, idx, loss="linear", f_scale=1.0, gate=None, max_nfev=300):
    """Refine poses and points under `loss`. With `gate` (px), fit linear, drop observations whose
    reprojection residual exceeds the gate, and refit on the rest. Returns (cams, points)."""
    n_cam, n_pt = len(cams), len(idx)
    ci, pi, obs = [], [], []
    for k, i in enumerate(idx):
        for v in np.flatnonzero(vis[:, i]):
            ci.append(v); pi.append(k); obs.append(uvs[v, i])
    ci, pi, obs = np.array(ci), np.array(pi), np.array(obs)
    init = np.array([np.concatenate([Rotation.from_matrix(c.R).as_rotvec(), c.t]) for c in cams])
    x0 = np.concatenate([init.ravel(), pts0.ravel()])
    A = _sparsity(n_cam, n_pt, ci, pi)
    sol = _fit(x0, A, n_cam, n_pt, ci, pi, obs, init, loss, f_scale, max_nfev)
    if gate is not None:
        r = np.linalg.norm(sol.fun.reshape(-1, 2), axis=1)
        keep = r <= gate
        ci, pi, obs = ci[keep], pi[keep], obs[keep]
        # a point seen by fewer than two kept rays is unconstrained: drop its observations too
        cnt = np.bincount(pi, minlength=n_pt)
        ok = cnt[pi] >= 2
        ci, pi, obs = ci[ok], pi[ok], obs[ok]
        A = _sparsity(n_cam, n_pt, ci, pi)
        sol = _fit(sol.x, A, n_cam, n_pt, ci, pi, obs, init, "linear", 1.0, max_nfev)
    cp = sol.x[:6 * n_cam].reshape(n_cam, 6)
    new = [Camera(Rotation.from_rotvec(r[:3]).as_matrix(), r[3:]) for r in cp]
    return new, sol.x[6 * n_cam:].reshape(n_pt, 3)


def ransac_triangulate(cams, uvs, vis, idx, thresh_px=20.0):
    """Per-point robust initialisation: triangulate from each pair of views, keep the pair whose
    reprojection (under the supplied, wrong poses) has the most inliers within `thresh_px`, then
    re-triangulate from all its inliers. The gate is wide because the poses themselves are wrong."""
    Ps = [c.P() for c in cams]
    out = []
    for i in idx:
        views = np.flatnonzero(vis[:, i])
        best, best_n = None, -1
        for a in range(len(views)):
            for b in range(a + 1, len(views)):
                X = _dlt(Ps, uvs, i, [views[a], views[b]])
                if X is None:
                    continue
                n = int((_reproj(Ps, uvs, i, views, X) < thresh_px).sum())
                if n > best_n:
                    best, best_n = X, n
        if best is None:
            best = _dlt(Ps, uvs, i, views)
        inl = views[_reproj(Ps, uvs, i, views, best) < thresh_px]
        X = _dlt(Ps, uvs, i, inl) if len(inl) >= 2 else None
        out.append(X if X is not None else best)
    return np.array(out)


def _dlt(Ps, uvs, i, views):
    A = []
    for v in views:
        u, w = uvs[v, i]
        A.append(u * Ps[v][2] - Ps[v][0])
        A.append(w * Ps[v][2] - Ps[v][1])
    X = np.linalg.svd(np.array(A))[2][-1]
    return None if abs(X[3]) < 1e-12 else X[:3] / X[3]


def _reproj(Ps, uvs, i, views, X):
    Xh = np.append(X, 1.0)
    r = []
    for v in views:
        q = Ps[v] @ Xh
        r.append(np.hypot(q[0] / q[2] - uvs[v, i, 0], q[1] / q[2] - uvs[v, i, 1]))
    return np.array(r)


def run_trial(frac=0.05, n_views=12, sigma_px=0.5, rot_deg=0.5, trans=0.02, seed=0, n_feat=300, max_nfev=300):
    """Mean surface error (object radii) after a similarity alignment, with wrong poses and a
    fraction `frac` of mismatched observations: DLT triangulation; plain, Huber and Cauchy bundle
    adjustment; trim-and-refit; and the clean-data adjustment (floor). Points are scored on the
    clean-data triangulated set so every method is judged on the same points."""
    rng = np.random.default_rng(2000 + seed)
    pts, nrm = make_object(n_feat, seed=seed)
    true_cams = orbit_cameras(n_views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in true_cams])
    clean = np.array([project(c, pts) + rng.normal(0, sigma_px, (len(pts), 2)) for c in true_cams])
    noisy = perturb_cameras(true_cams, rot_deg, trans, rng)
    uvs, mask = contaminate(clean, vis, frac, rng)
    rec0, idx = triangulate_all(noisy, clean, vis)
    # mismatches move the ray-angle gate, so triangulate with no gate and keep the clean-data point set
    rec_all, idx_all = triangulate_all(noisy, uvs, vis, min_angle_deg=0.0)
    rec = rec_all[np.searchsorted(idx_all, idx)]
    gt = pts[idx]
    f = 3 * sigma_px  # robust-loss scale: three times the (assumed known) pixel noise
    out = {"tri": _score(rec, gt, True)}
    _, p = robust_adjust(noisy, clean, vis, rec0, idx)
    out["clean_ba"] = _score(p, gt, True)
    for name, kw in [("linear", {}), ("huber", {"loss": "huber", "f_scale": f}),
                     ("cauchy", {"loss": "cauchy", "f_scale": f}), ("trim", {"gate": 4 * sigma_px + 2})]:
        _, p = robust_adjust(noisy, uvs, vis, rec, idx, max_nfev=max_nfev, **kw)
        out[name] = _score(p, gt, True)
    # same adjustments from a RANSAC-style per-point initialisation instead of all-views DLT
    rr = ransac_triangulate(noisy, uvs, vis, idx)
    out["ri_init"] = _score(rr, gt, True)
    for name, kw in [("ri_linear", {}), ("ri_cauchy", {"loss": "cauchy", "f_scale": f}),
                     ("ri_trim", {"gate": 4 * sigma_px + 2})]:
        _, p = robust_adjust(noisy, uvs, vis, rr, idx, max_nfev=max_nfev, **kw)
        out[name] = _score(p, gt, True)
    out["n_obs"] = int(vis.sum())
    out["n_bad"] = int(mask.sum())
    return out
