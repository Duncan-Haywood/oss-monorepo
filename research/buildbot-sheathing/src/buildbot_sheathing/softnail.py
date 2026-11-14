"""Milestone 16: milestone 14's sheet with softening nails, pushed over.

Milestone 14 (``racking.py``) gave every sheathing nail the same rigid-plastic capacity F at any slip.
Here each nail is a nonlinear spring along its own slip (the oriented-spring idealisation behind
CASHEW, Folz and Filiatrault 2001) with a backbone that rises to a peak Fp at slip dp and then falls:

    P(d) = Fp * (1 - (1 - d / dp) ** n)                         0 <= d <= dp
    P(d) = Fp * (1 - 0.2 * (d - dp) / (du - dp))                dp < d <= dp + 5 (du - dp)   (0.8 Fp at du)
    P(d) = 0                                                    beyond

with n set so the secant stiffness at 0.4 Fp equals the tested K (``Backbone.from_tests``). The
kinematics are milestone 14's: pinned framing racking as a parallelogram (a stud nail at height z
moves gamma z along the wall, a top-plate nail gamma H), the bottom plate fixed, the sheet rigid with
(u, v, theta) about its centre, full anchorage. The top plate is pushed to a drift D in steps; at each
step the sheet sits where the springs' energy is least (damped Newton from the last step), and the
racking load is dE/dD. Loading is taken as path-independent (a nail whose slip falls is read back down
its backbone, not on an unloading branch); ``pushover`` counts how many nails do that.

Nail order and geometry: ``racking.layout``. Units: metres and newtons (any force unit works: capacity
ratios do not depend on Fp).
"""
from dataclasses import dataclass

import numpy as np

from .budget import HEIGHT
from .racking import _slip_terms


@dataclass(frozen=True)
class Backbone:
    Fp: float          # peak load
    dp: float          # slip at peak
    n: float           # rise exponent (initial stiffness n Fp / dp)
    du: float          # slip at 0.8 Fp after the peak
    epp: bool = False  # elastic-perfectly-plastic instead (yield at dp, no softening): the H70 check

    @staticmethod
    def from_tests(Fp, dp, K40, du):
        """The rise exponent n that makes the secant stiffness at 0.4 Fp equal K40."""
        d40 = 0.4 * Fp / K40
        if not 0 < d40 < dp:
            raise ValueError("0.4 Fp must be reached before the peak")
        n = np.log(0.6) / np.log(1 - d40 / dp)
        return Backbone(Fp, dp, float(n), du)

    @staticmethod
    def elastic_plastic(Fp, dy):
        return Backbone(Fp, dy, 1.0, np.inf, epp=True)

    def k0(self):
        return self.n * self.Fp / self.dp

    def _parts(self, d):
        d = np.asarray(d, float)
        Fp, dp, n = self.Fp, self.dp, self.n
        if self.epp:
            K = Fp / dp
            P = np.where(d < dp, K * d, Fp)
            dP = np.where(d < dp, K, 0.0)
            E = np.where(d < dp, 0.5 * K * d * d, 0.5 * Fp * dp + Fp * (d - dp))
            return P, dP, E
        x = np.clip(d / dp, 0.0, 1.0)
        Erise = Fp * dp * (x - (1 - (1 - x) ** (n + 1)) / (n + 1))
        Prise = Fp * (1 - (1 - x) ** n)
        dPrise = n * Fp / dp * (1 - x) ** (n - 1)
        s = 0.2 * Fp / (self.du - dp)                     # fall per metre
        d0 = dp + Fp / s                                  # zero load
        y = np.clip(d, dp, d0) - dp
        Efall = Fp * y - 0.5 * s * y * y
        Pfall = Fp - s * y
        rise = d <= dp
        P = np.where(rise, Prise, np.where(d < d0, Pfall, 0.0))
        dP = np.where(rise, dPrise, np.where(d < d0, -s, 0.0))
        E = Erise + np.where(rise, 0.0, Efall)
        return P, dP, E

    def load(self, d):
        return self._parts(d)[0]


def _state(p, D, c, M, mask, bb):
    """Energy, gradient (k, 3), Hessian (k, 3, 3), per-nail slip norms and the racking load."""
    s = (D / HEIGHT) * c[None] + np.einsum("nij,kj->kni", M, p)       # (k, n, 2)
    r = np.linalg.norm(s, axis=-1)
    P, dP, E = bb._parts(r)
    small = r < 1e-12
    rs = np.where(small, 1.0, r)
    e = np.where(small[..., None], 0.0, s / rs[..., None])
    sec = np.where(small, bb.k0(), P / rs)                            # P / r, -> initial stiffness at 0
    g_s = (P * mask)[..., None] * e                                   # dE/ds
    grad = np.einsum("kni,nij->kj", g_s, M)
    eet = e[..., :, None] * e[..., None, :]
    I2 = np.eye(2)
    Hs = (dP * mask)[..., None, None] * eet + (sec * mask)[..., None, None] * (I2 - eet)
    Hs = np.where(small[..., None, None], (bb.k0() * mask)[..., None, None] * I2, Hs)
    H = np.einsum("nia,knij,njb->kab", M, Hs, M)
    load = (g_s[..., 0] * c[None, :, 0]).sum(axis=1) / HEIGHT         # dE/dD
    return (E * mask).sum(axis=1), grad, H, r, load


def _relax(p, D, c, M, mask, bb, iters=60, tol=1e-9):
    """Damped Newton to the nearest energy minimum (Levenberg shift where the Hessian is not PD)."""
    E, g, H, r, load = _state(p, D, c, M, mask, bb)
    lam = np.full(p.shape[0], 1e-3 * bb.k0())
    for _ in range(iters):
        if np.all(np.abs(g).max(axis=1) <= tol * bb.Fp):
            break
        # shift each Hessian until positive definite
        A = H + lam[:, None, None] * np.eye(3)
        ev = np.linalg.eigvalsh(A)[:, 0]
        bad = ev <= 0
        if bad.any():
            A[bad] += ((-ev[bad] + 1e-3 * bb.k0()))[:, None, None] * np.eye(3)
        step = -np.linalg.solve(A, g[..., None])[..., 0]
        pn = p + step
        En, gn, Hn, rn, ln = _state(pn, D, c, M, mask, bb)
        ok = En <= E + 1e-12 * bb.Fp * bb.dp
        p = np.where(ok[:, None], pn, p)
        E = np.where(ok, En, E)
        g = np.where(ok[:, None], gn, g)
        H = np.where(ok[:, None, None], Hn, H)
        r = np.where(ok[:, None], rn, r)
        load = np.where(ok, ln, load)
        lam = np.where(ok, lam * 0.3, lam * 10 + 1e-3 * bb.k0())
    return p, g, r, load


def pushover(mask, xz, frame, bb, d_max=0.150, step=0.25e-3):
    """Peak racking load (k,), drift at peak (k,), and the curve, for nail masks (k, n).

    Returns a dict: ``peak``, ``drift_at_peak``, ``drifts``, ``curves`` (k, steps) of load,
    ``p_at_peak`` (k, 3), ``past_peak`` (k,) the fraction of held nails past dp at the sheet's peak,
    ``unloaded`` (k,) the fraction whose slip ever fell by more than 1% of dp before the sheet's peak,
    and ``max_grad`` the largest residual (in Fp) over the run."""
    mask = np.atleast_2d(np.asarray(mask, bool)).astype(float)
    c, M = _slip_terms(xz, frame)
    k = mask.shape[0]
    drifts = np.arange(1, int(round(d_max / step)) + 1) * step
    p = np.zeros((k, 3))
    curves = np.zeros((k, drifts.size))
    best = np.full(k, -np.inf)
    dpk = np.zeros(k)
    ppk = np.zeros((k, 3))
    past = np.zeros(k)
    rmax = np.zeros((k, xz.shape[0]))
    unl = np.zeros((k, xz.shape[0]), bool)
    unl_at = np.zeros(k)
    worst = 0.0
    prevD = 0.0
    for j, D in enumerate(drifts):
        # predictor: scale the last motion with the drift
        if prevD > 0:
            p = p * (D / prevD)
        p, g, r, load = _relax(p, D, c, M, mask, bb)
        worst = max(worst, float(np.abs(g).max() / bb.Fp))
        unl |= (r < rmax - 0.01 * bb.dp) & (mask > 0)
        rmax = np.maximum(rmax, r)
        curves[:, j] = load
        up = load > best
        best = np.where(up, load, best)
        dpk = np.where(up, D, dpk)
        ppk = np.where(up[:, None], p, ppk)
        past = np.where(up, ((r > bb.dp) * mask).sum(axis=1) / mask.sum(axis=1), past)
        unl_at = np.where(up, (unl * mask).sum(axis=1) / mask.sum(axis=1), unl_at)
        prevD = D
    return {"peak": best, "drift_at_peak": dpk, "drifts": drifts, "curves": curves, "p_at_peak": ppk,
            "past_peak": past, "unloaded": unl_at, "max_grad": worst}


def unique_peak(hits, xz, frame, bb, **kw):
    """Peak racking load for many sheets, pushing each distinct miss pattern once."""
    hits = np.asarray(hits, bool)
    pats, inv = np.unique(hits, axis=0, return_inverse=True)
    out = pushover(pats, xz, frame, bb, **kw)
    return out["peak"][inv.ravel()], out
