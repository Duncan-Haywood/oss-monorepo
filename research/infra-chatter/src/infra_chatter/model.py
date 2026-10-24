"""One-degree-of-freedom milling chatter: zero-order stability lobes, semi-discretisation, time-domain check.

Equation (Insperger and Stepan 2002 benchmark form), tool displacement x normal to the feed:
    x'' + 2 zeta wn x' + wn^2 x = -(w h(t) / m) (x(t) - x(t - tau)),   tau = 60 / (N n)
    h(t) = sum_j g(phi_j(t)) sin(phi_j) (Kt cos(phi_j) + Kn sin(phi_j)),  phi_j = 2 pi n t / 60 + 2 pi j / N
g = 1 while tooth j is inside the cut, else 0.  w is the axial depth of cut.
"""
import math
from dataclasses import dataclass

import numpy as np
from scipy.linalg import expm


@dataclass(frozen=True)
class Tool:
    fn: float = 922.0      # natural frequency, Hz
    zeta: float = 0.011    # damping ratio
    k: float = 1.4e6       # modal stiffness, N/m
    kt: float = 6e8        # tangential cutting stiffness, N/m^2
    kn: float = 2e8        # normal cutting stiffness, N/m^2
    teeth: int = 2

    @property
    def wn(self):
        return 2 * math.pi * self.fn

    @property
    def m(self):
        return self.k / self.wn ** 2


def cut_window(ae_over_d, up):
    """Entry and exit angles (rad) of a tooth for radial immersion a_e/D; up- or down-milling."""
    if up:
        return 0.0, math.acos(1 - 2 * ae_over_d)
    return math.acos(2 * ae_over_d - 1), math.pi


def h_mean(tool, ae_over_d, up):
    """Average directional coefficient h_0 (N/m^2): N/(2 pi) * integral of sin(phi)(Kt cos phi + Kn sin phi)."""
    a, b = cut_window(ae_over_d, up)
    i1 = (math.sin(b) ** 2 - math.sin(a) ** 2) / 2                       # integral of sin cos
    i2 = (b - a) / 2 - (math.sin(2 * b) - math.sin(2 * a)) / 4           # integral of sin^2
    return tool.teeth / (2 * math.pi) * (tool.kt * i1 + tool.kn * i2)


def frf(tool, f):
    """Receptance of the single mode at frequency f (Hz)."""
    r = np.asarray(f, float) / tool.fn
    return 1.0 / (tool.k * (1 - r ** 2 + 2j * tool.zeta * r))


def zoa_lobes(tool, ae_over_d, up, lobes=range(0, 12), nf=4000):
    """Altintas-Budak zero-order lobes: arrays of (spindle rpm, limit depth w) for each lobe number.

    On the stability boundary w h0 G(i w_c)(1 - exp(-i w_c T)) = -1. Writing psi = arg G, the phase gives
    w_c T = 2 psi + 3 pi + 2 pi k and the modulus w = -1/(2 h0 Re G), for the frequencies where Re G < 0.
    """
    h0 = h_mean(tool, ae_over_d, up)
    if h0 <= 0:
        raise ValueError("mean directional coefficient is not positive: no regenerative instability in this model")
    f = np.linspace(tool.fn * 0.5, tool.fn * 2.0, nf)
    g = frf(tool, f)
    sel = g.real < 0
    f, g = f[sel], g[sel]
    wlim = -1.0 / (2 * h0 * g.real)
    psi = np.angle(g)                          # in (-pi, -pi/2) where Re G < 0
    out = []
    for k in lobes:
        wcT = 2 * psi + 3 * math.pi + 2 * math.pi * k    # w_c T = eps + 2 pi k, eps in (pi, 2 pi)
        T = wcT / (2 * math.pi * f)
        rpm = 60.0 / (tool.teeth * T)
        out.append((k, rpm, wlim))
    return out


def zoa_limit(tool, ae_over_d, up, rpm_grid):
    """Lower envelope of the zero-order lobes on a rpm grid (m)."""
    lim = np.full(len(rpm_grid), np.inf)
    for _, rpm, w in zoa_lobes(tool, ae_over_d, up, lobes=range(0, 40)):
        order = np.argsort(rpm)
        r, ww = rpm[order], w[order]
        ok = (rpm_grid >= r[0]) & (rpm_grid <= r[-1])
        lim[ok] = np.minimum(lim[ok], np.interp(rpm_grid[ok], r, ww))
    return lim


def _tooth_h(tool, rpm, ae_over_d, up, t):
    a, b = cut_window(ae_over_d, up)
    h = 0.0
    for j in range(tool.teeth):
        phi = (2 * math.pi * rpm / 60.0 * t + 2 * math.pi * j / tool.teeth) % (2 * math.pi)
        if a <= phi <= b:
            h += math.sin(phi) * (tool.kt * math.cos(phi) + tool.kn * math.sin(phi))
    return h


def floquet_radius(tool, rpm, w, ae_over_d, up, steps=40):
    """Zeroth-order semi-discretisation: largest Floquet multiplier modulus (stable if < 1)."""
    tau = 60.0 / (tool.teeth * rpm)
    dt = tau / steps
    r = steps
    n = r + 2
    A0 = np.array([[0.0, 1.0], [-tool.wn ** 2, -2 * tool.zeta * tool.wn]])
    phi = np.eye(n)
    for i in range(r):
        c = w * _tooth_h(tool, rpm, ae_over_d, up, (i + 0.5) * dt) / tool.m
        A = A0.copy()
        A[1, 0] -= c
        E = expm(A * dt)
        Bu = np.linalg.solve(A, (E - np.eye(2)) @ np.array([0.0, c]))   # response to the delayed input
        M = np.zeros((n, n))
        M[:2, :2] = E
        # z = [x_i, v_i, x_{i-1}, ..., x_{i-r}]; delayed input = (x_{i-r} + x_{i-r+1}) / 2
        M[:2, n - 1] += Bu * 0.5
        M[:2, n - 2] += Bu * 0.5
        M[2, 0] = 1.0
        for q in range(3, n):
            M[q, q - 1] = 1.0
        phi = M @ phi
    return float(np.max(np.abs(np.linalg.eigvals(phi))))


def sd_limit(tool, rpm, ae_over_d, up, wmax, nw=60, steps=40):
    """Smallest depth at which the semi-discretised system is unstable (scan, then bisect); wmax if none."""
    prev = 0.0
    for w in np.linspace(wmax / nw, wmax, nw):
        if floquet_radius(tool, rpm, w, ae_over_d, up, steps) > 1.0:
            lo, hi = prev, w
            for _ in range(14):
                mid = 0.5 * (lo + hi)
                if floquet_radius(tool, rpm, mid, ae_over_d, up, steps) > 1.0:
                    hi = mid
                else:
                    lo = mid
            return 0.5 * (lo + hi)
        prev = w
    return wmax


def time_domain_growth(tool, rpm, w, ae_over_d, up, periods=300, per=400):
    """Growth factor per delay period from a fine RK4 simulation with a true delay line (independent of the SD code)."""
    tau = 60.0 / (tool.teeth * rpm)
    dt = tau / per
    nsteps = periods * per
    x = np.zeros(nsteps + per + 2)
    x[: per + 1] = 1e-6 * np.cos(np.linspace(0, 3, per + 1))
    v = 0.0
    wn, z, m = tool.wn, tool.zeta, tool.m

    def acc(t, xx, vv, xd):
        return -2 * z * wn * vv - wn ** 2 * xx - w * _tooth_h(tool, rpm, ae_over_d, up, t) / m * (xx - xd)

    peaks = []
    for s in range(per, per + nsteps):
        t = (s - per) * dt
        xd0, xd1 = x[s - per], x[s - per + 1]
        xd_mid = 0.5 * (xd0 + xd1)
        xx = x[s]
        k1x, k1v = v, acc(t, xx, v, xd0)
        k2x, k2v = v + 0.5 * dt * k1v, acc(t + dt / 2, xx + 0.5 * dt * k1x, v + 0.5 * dt * k1v, xd_mid)
        k3x, k3v = v + 0.5 * dt * k2v, acc(t + dt / 2, xx + 0.5 * dt * k2x, v + 0.5 * dt * k2v, xd_mid)
        k4x, k4v = v + dt * k3v, acc(t + dt, xx + dt * k3x, v + dt * k3v, xd1)
        x[s + 1] = xx + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
        v = v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        if (s - per + 1) % per == 0:
            seg = x[s + 1 - per: s + 2]
            peaks.append(float(np.max(np.abs(seg))))
            if peaks[-1] > 1e100 or peaks[-1] < 1e-200:
                break
    a = peaks[len(peaks) // 2:]
    p = len(a)
    return math.exp((math.log(a[-1]) - math.log(a[0])) / max(p - 1, 1))
