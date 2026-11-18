"""Milestone 3o: milestone 3l's rolling-shutter window solve with the gyro-camera time offset free.

rsba.Window takes one angular velocity per keyframe as given. Here the gyro is a sampled signal
g(s) (sample times s, rates in the camera frame) and keyframe i, stamped t_i by the camera, reads

    w_i(delta) = g(t_i - delta)        (linear interpolation per axis)

For milestone 3m's fault, a gyro that reads g(s) = w(s + delta_true) at its stamp s, the right value
is delta = delta_true: w_i = w(t_i - delta + delta_true). delta is
one more camera-block parameter, last in the layout, its Jacobian column a central difference in
delta through the interpolation. Everything else (layout, gauge, robust LM, covariance) is
rsba.Window's, and with est_delta False the solve is rsba.Window's to rounding (tests/test_m3o.py).
"""
import os, sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m3l_gyro"))
import rsba  # noqa: E402

HD = 1e-5     # s, central-difference step in delta (a 200 Hz sample is 5e-3 s)


def interp(gs, gw, t):
    t = np.atleast_1d(t)
    return np.stack([np.interp(t, gs, gw[:, j]) for j in range(3)], 1)


class TWindow(rsba.Window):
    def __init__(self, vi, pi, uv, nv, npt, tv0, gyro_s, gyro_w, kf_t, t_r, H=480,
                 est_tr=False, est_delta=False, delta0=0.0, est_u=False):
        self.gs, self.gw, self.kf_t = np.asarray(gyro_s, float), np.asarray(gyro_w, float), np.asarray(kf_t, float)
        self.est_delta, self.delta = est_delta, float(delta0)
        super().__init__(vi, pi, uv, nv, npt, tv0, self.rates(delta0), t_r, H, est_tr, est_u)
        self.nfull += int(est_delta)

    def rates(self, delta):
        return interp(self.gs, self.gw, self.kf_t - delta)

    def to_q(self, intr, rv, tv, X, t_r, u):
        c, x = super().to_q(intr, rv, tv, X, t_r, u)
        return (np.r_[c, self.delta] if self.est_delta else c), x

    def from_q(self, c, x):
        if self.est_delta:
            self.delta = float(c[-1])
            c = c[:-1]
        self.gyro = self.rates(self.delta)
        return super().from_q(c, x)

    def obs_jac(self, intr, rv, tv, X, t_r, u, h=1e-6):
        Jc, Jx = super().obs_jac(intr, rv, tv, X, t_r, u, h)
        if not self.est_delta:
            return Jc, Jx
        vi = self.vi
        tau = t_r * self.row
        pp = rsba.project(intr, rv[vi], tv[vi], X[self.pi], self.rates(self.delta + HD)[vi], u[vi], tau)
        pm = rsba.project(intr, rv[vi], tv[vi], X[self.pi], self.rates(self.delta - HD)[vi], u[vi], tau)
        return np.concatenate([Jc, ((pp - pm) / (2 * HD))[:, :, None]], 2), Jx

    def solve(self, intr0, rv0, tv0, X0, t_r0=None, max_iter=300, tol=1e-9):
        """rsba.Window.solve's loop (copied so the final state and covariance are kept), plus delta."""
        t_r = self.t_r0 if t_r0 is None else t_r0
        c, x = self.to_q(np.asarray(intr0, float), rv0, tv0, X0, t_r, np.zeros((self.nv, 3)))
        cost = self.cost(c, x)
        lam, it, status = 1e-3, 0, 0
        while it < max_iter:
            it += 1
            U, Wp, V, gc, gp, _, _ = self.blocks(c, x)
            while True:
                try:
                    dc, dp = rsba.schur_solve(U, Wp, V, gc, gp, lam)
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
        out = {"status": status, "iters": it, "intr": intr.tolist(), "t_r": float(t_r),
               "sd_f": float(np.sqrt(max(C[0, 0], 0))),
               "sd_tr": float(np.sqrt(max(C[rsba.NI, rsba.NI], 0))) if self.est_tr else float("nan"),
               "rms_px": float(np.sqrt((r2).mean() / 2)), "cost": cost,
               "delta": self.delta,
               "sd_delta": float(np.sqrt(max(C[-1, -1], 0))) if self.est_delta else float("nan")}
        if self.est_tr and self.est_delta:
            d = np.sqrt(C[rsba.NI, rsba.NI] * C[-1, -1])
            out["corr_tr_delta"] = float(C[rsba.NI, -1] / d) if d > 0 else float("nan")
        return out
