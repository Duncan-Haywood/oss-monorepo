"""Bundle adjustment with a radial law that may be poorer than the one that rendered the images.

Images are rendered with x_d = x (1 + k1 r^2 + k2 r^4) on normalised coordinates and the true focal
length. Four adjustments start from the same wrong-pose triangulation (the true focal is told, no
distortion model in the start):
  none  focal free, no distortion;
  k1    focal and k1 free (the model of sensing-bafocal);
  k1k2  focal, k1 and k2 free (the rendering model);
  fixed focal held, no distortion (floor reference for "do nothing").
Scores are mean surface error in object radii after a similarity alignment to the true points.
"""
import sys
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation

_R = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_R / "sensing-bafocal" / "src"))
sys.path.insert(0, str(_R / "sensing-ba" / "src"))
from sensing_bafocal import triangulate_f  # noqa: E402
from sensing_ba import perturb_cameras, umeyama  # noqa: E402
from sensing_recon import make_object, orbit_cameras, visible, surface_error, Camera  # noqa: E402
from sensing_recon.recon import F_PX, CX, CY  # noqa: E402

N_DIST = {"none": 0, "k1": 1, "k1k2": 2}


def project_k2(cam, pts, f, k1=0.0, k2=0.0):
    pc = pts @ cam.R.T + cam.t
    x, y = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    r2 = x * x + y * y
    s = 1 + k1 * r2 + k2 * r2 * r2
    return np.stack([f * x * s + CX, f * y * s + CY], axis=1)


def _res(x, n_cam, n_pt, ci, pi, obs, f0, nd, free_f):
    cams = x[:6 * n_cam].reshape(n_cam, 6)
    pts = x[6 * n_cam:6 * n_cam + 3 * n_pt].reshape(n_pt, 3)
    g = x[6 * n_cam + 3 * n_pt:]
    f = f0 * g[0] if free_f else f0
    k1 = g[1] if nd >= 1 else 0.0
    k2 = g[2] if nd >= 2 else 0.0
    R = Rotation.from_rotvec(cams[ci, :3]).as_matrix()
    pc = np.einsum("nij,nj->ni", R, pts[pi]) + cams[ci, 3:]
    xn, yn = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    r2 = xn * xn + yn * yn
    s = 1 + k1 * r2 + k2 * r2 * r2
    uv = np.stack([f * xn * s + CX, f * yn * s + CY], axis=1)
    return (uv - obs).ravel()


def bundle_adjust_k2(cams, uvs, vis, pts0, idx, f0, model="k1k2", free_f=True, max_nfev=80):
    """Returns (cams, points, f_est, k1_est, k2_est). model in N_DIST; free_f False holds the focal at f0."""
    nd = N_DIST[model]
    n_cam, n_pt = len(cams), len(idx)
    ci, pi, obs = [], [], []
    for k, i in enumerate(idx):
        for v in np.flatnonzero(vis[:, i]):
            ci.append(v); pi.append(k); obs.append(uvs[v, i])
    ci, pi, obs = np.array(ci), np.array(pi), np.array(obs)
    init = np.array([np.concatenate([Rotation.from_matrix(c.R).as_rotvec(), c.t]) for c in cams])
    n_g = (1 + nd) if free_f else 0
    # global vector is [f ratio, k1, k2]; when the focal is held, k's would shift down, so keep a slot for f
    n_g = max(n_g, 1 + nd) if nd else (1 if free_f else 0)
    g0 = np.array([1.0, 0.0, 0.0])[:n_g]
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
                        args=(n_cam, n_pt, ci, pi, obs, f0, nd, free_f))
    cp = sol.x[:6 * n_cam].reshape(n_cam, 6)
    new = [Camera(Rotation.from_rotvec(r[:3]).as_matrix(), r[3:]) for r in cp]
    g = sol.x[6 * n_cam + 3 * n_pt:]
    return (new, sol.x[6 * n_cam:6 * n_cam + 3 * n_pt].reshape(n_pt, 3),
            f0 * g[0] if free_f else f0, float(g[1]) if nd >= 1 else 0.0, float(g[2]) if nd >= 2 else 0.0)


def _score(rec, true_pts):
    s, R, t = umeyama(rec, true_pts)
    return float(surface_error(s * rec @ R.T + t).mean())


def run_trial(n_views=12, sigma_px=0.5, rot_deg=0.5, trans=0.02, k1_true=-0.2, k2_true=0.0,
              seed=0, n_feat=300, max_nfev=80):
    rng = np.random.default_rng(2000 + seed)
    pts, nrm = make_object(n_feat, seed=seed)
    true_cams = orbit_cameras(n_views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in true_cams])
    uvs = np.array([project_k2(c, pts, F_PX, k1_true, k2_true) + rng.normal(0, sigma_px, (len(pts), 2))
                    for c in true_cams])
    noisy = perturb_cameras(true_cams, rot_deg, trans, rng)
    rec, idx = triangulate_f(noisy, uvs, vis, F_PX)
    out = {"n_points": len(idx), "tri": _score(rec, pts[idx])}
    for name, kw in (("fixed", dict(model="none", free_f=False)), ("none", dict(model="none")),
                     ("k1", dict(model="k1")), ("k1k2", dict(model="k1k2"))):
        _, p, f, k1, k2 = bundle_adjust_k2(noisy, uvs, vis, rec, idx, F_PX, max_nfev=max_nfev, **kw)
        out[name] = _score(p, pts[idx])
        if name == "k1":
            out["k1_of_k1"] = k1
        if name == "k1k2":
            out["k1_est"], out["k2_est"], out["f_err"] = k1, k2, abs(f - F_PX) / F_PX
    return out
