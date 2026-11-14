"""SICAMS (Melnikov 2025, arXiv:2512.15685), reimplemented from the paper, with the choices it
leaves open fixed by rule (step 13, LOG.md).

The detector whitens a vector of sensor readings per temporal cluster (hour of day, or 2-hour
blocks) with the cluster's sample mean and covariance from leak-free training hours, and tracks
Hotelling's T^2 rescaled to an F variable (paper eqs. 9 and 10). Two decision rules:

* Algorithm 1, a hysteresis filter on the moving average of T^2_F: anomaly when it exceeds
  theta_1 = F_{1-alpha}(s, n - s) (eq. 13), resolved when it falls below theta_0 = E[F] (eq. 14).
* Section 3.4 and Algorithm 2: PELT change points on the moving average, then paired t-tests on
  bisected intervals to label each change point "anomaly start" or "anomaly end", dropping
  change points between two increasing intervals of similar slope.

Pre-localisation (section 3.5) interpolates z^2 over the graph; by the maximum principle its peak
is at a sensor (section 5.2), so here it is the sensor with the largest mean z^2.
"""
from __future__ import annotations

import numpy as np
from scipy import stats


class Model:
    """Per-cluster means, inverse covariances and sizes for one spatial cluster."""

    def __init__(self, X, clusters, train):
        """X [H, s] readings, clusters [H] int labels, train [H] bool (leak-free hours)."""
        self.s = X.shape[1]
        self.mu, self.prec, self.sd, self.n = {}, {}, {}, {}
        for k in np.unique(clusters):
            Xk = X[train & (clusters == k)]
            n = len(Xk)
            if n <= self.s + 2:
                raise ValueError(f"cluster {k}: {n} training hours for {self.s} sensors")
            self.mu[k] = Xk.mean(axis=0)
            S = np.atleast_2d(np.cov(Xk, rowvar=False, ddof=1))
            self.prec[k] = np.linalg.inv(S)
            self.sd[k] = np.sqrt(np.diag(S))
            self.n[k] = n

    def n_median(self):
        return int(np.median(list(self.n.values())))

    def t2f(self, X, clusters):
        """T^2_F per hour (eq. 10) with each hour's own cluster."""
        out = np.full(len(X), np.nan)
        for k in self.mu:
            m = clusters == k
            if not m.any():
                continue
            D = X[m] - self.mu[k]
            t2 = np.einsum("ij,jk,ik->i", D, self.prec[k], D)
            n = self.n[k]
            out[m] = (n - self.s) / (self.s * (n - 1)) * t2
        return out

    def z2(self, X, clusters):
        """Squared z-scores per sensor (eq. 16)."""
        out = np.full(X.shape, np.nan)
        for k in self.mu:
            m = clusters == k
            out[m] = ((X[m] - self.mu[k]) / self.sd[k]) ** 2
        return out


def moving_average(x, L=12):
    """Trailing mean over L hours (shorter at the start)."""
    c = np.concatenate([[0.0], np.cumsum(x)])
    i = np.arange(1, len(x) + 1)
    lo = np.maximum(i - L, 0)
    return (c[i] - c[lo]) / (i - lo)


def thresholds(s, n, alpha):
    """theta_1 (eq. 13) and theta_0 (eq. 14)."""
    th1 = stats.f.ppf(1 - alpha, s, n - s)
    th0 = (n - s) / (n - s - 2)
    return float(th1), float(th0)


def hysteresis(m, th1, th0, active=None):
    """Algorithm 1 on a moving-average series. Returns the hours where the state switches to
    anomalous. `active` [H] bool: hours where the filter runs (state reset to normal elsewhere)."""
    on, starts = False, []
    for t, v in enumerate(m):
        if active is not None and not active[t]:
            on = False
            continue
        if not on and v > th1:
            on = True
            starts.append(t)
        elif on and v < th0:
            on = False
    return starts


def pelt(x, pen, min_size=24):
    """PELT (Killick et al. 2012) for changes in mean, unit-variance Gaussian cost.
    Returns the sorted change-point indices (start of each new segment)."""
    n = len(x)
    s1 = np.concatenate([[0.0], np.cumsum(x)])
    s2 = np.concatenate([[0.0], np.cumsum(x * x)])

    def cost(a, b):
        return s2[b] - s2[a] - (s1[b] - s1[a]) ** 2 / (b - a)

    F = np.full(n + 1, np.inf)
    F[0] = -pen
    last = np.zeros(n + 1, dtype=int)
    R = np.array([0])
    for t in range(min_size, n + 1):
        if t - min_size >= min_size:
            R = np.append(R, t - min_size)
        c = F[R] + cost(R, t)
        j = int(np.argmin(c))
        F[t] = c[j] + pen
        last[t] = R[j]
        R = R[c <= F[t]]
    cps, t = [], n
    while t > 0:
        t = last[t]
        if t > 0:
            cps.append(t)
    return sorted(cps)


def _halves(a, b):
    h = (b - a) // 2
    return (a, a + h), (b - h, b)


def classify(x, cps, alpha=0.05, delta=0.0):
    """Algorithm 2. Returns [(index, 'start' | 'end')] for the labelled change points kept."""
    bounds = [0] + list(cps) + [len(x)]
    ivs = list(zip(bounds[:-1], bounds[1:]))
    increasing, slopes = [], []
    for a, b in ivs:
        (a1, b1), (a2, b2) = _halves(a, b)
        p = stats.ttest_rel(x[a1:b1], x[a2:b2]).pvalue if b1 - a1 >= 2 else 1.0
        increasing.append(bool(p < alpha))
        tt = np.arange(b - a)
        slopes.append(float(np.polyfit(tt, x[a:b], 1)[0]) if b - a >= 2 else 0.0)
    out = []
    for i, cp in enumerate(cps):
        (a, b), (c, d) = ivs[i], ivs[i + 1]
        if increasing[i] and increasing[i + 1] and abs(slopes[i] - slopes[i + 1]) < delta:
            continue
        m = min((b - a) // 2, (d - c) // 2)
        if m < 2:
            continue
        left, right = x[b - m:b], x[c:c + m]
        p = stats.ttest_rel(left, right).pvalue
        if p < alpha:
            out.append((cp, "start" if right.mean() > left.mean() else "end"))
    return out


def alarm_sensor(z2, t, cols, L=12):
    """Index into `cols` of the sensor with the largest mean z^2 over the L hours ending at t."""
    w = z2[max(0, t - L + 1):t + 1]
    return int(np.argmax(np.nanmean(w, axis=0)))
