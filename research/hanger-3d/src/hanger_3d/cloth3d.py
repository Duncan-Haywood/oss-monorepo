"""Static 3D drape of a garment's shoulder-and-sleeve sheet over one hanger arm.

The sheet is a grid of nodes: rows run along the garment (neck, shoulder line, sleeve, as in
`hanger_fit`), columns run front to back across the garment's depth. Stretch springs run along
both grid directions plus the two diagonals (shear), bending is a turning-angle energy along both
directions, and the hanger arm is a swept capsule (a segment polyline thickened by r and extended
by +-zh in depth) that pushes nodes out with the same penalty as the 2D model. With the arm at
least as deep as the sheet nothing varies in depth, and the result is `hanger_fit`'s 2D chain
(`compare` checks this). With a narrow arm (zh = 0) the front and back panels fall to either
side of it, which the 2D chain cannot show.

Garments, hangers, worn shape, fabric constants and the L-BFGS solver are imported from
`hanger_fit` unchanged. Units are SI inside; sizes are in cm.
"""
import math
from dataclasses import dataclass

import numpy as np

from hanger_fit import model as m2
from hanger_fit.model import CM, DEPTH, G, K_CONTACT

DS = 0.5 * CM           # row spacing (the 2D chain uses 2.5 mm)
NZ = 9                  # columns across the depth (odd, so one column sits on the arm's centre)
SHEAR = 0.1             # diagonal spring stiffness as a fraction of the stretch stiffness, assumed


@dataclass(frozen=True)
class Arm:
    """A `hanger_fit.Hanger` plus the arm's half-depth zh (cm), front to back."""
    h: m2.Hanger
    zh: float


def _layout(g, ds=DS):
    Ls = (g.half_shoulder - g.neck) / math.cos(math.radians(g.slope)) * CM
    L = Ls + g.sleeve_len * CM
    n = int(round(L / ds)) + 1
    s = np.linspace(0.0, L, n)
    l0 = s[1] - s[0]
    mass = np.zeros(n)
    on_sh = s <= Ls + 1e-12
    mass[on_sh] += g.body / 1000.0 / on_sh.sum()
    mass[~on_sh] += g.sleeve * (l0 / CM) / 1000.0
    mass[-1] += g.lump / 1000.0
    return s, l0, mass


def _angle_terms(a, b):
    """phi = angle between a and b, and its gradients w.r.t. a and b (rows)."""
    c = np.cross(a, b)
    cn = np.sqrt((c * c).sum(1))
    d = (a * b).sum(1)
    chat = c / np.maximum(cn, 1e-30)[:, None]
    den = (cn * cn + d * d)[:, None]
    dpa = (d[:, None] * np.cross(b, chat) - cn[:, None] * b) / den
    dpb = (d[:, None] * np.cross(chat, a) - cn[:, None] * a) / den
    return np.arctan2(cn, d), dpa, dpb


class Sheet:
    def __init__(self, arm, g, nz=NZ, ds=DS, depth=DEPTH, shear=SHEAR):
        self.arm, self.g, self.nz = arm, g, nz
        self.s, self.l0, mass = _layout(g, ds)
        self.n = len(self.s)
        self.dz = depth / nz
        self.z = (np.arange(nz) + 0.5) * self.dz - depth / 2
        self.mass = np.repeat(mass[:, None] / nz, nz, 1)
        EA = g.EA
        B = g.B * 9.80665e-3 * 1e-4 / 1e-2                    # gf*cm^2/cm -> N*m^2/m
        self.ks_s, self.ks_z = EA * self.dz / self.l0, EA * self.l0 / self.dz
        diag = math.hypot(self.l0, self.dz)
        self.ks_d = shear * EA * 0.5 * (self.l0 / self.dz + self.dz / self.l0)
        self.diag = diag
        self.kb_s, self.kb_z = B * self.dz / self.l0, B * self.l0 / self.dz
        self.P = arm.h.centreline()
        self.rc = arm.h.r * CM
        self.zh = arm.zh * CM
        X0 = m2.neck_point(arm.h, g)
        self.X0 = X0
        # row 0 is the neck line: pinned where it lies on the arm, x-pinned elsewhere
        zc = np.abs(self.z) <= self.zh + 1e-9
        self.free = np.ones((self.n, nz, 3), bool)
        self.free[0, :, 0] = False
        self.free[0, zc, :] = False
        self.pin = np.zeros((nz, 3))
        self.pin[:, 0], self.pin[:, 1], self.pin[:, 2] = X0[0], X0[1], self.z

    def start(self):
        """2D starting chain (lying on the arm, round the cap, hanging) copied across the depth."""
        X2 = m2.initial(self.arm.h, self.X0, self.s)
        X = np.zeros((self.n, self.nz, 3))
        X[:, :, 0] = X2[:, None, 0]
        X[:, :, 1] = X2[:, None, 1]
        X[:, :, 2] = self.z[None, :]
        X[0] = self.pin
        return X

    def energy_grad(self, v, X):
        X = X.copy()
        X[self.free] = v
        gX = np.zeros_like(X)
        E = G * (self.mass * X[:, :, 1]).sum()
        gX[:, :, 1] += G * self.mass

        def spring(A, Bn, l0, k, gA, gB):
            e = Bn - A
            L = np.sqrt((e * e).sum(-1))
            f = k * (L - l0)
            fe = (f / np.maximum(L, 1e-12))[..., None] * e
            gA -= fe
            gB += fe
            return 0.5 * (f * (L - l0)).sum()

        E += spring(X[:-1], X[1:], self.l0, self.ks_s, gX[:-1], gX[1:])
        E += spring(X[:, :-1], X[:, 1:], self.dz, self.ks_z, gX[:, :-1], gX[:, 1:])
        E += spring(X[:-1, :-1], X[1:, 1:], self.diag, self.ks_d, gX[:-1, :-1], gX[1:, 1:])
        E += spring(X[:-1, 1:], X[1:, :-1], self.diag, self.ks_d, gX[:-1, 1:], gX[1:, :-1])

        def bend(Xm, axis, kb):
            nonlocal E
            Xm_ = np.moveaxis(X, axis, 0)
            gm = np.moveaxis(gX, axis, 0)       # a view: writes land in gX
            a = (Xm_[1:-1] - Xm_[:-2]).reshape(-1, 3)
            b = (Xm_[2:] - Xm_[1:-1]).reshape(-1, 3)
            phi, dpa, dpb = _angle_terms(a, b)
            E += 0.5 * kb * (phi * phi).sum()
            c = (kb * phi)[:, None]
            sh = Xm_[1:-1].shape
            gm[:-2] -= (c * dpa).reshape(sh)
            gm[1:-1] += (c * dpa - c * dpb).reshape(sh)
            gm[2:] += (c * dpb).reshape(sh)

        bend(X, 0, self.kb_s)
        bend(X, 1, self.kb_z)

        # contact with the swept capsule: closest point is (closest point on the polyline, z clipped)
        F = X.reshape(-1, 3)
        Q, dxy = m2._closest(F[:, :2], self.P)
        zc = np.clip(F[:, 2], -self.zh, self.zh)
        dz_ = F[:, 2] - zc
        d = np.sqrt(dxy ** 2 + dz_ ** 2)
        pen = np.maximum(self.rc - d, 0.0)
        E += 0.5 * K_CONTACT * (pen * pen).sum()
        on = pen > 0
        if on.any():
            dv = np.column_stack([F[on, :2] - Q[on], dz_[on]]) / np.maximum(d[on], 1e-12)[:, None]
            gF = np.zeros_like(F)
            gF[on] = -(K_CONTACT * pen[on])[:, None] * dv
            gX += gF.reshape(gX.shape)
        return E, gX[self.free]


def drape(arm, g, iters=3000, **kw):
    """Static drape: node positions (n, nz, 3) in metres, and the sheet."""
    sh = Sheet(arm, g, **kw)
    X = sh.start()
    v, _ = m2.lbfgs(lambda v: sh.energy_grad(v, X), X[sh.free], iters=iters, tol=1e-6)
    X[sh.free] = v
    return X, sh


def score(X, sh):
    """Shape error (cm RMS) and sharpest bend (deg per cm) on the centre column, as in hanger_fit,
    plus the shape error over the whole sheet and the most (cm) an edge column hangs below the
    centre column at the same row (front and back panels falling off a narrow arm)."""
    g, s = sh.g, sh.s
    c = sh.nz // 2
    T = m2.target(g, s) + sh.X0
    keep = s <= s[-1] - 5 * CM if g.sleeve_len > 10 else np.ones(len(s), bool)
    xc = X[:, c, :2]
    err = math.sqrt(((xc[keep] - T[keep]) ** 2).sum(1).mean()) / CM
    err_all = math.sqrt(((X[keep][:, :, :2] - T[keep][:, None, :]) ** 2).sum(2).mean()) / CM
    e = xc[1:] - xc[:-1]
    a, b = e[:-1], e[1:]
    phi = np.abs(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(1)))
    w = max(1, int(round(CM / sh.l0)))
    crease = math.degrees(np.convolve(phi, np.ones(w), "valid").max())
    sag = float((xc[keep][:, 1][:, None] - X[keep][:, [0, -1], 1]).max() / CM)
    return dict(err=err, err_all=err_all, crease=crease, sag=sag)
