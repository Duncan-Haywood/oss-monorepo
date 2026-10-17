"""Backup workers (wait for the fastest k of n) in synchronous decentralised training.

Round time.  Worker i finishes at X_i = s + Exp(mu_i) (independent).  The round ends at the k-th order statistic X_(k).
  * Renyi representation: X_(k) = s + sum_{j=1..k} Z_j/(mu (n-j+1)) with Z_j iid Exp(1) (homogeneous rates), hence
        E X_(k) = s + (H_n - H_{n-k})/mu,   Var X_(k) = sum_{j=1..k} 1/(mu (n-j+1))^2.
  * Pareto(alpha, x_m) workers are x_m*exp(E/alpha); the same representation and the exponential MGF give the exact
        E X_(k) = x_m * prod_{j=1..k} (n-j+1)/(n-j+1-1/alpha),   finite iff n-k+1 > 1/alpha.
Time to accuracy.  Quadratic f = a x^2/2, step eta, aggregate of k worker gradients with per-worker noise variance
sigma2: E x_t^2 = rho^{2t} x0^2 + (phi/k)(1-rho^{2t}), rho = 1-eta*a, phi = eta^2 sigma2/(1-rho^2).  Reaching
E x_t^2 <= eps needs phi/k < eps (a minimum k) and t_k = ceil(ln((eps-phi/k)/(x0^2-phi/k))/(2 ln rho)) rounds; expected
wall clock is t_k * E X_(k) (rounds are iid).
Selection bias.  With unequal rates the fastest-k set S includes worker i with probability pi_i (sum pi_i = k); the plain
average of the selected local optima estimates sum_i pi_i theta_i / k, not the mean.  Horvitz-Thompson weights 1/(n pi_i)
remove the bias at a variance cost.
"""
import math, random

__all__ = ["harmonic", "exp_order_mean", "exp_order_var", "pareto_order_mean", "pareto_order_mean_numeric",
           "exp_order_mean_numeric", "sgd_rounds", "sgd_mse", "expected_time", "best_k", "min_k", "inclusion_probs",
           "sample_fastest", "simulate_round", "estimators"]


def harmonic(n):
    return sum(1.0 / j for j in range(1, n + 1))


def exp_order_mean(n, k, s=0.0, mu=1.0):
    return s + (harmonic(n) - harmonic(n - k)) / mu


def exp_order_var(n, k, mu=1.0):
    return sum(1.0 / (mu * (n - j + 1)) ** 2 for j in range(1, k + 1))


def pareto_order_mean(n, k, xm=1.0, alpha=2.0):
    """Exact E[k-th smallest of n iid Pareto(alpha, xm)]; inf when the mean does not exist."""
    r = 1.0 / alpha
    out = xm
    for j in range(1, k + 1):
        d = n - j + 1 - r
        if d <= 0:
            return math.inf
        out *= (n - j + 1) / d
    return out


def _binom_cdf(n, p, k):
    """P(Bin(n,p) <= k)."""
    if p <= 0:
        return 1.0
    if p >= 1:
        return 1.0 if k >= n else 0.0
    q, pmf, tot = 1 - p, (1 - p) ** n, 0.0
    for i in range(k + 1):
        tot += pmf
        pmf *= (n - i) / (i + 1) * p / q
    return tot


def exp_order_mean_numeric(n, k, s=0.0, mu=1.0, steps=200000, tmax=None):
    """Independent route: E X_(k) = s + int P(Bin(n,F(t)) <= k-1) dt with F the Exp(mu) cdf (midpoint rule)."""
    tmax = tmax or 40.0 / mu
    h, tot = tmax / steps, 0.0
    for i in range(steps):
        t = (i + 0.5) * h
        tot += _binom_cdf(n, 1 - math.exp(-mu * t), k - 1)
    return s + tot * h


def pareto_order_mean_numeric(n, k, xm=1.0, alpha=2.0, steps=400000):
    """Independent route: xm + int_xm^inf P(Bin(n, 1-(xm/x)^alpha) <= k-1) dx, substituting x = xm/u^(1/alpha)."""
    h, tot = 1.0 / steps, 0.0
    for i in range(steps):
        u = (i + 0.5) * h                       # u = (xm/x)^alpha = survival probability
        x = xm * u ** (-1.0 / alpha)
        dx = xm * (1.0 / alpha) * u ** (-1.0 / alpha - 1.0)
        tot += _binom_cdf(n, 1 - u, k - 1) * dx
    return xm + tot * h


def min_k(a, eta, sigma2, eps):
    """Smallest k with stationary floor phi/k < eps (real-valued threshold)."""
    rho = 1 - eta * a
    return eta ** 2 * sigma2 / (1 - rho ** 2) / eps


def sgd_mse(t, k, a, eta, sigma2, x0sq):
    rho = 1 - eta * a
    phi = eta ** 2 * sigma2 / (1 - rho ** 2)
    return rho ** (2 * t) * x0sq + phi / k * (1 - rho ** (2 * t))


def sgd_rounds(k, a, eta, sigma2, x0sq, eps):
    """Rounds to E x_t^2 <= eps; inf if the noise floor is above eps."""
    rho = 1 - eta * a
    floor = eta ** 2 * sigma2 / (1 - rho ** 2) / k
    if floor >= eps:
        return math.inf
    if x0sq <= eps:
        return 0
    return max(0, math.ceil(math.log((eps - floor) / (x0sq - floor)) / (2 * math.log(rho)) - 1e-12))


def expected_time(n, k, s, mu, a, eta, sigma2, x0sq, eps):
    return sgd_rounds(k, a, eta, sigma2, x0sq, eps) * exp_order_mean(n, k, s, mu)


def best_k(n, s, mu, a, eta, sigma2, x0sq, eps):
    """(k*, time) minimising expected time to accuracy over k in 1..n; (None, inf) if no k reaches eps."""
    best = (None, math.inf)
    for k in range(1, n + 1):
        t = expected_time(n, k, s, mu, a, eta, sigma2, x0sq, eps)
        if t < best[1]:
            best = (k, t)
    return best


def inclusion_probs(mus, k, steps=4000):
    """pi_i = P(worker i is among the k fastest), independent Exp(mu_j) finishing times (shift cancels).
    pi_i = int_0^1 P(#{j != i faster than i} <= k-1 | u) du with u = exp(-mu_i t), P(j faster) = 1-u^(mu_j/mu_i)."""
    n, out = len(mus), []
    for i in range(n):
        rs = [mus[j] / mus[i] for j in range(n) if j != i]
        tot = 0.0
        for q in range(steps):
            u = (q + 0.5) / steps
            dist = [1.0]                          # Poisson-binomial pmf truncated at k-1
            for r in rs:
                p = 1 - u ** r
                new = [0.0] * min(len(dist) + 1, k)
                for c, pc in enumerate(dist):
                    if c < len(new):
                        new[c] += pc * (1 - p)
                    if c + 1 < len(new):
                        new[c + 1] += pc * p
                dist = new
            tot += sum(dist)
        out.append(tot / steps)
    return out


def sample_fastest(mus, k, rng, s=0.0):
    """One round: the set of the k fastest workers and the round time."""
    x = [s + rng.expovariate(m) for m in mus]
    order = sorted(range(len(mus)), key=x.__getitem__)
    return order[:k], x[order[k - 1]]


def simulate_round(n, k, s, mu, rng, rounds=1):
    return [sample_fastest([mu] * n, k, rng, s)[1] for _ in range(rounds)]


def estimators(theta, pis, S, noise):
    """Plain mean, Horvitz-Thompson and Hajek estimates of mean(theta) from the selected set S; noise[i] is the
    additive gradient noise of worker i."""
    n, k = len(theta), len(S)
    g = {i: theta[i] + noise[i] for i in S}
    plain = sum(g.values()) / k
    ht = sum(g[i] / pis[i] for i in S) / n
    w = sum(1.0 / pis[i] for i in S)
    hajek = sum(g[i] / pis[i] for i in S) / w
    return plain, ht, hajek
