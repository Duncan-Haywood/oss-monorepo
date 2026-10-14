"""Grid-convergence check for the terminal-value DP of ``selfrep-terminalmarket``.

Same problem (saturating market ``R(g) = a c (1 - exp(-g/c))`` plus resale value ``s`` per machine at
``T``; fluid model, cash never binds). The only change is the successor-value interpolation:

* ``interp="index"``: linear in the log-grid index, as in ``selfrep_terminalmarket.dp_solve``.
* ``interp="n"``: linear in the fleet size ``n`` between the two bracketing grid points. For the
  terminal reward ``s n`` this is exact; the index rule overstates a convex function of ``log n``.

Sibling projects are imported by relative path, not copied.
"""
import math
import pathlib
import sys

_root = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_root / "selfrep-terminalmarket" / "src"))
sys.path.insert(0, str(_root / "selfrep-satmarket" / "src"))
from selfrep_terminalmarket.model import Params, bang_bang, best_switch, dp_policy, revenue, value  # noqa: E402,F401


def dp_solve(p, s, n_points=400, u_levels=21, n0=1.0, interp="index"):
    """Backward DP with ``V_T(n) = s n``. Returns (value at n0, policy table, grid)."""
    steps = int(round(p.horizon / p.dt))
    top = math.log((1 + p.k * p.dt) ** steps)
    h = top / (n_points - 1)
    grid = [n0 * math.exp(i * h) for i in range(n_points)]
    us = [j / (u_levels - 1) for j in range(u_levels)]
    shift = [math.log1p(p.k * u * p.dt) / h for u in us]
    rev = [[revenue(p, (1 - u) * n) * p.dt for u in us] for n in grid]
    # successor bracket and weight for every (i, j), fixed in time
    succ = []
    for i in range(n_points):
        row = []
        for j, u in enumerate(us):
            pos = i + shift[j]
            lo = int(pos)
            if lo >= n_points - 1:
                row.append((n_points - 1, 0.0))
            elif interp == "index":
                row.append((lo, pos - lo))
            else:
                target = grid[i] * (1 + p.k * u * p.dt)
                row.append((lo, (target - grid[lo]) / (grid[lo + 1] - grid[lo])))
        succ.append(row)
    v = [s * n for n in grid]
    pol = [None] * steps
    for t in range(steps - 1, -1, -1):
        nv, pl = [0.0] * n_points, [0.0] * n_points
        for i in range(n_points):
            best, bu = -1.0, 0.0
            ri, si = rev[i], succ[i]
            for j in range(u_levels):
                lo, f = si[j]
                nxt = v[lo] if f == 0.0 else v[lo] * (1 - f) + v[lo + 1] * f
                val = ri[j] + nxt
                if val > best:
                    best, bu = val, us[j]
            nv[i], pl[i] = best, bu
        v, pol[t] = nv, pl
    return v[0], pol, grid
