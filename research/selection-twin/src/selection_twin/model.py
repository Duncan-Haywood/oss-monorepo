"""Selecting the best of K candidate controllers by their simulated cost in a digital twin (lower is better).
Candidate i has true (deployed) cost mu_i ~ N(m, v^2) and twin score s_i = mu_i + e_i, e_i ~ N(0, tau^2) i.i.d.
(finite-rollout Monte Carlo noise, or candidate-specific model-form error).  Choosing argmin s_i is a winner's-curse
selection: the claimed cost of the winner is optimistic.  Closed forms below are exact for this Gaussian model."""
import math, random

__all__ = ["expected_max_normal", "theory", "gauss_select", "lq_cost", "rollout_score", "budget_curve", "best_K",
           "eb_posterior", "screen_verify"]


def expected_max_normal(K, n=4001, lim=9.0):
    """c_K = E[max of K standard normals] = int x K phi(x) Phi(x)^(K-1) dx (trapezoid rule; exact 0 for K=1)."""
    if K == 1:
        return 0.0
    h = 2 * lim / (n - 1)
    tot = 0.0
    for i in range(n):
        x = -lim + i * h
        phi = math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)
        Phi = 0.5 * (1 + math.erf(x / math.sqrt(2)))
        w = 0.5 if i in (0, n - 1) else 1.0
        tot += w * x * K * phi * Phi ** (K - 1)
    return tot * h


def theory(K, m, v, tau):
    """Exact Gaussian selection laws for choosing argmin of noisy scores.
    claimed  = m - sqrt(v^2+tau^2) c_K          (mean twin score of the winner)
    real     = m - v^2 c_K / sqrt(v^2+tau^2)    (mean deployed cost of the winner)
    optimism = real - claimed = tau^2 c_K / sqrt(v^2+tau^2)
    regret   = real - (m - v c_K) = v c_K (1 - v/sqrt(v^2+tau^2))   (vs the oracle best of the K)"""
    c = expected_max_normal(K)
    r = math.sqrt(v * v + tau * tau)
    claimed = m - r * c
    real = m - v * v * c / r
    return {"claimed": claimed, "real": real, "optimism": real - claimed,
            "oracle": m - v * c, "regret": real - (m - v * c), "c_K": c, "rho": v * v / (r * r)}


def gauss_select(K, m, v, tau, rng):
    """One selection round in the Gaussian model: returns (claimed, real, oracle) for the argmin winner."""
    mu = [rng.gauss(m, v) for _ in range(K)]
    s = [x + rng.gauss(0, tau) for x in mu]
    i = min(range(K), key=s.__getitem__)
    return s[i], mu[i], min(mu)


def lq_cost(a, b, k, s, r):
    """Exact average stage cost E[x^2 + r u^2] of x' = a x + b u + w, u = -k x, w ~ N(0, s^2) (inf if unstable)."""
    c = a - b * k
    if abs(c) >= 1:
        return float("inf")
    return (1 + r * k * k) * s * s / (1 - c * c)


def rollout_score(a, b, k, s, r, H, N, rng):
    """Twin score of gain k (the twin is the exact plant; the only error is Monte Carlo): mean over N rollouts of
    the average stage cost over H steps started from the stationary law.  Returns (score, variance of the score)."""
    c = a - b * k
    sd0 = s / math.sqrt(1 - c * c)
    means = []
    for _ in range(N):
        x = rng.gauss(0, sd0)
        acc = 0.0
        for _ in range(H):
            acc += x * x + r * (k * x) ** 2
            x = c * x + s * rng.gauss(0, 1)
        means.append(acc / H)
    mean = sum(means) / N
    var = sum((q - mean) ** 2 for q in means) / (N - 1) / N
    return mean, var


def budget_curve(Ks, m, v, sigma2, B):
    """Fixed simulation budget B split evenly over K candidates: tau^2 = sigma2 K / B.  Returns {K: real cost}."""
    return {K: theory(K, m, v, math.sqrt(sigma2 * K / B))["real"] for K in Ks}


def best_K(m, v, sigma2, B, Ks):
    """Candidate count in Ks minimising the exact real cost of the selected winner under a fixed budget B."""
    curve = budget_curve(Ks, m, v, sigma2, B)
    K = min(curve, key=curve.get)
    return K, curve[K]


def eb_posterior(scores, tau2s):
    """Empirical-Bayes posterior means for candidates with known (or plug-in) noise variances tau2s[i]:
    m_hat = mean score, v2_hat = max(var(scores) - mean(tau2), 1e-12), rho_i = v2/(v2+tau2_i),
    posterior mean_i = m_hat + rho_i (s_i - m_hat)."""
    K = len(scores)
    m_hat = sum(scores) / K
    var = sum((q - m_hat) ** 2 for q in scores) / (K - 1)
    v2 = max(var - sum(tau2s) / K, 1e-12)
    return [m_hat + v2 / (v2 + t2) * (q - m_hat) for q, t2 in zip(scores, tau2s)], m_hat, v2


def screen_verify(K, m, v, tau, top, tau2, rng):
    """Two-stage selection in the Gaussian model: screen by a stage-1 score (noise tau), keep the `top` best, then
    re-score those with an independent stage-2 score (noise tau2) and pick the best of them.
    Returns (claimed by stage-2 score, real, oracle)."""
    mu = [rng.gauss(m, v) for _ in range(K)]
    s1 = [x + rng.gauss(0, tau) for x in mu]
    keep = sorted(range(K), key=s1.__getitem__)[:top]
    s2 = {i: mu[i] + rng.gauss(0, tau2) for i in keep}
    i = min(keep, key=s2.__getitem__)
    return s2[i], mu[i], min(mu)
