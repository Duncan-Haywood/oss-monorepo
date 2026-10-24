"""Bundle adjustment when the principal point is off-centre in the images.

Images are rendered with x_d = x (1 + k1 r^2 + k2 r^4), focal f and principal point (CX + dx, CY + dy).
The solver starts from the nominal centre. Adjustments (all share one focal, k1, k2):
  k1k2    focal, k1, k2 free; principal point held at the image centre (wrong when dx, dy != 0);
  k1k2pp  the same plus the principal point free (the rendering model).
Scores: mean surface error in object radii after a similarity alignment (sensing-bak2 scoring).
The rig geometry comes from sensing-bak2wide's `wide_rig` (camera distance, f = 200 x distance).
"""
import sys
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation

_R = Path(__file__).resolve().parents[3]
for p in ("sensing-bak2wide", "sensing-bak2", "sensing-bafocal", "sensing-ba", "sensing-recon"):
    sys.path.insert(0, str(_R / p / "src"))
from sensing_bak2wide import wide_rig  # noqa: E402
import sensing_bak2.bak2 as bak2  # noqa: E402
from sensing_bak2.bak2 import _score  # noqa: E402
from sensing_bafocal import triangulate_f  # noqa: E402
from sensing_ba import perturb_cameras  # noqa: E402
from sensing_recon import make_object, orbit_cameras, visible, Camera  # noqa: E402
from sensing_recon.recon import CX, CY  # noqa: E402


def project_pp(cam, pts, f, k1, k2, dx, dy):
    pc = pts @ cam.R.T + cam.t
    x, y = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    r2 = x * x + y * y
    s = 1 + k1 * r2 + k2 * r2 * r2
    return np.stack([f * x * s + CX + dx, f * y * s + CY + dy], axis=1)


def _res(x, n_cam, n_pt, ci, pi, obs, f0, free_pp):
    cams = x[:6 * n_cam].reshape(n_cam, 6)
    pts = x[6 * n_cam:6 * n_cam + 3 * n_pt].reshape(n_pt, 3)
    g = x[6 * n_cam + 3 * n_pt:]
    f, k1, k2 = f0 * g[0], g[1], g[2]
    dx, dy = (g[3], g[4]) if free_pp else (0.0, 0.0)
    R = Rotation.from_rotvec(cams[ci, :3]).as_matrix()
    pc = np.einsum("nij,nj->ni", R, pts[pi]) + cams[ci, 3:]
    xn, yn = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    r2 = xn * xn + yn * yn
    s = 1 + k1 * r2 + k2 * r2 * r2
    uv = np.stack([f * xn * s + CX + dx, f * yn * s + CY + dy], axis=1)
    return (uv - obs).ravel()


def bundle_adjust_pp(cams, uvs, vis, pts0, idx, f0, free_pp, max_nfev=80):
    """Returns (cams, points, dict of f, k1, k2, dx, dy)."""
    n_cam, n_pt = len(cams), len(idx)
    ci, pi, obs = [], [], []
    for k, i in enumerate(idx):
        for v in np.flatnonzero(vis[:, i]):
            ci.append(v); pi.append(k); obs.append(uvs[v, i])
    ci, pi, obs = np.array(ci), np.array(pi), np.array(obs)
    init = np.array([np.concatenate([Rotation.from_matrix(c.R).as_rotvec(), c.t]) for c in cams])
    n_g = 5 if free_pp else 3
    x0 = np.concatenate([init.ravel(), pts0.ravel(), np.array([1.0, 0, 0, 0, 0])[:n_g]])
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
                        args=(n_cam, n_pt, ci, pi, obs, f0, free_pp))
    cp = sol.x[:6 * n_cam].reshape(n_cam, 6)
    new = [Camera(Rotation.from_rotvec(r[:3]).as_matrix(), r[3:]) for r in cp]
    g = sol.x[6 * n_cam + 3 * n_pt:]
    est = dict(f=f0 * g[0], k1=g[1], k2=g[2], dx=g[3] if free_pp else 0.0, dy=g[4] if free_pp else 0.0)
    return new, sol.x[6 * n_cam:6 * n_cam + 3 * n_pt].reshape(n_pt, 3), est


def run_trial_pp(dist=2.0, dx=0.0, dy=0.0, n_views=12, sigma_px=0.5, rot_deg=0.5, trans=0.02,
                 k1_true=-0.2, k2_true=0.1, seed=0, n_feat=300, max_nfev=80):
    """One scene on the rig of camera distance `dist`; true principal-point offset (dx, dy) px."""
    with wide_rig(dist) as f:
        rng = np.random.default_rng(3000 + seed)
        pts, nrm = make_object(n_feat, seed=seed)
        true_cams = orbit_cameras(n_views, 360.0)
        vis = np.array([visible(c, pts, nrm) for c in true_cams])
        uvs = np.array([project_pp(c, pts, f, k1_true, k2_true, dx, dy) + rng.normal(0, sigma_px, (len(pts), 2))
                        for c in true_cams])
        noisy = perturb_cameras(true_cams, rot_deg, trans, rng)
        rec, idx = triangulate_f(noisy, uvs, vis, f)
        out = {"tri": _score(rec, pts[idx])}
        for name, free in (("pp_held", False), ("pp_free", True)):
            _, p, e = bundle_adjust_pp(noisy, uvs, vis, rec, idx, f, free, max_nfev)
            out[name] = _score(p, pts[idx])
            if name == "pp_free":
                out.update(dx_est=e["dx"], dy_est=e["dy"], k2_est=e["k2"], k1_est=e["k1"],
                           f_err=abs(e["f"] - f) / f)
            else:
                out.update(k2_held=e["k2"], f_err_held=abs(e["f"] - f) / f)
    return out
