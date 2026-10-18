"""2D plane-stress Q4 finite-element cantilever: the 'expensive simulator' for the surrogate.

Same beam as accel-surrogate (1 m, E = 70 GPa, width 30 mm, tip load 100 N, 8 section heights of
20 to 60 mm), but meshed as a 2D continuum with nx x ny bilinear quadrilaterals. A node column that
sits between two segments takes the mean of the two heights, so the step is smoothed over one
element; refining the mesh narrows the smoothing and converges towards the true stepped beam.
Node (i, j): index i*(ny+1)+j, dofs 2*node (x) and 2*node+1 (y). Left edge clamped; the tip load is
shared evenly over the right edge. Tip deflection = vertical displacement of the mid-height node.
"""
import numpy as np
from scipy.linalg import solveh_banded

L, B, E, NU, P = 1.0, 0.03, 70e9, 0.33, 100.0
NSEG = 8
H_LO, H_HI = 0.02, 0.06
_G = 1.0 / np.sqrt(3.0)
_D = E / (1 - NU ** 2) * np.array([[1, NU, 0], [NU, 1, 0], [0, 0, (1 - NU) / 2]])


def sample_designs(rng, n):
    return rng.uniform(H_LO, H_HI, (n, NSEG))


def column_heights(h, nx):
    """Height at each of the nx+1 node columns."""
    per = nx // NSEG
    he = np.repeat(np.asarray(h, float), per)          # height of each element column
    col = np.empty(nx + 1)
    col[0], col[-1] = he[0], he[-1]
    col[1:-1] = 0.5 * (he[:-1] + he[1:])
    return col


def _ke(xy):
    """8x8 element stiffness for nodes ordered (0,0),(1,0),(1,1),(0,1) in natural coordinates."""
    k = np.zeros((8, 8))
    for xi in (-_G, _G):
        for eta in (-_G, _G):
            dN = 0.25 * np.array([[-(1 - eta), (1 - eta), (1 + eta), -(1 + eta)],
                                  [-(1 - xi), -(1 + xi), (1 + xi), (1 - xi)]])
            J = dN @ xy
            dNx = np.linalg.solve(J, dN)
            Bm = np.zeros((3, 8))
            Bm[0, 0::2] = dNx[0]
            Bm[1, 1::2] = dNx[1]
            Bm[2, 0::2] = dNx[1]
            Bm[2, 1::2] = dNx[0]
            k += Bm.T @ _D @ Bm * np.linalg.det(J) * B
    return k


def bandwidth(ny):
    return 2 * (ny + 2) + 1      # max |dof_i - dof_j| within an element, numbering y fastest


def fe_flops(nx, ny):
    """Banded-Cholesky flop estimate n*bw^2 (multiply-adds counted as 2 flops is NOT applied: this
    is the usual n*bw^2 leading term), plus the same again for assembly. An estimate, not a profile."""
    n = 2 * (nx + 1) * (ny + 1)
    return n * bandwidth(ny) ** 2


def tip_deflection(h, nx, ny):
    assert nx % NSEG == 0 and ny % 2 == 0
    cols = column_heights(h, nx)
    xs = np.linspace(0, L, nx + 1)
    nn = (nx + 1) * (ny + 1)
    nd = 2 * nn
    bw = bandwidth(ny)
    ab = np.zeros((bw + 1, nd))         # upper banded storage: ab[bw+i-j, j] = K[i, j]
    for i in range(nx):
        # element geometry: bottom-left, bottom-right, top-right, top-left
        yb0, yb1 = -cols[i] / 2, -cols[i + 1] / 2
        for j in range(ny):
            f0, f1 = j / ny, (j + 1) / ny
            xy = np.array([[xs[i], yb0 + f0 * cols[i]], [xs[i + 1], yb1 + f0 * cols[i + 1]],
                           [xs[i + 1], yb1 + f1 * cols[i + 1]], [xs[i], yb0 + f1 * cols[i]]])
            nodes = [i * (ny + 1) + j, (i + 1) * (ny + 1) + j, (i + 1) * (ny + 1) + j + 1, i * (ny + 1) + j + 1]
            dofs = np.array([[2 * n_, 2 * n_ + 1] for n_ in nodes]).ravel()
            k = _ke(xy)
            for a in range(8):
                for b in range(8):
                    ia, ib = dofs[a], dofs[b]
                    if ia <= ib:
                        ab[bw + ia - ib, ib] += k[a, b]
    f = np.zeros(nd)
    right = [nx * (ny + 1) + j for j in range(ny + 1)]
    w = np.full(ny + 1, 1.0 / ny)
    w[0] = w[-1] = 0.5 / ny                           # consistent edge load
    for n_, wi in zip(right, w):
        f[2 * n_ + 1] -= P * wi
    free = np.arange(2 * (ny + 1), nd)               # clamp the left column (all its dofs)
    # banded sub-system: dropping the first 2*(ny+1) dofs keeps the band structure
    ab_f = ab[:, free[0]:].copy()
    for r in range(bw):                              # drop couplings to the clamped dofs
        ab_f[r, :bw - r] = 0.0
    u = solveh_banded(ab_f, f[free])
    return -u[2 * (nx * (ny + 1) + ny // 2) + 1 - free[0]]
