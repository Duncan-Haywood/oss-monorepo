"""DiLoCo-style local SGD on heterogeneous hardware: worker i runs H_i inner steps (fast devices do more in the same
wall-clock window) and the server takes a weighted average of displacements.

Mode j has curvature a_j. Worker i returns q^{H_i} x + n with q = 1 - eta a, Var n = Vw_ij; outer curvature
s_ij = 1 - q^{H_i}; displacement d_i = s_i x - n_i. Server: x' = x - alpha * sum_i w_i d_i. With r_j = alpha sum_i w_i s_ij:
    Var x_j = alpha^2 sum_i w_i^2 Vw_ij / (r_j (2 - r_j)),   stable iff 0 < r_j < 2.
One mode: the information of one worker is I(H) = s^2/Vw = I_inf tanh(lam H / 2), lam = -ln q, I_inf = (1-q^2)/(eta sigma)^2.
Weights w_i proportional to s_i/Vw_i = 1/(c (1+q^{H_i})) minimise the floor at a given r; the floor is then r/((2-r) sum_i I(H_i)),
and the weights differ by at most 2x between H=1 and H=inf, so equal weights lose at most 9/8 (Kantorovich).
"""
import math
import random

__all__ = ["curvature", "worker_noise", "info", "info_inf", "floor_weighted", "weights_equal", "weights_steps",
           "weights_info", "penalty_single", "floor_single_optimal", "kantorovich_bound", "best_H_per_wallclock",
           "drop_slowest_equal", "simulate", "sim_floor"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def info_inf(eta, a, sigma):
    q = 1.0 - eta * a
    return (1 - q * q) / (eta * sigma) ** 2


def info(eta, a, sigma, H):
    """s^2/Vw for one worker on one mode: I_inf * tanh(lam H / 2)."""
    return curvature(eta, a, H) ** 2 / worker_noise(eta, a, sigma, H)


def weights_equal(Hs):
    return [1.0 / len(Hs)] * len(Hs)


def weights_steps(Hs):
    """FedAvg-style: weight by work done."""
    t = float(sum(Hs))
    return [h / t for h in Hs]


def weights_info(Hs, eta, a_ref, sigma=1.0):
    """Inverse-variance weights w ~ s/Vw for a reference mode, normalised to sum 1."""
    raw = [curvature(eta, a_ref, h) / worker_noise(eta, a_ref, sigma, h) for h in Hs]
    t = sum(raw)
    return [x / t for x in raw]


def floor_weighted(a_list, eta, sigma, Hs, w, alpha=1.0):
    """Stationary excess loss sum (a/2) Var x; inf if unstable."""
    tot = 0.0
    for a in a_list:
        r = alpha * sum(wi * curvature(eta, a, h) for wi, h in zip(w, Hs))
        if not 0 < r < 2:
            return math.inf
        num = alpha * alpha * sum(wi * wi * worker_noise(eta, a, sigma, h) for wi, h in zip(w, Hs))
        tot += 0.5 * a * num / (r * (2 - r))
    return tot


def penalty_single(eta, a, sigma, Hs, w):
    """Floor / best achievable floor at the same contraction r (one mode; independent of r and alpha)."""
    sw = sum(wi * curvature(eta, a, h) for wi, h in zip(w, Hs))
    nv = sum(wi * wi * worker_noise(eta, a, sigma, h) for wi, h in zip(w, Hs))
    return nv * sum(info(eta, a, sigma, h) for h in Hs) / sw ** 2


def floor_single_optimal(eta, a, sigma, Hs, r):
    """Variance r/((2-r) sum I) at contraction r with information weights (excess loss: times a/2)."""
    return r / ((2 - r) * sum(info(eta, a, sigma, h) for h in Hs))


def kantorovich_bound(ratio):
    """Worst-case penalty of equal weights when optimal weights span a factor `ratio`."""
    return (1 + ratio) ** 2 / (4 * ratio)


def best_H_per_wallclock(eta, a, C, tau=1.0, Hmax=2000):
    """H maximising information per unit wall-clock I(H)/(C + tau H) for one worker (sync cost C)."""
    return max(range(1, Hmax + 1), key=lambda h: info(eta, a, 1.0, h) / (C + tau * h))


def drop_slowest_equal(a_list, eta, sigma, Hs, alpha=1.0):
    """Equal-weight floor using all workers versus after dropping the slowest one (alpha fixed)."""
    hs = sorted(Hs)
    full = floor_weighted(a_list, eta, sigma, hs, weights_equal(hs), alpha)
    cut = floor_weighted(a_list, eta, sigma, hs[1:], weights_equal(hs[1:]), alpha)
    return full, cut


def simulate(a_list, eta, sigma, Hs, w, alpha, rounds, burn, seed=0):
    """Literal simulation of the stationary E x_j^2 using exact per-round worker noise (Gaussian)."""
    rng = random.Random(seed)
    s = [[curvature(eta, a, h) for a in a_list] for h in Hs]
    sd = [[math.sqrt(worker_noise(eta, a, sigma, h)) for a in a_list] for h in Hs]
    D = len(a_list)
    x = [0.0] * D
    acc, cnt = [0.0] * D, 0
    for t in range(rounds):
        tot = [0.0] * D
        for i, wi in enumerate(w):
            for j in range(D):
                tot[j] += wi * (s[i][j] * x[j] - rng.gauss(0, sd[i][j]))
        x = [x[j] - alpha * tot[j] for j in range(D)]
        if t >= burn:
            for j in range(D):
                acc[j] += x[j] * x[j]
            cnt += 1
    return [v / cnt for v in acc]


def sim_floor(a_list, eta, sigma, Hs, w, alpha, rounds, burn, seed=0):
    v = simulate(a_list, eta, sigma, Hs, w, alpha, rounds, burn, seed)
    return sum(0.5 * a * x for a, x in zip(a_list, v))
