"""False-wake rate of a trigger on stationary Gaussian AR(1) frame scores.

Model: a detector emits one score per 10 ms frame, s_t = phi*s_{t-1} + sqrt(1-phi^2)*e_t, e_t ~ N(0,1), so s_t is
N(0,1) with lag-1 correlation phi. On non-speech audio nothing should fire. A *wake* is the first frame of an
exceedance run (s >= theta) that lasts at least m frames in a row, counted when the run reaches m. m=1 is the plain
threshold rule. The rate per frame is computed exactly on a fine grid Markov chain (Gauss-Legendre-free midpoint
grid on [-L, L]) and checked against Monte Carlo.
"""
import math
from functools import lru_cache
import numpy as np

FRAMES_PER_DAY = 8_640_000  # 24 h of 10 ms frames


def _ncdf(x):
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


@lru_cache(maxsize=32)
def grid_chain(phi, n=1200, lim=8.0):
    """Midpoint-grid transition matrix P[i, j] = P(s_t in cell j | s_{t-1} = centre i) and stationary weights pi."""
    edges = np.linspace(-lim, lim, n + 1)
    c = 0.5 * (edges[1:] + edges[:-1])
    sd = math.sqrt(1.0 - phi * phi)
    cdf = np.vectorize(_ncdf, otypes=[float])
    z = (edges[None, :] - phi * c[:, None]) / sd
    P = np.diff(cdf(z), axis=1)
    P /= P.sum(axis=1, keepdims=True)
    pi = np.diff(cdf(edges))
    pi /= pi.sum()
    return c, P, pi


def wake_rate(theta, phi, m=1, n=1200, lim=8.0):
    """Exact (grid) wakes per frame: P(s_{t-m} < theta, s_{t-m+1..t} >= theta)."""
    c, P, pi = grid_chain(phi, n, lim)
    below = c < theta
    above = ~below
    v = pi * below                       # mass at time t-m, below threshold
    for _ in range(m):
        v = (v @ P) * above              # step into the exceedance region
    return float(v.sum())


def independent_rate(theta, m=1):
    """What a designer gets assuming independent frames: P(s>=theta)^m per frame (m=1: the marginal tail)."""
    return (1.0 - _ncdf(theta)) ** m


def threshold_for_rate(rate_fn, target, lo=0.0, hi=7.5):
    """Smallest theta whose per-frame rate is <= target (rate_fn is decreasing in theta); bisection."""
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if rate_fn(mid) > target:
            lo = mid
        else:
            hi = mid
    return hi


def ar1_scores(phi, n, rng):
    e = rng.standard_normal(n)
    s = np.empty(n)
    s[0] = e[0]
    k = math.sqrt(1.0 - phi * phi)
    for i in range(1, n):
        s[i] = phi * s[i - 1] + k * e[i]
    return s


def _ar1_fast(phi, n, rng):
    from_ = rng.standard_normal(n)
    k = math.sqrt(1.0 - phi * phi)
    # blockwise recursion using lfilter-free doubling: y_t = phi*y_{t-1} + k*e_t via cumulative scaling in chunks
    out = np.empty(n)
    chunk = 512
    prev = from_[0]
    out[0] = prev
    pw = phi ** np.arange(chunk, dtype=float)
    pos = 1
    while pos < n:
        m = min(chunk, n - pos)
        w = k * from_[pos:pos + m]
        # y_{pos+j} = phi^(j+1) prev + sum_{i<=j} phi^(j-i) w_i  (computed stably for chunk 512 only if phi^512 not tiny)
        j = np.arange(m)
        conv = np.array([np.dot(w[:jj + 1], pw[jj::-1][:jj + 1]) for jj in range(m)]) if m < 8 else _conv(w, pw[:m])
        out[pos:pos + m] = phi ** (j + 1) * prev + conv
        prev = out[pos + m - 1]
        pos += m
    return out


def _conv(w, pw):
    m = len(w)
    return np.convolve(w, pw)[:m]


def simulate_rate(theta, phi, m, frames, seed):
    """Monte Carlo wakes per frame over `frames` frames of AR(1) scores."""
    rng = np.random.default_rng(seed)
    s = _ar1_fast(phi, frames, rng) >= theta
    if m == 1:
        starts = s[1:] & ~s[:-1]
        return float(starts.sum()) / frames
    # wake at frame t if s[t-m+1..t] all true and s[t-m] false
    run = np.ones(len(s) - m, dtype=bool)
    for k in range(1, m + 1):
        run &= s[k:len(s) - m + k]
    run &= ~s[:len(s) - m]
    return float(run.sum()) / frames
