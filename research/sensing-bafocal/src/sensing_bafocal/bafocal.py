"""Self-calibrating bundle adjustment on the sensing-ba rig.

Images are rendered with a true focal length `F_PX` and an optional radial distortion `k1`
(x_d = x (1 + k1 r^2) on normalised coordinates). The solver is told a possibly wrong focal
length `f0` (as from a bad EXIF tag) and no distortion. Three adjustments are compared, all
starting from the same wrong-pose triangulation made with `f0`:
  fixed   poses and points only, focal length held at `f0`;
  selfcal poses, points and one shared focal length (and `k1` when `est_k1`);
  oracle  poses and points with the true intrinsics (the floor).
Scores are mean surface error (object radii) after a similarity alignment to the true points.
"""
import sys
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation

_SRC = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_SRC / "sensing-ba" / "src"))
from sensing_ba import perturb_cameras, umeyama  # noqa: E402
from sensing_recon import make_object, orbit_cameras, visible, surface_error, Camera  # noqa: E402
from sensing_recon.recon import F_PX, CX, CY, W, H  # noqa: E402


def project_k(cam, pts, f, k1=0.0):
    """Pinhole projection with focal length f and one radial term k1 (pixels)."""
    pc = pts @ cam.R.T + cam.t
    x, y = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    s = 1 + k1 * (x * x + y * y)
    return np.stack([f * x * s + CX, f * y * s + CY], axis=1)


def triangulate_f(cams, uvs, vis, f, min_angle_deg=2.0):
    """DLT triangulation as `sensing_recon.triangulate_all`, but with an explicit focal length."""
    Ps = [np.hstack([c.R, c.t[:, None]]) for c in cams]
    centres = np.array([c.centre() for c in cams])
    cos_max = np.cos(np.radians(min_angle_deg))
    out, idx = [], []
    for i in range(vis.shape[1]):
        views = np.flatnonzero(vis[:, i])
        if len(views) < 2:
            continue
        A = []
        for v in views:
            P = Ps[v]
            u, w = (uvs[v, i, 0] - CX) / f, (uvs[v, i, 1] - CY) / f
            A.append(u * P[2] - P[0])
            A.append(w * P[2] - P[1])
        X = np.linalg.svd(np.array(A))[2][-1]
        if abs(X[3]) < 1e-12:
            continue
        X = X[:3] / X[3]
        rays = centres[views] - X
        rays /= np.linalg.norm(rays, axis=1, keepdims=True)
        if (rays @ rays.T).min() > cos_max:
            continue
        out.append(X); idx.append(i)
    return np.array(out).reshape(-1, 3), np.array(idx, dtype=int)


def _res(x, n_cam, n_pt, ci, pi, obs, mode, f0):
    cams = x[:6 * n_cam].reshape(n_cam, 6)
    pts = x[6 * n_cam:6 * n_cam + 3 * n_pt].reshape(n_pt, 3)
    g = x[6 * n_cam + 3 * n_pt:]
    f = f0 * g[0] if mode >= 1 else f0           # focal parametrised as a ratio to f0 (well scaled)
    k1 = g[1] if mode == 2 else 0.0
    R = Rotation.from_rotvec(cams[ci, :3]).as_matrix()
    pc = np.einsum("nij,nj->ni", R, pts[pi]) + cams[ci, 3:]
    xn, yn = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    s = 1 + k1 * (xn * xn + yn * yn)
    uv = np.stack([f * xn * s + CX, f * yn * s + CY], axis=1)
    return (uv - obs).ravel()


def bundle_adjust_k(cams, uvs, vis, pts0, idx, f0, mode=0, max_nfev=60):
    """mode 0: focal fixed at f0; 1: shared focal free; 2: shared focal and k1 free.

    Returns (cams, points, f_est, k1_est)."""
    n_cam, n_pt = len(cams), len(idx)
    ci, pi, obs = [], [], []
    for k, i in enumerate(idx):
        for v in np.flatnonzero(vis[:, i]):
            ci.append(v); pi.append(k); obs.append(uvs[v, i])
    ci, pi, obs = np.array(ci), np.array(pi), np.array(obs)
    init = np.array([np.concatenate([Rotation.from_matrix(c.R).as_rotvec(), c.t]) for c in cams])
    n_g = {0: 0, 1: 1, 2: 2}[mode]
    g0 = np.array([1.0, 0.0])[:n_g]
    x0 = np.concatenate([init.ravel(), pts0.ravel(), g0])
    n_obs = len(obs)
    A = lil_matrix((2 * n_obs, len(x0)), dtype=int)
    rows = np.arange(n_obs)
    for j in range(6):
        A[2 * rows, 6 * ci + j] = 1; A[2 * rows + 1, 6 * ci + j] = 1
    for j in range(3):
        A[2 * rows, 6 * n_cam + 3 * pi + j] = 1; A[2 * rows + 1, 6 * n_cam + 3 * pi + j] = 1
    for j in range(n_g):
        A[:, 6 * n_cam + 3 * n_pt + j] = 1
    sol = least_squares(_res, x0, jac_sparsity=A, x_scale="jac", method="trf", max_nfev=max_nfev,
                        args=(n_cam, n_pt, ci, pi, obs, mode, f0))
    cp = sol.x[:6 * n_cam].reshape(n_cam, 6)
    new = [Camera(Rotation.from_rotvec(r[:3]).as_matrix(), r[3:]) for r in cp]
    g = sol.x[6 * n_cam + 3 * n_pt:]
    return (new, sol.x[6 * n_cam:6 * n_cam + 3 * n_pt].reshape(n_pt, 3),
            f0 * g[0] if mode >= 1 else f0, float(g[1]) if mode == 2 else 0.0)


def _score(rec, true_pts):
    s, R, t = umeyama(rec, true_pts)
    return float(surface_error(s * rec @ R.T + t).mean())


def run_trial(n_views=12, sigma_px=0.5, rot_deg=0.5, trans=0.02, focal_err=0.05, k1_true=0.0,
              est_k1=False, seed=0, n_feat=300, max_nfev=60):
    """One scene. focal_err is the relative error of the focal length the solver is told (f0 = F_PX (1 + err))."""
    rng = np.random.default_rng(1000 + seed)
    pts, nrm = make_object(n_feat, seed=seed)
    true_cams = orbit_cameras(n_views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in true_cams])
    uvs = np.array([project_k(c, pts, F_PX, k1_true) + rng.normal(0, sigma_px, (len(pts), 2))
                    for c in true_cams])
    noisy = perturb_cameras(true_cams, rot_deg, trans, rng)
    f0 = F_PX * (1 + focal_err)
    rec, idx = triangulate_f(noisy, uvs, vis, f0)
    ref_pts, ref_idx = triangulate_f(true_cams, uvs, vis, F_PX)
    out = {"n_points": len(idx), "tri": _score(rec, pts[idx]),
           "true_pose": _score(ref_pts, pts[ref_idx])}
    _, p, _, _ = bundle_adjust_k(noisy, uvs, vis, rec, idx, f0, 0, max_nfev)
    out["fixed"] = _score(p, pts[idx])
    _, p, fe, ke = bundle_adjust_k(noisy, uvs, vis, rec, idx, f0, 2 if est_k1 else 1, max_nfev)
    out["selfcal"] = _score(p, pts[idx])
    out["f_err"] = abs(fe - F_PX) / F_PX
    out["k1_est"] = ke
    # oracle: true focal (and true k1 via the distortion-aware route is not modelled here; k1_true=0 only)
    rec_t, idx_t = triangulate_f(noisy, uvs, vis, F_PX)
    _, p, _, _ = bundle_adjust_k(noisy, uvs, vis, rec_t, idx_t, F_PX, 0, max_nfev)
    out["oracle"] = _score(p, pts[idx_t])
    return out
