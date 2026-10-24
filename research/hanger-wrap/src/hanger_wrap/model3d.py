"""3D drape of a garment's shoulder panel over one arm of a hanger.

The cloth is a sheet of nodes on a grid (s along the shoulder line and sleeve, t across it, so the
two halves of the sheet are the front and back panels hanging either side of the arm). It has
stretch and shear springs, a bending energy along both grid directions, gravity, and a penalty
contact against the hanger arm, a bar of circular cross-section with a rounded end. The static
drape is the minimum of that energy, found with the L-BFGS routine of `hanger-fit`.

`hanger-fit` keeps only the seam row (t = 0) and carries the front-and-back fabric as a width of
0.20 m. Here that width is real. The sheet has the same fabric constants and the same total mass
as the 2D chain, so the seam row is directly comparable with the 2D drape.

SI units inside; hanger and garment sizes are given in cm.
"""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "hanger-fit" / "src"))
from hanger_fit.model import (  # noqa: E402,F401
    CM, DEPTH, FABRICS, G, SEG, SIZES, STOCK, Garment, Hanger, garment, lbfgs, neck_point, target,
)
from hanger_fit.model import K_CONTACT as K_CONTACT_2D  # noqa: E402

DS = 0.5 * CM            # node spacing along the seam (the 2D chain uses 0.25 cm)
DT = 0.5 * CM            # node spacing across it
HALF_WIDTH = DEPTH / 2   # the sheet spans t in [-0.10, 0.10] m: the 2D strip's 0.20 m
SHEAR = 0.25             # diagonal spring stiffness as a fraction of the structural one, assumed
K_CONTACT = K_CONTACT_2D * (DS * DT) / (SEG * DEPTH)   # per node; same stiffness per unit area


class Sheet:
    """Grid, masses and spring constants of a garment's sheet. Node (i, j): s = i*DS, t = (j-nt//2)*DT."""

    def __init__(self, g, ds=DS, dt=DT):
        Ls = (g.half_shoulder - g.neck) / math.cos(math.radians(g.slope)) * CM
        L = Ls + g.sleeve_len * CM
        self.ns = int(round(L / ds)) + 1
        self.nt = 2 * int(round(HALF_WIDTH / dt)) + 1
        self.ds, self.dt = ds, dt
        self.s = np.arange(self.ns) * ds
        self.t = (np.arange(self.nt) - self.nt // 2) * dt
        self.Ls = Ls
        row = np.zeros(self.ns)                       # kg per s-row, as in the 2D chain
        on_sh = self.s <= Ls + 1e-12
        row[on_sh] = g.body / 1000.0 / on_sh.sum()
        row[~on_sh] = g.sleeve * (ds / CM) / 1000.0
        row[-1] += g.lump / 1000.0
        self.m = row[:, None] / self.nt * np.ones((1, self.nt))
        B = g.B * 9.80665e-3 * 1e-4 / 1e-2            # gf*cm^2/cm -> N*m^2/m
        self.ks_s, self.ks_t = g.EA * dt / ds, g.EA * ds / dt
        self.kd = SHEAR * g.EA
        self.kb_s, self.kb_t = B * dt / ds, B * ds / dt
        self.ld = math.hypot(ds, dt)
        self.g = g


def _closest3(X, P):
    """Closest points on polyline P (m,3) to X (N,3): (points, distances)."""
    A, D = P[:-1], P[1:] - P[:-1]
    dd = (D * D).sum(1)
    t = np.clip(((X[:, None, :] - A[None]) * D[None]).sum(2) / dd[None], 0.0, 1.0)
    Q = A[None] + t[..., None] * D[None]
    d2 = ((X[:, None, :] - Q) ** 2).sum(2)
    j = d2.argmin(1)
    i = np.arange(len(X))
    return Q[i, j], np.sqrt(d2[i, j])


def _spring(X, a, b, k, l0, gX):
    """Spring energy between the node blocks X[a] and X[b] (slices); accumulates into gX."""
    e = X[b] - X[a]
    L = np.sqrt((e * e).sum(-1))
    f = k * (L - l0)
    fe = (f / L)[..., None] * e
    gX[b] += fe
    gX[a] -= fe
    return 0.5 * (f * (L - l0)).sum()


def _bend(X, a, b, c, kb, gX):
    """Bending energy kb*(1 - cos(angle)) at node b between edges a->b and b->c (0.5 kb phi^2 if small)."""
    u, v = X[b] - X[a], X[c] - X[b]
    nu, nv = np.sqrt((u * u).sum(-1)), np.sqrt((v * v).sum(-1))
    cs = (u * v).sum(-1) / (nu * nv)
    du = v / (nu * nv)[..., None] - (cs / nu ** 2)[..., None] * u      # d cos / d u
    dv = u / (nu * nv)[..., None] - (cs / nv ** 2)[..., None] * v      # d cos / d v
    gX[a] += kb * du
    gX[b] += kb * (dv - du)
    gX[c] -= kb * dv
    return kb * (1.0 - cs).sum()


def energy_grad(Y, X0, sh, P, rc):
    """Energy and gradient for the free nodes Y (flat); the neck row s = 0 is pinned at X0 (nt, 3)."""
    ns, nt = sh.ns, sh.nt
    X = np.empty((ns, nt, 3))
    free = np.ones((ns, nt), bool)
    free[0] = False
    X[free] = Y.reshape(-1, 3)
    X[0] = X0
    gX = np.zeros_like(X)
    E = G * (sh.m * X[..., 1]).sum()
    gX[..., 1] += G * sh.m
    S, T0 = slice(None, -1), slice(1, None)
    A, M, C = slice(None, -2), slice(1, -1), slice(2, None)
    # stretch along s and t, and the two diagonals (shear)
    E += _spring(X, (S, slice(None)), (T0, slice(None)), sh.ks_s, sh.ds, gX)
    E += _spring(X, (slice(None), S), (slice(None), T0), sh.ks_t, sh.dt, gX)
    E += _spring(X, (S, S), (T0, T0), sh.kd, sh.ld, gX)
    E += _spring(X, (S, T0), (T0, S), sh.kd, sh.ld, gX)
    E += _bend(X, (A, slice(None)), (M, slice(None)), (C, slice(None)), sh.kb_s, gX)
    E += _bend(X, (slice(None), A), (slice(None), M), (slice(None), C), sh.kb_t, gX)
    Q, d = _closest3(X.reshape(-1, 3), P)
    pen = np.maximum(rc - d, 0.0)
    E += 0.5 * K_CONTACT * (pen * pen).sum()
    on = pen > 0
    if on.any():
        u = (X.reshape(-1, 3)[on] - Q[on]) / np.maximum(d[on], 1e-12)[:, None]
        gflat = gX.reshape(-1, 3)
        gflat[on] -= (K_CONTACT * pen[on])[:, None] * u
    return E, gX[free].ravel()


def centreline3(h, n=48):
    P = h.centreline(n)
    return np.column_stack([P, np.zeros(len(P))])


def initial(h, sh, X0):
    """Start: the sheet wrapped over the arm like a cloth thrown over a bar, then hanging straight down."""
    from hanger_fit.model import initial as init2
    p = init2(h, X0[:2], sh.s)                       # seam path in the frontal plane (ns, 2)
    P = h.centreline(96)
    rc = h.r * CM
    Q, d = _closest3(np.column_stack([p, np.zeros(len(p))]), np.column_stack([P, np.zeros(len(P))]))
    cen = Q[:, :2].copy()
    nh = p - cen
    nrm = np.sqrt((nh * nh).sum(1))
    nh = np.where(nrm[:, None] > 1e-9, nh / np.maximum(nrm, 1e-9)[:, None], np.array([0.0, 1.0]))
    w = np.clip(1.0 - nh[:, 1], 0.0, 1.0)[:, None]      # 0 on top of the arm, 1 round the end cap and below
    X = np.empty((sh.ns, sh.nt, 3))
    sg = np.sign(sh.t)[None, :]
    a = np.abs(sh.t)[None, :]
    th = np.minimum(a / rc, math.pi / 2)
    drop = np.maximum(a - rc * math.pi / 2, 0.0)
    wrap = np.stack([cen[:, 0, None] + rc * np.cos(th) * nh[:, 0, None],
                     cen[:, 1, None] + rc * np.cos(th) * nh[:, 1, None] - drop + 0 * a,
                     sg * rc * np.sin(th) + 0 * cen[:, :1]], -1)
    flat = np.stack([p[:, 0, None] + 0 * a, p[:, 1, None] + 0 * a, sg * a + 0 * p[:, :1]], -1)
    X[:] = (1 - w)[..., None] * wrap + w[..., None] * flat
    X[..., 2] += sg * 1e-4
    X[0, sh.nt // 2] = X0
    return X


def neck3(h, g):
    p = neck_point(h, g)
    return np.array([p[0], p[1], 0.0])


def drape(h, g, iters=2000, sh=None, tol=1e-6, start=None):
    """Static drape: node positions (ns, nt, 3) in metres, the sheet, and the iterations used.

    `start` continues from an earlier drape of the same garment and hanger (the solver restarts)."""
    sh = sh or Sheet(g)
    P = centreline3(h)
    rc = h.r * CM
    X = initial(h, sh, neck3(h, g))
    X0 = X[0].copy()                      # the neck row stays where it first sits on the arm
    free = np.ones((sh.ns, sh.nt), bool)
    free[0] = False
    if start is not None:
        X = start
    fg = lambda y: energy_grad(y, X0, sh, P, rc)
    y, it = lbfgs(fg, X[free].ravel(), iters=iters, tol=tol)
    out = X.copy()
    out[free] = y.reshape(-1, 3)
    return out, sh, it


def score(X, sh, g):
    """Seam-row shape error (cm RMS, as in hanger-fit), sharpest bends along and across the seam (deg/cm)."""
    mid = sh.nt // 2
    seam = X[:, mid, :]
    T = target(g, sh.s) + seam[0, :2]
    keep = sh.s <= sh.s[-1] - 5 * CM if g.sleeve_len > 10 else np.ones(sh.ns, bool)
    err = math.sqrt(((seam[keep, :2] - T[keep]) ** 2).sum(1).mean()) / CM
    return dict(err=err, crease=_crease(seam, sh.ds), cross=_cross(X, sh), strain=_strain(X, sh))


def _crease(line, l0):
    e = line[1:] - line[:-1]
    a, b = e[:-1], e[1:]
    cs = (a * b).sum(1) / np.sqrt((a * a).sum(1) * (b * b).sum(1))
    phi = np.arccos(np.clip(cs, -1.0, 1.0))
    w = max(1, int(round(CM / l0)))
    return math.degrees(np.convolve(phi, np.ones(w), "valid").max())


def _cross(X, sh):
    """Sharpest bend across the arm (t direction) over the rows that lie on the shoulder line."""
    rows = np.nonzero(sh.s <= sh.Ls)[0]
    return max(_crease(X[i], sh.dt) for i in rows[::4])


def _strain(X, sh):
    e = X[1:] - X[:-1]
    return float((np.sqrt((e * e).sum(-1)) / sh.ds - 1).max())
