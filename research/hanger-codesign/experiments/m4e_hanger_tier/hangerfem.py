"""The top tier over a hanger: milestone 3a's triangle element (3d's local Newton) draped on a hanger
arm, with the garment, arm, contact, neck pin, start and score of milestone 1's 3D spring sheet.

Geometry and frame. The rest sheet is the shoulder-and-sleeve panel of `hanger_3d.cloth3d`: arc
length s from the neck line along the shoulder and sleeve (0 to L), and depth u front to back
(-DEPTH/2 to DEPTH/2). It is meshed with `fem.lattice` with rows along u, so every lattice row is a
line of constant s and row 0 is the neck line. The solve runs in `fem.Mesh`'s frame, gravity on the
third coordinate: X = (x, u, y), where (x, y) is `hanger_fit`'s 2D plane (hook at the origin, y up)
and u is cloth3d's z.

What is carried over unchanged from cloth3d, so that only the cloth model differs between the two
3D tiers:
  * mass along s: the garment's body mass spread evenly over the shoulder length, then the sleeve's
    g per cm (`hanger_fit._layout`), each spread evenly across the depth;
  * contact: the swept capsule (the arm's centreline thickened by r and extended by +-zh in depth),
    penalty 0.5 K (r - d)^2 per node with cloth3d's K = 2e4 N/m, its kink at d = r smoothed
    over DELTA = 10 um (a softplus), because Newton stalled on nodes resting exactly on the arm's
    surface (pilot, F1, 2026-11-21); typical penetrations are 20 to 60 um, the smoothing shifts
    contact by under 10 um;
  * the neck line: nodes with |u| <= zh pinned at the neck point, the rest held in x only
    (here by a penalty of the same K on x - x0, since `fem.Mesh` pins whole nodes);
  * the start: the 2D chain's starting curve (`hanger_fit.initial`) copied across the depth;
  * the score: shape error (cm RMS) from the worn shape over every node more than 5 cm from the
    sleeve end (cloth3d's `err_all`).

What differs: the cloth is 3a's constant-strain triangle (Saint Venant-Kirchhoff, stretch EA and
shear G independent) with discrete-shell hinge bending, where the spring sheet has stretch springs,
diagonal shear springs tied to 0.1 EA and turning-angle bending along the two grid directions.

The Hessian is 3d's element-local one plus the contact and pin terms. Contact enters as its
Gauss-Newton part K n n^T (n the contact normal); the dropped curvature term, -K (pen / d) times a
projector, is negative and of order pen / r relative to it, so the matrix stays positive where the
exact one may not, and the line search of 3d's Newton covers the difference. The stopping test is on
the exact gradient, so the answer does not depend on the approximation. `tests/test_m4e.py` checks
the gradient against finite differences and the blocks against finite differences of the gradient.
"""
import math
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sps

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
R = EXP.parents[1]
sys.path[:0] = [str(EXP / "m3_fem_tier"), str(EXP / "m3d_local_hessian"),
                str(R / "hanger-fit" / "src"), str(R / "hanger-3d" / "src")]
import fem  # noqa: E402
import localhess  # noqa: E402
from hanger_fit import model as m2  # noqa: E402
from hanger_fit.model import CM, K_CONTACT  # noqa: E402

DEPTH = 0.20
DELTA = 1e-5          # m, width over which the contact penalty is smoothed (see `_soft`)


def line_density(g, s):
    """Mass per unit arc length (kg/m) at s, as `hanger_fit._layout` hangs it (lump not modelled)."""
    if g.lump:
        raise ValueError("garments with a sleeve lump are not modelled on this tier")
    Ls = (g.half_shoulder - g.neck) / math.cos(math.radians(g.slope)) * CM
    return np.where(s <= Ls + 1e-12, g.body / 1000.0 / Ls, g.sleeve / 1000.0 / CM)


class HangerSheet(fem.Mesh):
    """Garment g (a `hanger_fit.Garment`, B in gf cm^2/cm) on hanger h with arm half-depth zh (cm),
    triangle lattice of side a (m), shear rigidity Gs (N/m per radian)."""

    def __init__(self, h, zh, g, a, Gs, depth=DEPTH):
        Ls = (g.half_shoulder - g.neck) / math.cos(math.radians(g.slope)) * CM
        self.L = Ls + g.sleeve_len * CM
        self.g, self.h, self.depth = g, h, depth
        P, T = fem.lattice(a, (-depth / 2 - a, depth / 2 + a), (0.0, self.L + a))
        ok = (np.abs(P[:, 0]) <= depth / 2 + 1e-9) & (P[:, 1] <= self.L + 1e-9)
        P, T = fem.keep(P, T, ok)
        self.u, self.s = P[:, 0].copy(), P[:, 1].copy()
        X0 = m2.neck_point(h, g)
        self.x0 = X0
        self.zh, self.rc = zh * CM, h.r * CM
        neck = self.s < 1e-9
        fixed = neck & (np.abs(self.u) <= self.zh + 1e-9)
        super().__init__(P, T, g.B, 0.0, g.EA, Gs, fixed)
        # mass: lumped rest area x line density / depth
        area_node = np.zeros(self.n)
        for i in range(3):
            area_node += np.bincount(self.T[:, i], self.area / 3, minlength=self.n)
        self.mass = area_node * line_density(g, self.s) / depth
        # the lattice's jagged depth edges cover a few per cent less than L x depth: rescale so the
        # shoulder carries exactly the body mass and the sleeve exactly g.sleeve x its length
        sh = self.s <= Ls + 1e-12
        self.mass[sh] *= g.body / 1000.0 / self.mass[sh].sum()
        self.mass[~sh] *= g.sleeve * g.sleeve_len / 1000.0 / self.mass[~sh].sum()
        self.xpin = neck & ~fixed
        self.poly = h.centreline()

    def start(self, seed=0, amp=0.0):
        X2 = m2.initial(self.h, self.x0, np.unique(self.s))
        su = np.unique(self.s)
        X = np.zeros((self.n, 3))
        X[:, 0] = np.interp(self.s, su, X2[:, 0])
        X[:, 2] = np.interp(self.s, su, X2[:, 1])
        X[:, 1] = self.u
        if amp:
            rng = np.random.default_rng(seed)
            X[~self.fixed] += amp * rng.standard_normal((int((~self.fixed).sum()), 3))
        X[self.fixed, 0], X[self.fixed, 2] = self.x0[0], self.x0[1]
        return X

    def _contact(self, X):
        """Penetration, unit normal (n x 3 in the solve frame) and distance for every node."""
        Q, dxy = m2._closest(X[:, [0, 2]], self.poly)
        uc = np.clip(X[:, 1], -self.zh, self.zh)
        du = X[:, 1] - uc
        d = np.sqrt(dxy ** 2 + du ** 2)
        nrm = np.column_stack([X[:, 0] - Q[:, 0], du, X[:, 2] - Q[:, 1]]) / np.maximum(d, 1e-12)[:, None]
        return self.rc - d, nrm, d, np.abs(X[:, 1]) > self.zh

    @staticmethod
    def _soft(p):
        """Smoothed penetration: softplus over DELTA. Energy 0.5 K sp^2, force K sp sigma, and
        stiffness K (sigma^2 + sp sigma (1 - sigma) / DELTA), all smooth through p = 0."""
        x = p / DELTA
        sp = DELTA * np.logaddexp(0.0, x)
        sig = 0.5 * (1 + np.tanh(0.5 * x))
        return sp, sig

    def energy_grad(self, v, X):
        E, gv = super().energy_grad(v, X)
        X = X.copy()
        X[self.free] = v.reshape(-1, 3)
        gX = np.zeros_like(X)
        p, nrm, _, _ = self._contact(X)
        sp, sig = self._soft(p)
        E += 0.5 * K_CONTACT * (sp * sp).sum()
        gX -= (K_CONTACT * sp * sig)[:, None] * nrm
        dx = np.where(self.xpin, X[:, 0] - self.x0[0], 0.0)
        E += 0.5 * K_CONTACT * (dx * dx).sum()
        gX[:, 0] += K_CONTACT * dx
        return E, gv + gX[self.free].ravel()

    def extra_blocks(self, X):
        """3 x 3 Hessian block per node from contact (Gauss-Newton, K n n^T) and the x pin."""
        p, nrm, _, _ = self._contact(X)
        sp, sig = self._soft(p)
        K = np.zeros((self.n, 3, 3))
        on = p > -30 * DELTA
        k = K_CONTACT * (sig * sig + sp * sig * (1 - sig) / DELTA)
        K[on] = k[on, None, None] * nrm[on, :, None] * nrm[on, None, :]
        K[self.xpin, 0, 0] += K_CONTACT
        return K

    def hessian(self, X, eps=1e-7):
        H = localhess.hessian(self, X, eps)
        fi = -np.ones(self.n, int)
        fi[self.free] = np.arange(self.free.sum())
        r, c, v = localhess._coo(np.arange(self.n)[:, None], self.extra_blocks(X), fi)
        return (H + sps.csc_matrix((v, (r, c)), shape=H.shape)).tocsc()

    def score(self, X):
        """Shape error (cm RMS) from the worn shape over the sheet, cloth3d's err_all."""
        T = m2.target(self.g, self.s) + self.x0
        keep = self.s <= self.L - 5 * CM if self.g.sleeve_len > 10 else np.ones(self.n, bool)
        dxy = X[keep][:, [0, 2]] - T[keep]
        return math.sqrt((dxy * dxy).sum(1).mean()) / CM


class SheetNewton(localhess.LocalNewton):
    def hessian(self, grad, v, g0, eps):
        X = self.X.copy()
        X[self.free] = v.reshape(-1, 3)
        return self.mesh.hessian(X, eps)


def solve(sheet, X, rel=1e-5, maxit=300, log=None):
    """3d's Newton from X to max|g| < rel x the heaviest node's weight. Returns X, info."""
    w = fem.GRAV * sheet.mass.max()
    nw = SheetNewton(sheet, X)
    v, info = nw.solve(lambda u: sheet.energy_grad(u, X), X[sheet.free].ravel(), gtol=rel * w,
                       maxit=maxit, log=log)
    X = X.copy()
    X[sheet.free] = v.reshape(-1, 3)
    info["rel"] = info["gmax"] / w
    info["E"] = float(sheet.energy_grad(v, X)[0])
    return X, info


def from_grid(sheet, Xg, s_g, z_g):
    """Start from a grid drape (cloth3d's (n, nz, 3) in its (x, y, z) frame, rows at arc lengths
    s_g, columns at depths z_g): bilinear in (s, u), linear extrapolation past the edge columns."""
    X = np.zeros((sheet.n, 3))
    i = np.clip(np.searchsorted(s_g, sheet.s) - 1, 0, len(s_g) - 2)
    ts = (sheet.s - s_g[i]) / (s_g[i + 1] - s_g[i])
    j = np.clip(np.searchsorted(z_g, sheet.u) - 1, 0, len(z_g) - 2)
    tz = (sheet.u - z_g[j]) / (z_g[j + 1] - z_g[j])
    for k_out, k_in in ((0, 0), (1, 2), (2, 1)):
        F = Xg[:, :, k_in]
        a = F[i, j] * (1 - tz) + F[i, j + 1] * tz
        b = F[i + 1, j] * (1 - tz) + F[i + 1, j + 1] * tz
        X[:, k_out] = a * (1 - ts) + b * ts
    X[sheet.fixed, 0], X[sheet.fixed, 1], X[sheet.fixed, 2] = sheet.x0[0], sheet.u[sheet.fixed], sheet.x0[1]
    return X
