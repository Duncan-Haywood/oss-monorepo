"""Reinvestment control for a replicating shop (fluid model, Euler steps of ``dt`` hours).

State: fleet size ``n`` (continuous units) and cash ``m``. Control ``u(t)`` in [0, 1]: the share
of machine time spent building copies; the rest makes goods worth ``a`` currency units per
machine-hour. A copy needs ``work_h`` machine-hours and ``vit_cost`` of vitamins, bought with
cash. A build fails with probability ``fail`` and then loses its hours and vitamins. Cash gains
``budget`` per hour from outside plus ``resale`` x (goods value). If cash cannot pay for the
copies a policy asks for, the unfunded share of machine time makes goods instead.
Objective: total value of goods made over ``[0, horizon]``; the fleet left at the end is worth nothing.
All parameters are assumptions of this project (see the README).
"""
import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Params:
    work_h: float
    vit_cost: float
    fail: float = 0.0
    a: float = 1.0          # goods value per machine-hour (assumed currency units)
    budget: float = 0.0     # outside cash inflow per hour
    resale: float = 0.0     # share of goods value that comes back as cash
    cash0: float = 0.0
    horizon: float = 400.0
    dt: float = 1.0
    cash_limited: bool = True


def growth_rate(p):
    """Free exponential rate k = (1 - fail) / work_h of a fleet that only copies."""
    return (1 - p.fail) / p.work_h


def run(p, policy, n0=1.0):
    """Integrate with ``policy(t, n, m) -> u``; returns (goods value, final fleet, final cash, u path)."""
    n, m, goods, t = n0, p.cash0, 0.0, 0.0
    path = []
    while t < p.horizon - 1e-9:
        dt = min(p.dt, p.horizon - t)
        u = min(1.0, max(0.0, policy(t, n, m)))
        starts = u * n / p.work_h                 # copies started per hour
        if p.cash_limited and starts > 0:
            # cash on hand now plus the outside inflow over the step pays for the vitamins
            afford = (m + p.budget * dt) / (p.vit_cost * dt)
            if starts > afford:
                u *= afford / starts
                starts = afford
        spend = starts * p.vit_cost
        gval = p.a * (1 - u) * n
        m += (p.budget + p.resale * gval - spend) * dt
        m = max(m, 0.0)
        n += starts * (1 - p.fail) * dt
        goods += gval * dt
        t += dt
        path.append(u)
    return goods, n, m, path


def constant(u):
    return lambda t, n, m: u


def bang_bang(ts):
    """Copy at full rate until ``ts``, then make goods only."""
    return lambda t, n, m: 1.0 if t < ts else 0.0


def smooth(ts, width):
    """Logistic ramp-down of the copy share, centred at ``ts``."""
    return lambda t, n, m: 1.0 / (1.0 + math.exp((t - ts) / width))


def piecewise(levels, horizon):
    k = len(levels)
    return lambda t, n, m: levels[min(k - 1, int(t / horizon * k))]


def best_switch(p, step=1.0):
    """Grid search of the bang-bang switch time; returns (ts, goods)."""
    best = (0.0, -1.0)
    ts = 0.0
    while ts <= p.horizon + 1e-9:
        g = run(p, bang_bang(ts))[0]
        if g > best[1]:
            best = (ts, g)
        ts += step
    return best


def best_smooth(p, widths=(2, 5, 10, 20, 40, 80)):
    best = (None, None, -1.0)
    for w in widths:
        for ts in range(0, int(p.horizon) + 1, 5):
            g = run(p, smooth(ts, w))[0]
            if g > best[2]:
                best = (ts, w, g)
    return best


def optimise_piecewise(p, k=16, start=None, grid=(0.0, 0.25, 0.5, 0.75, 1.0), sweeps=6):
    """Coordinate ascent on ``k`` equal segments of the copy share. Local search: a lower bound
    on the true optimum, not a proof of optimality."""
    levels = list(start) if start else [1.0] * k
    best = run(p, piecewise(levels, p.horizon))[0]
    for _ in range(sweeps):
        improved = False
        for i in range(k):
            for v in grid:
                if v == levels[i]:
                    continue
                old = levels[i]
                levels[i] = v
                g = run(p, piecewise(levels, p.horizon))[0]
                if g > best + 1e-9:
                    best, improved = g, True
                else:
                    levels[i] = old
        if not improved:
            break
    return levels, best


def analytic_unconstrained(p, n0=1.0):
    """Closed form when cash never binds and goods are the only objective.

    N' = k u N, goods rate a (1-u) N. Replicate until ts, then make goods: J(ts) = a n0 e^{k ts} (T - ts),
    maximised at ts = T - 1/k (if T > 1/k), giving J = a n0 e^{kT-1} / k. The Pontryagin switching
    condition gives the same bang-bang structure. Returns (ts, J)."""
    k = growth_rate(p)
    T = p.horizon
    if T <= 1 / k:
        return 0.0, p.a * n0 * T
    return T - 1 / k, p.a * n0 * math.exp(k * T - 1) / k
