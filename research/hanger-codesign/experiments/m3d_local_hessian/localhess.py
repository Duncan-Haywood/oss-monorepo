"""An element-local Hessian for milestone 3a's triangle cloth tier, and a Newton solver that uses it.

Why: milestone 3a's Newton solver (`m3_fem_tier/newton.py`) builds the sparse Hessian by coloured
central differences of the *global* gradient: 20 colour groups x 3 directions x 2 signs = 120
gradient evaluations per Newton step. Profiled on the Cusick specimen (fabric D, EA 800 N/m) that is
85% of a step: 4.6 s of 5.3 s on the 2.5 mm lattice (13,245 nodes) and 8.1 s of 9.7 s on 1.875 mm
(23,509 nodes); the sparse LU is the rest. Milestones 3b and 3c spent 31 and 129 core-minutes x 4
in it, and a third, finer lattice (milestone 3c's Next (a)) was out of reach at that rate.

The energy is a sum of element terms (gravity is linear and has no Hessian), so the Hessian is a
sum of small dense element blocks:

  Membrane (constant-strain triangle, Saint Venant-Kirchhoff, orthotropic, no Poisson term), exact.
    The first Piola stress is P = F S with S11 = EA E11, S22 = EA E22, S12 = 2 G E12, and the nodal
    force block is area * P Dm^-T. A perturbation dx of one node coordinate gives dDs, dF = dDs Dm^-1,
    dE = sym(F^T dF), dS from the same linear law, dP = dF S + F dS, and the column of the 9 x 9
    block is area * dP Dm^-T. Nine directional derivatives, vectorised over all triangles: exact.

  Bending (discrete-shell hinge, 4 nodes), by central differences of the *local* hinge gradient:
    24 evaluations of a 12-vector per hinge, vectorised over all hinges. Unlike the global scheme,
    the membrane is not in the difference, so the O(eps^2) truncation error is relative to the
    bending stiffness itself, not to a membrane 10^4 to 10^5 times stiffer (the reason milestone 3a
    needed central differences at all). The block is symmetrised.

`test_m3d` checks the membrane block against finite differences of the membrane force, and the whole
assembled matrix against milestone 3a's coloured Hessian on the same state.
"""
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sps

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "m3_fem_tier"))
import newton  # noqa: E402


def hinge_grad(a, b, c, d, kb):
    """Gradient of sum kb theta^2 over hinges, per hinge node (h x 4 x 3): the same formulas as
    `fem.Mesh.energy_grad`'s bending block (Bridson et al. 2003)."""
    e = b - a
    el = np.sqrt((e * e).sum(1))
    n1 = np.cross(e, c - a)
    n2 = np.cross(d - a, e)
    s = (np.cross(n1, n2) * e).sum(1) / el
    th = np.arctan2(s, (n1 * n2).sum(1))
    q1 = (n1 * n1).sum(1)[:, None]
    q2 = (n2 * n2).sum(1)[:, None]
    eh = e / el[:, None]
    gc = el[:, None] * n1 / q1
    gd = el[:, None] * n2 / q2
    ga = ((c - b) * eh).sum(1)[:, None] * n1 / q1 + ((d - b) * eh).sum(1)[:, None] * n2 / q2
    gb = -(((c - a) * eh).sum(1)[:, None] * n1 / q1 + ((d - a) * eh).sum(1)[:, None] * n2 / q2)
    cc = (-2 * kb * th)[:, None]
    return np.stack([cc * ga, cc * gb, cc * gc, cc * gd], axis=1)


def membrane_blocks(mesh, X):
    """Exact 9 x 9 membrane Hessian block of every triangle (m x 9 x 9), node-major (node, xyz)."""
    T = mesh.T
    x0, x1, x2 = X[T[:, 0]], X[T[:, 1]], X[T[:, 2]]
    Ds = np.stack([x1 - x0, x2 - x0], axis=2)            # m x 3 x 2
    Di = mesh.Dinv                                       # m x 2 x 2
    F = Ds @ Di
    C = np.einsum("mki,mkj->mij", F, F)
    E11, E22, E12 = 0.5 * (C[:, 0, 0] - 1), 0.5 * (C[:, 1, 1] - 1), 0.5 * C[:, 0, 1]
    S = np.empty((len(T), 2, 2))
    S[:, 0, 0], S[:, 1, 1] = mesh.EA * E11, mesh.EA * E22
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
            dS[:, 0, 0], dS[:, 1, 1] = mesh.EA * dE[:, 0, 0], mesh.EA * dE[:, 1, 1]
            dS[:, 0, 1] = dS[:, 1, 0] = 2 * mesh.Gs * dE[:, 0, 1]
            dH = mesh.area[:, None, None] * ((dF @ S + F @ dS) @ DiT)   # m x 3 x 2: forces on nodes 1, 2
            col = np.empty((m, 3, 3))
            col[:, 1], col[:, 2] = dH[:, :, 0], dH[:, :, 1]
            col[:, 0] = -dH[:, :, 0] - dH[:, :, 1]
            K[:, :, 3 * i + k] = col.reshape(m, 9)
    return K


def hinge_blocks(mesh, X, eps=1e-7):
    """12 x 12 bending block of every hinge by central differences of the local hinge gradient."""
    nodes = (mesh.hu, mesh.hv, mesh.ho1, mesh.ho2)
    P = [X[ix] for ix in nodes]
    h = len(mesh.hu)
    K = np.empty((h, 12, 12))
    for i in range(4):
        for k in range(3):
            Pp = [p.copy() for p in P]
            Pm = [p.copy() for p in P]
            Pp[i][:, k] += eps
            Pm[i][:, k] -= eps
            K[:, :, 3 * i + k] = ((hinge_grad(*Pp, mesh.kb) - hinge_grad(*Pm, mesh.kb)) / (2 * eps)).reshape(h, 12)
    return 0.5 * (K + np.transpose(K, (0, 2, 1)))


def _coo(conn, K, fi):
    """Rows, columns and values of the free-free entries of element blocks K on nodes conn."""
    m, k = conn.shape
    dof = (3 * fi[conn][:, :, None] + np.arange(3)).reshape(m, 3 * k)      # -3.. for fixed nodes
    ok = np.repeat(fi[conn] >= 0, 3, axis=1)
    r = np.broadcast_to(dof[:, :, None], K.shape)
    c = np.broadcast_to(dof[:, None, :], K.shape)
    keep = ok[:, :, None] & ok[:, None, :]
    return r[keep], c[keep], K[keep]


def hessian(mesh, X, eps=1e-7):
    """Sparse free-free Hessian (CSC) of `mesh`'s energy at the full node array X."""
    fi = -np.ones(mesh.n, int)
    fi[mesh.free] = np.arange(mesh.free.sum())
    hinges = np.column_stack([mesh.hu, mesh.hv, mesh.ho1, mesh.ho2])
    r1, c1, v1 = _coo(mesh.T, membrane_blocks(mesh, X), fi)
    r2, c2, v2 = _coo(hinges, hinge_blocks(mesh, X, eps), fi)
    m = 3 * int(mesh.free.sum())
    return sps.csc_matrix((np.concatenate([v1, v2]), (np.concatenate([r1, r2]), np.concatenate([c1, c2]))),
                          shape=(m, m))


class LocalNewton(newton.Newton):
    """Milestone 3a's damped Newton solver with the element-local Hessian in place of the coloured
    global one. Same step rule, damping, line search and stopping test; `X` is the template whose
    fixed nodes the free vector completes (as in `Mesh.energy_grad(v, X)`)."""

    def __init__(self, mesh, X):
        self.mesh, self.X = mesh, X
        self.free = mesh.free

    def hessian(self, grad, v, g0, eps):
        X = self.X.copy()
        X[self.free] = v.reshape(-1, 3)
        return hessian(self.mesh, X, eps)
