"""An orthotropic version of milestone 3a's triangle cloth element: warp and weft bending rigidity
and warp and weft stretch stiffness kept apart instead of averaged into one geometric mean.

Why: milestone 4a's isotropic element over-drapes all nine measured wovens of Petrak et al. (2021)
by about 0.14 in DC, and one factor of 0.485 on bending rigidity removes the bias. One of the
things that factor could be absorbing is the anisotropy the isotropic element throws away (warp to
weft bending up to 4:1 on F9, stretch up to 11:1 on F2). This module puts it back.

Stretch. The membrane energy per rest area becomes

    psi = (EA1 E11^2 + EA2 E22^2) / 2 + 2 G E12^2,

warp (suffix 1) along the rest x axis, weft along y, no Poisson coupling, as KES-FB and FAST
report a woven. The shear term is 3a's unchanged; `OrthoDisc.energy_grad` calls 3a's energy with
EA = 0 (gravity, shear, bending) and adds the two stretch terms. `membrane_blocks` is 3d's exact
element Hessian with EA1 and EA2 in place of EA.

Bending. 3a's discrete-shell hinge E_e = kb_e theta^2 with kb_e = B |e|^2 / (2 (A1 + A2)) gives
B k^2 / 2 per unit area on a cylinder at any axis angle (3a's lattice calibration). The equilateral
lattice with rows along x has three edge families, along 0, 60 and 120 degrees. Here each family
gets its own weight, kb_e = w_f |e|^2 / (2 (A1 + A2)), and the weights are chosen so that a cylinder
with curvature along x (warp bending, KES/FAST warp B1) stores exactly B1 k^2 / 2 and one with
curvature along y stores B2 k^2 / 2. By the mirror symmetry of the lattice and of an orthotropic
fabric about the y axis, the 60 and 120 degree families share a weight, so two equations fix two
weights. The coefficients are measured on the lattice itself (curvature along x: 11% of the energy in
the edges along x, 89% in the diagonals; along y: all of it in the edges along x) (`calibrate`, a cylinder fixture as in
`test_m3`), not taken from a small-angle formula. At B1 = B2 the weights are exactly B and the
element is 3a's. Between the axes the lattice decides B(phi); `bending_profile` reports it, and it
is a modelling choice the measurements (two axes only) cannot check: with only two weights the
profile is not monotonic (for B1/B2 = 4, B is B1 again at 45 degrees and about 1.09 B1 at 22.5).
Two weights are all an orthotropic, mirror-symmetric weighting of this lattice has, so this is
the hinge element's only orthotropic form, not one choice among several.

The weights must be positive for the energy to stay convex in each hinge; with the measured
coefficients that holds for warp/weft ratios up to about 8 either way (`calibrate` checks; the
nine fabrics reach 4.0).
"""
import math
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
import scipy.sparse as sps

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP / "m3_fem_tier"))
sys.path.insert(0, str(EXP / "m3d_local_hessian"))
import fem  # noqa: E402
import localhess  # noqa: E402


def families(P, hu, hv):
    """Edge family of each hinge on a rows-along-x lattice: 0 (edges along x) or 1 (the diagonals)."""
    d = P[hv] - P[hu]
    ang = np.degrees(np.arctan2(d[:, 1], d[:, 0])) % 180.0
    near0 = np.minimum(ang, 180.0 - ang) < 1.0
    diag = (np.abs(ang - 60.0) < 1.0) | (np.abs(ang - 120.0) < 1.0)
    if not (near0 | diag).all():
        raise ValueError("hinge edge not on the 0/60/120 degree lattice")
    return np.where(near0, 0, 1)


def _cylinder(P, phi, k):
    c = P.mean(0)
    u = np.array([math.cos(phi), math.sin(phi)])
    Q = P - c
    s, t = Q @ u, Q @ np.array([-u[1], u[0]])
    return np.column_stack([np.sin(k * s) / k * u[0] - t * u[1], np.sin(k * s) / k * u[1] + t * u[0],
                            (1 - np.cos(k * s)) / k]), c


def family_energy(phi, a=0.005, k=3.0, L=0.3, inner=0.1):
    """Bending energy of each edge family, per unit B and per unit B k^2/2 x area, on a cylinder
    with curvature along angle phi (radians from x). Interior hinges only (|x - c|, |y - c| < inner)."""
    P, T = fem.lattice(a, (0, L), (0, L), "x")
    m = fem.Mesh(P, T, 1.0 / fem.GF_CM2_PER_CM, 0.0, 0.0, 0.0, np.zeros(len(P), bool))   # B = 1 N m
    X, c = _cylinder(P, phi, k)
    th, _ = m.theta(X)
    sel = np.abs(P[m.hu] - c).max(1) < inner
    fam = families(P, m.hu, m.hv)
    ref = k * k / 2 * (2 * inner) ** 2
    return np.array([(m.kb * th * th)[sel & (fam == f)].sum() / ref for f in (0, 1)])


@lru_cache(maxsize=None)
def _scale():
    """Rows of the raw coefficient matrix sum to 0.9959 (the inner patch's edge effect); dividing
    by their mean makes B1 = B2 give w = B exactly."""
    return float(np.array([family_energy(0.0), family_energy(math.pi / 2)]).sum(1).mean())


@lru_cache(maxsize=None)
def calibrate():
    """2 x 2 coefficient matrix C: row 0 curvature along x, row 1 along y; columns families 0, 1.
    The energy at weights w is C @ w (in units of k^2/2 x area)."""
    return np.array([family_energy(0.0), family_energy(math.pi / 2)]) / _scale()


def weights(B1, B2):
    """Family weights [N m] (family 0, family 1) that reproduce B1 along x and B2 along y."""
    if B1 == B2:
        return np.array([B1, B1], float)
    C = calibrate()
    w = np.linalg.solve(C, np.array([B1, B2], float))
    if (w <= 0).any():
        raise ValueError(f"non-positive hinge weight {w} for B1/B2 = {B1 / B2:.3f}")
    return w


def bending_profile(B1, B2, phis):
    """Effective cylinder rigidity B(phi) [N m] of the calibrated lattice."""
    w = weights(B1, B2)
    return [float(family_energy(p) @ w) / _scale() for p in phis]


def membrane_blocks(mesh, X):
    """3d's exact 9 x 9 membrane blocks with warp and weft stretch stiffness EA1, EA2."""
    T = mesh.T
    x0, x1, x2 = X[T[:, 0]], X[T[:, 1]], X[T[:, 2]]
    Ds = np.stack([x1 - x0, x2 - x0], axis=2)
    Di = mesh.Dinv
    F = Ds @ Di
    C = np.einsum("mki,mkj->mij", F, F)
    E11, E22, E12 = 0.5 * (C[:, 0, 0] - 1), 0.5 * (C[:, 1, 1] - 1), 0.5 * C[:, 0, 1]
    S = np.empty((len(T), 2, 2))
    S[:, 0, 0], S[:, 1, 1] = mesh.EA1 * E11, mesh.EA2 * E22
    S[:, 0, 1] = S[:, 1, 0] = 2 * mesh.Gs * E12
    DiT = np.transpose(Di, (0, 2, 1))
    m = len(T)
    K = np.empty((m, 9, 9))
    for i in range(3):
        for k in range(3):
            dDs = np.zeros((m, 3, 2))
            if i == 0:
                dDs[:, k, :] = -1.0
            else:
                dDs[:, k, i - 1] = 1.0
            dF = dDs @ Di
            FtdF = np.einsum("mki,mkj->mij", F, dF)
            dE = 0.5 * (FtdF + np.transpose(FtdF, (0, 2, 1)))
            dS = np.empty_like(dE)
            dS[:, 0, 0], dS[:, 1, 1] = mesh.EA1 * dE[:, 0, 0], mesh.EA2 * dE[:, 1, 1]
            dS[:, 0, 1] = dS[:, 1, 0] = 2 * mesh.Gs * dE[:, 0, 1]
            dH = mesh.area[:, None, None] * ((dF @ S + F @ dS) @ DiT)
            col = np.empty((m, 3, 3))
            col[:, 1], col[:, 2] = dH[:, :, 0], dH[:, :, 1]
            col[:, 0] = -dH[:, :, 0] - dH[:, :, 1]
            K[:, :, 3 * i + k] = col.reshape(m, 9)
    return K


def hessian(mesh, X, eps=1e-7):
    fi = -np.ones(mesh.n, int)
    fi[mesh.free] = np.arange(mesh.free.sum())
    hinges = np.column_stack([mesh.hu, mesh.hv, mesh.ho1, mesh.ho2])
    r1, c1, v1 = localhess._coo(mesh.T, membrane_blocks(mesh, X), fi)
    r2, c2, v2 = localhess._coo(hinges, localhess.hinge_blocks(mesh, X, eps), fi)
    m = 3 * int(mesh.free.sum())
    return sps.csc_matrix((np.concatenate([v1, v2]), (np.concatenate([r1, r2]), np.concatenate([c1, c2]))),
                          shape=(m, m))


class OrthoMixin:
    """Mixed into a `fem.Mesh` subclass whose `kb` was built for B = 1 N m (`kb_unit`)."""

    def set_bending(self, B1, B2):
        self.B1, self.B2 = float(B1), float(B2)
        self.fam = families(self.P, self.hu, self.hv)
        self.kb = self.kb_unit * weights(self.B1, self.B2)[self.fam]

    def set_stretch(self, EA1, EA2):
        self.EA1, self.EA2 = float(EA1), float(EA2)
        self.EA = 0.0                      # 3a's isotropic stretch term is replaced, not added to

    def energy_grad(self, v, X):
        E, g = fem.Mesh.energy_grad(self, v, X)     # gravity, shear (EA = 0), bending
        X = X.copy()
        X[self.free] = v.reshape(-1, 3)
        x0, x1, x2 = X[self.T[:, 0]], X[self.T[:, 1]], X[self.T[:, 2]]
        F = np.stack([x1 - x0, x2 - x0], axis=2) @ self.Dinv
        C = np.einsum("mki,mkj->mij", F, F)
        E11, E22 = 0.5 * (C[:, 0, 0] - 1), 0.5 * (C[:, 1, 1] - 1)
        E += (self.area * 0.5 * (self.EA1 * E11 ** 2 + self.EA2 * E22 ** 2)).sum()
        S = np.zeros((len(F), 2, 2))
        S[:, 0, 0], S[:, 1, 1] = self.EA1 * E11, self.EA2 * E22
        H = (self.area[:, None, None] * (F @ S)) @ np.transpose(self.Dinv, (0, 2, 1))
        gX = np.zeros_like(X)
        fem.acc(gX, self.T[:, 1], H[:, :, 0])
        fem.acc(gX, self.T[:, 2], H[:, :, 1])
        fem.acc(gX, self.T[:, 0], -H[:, :, 0] - H[:, :, 1])
        return E, g + gX[self.free].ravel()


class OrthoNewton(localhess.LocalNewton):
    def hessian(self, grad, v, g0, eps):
        X = self.X.copy()
        X[self.free] = v.reshape(-1, 3)
        return hessian(self.mesh, X, eps)
