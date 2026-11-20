"""A nonconforming (Crouzeix-Raviart, edge-midpoint) cloth element for the Cusick specimen.

Why: milestone 4c found that milestone 3a's conforming constant-strain triangle locks on these
fabrics (stretch energy falls as EA^-0.06 to EA^-0.31 instead of EA^-1, over eight doublings of EA,
and refinement does not cure it), which buys about +0.044 of 4a's +0.15 over-drape. The cause is
counting: a linear triangle on a triangulated surface has about 2 triangles per node, so 6
in-plane strain constraints per node against 3 degrees of freedom, and an inextensible fold is
then out of reach. English and Bridson (2008) move the degrees of freedom to the edge midpoints
(the Crouzeix-Raviart space): about 3 edges per node give 9 degrees of freedom per node against
the same 6 constraints, so the discrete surface can bend isometrically.

Element (this file):
  Unknowns: the positions of the edge midpoints of 3a's lattice. On each original triangle
  (i, j, k) the field is the linear interpolant of its three edge midpoints m_ij, m_jk, m_ki; the
  midpoint triangle is the original one scaled by 1/2 and turned by 180 degrees, so its
  deformation gradient is the field's and the membrane energy is 3a's Saint Venant-Kirchhoff
  psi = EA (E11^2 + E22^2) / 2 + 2 G E12^2 integrated over the original triangle's area.
  Neighbouring triangles share a midpoint, not an edge: the field is continuous only at
  midpoints (nonconforming).
  Gravity: each midpoint carries a third of the mass of each triangle it belongs to (the
  integral of the Crouzeix-Raviart basis function).
  Bending: one hinge per interior edge e = (u, v) of the original mesh, on the two midpoint
  triangles that share m_e. theta is the signed angle between their normals about the axis
  parallel to e (each midpoint triangle has a side parallel to e by the midsegment theorem; the
  axis is the sum of the two), and E_e = kb theta^2 with kb = kappa B |e|^2 / (2 (A1 + A2)), 3a's
  weight times a lattice constant kappa fixed by `calibrate_kappa` so that the energy of a
  cylinder of curvature k is B k^2 / 2 per unit area (test_m4d checks four axis angles).
  Clamp: a midpoint is fixed when both endpoints of its edge lie on the 18 cm disc, so every
  triangle inside the disc is rigid.
  Output: vertex positions are rebuilt from the midpoints (vertex i of triangle ijk is
  m_ij + m_ki - m_jk, averaged over the triangles at i; exact for any affine field), and the
  shadow area, DC and fold count are measured on them exactly as 3a measures its nodes.

Reference: E. English and R. Bridson (2008), Animating developable surfaces using nonconforming
elements, ACM Trans. Graph. 27(3), 66, doi:10.1145/1360612.1360665; M. Crouzeix and P.-A. Raviart
(1973), RAIRO Analyse numerique 7(R3), 33-75, doi:10.1051/m2an/197307R300331.
"""
import importlib.util
import math
from pathlib import Path

import numpy as np
import scipy.sparse as sps

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
_s = importlib.util.spec_from_file_location("m4a_run_cr", EXP / "m4a_measured_drape" / "run.py")
m4a = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m4a)
fabrics, fem, localhess, cusick, newton = m4a.fabrics, m4a.fem, m4a.localhess, m4a.cusick, m4a.localhess.newton

KAPPA = None   # set on first use by calibrate_kappa()
GAMMA = 1e-2   # in-plane jump penalty weight per interior edge, ks = GAMMA * G (see _jump_grad, CRMesh.ks)
PREF = "G"


def _theta_grad(A, B1, C1, B2, C2):
    """Signed hinge angle and its gradient (h x 5 x 3) on the five midpoints of each hinge."""
    e1a, e1b = B1 - A, C1 - A
    e2a, e2b = B2 - A, C2 - A
    n1 = np.cross(e1a, e1b)
    n2 = np.cross(e2a, e2b)
    ax = (B1 - C1) + (C2 - B2)
    al = np.sqrt((ax * ax).sum(1))[:, None]
    ah = ax / al
    cr = np.cross(n1, n2)
    s = (cr * ah).sum(1)
    c = (n1 * n2).sum(1)
    th = np.arctan2(s, c)
    q = (s * s + c * c)[:, None]
    cc, ss = c[:, None], s[:, None]
    gn1 = (cc * np.cross(n2, ah) - ss * n2) / q
    gn2 = (cc * np.cross(ah, n1) - ss * n1) / q
    ga = cc * (cr - (cr * ah).sum(1)[:, None] * ah) / al / q
    gB1 = np.cross(e1b, gn1) + ga
    gC1 = np.cross(gn1, e1a) - ga
    gB2 = np.cross(e2b, gn2) - ga
    gC2 = np.cross(gn2, e2a) + ga
    gA = -(np.cross(e1b, gn1) + np.cross(gn1, e1a) + np.cross(e2b, gn2) + np.cross(gn2, e2a))
    return th, np.stack([gA, gB1, gC1, gB2, gC2], axis=1)


def _jump_grad(A, B1, C1, B2, C2):
    """In-plane jump of the field across each hinge's edge and the gradient of its square.

    Each midpoint triangle predicts the edge's end points as m_e -+ its midsegment parallel to e
    (B1 - C1 in t1, C2 - B2 in t2); J = (B1 - C1) - (C2 - B2) is the jump of that prediction
    between the two sides (zero for any affine field). Only its component in the mean tangent
    plane, P J with P = I - n n^T and n the normalised sum of the two unit normals, is returned:
    the normal component is first order in the hinge angle and would lock bending, the tangential
    one is second order."""
    J = (B1 - C1) - (C2 - B2)
    e1a, e1b, e2a, e2b = B1 - A, C1 - A, B2 - A, C2 - A
    n1, n2 = np.cross(e1a, e1b), np.cross(e2a, e2b)
    l1 = np.sqrt((n1 * n1).sum(1))[:, None]
    l2 = np.sqrt((n2 * n2).sum(1))[:, None]
    u1, u2 = n1 / l1, n2 / l2
    m = u1 + u2
    lm = np.sqrt((m * m).sum(1))[:, None]
    nh = m / lm
    nJ = (nh * J).sum(1)[:, None]
    PJ = J - nJ * nh
    j2 = (PJ * PJ).sum(1)
    gnh = -2 * nJ * PJ
    gm = (gnh - (gnh * nh).sum(1)[:, None] * nh) / lm
    gn1 = (gm - (gm * u1).sum(1)[:, None] * u1) / l1
    gn2 = (gm - (gm * u2).sum(1)[:, None] * u2) / l2
    gJ = 2 * PJ
    gB1 = np.cross(e1b, gn1) + gJ
    gC1 = np.cross(gn1, e1a) - gJ
    gB2 = np.cross(e2b, gn2) + gJ
    gC2 = np.cross(gn2, e2a) - gJ
    gA = -(np.cross(e1b, gn1) + np.cross(gn1, e1a) + np.cross(e2b, gn2) + np.cross(gn2, e2a))
    return j2, np.stack([gA, gB1, gC1, gB2, gC2], axis=1)


def hinge_grad(P5, kb, ks):
    """Gradient (h x 5 x 3) of kb theta^2 + ks |P J|^2 per hinge."""
    th, g = _theta_grad(*P5)
    j2, gj = _jump_grad(*P5)
    return (2 * kb * th)[:, None, None] * g + ks * gj


class CRMesh:
    """Nonconforming cloth on the vertex mesh (Pv, Tv): unknowns at edge midpoints."""

    def __init__(self, Pv, Tv, B, W, EA, Gs, vfixed, kappa=None, gamma=GAMMA, pref=PREF):
        self.Pv, self.Tv = np.asarray(Pv, float), np.asarray(Tv, int)
        self.nv = len(self.Pv)
        eid, edges, opp = {}, [], {}
        Tm = np.empty_like(self.Tv)
        for t, (i, j, k) in enumerate(self.Tv):
            for slot, (u, v, o) in enumerate(((i, j, k), (j, k, i), (k, i, j))):
                key = (min(u, v), max(u, v))
                if key not in eid:
                    eid[key] = len(edges)
                    edges.append(key)
                Tm[t, slot] = eid[key]
                opp.setdefault(key, []).append((t, u, v, o))
        self.edges = np.array(edges, int)
        self.eid = eid
        self.n = len(edges)
        self.P = 0.5 * (self.Pv[self.edges[:, 0]] + self.Pv[self.edges[:, 1]])
        self.X0 = np.column_stack([self.P, np.zeros(self.n)])
        self.T = Tm                                            # midpoint triangles (ccw: a 180-degree turn)
        a, b, c = (self.P[Tm[:, i]] for i in range(3))
        Dm = np.stack([b - a, c - a], axis=2)
        det = Dm[:, 0, 0] * Dm[:, 1, 1] - Dm[:, 0, 1] * Dm[:, 1, 0]
        if (det <= 0).any():
            raise ValueError("midpoint triangles must be counter-clockwise")
        self.Dinv = np.linalg.inv(Dm)
        va, vb, vc = (self.Pv[self.Tv[:, i]] for i in range(3))
        self.area = 0.5 * ((vb - va)[:, 0] * (vc - va)[:, 1] - (vb - va)[:, 1] * (vc - va)[:, 0])
        self.EA, self.Gs = float(EA), float(Gs)
        w = W * fem.MG_PER_CM2
        self.mass = np.zeros(self.n)
        for i in range(3):
            self.mass += np.bincount(Tm[:, i], self.area * w / 3, minlength=self.n)
        vfixed = np.asarray(vfixed, bool)
        self.fixed = vfixed[self.edges].all(1)
        self.free = ~self.fixed
        h = []
        for key, lst in opp.items():
            if len(lst) == 2:
                (t1, u, v, o1), (t2, _, _, o2) = lst
                f = lambda p, q: eid[(min(p, q), max(p, q))]
                h.append((f(u, v), f(v, o1), f(o1, u), f(u, o2), f(o2, v), t1, t2, u, v))
        h = np.array(h, int)
        self.H5 = h[:, :5]
        el2 = ((self.Pv[h[:, 8]] - self.Pv[h[:, 7]]) ** 2).sum(1)
        self.kb0 = B * fem.GF_CM2_PER_CM * el2 / (2 * (self.area[h[:, 5]] + self.area[h[:, 6]]))
        self.kappa = calibrate_kappa() if kappa is None else kappa
        self.kb = self.kappa * self.kb0
        self.gamma, self.pref = float(gamma), pref
        # vertex rebuild: vertex i of triangle (i,j,k) = m_ij + m_ki - m_jk
        self._vcount = np.bincount(self.Tv.ravel(), minlength=self.nv).astype(float)

    def ks(self):
        """Weight of the in-plane jump penalty: gamma times the shear rigidity G (pref 'G') or
        times the stretch stiffness EA (pref 'EA')."""
        return self.gamma * (self.Gs if self.pref == "G" else self.EA)

    # ---- energy -------------------------------------------------------------------------
    def theta(self, X):
        th, _ = _theta_grad(*(X[self.H5[:, i]] for i in range(5)))
        return th

    def membrane(self, X):
        x0, x1, x2 = X[self.T[:, 0]], X[self.T[:, 1]], X[self.T[:, 2]]
        F = np.stack([x1 - x0, x2 - x0], axis=2) @ self.Dinv
        C = np.einsum("mki,mkj->mij", F, F)
        return F, 0.5 * (C[:, 0, 0] - 1), 0.5 * (C[:, 1, 1] - 1), 0.5 * C[:, 0, 1]

    def energy_grad(self, v, X):
        X = X.copy()
        X[self.free] = v.reshape(-1, 3)
        gX = np.zeros_like(X)
        E = fem.GRAV * (self.mass * X[:, 2]).sum()
        gX[:, 2] += fem.GRAV * self.mass
        F, E11, E22, E12 = self.membrane(X)
        psi = 0.5 * self.EA * (E11 ** 2 + E22 ** 2) + 2 * self.Gs * E12 ** 2
        E += (self.area * psi).sum()
        S = np.empty((len(F), 2, 2))
        S[:, 0, 0], S[:, 1, 1] = self.EA * E11, self.EA * E22
        S[:, 0, 1] = S[:, 1, 0] = 2 * self.Gs * E12
        Hm = (self.area[:, None, None] * (F @ S)) @ np.transpose(self.Dinv, (0, 2, 1))
        fem.acc(gX, self.T[:, 1], Hm[:, :, 0])
        fem.acc(gX, self.T[:, 2], Hm[:, :, 1])
        fem.acc(gX, self.T[:, 0], -Hm[:, :, 0] - Hm[:, :, 1])
        P5 = [X[self.H5[:, i]] for i in range(5)]
        th, g = _theta_grad(*P5)
        j2, gj = _jump_grad(*P5)
        ks = self.ks()
        E += (self.kb * th * th).sum() + ks * j2.sum()
        gg = (2 * self.kb * th)[:, None, None] * g + ks * gj
        for i in range(5):
            fem.acc(gX, self.H5[:, i], gg[:, i])
        return E, gX[self.free].ravel()

    def split(self, X):
        F, E11, E22, E12 = self.membrane(X)
        th = self.theta(X)
        j2, _ = _jump_grad(*(X[self.H5[:, i]] for i in range(5)))
        free = self.free[self.T].any(1)
        em = np.maximum(np.abs(E11), np.abs(E22))[free]
        return dict(grav=float(fem.GRAV * (self.mass * X[:, 2]).sum()),
                    stretch=float((self.area * 0.5 * self.EA * (E11 ** 2 + E22 ** 2)).sum()),
                    shear=float((self.area * 2 * self.Gs * E12 ** 2).sum()),
                    bend=float((self.kb * th * th).sum()),
                    stab=float(self.ks() * j2.sum()),
                    eps99=float(np.quantile(em, 0.99)), epsmax=float(em.max()))

    # ---- Hessian -----------------------------------------------------------------------
    def hinge_blocks(self, X, eps=1e-7):
        P = [X[self.H5[:, i]] for i in range(5)]
        h = len(self.H5)
        ks = self.ks()
        K = np.empty((h, 15, 15))
        for i in range(5):
            for k in range(3):
                Pp = [p.copy() for p in P]
                Pm = [p.copy() for p in P]
                Pp[i][:, k] += eps
                Pm[i][:, k] -= eps
                K[:, :, 3 * i + k] = ((hinge_grad(Pp, self.kb, ks) - hinge_grad(Pm, self.kb, ks)) / (2 * eps)).reshape(h, 15)
        return 0.5 * (K + np.transpose(K, (0, 2, 1)))

    def hessian(self, X, eps=1e-7):
        fi = -np.ones(self.n, int)
        fi[self.free] = np.arange(self.free.sum())
        r1, c1, v1 = localhess._coo(self.T, localhess.membrane_blocks(self, X), fi)
        r2, c2, v2 = localhess._coo(self.H5, self.hinge_blocks(X, eps), fi)
        m = 3 * int(self.free.sum())
        return sps.csc_matrix((np.concatenate([v1, v2]), (np.concatenate([r1, r2]), np.concatenate([c1, c2]))),
                              shape=(m, m))

    # ---- output on rebuilt vertices ------------------------------------------------------
    def vertices(self, X):
        T, M = self.Tv, self.T          # M[t] = (m_ij, m_jk, m_ki)
        V = np.zeros((self.nv, 3))
        for vi, (pa, pb, po) in ((0, (0, 2, 1)), (1, (0, 1, 2)), (2, (1, 2, 0))):
            est = X[M[:, pa]] + X[M[:, pb]] - X[M[:, po]]
            for k in range(3):
                V[:, k] += np.bincount(T[:, vi], est[:, k], minlength=self.nv)
        return V / self._vcount[:, None]


class _VertexView:
    """What `cusick.Specimen.shadow_area` and `cusick.nodes` read, on the rebuilt vertices."""

    def __init__(self, tris, rho0):
        self.tris, self.rho0 = tris, rho0


class CRDisc(CRMesh):
    """4a's Cusick specimen (`FabricDisc`) with the nonconforming element."""

    def __init__(self, code, ea, a, bsrc="fast", kappa=None, gamma=GAMMA, pref=PREF):
        if bsrc.startswith("x"):
            B = float(bsrc[1:]) * fabrics.b_fast(code) / fem.GF_CM2_PER_CM
        else:
            B = (fabrics.b_fast if bsrc == "fast" else fabrics.b_kes)(code) / fem.GF_CM2_PER_CM
        W = fabrics.weight(code) / 10.0
        cut = cusick.R_SPEC + 0.5 * a
        P, T = fem.lattice(a, (-cut - a, cut + a), (-cut - a, cut + a))
        P, T = fem.keep(P, T, np.hypot(P[:, 0], P[:, 1]) <= cut + 1e-12)
        rv = np.hypot(P[:, 0], P[:, 1])
        super().__init__(P, T, B, W, ea, fabrics.g_fast(code), rv <= cusick.R_DISC + 1e-12, kappa, gamma, pref)
        self.rho0 = np.hypot(self.P[:, 0], self.P[:, 1])
        self.view = _VertexView(self.Tv, rv)
        self.Xv0 = np.column_stack([P, np.zeros(len(P))])

    def start(self, seed, amp=0.002, slope=0.05):
        rng = np.random.default_rng(seed)
        X = self.X0.copy()
        t = np.clip((self.rho0 - cusick.R_DISC) / (cusick.R_SPEC - cusick.R_DISC), 0, 1)
        X[:, 2] = -slope * (self.rho0 - cusick.R_DISC).clip(0) + amp * t * rng.standard_normal(self.n)
        X[self.fixed, 2] = 0.0
        return X

    def dc(self, X):
        Ad = math.pi * cusick.R_DISC ** 2
        if not hasattr(self, "_flat"):
            self._flat = cusick.Specimen.shadow_area(self.view, self.Xv0)
        return (cusick.Specimen.shadow_area(self.view, self.vertices(X)) - Ad) / (self._flat - Ad)

    def folds(self, X):
        return cusick.nodes(self.vertices(X), self.view)


class CRNewton(newton.Newton):
    """3a's damped Newton step rule with the nonconforming element's local Hessian."""

    def __init__(self, mesh, X):
        self.mesh, self.X, self.free = mesh, X, mesh.free

    def hessian(self, grad, v, g0, eps):
        X = self.X.copy()
        X[self.free] = v.reshape(-1, 3)
        return self.mesh.hessian(X, eps)


def cylinder(P, k, phi):
    """Rest points P (n x 2) wrapped isometrically on a cylinder of curvature k whose axis makes
    angle phi with x."""
    u = np.array([math.cos(phi), math.sin(phi)])
    nrm = np.array([-u[1], u[0]])
    s, t = P @ nrm, P @ u
    X = np.zeros((len(P), 3))
    X[:, :2] = t[:, None] * u + (np.sin(k * s) / k)[:, None] * nrm
    X[:, 2] = (1 - np.cos(k * s)) / k
    return X


def _cyl_ratio(phi, a=0.005, k=2.0, L=0.08):
    """Bending energy per unit area of an interior patch with kappa = 1, over B k^2 / 2."""
    P, T = fem.lattice(a, (-L, L), (-L, L))
    m = CRMesh(P, T, 1.0 / fem.GF_CM2_PER_CM, 1.0, 1.0, 1.0, np.zeros(len(P), bool), kappa=1.0)
    X = np.zeros((m.n, 3))
    X[:] = cylinder(m.P, k, phi)
    th = m.theta(X)
    cen = np.abs(m.P[m.H5[:, 0]]).max(1) < 0.5 * L
    # each interior hinge owns a third of each of its two (equal, equilateral) triangles
    Eb = (m.kb[cen] * th[cen] ** 2).sum()
    return Eb / (cen.sum() * 2 * m.area[0] / 3) / (0.5 * k * k)


def calibrate_kappa():
    """Lattice constant: the mean over axis angles 0..90 degrees of the cylinder ratio, inverted."""
    global KAPPA
    if KAPPA is None:
        r = [_cyl_ratio(math.radians(p)) for p in (0, 15, 30, 45, 60, 75, 90)]
        KAPPA = 1.0 / float(np.mean(r))
    return KAPPA
