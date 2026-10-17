"""Twin screening then real verification (stylised, standard-normal units).
K candidate designs have true values v_i ~ N(0,1) iid.  The twin scores t_i = rho*v_i + sqrt(1-rho^2)*e_i (corr(t,v) = rho).
The twin shortlists the m highest t_i; each shortlisted design is measured on the real plant with noise sd s_each, and the best
measured one is chosen.  A fixed real budget of B trials (unit-variance noise per trial) split evenly gives s_each = sqrt(m/B).
Exact facts used: m=1 gives E[v] = rho*c_K, with c_K = E max of K standard normals; m=K gives the real-only choice."""
import math, random

__all__ = ["expected_max_normal", "twin_only_value", "oracle_value", "screen_value_mc", "best_m", "sd_each"]


def _phi(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def _Phi(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))


def expected_max_normal(K):
    """c_K = E max of K iid N(0,1), by trapezoid integration of K x phi(x) Phi(x)^(K-1) over [-9, 9]."""
    if K == 1:
        return 0.0
    n, lo, hi = 6000, -9.0, 9.0
    h = (hi - lo) / n
    tot = 0.0
    for i in range(n + 1):
        x = lo + i * h
        w = 0.5 if i in (0, n) else 1.0
        tot += w * K * x * _phi(x) * _Phi(x) ** (K - 1)
    return tot * h


def twin_only_value(rho, K):
    """Exact E[v] of the design the twin ranks first: rho * c_K (v and t jointly normal)."""
    return rho * expected_max_normal(K)


def oracle_value(K):
    return expected_max_normal(K)


def sd_each(m, B):
    return math.sqrt(m / B)


def screen_value_mc(K, m, rho, B, trials, seed=0):
    """Monte-Carlo E[true value of the chosen design] and its standard error."""
    rng = random.Random(seed)
    c = math.sqrt(1 - rho * rho)
    s = sd_each(m, B)
    tot = tot2 = 0.0
    for _ in range(trials):
        v = [rng.gauss(0, 1) for _ in range(K)]
        t = [rho * x + c * rng.gauss(0, 1) for x in v]
        top = sorted(range(K), key=lambda i: -t[i])[:m]
        pick = max(top, key=lambda i: v[i] + s * rng.gauss(0, 1))
        tot += v[pick]
        tot2 += v[pick] ** 2
    mean = tot / trials
    return mean, math.sqrt(max(tot2 / trials - mean * mean, 0) / trials)


def best_m(K, rho, B, ms, trials, seed=0):
    """(m, value) with the highest Monte-Carlo value among the candidate shortlist sizes."""
    res = [(m, screen_value_mc(K, m, rho, B, trials, seed + m)[0]) for m in ms]
    return max(res, key=lambda r: r[1])
