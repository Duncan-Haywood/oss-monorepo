"""Mixing twin and real samples to estimate a real-world parameter theta.

n real samples y ~ N(theta, sigma^2); m twin samples z ~ N(theta + delta, tau^2).
With a = sigma^2/n, b = tau^2/m, ybar and zbar are independent normals and
  theta_hat(w) = (1-w) ybar + w zbar,   MSE(w) = a (1-w)^2 + (b + delta^2) w^2 ... (+ cross terms vanish)
so MSE(w) = (1-w)^2 a + w^2 (b + delta^2), w* = a/(a+b+delta^2), MSE* = a(b+delta^2)/(a+b+delta^2).
Estimators that use D = zbar - ybar ~ N(delta, a+b) to set w are integrated on a fine grid.
"""
import math, random

__all__ = ["mse_w", "w_star", "mse_star", "equiv_real", "twin_cap", "naive_weight", "mse_naive",
           "pool_helps", "sample_weight_ratio", "w_plugin", "w_debiased", "w_pretest",
           "mse_adaptive", "mse_adaptive_sim"]


def mse_w(w, a, b, delta):
    return (1 - w) ** 2 * a + w * w * (b + delta * delta)


def w_star(a, b, delta):
    return a / (a + b + delta * delta)


def mse_star(a, b, delta):
    return a * (b + delta * delta) / (a + b + delta * delta)


def equiv_real(n, sigma2, b, delta):
    """Real-sample count with the same MSE as n real + twin at the optimal weight."""
    return n + sigma2 / (b + delta * delta)


def twin_cap(sigma2, delta):
    """Most real samples a twin can ever be worth (m -> infinity): sigma^2/delta^2."""
    return math.inf if delta == 0 else sigma2 / (delta * delta)


def naive_weight(n, m):
    return m / (n + m)


def mse_naive(n, m, sigma2, tau2, delta):
    """Concatenate all samples with equal weight."""
    return (m * m * delta * delta + n * sigma2 + m * tau2) / (n + m) ** 2


def pool_helps(a, b, delta):
    """Equal-weight pooling with tau=sigma beats real-only iff delta^2 < a + b (exact for tau=sigma)."""
    return delta * delta < a + b


def sample_weight_ratio(sigma2, tau2, m, delta):
    """Optimal per-sample loss weight of a twin sample relative to a real one."""
    return sigma2 / (tau2 + m * delta * delta)


# adaptive weights as functions of D = zbar - ybar
def w_plugin(a, b):
    return lambda D: a / (a + b + D * D)


def w_debiased(a, b):
    s2 = a + b
    return lambda D: a / (a + b + max(0.0, D * D - s2))


def w_pretest(a, b, z=1.96):
    s2 = a + b
    return lambda D: a / s2 if D * D < z * z * s2 else 0.0


def _grid(h=0.1, L=7.0):
    n = int(L / h)
    zs = [i * h for i in range(-n, n + 1)]
    ws = [math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi) * h for z in zs]
    return zs, ws


def mse_adaptive(wfun, a, b, delta, h=0.1):
    """Exact MSE (grid quadrature over the two Gaussian errors) of ybar + w(D)(zbar - ybar)."""
    zs, ws = _grid(h)
    sa, sb = math.sqrt(a), math.sqrt(b)
    tot = 0.0
    for zu, wu in zip(zs, ws):
        u = sa * zu
        for zv, wv in zip(zs, ws):
            v = sb * zv
            D = delta + v - u
            e = u + wfun(D) * D
            tot += wu * wv * e * e
    return tot


def mse_adaptive_sim(wfun, a, b, delta, runs, seed=0):
    rng = random.Random(seed)
    sa, sb = math.sqrt(a), math.sqrt(b)
    tot = 0.0
    for _ in range(runs):
        u = sa * rng.gauss(0, 1); v = sb * rng.gauss(0, 1)
        D = delta + v - u
        e = u + wfun(D) * D
        tot += e * e
    return tot / runs
