"""K-ary proper scores for verifier reports on a probability simplex.

Losses (lower is better), outcome y in {0..K-1}, report r on the simplex:
  brier      sum_j (r_j - 1[j=y])^2                    range [0, 2]
  spherical  1 - r_y / ||r||_2                          range [0, 1]
  log        -ln r_y                                    unbounded
"""
import math

__all__ = ["norm", "brier_loss", "spherical_loss", "log_loss", "exp_loss", "regret",
           "brier_regret", "spherical_regret", "kl", "max_regret_brier",
           "max_regret_spherical", "curv_brier", "curv_spherical", "curv_log",
           "pair_shift", "uniform", "rare_class"]


def norm(v):
    return math.sqrt(sum(x * x for x in v))


def brier_loss(r, y):
    return sum((x - (j == y)) ** 2 for j, x in enumerate(r))


def spherical_loss(r, y):
    return 1 - r[y] / norm(r)


def log_loss(r, y):
    return math.inf if r[y] <= 0 else -math.log(r[y])


def exp_loss(loss, r, p):
    return sum(pj * loss(r, j) for j, pj in enumerate(p) if pj > 0)


def regret(loss, r, p):
    return exp_loss(loss, r, p) - exp_loss(loss, p, p)


def brier_regret(r, p):
    return sum((a - b) ** 2 for a, b in zip(r, p))


def spherical_regret(r, p):
    return norm(p) - sum(a * b for a, b in zip(p, r)) / norm(r)


def kl(p, r):
    return sum(a * math.log(a / b) if b > 0 else math.inf for a, b in zip(p, r) if a > 0)


def max_regret_brier(p):
    """max over r of ||r-p||^2 is at a vertex e_j: 1 - 2 p_j + ||p||^2; worst j = argmin p."""
    return 1 - 2 * min(p) + norm(p) ** 2


def max_regret_spherical(p):
    """p.r/||r|| is quasi-concave, so its minimum on the simplex is at a vertex."""
    return norm(p) - min(p)


# local (second-order) regret for a perturbation d with sum(d)=0
def curv_brier(p, d):
    return sum(x * x for x in d)


def curv_spherical(p, d):
    n2 = sum(x * x for x in p)
    dp = sum(a * b for a, b in zip(d, p))
    perp = sum(x * x for x in d) - dp * dp / n2
    return perp / (2 * math.sqrt(n2))


def curv_log(p, d):
    return sum(x * x / (2 * a) for x, a in zip(d, p))


def pair_shift(p, i, j, eps):
    """report = p with mass eps moved from class i to class j"""
    r = list(p)
    r[i] -= eps
    r[j] += eps
    return r


def uniform(K):
    return [1.0 / K] * K


def rare_class(K, rho):
    """class 0 has mass rho, the other K-1 classes share 1-rho equally"""
    return [rho] + [(1 - rho) / (K - 1)] * (K - 1)
