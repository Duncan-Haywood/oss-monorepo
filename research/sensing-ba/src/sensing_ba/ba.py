"""Bundle adjustment (sparse Levenberg-Marquardt-style least squares) on the sensing-recon rig.

Reuses the object, cameras, projection and triangulation of `sensing-recon` (imported from
the sibling directory). Cameras carry an error in rotation (degrees per axis) and position
(object radii per axis). Bundle adjustment refines all poses and points to minimise reprojection error;
an optional Gaussian prior ties each pose to its supplied value with the known pose-error sigma
(a MAP estimate). Scores are taken after a similarity (Umeyama) alignment to the true points,
because free bundle adjustment fixes the scene only up to scale, rotation and translation.
"""
import sys
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "sensing-recon" / "src"))
from sensing_recon import (make_object, orbit_cameras, project, visible,  # noqa: E402
                           triangulate_all, surface_error, Camera)
from sensing_recon.recon import F_PX, CX, CY  # noqa: E402


def perturb_cameras(cams, rot_deg, trans, rng):
    """Random rotation error (deg/axis) and position error (radii/axis) on every camera."""
    out = []
    for c in cams:
        dR = Rotation.from_rotvec(np.radians(rng.normal(0, rot_deg, 3))).as_matrix() if rot_deg > 0 else np.eye(3)
        out.append(Camera(dR @ c.R, c.t + (rng.normal(0, trans, 3) if trans > 0 else 0)))
    return out


def umeyama(src, dst):
    """Similarity (s, R, t) minimising |dst - (s R src + t)|."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    a, b = src - mu_s, dst - mu_d
    u, d, vt = np.linalg.svd(b.T @ a / len(src))
    S = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        S[2, 2] = -1
    R = u @ S @ vt
    s = (d * np.diag(S)).sum() / a.var(0).sum()
    return s, R, mu_d - s * R @ mu_s


def _residuals(x, n_cam, n_pt, ci, pi, obs, init_pose, w_rot, w_trans):
    cams = x[:6 * n_cam].reshape(n_cam, 6)
    pts = x[6 * n_cam:].reshape(n_pt, 3)
    R = Rotation.from_rotvec(cams[ci, :3]).as_matrix()
    pc = np.einsum("nij,nj->ni", R, pts[pi]) + cams[ci, 3:]
    uv = np.stack([F_PX * pc[:, 0] / pc[:, 2] + CX, F_PX * pc[:, 1] / pc[:, 2] + CY], axis=1)
    res = [(uv - obs).ravel()]
    if w_rot > 0 or w_trans > 0:
        d = cams - init_pose
        res.append((d[:, :3] * w_rot).ravel())
        res.append((d[:, 3:] * w_trans).ravel())
    return np.concatenate(res)


def bundle_adjust(cams, uvs, vis, pts0, idx, prior_rot_deg=0.0, prior_trans=0.0, max_nfev=40):
    """Refine camera poses and points. pts0/idx from triangulate_all. Returns (cams, points).

    A prior sigma of 0 means a free adjustment (no prior); otherwise residuals (pose - supplied pose)/sigma are added.
    """
    n_cam, n_pt = len(cams), len(idx)
    ci, pi, obs = [], [], []
    for k, i in enumerate(idx):
        for v in np.flatnonzero(vis[:, i]):
            ci.append(v); pi.append(k); obs.append(uvs[v, i])
    ci, pi, obs = np.array(ci), np.array(pi), np.array(obs)
    # parametrise each camera by an absolute rotation vector so the prior is on the supplied pose
    init = np.array([np.concatenate([Rotation.from_matrix(c.R).as_rotvec(), c.t]) for c in cams])
    x0 = np.concatenate([init.ravel(), pts0.ravel()])
    w_rot = 1.0 / np.radians(prior_rot_deg) if prior_rot_deg > 0 else 0.0
    w_trans = 1.0 / prior_trans if prior_trans > 0 else 0.0
    n_obs = len(obs)
    n_prior = 6 * n_cam if (w_rot or w_trans) else 0
    A = lil_matrix((2 * n_obs + n_prior, len(x0)), dtype=int)
    rows = np.arange(n_obs)
    for j in range(6):
        A[2 * rows, 6 * ci + j] = 1
        A[2 * rows + 1, 6 * ci + j] = 1
    for j in range(3):
        A[2 * rows, 6 * n_cam + 3 * pi + j] = 1
        A[2 * rows + 1, 6 * n_cam + 3 * pi + j] = 1
    for k in range(n_prior):
        A[2 * n_obs + k, k] = 1
    sol = least_squares(_residuals, x0, jac_sparsity=A, x_scale="jac", method="trf", max_nfev=max_nfev,
                        args=(n_cam, n_pt, ci, pi, obs, init, w_rot, w_trans))
    cp = sol.x[:6 * n_cam].reshape(n_cam, 6)
    new = [Camera(Rotation.from_rotvec(r[:3]).as_matrix(), r[3:]) for r in cp]
    return new, sol.x[6 * n_cam:].reshape(n_pt, 3)


def _score(rec, true_pts, align):
    if align:
        s, R, t = umeyama(rec, true_pts)
        rec = s * rec @ R.T + t
    e = surface_error(rec)
    return float(e.mean())


def run_trial(n_views=12, sigma_px=0.5, rot_deg=0.5, trans=0.02, seed=0, n_feat=300, prior=False):
    """One scene. Mean surface error (object radii) of: pose-error triangulation; the same after a
    similarity alignment (the fair baseline for a free adjustment); bundle adjustment; and reconstruction with true poses."""
    rng = np.random.default_rng(1000 + seed)
    pts, nrm = make_object(n_feat, seed=seed)
    true_cams = orbit_cameras(n_views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in true_cams])
    uvs = np.array([project(c, pts) + rng.normal(0, sigma_px, (len(pts), 2)) for c in true_cams])
    noisy = perturb_cameras(true_cams, rot_deg, trans, rng)
    best, bidx = triangulate_all(true_cams, uvs, vis)
    rec, idx = triangulate_all(noisy, uvs, vis)
    ref = _score(best, pts[bidx], False)
    tri = _score(rec, pts[idx], False)
    tri_al = _score(rec, pts[idx], True)
    _, p2 = bundle_adjust(noisy, uvs, vis, rec, idx,
                              rot_deg if prior else 0.0, trans if prior else 0.0)
    ba = _score(p2, pts[idx], True)
    return {"true_pose": ref, "tri": tri, "tri_aligned": tri_al, "ba": ba, "n_points": len(idx)}
