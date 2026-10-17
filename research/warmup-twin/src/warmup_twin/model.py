"""Initial-transient bias of ONE digital-twin run.  A twin is started from a convenient state (empty queue, sensor at its
nominal value), not from the steady state it is meant to represent.  This module gives the exact bias and variance of the
run mean of an AR(1) started at offset `delta`, the MSE-optimal number of warm-up draws to discard, an M/M/1 empty-start
simulator, the MSER-5 truncation rule (White 1997), and batch-means intervals."""
import math, random

__all__ = ["ar1_bias", "ar1_var", "ar1_mse", "best_warmup", "ar1_from", "mm1_waits", "mm1_wait_mean", "mser",
           "batch_ci", "T975"]

T975 = {29: 2.045}


def ar1_bias(n, phi, delta, d=0):
    """Exact E[mean of draws d..n-1] - mu for an AR(1) whose draw 0 is mu+delta (deterministic start): E x_t - mu = delta phi^t,
    so the bias is delta phi^d (1-phi^m) / (m (1-phi)) with m = n-d kept draws."""
    m = n - d
    if phi == 1.0:
        return delta
    return delta * phi ** d * (1.0 - phi ** m) / (m * (1.0 - phi))


def ar1_var(n, phi, d=0, s2=1.0):
    """Exact Var of the mean of draws d..n-1 from the fixed start (marginal variance s2).  Cov(x_s,x_t) = s2 phi^(t-s)(1-phi^(2s))
    for s<=t, so Var = s2/m^2 [ m + 2 sum_{k<m}(m-k)phi^k - (sum_{t=d}^{n-1} phi^t)^2 ]."""
    m = n - d
    stat = m + 2.0 * sum((m - k) * phi ** k for k in range(1, m))
    tail = sum(phi ** t for t in range(d, n))
    return s2 / (m * m) * (stat - tail * tail)


def ar1_mse(n, phi, delta, d=0, s2=1.0):
    return ar1_bias(n, phi, delta, d) ** 2 + ar1_var(n, phi, d, s2)


def best_warmup(n, phi, delta, s2=1.0, dmax=None):
    """(d, mse) minimising the exact MSE of the truncated run mean over d = 0..dmax."""
    dmax = n // 2 if dmax is None else dmax
    best = min(range(dmax + 1), key=lambda d: ar1_mse(n, phi, delta, d, s2))
    return best, ar1_mse(n, phi, delta, best, s2)


def ar1_from(phi, n, rng, delta, s2=1.0):
    """n draws of an AR(1) (mean 0, marginal variance s2) whose first draw is exactly `delta`."""
    innov = math.sqrt(s2 * (1.0 - phi * phi))
    x, out = delta, []
    for _ in range(n):
        out.append(x)
        x = phi * x + rng.gauss(0.0, innov)
    return out


def mm1_waits(rho, n, rng, start=0.0):
    """Waiting times of n consecutive jobs of an M/M/1 queue (service rate 1), Lindley recursion, first wait = start (0 = empty)."""
    w, out = start, []
    for _ in range(n):
        out.append(w)
        w = max(0.0, w + rng.expovariate(1.0) - rng.expovariate(rho))
    return out


def mm1_wait_mean(rho):
    return rho / (1.0 - rho)


def mser(xs, b=5):
    """MSER-b truncation point (in draws): batch the series into means of size b, pick the number of leading batches d in
    0..k/2 minimising sum_{i>d}(Y_i - Ybar_d)^2 / (k-d)^2 (White 1997)."""
    k = len(xs) // b
    y = [sum(xs[i * b:(i + 1) * b]) / b for i in range(k)]
    s1 = [0.0] * (k + 1)
    s2 = [0.0] * (k + 1)
    for i in range(k - 1, -1, -1):
        s1[i], s2[i] = s1[i + 1] + y[i], s2[i + 1] + y[i] * y[i]
    best, bd = None, 0
    for d in range(k // 2 + 1):
        n = k - d
        s = (s2[d] - s1[d] ** 2 / n) / n ** 2
        if best is None or s < best:
            best, bd = s, d
    return bd * b


def batch_ci(xs, b=30):
    """(mean, half-width) from b contiguous batch means with a Student-t quantile (b=30)."""
    L = len(xs) // b
    bm = [sum(xs[i * L:(i + 1) * L]) / L for i in range(b)]
    m = sum(bm) / b
    sd = math.sqrt(sum((x - m) ** 2 for x in bm) / (b - 1))
    return m, T975[b - 1] * sd / math.sqrt(b)
