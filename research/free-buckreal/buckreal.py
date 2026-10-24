"""Twins of a real buck converter: ARX against a physics-shaped Hammerstein twin.

Data: `data/buck_id.csv` (first 10 ms) and `data/buck_valid.csv` (next 10 ms),
10 us sampling, input = control voltage (V), output = converter voltage (V,
quantised at 0.2 V), from the SysIdentPy data repository (MIT licence).
"""
import csv
import os

import numpy as np
from scipy.optimize import least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
DT = 1e-5


def load(name):
    with open(os.path.join(HERE, "data", name + ".csv")) as f:
        r = list(csv.DictReader(f))
    return (np.array([float(x["input"]) for x in r]),
            np.array([float(x["y"]) for x in r]))


def rmse(a, b, skip=0):
    return float(np.sqrt(np.mean((np.asarray(a)[skip:] - np.asarray(b)[skip:]) ** 2)))


# ---------- ARX ----------
def _reg(u, y, na, nb, k0):
    k = max(na, nb)
    rows = [[-y[t - i] for i in range(1, na + 1)] + [u[t - i] for i in range(1, nb + 1)] + [1.0]
            for t in range(k, len(y))]
    return np.array(rows), y[k:]


def fit_arx(u, y, na, nb):
    """One-step-ahead least squares (with a constant)."""
    X, t = _reg(u, y, na, nb, 0)
    return np.linalg.lstsq(X, t, rcond=None)[0]


def sim_arx(theta, u, y0, na, nb):
    """Free run from the first max(na,nb) measured outputs."""
    k = max(na, nb)
    y = np.array(y0[:k], float)
    y = np.concatenate([y, np.zeros(len(u) - k)])
    for t in range(k, len(u)):
        x = [-y[t - i] for i in range(1, na + 1)] + [u[t - i] for i in range(1, nb + 1)] + [1.0]
        y[t] = float(np.dot(theta, x))
    return y


# ---------- physics-shaped twin ----------
def lti2(x, wn, zeta, dt=DT):
    """Unit-DC-gain 2nd-order lag wn^2/(s^2+2 zeta wn s+wn^2), exact ZOH step per sample."""
    A = np.array([[0.0, 1.0], [-wn ** 2, -2 * zeta * wn]])
    B = np.array([0.0, wn ** 2])
    # matrix exponential of the augmented system
    from scipy.linalg import expm
    M = np.zeros((3, 3)); M[:2, :2] = A * dt; M[:2, 2] = B * dt
    E = expm(M)
    Ad, Bd = E[:2, :2], E[:2, 2]
    z = np.zeros(2); out = np.empty(len(x))
    for i, v in enumerate(x):
        z = Ad @ z + Bd * v
        out[i] = z[0]
    return out


def twin_sim(p, u, structure="hammerstein", delay=0, dt=DT):
    """p = [wn (rad/s), zeta, c0, c1, c2] ; static poly in u (c0 + c1 du + c2 du^2), du = u - 2.35.

    hammerstein: static polynomial then the lag (input nonlinearity: duty to average voltage).
    linear: c2 forced to 0.
    """
    wn, zeta, c0, c1, c2 = p
    if structure == "linear":
        c2 = 0.0
    du = np.concatenate([np.full(delay, u[0]), u[:len(u) - delay]]) - 2.35
    drive = c1 * du + c2 * du ** 2
    return c0 + lti2(drive, wn, zeta, dt)


def fit_twin(u, y, structure="hammerstein", delay=0, starts=((8e3, .3), (2e4, .15), (5e3, .6), (1.5e4, .5))):
    best = None
    for wn0, z0 in starts:
        p0 = [wn0, z0, float(y.mean()), -8.0, 0.0]
        lo = [1e3, 0.02, 5, -200, -500]; hi = [2e5, 5, 25, 200, 500]
        r = least_squares(lambda p: twin_sim(p, u, structure, delay) - y, p0,
                          bounds=(lo, hi), x_scale=[1e4, 1, 1, 5, 5])
        if best is None or r.cost < best.cost:
            best = r
    return best.x
