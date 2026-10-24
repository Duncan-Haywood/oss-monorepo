"""Small statistics for comparing co-design methods across runs (no simulator needed)."""
import math
import numpy as np


def perm_p(a, b, n_perm=20000, seed=0):
    """Two-sided permutation p-value for a difference in means (add-one smoothed, so never exactly 0)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    obs = abs(a.mean() - b.mean())
    pool = np.concatenate([a, b])
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(n_perm):
        rng.shuffle(pool)
        hits += abs(pool[:len(a)].mean() - pool[len(a):].mean()) >= obs - 1e-12
    return float((hits + 1) / (n_perm + 1))


def runs_needed(delta, sd, z_alpha=1.959964, z_power=0.841621):
    """Runs per method for a two-sample comparison of means to detect `delta` with 80% power at two-sided 5%,
    normal approximation: n = 2 (z_a + z_b)^2 sd^2 / delta^2, rounded up."""
    return int(math.ceil(2 * (z_alpha + z_power) ** 2 * sd ** 2 / delta ** 2))
