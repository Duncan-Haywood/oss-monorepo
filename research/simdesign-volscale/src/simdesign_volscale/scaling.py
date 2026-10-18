"""Helpers: threshold a density field at the volume quantile, and fit a power law."""
import numpy as np


def binarise(x, volfrac):
    """0/1 field with the stiffest `volfrac` share of elements (by density) solid."""
    n = int(round(volfrac * x.size))
    thr = np.sort(x.ravel())[::-1][max(n - 1, 0)]
    return (x >= thr).astype(float) if n < x.size else np.ones_like(x)


def fit_power(v, c):
    """Least squares in log-log for c = A v^-k. Returns (k, A)."""
    s, b = np.polyfit(np.log(v), np.log(c), 1)
    return -float(s), float(np.exp(b))
