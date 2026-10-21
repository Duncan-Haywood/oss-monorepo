"""Physics twin vs black-box models on the real Cascaded Tanks rig.

Data: Schoukens et al. (2016), via the `nonlinear-benchmarks` package. All models are
scored by free-run simulation (no measured output is fed back), the digital-twin use case.
"""
import numpy as np
from scipy.optimize import least_squares

TS = 4.0  # s, sampling time of the benchmark
SUB = 8   # Euler sub-steps per sample


def twin_sim(theta, u, overflow=True, dt=TS):
    """Two-tank twin. x1' = -a1 sqrt(x1) + b u ; x2' = a1 sqrt(x1) - a2 sqrt(x2).
    y = x2 + c (sensor offset). With `overflow`, tank 1 above cap `h1m` spills: the excess
    is carried on to tank 2 through a linear term k*(x1-h1m) (a fitted, not measured, law)."""
    a1, a2, b, c, x10, x20 = theta[:6]
    h1m, k = (theta[6], theta[7]) if overflow else (np.inf, 0.0)
    x1, x2 = x10, x20
    h = dt / SUB
    y = np.empty(len(u))
    for i, ui in enumerate(u):
        y[i] = x2 + c
        for _ in range(SUB):
            s1, s2 = np.sqrt(max(x1, 0.0)), np.sqrt(max(x2, 0.0))
            spill = k * max(x1 - h1m, 0.0)
            d1 = -a1 * s1 + b * ui - spill
            d2 = a1 * s1 - a2 * s2 + spill
            x1 += h * d1
            x2 += h * d2
    return y


def fit_twin(u, y, overflow=True, start=0, theta0=None):
    th0 = np.array([0.05, 0.05, 0.05, 0.0, y[0], y[0], 8.0, 0.1] if theta0 is None else theta0)
    n = 8 if overflow else 6
    lo = [1e-4, 1e-4, 1e-4, -3, 0, 0, 3.0, 0.0][:n]
    hi = [2, 2, 2, 3, 30, 30, 30.0, 5.0][:n]
    f = lambda th: (twin_sim(th, u, overflow) - y)[start:]
    r = least_squares(f, th0[:n], bounds=(lo, hi), x_scale=np.maximum(np.abs(th0[:n]), 0.05))
    return r.x


def _reg(u, y, na, nb, poly):
    n = len(y)
    rows = []
    for t in range(max(na, nb), n):
        z = list(y[t - na:t][::-1]) + list(u[t - nb:t][::-1])
        rows.append(z)
    Z = np.array(rows)
    cols = [Z]
    if poly >= 2:
        i, j = np.triu_indices(Z.shape[1])
        cols.append(Z[:, i] * Z[:, j])
    X = np.hstack([np.ones((len(Z), 1))] + cols)
    return X, y[max(na, nb):]


def narx_features(z, poly):
    z = np.asarray(z)
    out = [1.0, *z]
    if poly >= 2:
        i, j = np.triu_indices(len(z))
        out += list(z[i] * z[j])
    return np.array(out)


def fit_narx(u, y, na=2, nb=2, poly=1, ridge=1e-6):
    X, t = _reg(u, y, na, nb, poly)
    w = np.linalg.solve(X.T @ X + ridge * np.eye(X.shape[1]), X.T @ t)
    return dict(w=w, na=na, nb=nb, poly=poly)


def narx_sim(m, u, y_init):
    """Free run from the first max(na,nb) measured outputs (the init window)."""
    na, nb, poly, w = m["na"], m["nb"], m["poly"], m["w"]
    k = max(na, nb)
    ys = list(y_init[:k])
    for t in range(k, len(u)):
        z = list(ys[t - na:t][::-1]) + list(u[t - nb:t][::-1])
        v = float(narx_features(z, poly) @ w)
        ys.append(float(np.clip(v, -50, 50)))
    return np.array(ys)


def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))
