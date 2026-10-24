"""Detectors on a scalar residual series z (large positive = more likely a leak): moving-average threshold, CUSUM, PELT."""
import numpy as np


def first_alarm_ma(z, h, win=3, start=0):
    """First t >= start where the mean of the last `win` values exceeds h; None if never."""
    c = np.convolve(z, np.ones(win) / win, mode="full")[: len(z)]
    idx = np.flatnonzero(c[start:] > h)
    return int(idx[0]) + start if len(idx) else None


def first_alarm_cusum(z, h, k=0.5, start=0):
    """One-sided CUSUM S_t = max(0, S_{t-1} + z_t - k), run from `start`; first t with S_t > h."""
    s = 0.0
    for t in range(start, len(z)):
        s = max(0.0, s + z[t] - k)
        if s > h:
            return t
    return None


def pelt(x, beta):
    """Changepoints of x minimising sum of squared deviations from segment means + beta per change (Killick et al. 2012).
    Returns the sorted list of changepoint indices (a change at i means a new segment starts at x[i])."""
    n = len(x)
    c1 = np.concatenate([[0.0], np.cumsum(x)])
    c2 = np.concatenate([[0.0], np.cumsum(x * x)])

    def cost(a, b):
        m = b - a
        return c2[b] - c2[a] - (c1[b] - c1[a]) ** 2 / m

    f = np.full(n + 1, np.inf)
    f[0] = -beta
    last = np.zeros(n + 1, dtype=int)
    cand = [0]
    for t in range(1, n + 1):
        vals = [f[s] + cost(s, t) + beta for s in cand]
        j = int(np.argmin(vals))
        f[t] = vals[j]
        last[t] = cand[j]
        cand = [s for s, v in zip(cand, vals) if v - beta <= f[t]] + [t]
    cps, t = [], n
    while t > 0:
        s = last[t]
        if s > 0:
            cps.append(s)
        t = s
    return sorted(cps)


def first_alarm_pelt(z, beta, start, every=6):
    """Online use of PELT: every `every` hours from `start`, segment z[:t+1]; alarm when the last segment begins at or after
    `start - every` and its mean is above the mean of the series before it. Returns the first such t, or None."""
    for t in range(start, len(z), every):
        x = z[: t + 1]
        cps = pelt(x, beta)
        if cps and cps[-1] >= start - every and x[cps[-1]:].mean() > x[: cps[-1]].mean():
            return t
    return None
