"""Do robust paired statistics survive heavier tails than Student-t(3): infinite-variance Student-t(2) cells, and whole bad runs?

Simulator copied from research/free-robustpaired so this directory stands alone. Everything is simulated; no real data.
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
    """Zero-mean noise. 'gauss': sd. 'student3': df 3 rescaled to sd. 'student2': df 2 at the same scale as student3
    (variance is infinite, so sd is only a scale). 'badruns': Gaussian sd, but each trajectory (row) is, with
    probability 0.1, a bad run whose noise sd is 10 times larger."""
    if kind == "gauss":
        return rng.normal(0, sd, shape)
    if kind == "student3":
        return rng.standard_t(3, shape) * sd / np.sqrt(3.0)
    if kind == "student2":
        return rng.standard_t(2, shape) * sd / np.sqrt(3.0)
    if kind == "badruns":
        scale = np.where(rng.random(shape[0]) < 0.1, 10.0, 1.0)[:, None]
        return rng.normal(0, sd, shape) * scale
    raise ValueError(kind)


STATS = ("mean_sq", "median_sq", "trim20_sq", "huber_known", "huber_est", "run_median")


def residual_stat(res, name):
    """Summary of the residual (real noisy minus twin noise-free), shape (n, steps) or flat.

    mean_sq: mean squared residual; median_sq: median over all cells of the squared residual; trim20_sq: mean of
    squared residuals after dropping the largest 20% of cells; huber_known: mean Huber loss with threshold 0.02 (the
    true noise scale, which a practitioner would not know); huber_est: mean Huber loss with threshold 1.345 times
    the MAD-based scale of the same residuals (re-estimated in every replicate, so a wrong twin inflates it);
    run_median: median over trajectories of each trajectory's mean squared residual (resists whole bad runs).
    """
    a = np.abs(res)
    if name == "run_median":
        return float(np.median((np.atleast_2d(res) ** 2).mean(axis=1)))
    a = a.ravel()
    if name == "mean_sq":
        return float((a ** 2).mean())
    if name == "median_sq":
        return float(np.median(a ** 2))
    if name == "trim20_sq":
        s = np.sort(a ** 2)
        return float(s[: int(0.8 * len(s))].mean())
    if name in ("huber_known", "huber_est"):
        d = 0.02 if name == "huber_known" else 1.345 * 1.4826 * float(np.median(np.abs(res.ravel() - np.median(res))))
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
