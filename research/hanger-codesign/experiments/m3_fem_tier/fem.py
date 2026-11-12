"""A triangle finite-element cloth tier: the element model of ARCSim, without its remeshing.

Membrane: constant-strain triangles (CST) with a Saint Venant-Kirchhoff energy in the Green
strain E = (F^T F - I) / 2, orthotropic with the warp and weft along the rest x and y axes and no
Poisson coupling, which is how KES-FB reports a woven: stretch stiffness EA (N/m) on E11 and E22,
in-plane shear G (N/m per radian, KES-FB1 shear rigidity) on the engineering shear 2 E12:

    psi = EA (E11^2 + E22^2) / 2 + 2 G E12^2      (per unit rest area).

The stretch and shear terms are independent parameters, unlike the spring sheet of milestones 1
to 2b, whose diagonal springs tie shear to 0.1 EA (milestone 2b's post hoc).

Bending: the discrete-shell hinge energy (Grinspun et al. 2003; Bridson et al. 2003), one term per
interior edge e with dihedral angle theta (0 when flat),

    E_e = B theta^2 |e|^2 / (2 (A1 + A2)),

A1, A2 the rest areas of the two triangles. The factor 1/2 is the lattice's: a piecewise-flat
equilateral mesh laid on a cylinder of curvature k folds not only across the edges the curvature
crosses but also across the edges parallel to it (by k a / (2 sqrt3), since each triangle's apex
sits off the chord), and summing all three edge directions per node gives B k^2 per unit area with
the factor 1; halving it gives the continuum B k^2 / 2. `test_m3` checks this on the mesh at four
axis angles (isotropic to under 1% in the interior).

Units are SI inside; B in gf cm^2/cm and W in mg/cm^2 at the interface, as `hanger-kes` gives them.
"""
import math
import sys
from pathlib import Path

import numpy as np

R = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(R / "hanger-fit" / "src")]
from hanger_fit.model import G as GRAV, lbfgs  # noqa: E402

GF_CM2_PER_CM = 9.80665e-3 * 1e-4 / 1e-2     # gf cm^2/cm -> N m
MG_PER_CM2 = 1e-6 / 1e-4                      # mg/cm^2 -> kg/m^2
GF_CM_DEG = 9.80665e-3 / 1e-2 * 180 / math.pi  # gf/cm/deg -> N/m per radian


def acc(gX, ix, val):
    n = len(gX)
    for k in range(3):
        gX[:, k] += np.bincount(ix, val[:, k], minlength=n)


class Mesh:
    """Triangle cloth on rest nodes P (n x 2) and triangles T (m x 3, counter-clockwise)."""

    def __init__(self, P, T, B, W, EA, Gs, fixed):
        self.P = np.asarray(P, float)
        self.T = np.asarray(T, int)
        self.n = len(self.P)
        self.X0 = np.column_stack([self.P, np.zeros(self.n)])
        self.fixed = np.asarray(fixed, bool)
        self.free = ~self.fixed
        a, b, c = (self.P[self.T[:, i]] for i in range(3))
        Dm = np.stack([b - a, c - a], axis=2)                    # m x 2 x 2, columns are edges
        det = Dm[:, 0, 0] * Dm[:, 1, 1] - Dm[:, 0, 1] * Dm[:, 1, 0]
        if (det <= 0).any():
            raise ValueError("triangles must be counter-clockwise and non-degenerate")
        self.area = 0.5 * det
        self.Dinv = np.linalg.inv(Dm)
        self.EA, self.Gs = float(EA), float(Gs)
        w = W * MG_PER_CM2
        self.mass = np.zeros(self.n)
        for i in range(3):
            self.mass += np.bincount(self.T[:, i], self.area * w / 3, minlength=self.n)
        # hinges: interior edges, with the vertices opposite them in each triangle
        e = {}
        for t, (i, j, k) in enumerate(self.T):
            for u, v, o in ((i, j, k), (j, k, i), (k, i, j)):
                e.setdefault((min(u, v), max(u, v)), []).append((t, u, v, o))
        h = []
        for key, lst in e.items():
            if len(lst) == 2:
                (t1, u, v, o1), (t2, _, _, o2) = lst
                h.append((u, v, o1, o2, t1, t2))   # u->v is t1's edge orientation
        h = np.array(h, int).reshape(-1, 6)
        self.hu, self.hv, self.ho1, self.ho2 = h[:, 0], h[:, 1], h[:, 2], h[:, 3]
        el2 = ((self.P[self.hv] - self.P[self.hu]) ** 2).sum(1)
        self.kb = B * GF_CM2_PER_CM * el2 / (2 * (self.area[h[:, 4]] + self.area[h[:, 5]]))
        self.boundary_edges = [k for k, lst in e.items() if len(lst) == 1]

    def theta(self, X):
        """Signed dihedral angle of every hinge, 0 when flat."""
        a, b, c, d = X[self.hu], X[self.hv], X[self.ho1], X[self.ho2]
        e = b - a
        el = np.sqrt((e * e).sum(1))
        n1 = np.cross(e, c - a)          # t1 = (u, v, o1) counter-clockwise: normal up when flat
        n2 = np.cross(d - a, e)          # t2 holds the edge as v->u: (v, u, o2)
        return self._theta(n1, n2, e, el), (a, b, c, d, e, el, n1, n2)

    @staticmethod
    def _theta(n1, n2, e, el):
        s = (np.cross(n1, n2) * e).sum(1) / el
        co = (n1 * n2).sum(1)
        return np.arctan2(s, co)

    def energy_grad(self, v, X):
        X = X.copy()
        X[self.free] = v.reshape(-1, 3)
        gX = np.zeros_like(X)
        E = GRAV * (self.mass * X[:, 2]).sum()
        gX[:, 2] += GRAV * self.mass
        # membrane
        x0, x1, x2 = X[self.T[:, 0]], X[self.T[:, 1]], X[self.T[:, 2]]
        Ds = np.stack([x1 - x0, x2 - x0], axis=2)                 # m x 3 x 2
        F = Ds @ self.Dinv                                        # m x 3 x 2
        C = np.einsum("mki,mkj->mij", F, F)
        E11, E22, E12 = 0.5 * (C[:, 0, 0] - 1), 0.5 * (C[:, 1, 1] - 1), 0.5 * C[:, 0, 1]
        psi = 0.5 * self.EA * (E11 ** 2 + E22 ** 2) + 2 * self.Gs * E12 ** 2
        E += (self.area * psi).sum()
        S = np.empty((len(F), 2, 2))
        S[:, 0, 0], S[:, 1, 1] = self.EA * E11, self.EA * E22
        S[:, 0, 1] = S[:, 1, 0] = 2 * self.Gs * E12
        H = (self.area[:, None, None] * (F @ S)) @ np.transpose(self.Dinv, (0, 2, 1))   # m x 3 x 2
        acc(gX, self.T[:, 1], H[:, :, 0])
        acc(gX, self.T[:, 2], H[:, :, 1])
        acc(gX, self.T[:, 0], -H[:, :, 0] - H[:, :, 1])
        # bending (dihedral-angle gradient of Bridson et al. 2003)
        th, (a, b, c, d, e, el, n1, n2) = self.theta(X)
        E += (self.kb * th * th).sum()
        q1 = (n1 * n1).sum(1)[:, None]
        q2 = (n2 * n2).sum(1)[:, None]
        eh = e / el[:, None]
        gc = -el[:, None] * n1 / q1
        gd = -el[:, None] * n2 / q2
        ga = (((c - b) * eh).sum(1)[:, None] * n1 / q1 + ((d - b) * eh).sum(1)[:, None] * n2 / q2)
        gb = -(((c - a) * eh).sum(1)[:, None] * n1 / q1 + ((d - a) * eh).sum(1)[:, None] * n2 / q2)
        cc = (2 * self.kb * th)[:, None]
        acc(gX, self.hu, cc * ga)
        acc(gX, self.hv, cc * gb)
        acc(gX, self.ho1, cc * gc)
        acc(gX, self.ho2, cc * gd)
        return E, gX[self.free].ravel()

    def solve(self, X, iters, tol=1e-8):
        v = X[self.free].ravel()
        v, used = lbfgs(lambda u: self.energy_grad(u, X), v, iters=iters, tol=tol)
        X = X.copy()
        X[self.free] = v.reshape(-1, 3)
        return X, used


def lattice(a, xr, yr, rows_along="x"):
    """Equilateral triangle lattice of side a covering xr x yr; rows along x (row spacing
    a sqrt3/2 in y) or along y. Returns nodes P and counter-clockwise triangles."""
    s = a * math.sqrt(3) / 2
    if rows_along == "x":
        nj = int(math.floor((yr[1] - yr[0]) / s + 1e-9)) + 1
        ni = int(math.floor((xr[1] - xr[0]) / a + 1e-9)) + 2
        idx = np.arange(nj * ni).reshape(nj, ni)
        J, I = np.meshgrid(np.arange(nj), np.arange(ni), indexing="ij")
        P = np.column_stack([(xr[0] + I * a - (J % 2) * a / 2).ravel(), (yr[0] + J * s).ravel()])
        T = []
        for j in range(nj - 1):
            for i in range(ni - 1):
                if j % 2 == 0:      # row j+1 is shifted left by a/2
                    T += [(idx[j, i], idx[j, i + 1], idx[j + 1, i + 1]), (idx[j, i], idx[j + 1, i + 1], idx[j + 1, i])]
                else:               # row j is shifted left: row j+1 sits right
                    T += [(idx[j, i], idx[j, i + 1], idx[j + 1, i]), (idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i])]
        return P, np.array(T)
    P, T = lattice(a, yr, xr, "x")
    P = P[:, ::-1].copy()
    return P, T[:, [0, 2, 1]]


def keep(P, T, inside):
    """Sub-mesh of the triangles whose three nodes are all `inside`, renumbered."""
    ok = inside[T].all(1)
    T = T[ok]
    used = np.unique(T)
    new = -np.ones(len(P), int)
    new[used] = np.arange(len(used))
    return P[used], new[T]
