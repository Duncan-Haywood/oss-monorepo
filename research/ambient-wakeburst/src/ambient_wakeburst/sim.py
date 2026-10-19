"""Day-to-day spread of false-wake counts for an m-frames-in-a-row trigger on AR(1) frame scores.

A frame score is s_t = phi*s_{t-1} + sqrt(1-phi^2)*e_t (unit variance). A wake is the frame where an exceedance run
(s >= theta) first reaches m frames, as in research/ambient-falsewake. Counts are taken in fixed windows of frames and
summarised by the Fano factor var/mean (1 for a Poisson count). A lockout of L frames drops wakes within L frames of the
last kept wake. A per-window noise scale multiplies the scores, which stands for day/night or room changes.
"""
import math
import numpy as np


def ar1(phi, n, rng, chunk=1024):
    """Stationary unit-variance AR(1) of length n, vectorised in chunks: y_t = phi^t * cumsum(phi^-i w_i) + carry.

    phi^-chunk must not overflow, so the chunk is shortened to keep it below e^230 (about 1e100).
    """
    if 0 < phi < 1:
        chunk = max(8, min(chunk, int(230 / -math.log(phi))))
    k = math.sqrt(1.0 - phi * phi)
    nch = -(-n // chunk)
    w = k * rng.standard_normal(nch * chunk)
    w[0] = rng.standard_normal()                      # stationary start
    w = w.reshape(nch, chunk)
    j = np.arange(chunk, dtype=float)
    up = phi ** (-j) if phi > 0 else None
    if phi == 0:
        return w.reshape(-1)[:n]
    loc = np.cumsum(w * up, axis=1) * (phi ** j)       # local response within each chunk, zero initial state
    carry = np.empty(nch)
    prev = 0.0
    last = loc[:, -1]
    pc = phi ** chunk
    for c in range(nch):                               # sequential only over chunk ends
        carry[c] = prev
        prev = pc * prev + last[c]
    out = loc + carry[:, None] * (phi ** (j + 1))
    return out.reshape(-1)[:n]


def wake_positions(s, theta, m):
    """Indices t where s[t-m+1..t] >= theta and s[t-m] < theta (the run reaches m frames at t)."""
    a = s >= theta
    n = len(a)
    ok = np.ones(n - m, dtype=bool)
    for k in range(1, m + 1):
        ok &= a[k:n - m + k]
    ok &= ~a[:n - m]
    return np.flatnonzero(ok) + m


def lockout(pos, L):
    """Keep a wake only if it is at least L frames after the last kept one (L <= 1 keeps all)."""
    if L <= 1 or len(pos) == 0:
        return pos
    keep = [pos[0]]
    for p in pos[1:]:
        if p - keep[-1] >= L:
            keep.append(p)
    return np.asarray(keep)


def window_counts(pos, window, n_windows):
    return np.bincount(pos // window, minlength=n_windows)[:n_windows]


def fano(counts):
    c = np.asarray(counts, dtype=float)
    return float(c.var(ddof=1) / c.mean()) if c.mean() > 0 else float("nan")


def fano_ci(counts, seed=0, reps=1000):
    """Percentile bootstrap 95% interval for the Fano factor, resampling windows."""
    rng = np.random.default_rng(seed)
    c = np.asarray(counts)
    f = [fano(c[rng.integers(0, len(c), len(c))]) for _ in range(reps)]
    return tuple(np.percentile(f, [2.5, 97.5]))


def simulate_counts(theta, phi, m, window, n_windows, seed, scale_sigma=0.0, L=0):
    """Wake counts per window. Each window has its own scale exp(scale_sigma*z); windows are simulated independently."""
    rng = np.random.default_rng(seed)
    counts = np.zeros(n_windows, dtype=int)
    group = max(1, 4_000_000 // window)
    for g0 in range(0, n_windows, group):
        g = min(group, n_windows - g0)
        s = ar1(phi, g * window, rng)
        if scale_sigma > 0:
            sc = np.exp(scale_sigma * rng.standard_normal(g))
            s = s * np.repeat(sc, window)
        pos = lockout(wake_positions(s, theta, m), L)
        counts[g0:g0 + g] = window_counts(pos, window, g)
    return counts
