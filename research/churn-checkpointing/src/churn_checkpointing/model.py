"""Checkpointing a training job on preemptible/decentralised workers.

Failures are Poisson with rate lam (per unit time). Work is cut into segments of length w; each ends with a checkpoint
(commit) costing C during which failures can also strike. A failure loses the segment in progress and costs a restart R
(restart itself failure-free). Expected time to finish a segment of total length L=w+C is exactly (1/lam+R)(e^{lam L}-1).
"""
import math, random

__all__ = ["seg_time", "overhead", "lambert_w0", "w_opt", "w_young", "efficiency", "misspec_ratio", "sync_lambda",
           "sync_efficiency", "n_half", "elastic_efficiency", "crossover_n", "best_prefix", "simulate_segment"]


def seg_time(w, lam, C, R):
    """Exact E[time] to complete one segment of w work plus a checkpoint C."""
    return (1 / lam + R) * math.expm1(lam * (w + C))


def overhead(w, lam, C, R):
    """Expected wall-clock per unit of useful work at interval w."""
    return seg_time(w, lam, C, R) / w


def lambert_w0(x):
    """Principal branch of Lambert W for x in [-1/e, 0), Halley iteration."""
    if x < -1 / math.e - 1e-15 or x >= 0:
        raise ValueError("x must lie in [-1/e, 0)")
    w = -1 + math.sqrt(max(0.0, 2 * (1 + math.e * x)))  # branch-point start
    for _ in range(100):
        ew = math.exp(w); f = w * ew - x
        if f == 0: break
        step = f / (ew * (w + 1) - (w + 2) * f / (2 * w + 2)) if w != -1 else 1e-9
        w -= step
        if abs(step) < 1e-15: break
    return w


def w_opt(lam, C):
    """Exact optimal interval: w* = (1 + W0(-e^{-1-lam C}))/lam. Independent of restart cost R."""
    return (1 + lambert_w0(-math.exp(-1 - lam * C))) / lam


def w_young(lam, C):
    """Young/Daly first-order interval sqrt(2C/lam)."""
    return math.sqrt(2 * C / lam)


def efficiency(w, lam, C, R):
    """Useful-work fraction of wall-clock, 1/overhead."""
    return 1 / overhead(w, lam, C, R)


def misspec_ratio(a, lam, C, R):
    """Overhead at interval a*w* divided by the optimum (a<1 checkpoints too often, a>1 too rarely)."""
    ws = w_opt(lam, C)
    return overhead(a * ws, lam, C, R) / overhead(ws, lam, C, R)


def sync_lambda(n, lam):
    """Synchronous job on n workers restarts on any failure: rate n*lam."""
    return n * lam


def sync_efficiency(n, lam, C, R):
    """Efficiency at the optimal interval when any of n workers failing restarts the whole job."""
    L = sync_lambda(n, lam)
    return efficiency(w_opt(L, C), L, C, R)


def n_half(lam, C, R, target=0.5, nmax=10**7):
    """Largest n whose synchronous efficiency is still >= target (bisection; efficiency is decreasing in n)."""
    if sync_efficiency(1, lam, C, R) < target: return 0
    lo, hi = 1, 2
    while hi < nmax and sync_efficiency(hi, lam, C, R) >= target: lo, hi = hi, hi * 2
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if sync_efficiency(mid, lam, C, R) >= target: lo = mid
        else: hi = mid
    return lo


def elastic_efficiency(lam, rho):
    """Elastic training: a failure costs a fixed rebalance time rho on the failed slot only, so efficiency is
    1/(1+lam*rho) per worker, independent of n."""
    return 1 / (1 + lam * rho)


def crossover_n(lam, C, R, rho, nmax=10**7):
    """Smallest n at which elastic training beats optimally checkpointed synchronous training."""
    e = elastic_efficiency(lam, rho)
    lo, hi = 1, 2
    if sync_efficiency(1, lam, C, R) < e: return 1
    while hi < nmax and sync_efficiency(hi, lam, C, R) >= e: lo, hi = hi, hi * 2
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if sync_efficiency(mid, lam, C, R) >= e: lo = mid
        else: hi = mid
    return hi


def best_prefix(rates, C, R):
    """Heterogeneous pool, synchronous job: throughput of the k most reliable workers is k * efficiency(sum of rates).
    Returns (best k, throughput, all throughputs)."""
    rs = sorted(rates); tot = 0.0; th = []
    for k, r in enumerate(rs, 1):
        tot += r
        th.append(k * efficiency(w_opt(tot, C), tot, C, R))
    kbest = max(range(len(th)), key=th.__getitem__)
    return kbest + 1, th[kbest], th


def simulate_segment(w, lam, C, R, trials, seed=0):
    """Monte Carlo mean time to complete one segment."""
    rng = random.Random(seed); L = w + C; tot = 0.0
    for _ in range(trials):
        t = 0.0
        while True:
            x = rng.expovariate(lam)
            if x >= L: t += L; break
            t += x + R
        tot += t
    return tot / trials
