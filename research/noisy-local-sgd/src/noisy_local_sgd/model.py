"""Noise floor of DiLoCo-style local SGD on a quadratic (companion to outer-momentum, which was noise-free).
Loss (1/2) sum_i a_i x_i^2. M workers each run H inner SGD steps of size eta from the global point with gradient noise
of variance sigma^2 per step and mode; the pseudo-gradient is the start minus the average of the M end points.
With q = 1 - eta a, one mode of one worker ends at  q^H x + n,  Var n = eta^2 sigma^2 (1-q^(2H)) / (1-q^2), so
    x_avg = q^H x + xi,   Var xi = V = eta^2 sigma^2 (1-q^(2H)) / ((1-q^2) M),     s = 1 - q^H  (outer curvature).
The outer optimiser (heavy ball, v <- beta v + g, x <- x - alpha v; beta = 0 is plain) gives the AR(2) recursion
    x' = (1+beta-alpha s) x - beta x_prev + alpha xi,
whose stationary variance is exact:
    Var x = alpha V (1+beta) / ((1-beta) s (2(1+beta) - alpha s)).
"""
import math
import random

__all__ = ["step_noise", "curvature", "outer_var", "floor", "floor_sgd", "alpha_for_floor", "mean_sq", "rounds_to",
           "wallclock", "best_H", "simulate"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def step_noise(eta, a, sigma, M, H):
    """V: variance of the averaged inner-loop noise for one mode (exact)."""
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / ((1 - q * q) * M)


def outer_var(s, V, alpha, beta=0.0):
    """Exact stationary variance of one mode under the heavy-ball outer optimiser (needs alpha s < 2(1+beta))."""
    d = 2 * (1 + beta) - alpha * s
    if d <= 0:
        return math.inf
    return alpha * V * (1 + beta) / ((1 - beta) * s * d)


def floor(a_list, eta, sigma, M, H, alpha, beta=0.0):
    """Stationary excess loss sum_i (a_i/2) Var x_i."""
    return sum(0.5 * a * outer_var(curvature(eta, a, H), step_noise(eta, a, sigma, M, H), alpha, beta) for a in a_list)


def floor_sgd(a_list, eta, sigma, M, alpha_eff):
    """Reference: plain minibatch SGD (H = 1) with step alpha_eff*eta on the M-averaged gradient; equals the local-SGD
    floor at alpha = 1 for every H."""
    return floor(a_list, eta, sigma, M, 1, alpha_eff)


def alpha_for_floor(a_list, eta, sigma, M, H, eps, beta_eff=0.0, tol=1e-12):
    """Largest outer step whose stationary loss is <= eps (bisection; floor increases in alpha)."""
    lo, hi = 0.0, 2.0 * (1 + beta_eff) / curvature(eta, max(a_list), H)
    if floor(a_list, eta, sigma, M, H, hi * (1 - 1e-9), beta_eff) <= eps:
        return hi * (1 - 1e-9)
    while hi - lo > tol * hi:
        mid = (lo + hi) / 2
        if floor(a_list, eta, sigma, M, H, mid, beta_eff) <= eps:
            lo = mid
        else:
            hi = mid
    return lo


def mean_sq(s, V, alpha, t, x0=1.0):
    """E x_t^2 for plain outer step (beta = 0), exact: (1-alpha s)^(2t) x0^2 + Var (1 - (1-alpha s)^(2t))."""
    r2 = (1 - alpha * s) ** 2
    return r2 ** t * x0 * x0 + outer_var(s, V, alpha) * (1 - r2 ** t)


def rounds_to(a_list, eta, sigma, M, H, alpha, target, x0=1.0, tmax=10 ** 7):
    """Smallest number of rounds with E[loss] <= target (plain outer step); inf if the floor exceeds target."""
    parts = [(0.5 * a, curvature(eta, a, H), step_noise(eta, a, sigma, M, H)) for a in a_list]

    def loss(t):
        return sum(w * mean_sq(s, V, alpha, t, x0) for w, s, V in parts)
    if floor(a_list, eta, sigma, M, H, alpha) >= target:
        return math.inf
    lo, hi = 0, 1
    while loss(hi) > target:
        lo, hi = hi, hi * 2
        if hi > tmax:
            return math.inf
    while hi - lo > 1:
        mid = (lo + hi) // 2
        lo, hi = (mid, hi) if loss(mid) > target else (lo, mid)
    return hi


def wallclock(a_list, eta, sigma, M, H, C, eps, x0=1.0):
    """Time (inner-step units, each round costing H + C) to reach expected loss <= 2 eps using the largest outer step
    whose floor is eps."""
    alpha = alpha_for_floor(a_list, eta, sigma, M, H, eps)
    r = rounds_to(a_list, eta, sigma, M, H, alpha, 2 * eps, x0)
    return r * (H + C), alpha, r


def best_H(a_list, eta, sigma, M, C, eps, Hs):
    """Best sync interval over the candidates Hs at a fixed floor eps: returns (H, time, alpha)."""
    res = [(H,) + wallclock(a_list, eta, sigma, M, H, C, eps)[:2] for H in Hs]
    return min(res, key=lambda r: r[1])


def simulate(a_list, eta, sigma, M, H, alpha, beta, n_rounds, burn, seed=0):
    """Literal noisy local SGD (M workers x H noisy steps per round, outer heavy ball); time-averaged loss after burn-in."""
    rng = random.Random(seed)
    n = len(a_list)
    x = [0.0] * n
    v = [0.0] * n
    acc, cnt = 0.0, 0
    for t in range(n_rounds):
        for i, a in enumerate(a_list):
            tot = 0.0
            for _ in range(M):
                y = x[i]
                for _ in range(H):
                    y -= eta * (a * y + sigma * rng.gauss(0, 1))
                tot += y
            g = x[i] - tot / M
            v[i] = beta * v[i] + g
            x[i] -= alpha * v[i]
        if t >= burn:
            acc += sum(0.5 * a * xi * xi for a, xi in zip(a_list, x))
            cnt += 1
    return acc / cnt
