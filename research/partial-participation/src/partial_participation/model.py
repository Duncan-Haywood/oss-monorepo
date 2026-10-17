"""Local SGD in a permissionless network where each of N workers joins a round independently with probability p
(companion to noisy-local-sgd, which had every worker present every round).

One mode, curvature a. A participating worker runs H inner steps of size eta with gradient noise sigma^2 and returns
q^H x + n, q = 1 - eta a, Var n = Vw = eta^2 sigma^2 (1-q^(2H)) / (1-q^2); the outer curvature is s = 1 - q^H.
K ~ Binomial(N, p) workers show up.

Rule A (average the participants; a round with K = 0 is skipped):  x' = x - alpha (x - mean of returns).
    Stationary variance  alpha Vw m / (s (2 - alpha s)),   m = E[1/K | K >= 1].
    Skipped rounds slow convergence but do not change the stationary variance.
Rule B (fixed normaliser: sum of the participants' displacements divided by the expected count N p):
    x' = x - alpha (K/(N p)) s x + alpha (sum of noises)/(N p).
    E (1 - alpha s K/(N p))^2 = 1 - 2 alpha s + alpha^2 s^2 c,  c = 1 + (1-p)/(N p),  so
    Stationary variance  alpha Vw / (N p s (2 - alpha s c)),  stable iff alpha s c < 2.
"""
import math
import random

__all__ = ["curvature", "worker_noise", "inv_mean", "inv_mean_approx", "floor_avg", "floor_fixed", "c_factor",
           "alpha_max_fixed", "contraction_fixed", "contraction_avg", "penalty_avg", "penalty_fixed",
           "fixed_point", "simulate_var", "simulate_bias"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    """Vw: variance of one worker's end-point noise (exact)."""
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def inv_mean(N, p):
    """E[1/K | K >= 1] for K ~ Binomial(N, p), exact sum."""
    if p >= 1:
        return 1.0 / N
    tot, norm = 0.0, 0.0
    for k in range(1, N + 1):
        w = math.comb(N, k) * p ** k * (1 - p) ** (N - k)
        tot += w / k
        norm += w
    return tot / norm


def inv_mean_approx(N, p):
    """Large-Np expansion (1/(Np)) (1 + (1-p)/(Np) + 3(1-p)^2/(Np)^2 ...), first two terms."""
    x = N * p
    return (1 + (1 - p) / x) / x


def c_factor(N, p):
    return 1.0 + (1.0 - p) / (N * p)


def _var_avg(s, Vw, alpha, N, p):
    d = 2 - alpha * s
    return math.inf if d <= 0 else alpha * Vw * inv_mean(N, p) / (s * d)


def _var_fixed(s, Vw, alpha, N, p):
    d = 2 - alpha * s * c_factor(N, p)
    return math.inf if d <= 0 else alpha * Vw / (N * p * s * d)


def floor_avg(a_list, eta, sigma, N, p, H, alpha):
    """Stationary excess loss sum (a/2) Var x under Rule A."""
    return sum(0.5 * a * _var_avg(curvature(eta, a, H), worker_noise(eta, a, sigma, H), alpha, N, p) for a in a_list)


def floor_fixed(a_list, eta, sigma, N, p, H, alpha):
    """Same under Rule B."""
    return sum(0.5 * a * _var_fixed(curvature(eta, a, H), worker_noise(eta, a, sigma, H), alpha, N, p) for a in a_list)


def penalty_avg(N, p, alpha_s=0.0):
    """Floor ratio of Rule A to full participation with the same N and alpha: N E[1/K | K>=1] (>= 1, alpha-free)."""
    return N * inv_mean(N, p)


def penalty_fixed(N, p, alpha_s):
    """Floor ratio of Rule B to full participation at the same alpha s: (2 - alpha s)/(p (2 - alpha s c))."""
    return (2 - alpha_s) / (p * (2 - alpha_s * c_factor(N, p)))


def alpha_max_fixed(s, N, p):
    """Largest stable outer step under Rule B (full participation would allow 2/s)."""
    return 2.0 / (s * c_factor(N, p))


def contraction_fixed(alpha_s, N, p):
    """Per-round mean-square contraction of the mean under Rule B: 1 - 2 alpha s + alpha^2 s^2 c."""
    return 1 - 2 * alpha_s + alpha_s ** 2 * c_factor(N, p)


def contraction_avg(alpha_s, N, p):
    """Per-round mean-square contraction under Rule A: p0 + (1-p0)(1-alpha s)^2 with p0 = P(K=0)."""
    p0 = (1 - p) ** N
    return p0 + (1 - p0) * (1 - alpha_s) ** 2


def fixed_point(c, w, p, ipw=False):
    """Mean fixed point of Rule B on heterogeneous workers with optima c_i, weights w_i = 1-(1-eta a_i)^H,
    participation p_i. Plain: sum p w c / sum p w. Inverse-propensity scaling (each displacement times 1/p_i): sum w c / sum w."""
    u = [1.0 / pi if ipw else 1.0 for pi in p]
    num = sum(pi * ui * wi * ci for pi, ui, wi, ci in zip(p, u, w, c))
    den = sum(pi * ui * wi for pi, ui, wi in zip(p, u, w))
    return num / den


def simulate_var(rule, s, Vw, alpha, N, p, rounds, burn, seed=0):
    """Literal simulation of one mode: draw who participates and each participant's noise; returns E x^2 after burn-in."""
    rng = random.Random(seed)
    sd = math.sqrt(Vw)
    x, acc, cnt = 0.0, 0.0, 0
    for t in range(rounds):
        ends = [(1 - s) * x + rng.gauss(0, sd) for _ in range(N) if rng.random() < p]
        K = len(ends)
        if rule == "A":
            if K:
                x = x - alpha * (x - sum(ends) / K)
        else:
            x = x - alpha * sum(x - e for e in ends) / (N * p)
        if t >= burn:
            acc += x * x
            cnt += 1
    return acc / cnt


def simulate_bias(c, w, p, alpha, rounds, burn, ipw=False, seed=0):
    """Noise-free heterogeneous workers under Rule B: worker i returns x - w_i (x - c_i); time-average of x."""
    rng = random.Random(seed)
    N = len(c)
    x, acc, cnt = 0.0, 0.0, 0
    for t in range(rounds):
        g = 0.0
        for ci, wi, pi in zip(c, w, p):
            if rng.random() < pi:
                g += wi * (x - ci) * (1.0 / pi if ipw else 1.0)
        x -= alpha * g / N
        if t >= burn:
            acc += x
            cnt += 1
    return acc / cnt
