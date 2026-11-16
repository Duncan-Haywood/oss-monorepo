"""Milestone 3b: target-free self-calibration from natural-feature tracks (SIFT) on real video.

The board milestones (1-4r) give the solver the board's corners as correspondences. Here the
correspondences are SIFT features tracked across keyframes of a TUM RGB-D sequence (no board in
view), with mismatches and a looser localisation, so the bundle adjustment has to cope with outliers
and points seen in only some views.

Camera model as ../../src/selfcal.py: fx = fy = f, principal point (cx, cy), radial distortion
1 + k1 r^2 + k2 r^4 on normalised coordinates. Unknowns: the 5 intrinsics, a pose per keyframe
(Rodrigues rotation, translation) and a 3D point per track. Gauge: the first keyframe's pose is
fixed at the identity and the scale by holding the largest translation component of the keyframe
farthest from the first (at the start) at its starting value (`Problem`).

Pipeline per window of keyframes:
  features -> pairwise matches (ratio test, then a RANSAC fundamental matrix) -> tracks (union-find,
  one feature per view, >= 3 views) -> initial poses (essential matrix of the widest pair at the
  starting f0, then PnP) -> robust BA (soft-L1, 1 px) over everything -> covariance of the
  intrinsics (Schur complement of the robust-weighted Gauss-Newton matrix).
"""
import numpy as np
import cv2
from scipy import sparse

NK = 2
NI = 3 + NK
LOSS_SCALE = 1.0          # px, soft-L1 knee
RATIO = 0.75              # Lowe ratio test
F_RANSAC_PX = 2.0         # epipolar inlier threshold (px) in the fundamental-matrix RANSAC
MIN_TRACK = 3


# ---------------------------------------------------------------- camera
def project(intr, rvecs, tvecs, X):
    """Project points X (n,3) through per-observation poses (n,3), (n,3). Returns (n,2) and depth."""
    f, cx, cy, k1, k2 = intr
    th = np.linalg.norm(rvecs, axis=1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        k = np.where(th > 1e-12, rvecs / th, 0.0)
    c, s = np.cos(th), np.sin(th)
    # Rodrigues: R X = X c + (k x X) s + k (k.X)(1 - c)
    Xr = X * c + np.cross(k, X) * s + k * (k * X).sum(1, keepdims=True) * (1 - c)
    Xc = Xr + tvecs
    z = Xc[:, 2:3]
    xn = Xc[:, :2] / z
    r2 = (xn ** 2).sum(1, keepdims=True)
    d = 1.0 + k1 * r2 + k2 * r2 ** 2
    return f * xn * d + np.array([cx, cy]), z[:, 0]


def undistort_px(uv, intr, iters=20):
    """Pixel -> normalised undistorted coordinates under the model (fixed-point inversion)."""
    f, cx, cy, k1, k2 = intr
    xd = (uv - np.array([cx, cy])) / f
    xn = xd.copy()
    for _ in range(iters):
        r2 = (xn ** 2).sum(1, keepdims=True)
        xn = xd / (1.0 + k1 * r2 + k2 * r2 ** 2)
    return xn


# ---------------------------------------------------------------- features and tracks
def features(gray, n=4000):
    sift = cv2.SIFT_create(nfeatures=n, contrastThreshold=0.02)
    kp, des = sift.detectAndCompute(gray, None)
    pts = np.array([k.pt for k in kp], dtype=np.float64).reshape(-1, 2)
    return pts, des


def match_pair(fa, fb):
    """Ratio-test matches, then a RANSAC fundamental matrix. Returns (ia, ib) index arrays."""
    pa, da = fa
    pb, db = fb
    if da is None or db is None or len(pa) < 8 or len(pb) < 8:
        return np.zeros(0, int), np.zeros(0, int)
    m = cv2.BFMatcher(cv2.NORM_L2).knnMatch(da, db, k=2)
    good = [x[0] for x in m if len(x) == 2 and x[0].distance < RATIO * x[1].distance]
    if len(good) < 15:
        return np.zeros(0, int), np.zeros(0, int)
    ia = np.array([g.queryIdx for g in good])
    ib = np.array([g.trainIdx for g in good])
    F, mask = cv2.findFundamentalMat(pa[ia], pb[ib], cv2.FM_RANSAC, F_RANSAC_PX, 0.999, 5000)
    if F is None or mask is None:
        return np.zeros(0, int), np.zeros(0, int)
    keep = mask.ravel().astype(bool)
    return ia[keep], ib[keep]


def build_tracks(feats, pairs):
    """Union-find over (view, feature) nodes linked by pairwise matches. Keeps tracks with
    >= MIN_TRACK views and exactly one feature per view. Returns list of {view: feature index}."""
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for (va, vb), (ia, ib) in pairs.items():
        for a, b in zip(ia, ib):
            ra, rb = find((va, int(a))), find((vb, int(b)))
            if ra != rb:
                parent[ra] = rb
    groups = {}
    for node in list(parent):
        groups.setdefault(find(node), []).append(node)
    tracks = []
    for nodes in groups.values():
        views = [v for v, _ in nodes]
        if len(set(views)) != len(views) or len(views) < MIN_TRACK:
            continue
        tracks.append({v: i for v, i in nodes})
    return tracks


def observations(feats, tracks):
    """Flatten tracks into arrays: view index, point index, observed pixel (n,2)."""
    vi, pi, uv = [], [], []
    for p, t in enumerate(tracks):
        for v, i in t.items():
            vi.append(v)
            pi.append(p)
            uv.append(feats[v][0][i])
    return np.array(vi), np.array(pi), np.array(uv, dtype=np.float64)


# ---------------------------------------------------------------- initialisation
def initialise(vi, pi, uv, nv, npt, intr0):
    """Poses and points at intr0: essential matrix between view 0 and the view sharing most points
    with the widest median flow, triangulate, then PnP each other view and triangulate new points."""
    xn = undistort_px(uv, intr0)
    K = np.eye(3)
    obs = {}
    for k in range(len(vi)):
        obs.setdefault(int(pi[k]), {})[int(vi[k])] = xn[k]
    # choose partner of view 0: largest median parallax among views sharing >= 50 points
    best, best_par = None, -1
    for v in range(1, nv):
        common = [p for p, o in obs.items() if 0 in o and v in o]
        if len(common) < 50:
            continue
        par = np.median([np.linalg.norm(obs[p][0] - obs[p][v]) for p in common])
        if par > best_par:
            best, best_par = v, par
    if best is None:
        return None
    common = [p for p, o in obs.items() if 0 in o and best in o]
    a = np.array([obs[p][0] for p in common])
    b = np.array([obs[p][best] for p in common])
    E, mask = cv2.findEssentialMat(a, b, K, cv2.RANSAC, 0.999, 1.5 / intr0[0])
    if E is None or E.shape != (3, 3):
        return None
    _, R, t, mask2 = cv2.recoverPose(E, a, b, K, mask=mask)
    rv = np.zeros((nv, 3))
    tv = np.zeros((nv, 3))
    known = np.zeros(nv, bool)
    known[0] = True
    rv[best] = cv2.Rodrigues(R)[0].ravel()
    tv[best] = t.ravel()
    known[best] = True
    X = np.full((npt, 3), np.nan)

    def triangulate(p):
        vs = [v for v in obs[p] if known[v]]
        if len(vs) < 2:
            return
        A = []
        for v in vs:
            Rv = cv2.Rodrigues(rv[v])[0]
            P = np.hstack([Rv, tv[v][:, None]])
            x, y = obs[p][v]
            A.append(x * P[2] - P[0])
            A.append(y * P[2] - P[1])
        _, _, Vt = np.linalg.svd(np.array(A))
        Xh = Vt[-1]
        if abs(Xh[3]) < 1e-12:
            return
        Xp = Xh[:3] / Xh[3]
        for v in vs:   # cheirality
            Rv = cv2.Rodrigues(rv[v])[0]
            if (Rv @ Xp + tv[v])[2] <= 0:
                return
        X[p] = Xp

    for p in obs:
        triangulate(p)
    order = sorted(range(nv), key=lambda v: abs(v - best))
    for _ in range(2):
        for v in order:
            if known[v]:
                continue
            ps = [p for p in obs if v in obs[p] and np.isfinite(X[p, 0])]
            if len(ps) < 12:
                continue
            obj = X[ps]
            img = np.array([obs[p][v] for p in ps])
            ok, r, t, inl = cv2.solvePnPRansac(obj, img, K, None, reprojectionError=2.0 / intr0[0],
                                               iterationsCount=500, flags=cv2.SOLVEPNP_EPNP)
            if not ok or inl is None or len(inl) < 12:
                continue
            rv[v], tv[v] = r.ravel(), t.ravel()
            known[v] = True
            for p in obs:
                if v in obs[p] and not np.isfinite(X[p, 0]):
                    triangulate(p)
    if not known.all():
        return None
    return rv, tv, X


# ---------------------------------------------------------------- bundle adjustment
# Parameters: 5 intrinsics, (rvec, tvec) of keyframes 1..nv-1, 3 per point. Keyframe 0 is the
# identity. Scale gauge: one translation component of the farthest keyframe (largest at the start) is held
# at its starting value, so the free vector has 7 fewer entries than the full model.

class Problem:
    def __init__(self, vi, pi, uv, nv, npt, tv):
        self.vi, self.pi, self.uv, self.nv, self.npt = vi, pi, uv, nv, npt
        self.nfull = NI + 6 * (nv - 1) + 3 * npt
        g = int(np.argmax(np.linalg.norm(tv, axis=1)))          # widest-baseline keyframe
        c = int(np.argmax(np.abs(tv[g])))
        self.jfix = NI + 3 * (nv - 1) + 3 * (g - 1) + c
        self.free = np.array([j for j in range(self.nfull) if j != self.jfix])
        self.fixval = float(tv[g, c])

    def full(self, q):
        p = np.empty(self.nfull)
        p[self.free] = q
        p[self.jfix] = self.fixval
        return p

    def unpack(self, q):
        p = self.full(q)
        nv, npt = self.nv, self.npt
        intr = p[:NI]
        o = NI
        rv = np.vstack([np.zeros(3), p[o:o + 3 * (nv - 1)].reshape(nv - 1, 3)])
        o += 3 * (nv - 1)
        tv = np.vstack([np.zeros(3), p[o:o + 3 * (nv - 1)].reshape(nv - 1, 3)])
        o += 3 * (nv - 1)
        return intr, rv, tv, p[o:].reshape(npt, 3)

    def pack(self, intr, rv, tv, X):
        p = np.concatenate([intr, rv[1:].ravel(), tv[1:].ravel(), X.ravel()])
        return p[self.free]

    def residuals(self, q):
        intr, rv, tv, X = self.unpack(q)
        pr, _ = project(intr, rv[self.vi], tv[self.vi], X[self.pi])
        return (pr - self.uv).ravel()

    def sparsity(self):
        vi, pi, nv = self.vi, self.pi, self.nv
        n = len(vi)
        rows, cols = [], []
        sel = vi > 0
        for d in range(2):
            r = 2 * np.arange(n) + d
            for j in range(NI):
                rows.append(r); cols.append(np.full(n, j))
            for j in range(3):
                rows.append(r[sel]); cols.append(NI + 3 * (vi[sel] - 1) + j)
                rows.append(r[sel]); cols.append(NI + 3 * (nv - 1) + 3 * (vi[sel] - 1) + j)
                rows.append(r); cols.append(NI + 6 * (nv - 1) + 3 * pi + j)
        rows, cols = np.concatenate(rows), np.concatenate(cols)
        A = sparse.csr_matrix((np.ones(len(rows), np.int8), (rows, cols)), shape=(2 * n, self.nfull))
        return A[:, self.free]


def obs_jac(intr, rv, tv, X, vi, pi, h=1e-6):
    """Per-observation derivatives of the projection by central differences on the
    observation-level inputs (the model is per observation, so 14 vectorised calls suffice).
    Returns Ji (n,2,5), Jpose (n,2,6) [rvec, tvec], Jx (n,2,3)."""
    R, T, P = rv[vi], tv[vi], X[pi]
    n = len(vi)
    Ji = np.empty((n, 2, NI))
    for j in range(NI):
        e = np.zeros(NI); hj = h * max(1.0, abs(intr[j])); e[j] = hj
        Ji[:, :, j] = (project(intr + e, R, T, P)[0] - project(intr - e, R, T, P)[0]) / (2 * hj)
    Jp = np.empty((n, 2, 6))
    Jx = np.empty((n, 2, 3))
    for j in range(3):
        e = np.zeros(3); e[j] = h
        Jp[:, :, j] = (project(intr, R + e, T, P)[0] - project(intr, R - e, T, P)[0]) / (2 * h)
        Jp[:, :, 3 + j] = (project(intr, R, T + e, P)[0] - project(intr, R, T - e, P)[0]) / (2 * h)
        Jx[:, :, j] = (project(intr, R, T, P + e)[0] - project(intr, R, T, P - e)[0]) / (2 * h)
    return Ji, Jp, Jx


def robust_cost(r2):
    return float((2.0 * LOSS_SCALE ** 2 * (np.sqrt(1.0 + r2 / LOSS_SCALE ** 2) - 1.0)).sum())


def robust_weights(r2):
    """IRLS weights of soft-L1 at squared residual norms per observation (per coordinate pair)."""
    return 1.0 / np.sqrt(1.0 + r2 / LOSS_SCALE ** 2)


def normal_blocks(prob, q, lam=0.0):
    """IRLS Gauss-Newton blocks with the points' 3x3 blocks kept separate.
    Returns U (nc,nc), Wp (npt,nc,3), V (npt,3,3), gc (nc), gp (npt,3), r2 (n), w (n)."""
    intr, rv, tv, X = prob.unpack(q)
    vi, pi, nv, npt = prob.vi, prob.pi, prob.nv, prob.npt
    pr, _ = project(intr, rv[vi], tv[vi], X[pi])
    r = pr - prob.uv
    r2 = (r ** 2).sum(1)
    w = robust_weights(r2)
    Ji, Jp, Jx = obs_jac(intr, rv, tv, X, vi, pi)
    n = len(vi)
    nfc = NI + 6 * (nv - 1)            # full camera columns (before the scale gauge)
    Jc = np.zeros((n, 2, nfc))
    Jc[:, :, :NI] = Ji
    s = vi > 0
    # scatter pose columns (rvec block then tvec block, as in Problem's layout)
    idx = np.nonzero(s)[0]
    for j in range(3):
        Jc[idx, :, NI + 3 * (vi[idx] - 1) + j] = Jp[idx, :, j]
        Jc[idx, :, NI + 3 * (nv - 1) + 3 * (vi[idx] - 1) + j] = Jp[idx, :, 3 + j]
    keep = np.array([j for j in range(nfc) if j != prob.jfix])
    Jc = Jc[:, :, keep]
    sw = np.sqrt(w)[:, None, None]
    Jc_w, Jx_w, r_w = Jc * sw, Jx * sw, r * np.sqrt(w)[:, None]
    U = np.einsum("kai,kaj->ij", Jc_w, Jc_w)
    gc = np.einsum("kai,ka->i", Jc_w, r_w)
    Wk = np.einsum("kai,kaj->kij", Jc_w, Jx_w)
    Vk = np.einsum("kai,kaj->kij", Jx_w, Jx_w)
    gk = np.einsum("kai,ka->ki", Jx_w, r_w)
    Wp = np.zeros((npt, len(keep), 3)); np.add.at(Wp, pi, Wk)
    V = np.zeros((npt, 3, 3)); np.add.at(V, pi, Vk)
    gp = np.zeros((npt, 3)); np.add.at(gp, pi, gk)
    return U, Wp, V, gc, gp, r2, w


def schur_solve(U, Wp, V, gc, gp, lam):
    Ud = U + lam * np.diag(np.diag(U)) + 1e-12 * np.eye(len(U))
    Vd = V + lam * np.einsum("kii->ki", V)[:, :, None] * np.eye(3)[None] + 1e-12 * np.eye(3)[None]
    Vi = np.linalg.inv(Vd)
    WVi = np.einsum("kij,kjl->kil", Wp, Vi)
    S = Ud - np.einsum("kil,kjl->ij", WVi, Wp)
    rhs = -gc + np.einsum("kil,kl->i", WVi, gp)
    dc = np.linalg.solve(S, rhs)
    dp = -np.einsum("kij,kj->ki", Vi, gp + np.einsum("kji,j->ki", Wp, dc))
    return dc, dp


def bundle(prob, intr0, rv, tv, X, max_iter=400, tol=1e-7, trace=None):
    """Robust (soft-L1, 1 px knee) Levenberg-Marquardt with iteratively reweighted Gauss-Newton
    steps and a Schur complement on the points. Returns (info dict, (intr, rv, tv, X), q)."""
    q = prob.pack(np.asarray(intr0, float), rv, tv, X)
    nc = NI + 6 * (prob.nv - 1) - 1

    def cost(q):
        return robust_cost((prob.residuals(q).reshape(-1, 2) ** 2).sum(1))

    c = cost(q)
    lam, it, status = 1e-3, 0, 0
    while it < max_iter:
        it += 1
        U, Wp, V, gc, gp, _, _ = normal_blocks(prob, q)
        while True:
            try:
                dc, dp = schur_solve(U, Wp, V, gc, gp, lam)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            dq = np.concatenate([dc, dp.ravel()])
            qn = q + dq
            cn = cost(qn)
            if np.isfinite(cn) and cn < c:
                rel = (c - cn) / c
                q, c = qn, cn
                lam = max(lam / 3, 1e-9)
                if trace is not None:
                    trace.append((c, float(q[0]), lam))
                break
            lam *= 10
            if lam > 1e12:
                break
        if lam > 1e12:
            status = 2   # no further decrease found: at a minimum to working precision
            break
        if rel < tol:
            status = 1
            break
    return {"status": status, "iters": it, "cost": c}, prob.unpack(q), q


def intr_cov(prob, q):
    """Covariance of the 5 intrinsics from the IRLS-weighted Gauss-Newton matrix at the solution,
    points eliminated by Schur complement (gauge fixed by the parametrisation).
    sigma^2 = weighted SSR / dof. Returns (cov 5x5, sigma, inlier rms px, inlier fraction),
    inlier = residual norm < 3 px."""
    U, Wp, V, gc, gp, r2, w = normal_blocks(prob, q)
    Vi = np.linalg.pinv(V)
    S = U - np.einsum("kil,klm,kjm->ij", Wp, Vi, Wp)
    dof = 2 * len(r2) - len(q)
    sig2 = float((w * r2).sum() / max(dof, 1))
    cov = np.linalg.pinv(S)[:NI, :NI] * sig2
    inl = r2 < (3 * LOSS_SCALE) ** 2
    rms_in = float(np.sqrt(r2[inl].mean() / 2)) if inl.any() else float("nan")
    return cov, float(np.sqrt(sig2)), rms_in, float(inl.mean())


def solve_window(feats, size, f0, pair_gap=(1, 2, 3)):
    """Full pipeline on one window. feats: list of (pts, des) per keyframe. Returns dict or None."""
    nv = len(feats)
    pairs = {}
    for g in pair_gap:
        for a in range(nv - g):
            pairs[(a, a + g)] = match_pair(feats[a], feats[a + g])
    tracks = build_tracks(feats, pairs)
    if len(tracks) < 100:
        return {"status": "few_tracks", "n_tracks": len(tracks)}
    vi, pi, uv = observations(feats, tracks)
    npt = len(tracks)
    intr0 = np.array([f0, size[0] / 2.0, size[1] / 2.0, 0.0, 0.0])
    init = initialise(vi, pi, uv, nv, npt, intr0)
    if init is None:
        return {"status": "init_failed", "n_tracks": npt}
    rv, tv, X = init
    good = np.isfinite(X[:, 0])
    # drop tracks that never triangulated
    if not good.all():
        remap = -np.ones(npt, int)
        remap[good] = np.arange(good.sum())
        sel = good[pi]
        vi, pi, uv = vi[sel], remap[pi[sel]], uv[sel]
        X = X[good]
        npt = int(good.sum())
    prob = Problem(vi, pi, uv, nv, npt, tv)
    info, (intr, rv, tv, X), q = bundle(prob, intr0, rv, tv, X)
    cov, sig, rms_in, inl = intr_cov(prob, q)
    nobs = len(vi)
    return {"status": "ok" if info["status"] > 0 else "maxiter", "n_tracks": npt, "n_obs": nobs,
            "intr": intr.tolist(), "sd": np.sqrt(np.diag(cov)).tolist(), "cov": cov.tolist(),
            "sigma": sig, "rms_inlier": rms_in, "inlier_frac": inl, "iters": info["iters"], "cost": info["cost"],
            "rv": rv.tolist(), "tv": tv.tolist(),
            "data": (vi, pi, uv, X)}
