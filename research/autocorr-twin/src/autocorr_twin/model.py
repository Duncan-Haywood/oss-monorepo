"""Output analysis for ONE long run of a digital twin.  Twin output (a stage's state, a queue's wait) is autocorrelated, but
a run is often summarised as mean +- z*s/sqrt(n) as if the n samples were independent.  This module gives the exact
variance of the run mean for AR(1) output, the M/M/1 waiting-time asymptotic variance, and batch-means intervals."""
import math, random

__all__ = ["ar1_mean_var", "ar1_inflation", "ar1_inflation_limit", "ess", "normal_cdf", "naive_coverage",
           "run_length", "ar1_path", "mm1_waits", "mm1_wait_mean", "mm1_wait_var", "mm1_asym_var", "mm1_inflation",
           "naive_ci", "batch_ci", "T975"]

# two-sided 95% Student-t quantiles by degrees of freedom (b batches -> df b-1)
T975 = {4: 2.776, 9: 2.262, 19: 2.093, 29: 2.045, 49: 2.010, 99: 1.984}


def ar1_mean_var(n, phi, s2=1.0):
    """Exact Var of the sample mean of n consecutive draws of a stationary AR(1) with marginal variance s2:
    (s2/n^2) [n + 2 sum_{k=1}^{n-1} (n-k) phi^k]."""
    return s2 / (n * n) * (n + 2.0 * sum((n - k) * phi ** k for k in range(1, n)))


def ar1_inflation(n, phi):
    """n * Var(mean) / s2: how many times the iid variance the run mean really has."""
    return n * ar1_mean_var(n, phi) 


def ar1_inflation_limit(phi):
    return (1.0 + phi) / (1.0 - phi)


def ess(n, phi):
    """Effective sample size n / inflation."""
    return n / ar1_inflation(n, phi)


def normal_cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def naive_coverage(n, phi, z=1.96):
    """Coverage of mean +- z sqrt(s2/n) (variance known, so only the autocorrelation is wrong): P(|N(0,1)| <= z/sqrt(infl))."""
    infl = ar1_inflation(n, phi)
    return 2.0 * normal_cdf(z / math.sqrt(infl)) - 1.0


def run_length(asym_var, half_width, z=1.96):
    """Run length for a half-width h: n = z^2 asym_var / h^2 (asym_var = lim n Var(mean))."""
    return z * z * asym_var / (half_width * half_width)


def ar1_path(phi, n, rng, s2=1.0):
    """Stationary AR(1) with marginal variance s2 (first draw from the stationary law)."""
    sd = math.sqrt(s2)
    innov = sd * math.sqrt(1.0 - phi * phi)
    x = rng.gauss(0.0, sd)
    out = []
    for _ in range(n):
        out.append(x)
        x = phi * x + rng.gauss(0.0, innov)
    return out


def mm1_waits(rho, n, rng, burn=0, start=0.0):
    """Waiting times of n consecutive jobs of an M/M/1 queue (service rate 1) by the Lindley recursion, after `burn`
    discarded jobs, starting from an initial wait `start` (0 = empty and idle)."""
    w, out = start, []
    for i in range(n + burn):
        if i >= burn:
            out.append(w)
        w = max(0.0, w + rng.expovariate(1.0) - rng.expovariate(rho))
    return out


def mm1_wait_mean(rho):
    return rho / (1.0 - rho)


def mm1_wait_var(rho):
    """Stationary variance of the M/M/1 wait in queue (service rate 1): rho(2-rho)/(1-rho)^2."""
    return rho * (2.0 - rho) / (1.0 - rho) ** 2


def mm1_asym_var(rho):
    """lim n Var(mean of n consecutive waits), service rate 1: rho(2+5rho-4rho^2+rho^3)/(1-rho)^4 (Daley 1968; see Whitt 1989)."""
    return rho * (2.0 + 5.0 * rho - 4.0 * rho ** 2 + rho ** 3) / (1.0 - rho) ** 4


def mm1_inflation(rho):
    return mm1_asym_var(rho) / mm1_wait_var(rho)


def _mean_sd(xs):
    m = sum(xs) / len(xs)
    v = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return m, math.sqrt(v)


def naive_ci(xs, z=1.96):
    """(mean, half-width) treating the samples as iid."""
    m, sd = _mean_sd(xs)
    return m, z * sd / math.sqrt(len(xs))


def batch_ci(xs, b=30):
    """(mean, half-width) from b contiguous batch means with a Student-t quantile (df b-1 must be a key of T975)."""
    L = len(xs) // b
    bm = [sum(xs[i * L:(i + 1) * L]) / L for i in range(b)]
    m, sd = _mean_sd(bm)
    return m, T975[b - 1] * sd / math.sqrt(b)
