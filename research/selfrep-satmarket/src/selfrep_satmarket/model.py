"""Reinvestment control with a saturating goods market (fluid model, cash never binds).

State: fleet size ``n`` (continuous units). Control ``u`` in [0, 1]: share of machine time spent
building copies; the rest, ``g = (1 - u) n`` machine-hours per hour, makes goods. Fleet growth is
``n' = k u n`` with ``k = (1 - fail) / work_h``. Goods revenue rate is concave in output:

    R(g) = a c (1 - exp(-g / c))

``c`` is the market capacity in machine-hours per hour (R is about ``a g`` for ``g << c`` and
saturates at ``a c``). ``c = inf`` gives the linear case of ``selfrep-reinvest``. Objective: total
revenue over ``[0, horizon]`` with the final fleet worth nothing. Every parameter is an assumption
of this project (see the README). Euler steps of ``dt`` hours throughout, shared by all policies.
"""
import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Params:
    k: float                 # fleet growth rate per hour at u = 1, (1 - fail) / work_h
    a: float = 1.0           # value of goods per machine-hour when the market is unsaturated
    c: float = math.inf      # market capacity, machine-hours per hour
    horizon: float = 600.0
    dt: float = 1.0


def revenue(p, g):
    if math.isinf(p.c):
        return p.a * g
    return p.a * p.c * (-math.expm1(-g / p.c))


def run(p, policy, n0=1.0):
    """Integrate with ``policy(t, n) -> u``; returns (revenue, final fleet, u path)."""
    n, t, total, path = n0, 0.0, 0.0, []
    while t < p.horizon - 1e-9:
        dt = min(p.dt, p.horizon - t)
        u = min(1.0, max(0.0, policy(t, n)))
        total += revenue(p, (1 - u) * n) * dt
        n += p.k * u * n * dt
        t += dt
        path.append(u)
    return total, n, path


def constant(u):
    return lambda t, n: u


def bang_bang(ts):
    return lambda t, n: 1.0 if t < ts else 0.0


def smooth(ts, width):
    return lambda t, n: 1.0 / (1.0 + math.exp((t - ts) / width))


def piecewise(levels, horizon):
    m = len(levels)
    return lambda t, n: levels[min(m - 1, int(t / horizon * m))]


def best_switch(p, step=1.0):
    best, ts = (0.0, -1.0), 0.0
    while ts <= p.horizon + 1e-9:
        g = run(p, bang_bang(ts))[0]
        if g > best[1]:
            best = (ts, g)
        ts += step
    return best


def best_smooth(p, widths=(2, 5, 10, 20, 40, 80, 160)):
    best = (None, None, -1.0)
    for w in widths:
        for ts in range(0, int(p.horizon) + 1, 5):
            g = run(p, smooth(ts, w))[0]
            if g > best[2]:
                best = (ts, w, g)
    return best


def optimise_piecewise(p, m=20, start=None, grid=(0.0, 0.25, 0.5, 0.75, 1.0), sweeps=8):
    """Coordinate ascent on ``m`` equal segments. A local search: a lower bound on the optimum."""
    levels = list(start) if start else [1.0] * m
    best = run(p, piecewise(levels, p.horizon))[0]
    for _ in range(sweeps):
        improved = False
        for i in range(m):
            for v in grid:
                if v == levels[i]:
                    continue
                old, levels[i] = levels[i], v
                g = run(p, piecewise(levels, p.horizon))[0]
                if g > best + 1e-9:
                    best, improved = g, True
                else:
                    levels[i] = old
        if not improved:
            break
    return levels, best


def dp_solve(p, n_points=400, u_levels=21, n0=1.0):
    """Backward dynamic programming on a log-spaced fleet grid (the control is the share ``u``).

    ``V_t(n) = max_u [R((1-u) n) dt + V_{t+dt}(n (1 + k u dt))]``, with ``V_T = 0``. The grid is
    uniform in ``log n`` from ``n0`` to the largest fleet reachable by Euler growth at u = 1, so the
    successor of a grid point sits a fixed fraction of a cell away for each ``u`` and linear
    interpolation needs no search. Returns (value at n0, policy table ``pol[step][i]`` of u, grid).
    The value is the optimum of the *discretised* problem (grid in n and u), up to interpolation error."""
    steps = int(round(p.horizon / p.dt))
    top = math.log((1 + p.k * p.dt) ** steps)
    h = top / (n_points - 1)
    xs = [i * h for i in range(n_points)]
    grid = [n0 * math.exp(x) for x in xs]
    us = [j / (u_levels - 1) for j in range(u_levels)]
    shift = [math.log1p(p.k * u * p.dt) / h for u in us]
    rev = [[revenue(p, (1 - u) * n) * p.dt for u in us] for n in grid]
    v = [0.0] * n_points
    pol = [None] * steps
    for s in range(steps - 1, -1, -1):
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
        v, pol[s] = nv, pl
    return v[0], pol, grid


def dp_policy(p, pol, grid):
    """Feedback policy from the DP table (nearest-below grid point in ``log n``, linear in u)."""
    h = math.log(grid[1] / grid[0])
    n0 = grid[0]

    def policy(t, n):
        s = min(len(pol) - 1, int(t / p.dt + 1e-9))
        x = math.log(max(n, n0) / n0) / h
        i = int(x)
        if i >= len(grid) - 1:
            return pol[s][-1]
        f = x - i
        return pol[s][i] * (1 - f) + pol[s][i + 1] * f
    return policy
