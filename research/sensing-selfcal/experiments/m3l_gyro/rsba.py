"""Milestone 3l: a gyro-aided rolling-shutter window bundle adjustment.

The model of milestone 3b's window solve (one focal length f, principal point (cx, cy), radial
k1, k2; a pose per keyframe, keyframe 0 the identity; a 3D point per track) plus a rolling-shutter
term. A point observed at image row v in keyframe i is exposed at

    tau = t_r * (v - H/2) / H                 (v the observed row; H/2 the sensor's middle row)

and lands where the camera is then:

    x_cam = exp([w_i tau]x) (R_i X + t_i) + u_i tau

w_i is the keyframe's angular velocity read from a gyro (camera frame, extrinsic rotation and time
offset taken as known), u_i its linear velocity (free or fixed at 0), t_r the readout time (fixed or
free). Using the observed row, not a fixed point on the predicted one, keeps the residual explicit;
with 0.5 px noise the row-time error is under 1e-6 s. The time origin H/2 differs from the
generator's c_y; for a constant w the difference is a rotation the keyframe's pose absorbs.

Solved by robust Levenberg-Marquardt with a Schur complement on the points (soft-L1 at 1 px), the
scheme of milestone 3b's nfba.bundle, with per-observation central-difference derivatives. Gauge as milestone 3b's `nfba.Problem`: keyframe 0 fixed and one
translation component of the widest keyframe held at its start.
"""
import numpy as np
NI = 5
LOSS = 1.0          # px, soft-L1 knee (milestone 3b)


def rodrigues(rv, X):
    """Rotate X (n,3) by per-row rotation vectors rv (n,3)."""
    th = np.linalg.norm(rv, axis=1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        k = np.where(th > 1e-15, rv / th, 0.0)
    c, s = np.cos(th), np.sin(th)
    return X * c + np.cross(k, X) * s + k * (k * X).sum(1, keepdims=True) * (1 - c)


def project(intr, rv, tv, X, w, u, tau):
    """Per-observation rolling-shutter projection. All arrays per observation; tau (n,)."""
    f, cx, cy, k1, k2 = intr
    Xc = rodrigues(rv, X) + tv
    Xc = rodrigues(w * tau[:, None], Xc) + u * tau[:, None]
    xn = Xc[:, :2] / Xc[:, 2:3]
    r2 = (xn ** 2).sum(1, keepdims=True)
    return f * xn * (1 + k1 * r2 + k2 * r2 ** 2) + np.array([cx, cy])


class Window:
    """vi, pi, uv: observations; nv keyframes, npt points; tv0 the starting translations (gauge);
    gyro (nv,3): measured angular velocities; est_tr / est_u: whether t_r and the u_i are free."""

    def __init__(self, vi, pi, uv, nv, npt, tv0, gyro, t_r, H=480, est_tr=False, est_u=False):
        self.vi, self.pi, self.uv, self.nv, self.npt, self.H = vi, pi, uv, nv, npt, H
        self.gyro, self.t_r0, self.est_tr, self.est_u = np.asarray(gyro, float), float(t_r), est_tr, est_u
        self.row = (uv[:, 1] - H / 2) / H
        self.ncam = NI + 6 * (nv - 1)
        self.nx = 3 * npt
        self.nfull = self.ncam + self.nx + int(est_tr) + (3 * nv if est_u else 0)
        g = int(np.argmax(np.linalg.norm(tv0, axis=1)))
        c = int(np.argmax(np.abs(tv0[g])))
        self.jfix = NI + 3 * (nv - 1) + 3 * (g - 1) + c
        self.fixval = float(tv0[g, c])

    def obs_jac(self, intr, rv, tv, X, t_r, u, h=1e-6):
        """Central differences on the observation-level inputs. Returns Jc (n,2,nfc) over the camera
        block [intr, t_r?, rv 1.., tv 1.., u 0..?] with the gauge column removed, and Jx (n,2,3)."""
        vi, pi, nv = self.vi, self.pi, self.nv
        R, T, P, Wg, U = rv[vi], tv[vi], X[pi], self.gyro[vi], u[vi]
        row = self.row
        n = len(vi)

        def pr(intr=intr, R=R, T=T, P=P, U=U, t_r=t_r):
            return project(intr, R, T, P, Wg, U, t_r * row)

        Ji = np.empty((n, 2, NI))
        for j in range(NI):
            e = np.zeros(NI); hj = h * max(1.0, abs(intr[j])); e[j] = hj
            Ji[:, :, j] = (pr(intr=intr + e) - pr(intr=intr - e)) / (2 * hj)
        Jr, Jt, Ju, Jx = (np.empty((n, 2, 3)) for _ in range(4))
        for j in range(3):
            e = np.zeros(3); e[j] = h
            Jr[:, :, j] = (pr(R=R + e) - pr(R=R - e)) / (2 * h)
            Jt[:, :, j] = (pr(T=T + e) - pr(T=T - e)) / (2 * h)
            Jx[:, :, j] = (pr(P=P + e) - pr(P=P - e)) / (2 * h)
            if self.est_u:
                Ju[:, :, j] = (pr(U=U + e) - pr(U=U - e)) / (2 * h)
        o_tr = NI
        o_r = NI + int(self.est_tr)
        o_t = o_r + 3 * (nv - 1)
        o_u = o_t + 3 * (nv - 1)
        nfc = o_u + (3 * nv if self.est_u else 0)
        Jc = np.zeros((n, 2, nfc))
        Jc[:, :, :NI] = Ji
        if self.est_tr:
            ht = 1e-7
            Jc[:, :, o_tr] = (pr(t_r=t_r + ht) - pr(t_r=t_r - ht)) / (2 * ht)
        idx = np.nonzero(vi > 0)[0]
        for j in range(3):
            Jc[idx, :, o_r + 3 * (vi[idx] - 1) + j] = Jr[idx, :, j]
            Jc[idx, :, o_t + 3 * (vi[idx] - 1) + j] = Jt[idx, :, j]
            if self.est_u:
                Jc[np.arange(n), :, o_u + 3 * vi + j] = Ju[:, :, j]
        # gauge column: the held translation component, in this layout
        g = self.jfix - (NI + 3 * (nv - 1))           # 3 * (kf - 1) + axis
        jfix_c = o_t + g
        keep = np.array([j for j in range(nfc) if j != jfix_c])
        return Jc[:, :, keep], Jx

    # camera-block <-> q layout: q = [camera block (gauge removed), points]
    def to_q(self, intr, rv, tv, X, t_r, u):
        cam = [intr]
        if self.est_tr:
            cam.append([t_r])
        tvf = tv[1:].ravel().copy()
        g = self.jfix - (NI + 3 * (self.nv - 1))
        tvf = np.delete(tvf, g)
        cam += [rv[1:].ravel(), tvf]
        if self.est_u:
            cam.append(u.ravel())
        return np.concatenate(cam), X.ravel().copy()

    def from_q(self, c, x):
        nv = self.nv
        o = 0
        intr = c[:NI]; o = NI
        t_r = self.t_r0
        if self.est_tr:
            t_r = c[o]; o += 1
        rv = np.vstack([np.zeros(3), c[o:o + 3 * (nv - 1)].reshape(-1, 3)]); o += 3 * (nv - 1)
        g = self.jfix - (NI + 3 * (nv - 1))
        tvf = np.insert(c[o:o + 3 * (nv - 1) - 1], g, self.fixval); o += 3 * (nv - 1) - 1
        tv = np.vstack([np.zeros(3), tvf.reshape(-1, 3)])
        u = c[o:o + 3 * nv].reshape(-1, 3) if self.est_u else np.zeros((nv, 3))
        return intr, rv, tv, x.reshape(-1, 3), t_r, u

    def res(self, intr, rv, tv, X, t_r, u):
        vi, pi = self.vi, self.pi
        return project(intr, rv[vi], tv[vi], X[pi], self.gyro[vi], u[vi], t_r * self.row) - self.uv

    def blocks(self, c, x):
        intr, rv, tv, X, t_r, u = self.from_q(c, x)
        r = self.res(intr, rv, tv, X, t_r, u)
        r2 = (r ** 2).sum(1)
        w = 1.0 / np.sqrt(1.0 + r2 / LOSS ** 2)
        Jc, Jx = self.obs_jac(intr, rv, tv, X, t_r, u)
        sw = np.sqrt(w)[:, None, None]
        Jc_w, Jx_w, r_w = Jc * sw, Jx * sw, r * np.sqrt(w)[:, None]
        U = np.einsum("kai,kaj->ij", Jc_w, Jc_w)
        gc = np.einsum("kai,ka->i", Jc_w, r_w)
        npt, pi, nc = self.npt, self.pi, Jc.shape[2]
        Wp = np.zeros((npt, nc, 3)); np.add.at(Wp, pi, np.einsum("kai,kaj->kij", Jc_w, Jx_w))
        V = np.zeros((npt, 3, 3)); np.add.at(V, pi, np.einsum("kai,kaj->kij", Jx_w, Jx_w))
        gp = np.zeros((npt, 3)); np.add.at(gp, pi, np.einsum("kai,ka->ki", Jx_w, r_w))
        return U, Wp, V, gc, gp, r2, w

    def cost(self, c, x):
        r = self.res(*self.from_q(c, x))
        r2 = (r ** 2).sum(1)
        return float((2.0 * LOSS ** 2 * (np.sqrt(1.0 + r2 / LOSS ** 2) - 1.0)).sum())

    def solve(self, intr0, rv0, tv0, X0, t_r0=None, max_iter=300, tol=1e-9):
        """Robust (soft-L1, 1 px knee) Levenberg-Marquardt with a Schur complement on the points,
        as milestone 3b's nfba.bundle. status 1: relative cost decrease below tol; 2: no further
        decrease found; 0: iteration cap."""
        t_r = self.t_r0 if t_r0 is None else t_r0
        c, x = self.to_q(np.asarray(intr0, float), rv0, tv0, X0, t_r, np.zeros((self.nv, 3)))
        cost = self.cost(c, x)
        lam, it, status = 1e-3, 0, 0
        while it < max_iter:
            it += 1
            U, Wp, V, gc, gp, _, _ = self.blocks(c, x)
            while True:
                try:
                    dc, dp = schur_solve(U, Wp, V, gc, gp, lam)
                except np.linalg.LinAlgError:
                    lam *= 10
                    continue
                cn, xn = c + dc, x + dp.ravel()
                cn_cost = self.cost(cn, xn)
                if np.isfinite(cn_cost) and cn_cost < cost:
                    rel = (cost - cn_cost) / cost
                    c, x, cost = cn, xn, cn_cost
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
        intr, rv, tv, X, t_r, u = self.from_q(c, x)
        U, Wp, V, gc, gp, r2, w = self.blocks(c, x)
        Vi = np.linalg.pinv(V)
        S = U - np.einsum("kil,klm,kjm->ij", Wp, Vi, Wp)
        dof = max(2 * len(r2) - len(c) - len(x), 1)
        C = np.linalg.pinv(S) * float((w * r2).sum() / dof)
        return {"status": status, "iters": it, "intr": intr.tolist(), "t_r": float(t_r),
                "sd_f": float(np.sqrt(max(C[0, 0], 0))),
                "sd_tr": float(np.sqrt(max(C[NI, NI], 0))) if self.est_tr else float("nan"),
                "rms_px": float(np.sqrt((r2).mean() / 2)), "cost": cost,
                "u": u.tolist() if self.est_u else None}


def schur_solve(U, Wp, V, gc, gp, lam):
    """milestone 3b's damped Schur step (nfba.schur_solve)."""
    Ud = U + lam * np.diag(np.diag(U)) + 1e-12 * np.eye(len(U))
    Vd = V + lam * np.einsum("kii->ki", V)[:, :, None] * np.eye(3)[None] + 1e-12 * np.eye(3)[None]
    Vi = np.linalg.inv(Vd)
    WVi = np.einsum("kij,kjl->kil", Wp, Vi)
    S = Ud - np.einsum("kil,kjl->ij", WVi, Wp)
    rhs = -gc + np.einsum("kil,kl->i", WVi, gp)
    dc = np.linalg.solve(S, rhs)
    dp = -np.einsum("kij,kj->ki", Vi, gp + np.einsum("kji,j->ki", Wp, dc))
    return dc, dp
