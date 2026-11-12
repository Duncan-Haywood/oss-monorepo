"""Target-free camera self-calibration by bundle adjustment, and Zhang's method for reference.

Camera model (both solvers): fx = fy = f, principal point (cx, cy), radial
distortion 1 + k1 r^2 (+ k2 r^4), no tangential terms, as OpenCV with
CALIB_FIX_ASPECT_RATIO | CALIB_ZERO_TANGENT_DIST | CALIB_FIX_K3.

"Target-free" means the solver gets the detected corner pixels and which
corner is which across views (the correspondences a feature matcher would
give), but not the board's geometry: every corner is a free 3-D point.
"""
import numpy as np
import cv2
from scipy.optimize import least_squares

PATTERN = (9, 6)  # inner corners of OpenCV's samples/data board


def detect(path, pattern=PATTERN, method="subpix11"):
    """Sub-pixel checkerboard corners of one image, (N, 2) float64, or None.

    method: "subpix11" (milestones 1-5: findChessboardCorners, then cornerSubPix with an
    11x11 half-window), "subpix5" (a 5x5 half-window), or "sb" (findChessboardCornersSB
    with CALIB_CB_ACCURACY, Duda and Frese 2018), re-ordered to subpix11's corner order
    by nearest neighbour so corner i is the same physical corner whatever the detector."""
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    ok, c = cv2.findChessboardCorners(img, pattern)
    if not ok:
        return None, img.shape[::-1]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 1e-4)
    if method in ("subpix11", "subpix5"):
        w = 11 if method == "subpix11" else 5
        c = cv2.cornerSubPix(img, c, (w, w), (-1, -1), crit)
        return c.reshape(-1, 2).astype(np.float64), img.shape[::-1]
    if method != "sb":
        raise ValueError(method)
    ref = cv2.cornerSubPix(img, c, (11, 11), (-1, -1), crit).reshape(-1, 2).astype(np.float64)
    ok, sb = cv2.findChessboardCornersSB(img, pattern, flags=cv2.CALIB_CB_ACCURACY)
    if not ok:
        return None, img.shape[::-1]
    return match_order(ref, sb.reshape(-1, 2).astype(np.float64)), img.shape[::-1]


def match_order(ref, other, tol=10.0):
    """Re-order `other` so other[i] is the corner nearest ref[i]; raises unless the
    match is one-to-one and every pair is within tol px (corners are 25-41 px apart here)."""
    d = np.linalg.norm(ref[:, None] - other[None], axis=2)
    j = d.argmin(axis=1)
    if len(set(j.tolist())) != len(ref) or d[np.arange(len(ref)), j].max() > tol:
        raise ValueError("corner sets do not match one-to-one")
    return other[j]


def board_points(pattern=PATTERN, square=1.0):
    g = np.zeros((pattern[0] * pattern[1], 3))
    g[:, :2] = np.mgrid[0:pattern[0], 0:pattern[1]].T.reshape(-1, 2) * square
    return g


def zhang(corners, size, k2=True):
    """Zhang calibration with the known board. Returns dict f, cx, cy, k1, k2, sigmas, rms."""
    obj = [board_points().astype(np.float32)] * len(corners)
    img = [c.astype(np.float32).reshape(-1, 1, 2) for c in corners]
    flags = cv2.CALIB_FIX_ASPECT_RATIO | cv2.CALIB_ZERO_TANGENT_DIST | cv2.CALIB_FIX_K3
    if not k2:
        flags |= cv2.CALIB_FIX_K2
    K0 = np.array([[size[0], 0, size[0] / 2], [0, size[0], size[1] / 2], [0, 0, 1.0]])
    rms, K, d, rv, tv, sdi, sde, perr = cv2.calibrateCameraExtended(
        obj, img, size, K0, np.zeros(5), flags=flags)
    sdi = sdi.ravel()  # with a fixed aspect ratio OpenCV reports sigma(f) in the fy slot
    return dict(f=K[0, 0], cx=K[0, 2], cy=K[1, 2], k1=d.ravel()[0], k2=d.ravel()[1],
                sf=max(sdi[0], sdi[1]), scx=sdi[2], scy=sdi[3], sk1=sdi[4], sk2=sdi[5], rms=rms,
                rvecs=[r.ravel() for r in rv], tvecs=[t.ravel() for t in tv])


def project(intr, rvec, tvec, X, nk):
    f, cx, cy = intr[:3]
    k = intr[3:3 + nk]
    R, _ = cv2.Rodrigues(rvec)
    Xc = X @ R.T + tvec
    xn = Xc[:, :2] / Xc[:, 2:3]
    r2 = (xn ** 2).sum(1, keepdims=True)
    d = 1.0 + k[0] * r2 + (k[1] * r2 ** 2 if nk > 1 else 0.0)
    return f * xn * d + np.array([cx, cy]), Xc[:, 2]


def _unpack(p, nv, npt, nk):
    ni = 3 + nk
    intr = p[:ni]
    poses = p[ni:ni + 6 * nv].reshape(nv, 6)
    X = p[ni + 6 * nv:].reshape(npt, 3)
    return intr, poses, X


def _residuals(p, obs, nk):
    nv, npt = obs.shape[0], obs.shape[1]
    intr, poses, X = _unpack(p, nv, npt, nk)
    out = []
    for v in range(nv):
        uv, _ = project(intr, poses[v, :3], poses[v, 3:], X, nk)
        out.append((uv - obs[v]).ravel())
    return np.concatenate(out)


def _sparsity(nv, npt, nk):
    from scipy.sparse import lil_matrix
    ni = 3 + nk
    A = lil_matrix((nv * npt * 2, ni + 6 * nv + 3 * npt), dtype=int)
    for v in range(nv):
        rows = slice(v * npt * 2, (v + 1) * npt * 2)
        A[rows, :ni] = 1
        A[rows, ni + 6 * v:ni + 6 * v + 6] = 1
        for j in range(npt):
            r = v * npt * 2 + 2 * j
            A[r:r + 2, ni + 6 * nv + 3 * j:ni + 6 * nv + 3 * j + 3] = 1
    return A


def init_fronto(obs, size, f0, ref=0):
    """Target-free start: back-project view `ref`'s corners onto the plane z = 1
    of its own camera (pretend the board faces that camera), then PnP every view.
    Uses one image's pixels and the guessed focal length, nothing about the board."""
    K0 = np.array([[f0, 0, size[0] / 2], [0, f0, size[1] / 2], [0, 0, 1.0]])
    xn = (obs[ref] - K0[:2, 2]) / f0
    X = np.column_stack([xn, np.ones(len(xn))])
    poses = []
    for v in range(obs.shape[0]):
        ok, rv, tv = cv2.solvePnP(X, obs[v], K0, None, flags=cv2.SOLVEPNP_ITERATIVE)
        poses.append(np.concatenate([rv.ravel(), tv.ravel()]))
    return X, np.array(poses)


def selfcal(obs, size, f0, nk=1, ref=0):
    """Target-free bundle adjustment. obs: (views, points, 2) pixels.
    Returns dict with intrinsics, sigma (from the normal matrix, residual-variance
    scaled, pseudo-inverse over the 7-dof similarity gauge), rms and the rank found."""
    nv, npt = obs.shape[:2]
    X, poses = init_fronto(obs, size, f0, ref)
    intr = np.array([f0, size[0] / 2, size[1] / 2] + [0.0] * nk)
    p0 = np.concatenate([intr, poses.ravel(), X.ravel()])
    sol = least_squares(_residuals, p0, args=(obs, nk), jac_sparsity=_sparsity(nv, npt, nk),
                        method="trf", x_scale="jac", max_nfev=1000, xtol=1e-12, ftol=1e-12)
    J = sol.jac.toarray()
    r = sol.fun
    dof = len(r) - (len(sol.x) - 7)
    s2 = (r @ r) / dof
    # Column scaling before the pseudo-inverse: f is ~500 px, rotations ~1 rad.
    sc = np.linalg.norm(J, axis=0)
    sc[sc == 0] = 1.0
    Js = J / sc
    U, S, Vt = np.linalg.svd(Js, full_matrices=False)
    tol = S[0] * 1e-9
    keep = S > tol
    gap = S[~keep].max() / S[keep].min() if (~keep).any() else 0.0
    # Drop exactly the 7 smallest (similarity gauge) if the spectrum shows them.
    n_gauge = 7
    Sinv = np.zeros_like(S)
    Sinv[:-n_gauge] = 1.0 / S[:-n_gauge] ** 2
    cov = (Vt.T * Sinv) @ Vt / np.outer(sc, sc) * s2
    ni = 3 + nk
    intr, _, Xs = _unpack(sol.x, nv, npt, nk)
    sd = np.sqrt(np.diag(cov)[:ni])
    names = ["f", "cx", "cy", "k1", "k2"][:ni]
    out = {n: float(v) for n, v in zip(names, intr)}
    out.update({"s" + n: float(v) for n, v in zip(names, sd)})
    out.update(rms=float(np.sqrt((r @ r) / len(r))), cost=float(sol.cost), nfev=int(sol.nfev),
               sv_gauge_ratio=float(S[-n_gauge] / S[-n_gauge - 1]),
               sv_min_kept=float(S[-n_gauge - 1] / S[0]), status=int(sol.status), ref=ref)
    out["planarity"] = planarity(Xs)
    return out


def planarity(X, pattern=PATTERN):
    """Out-of-plane spread of reconstructed board corners, in units of the mean
    spacing between grid neighbours (so it is free of the gauge's scale)."""
    c = X - X.mean(0)
    _, S, Vt = np.linalg.svd(c, full_matrices=False)
    h = c @ Vt[2]
    G = X.reshape(pattern[1], pattern[0], 3)
    sp = np.mean(np.r_[np.linalg.norm(np.diff(G, axis=1), axis=2).ravel(),
                       np.linalg.norm(np.diff(G, axis=0), axis=2).ravel()])
    # The plane normal's sign is a gauge: orient it by the grid's handedness.
    h = h * np.sign(Vt[2] @ np.cross(G[0, -1] - G[0, 0], G[-1, 0] - G[0, 0]))
    return dict(heights=(h / sp).tolist(), rms=float(np.sqrt(np.mean(h ** 2)) / sp), max=float(np.abs(h).max() / sp),
                spacing_cv=float(np.std(np.r_[np.linalg.norm(np.diff(G, axis=1), axis=2).ravel(),
                                              np.linalg.norm(np.diff(G, axis=0), axis=2).ravel()]) / sp))


def selfcal_best(obs, size, f0, nk=1, refs=None):
    """Run from several reference views; keep the lowest-cost solution."""
    refs = range(obs.shape[0]) if refs is None else refs
    best = None
    for ref in refs:
        try:
            s = selfcal(obs, size, f0, nk, ref)
        except Exception:
            continue
        if best is None or s["cost"] < best["cost"]:
            best = s
    return best


# ---------------------------------------------------------------------------
# Milestone 2: gauge-fixed solver with an analytic Jacobian. View `ref`'s pose
# is held at its initial value (rotation and translation: 6 of the 7
# similarity directions; init_fronto puts that camera at the world origin) and
# the depth of corner 0 is held too (the scale). With the gauge removed the
# normal matrix is invertible; intrinsics are gauge-invariant, so their
# covariance equals the pseudo-inverse one milestone 1 used.

def board_normals(rvecs):
    """Board-plane normals in each camera's frame, from target-calibration poses."""
    return np.array([cv2.Rodrigues(np.asarray(r, float))[0][:, 2] for r in rvecs])


def spread_deg(normals):
    """Largest angle between two board normals, in degrees (0 = all planes parallel,
    the planar critical configuration for focal length)."""
    n = normals / np.linalg.norm(normals, axis=1, keepdims=True)
    c = np.clip(n @ n.T, -1, 1)
    return float(np.degrees(np.arccos(c.min())))


def _proj_jac(intr, rvec, tvec, X, nk):
    """Pixels and their analytic derivatives for one view.
    Returns uv (N,2), J_intr (N,2,ni), J_pose (N,2,6) [rvec, tvec], J_X (N,2,3)."""
    f, cx, cy = intr[:3]
    k1 = intr[3]
    k2 = intr[4] if nk > 1 else 0.0
    R, dR = cv2.Rodrigues(np.asarray(rvec, float))  # dR: 3x9, row k = d vec(R) / d rvec_k
    Xc = X @ R.T + tvec
    z = Xc[:, 2]
    xn = Xc[:, :2] / z[:, None]
    r2 = (xn ** 2).sum(1)
    d = 1.0 + k1 * r2 + k2 * r2 ** 2
    dd = k1 + 2 * k2 * r2  # d d / d r2
    uv = f * xn * d[:, None] + np.array([cx, cy])
    N = len(X)
    ni = 3 + nk
    Ji = np.zeros((N, 2, ni))
    Ji[:, :, 0] = xn * d[:, None]
    Ji[:, 0, 1] = 1.0
    Ji[:, 1, 2] = 1.0
    Ji[:, :, 3] = f * xn * r2[:, None]
    if nk > 1:
        Ji[:, :, 4] = f * xn * (r2 ** 2)[:, None]
    # d uv / d xn = f (d I + 2 dd xn xn^T)
    Duv_xn = f * (d[:, None, None] * np.eye(2) + 2 * dd[:, None, None] * xn[:, :, None] * xn[:, None, :])
    Dxn_Xc = np.zeros((N, 2, 3))
    Dxn_Xc[:, 0, 0] = 1 / z
    Dxn_Xc[:, 1, 1] = 1 / z
    Dxn_Xc[:, :, 2] = -xn / z[:, None]
    D = Duv_xn @ Dxn_Xc  # (N,2,3) d uv / d Xc
    JX = D @ R
    dXc_dr = np.stack([X @ dR[k].reshape(3, 3).T for k in range(3)], axis=2)  # (N,3,3)
    Jp = np.concatenate([D @ dXc_dr, D], axis=2)
    return uv, Ji, Jp, JX


def _fun_jac_fixed(p, obs, nk, fixed_pose, ref, want_jac, z0=1.0):
    """Parameters: intrinsics, the free poses, then the 54 points with corner 0's
    depth (its third coordinate) removed and held at z0."""
    from scipy.sparse import csr_matrix
    nv, npt = obs.shape[:2]
    ni = 3 + nk
    intr = p[:ni]
    free = p[ni:ni + 6 * (nv - 1)].reshape(nv - 1, 6)
    poses = np.insert(free, ref, fixed_pose, axis=0)
    X = np.insert(p[ni + 6 * (nv - 1):], 2, z0).reshape(npt, 3)
    res, rows, cols, vals = [], [], [], []
    xoff = ni + 6 * (nv - 1)
    for v in range(nv):
        uv, Ji, Jp, JX = _proj_jac(intr, poses[v, :3], poses[v, 3:], X, nk)
        res.append((uv - obs[v]).ravel())
        if not want_jac:
            continue
        base = v * npt * 2
        r = base + np.arange(npt * 2).reshape(npt, 2)
        rows.append(np.repeat(r.ravel(), ni)); cols.append(np.tile(np.arange(ni), npt * 2)); vals.append(Ji.ravel())
        if v != ref:
            pc = ni + 6 * (v if v < ref else v - 1) + np.arange(6)
            rows.append(np.repeat(r.ravel(), 6)); cols.append(np.tile(pc, npt * 2)); vals.append(Jp.ravel())
        xc = xoff + 3 * np.arange(npt)[:, None, None] + np.arange(3)[None, None, :]
        xc = np.broadcast_to(xc, (npt, 2, 3))
        rows.append(np.repeat(r.ravel(), 3)); cols.append(xc.ravel()); vals.append(JX.ravel())
    if not want_jac:
        return np.concatenate(res)
    J = csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                   shape=(nv * npt * 2, len(p) + 1))
    keep = np.r_[0:xoff + 2, xoff + 3:len(p) + 1]
    return J[:, keep]


def selfcal_fixed_analytic(obs, size, f0, nk=1, ref=0, max_nfev=2000, keep_resid=False):
    """Gauge-fixed target-free BA (same model as selfcal). status 1-4 = converged, 0 = cap."""
    nv, npt = obs.shape[:2]
    X, poses = init_fronto(obs, size, f0, ref)
    ni = 3 + nk
    intr = np.array([f0, size[0] / 2, size[1] / 2] + [0.0] * nk)
    fixed = poses[ref].copy()
    p0 = np.concatenate([intr, np.delete(poses, ref, axis=0).ravel(), np.delete(X.ravel(), 2)])
    args = (obs, nk, fixed, ref)
    # Levenberg-Marquardt on the dense analytic Jacobian (a few hundred columns):
    # converges in ~25 evaluations where milestone 1's trf/lsmr stopped at its cap.
    sol = least_squares(lambda p: _fun_jac_fixed(p, *args, False), p0,
                        jac=lambda p: _fun_jac_fixed(p, *args, True).toarray(), method="lm",
                        max_nfev=max_nfev, xtol=1e-12, ftol=1e-12, gtol=1e-10)
    out = _summarise(sol, ni, nk, ref)
    out.update(robust_sf(np.asarray(sol.jac), sol.fun, nv, npt))
    out["cov_intr_cr_view"] = cov_cr_view(np.asarray(sol.jac), sol.fun, nv, npt, ni).tolist()
    out["planarity"] = planarity(np.insert(sol.x[ni + 6 * (nv - 1):], 2, X[0, 2]).reshape(npt, 3))
    if keep_resid:
        out["resid"] = sol.fun.reshape(nv, npt, 2)
    return out


def robust_sf(J, r, nv, npt):
    """Sandwich (Huber-White) standard deviations of f, the first parameter.

    var f = sum over clusters g of ((J_g b) . r_g)^2, b = (J^T J)^-1 e_f, times the
    small-sample factor G / (G - 1). Residuals are ordered view-major, then corner,
    then (u, v), as in _fun_jac_fixed. Clusters: views ("view"), corners ("point"),
    and each pixel coordinate on its own ("hc0", no small-sample factor)."""
    sc = np.linalg.norm(J, axis=0)
    sc[sc == 0] = 1.0
    Js = J / sc
    e = np.zeros(J.shape[1]); e[0] = 1.0
    b = np.linalg.lstsq(Js.T @ Js, e / sc, rcond=None)[0] / sc   # (J^T J)^-1 e_f
    u = (J @ b) * r                                               # influence of each residual on f
    uv = u.reshape(nv, npt, 2)
    per_view = uv.sum(axis=(1, 2))
    per_point = uv.sum(axis=(0, 2))
    out = dict(sf_cr_view=float(np.sqrt(nv / (nv - 1) * per_view @ per_view)) if nv > 1 else float("nan"),
               sf_cr_point=float(np.sqrt(npt / (npt - 1) * per_point @ per_point)),
               sf_hc0=float(np.sqrt(u @ u)))
    if npt == PATTERN[0] * PATTERN[1]:
        # Milestone 6: clusters of one board column (or row) in one image.
        g = uv.reshape(nv, PATTERN[1], PATTERN[0], 2)
        for name, ax in (("viewcol", (1, 3)), ("viewrow", (2, 3))):
            c = g.sum(axis=ax).ravel()
            G = len(c)
            out["sf_cr_" + name] = float(np.sqrt(G / (G - 1) * c @ c))
    return out


def cov_cr_view(J, r, nv, npt, ni):
    """Milestone 4b: the full sandwich covariance of the first ni parameters (the
    intrinsics), clustered by view, with the small-sample factor G / (G - 1).

    Influence of residual i on parameter j: U[i, j] = (J (J^T J)^-1)[i, j] r_i; the view
    sums s_g = sum over the view's residuals of U, and cov = G/(G-1) sum_g s_g s_g^T.
    The generalisation of robust_sf's sf_cr_view to a matrix (its [0, 0] is sf_cr_view^2)."""
    sc = np.linalg.norm(J, axis=0)
    sc[sc == 0] = 1.0
    Js = J / sc
    E = np.zeros((J.shape[1], ni)); E[np.arange(ni), np.arange(ni)] = 1.0
    B = np.linalg.lstsq(Js.T @ Js, E / sc[:, None], rcond=None)[0] / sc[:, None]   # (J^T J)^-1 E
    U = (J @ B) * r[:, None]
    S = U.reshape(nv, npt * 2, ni).sum(axis=1)
    return (nv / (nv - 1)) * S.T @ S if nv > 1 else np.full((ni, ni), np.nan)


def jackknife_cov(thetas):
    """Milestone 4b: the leave-one-out jackknife covariance (m - 1)/m sum (t_i - mean)(t_i - mean)^T
    of the m delete-one estimates (rows of thetas); rows with a non-finite entry are dropped."""
    a = np.asarray(thetas, float)
    a = a[np.all(np.isfinite(a), axis=1)]
    m = len(a)
    if m < 2:
        return np.full((a.shape[1], a.shape[1]), np.nan)
    d = a - a.mean(axis=0)
    return (m - 1) / m * d.T @ d


def jackknife_sf(obs, size, f0, nk=1, max_nfev=2000):
    """Leave-one-view-out jackknife of f: re-solve without each view in turn (cold start,
    reference view 0 of the remaining set). Returns sigma, the k leave-one-out f values
    and how many of those solves converged."""
    k = obs.shape[0]
    fs, conv = [], 0
    for v in range(k):
        s = selfcal_fixed_best(np.delete(obs, v, axis=0), size, f0, nk, refs=(0,), max_nfev=max_nfev)
        if s is None or not np.isfinite(s["f"]):
            fs.append(float("nan")); continue
        fs.append(s["f"]); conv += s["status"] > 0
    a = np.array(fs)
    ok = np.isfinite(a)
    m = ok.sum()
    sd = float(np.sqrt((m - 1) / m * np.sum((a[ok] - a[ok].mean()) ** 2))) if m > 1 else float("nan")
    return dict(sf_jack=sd, f_loo=fs, loo_converged=int(conv), loo_n=int(k))


def selfcal_fixed_best(obs, size, f0, nk=1, refs=(0,), max_nfev=2000):
    """Run from several reference views; keep the lowest-cost solution."""
    best = None
    for ref in refs:
        try:
            s = selfcal_fixed_analytic(obs, size, f0, nk, ref, max_nfev)
        except Exception:
            continue
        if best is None or s["cost"] < best["cost"]:
            best = s
    return best


def _summarise(sol, ni, nk, ref):
    J = sol.jac.toarray() if hasattr(sol.jac, "toarray") else np.asarray(sol.jac)
    r = sol.fun
    s2 = (r @ r) / (len(r) - len(sol.x))
    sc = np.linalg.norm(J, axis=0)
    sc[sc == 0] = 1.0
    H = (J / sc).T @ (J / sc)
    cov_s = np.linalg.pinv(H, rcond=1e-14, hermitian=True)
    cov = cov_s / np.outer(sc, sc) * s2
    ev = np.linalg.eigvalsh(np.linalg.inv(cov_s[:ni, :ni]))
    sd = np.sqrt(np.diag(cov)[:ni])
    names = ["f", "cx", "cy", "k1", "k2"][:ni]
    out = {n: float(v) for n, v in zip(names, sol.x[:ni])}
    out.update({"s" + n: float(v) for n, v in zip(names, sd)})
    corr = cov[:ni, :ni] / np.outer(sd, sd)
    out.update(rms=float(np.sqrt((r @ r) / len(r))), cost=float(sol.cost), nfev=int(sol.nfev),
               status=int(sol.status), ref=ref, cond_intr=float(ev[-1] / ev[0]),
               corr_f_cx=float(corr[0, 1]), corr_f_cy=float(corr[0, 2]), corr_f_k1=float(corr[0, 3]),
               cond_full=float(np.linalg.cond(H)))
    out["cov_intr"] = cov[:ni, :ni].tolist()   # milestone 4: the full intrinsics covariance
    return out


# ---------------------------------------------------------------------------
# Milestone 5: a bend-aware target reference and residual structure.

def zhang_ro(corners, size, k2=True, fixed_point=None, pattern=PATTERN):
    """Zhang calibration with a released object (Strobl and Hirzinger 2011, OpenCV's
    calibrateCameraRO): the board's corners are refined in 3-D along with the camera;
    corner 0 and corner `fixed_point` (default: last of the first row) keep their
    nominal positions to fix the scale. Same camera model and return keys as zhang(),
    plus the refined board `obj` (N, 3)."""
    fixed_point = pattern[0] - 1 if fixed_point is None else fixed_point
    obj = [board_points(pattern).astype(np.float32)] * len(corners)
    img = [c.astype(np.float32).reshape(-1, 1, 2) for c in corners]
    flags = cv2.CALIB_FIX_ASPECT_RATIO | cv2.CALIB_ZERO_TANGENT_DIST | cv2.CALIB_FIX_K3
    if not k2:
        flags |= cv2.CALIB_FIX_K2
    K0 = np.array([[size[0], 0, size[0] / 2], [0, size[0], size[1] / 2], [0, 0, 1.0]])
    res = cv2.calibrateCameraROExtended(obj, img, size, fixed_point, K0, np.zeros(5), flags=flags)
    rms, K, d, rv, tv, newobj, sdi = res[:7]
    sdi = sdi.ravel()
    newobj = np.asarray(newobj, float).reshape(-1, 3)
    return dict(f=K[0, 0], cx=K[0, 2], cy=K[1, 2], k1=d.ravel()[0], k2=d.ravel()[1],
                sf=max(sdi[0], sdi[1]), scx=sdi[2], scy=sdi[3], sk1=sdi[4], sk2=sdi[5], rms=rms,
                rvecs=[r.ravel() for r in rv], tvecs=[t.ravel() for t in tv], obj=newobj)


def neighbour_corr(resid, pattern=PATTERN):
    """Correlation of the residuals of grid-adjacent corners in the same image.
    resid: (views, points, 2), points in OpenCV's row-major corner order. Pools the
    u and v components over all views; returns horizontal, vertical and both."""
    R = resid.reshape(resid.shape[0], pattern[1], pattern[0], 2)

    def corr(a, b):
        a = a.ravel() - a.mean(); b = b.ravel() - b.mean()
        return float(a @ b / np.sqrt((a @ a) * (b @ b)))
    h = (R[:, :, :-1], R[:, :, 1:])
    v = (R[:, :-1], R[:, 1:])
    both = corr(np.r_[h[0].ravel(), v[0].ravel()], np.r_[h[1].ravel(), v[1].ravel()])
    return dict(horizontal=corr(*h), vertical=corr(*v), both=both,
                horizontal_lag2=corr(R[:, :, :-2], R[:, :, 2:]), vertical_lag2=corr(R[:, :-2], R[:, 2:]),
                vertical_u=corr(R[:, :-1, :, 0], R[:, 1:, :, 0]), vertical_v=corr(R[:, :-1, :, 1], R[:, 1:, :, 1]))


# ---------------------------------------------------------------------------
# Milestone 6: where the column-wise residual correlation lives.

def residual_structure(resid, obs, pattern=PATTERN):
    """resid, obs: (views, points, 2). Share of the residual sum of squares explained by a
    per-(view, board column) mean and a per-(view, board row) mean (null for independent
    noise: 1/rows and 1/cols), and the share of the column means' energy perpendicular to
    each column's line in the image (isotropic: 0.5)."""
    nv = resid.shape[0]
    R = resid.reshape(nv, pattern[1], pattern[0], 2)
    O = obs.reshape(nv, pattern[1], pattern[0], 2)
    tot = float((R ** 2).sum())
    cm = R.mean(axis=1)                       # (views, cols, 2)
    rm = R.mean(axis=2)                       # (views, rows, 2)
    col_share = float(pattern[1] * (cm ** 2).sum() / tot)
    row_share = float(pattern[0] * (rm ** 2).sum() / tot)
    d = O[:, -1] - O[:, 0]                    # each column's direction in the image
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    along = (cm * d).sum(-1)
    perp = cm[..., 0] * -d[..., 1] + cm[..., 1] * d[..., 0]
    perp_share = float((perp ** 2).sum() / ((perp ** 2).sum() + (along ** 2).sum()))
    # the same for row means, against each row's direction
    e = O[:, :, -1] - O[:, :, 0]
    e /= np.linalg.norm(e, axis=-1, keepdims=True)
    ra = (rm * e).sum(-1)
    rp = rm[..., 0] * -e[..., 1] + rm[..., 1] * e[..., 0]
    row_perp = float((rp ** 2).sum() / ((rp ** 2).sum() + (ra ** 2).sum()))
    return dict(col_share=col_share, col_null=1 / pattern[1], row_share=row_share, row_null=1 / pattern[0],
                col_perp_share=perp_share, row_perp_share=row_perp,
                col_mean_rms_px=float(np.sqrt((cm ** 2).sum(-1).mean())))


# ---------------------------------------------------------------------------
# Milestone 4: the accept/reject test for an in-field update.

CHI2_3_99 = 11.344866730144373   # chi-square, 3 degrees of freedom, upper 1%


def disturb_obs(obs, size, s=1.0, du=0.0):
    """Exact model change applied to observed pixels: a focal change by factor s about the
    image centre p (f -> s f, c -> p + s (c - p), k1 unchanged) and a principal-point shift
    of du pixels in u. Both keep the pinhole-plus-radial model closed."""
    p = np.array([size[0] / 2.0, size[1] / 2.0])
    out = p + s * (np.asarray(obs, float) - p)
    out[..., 0] += du
    return out


def disturb_solution(theta, cov, size, s=1.0, du=0.0):
    """The same change applied to a solution (f, cx, cy) and its 3x3 covariance."""
    p = np.array([size[0] / 2.0, size[1] / 2.0])
    f, cx, cy = theta
    t = np.array([s * f, p[0] + s * (cx - p[0]) + du, p[1] + s * (cy - p[1])])
    return t, (s * s) * np.asarray(cov)


def update_test(th_old, cov_old, th_new, cov_new, kappa=1.0, idx=(0, 1, 2)):
    """Chi-square of the change between two independent estimates on the parameters idx."""
    i = list(idx)
    d = np.asarray(th_new, float)[i] - np.asarray(th_old, float)[i]
    C = kappa ** 2 * (np.asarray(cov_old)[np.ix_(i, i)] + np.asarray(cov_new)[np.ix_(i, i)])
    return float(d @ np.linalg.solve(C, d))


def decide(chi2, sf_new, f_new, crit=CHI2_3_99, gate=0.005):
    """keep (no change detected), adopt (detected, new is precise) or flag (detected, imprecise)."""
    if chi2 <= crit:
        return "keep"
    return "adopt" if sf_new / f_new <= gate else "flag"
