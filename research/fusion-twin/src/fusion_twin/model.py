"""n redundant sensors (radar returns, lidar ranges, wheel odometers) measure the same quantity with error variance s2 each.
The twin draws their errors independently; the 'real' errors share a common component, so every pair has correlation
rho.  The fused estimate is the equal-weight average (optimal for equicorrelated errors, so no reweighting repairs it)."""
import math, random

__all__ = ["fused_var", "inflation", "n_eff", "floor_var", "sensors_needed", "gate_false_alarm", "honest_gate",
           "sample_errors", "epoch_stats", "rho_hat", "boot_rho_upper"]


def inflation(rho, n):
    """Real / twin variance of the average: 1 + (n-1) rho."""
    return 1.0 + (n - 1) * rho


def fused_var(s2, rho, n):
    """Exact variance of the mean of n equicorrelated errors: s2 (1 + (n-1) rho) / n."""
    return s2 * inflation(rho, n) / n


def n_eff(rho, n):
    """Number of independent sensors with the same fused variance: n / (1 + (n-1) rho) < 1/rho."""
    return n / inflation(rho, n)


def floor_var(s2, rho):
    """Limit of fused_var as n -> infinity: s2 rho.  No number of sensors goes below it."""
    return s2 * rho


def sensors_needed(s2, rho, tau):
    """Smallest real n (as a float) with fused std <= tau: s2 (1-rho) / (tau^2 - s2 rho); inf when tau^2 <= s2 rho."""
    d = tau * tau - s2 * rho
    return math.inf if d <= 0 else s2 * (1.0 - rho) / d


def gate_false_alarm(rho, n, z=3.0):
    """P(|fused error| > z * twin std) when the real errors are equicorrelated: erfc(z / sqrt(2 k))."""
    return math.erfc(z / math.sqrt(2.0 * inflation(rho, n)))


def honest_gate(rho, n, z=3.0):
    """Gate width (in twin stds) that restores the nominal false-alarm rate: z sqrt(k)."""
    return z * math.sqrt(inflation(rho, n))


def sample_errors(rng, n, rho, sigma=1.0):
    """n errors with variance sigma^2 and pairwise correlation rho (rho >= 0): common factor plus independent parts."""
    c = rng.gauss(0.0, 1.0)
    a, b = math.sqrt(rho), math.sqrt(1.0 - rho)
    return [sigma * (a * c + b * rng.gauss(0.0, 1.0)) for _ in range(n)]


def epoch_stats(errs):
    """Sufficient statistics of one calibration epoch: (square of the sum, sum of squares)."""
    return (sum(errs) ** 2, sum(e * e for e in errs))


def rho_hat(stats, n):
    """Pooled pairwise-correlation estimate from epochs of n sensors with known truth:
    mean cross-product over mean square, using sum_{i!=j} e_i e_j = (sum e)^2 - sum e^2."""
    T = len(stats)
    cross = sum(s - q for s, q in stats) / (n * (n - 1) * T)
    sq = sum(q for _, q in stats) / (n * T)
    return cross / sq, sq


def boot_rho_upper(stats, n, rng, B=200, level=0.9):
    """Bootstrap-over-epochs upper confidence bound on rho."""
    T = len(stats)
    vals = []
    for _ in range(B):
        vals.append(rho_hat([stats[rng.randrange(T)] for _ in range(T)], n)[0])
    vals.sort()
    return vals[min(B - 1, int(level * B))]
