"""Concave resale value for the finished fleet on top of the saturating goods market (fluid model).

Objective: goods revenue ``R(g) = a c (1 - exp(-g/c))`` over ``[0, T]`` (``selfrep-satmarket``, imported
by relative path) plus a resale value ``S(N_T)`` for the machines left at ``T``. Here

    S(n) = s m (1 - exp(-n / m))

so ``s`` is the price of the first machine offered (``dS/dn = s`` at ``n = 0``) and the price falls as
more are offered, with total proceeds capped at ``s m``. ``m = inf`` is the linear resale value of
``selfrep-terminalmarket``. The only new code is the terminal function and a backward dynamic
programme that takes it as an argument; the grid and control levels follow ``selfrep_satmarket.dp_solve``.
"""
import math
import pathlib
import sys

_root = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_root / "selfrep-satmarket" / "src"))
from selfrep_satmarket.model import Params, bang_bang, dp_policy, revenue, run  # noqa: E402,F401


def resale(s, m):
    """Terminal value function ``S(n)``; linear ``s n`` when ``m`` is infinite."""
    if math.isinf(m):
        return lambda n: s * n
    return lambda n: s * m * (-math.expm1(-n / m))


def value(p, policy, term, n0=1.0):
    """Euler value of a policy: revenue plus ``term`` of the final fleet."""
    g, n, path = run(p, policy, n0)
    return g + term(n), g, n, path


def best_switch(p, term, step=1.0):
    best, ts = (0.0, -1.0), 0.0
    while ts <= p.horizon + 1e-9:
        j = value(p, bang_bang(ts), term)[0]
        if j > best[1]:
            best = (ts, j)
        ts += step
    return best


def dp_solve(p, term, n_points=400, u_levels=21, n0=1.0):
    """Backward DP with terminal reward ``V_T(n) = term(n)``; returns (value at n0, policy table, grid).

    The grid is uniform in ``log n`` up to the fleet reached by Euler growth at u = 1, so the value is
    the optimum of the discretised problem up to interpolation error."""
    steps = int(round(p.horizon / p.dt))
    top = math.log((1 + p.k * p.dt) ** steps)
    h = top / (n_points - 1)
    grid = [n0 * math.exp(i * h) for i in range(n_points)]
    us = [j / (u_levels - 1) for j in range(u_levels)]
    shift = [math.log1p(p.k * u * p.dt) / h for u in us]
    rev = [[revenue(p, (1 - u) * n) * p.dt for u in us] for n in grid]
    v = [term(n) for n in grid]
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
