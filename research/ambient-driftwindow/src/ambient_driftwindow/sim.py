"""Fano factor of false-wake counts against window length under persistent noise-scale drift.

Frame scores are unit-variance Gaussian AR(1) (as in research/ambient-wakeburst); a wake is the frame where a run of
scores >= theta first reaches m frames. The noise scale multiplying the scores is exp(x_b) in block b of `block`
frames, with x an AR(1) process across blocks (marginal sd sigma, lag-1 correlation rho = exp(-1/tau)).

Two levels of model:
  * frame level (`framelevel_window_counts`): simulate every frame. Exact for the model, slow.
  * Cox level (`cox_counts`): measure the mean wakes per block as a function of the scale once at frame level
    (`rate_curve`), interpolate log-rate in log-scale, then draw each block's count as Poisson(rate(scale)).
    This assumes counts are Poisson given the scale; the frame-level run is the check on that assumption.
"""
import math
import numpy as np


def ar1(phi, n, rng, chunk=1024):
    """Stationary unit-variance AR(1) of length n, vectorised in chunks (phi^-chunk kept below e^230)."""
    if phi == 0:
        return rng.standard_normal(n)
    chunk = max(8, min(chunk, int(230 / -math.log(phi))))
    k = math.sqrt(1.0 - phi * phi)
    nch = -(-n // chunk)
    w = k * rng.standard_normal(nch * chunk)
    w[0] = rng.standard_normal()
    w = w.reshape(nch, chunk)
    j = np.arange(chunk, dtype=float)
    loc = np.cumsum(w * phi ** (-j), axis=1) * (phi ** j)
    carry = np.empty(nch)
    prev = 0.0
    pc = phi ** chunk
    for c in range(nch):
        carry[c] = prev
        prev = pc * prev + loc[c, -1]
    return (loc + carry[:, None] * (phi ** (j + 1))).reshape(-1)[:n]


def wake_positions(s, theta, m):
    """Indices t where s[t-m+1..t] >= theta and s[t-m] < theta."""
    a = s >= theta
    n = len(a)
    ok = np.ones(n - m, dtype=bool)
    for k in range(1, m + 1):
        ok &= a[k:n - m + k]
    ok &= ~a[:n - m]
    return np.flatnonzero(ok) + m


def block_counts(theta, phi, m, block, scales, rng):
    """Wakes in each block of `block` frames; block b has its scores multiplied by scales[b]. One AR(1) stream."""
    scales = np.asarray(scales, dtype=float)
    s = ar1(phi, len(scales) * block, rng) * np.repeat(scales, block)
    return np.bincount(wake_positions(s, theta, m) // block, minlength=len(scales))[:len(scales)]


def rate_curve(theta, phi, m, block, grid, blocks_per_point, seed, group=400):
    """Mean wakes per block at each log-scale in `grid` (constant scale, frame-level simulation)."""
    rng = np.random.default_rng(seed)
    out = []
    for x in grid:
        tot = 0
        for g0 in range(0, blocks_per_point, group):
            g = min(group, blocks_per_point - g0)
            tot += block_counts(theta, phi, m, block, np.full(g, math.exp(x)), rng).sum()
        out.append(tot / blocks_per_point)
    return np.asarray(out)


def log_rate_fit(grid, rates, floor=1e-5):
    """Piecewise-linear interpolation of log(rate) in log-scale, held constant beyond the grid (a quadratic fit was
    tried first: the log-rate is not quadratic over +-0.45 and it extrapolated to absurd rates in the tails).
    Returns a function rate(x)."""
    grid = np.asarray(grid, dtype=float)
    lr = np.log(np.maximum(np.asarray(rates, dtype=float), floor))
    return lambda x: np.exp(np.interp(x, grid, lr))


def drift_path(n, sigma, tau, rng):
    """Log-scale path x_b: stationary AR(1), sd sigma, correlation time tau blocks (tau = 0 means i.i.d.)."""
    if sigma == 0:
        return np.zeros(n)
    rho = math.exp(-1.0 / tau) if tau > 0 else 0.0
    return sigma * ar1(rho, n, rng)


def cox_counts(rate, sigma, tau, n_blocks, rng):
    """Poisson counts per block given the drifting scale."""
    x = drift_path(n_blocks, sigma, tau, rng)
    return rng.poisson(rate(x))


def window_sums(counts, k):
    """Sum of k consecutive blocks, non-overlapping."""
    n = len(counts) // k * k
    return counts[:n].reshape(-1, k).sum(axis=1)


def fano(counts):
    c = np.asarray(counts, dtype=float)
    return float(c.var(ddof=1) / c.mean()) if c.mean() > 0 else float("nan")


def fano_ci(counts, seed=0, reps=1000):
    """Percentile bootstrap 95% interval resampling windows (windows are weakly dependent when tau exceeds the window,
    so this is optimistic there; the README says so)."""
    rng = np.random.default_rng(seed)
    c = np.asarray(counts)
    f = [fano(c[rng.integers(0, len(c), len(c))]) for _ in range(reps)]
    return tuple(np.percentile(f, [2.5, 97.5]))


def fano_theory(lam, cv, rho, k):
    """Fano factor of a k-block window for Poisson counts with mean lam per block and rate relative sd cv, assuming the
    rate's autocorrelation is rho^lag (a Cox process): 1 + lam * cv^2 * [k + 2 sum_{j<k} (k-j) rho^j] / k."""
    j = np.arange(1, k)
    var_sum = k + 2.0 * float(np.sum((k - j) * rho ** j))
    return 1.0 + lam * cv * cv * var_sum / k


def framelevel_window_counts(theta, phi, m, block, blocks_per_window, n_windows, sigma, tau, seed):
    """Counts per window from the full frame-level model with the same drift (no Poisson assumption)."""
    rng = np.random.default_rng(seed)
    x = drift_path(n_windows * blocks_per_window, sigma, tau, rng)
    counts = np.zeros(n_windows, dtype=int)
    step = max(1, 4_000_000 // (block * blocks_per_window))
    for w0 in range(0, n_windows, step):
        w = min(step, n_windows - w0)
        sl = x[w0 * blocks_per_window:(w0 + w) * blocks_per_window]
        # one AR(1) stream per group of windows; windows in a group share the stream (negligible, phi^lag ~ 0)
        c = block_counts(theta, phi, m, block, np.exp(sl), rng)
        counts[w0:w0 + w] = c.reshape(w, blocks_per_window).sum(axis=1)
    return counts
