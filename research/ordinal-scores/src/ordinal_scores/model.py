"""Ranked probability score (RPS) for ordered outcomes y in {0..K-1}, report r on the simplex.

  brier  sum_j (r_j - 1[j=y])^2                       range [0, 2]
  rps    sum_{k<K-1} (R_k - 1[y<=k])^2, R_k = r_0+..+r_k   range [0, K-1]
"""
import math

__all__ = ["cdf", "brier_loss", "rps_loss", "exp_loss", "regret", "brier_regret", "rps_regret",
           "shift_regret_rps", "shift_regret_brier", "max_regret_rps", "max_regret_brier",
           "merge_regret_rps", "merge_regret_brier", "threshold_gap_bound", "shift", "merge"]


def cdf(r):
    out, s = [], 0.0
    for x in r[:-1]:
        s += x
        out.append(s)
    return out


def brier_loss(r, y):
    return sum((x - (j == y)) ** 2 for j, x in enumerate(r))


def rps_loss(r, y):
    return sum((c - (y <= k)) ** 2 for k, c in enumerate(cdf(r)))


def exp_loss(loss, r, p):
    return sum(pj * loss(r, j) for j, pj in enumerate(p))


def regret(loss, r, p):
    return exp_loss(loss, r, p) - exp_loss(loss, p, p)


def brier_regret(r, p):
    return sum((a - b) ** 2 for a, b in zip(r, p))


def rps_regret(r, p):
    """regret is Brier on the cumulative distribution: sum_k (R_k - P_k)^2"""
    return sum((a - b) ** 2 for a, b in zip(cdf(r), cdf(p)))


def shift(p, i, j, eps):
    r = list(p)
    r[i] -= eps
    r[j] += eps
    return r


def shift_regret_rps(i, j, eps):
    """moving eps of mass from class i to j changes |i-j| cumulative entries by eps each"""
    return abs(i - j) * eps * eps


def shift_regret_brier(i, j, eps):
    return 2 * eps * eps


def max_regret_brier(p):
    return 1 - 2 * min(p) + sum(x * x for x in p)


def max_regret_rps(p):
    """convex in r, so the max over the simplex is at a vertex e_v"""
    P = cdf(p)
    K = len(p)
    return max(sum(((1.0 if v <= k else 0.0) - P[k]) ** 2 for k in range(K - 1)) for v in range(K))


def merge(p, i):
    """report that pools classes i and i+1 into an equal split"""
    r = list(p)
    r[i] = r[i + 1] = (p[i] + p[i + 1]) / 2
    return r


def merge_regret_rps(p, i):
    return ((p[i] - p[i + 1]) / 2) ** 2


def merge_regret_brier(p, i):
    return (p[i] - p[i + 1]) ** 2 / 2


def threshold_gap_bound(regret_value):
    """every threshold probability |R_k - P_k| <= sqrt(RPS regret)"""
    return math.sqrt(regret_value)
