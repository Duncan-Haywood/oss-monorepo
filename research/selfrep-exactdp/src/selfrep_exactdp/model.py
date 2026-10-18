"""Interpolation-free DP for the replicating shop with a saturating market and a resale value.

Same fluid problem as ``selfrep-terminalmarket`` / ``selfrep-dpgrid``: revenue ``R(g) = a c (1 - exp(-g/c))``
with ``g = (1-u) n``, Euler step ``dt``, resale value ``s`` per machine at the horizon, fleet ``n' = k u n``.

The control set is chosen so that every control moves the fleet by a whole number of grid cells.
With ``r = 1 + k dt`` the grid is ``n_i = n0 r^(i/m)`` and control ``j`` (``0..m``) is
``u_j = (r^(j/m) - 1) / (k dt)``, so one Euler step maps ``n_i`` to exactly ``n_(i+j)``. The DP then
needs no interpolation, and its table value is the exact optimum over that control set.
``u_0 = 0`` and ``u_m = 1`` are always included, so bang-bang policies are feasible and the table value
is at least the best switch value (grid ties aside).
"""
import math
import pathlib
import sys

_root = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_root / "selfrep-terminalmarket" / "src"))
sys.path.insert(0, str(_root / "selfrep-satmarket" / "src"))
from selfrep_terminalmarket.model import Params, best_switch, revenue, run, value  # noqa: E402,F401


def controls(p, m):
    r = 1 + p.k * p.dt
    return [(r ** (j / m) - 1) / (p.k * p.dt) for j in range(m + 1)]


def exact_dp(p, s, m=1, n0=1.0):
    """Backward DP; returns (value at n0, policy ``pol[t][i]`` of control index, grid)."""
    steps = int(round(p.horizon / p.dt))
    r = 1 + p.k * p.dt
    npts = steps * m + 1
    grid = [n0 * r ** (i / m) for i in range(npts)]
    us = controls(p, m)
    rev = [[revenue(p, (1 - u) * n) * p.dt for u in us] for n in grid]
    v = [s * n for n in grid]
    pol = [None] * steps
    for t in range(steps - 1, -1, -1):
        reach = (t + 1) * m + 1          # states reachable from n0 at time t+1
        nv, pl = [0.0] * npts, [0] * npts
        for i in range(min(npts, t * m + 1)):
            best, bj = -1.0, 0
            ri = rev[i]
            for j in range(m + 1):
                val = ri[j] + v[i + j]
                if val > best:
                    best, bj = val, j
            nv[i], pl[i] = best, bj
        v, pol[t] = nv, pl
    return v[0], pol, grid


def path_policy(p, pol, grid, m, n0=1.0):
    """Feedback policy ``(t, n) -> u`` reading the table at the grid point nearest ``n`` in ``log n``."""
    us = controls(p, m)
    h = math.log(1 + p.k * p.dt) / m

    def policy(t, n):
        step = min(len(pol) - 1, int(t / p.dt + 1e-9))
        i = min(len(grid) - 1, max(0, round(math.log(n / n0) / h)))
        return us[pol[step][i]]
    return policy


def switch_times(p, pol, grid, m, n0=1.0):
    """Control index chosen at each step along the DP path from ``n0`` (list of ints in ``0..m``)."""
    i, out = 0, []
    for t in range(len(pol)):
        j = pol[t][i]
        out.append(j)
        i += j
    return out
