"""A shared instrument (plate reader, charging dock, balance) serves robot jobs: Poisson arrivals at rate lam, one server,
FIFO.  The twin assumes exponential service; the 'real' service time has the same mean m but squared coefficient of
variation c2 (lognormal) or a Pareto tail.  Times are in units of the mean service time m=1 unless stated."""
import math, random

__all__ = ["pk_wait", "wait_exp", "admissible_rho", "twin_wait_ratio", "lognormal_params", "sample_lognormal",
           "sample_pareto", "sample_exp", "lindley", "exp_tail", "fit_c2", "rho_from_c2", "mean_wait_at",
           "pareto_moments"]


def pk_wait(rho, c2):
    """Pollaczek-Khinchine mean wait in queue, in units of the mean service time: rho (1 + c2) / (2 (1 - rho))."""
    if c2 == math.inf:
        return math.inf
    return rho * (1.0 + c2) / (2.0 * (1.0 - rho))


def wait_exp(rho):
    return pk_wait(rho, 1.0)


def admissible_rho(w, c2):
    """Largest utilisation with mean wait <= w service times: rho = 2w / (1 + c2 + 2w)."""
    return 2.0 * w / (1.0 + c2 + 2.0 * w)


def twin_wait_ratio(c2):
    """Real / twin mean wait at the SAME utilisation: (1 + c2) / 2."""
    return (1.0 + c2) / 2.0


def lognormal_params(c2):
    s2 = math.log1p(c2)
    return -0.5 * s2, math.sqrt(s2)  # mean exactly 1


def sample_lognormal(rng, c2):
    mu, s = lognormal_params(c2)
    return math.exp(rng.gauss(mu, s))


def sample_exp(rng):
    return rng.expovariate(1.0)


def pareto_moments(alpha):
    """Pareto with tail index alpha > 1 scaled to mean 1: x_min = (alpha-1)/alpha; c2 = 1/(alpha(alpha-2)) if alpha>2 else inf."""
    return (alpha - 1.0) / alpha, (1.0 / (alpha * (alpha - 2.0)) if alpha > 2 else math.inf)


def sample_pareto(rng, alpha):
    xm, _ = pareto_moments(alpha)
    return xm * (1.0 - rng.random()) ** (-1.0 / alpha)


def lindley(rho, sampler, n, rng, burn=0):
    """Waiting times of n jobs by the Lindley recursion W' = max(0, W + S - A); arrivals Exp(rate rho)."""
    w, out = 0.0, []
    for i in range(n + burn):
        if i >= burn:
            out.append(w)
        w = max(0.0, w + sampler(rng) - rng.expovariate(rho))
    return out


def exp_tail(rho, t):
    """M/M/1 P(W > t) = rho exp(-(1 - rho) t)."""
    return rho * math.exp(-(1.0 - rho) * t)


def fit_c2(samples):
    m = sum(samples) / len(samples)
    v = sum((x - m) ** 2 for x in samples) / (len(samples) - 1)
    return v / (m * m)


def rho_from_c2(w, c2_hat):
    return admissible_rho(w, c2_hat)


def mean_wait_at(rho, c2_true):
    return pk_wait(rho, c2_true)
