"""Budget split for a digital twin fitted to finite real data.  A shared lab instrument is an M/M/1 queue (service rate 1,
arrival rate rho).  The twin takes lam_hat, mu_hat from n real interarrival and n real service times, then is simulated for m
jobs (started in the fitted steady state, so the run mean is unbiased for the twin's wait).  Relative variance of the twin's
answer about the REAL mean wait W = rho/(1-rho), delta method:  a(rho)/n  (input)  +  b(rho)/m  (simulation)."""
import math, random

__all__ = ["a_coef", "b_coef", "exchange_rate", "var_total", "optimal_split", "min_var", "fit", "sim_mean", "naive_ci",
           "aware_ci", "naive_coverage", "aware_coverage", "Phi", "T9"]

T9 = 2.2621571627409915  # two-sided 95% t quantile, 9 df (10 replications)


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def a_coef(rho):
    """n * Var[ln W_hat] from input error: (1+(2-rho)^2)/(1-rho)^2 (exponential MLEs of both rates, n each)."""
    return (1.0 + (2.0 - rho) ** 2) / (1.0 - rho) ** 2


def b_coef(rho):
    """m * Var[mean wait]/W^2 from simulation noise.  Whitt (1989): the asymptotic variance of the mean queueing delay of M/M/1
    (mu=1) is rho(2+5rho-4rho^2+rho^3)/(1-rho)^4; divide by W^2 = (rho/(1-rho))^2."""
    return (2.0 + 5.0 * rho - 4.0 * rho ** 2 + rho ** 3) / (rho * (1.0 - rho) ** 2)


def exchange_rate(rho):
    """b/a: simulated jobs whose noise equals one real (interarrival, service) pair's; -> 2 as rho -> 1."""
    return b_coef(rho) / a_coef(rho)


def var_total(rho, n, m):
    return a_coef(rho) / n + b_coef(rho) / m


def optimal_split(rho, kappa, B):
    """Minimise a/n + b/m subject to 2n + kappa*m = B (a real pair costs 2 units, a simulated job kappa units).
    Returns (n, m, f) with f the fraction of budget spent on real data: f = sqrt(2a)/(sqrt(2a)+sqrt(kappa b))."""
    a, b = a_coef(rho), b_coef(rho)
    s = math.sqrt(2.0 * a) + math.sqrt(kappa * b)
    f = math.sqrt(2.0 * a) / s
    return f * B / 2.0, (1.0 - f) * B / kappa, f


def min_var(rho, kappa, B):
    return (math.sqrt(2.0 * a_coef(rho)) + math.sqrt(kappa * b_coef(rho))) ** 2 / B


def fit(rng, rho, n):
    """MLE rates from n interarrival (rate rho) and n service (rate 1) times."""
    return n / sum(rng.expovariate(rho) for _ in range(n)), n / sum(rng.expovariate(1.0) for _ in range(n))


def sim_mean(rng, lam, mu, m):
    """Mean queueing delay over m jobs of an M/M/1 twin (lam < mu) via the Lindley recursion, started from the stationary law
    (P[W=0]=1-rho, else Exp(mu-lam))."""
    r = lam / mu
    w = rng.expovariate(mu - lam) if rng.random() < r else 0.0
    tot = w
    ex = rng.expovariate
    for _ in range(m - 1):
        w += ex(mu) - ex(lam)
        if w < 0.0:
            w = 0.0
        tot += w
    return tot / m


def naive_ci(rng, lam, mu, m, k=10):
    """What a simulation-only analyst reports: 95% t interval for the twin's mean wait from k independent stationary
    replications of m/k jobs.  Returns (estimate, half_width)."""
    ms = [sim_mean(rng, lam, mu, m // k) for _ in range(k)]
    est = sum(ms) / k
    s2 = sum((x - est) ** 2 for x in ms) / (k - 1)
    return est, T9 * math.sqrt(s2 / k)


def aware_ci(rng, lam, mu, n, m, k=10):
    """Adds the delta-method input variance est^2 * a(rho_hat)/n to the simulation variance (z = 1.96)."""
    est, hw = naive_ci(rng, lam, mu, m, k)
    se2 = (hw / T9) ** 2 + est ** 2 * a_coef(lam / mu) / n
    return est, 1.959963984540054 * math.sqrt(se2)


def naive_coverage(rho, n, m, z=1.959963984540054):
    """Normal-approximation coverage of the real wait by the simulation-only interval: 2 Phi(z/sqrt(1+r)) - 1, r = V_in/V_sim."""
    r = (a_coef(rho) / n) / (b_coef(rho) / m)
    return 2.0 * Phi(z / math.sqrt(1.0 + r)) - 1.0


def aware_coverage(rho, n, m, z=1.959963984540054):
    """Coverage when the interval half-width uses the full variance: exactly 2Phi(z)-1 in this approximation."""
    return 2.0 * Phi(z) - 1.0
