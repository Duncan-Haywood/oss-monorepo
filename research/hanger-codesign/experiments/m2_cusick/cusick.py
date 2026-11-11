"""A simulated Cusick drape test on the programme's 3D cloth-sheet model.

The Cusick drape tester (Cusick 1968; BS 5058, ISO 9073-9 use the same geometry) clamps a
circular specimen of radius R_SPEC = 15 cm between two discs of radius R_DISC = 9 cm and lets the
overhang fall under its own weight. The drape coefficient is the share of the overhang annulus
that the hanging specimen's shadow still covers:

    DC = (A_shadow - A_disc) / (A_specimen - A_disc),

1 for a rigid sheet and towards 0 for one that hangs straight down.

The sheet is the same spring-and-turning-angle model as `hanger-3d`'s `Sheet` (stretch springs
along a square grid, diagonal shear springs at SHEAR of the stretch stiffness, gravity), meshed
here on a square grid cut to the specimen's circle. One change: `Sheet` bends only along its two
grid directions, which makes bending about an axis at 45 degrees half as stiff as along the grid.
Here bending is also charged along both diagonals, with weights chosen so that the energy density
of a cylindrical bend of curvature k is B k^2 / 2 in every direction (sum of cos^4 over four
directions 45 degrees apart is 3/2, so the axis lines carry 2B/3 and the diagonals B/3). Nodes
inside the clamp radius are fixed; there is no friction or contact with the lower disc's edge,
which the clamped sheet does not reach in a static drape.

Units are SI inside; B in gf cm^2/cm and W in mg/cm^2 at the interface, as `hanger-kes` gives them.
"""
import math
import sys
from pathlib import Path

import numpy as np

R = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(R / "hanger-fit" / "src")]
from hanger_fit.model import G, lbfgs  # noqa: E402

R_SPEC, R_DISC = 0.15, 0.09
SHEAR = 0.1                   # as hanger-3d's Sheet, assumed
GF_CM2_PER_CM = 9.80665e-3 * 1e-4 / 1e-2     # gf cm^2/cm -> N m^2/m (= N m)
MG_PER_CM2 = 1e-6 / 1e-4                      # mg/cm^2 -> kg/m^2


def bending_length(B, W):
    """Peirce bending length c = (B / w)^(1/3) in cm, B in gf cm^2/cm, W in mg/cm^2."""
    return (B / (W * 1e-3)) ** (1.0 / 3.0)


def acc(gX, ix, val):
    """gX[ix] += val with repeated indices (faster than np.add.at)."""
    n = len(gX)
    for k in range(3):
        gX[:, k] += np.bincount(ix, val[:, k], minlength=n)


class Specimen:
    def __init__(self, B, W, EA, h=0.005, shear=SHEAR, cut=None):
        self.h = h
        self.cut = cut = R_SPEC + 0.5 * h if cut is None else cut
        m = int(math.floor(cut / h + 1e-9))
        ii, jj = np.meshgrid(np.arange(-m, m + 1), np.arange(-m, m + 1), indexing="ij")
        inside = (ii * h) ** 2 + (jj * h) ** 2 <= cut ** 2 + 1e-12
        idx = -np.ones(inside.shape, int)
        idx[inside] = np.arange(inside.sum())
        self.X0 = np.column_stack([ii[inside] * h, jj[inside] * h, np.zeros(inside.sum())])
        self.n = len(self.X0)
        rho = np.hypot(self.X0[:, 0], self.X0[:, 1])
        self.rho0 = rho
        self.free = rho > R_DISC + 1e-12
        self.mass = np.full(self.n, W * MG_PER_CM2 * h * h)

        P = np.pad(idx, 2, constant_values=-1)
        s0, s1 = idx.shape

        def shift(di, dj):
            return P[2 + di:2 + di + s0, 2 + dj:2 + dj + s1]

        def pairs(di, dj):
            a, b = idx, shift(di, dj)
            ok = (a >= 0) & (b >= 0)
            return a[ok], b[ok]

        def triples(di, dj):
            a, b, c = idx, shift(di, dj), shift(2 * di, 2 * dj)
            ok = (a >= 0) & (b >= 0) & (c >= 0)
            return a[ok], b[ok], c[ok]

        B_si = B * GF_CM2_PER_CM
        self.springs = []
        for (di, dj), L0, k in [((1, 0), h, EA), ((0, 1), h, EA),
                                ((1, 1), h * math.sqrt(2), shear * EA), ((1, -1), h * math.sqrt(2), shear * EA)]:
            a, b = pairs(di, dj)
            self.springs.append((a, b, L0, k))
        self.bends = []
        for (di, dj), kb in [((1, 0), 2 * B_si / 3), ((0, 1), 2 * B_si / 3),
                             ((1, 1), B_si / 3), ((1, -1), B_si / 3)]:
            # line curvature k_l: axis triple, 0.5 kb (k_l h)^2 per h^2 -> (B/3) k_l^2;
            # diagonal triple, 0.5 kb (k_l h sqrt2)^2 per h^2 = kb k_l^2 -> (B/3) k_l^2 too
            a, b, c = triples(di, dj)
            self.bends.append((a, b, c, kb))
        # triangles for the shadow raster: each grid square with all four corners inside
        q = (idx[:-1, :-1] >= 0) & (idx[1:, :-1] >= 0) & (idx[:-1, 1:] >= 0) & (idx[1:, 1:] >= 0)
        p00, p10, p01, p11 = idx[:-1, :-1][q], idx[1:, :-1][q], idx[:-1, 1:][q], idx[1:, 1:][q]
        self.tris = np.vstack([np.column_stack([p00, p10, p11]), np.column_stack([p00, p11, p01])])

    def energy_grad(self, v, X):
        X = X.copy()
        X[self.free] = v.reshape(-1, 3)
        gX = np.zeros_like(X)
        E = G * (self.mass * X[:, 2]).sum()
        gX[:, 2] += G * self.mass
        for a, b, L0, k in self.springs:
            e = X[b] - X[a]
            L = np.sqrt((e * e).sum(1))
            f = k * (L - L0)
            E += 0.5 * (f * (L - L0)).sum()
            fe = (f / np.maximum(L, 1e-15))[:, None] * e
            acc(gX, a, -fe)
            acc(gX, b, fe)
        for a, b, c, kb in self.bends:
            u, w = X[b] - X[a], X[c] - X[b]
            cr = np.cross(u, w)
            cn = np.sqrt((cr * cr).sum(1))
            d = (u * w).sum(1)
            phi = np.arctan2(cn, d)
            E += 0.5 * kb * (phi * phi).sum()
            chat = cr / np.maximum(cn, 1e-30)[:, None]
            den = (cn * cn + d * d)[:, None]
            dpu = (d[:, None] * np.cross(w, chat) - cn[:, None] * w) / den
            dpw = (d[:, None] * np.cross(chat, u) - cn[:, None] * u) / den
            cc = (kb * phi)[:, None]
            acc(gX, a, -cc * dpu)
            acc(gX, b, cc * (dpu - dpw))
            acc(gX, c, cc * dpw)
        return E, gX[self.free].ravel()

    def start(self, seed, amp=0.002, slope=0.05):
        """Flat specimen with the overhang tilted down by `slope` and random vertical noise of
        `amp` metres (rms) that grows with distance from the clamp; the seed picks the folds."""
        rng = np.random.default_rng(seed)
        X = self.X0.copy()
        t = np.clip((self.rho0 - R_DISC) / (R_SPEC - R_DISC), 0, 1)
        X[:, 2] = -slope * (self.rho0 - R_DISC).clip(0) + amp * t * rng.standard_normal(self.n)
        return X

    def shadow_area(self, X, px=0.001, sub=14):
        """Area (m^2) of the xy projection of the sheet, rasterised at `px` from `sub`-fold
        barycentric samples of every triangle."""
        P = X[:, :2]
        t = self.tris
        a, b, c = P[t[:, 0]], P[t[:, 1]], P[t[:, 2]]
        u = np.arange(sub + 1) / sub
        U, V = np.meshgrid(u, u, indexing="ij")
        ok = U + V <= 1 + 1e-12
        U, V = U[ok], V[ok]
        pts = a[:, None, :] + U[None, :, None] * (b - a)[:, None, :] + V[None, :, None] * (c - a)[:, None, :]
        q = np.floor(pts.reshape(-1, 2) / px).astype(np.int64)
        key = q[:, 0] * 1_000_003 + q[:, 1]
        return len(np.unique(key)) * px * px

    def flat_area(self):
        if not hasattr(self, "_flat"):
            self._flat = self.shadow_area(self.X0)
        return self._flat

    def dc(self, X):
        Ad = math.pi * R_DISC ** 2
        As = self.flat_area()
        return (self.shadow_area(X) - Ad) / (As - Ad)


def nodes(X, sp, ring=0.13):
    """Number of folds: local maxima of the projected radius of the material at clamp-plane
    radius >= `ring`, read on 2-degree bins around the specimen and smoothed over 5 bins."""
    th = np.arctan2(X[:, 1], X[:, 0])
    r = np.hypot(X[:, 0], X[:, 1])
    sel = sp.rho0 >= ring
    bins = 180
    k = ((th[sel] + math.pi) / (2 * math.pi) * bins).astype(int) % bins
    rmax = np.zeros(bins)
    np.maximum.at(rmax, k, r[sel])
    for i in np.where(rmax == 0)[0]:
        rmax[i] = rmax[i - 1]
    sm = np.convolve(np.concatenate([rmax[-2:], rmax, rmax[:2]]), np.ones(5) / 5, "valid")
    pk = (sm > np.roll(sm, 1)) & (sm >= np.roll(sm, -1))
    prom = sm.max() - sm.min()
    if prom < 0.003:
        return 0
    return int(pk.sum())


def solve(sp, seed=0, chunk=2000, tol=0.001, maxit=40000):
    """Chunked L-BFGS solve of specimen `sp` until DC moves under `tol` over a chunk."""
    X = sp.start(seed)
    v = X[sp.free].ravel()
    traj, total = [], 0
    while total < maxit:
        v, used = lbfgs(lambda u: sp.energy_grad(u, X), v, iters=chunk, tol=1e-7)
        total += used
        X[sp.free] = v.reshape(-1, 3)
        traj.append((total, sp.dc(X)))
        if used < chunk or (len(traj) > 1 and abs(traj[-1][1] - traj[-2][1]) < tol):
            break
    _, g = sp.energy_grad(v, X)
    last = abs(traj[-1][1] - traj[-2][1]) if len(traj) > 1 else 0.0
    return dict(dc=traj[-1][1], iters=total, last_change=last, gmax=float(np.abs(g).max()),
                nodes=nodes(X, sp), X=X, drop=float(-X[:, 2].min() * 100), traj=traj)


def drape(B, W, EA, seed=0, h=0.005, shear=SHEAR, **kw):
    """Simulated Cusick test of a fabric (B gf cm^2/cm, W mg/cm^2, EA N/m)."""
    return solve(Specimen(B, W, EA, h=h, shear=shear), seed, **kw)
