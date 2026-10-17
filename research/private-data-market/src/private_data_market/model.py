"""A market for private data (Waggoner-Frongillo-Abernethy style) with Gaussian-mechanism privacy.
Market belief about a parameter theta is N(m, 1/a) (a = precision). Agent i holds a statistic with noise variance sig2_i
(= s^2/n_i for n_i samples), releases it plus Gaussian noise of variance u (the Gaussian mechanism), and the market does
the exact Bayes update a <- a + 1/(sig2 + u). The agent is paid lam * (ln p_new(theta) - ln p_old(theta)) once theta is
revealed. Payments telescope: the sum of all payments is lam * (final log score - initial log score).
Ex ante the expected payment is lam * I(theta; report) = (lam/2) ln(1 + tau_r/a), tau_r = 1/(sig2+u).
Privacy costs c per unit of zCDP rho = Delta^2/(2u): cost = kappa*lam/(2u) with kappa = c*Delta^2/lam.
Best noise solves (1-kappa a) w^2 - (2 sig2 + kappa) w + sig2^2 = 0 with w = sig2 + u; the market is dead (nobody
participates) exactly when kappa*a >= 1, so the market's precision is capped at 1/kappa."""
import math
import random

__all__ = ["info", "payoff", "best_noise", "alive", "cap", "best_noise_grid", "run_market", "simulate_payments",
           "simulate_telescoping", "approach_ratio", "agents_to_fraction", "welfare", "market_welfare", "planner_symmetric"]


def info(a, tau_r):
    """Expected log-score gain (nats) of releasing precision tau_r to a market with precision a."""
    return 0.5 * math.log1p(tau_r / a)


def payoff(u, a, sig2, kappa):
    """Agent's expected payoff / lam with noise variance u > 0."""
    return info(a, 1.0 / (sig2 + u)) - kappa / (2.0 * u)


def alive(a, kappa):
    return kappa * a < 1.0


def cap(kappa):
    """Precision beyond which no agent with this privacy cost participates."""
    return 1.0 / kappa


def best_noise(a, sig2, kappa):
    """Payoff-maximising noise variance, or None if the agent stays out (kappa*a >= 1)."""
    if not alive(a, kappa):
        return None
    q = 1.0 - kappa * a
    b = 2.0 * sig2 + kappa
    w = (b + math.sqrt(b * b - 4.0 * q * sig2 * sig2)) / (2.0 * q)
    return w - sig2


def best_noise_grid(a, sig2, kappa, lo=1e-6, hi=1e6, n=4000):
    """Log-grid search for the best noise (value and argmax); used to check the closed form."""
    best = (-1e300, None)
    for i in range(n + 1):
        u = lo * (hi / lo) ** (i / n)
        v = payoff(u, a, sig2, kappa)
        if v > best[0]:
            best = (v, u)
    return best


def run_market(agents, a0, order=None, rounds=1):
    """agents: list of (sig2, kappa). Agents arrive in `order` (default list order); each participates iff alive.
    Returns final precision, per-agent (noise, released precision, expected payment/lam) and participant count."""
    a = a0
    log = []
    idx = list(range(len(agents))) if order is None else list(order)
    for _ in range(rounds):
        for i in idx:
            sig2, kappa = agents[i]
            u = best_noise(a, sig2, kappa)
            if u is None:
                log.append((i, None, 0.0, 0.0))
                continue
            tau = 1.0 / (sig2 + u)
            log.append((i, u, tau, info(a, tau)))
            a += tau
    part = sum(1 for r in log if r[1] is not None)
    return {"a": a, "log": log, "participants": part, "total_pay": sum(r[3] for r in log)}


def approach_ratio(sig2, kappa):
    """Asymptotic geometric ratio of the gap 1 - kappa*a to the cap: 2 sig2 / (2 sig2 + kappa)."""
    return 2.0 * sig2 / (2.0 * sig2 + kappa)


def agents_to_fraction(sig2, kappa, a0, frac, limit=100000):
    """Homogeneous agents in sequence: number needed to reach frac of the cap 1/kappa."""
    a = a0
    for t in range(1, limit + 1):
        a += 1.0 / (sig2 + best_noise(a, sig2, kappa))
        if a >= frac / kappa:
            return t
    return None


def simulate_payments(a0, sig2, u, runs, rng, m0=0.0):
    """Monte Carlo of realised score gains for one agent; theta ~ N(m0, 1/a0), data statistic ~ N(theta, sig2),
    released y = statistic + N(0, u). Returns (mean gain, standard error)."""
    tau = 1.0 / (sig2 + u)
    a1 = a0 + tau
    s = s2 = 0.0
    for _ in range(runs):
        th = rng.gauss(m0, a0 ** -0.5)
        y = rng.gauss(th, sig2 ** 0.5) + rng.gauss(0, u ** 0.5)
        m1 = m0 + tau / a1 * (y - m0)
        g = 0.5 * math.log(a1 / a0) - a1 * (th - m1) ** 2 / 2 + a0 * (th - m0) ** 2 / 2
        s += g
        s2 += g * g
    mean = s / runs
    return mean, math.sqrt((s2 / runs - mean * mean) / runs)


def simulate_telescoping(a0, taus, runs, rng, m0=0.0):
    """Sequential Gaussian releases (precisions taus); checks sum of per-agent gains equals the final minus initial
    log score, pathwise. Returns (max pathwise discrepancy, mean total, exact 0.5*ln(a_final/a0))."""
    worst = tot = 0.0
    for _ in range(runs):
        th = rng.gauss(m0, a0 ** -0.5)
        a, m, gains = a0, m0, 0.0
        for t in taus:
            y = rng.gauss(th, t ** -0.5)
            a1 = a + t
            m1 = m + t / a1 * (y - m)
            gains += 0.5 * math.log(a1 / a) - a1 * (th - m1) ** 2 / 2 + a * (th - m) ** 2 / 2
            a, m = a1, m1
        direct = 0.5 * math.log(a / a0) - a * (th - m) ** 2 / 2 + a0 * (th - m0) ** 2 / 2
        worst = max(worst, abs(gains - direct))
        tot += gains
    return worst, tot / runs, 0.5 * math.log((a0 + sum(taus)) / a0)


def welfare(noises, a0, sig2, kappa):
    """Planner objective / lam: information bought minus privacy cost, for a list of noise variances."""
    a = a0 + sum(1.0 / (sig2 + u) for u in noises)
    return 0.5 * math.log(a / a0) - sum(kappa / (2.0 * u) for u in noises)


def market_welfare(n, a0, sig2, kappa):
    """Welfare of the sequential equilibrium with n identical agents (non-participants add nothing)."""
    r = run_market([(sig2, kappa)] * n, a0)
    us = [x[1] for x in r["log"] if x[1] is not None]
    return welfare(us, a0, sig2, kappa), us


def planner_symmetric(n, a0, sig2, kappa, lo=1e-3, steps=1500, ratio=1.01):
    """Best common noise for n agents by log-grid search: (welfare, noise)."""
    best = (-1e300, None)
    for i in range(steps):
        u = lo * ratio ** i
        w = welfare([u] * n, a0, sig2, kappa)
        if w > best[0]:
            best = (w, u)
    return best
