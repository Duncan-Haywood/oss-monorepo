"""DiLoCo-style local SGD where each of N workers compresses its displacement before the outer average
(companion to noisy-local-sgd, which sent displacements exactly).

Mode j has curvature a_j. A worker runs H inner steps of size eta with noise sigma^2 and returns q^H x + n,
q = 1 - eta a; Var n = Vw_j; outer curvature s_j = 1 - q^H. Its displacement is d = s x - n, E[d^2 | x] = s^2 x^2 + Vw.
The server applies x' = x - alpha * mean_i C(d_i) with C unbiased and independent across workers.

Coordinate-wise compression (rand-k with keep-probability rho, scaled by 1/rho): Var C(d)_j = omega d_j^2, omega = (1-rho)/rho.
    v_j = alpha Vw_j (1+omega) / (N s_j ((2 - alpha s_j) - alpha s_j omega / N)),  stable iff alpha s_j (1 + omega/N) < 2.
Norm-scaled compression (QSGD-style; error variance proportional to |d|^2, spread over D modes): Var C(d)_j = kappa |d|^2 / D.
    T = E|d|^2 = sum_j Vw_j (1 + A_j) / (1 - (kappa/D) sum_j A_j),  A_j = alpha s_j / (N (2 - alpha s_j)),
    v_j = alpha^2 (Vw_j + kappa T / D) / (N alpha s_j (2 - alpha s_j)),  stable iff (kappa/D) sum_j A_j < 1 and alpha s_j < 2.
"""
import math
import random

__all__ = ["curvature", "worker_noise", "var_coord", "floor_coord", "alpha_max_coord", "total_disp_norm", "var_norm",
           "floor_norm", "stable_norm", "kappa_rounding", "extra_share_flat", "simulate", "sim_floor"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def var_coord(s, Vw, alpha, N, omega):
    d = (2 - alpha * s) - alpha * s * omega / N
    return math.inf if d <= 0 else alpha * Vw * (1 + omega) / (N * s * d)


def floor_coord(a_list, eta, sigma, N, H, alpha, omega):
    """Stationary excess loss sum (a/2) Var x under coordinate-wise unbiased compression (omega = 0: uncompressed)."""
    return sum(0.5 * a * var_coord(curvature(eta, a, H), worker_noise(eta, a, sigma, H), alpha, N, omega) for a in a_list)


def alpha_max_coord(s, N, omega):
    """Largest stable outer step for a mode of outer curvature s."""
    return 2.0 / (s * (1 + omega / N))


def _A(s_list, alpha, N):
    return [alpha * s / (N * (2 - alpha * s)) for s in s_list]


def stable_norm(s_list, alpha, N, kappa):
    D = len(s_list)
    return all(alpha * s < 2 for s in s_list) and kappa / D * sum(_A(s_list, alpha, N)) < 1


def total_disp_norm(s_list, Vw_list, alpha, N, kappa):
    """T = E |d|^2 at stationarity."""
    if not stable_norm(s_list, alpha, N, kappa):
        return math.inf
    A = _A(s_list, alpha, N)
    return sum(v * (1 + x) for v, x in zip(Vw_list, A)) / (1 - kappa / len(s_list) * sum(A))


def var_norm(s_list, Vw_list, alpha, N, kappa):
    """Per-mode stationary variances under norm-scaled compression."""
    T = total_disp_norm(s_list, Vw_list, alpha, N, kappa)
    if math.isinf(T):
        return [math.inf] * len(s_list)
    D = len(s_list)
    return [alpha * (v + kappa * T / D) / (N * s * (2 - alpha * s)) for s, v in zip(s_list, Vw_list)]


def floor_norm(a_list, eta, sigma, N, H, alpha, kappa):
    s = [curvature(eta, a, H) for a in a_list]
    Vw = [worker_noise(eta, a, sigma, H) for a in a_list]
    return sum(0.5 * a * v for a, v in zip(a_list, var_norm(s, Vw, alpha, N, kappa)))


def kappa_rounding(D, L):
    """Approximate kappa for stochastic rounding to a grid of spacing |d|/L: error variance is f(1-f) spacing^2 with the
    fractional part f roughly uniform, i.e. |d|^2/(6 L^2) per coordinate, so kappa = D / (6 L^2). (An approximation.)"""
    return D / (6.0 * L * L)


def extra_share_flat(s_list, Vw_list, alpha, N, kappa, j):
    """Fraction of mode j's variance that is compression noise injected by the whole displacement norm."""
    v = var_norm(s_list, Vw_list, alpha, N, kappa)[j]
    T = total_disp_norm(s_list, Vw_list, alpha, N, kappa)
    D = len(s_list)
    s = s_list[j]
    return alpha * kappa * T / D / (N * s * (2 - alpha * s)) / v


def _compress(kind, d, param, rng):
    D = len(d)
    if kind == "none":
        return d
    if kind == "randk":                     # param = rho
        return [x / param if rng.random() < param else 0.0 for x in d]
    nrm = math.sqrt(sum(x * x for x in d))
    if kind == "dither":                    # Gaussian error of variance kappa |d|^2 / D per coordinate (idealised)
        sd = math.sqrt(param * nrm * nrm / D)
        return [x + rng.gauss(0, sd) for x in d]
    if kind == "round":                     # param = L levels; stochastic rounding to grid |d|/L (a real quantiser)
        if nrm == 0:
            return d
        h = nrm / param
        out = []
        for x in d:
            f = x / h
            lo = math.floor(f)
            out.append(h * (lo + (1 if rng.random() < f - lo else 0)))
        return out
    raise ValueError(kind)


def simulate(kind, param, s_list, Vw_list, alpha, N, rounds, burn, seed=0):
    """Literal simulation: each of N workers draws noise, forms d = s x - n, compresses it; returns E x_j^2 per mode."""
    rng = random.Random(seed)
    D = len(s_list)
    sd = [math.sqrt(v) for v in Vw_list]
    x = [0.0] * D
    acc, cnt = [0.0] * D, 0
    for t in range(rounds):
        tot = [0.0] * D
        for _ in range(N):
            d = [s_list[j] * x[j] - rng.gauss(0, sd[j]) for j in range(D)]
            c = _compress(kind, d, param, rng)
            for j in range(D):
                tot[j] += c[j]
        x = [x[j] - alpha * tot[j] / N for j in range(D)]
        if t >= burn:
            for j in range(D):
                acc[j] += x[j] * x[j]
            cnt += 1
    return [a / cnt for a in acc]


def sim_floor(kind, param, a_list, eta, sigma, H, alpha, N, rounds, burn, seed=0):
    s = [curvature(eta, a, H) for a in a_list]
    Vw = [worker_noise(eta, a, sigma, H) for a in a_list]
    v = simulate(kind, param, s, Vw, alpha, N, rounds, burn, seed)
    return sum(0.5 * a * x for a, x in zip(a_list, v))
