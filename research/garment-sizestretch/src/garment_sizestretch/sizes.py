"""A size is a nominal garment circumference (bust, hip) in cm.

A body circumference m fits a garment of nominal circumference s when
    s - loose <= m <= s * (1 + stretch)
so the garment can be at most `loose` cm too big and stretches up to `stretch` (a fraction) over the body.
The fit window is `loose + stretch * s` wide: stretch widens it, and widens it more at larger sizes.
A person fits a size when both measurements fit. Choosing k sizes to fit the most people is maximum coverage.
"""
import numpy as np
from scipy.optimize import LinearConstraint, Bounds, milp


def population(n, rho, seed, mean=(95.0, 100.0), sd=(8.0, 8.0)):
    """Synthetic bust/hip sample. Parameters are ASSUMED, not from a survey."""
    rng = np.random.default_rng(seed)
    cov = [[sd[0] ** 2, rho * sd[0] * sd[1]], [rho * sd[0] * sd[1], sd[1] ** 2]]
    return rng.multivariate_normal(mean, cov, size=n)


def candidates(people, loose, stretch):
    """Nominal sizes worth considering: ones that put some person on either end of a fit window."""
    lo = people + loose                  # person is the largest body the garment can be loose on
    hi = people / (1.0 + stretch)        # person is the largest body the garment stretches to
    return np.vstack([lo, hi])


def cover_matrix(people, sizes, loose, stretch):
    """C[i, j] is True when person i fits size j in both measurements."""
    m = people[:, None, :]
    s = sizes[None, :, :]
    return ((m >= s - loose - 1e-9) & (m <= s * (1.0 + stretch) + 1e-9)).all(axis=2)


def coverage(people, sizes, loose, stretch):
    if len(sizes) == 0:
        return 0.0
    return float(cover_matrix(people, np.asarray(sizes), loose, stretch).any(axis=1).mean())


def greedy(people, loose, stretch, k):
    sizes = candidates(people, loose, stretch)
    C = cover_matrix(people, sizes, loose, stretch)
    covered = np.zeros(len(people), bool)
    chosen = []
    for _ in range(k):
        gain = (C & ~covered[:, None]).sum(axis=0)
        j = int(gain.argmax())
        if gain[j] == 0:
            break
        chosen.append(j)
        covered |= C[:, j]
    return sizes[chosen], float(covered.mean())


def exact(people, loose, stretch, k, time_limit=60):
    """Optimal max coverage over the candidate sizes, as a 0-1 integer program (HiGHS)."""
    n = len(people)
    sizes = candidates(people, loose, stretch)
    C = cover_matrix(people, sizes, loose, stretch).astype(float)
    nc = len(sizes)
    c = np.concatenate([np.zeros(nc), -np.ones(n)])
    A1 = np.hstack([-C, np.eye(n)])  # z_i <= sum_j C_ij y_j
    A2 = np.concatenate([np.ones(nc), np.zeros(n)])[None, :]  # sum y <= k
    cons = [LinearConstraint(A1, -np.inf, 0), LinearConstraint(A2, 0, k)]
    res = milp(c, constraints=cons, integrality=np.ones(nc + n), bounds=Bounds(0, 1),
               options={"time_limit": time_limit})
    if res.x is None:
        raise RuntimeError("milp returned no solution: " + str(res.message))
    y = res.x[:nc] > 0.5
    return sizes[y], coverage(people, sizes[y], loose, stretch), int(res.status)
