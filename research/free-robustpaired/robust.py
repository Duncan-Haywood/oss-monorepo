"""Robust paired statistics for a pendulum digital twin: does a median or trimmed residual rescue the paired test under heavy-tailed noise?

Simulator copied from research/free-c2stpower so this directory stands alone. Everything is simulated; no real data.
"""
import numpy as np

G_OVER_L, DT, STEPS = 9.81, 0.02, 100
REAL = dict(visc=0.1, coul=0.3, sd=0.02, kind="student3")


def simulate(theta0, visc, coul, steps=STEPS, dt=DT):
    """Noise-free RK4 trajectory released at rest, shape (n, steps); Coulomb term is coul*tanh(w/0.05)."""
    def f(th, w):
        return w, -G_OVER_L * np.sin(th) - visc * w - coul * np.tanh(w / 0.05)
    th, w = theta0.astype(float).copy(), np.zeros(len(theta0))
    out = np.empty((len(th), steps))
    for t in range(steps):
        out[:, t] = th
        k1 = f(th, w)
        k2 = f(th + dt / 2 * k1[0], w + dt / 2 * k1[1])
        k3 = f(th + dt / 2 * k2[0], w + dt / 2 * k2[1])
        k4 = f(th + dt * k3[0], w + dt * k3[1])
        th = th + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        w = w + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    return out


def noise(rng, shape, sd, kind):
    """Zero-mean noise with standard deviation sd ('gauss' or 'student3', df 3 rescaled to the same sd)."""
    if kind == "gauss":
        return rng.normal(0, sd, shape)
    if kind == "student3":
        return rng.standard_t(3, shape) * sd / np.sqrt(3.0)
    raise ValueError(kind)


STATS = ("mean_sq", "median_sq", "trim20_sq", "mean_abs", "huber")


def residual_stat(res, name):
    """Per-trajectory residual summary (real noisy minus twin noise-free), then averaged over trajectories.

    mean_sq: mean squared residual (the conventional paired error); median_sq: median over all residual cells of the
    squared residual; trim20_sq: mean of squared residuals after dropping the largest 20% of cells; mean_abs: mean
    |residual|; huber: mean Huber loss with threshold 0.02 (the noise sd).
    """
    a = np.abs(res).ravel()
    if name == "mean_sq":
        return float((a ** 2).mean())
    if name == "median_sq":
        return float(np.median(a ** 2))
    if name == "trim20_sq":
        s = np.sort(a ** 2)
        return float(s[: int(0.8 * len(s))].mean())
    if name == "mean_abs":
        return float(a.mean())
    if name == "huber":
        d = 0.02
        return float(np.where(a <= d, 0.5 * a ** 2, d * (a - 0.5 * d)).mean())
    raise ValueError(name)


def replicate(rng, n, twin, noise_kind, sd=REAL["sd"], clean_cache=None):
    """One paired experiment: n starts, real noisy trajectories, twin noise-free; returns {stat: value}."""
    th0 = rng.uniform(-2.0, 2.0, n)
    real = simulate(th0, REAL["visc"], REAL["coul"]) + noise(rng, (n, STEPS), sd, noise_kind)
    res = real - simulate(th0, twin["visc"], twin["coul"])
    return {s: residual_stat(res, s) for s in STATS}


def threshold(null_values, alpha=0.05):
    return float(np.quantile(np.asarray(null_values), 1 - alpha))


def power(stat_values, thr):
    """Share of replicates above thr, with a Wilson 95% interval."""
    k, n = int(np.sum(np.asarray(stat_values) > thr)), len(stat_values)
    z, p = 1.96, k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return p, max(0.0, c - h), min(1.0, c + h)
