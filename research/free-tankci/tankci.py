"""Moving-block bootstrap of paired RMSE differences between model predictions."""
import numpy as np

W = 50  # samples reserved for state initialisation in the source project
NAMES = ["twin (no overflow)", "twin (overflow)", "linear ARX 2/2", "linear ARX 4/4",
         "NARX quadratic 2/2", "NARX quadratic 3/3", "NARX quadratic 4/4"]


def load(path):
    a = np.load(path)
    return a[0, W:], {n: a[i + 1, W:] for i, n in enumerate(NAMES)}


def rmse(p, y):
    return float(np.sqrt(np.mean((p - y) ** 2)))


def block_indices(n, block, rng):
    """Circular moving-block resample of range(n) (Politis-Romano style, wrap-around)."""
    k = -(-n // block)
    starts = rng.integers(0, n, size=k)
    return ((starts[:, None] + np.arange(block)[None, :]) % n).ravel()[:n]


def paired_gap(y, pa, pb, block, n_boot=4000, seed=0):
    """RMSE(b) - RMSE(a) with a (1-alpha) block-bootstrap percentile interval."""
    rng = np.random.default_rng(seed)
    ea, eb = (pa - y) ** 2, (pb - y) ** 2
    n = len(y)
    gaps = np.empty(n_boot)
    for i in range(n_boot):
        ix = block_indices(n, block, rng)
        gaps[i] = np.sqrt(eb[ix].mean()) - np.sqrt(ea[ix].mean())
    lo, hi = np.percentile(gaps, [2.5, 97.5])
    return {"gap": rmse(pb, y) - rmse(pa, y), "lo": float(lo), "hi": float(hi),
            "p_le_0": float(np.mean(gaps <= 0))}


def error_autocorr_time(e, maxlag=200):
    """Integrated autocorrelation time of e (initial positive sequence), a guide for block length."""
    e = e - e.mean()
    c = np.correlate(e, e, "full")[len(e) - 1:] / len(e)
    r = c[:maxlag] / c[0]
    tau = 1.0
    for k in range(1, maxlag - 1, 2):
        s = r[k] + r[k + 1]
        if s <= 0:
            break
        tau += 2 * s
    return float(tau)
