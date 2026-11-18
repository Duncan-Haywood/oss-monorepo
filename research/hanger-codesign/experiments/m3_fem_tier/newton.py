"""A damped Newton solver for static cloth, with the sparse Hessian built from coloured finite
differences of the gradient (central: forward differences carry an O(eps) error of order 1 N/m
from the stiff membrane, which swamps the bending stiffness and shows up as spurious negative
eigenvalues at the flat state). Generic: it needs only an energy-and-gradient function on the free
coordinates and the element stencils (which nodes share a term), so it solves the FEM tier and
the spring sheet alike.

Why: L-BFGS stalls on a static cloth problem. The membrane is 10^4 to 10^5 times stiffer than
bending at the scale of a fold, so a first-order method crawls along near-isometric directions and
a chunk-based stopping rule on the output (milestones 1b to 2b: "DC moved under 0.001 in 2000
iterations") can stop it far from equilibrium. Newton's method follows those directions directly.

Hessian: two nodes may share a finite-difference column group only if no node is a stencil
neighbour of both (a distance-2 colouring of the stencil graph, greedy). Each group costs six
gradient evaluations (x, y, z, both signs). Steps solve (H + mu D) p = -g with D the
Hessian's absolute diagonal (Levenberg-Marquardt style, which also handles the negative curvature
of buckling), an Armijo backtracking line search, mu raised on failure and lowered on success.
"""
import numpy as np
import scipy.sparse as sps
import scipy.sparse.linalg as spla


def stencil_graph(n, stencils):
    """Node adjacency (CSR, with self loops) from a list of (m x k) index arrays."""
    r, c = [], []
    for S in stencils:
        S = np.asarray(S)
        for i in range(S.shape[1]):
            for j in range(S.shape[1]):
                r.append(S[:, i])
                c.append(S[:, j])
    r = np.concatenate(r + [np.arange(n)])
    c = np.concatenate(c + [np.arange(n)])
    A = sps.csr_matrix((np.ones(len(r), bool), (r, c)), shape=(n, n))
    A.sum_duplicates()
    return A


def colour(A, active):
    """Greedy distance-2 colouring of the active nodes of adjacency A."""
    A2 = (A @ A).tocsr()
    col = -np.ones(A.shape[0], int)
    for i in np.where(active)[0]:
        nb = A2.indices[A2.indptr[i]:A2.indptr[i + 1]]
        used = set(col[nb][col[nb] >= 0].tolist())
        k = 0
        while k in used:
            k += 1
        col[i] = k
    return col


class Newton:
    def __init__(self, n, stencils, free):
        self.n = n
        self.free = np.asarray(free, bool)
        self.A = stencil_graph(n, stencils)
        self.col = colour(self.A, self.free)
        self.ncol = int(self.col.max()) + 1
        fi = -np.ones(n, int)
        fi[self.free] = np.arange(self.free.sum())
        self.fi = fi                       # node -> free index
        A = self.A.tocoo()
        keep = self.free[A.row] & self.free[A.col]
        self.pr, self.pc = A.row[keep], A.col[keep]   # free-free node pairs (row, column node)

    def hessian(self, grad, v, g0, eps):
        m = len(v)
        rows, cols, vals = [], [], []
        own = self.col[self.pc]                   # colour of each pair's column node
        for k in range(self.ncol):
            sel = own == k
            pr, pc = self.pr[sel], self.pc[sel]
            nodes_k = np.where((self.col == k) & self.free)[0]
            for d in range(3):
                dv = np.zeros(m)
                dv[3 * self.fi[nodes_k] + d] = eps
                dg = (grad(v + dv) - grad(v - dv)) / (2 * eps)
                for e in range(3):
                    rows.append(3 * self.fi[pr] + e)
                    cols.append(3 * self.fi[pc] + d)
                    vals.append(dg[3 * self.fi[pr] + e])
        H = sps.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                           shape=(m, m))
        return (0.5 * (H + H.T)).tocsc()

    def solve(self, fg, v, gtol, maxit=200, eps=1e-7, mu=1e-3, log=None):
        """Minimise fg (returns E, g) from v until max|g| < gtol. Returns v, info."""
        E, g = fg(v)
        grad = lambda u: fg(u)[1]
        hist = []
        for it in range(maxit):
            gmax = float(np.abs(g).max())
            hist.append((E, gmax, mu))
            if gmax < gtol:
                break
            H = self.hessian(grad, v, g, eps)
            Dg = np.abs(H.diagonal()) + 1e-30
            while True:
                K = H + sps.diags(mu * Dg)
                try:
                    p = -spla.splu(K.tocsc()).solve(g)
                except RuntimeError:
                    mu *= 10
                    continue
                slope = p @ g
                if slope >= 0:
                    mu *= 10
                    continue
                t, ok = 1.0, False
                while t > 1e-4:
                    En, gn = fg(v + t * p)
                    if En <= E + 1e-4 * t * slope:
                        ok = True
                        break
                    t *= 0.5
                if ok:
                    v, E, g = v + t * p, En, gn
                    mu = max(mu / (3 if t == 1.0 else 1), 1e-8)
                    break
                mu *= 10
                if mu > 1e12:
                    return v, dict(iters=it, gmax=float(np.abs(g).max()), hist=hist, stalled=True)
            if log:
                log(it, E, float(np.abs(g).max()), mu, t)
        return v, dict(iters=it, gmax=float(np.abs(g).max()), hist=hist, stalled=False)
