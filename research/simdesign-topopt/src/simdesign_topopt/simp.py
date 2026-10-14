"""SIMP topology optimisation on a regular grid of bilinear (Q4) plane-stress elements.

Follows the structure of Sigmund (2001), "A 99 line topology optimization code written in
Matlab", Struct. Multidisc. Optim. 21(2):120-127: minimise compliance subject to a volume
fraction, SIMP penalisation E(x) = Emin + x^p (E0 - Emin), a mesh-independence filter on the
sensitivities, and the optimality-criteria (OC) update. The element matrix is the standard Q4
matrix used there; assembly here is vectorised with SciPy sparse (as in Andreassen et al.,
Struct. Multidisc. Optim. 43:1-16, 2011) rather than looped. Independent re-implementation, no
code copied.

Grid: nely rows x nelx columns, unit elements, node numbering column by column from the top
left, 2 dofs per node (x, y).
"""
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve


def element_stiffness(nu=0.3):
    """8x8 stiffness of a unit square Q4 plane-stress element with E = 1 (closed form)."""
    k = np.array([1/2 - nu/6, 1/8 + nu/8, -1/4 - nu/12, -1/8 + 3*nu/8,
                  -1/4 + nu/12, -1/8 - nu/8, nu/6, 1/8 - 3*nu/8])
    idx = [[0, 1, 2, 3, 4, 5, 6, 7], [1, 0, 7, 6, 5, 4, 3, 2],
           [2, 7, 0, 5, 6, 3, 4, 1], [3, 6, 5, 0, 7, 2, 1, 4],
           [4, 5, 6, 7, 0, 1, 2, 3], [5, 4, 3, 2, 1, 0, 7, 6],
           [6, 3, 4, 1, 2, 7, 0, 5], [7, 2, 1, 4, 3, 6, 5, 0]]
    return (1 / (1 - nu ** 2)) * k[np.array(idx)]


def _edof(nelx, nely):
    ely, elx = np.meshgrid(np.arange(nely), np.arange(nelx), indexing="ij")
    n1 = (nely + 1) * elx + ely          # top-left node of each element
    n2 = (nely + 1) * (elx + 1) + ely    # top-right node
    e = np.stack([2*n1+2, 2*n1+3, 2*n2+2, 2*n2+3, 2*n2, 2*n2+1, 2*n1, 2*n1+1], axis=-1)
    return e.reshape(-1, 8)              # element order: row-major (y fastest within a row)


def mbb_problem(nelx, nely):
    """Half MBB beam: symmetry on the left edge, roller at bottom right, unit load top left."""
    ndof = 2 * (nely + 1) * (nelx + 1)
    f = np.zeros(ndof); f[1] = -1.0
    fixed = np.union1d(np.arange(0, 2 * (nely + 1), 2), [ndof - 1])
    return f, fixed


def cantilever_problem(nelx, nely):
    """Cantilever: left edge clamped, unit downward load at mid-height of the right edge."""
    ndof = 2 * (nely + 1) * (nelx + 1)
    f = np.zeros(ndof); f[2 * ((nely + 1) * nelx + nely // 2) + 1] = -1.0
    fixed = np.arange(0, 2 * (nely + 1))
    return f, fixed


def _filter_matrix(nelx, nely, rmin):
    """Weights max(0, rmin - dist) between element centres, as in the 99-line code."""
    r = int(np.ceil(rmin)) - 1
    rows, cols, vals = [], [], []
    for i in range(nelx):
        for j in range(nely):
            for k in range(max(i - r, 0), min(i + r + 1, nelx)):
                for l in range(max(j - r, 0), min(j + r + 1, nely)):
                    w = rmin - np.hypot(i - k, j - l)
                    if w > 0:
                        rows.append(j * nelx + i); cols.append(l * nelx + k); vals.append(w)
    n = nelx * nely
    return coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr()


def fe_compliance(x, nelx, nely, f, fixed, penal=3.0, E0=1.0, Emin=1e-9, nu=0.3):
    """Solve K u = f for density field x (nely x nelx). Returns (compliance, u, dc/dx)."""
    KE = element_stiffness(nu)
    edof = _edof(nelx, nely)
    xe = x.reshape(-1)  # row-major, matches edof
    E = Emin + xe ** penal * (E0 - Emin)
    iK = np.repeat(edof, 8, axis=1).ravel(); jK = np.tile(edof, (1, 8)).ravel()
    sK = (KE.ravel()[None, :] * E[:, None]).ravel()
    ndof = f.size
    K = coo_matrix((sK, (iK, jK)), shape=(ndof, ndof)).tocsc()
    free = np.setdiff1d(np.arange(ndof), fixed)
    u = np.zeros(ndof)
    u[free] = spsolve(K[free][:, free], f[free])
    ue = u[edof]
    ce = np.einsum("ei,ij,ej->e", ue, KE, ue)
    c = float(np.sum(E * ce))
    dc = -penal * xe ** (penal - 1) * (E0 - Emin) * ce
    return c, u, dc.reshape(nely, nelx)


def simp(nelx, nely, volfrac, penal, rmin, problem=mbb_problem, max_iter=200, tol=0.01,
         move=0.2, filter_mode="sensitivity"):
    """Minimise compliance. filter_mode: 'sensitivity' (Sigmund 2001) or 'none'.

    Returns dict with the density field x (nely x nelx), compliance history, volume, iterations.
    OC update with bisection on the Lagrange multiplier and move limit 0.2, stop when the largest
    change in any density is below tol (the stopping rule of the 99-line code).
    """
    f, fixed = problem(nelx, nely)
    x = np.full((nely, nelx), volfrac)
    H = _filter_matrix(nelx, nely, rmin) if filter_mode == "sensitivity" else None
    hist = []
    for it in range(1, max_iter + 1):
        c, _, dc = fe_compliance(x, nelx, nely, f, fixed, penal)
        hist.append(c)
        if H is not None:  # filtered sensitivity: sum_k H_k x_k dc_k / (x_e sum_k H_k)
            xv = x.reshape(-1)
            dc = ((H @ (xv * dc.reshape(-1))) / (np.maximum(xv, 1e-3) * np.asarray(H.sum(axis=1)).ravel())).reshape(nely, nelx)
        l1, l2 = 0.0, 1e9
        while (l2 - l1) / (l1 + l2) > 1e-4:
            lmid = 0.5 * (l1 + l2)
            xnew = np.clip(x * np.sqrt(np.maximum(-dc, 0) / lmid), np.maximum(0.001, x - move), np.minimum(1.0, x + move))
            if xnew.mean() - volfrac > 0: l1 = lmid
            else: l2 = lmid
        change = float(np.abs(xnew - x).max())
        x = xnew
        if change < tol:
            break
    c, _, _ = fe_compliance(x, nelx, nely, f, fixed, penal)
    hist.append(c)
    return {"x": x, "compliance": c, "history": hist, "volume": float(x.mean()), "iterations": it,
            "change": change}
