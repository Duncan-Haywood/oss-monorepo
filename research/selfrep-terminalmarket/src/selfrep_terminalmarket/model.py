"""Terminal fleet value on top of the saturating goods market (fluid model, cash never binds).

Objective: revenue ``R(g) = a c (1 - exp(-g/c))`` integrated over ``[0, T]`` (the ``selfrep-satmarket``
model, imported by relative path) plus ``s`` per machine left at ``T`` (the ``selfrep-terminal``
resale value). ``s = 0`` is ``selfrep-satmarket``; ``c = inf`` is ``selfrep-terminal``.

The only new code is a backward dynamic programme with terminal reward ``V_T(n) = s n``; its grid and
control discretisation follow ``selfrep_satmarket.dp_solve``.
"""
import math
import pathlib
import sys

_root = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_root / "selfrep-satmarket" / "src"))
from selfrep_satmarket.model import Params, bang_bang, dp_policy, revenue, run  # noqa: E402,F401


def value(p, policy, s, n0=1.0):
    """Euler value of a policy: revenue plus ``s`` per machine at the horizon."""
    g, n, path = run(p, policy, n0)
    return g + s * n, g, n, path


def best_switch(p, s, step=1.0):
    best, ts = (0.0, -1.0), 0.0
    while ts <= p.horizon + 1e-9:
        j = value(p, bang_bang(ts), s)[0]
        if j > best[1]:
            best = (ts, j)
        ts += step
    return best


def dp_solve(p, s, n_points=400, u_levels=21, n0=1.0):
    """Backward DP with ``V_T(n) = s n``. Returns (value at n0, policy table, grid).

    The value is the optimum of the discretised problem (log-spaced fleet grid, ``u`` on a grid)
    up to interpolation error. The terminal reward is linear in ``n`` and the grid is geometric, so
    interpolating it between grid points overstates it slightly; see the README."""
    steps = int(round(p.horizon / p.dt))
    top = math.log((1 + p.k * p.dt) ** steps)
    h = top / (n_points - 1)
    grid = [n0 * math.exp(i * h) for i in range(n_points)]
    us = [j / (u_levels - 1) for j in range(u_levels)]
    shift = [math.log1p(p.k * u * p.dt) / h for u in us]
    rev = [[revenue(p, (1 - u) * n) * p.dt for u in us] for n in grid]
    v = [s * n for n in grid]
    pol = [None] * steps
    for t in range(steps - 1, -1, -1):
        nv, pl = [0.0] * n_points, [0.0] * n_points
        for i in range(n_points):
            best, bu = -1.0, 0.0
            for j, u in enumerate(us):
                pos = i + shift[j]
                lo = int(pos)
                if lo >= n_points - 1:
                    nxt = v[-1]
                else:
                    f = pos - lo
                    nxt = v[lo] * (1 - f) + v[lo + 1] * f
                val = rev[i][j] + nxt
                if val > best:
                    best, bu = val, u
            nv[i], pl[i] = best, bu
        v, pol[t] = nv, pl
    return v[0], pol, grid
