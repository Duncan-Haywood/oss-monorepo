"""Per-layer vs total tolerance tests for drift across L layers.

Honest drift x_l ~ N(0, 1) iid (units of the per-layer sigma).  A prover adds shifts d_l >= 0.
Sum test:  S = sum x_l / sqrt(L) > z_a.            Max test: M = max x_l > c(L, a) (Sidak).
Combined:  either test fires, each at level a/2 (union bound => level <= a).
"""
import math, random

__all__ = ["Phi", "Phiinv", "sum_threshold", "max_threshold", "power_sum", "power_max",
           "power_combined_lb", "even_split", "half_detect_size", "hidden_budget",
           "power_mc", "naive_sum_of_tolerances"]


def Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def Phiinv(p):
    lo, hi = -12.0, 12.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if Phi(mid) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def sum_threshold(alpha):
    return Phiinv(1 - alpha)


def max_threshold(L, alpha):
    """exact level-alpha threshold for max of L iid N(0,1)."""
    return Phiinv((1 - alpha) ** (1 / L))


def power_sum(L, alpha, deltas):
    return 1 - Phi(sum_threshold(alpha) - sum(deltas) / math.sqrt(L))


def power_max(L, alpha, deltas):
    c = max_threshold(L, alpha)
    p = 1.0
    for i in range(L):
        p *= Phi(c - (deltas[i] if i < len(deltas) else 0.0))
    return 1 - p


def power_combined_lb(L, alpha, deltas):
    """lower bound on the power of 'sum at a/2 or max at a/2' (either alone is a lower bound)."""
    return max(power_sum(L, alpha / 2, deltas), power_max(L, alpha / 2, deltas))


def even_split(total, k):
    return [total / k] * k


def half_detect_size(power_fn, L, alpha, k, target=0.5):
    """total shift, spread evenly over k layers, at which the test fires w.p. `target`."""
    lo, hi = 0.0, 50.0 * L
    for _ in range(100):
        mid = (lo + hi) / 2
        if power_fn(L, alpha, even_split(mid, k)) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def hidden_budget(power_fn, L, alpha, target=0.5):
    """largest total shift the prover can push through with detection prob <= target,
    choosing the number of layers k it spreads over.  Returns (budget, best k)."""
    best = (0.0, 1)
    for k in range(1, L + 1):
        h = half_detect_size(power_fn, L, alpha, k, target)
        if h > best[0]:
            best = (h, k)
    return best


def power_mc(L, alpha, deltas, trials, rng, test):
    """Monte-Carlo firing rate of 'sum', 'max' or 'combined' (a/2 each)."""
    a = alpha / 2 if test == "combined" else alpha
    zs, c = sum_threshold(a), max_threshold(L, a)
    d = list(deltas) + [0.0] * (L - len(deltas))
    hit = 0
    for _ in range(trials):
        x = [rng.gauss(0, 1) + d[i] for i in range(L)]
        fs = sum(x) / math.sqrt(L) > zs
        fm = max(x) > c
        hit += {"sum": fs, "max": fm, "combined": fs or fm}[test]
    return hit / trials


def naive_sum_of_tolerances(L, alpha):
    """total drift admitted if each layer gets its own Sidak tolerance c(L, alpha) vs the level-alpha
    tolerance z_a sqrt(L) on the total (both in units of sigma)."""
    return L * max_threshold(L, alpha), sum_threshold(alpha) * math.sqrt(L)
