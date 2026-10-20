"""A size is a point (bust, hip) in cm; it fits a person whose two measurements are both within `tol` of it.

Choosing k sizes to fit the most people is maximum coverage with square (Chebyshev) balls.
"""
import numpy as np
from scipy.optimize import LinearConstraint, Bounds, milp


def population(n, rho, seed, mean=(95.0, 100.0), sd=(8.0, 8.0)):
    """Synthetic bust/hip sample. Parameters are ASSUMED, not from a survey."""
    rng = np.random.default_rng(seed)
    cov = [[sd[0] ** 2, rho * sd[0] * sd[1]], [rho * sd[0] * sd[1], sd[1] ** 2]]
    return rng.multivariate_normal(mean, cov, size=n)


def cover_matrix(people, centers, tol):
    """C[i, j] is True when person i fits a size at centers[j]."""
    d = np.abs(people[:, None, :] - centers[None, :, :]).max(axis=2)
    return d <= tol


def coverage(people, centers, tol):
    if len(centers) == 0:
        return 0.0
    return float(cover_matrix(people, np.asarray(centers), tol).any(axis=1).mean())


def greedy(people, tol, k):
    """Greedy max coverage over candidate sizes placed at sample points."""
    C = cover_matrix(people, people, tol)
    covered = np.zeros(len(people), bool)
    chosen = []
    for _ in range(k):
        gain = (C & ~covered[:, None]).sum(axis=0)
        j = int(gain.argmax())
        if gain[j] == 0:
            break
        chosen.append(j)
        covered |= C[:, j]
    return people[chosen], float(covered.mean())


def exact(people, tol, k, time_limit=60):
    """Optimal max coverage over the same candidates, as a 0-1 integer program (HiGHS)."""
    n = len(people)
    C = cover_matrix(people, people, tol).astype(float)
    # variables: y_j (size j chosen, n of them), z_i (person i covered, n of them); maximise sum z
    c = np.concatenate([np.zeros(n), -np.ones(n)])
    A1 = np.hstack([-C, np.eye(n)])  # z_i - sum_j C_ij y_j <= 0
    A2 = np.concatenate([np.ones(n), np.zeros(n)])[None, :]  # sum y <= k
    cons = [LinearConstraint(A1, -np.inf, 0), LinearConstraint(A2, 0, k)]
    res = milp(c, constraints=cons, integrality=np.ones(2 * n), bounds=Bounds(0, 1),
               options={"time_limit": time_limit})
    if res.x is None:
        raise RuntimeError("milp returned no solution: " + str(res.message))
    y = res.x[:n] > 0.5
    z_cov = coverage(people, people[y], tol)
    # status 0 = proven optimal; 1 = limit reached (incumbent only)
    return people[y], z_cov, int(res.status)


def grid_run(people, tol, k):
    """Best regular grid run: a r x c lattice with spacing 2*tol, shifted to the best offset, r*c <= k.

    This is the classic 'S M L, each a fixed step apart in every measurement' size run.
    """
    best = (0.0, None)
    lo = people.min(axis=0)
    step = 2 * tol
    for r in range(1, k + 1):
        for c in range(1, k // r + 1):
            for ox in np.linspace(0, step, 9, endpoint=False):
                for oy in np.linspace(0, step, 9, endpoint=False):
                    xs = _best_line(people[:, 0], lo[0] - step + ox, step, r)
                    ys = _best_line(people[:, 1], lo[1] - step + oy, step, c)
                    pts = np.array([[x, y] for x in xs for y in ys])
                    cov = coverage(people, pts, tol)
                    if cov > best[0]:
                        best = (cov, pts)
    return best[1], best[0]


def _best_line(v, start, step, m):
    """m consecutive grid points starting at the window (of m) that holds the most people."""
    top = v.max() + step
    n_pos = int((top - start) // step) + 1
    pts = start + step * np.arange(n_pos)
    best_s, best_cnt = 0, -1
    for s in range(max(1, n_pos - m + 1)):
        win = pts[s:s + m]
        cnt = (np.abs(v[:, None] - win[None, :]) <= step / 2).any(axis=1).sum()
        if cnt > best_cnt:
            best_s, best_cnt = s, cnt
    return pts[best_s:best_s + m]
