"""Tack control on a wind time series: three controllers and a bound, for a boat beating to a mark dead to windward.

Wind is spatially uniform, speed s(t) and direction-from d(t) on a 1-minute grid. The mark lies on the bearing `phi` (the
window's circular-mean wind direction), so the boat must work upwind. On tack sigma (+1 or -1) the heading is d + sigma*beta(s),
so the angle to the line is eps + sigma*beta with eps = d - phi, progress rate v(s) cos(eps + sigma beta) and cross-line rate
v(s) sin(eps + sigma beta). A corridor |y| <= C about the line is enforced (a survey boat holds its line); y is clamped at the
edge. A tack costs `tau` seconds of no progress. Controllers: corridor-edge tacking, header-following (tack when the other tack
makes more progress by a margin, after a minimum dwell, plus forced edge tacks), and a clairvoyant dynamic programme. The
bound is the sum over time of the better tack's progress with no corridor and no tack cost.
"""
import math
import numpy as np


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


def circ_mean(deg):
    r = np.radians(deg)
    return math.degrees(math.atan2(np.mean(np.sin(r)), np.mean(np.cos(r)))) % 360.0


def rates(s, eps, vfun, bfun, vmin=1.5):
    """Per-step progress and cross rates (m/s) on each tack: arrays shape (2, n) for sigma = +1, -1."""
    v = np.where(s >= vmin, vfun(s), 0.0)
    b = bfun(s)
    out_p, out_c = [], []
    for sg in (1.0, -1.0):
        ang = np.radians(eps + sg * b)
        # a tack that loses ground is not sailed (the boat would bear away or use the other tack): progress is floored at zero
        out_p.append(np.maximum(v * np.cos(ang), 0.0)); out_c.append(v * np.sin(ang))
    return np.array(out_p), np.array(out_c)


def bound(p, dt):
    return float(np.sum(np.maximum(p[0], p[1])) * dt)


def sim_corridor(p, c, dt, corr, tau):
    x, y, sg, n_t = 0.0, 0.0, 0, 0
    pen = 0.0
    for k in range(p.shape[1]):
        f = 1.0 - pen
        pen = 0.0
        x += p[sg, k] * dt * f
        y += c[sg, k] * dt * f
        if y >= corr and c[sg, k] > 0 or y <= -corr and c[sg, k] < 0:
            y = max(-corr, min(corr, y))
            sg ^= 1; n_t += 1; pen = min(1.0, tau / dt)
    return x, n_t


def sim_header(p, c, dt, corr, tau, margin, dwell_steps):
    x, y, sg, n_t, since = 0.0, 0.0, 0, 0, 10 ** 9
    pen = 0.0
    for k in range(p.shape[1]):
        f = 1.0 - pen
        pen = 0.0
        x += p[sg, k] * dt * f
        y += c[sg, k] * dt * f
        since += 1
        edge = (y >= corr and c[sg, k] > 0) or (y <= -corr and c[sg, k] < 0)
        headed = since >= dwell_steps and p[1 - sg, k] - p[sg, k] > margin * max(p[0, k], p[1, k], 1e-9)
        # do not tack onto a tack that heads straight out of the corridor
        out = (y >= corr and c[1 - sg, k] > 0) or (y <= -corr and c[1 - sg, k] < 0)
        if edge or (headed and not out):
            y = max(-corr, min(corr, y))
            sg ^= 1; n_t += 1; pen = min(1.0, tau / dt); since = 0
    return x, n_t


def dp_clairvoyant(p, c, dt, corr, tau, dy=25.0):
    """Best total progress over all tack sequences with the whole wind series known (value iteration over (tack, y))."""
    grid = np.arange(-corr, corr + dy / 2, dy)
    n = p.shape[1]
    V = np.zeros((2, len(grid)))
    for k in range(n - 1, -1, -1):
        new = np.empty_like(V)
        for sg in (0, 1):
            # stay on tack sg
            y2 = np.clip(grid + c[sg, k] * dt, -corr, corr)
            stay = p[sg, k] * dt + np.interp(y2, grid, V[sg])
            # tack at the start of this step onto the other tack: that step is shortened by tau/dt
            o = 1 - sg
            f = 1.0 - min(1.0, tau / dt)
            y3 = np.clip(grid + c[o, k] * dt * f, -corr, corr)
            sw = p[o, k] * dt * f + np.interp(y3, grid, V[o])
            new[sg] = np.maximum(stay, sw)
        V = new
    return float(max(V[0][len(grid) // 2], V[1][len(grid) // 2]))
