"""Sag twin.  A battery of open-circuit voltage e(s) = 1 - d (1 - s) (units of the full-charge EMF E0, s = state of charge)
and internal resistance R(s) = R0 (1 + rho (1 - s)) feeds a constant-power load P.  Nondimensional: u0 = 4 R0 P / E0^2
(u0 = 1 is the fold of a flat-EMF source: maximum power E0^2 / 4 R0), current i = I R0 / E0, time in units of R0 Q / E0
(Q the charge capacity), so ds/dt = -i.  With r(s) = 1 + rho (1 - s) the terminal voltage v = e - r i and v i = u0/4 give
    r i^2 - e i + u0/4 = 0,    i = (e - sqrt(e^2 - r u0)) / (2 r).
The load is dropped when v < vc (cutoff).  Twin: the same open-circuit curve and no resistance, i_tw = u0 / (4 e).
"""
import math

D = 0.25      # EMF droop from full to empty (illustrative: ~4.2 V -> ~3.15 V per cell)
VC = 0.70     # cutoff voltage / E0 (~2.95 V)


def emf(s, d=D):
    return 1.0 - d * (1.0 - s)


def res(s, rho=0.0):
    return 1.0 + rho * (1.0 - s)


def current(s, u0, d=D, rho=0.0):
    """Scaled battery current at state s for constant power u0, or None past the power fold e^2 < r u0."""
    e, r = emf(s, d), res(s, rho)
    disc = e * e - r * u0
    if disc < 0:
        return None
    return (e - math.sqrt(disc)) / (2.0 * r)


def voltage(s, u0, d=D, rho=0.0):
    i = current(s, u0, d, rho)
    return None if i is None else emf(s, d) - res(s, rho) * i


def twin_current(s, u0, d=D):
    return u0 / (4.0 * emf(s, d))


def eta(u):
    """Flat-EMF terminal-voltage ratio v/e = (1 + sqrt(1 - u))/2 at constant power u (u = 4 R P / E^2 <= 1)."""
    return 0.5 * (1.0 + math.sqrt(1.0 - u))


def s_cut(u0, vc=VC, d=D, rho=0.0):
    """State of charge at which constant power u0 hits the voltage cutoff (closed form; v = vc means i = u0/(4 vc),
    e - r i = vc is linear in x = 1 - s).  0 if the cell empties first; None if u0 cannot even start from full charge."""
    k = u0 / (4.0 * vc)
    num = 1.0 - vc - k
    if num < 0:
        return None
    x = num / (d + rho * k)
    return max(0.0, 1.0 - x)


def max_power(s, vc=VC, d=D, rho=0.0):
    """Largest constant power deliverable at state s above the cutoff: 4 vc (e - vc) / r  (units of E0^2/(4 R0))."""
    return max(0.0, 4.0 * vc * (emf(s, d) - vc) / res(s, rho))


def endurance(u0, s_from=1.0, s_to=None, vc=VC, d=D, rho=0.0, n=40000):
    """Time (units R0 Q/E0) to go from s_from to s_to (default: the cutoff) at constant power; midpoint quadrature of ds/i."""
    if s_to is None:
        s_to = s_cut(u0, vc, d, rho)
        if s_to is None:
            return 0.0
    h = (s_from - s_to) / n
    t = 0.0
    for k in range(n):
        s = s_to + (k + 0.5) * h
        t += h / current(s, u0, d, rho)
    return t


def twin_endurance(u0, s_from=1.0, s_to=0.0, d=D):
    """Closed form (4/u0) * integral of e ds between s_to and s_from."""
    mean_e = 0.5 * (emf(s_from, d) + emf(s_to, d))
    return 4.0 / u0 * mean_e * (s_from - s_to)


def simulate(u0, dt=1e-3, vc=VC, d=D, rho=0.0):
    """Euler time stepping of ds/dt = -i until the cutoff (independent of the quadrature).  Returns (time, final s)."""
    s, t = 1.0, 0.0
    while True:
        v = voltage(s, u0, d, rho)
        if v is None or v < vc or s <= 0:
            return t, max(s, 0.0)
        s -= dt * current(s, u0, d, rho)
        t += dt


def fit_resistance(i_log, e_log, v_log):
    """Least squares through the origin of (e - v) on i: R-hat = sum i (e-v) / sum i^2 (OCV curve known)."""
    num = sum(i * (e - v) for i, e, v in zip(i_log, e_log, v_log))
    den = sum(i * i for i in i_log)
    return num / den, den
