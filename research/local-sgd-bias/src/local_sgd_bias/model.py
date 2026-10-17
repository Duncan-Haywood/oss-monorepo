"""Periodic averaging (local SGD / DiLoCo-style, plain averaging outer step) on heterogeneous 1-D quadratics.

Worker i holds f_i(x) = a_i (x - c_i)^2 / 2 and runs H_i local gradient steps with step size eta from the shared
point, then the server sets x <- sum_i p_i x_i. With q_i = 1 - eta a_i one round is the affine map
    x_i = q_i^{H_i} x + w_i c_i,   w_i = 1 - q_i^{H_i}
so the deterministic fixed point is the w-weighted (times p) mean of the c_i, in closed form. The global optimum is the
a-weighted mean. Everything below is exact; the Monte Carlo helper only checks the noise formulas.
"""
import random

__all__ = ["weights", "optimum", "fixed_point", "bias", "contraction", "stationary_var", "simulate", "saturation_bias",
           "corrected_p", "round_time", "time_to_eps", "best_H", "inflate_gain", "max_bias_for_H"]


def weights(a, H, eta):
    """w_i = 1 - (1 - eta a_i)^{H_i}: how much of worker i's optimum one round pulls the iterate towards."""
    Hs = H if isinstance(H, (list, tuple)) else [H] * len(a)
    return [1 - (1 - eta * ai) ** h for ai, h in zip(a, Hs)]


def optimum(a, c):
    return sum(ai * ci for ai, ci in zip(a, c)) / sum(a)


def _p(a, p):
    return p if p is not None else [1.0 / len(a)] * len(a)


def fixed_point(a, c, H, eta, p=None):
    """Deterministic fixed point of the averaged round map: sum p_i w_i c_i / sum p_i w_i."""
    p = _p(a, p)
    w = weights(a, H, eta)
    return sum(pi * wi * ci for pi, wi, ci in zip(p, w, c)) / sum(pi * wi for pi, wi in zip(p, w))


def bias(a, c, H, eta, p=None):
    return fixed_point(a, c, H, eta, p) - optimum(a, c)


def contraction(a, H, eta, p=None):
    """Per-round contraction m = sum p_i q_i^{H_i} = 1 - sum p_i w_i."""
    p = _p(a, p)
    return 1 - sum(pi * wi for pi, wi in zip(p, weights(a, H, eta)))


def stationary_var(a, H, eta, sigma, p=None):
    """Stationary variance of the server iterate with per-step gradient noise N(0, sigma^2) at each worker."""
    p = _p(a, p)
    Hs = H if isinstance(H, (list, tuple)) else [H] * len(a)
    V = 0.0
    for pi, ai, h in zip(p, a, Hs):
        q = 1 - eta * ai
        V += pi * pi * eta * eta * sigma * sigma * sum(q ** (2 * j) for j in range(h))
    m = contraction(a, H, eta, p)
    return V / (1 - m * m)


def simulate(a, c, H, eta, sigma, rounds, burn, seed=0, p=None):
    """Monte Carlo of the actual local-step recursion; returns (mean, variance) of the server iterate after burn-in."""
    rng = random.Random(seed)
    p = _p(a, p)
    Hs = H if isinstance(H, (list, tuple)) else [H] * len(a)
    x, xs = 0.0, []
    for r in range(rounds):
        new = 0.0
        for pi, ai, ci, h in zip(p, a, c, Hs):
            y = x
            for _ in range(h):
                y -= eta * (ai * (y - ci) + sigma * rng.gauss(0, 1))
            new += pi * y
        x = new
        if r >= burn:
            xs.append(x)
    mu = sum(xs) / len(xs)
    return mu, sum((v - mu) ** 2 for v in xs) / len(xs)


def saturation_bias(a, c):
    """H -> infinity limit of the bias: the unweighted mean of the c_i minus the a-weighted optimum (equal p)."""
    return sum(c) / len(c) - optimum(a, c)


def corrected_p(a, H, eta):
    """Aggregation weights p_i proportional to a_i / w_i make the fixed point exactly the global optimum."""
    w = weights(a, H, eta)
    raw = [ai / wi for ai, wi in zip(a, w)]
    s = sum(raw)
    return [r / s for r in raw]


def round_time(H, t_step, t_comm):
    return H * t_step + t_comm


def time_to_eps(a, H, eta, t_step, t_comm, eps=1e-3, p=None):
    """Wall-clock time for the deterministic error to contract by eps: rounds = ln(1/eps)/(-ln m)."""
    import math
    m = contraction(a, H, eta, p)
    return math.log(1 / eps) / (-math.log(m)) * round_time(H, t_step, t_comm)


def best_H(a, c, eta, t_step, t_comm, tol, Hmax=2000, eps=1e-3):
    """Fastest H whose fixed-point bias is <= tol in magnitude (deterministic time to contract by eps)."""
    best = None
    for H in range(1, Hmax + 1):
        if abs(bias(a, c, H, eta)) > tol:
            continue
        t = time_to_eps(a, H, eta, t_step, t_comm, eps)
        if best is None or t < best[1]:
            best = (H, t)
    return best


def max_bias_for_H(a, c, eta, Hs):
    return [bias(a, c, H, eta) for H in Hs]


def inflate_gain(a, c, H, eta, i, Hi_claim):
    """Shift of the fixed point towards worker i's optimum when it claims Hi_claim steps (server trusts the claim)."""
    Hs = [H] * len(a)
    base = fixed_point(a, c, Hs, eta)
    Hs[i] = Hi_claim
    return fixed_point(a, c, Hs, eta) - base
