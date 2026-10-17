"""Multiclass tangent-log score: a bounded, strictly proper extension of the log score to the K-simplex.

Separable generator G(r) = sum_j psi(r_j) with psi(x) = x ln x for x >= eps and, below eps, its
second-order Taylor polynomial at eps.  Loss (lower is better), outcome y, report r on the simplex:
  L(r, y) = sum_j h(r_j) - psi'(r_y),   h(x) = x psi'(x) - psi(x)
which equals -ln r_y whenever min_j r_j >= eps (h(x) = x there, so sum h = 1 and psi' = ln x + 1).
Expected-loss regret is the Bregman divergence D_G(p || r) = sum_j B(p_j || r_j).
"""
import math

__all__ = ["psi", "dpsi", "d2psi", "h", "loss", "exp_loss", "regret", "bregman1", "kl",
           "range_exact", "max_regret", "max_regret_log_clip", "curvature", "curv_per_range",
           "brier_regret", "brier_curv_per_range", "clip_report", "rare_class", "uniform"]


def psi(x, eps):
    if x >= eps:
        return x * math.log(x) if x > 0 else 0.0
    d = x - eps
    return eps * math.log(eps) + (math.log(eps) + 1) * d + d * d / (2 * eps)


def dpsi(x, eps):
    return math.log(x) + 1 if x >= eps else math.log(eps) + 1 + (x - eps) / eps


def d2psi(x, eps):
    return 1 / x if x >= eps else 1 / eps


def h(x, eps):
    return x * dpsi(x, eps) - psi(x, eps)


def loss(r, y, eps):
    return sum(h(x, eps) for x in r) - dpsi(r[y], eps)


def exp_loss(r, p, eps):
    return sum(pj * loss(r, j, eps) for j, pj in enumerate(p) if pj > 0)


def regret(r, p, eps):
    return exp_loss(r, p, eps) - exp_loss(p, p, eps)


def bregman1(a, b, eps):
    return psi(a, eps) - psi(b, eps) - dpsi(b, eps) * (a - b)


def kl(p, r):
    return sum(a * math.log(a / b) if b > 0 else math.inf for a, b in zip(p, r) if a > 0)


def range_exact(K, eps):
    """max minus min of the loss over reports and outcomes: 1 - ln eps (independent of K).
    max: r = e_j, y != j, loss = 1 + (K-1) eps/2 - ln eps.  min: r = e_y, loss = (K-1) eps/2."""
    return 1 - math.log(eps)


def max_regret(p, eps):
    """Regret is convex in r, so its maximum on the simplex is at a vertex e_j:
    sum_{i != j} B(p_i || 0) + B(p_j || 1)."""
    K = len(p)
    best = 0.0
    for j in range(K):
        v = [float(i == j) for i in range(K)]
        best = max(best, sum(bregman1(p[i], v[i], eps) for i in range(K)))
    return best


def max_regret_log_clip(p, eps):
    """Worst regret of plain log when reports are clipped to r_j >= eps (vertex of the clipped simplex)."""
    K = len(p)
    best = 0.0
    for j in range(K):
        r = [eps] * K
        r[j] = 1 - (K - 1) * eps
        best = max(best, kl(p, r))
    return best


def curvature(p, d, eps):
    """second-order regret for a perturbation d, sum(d)=0: (1/2) sum_j psi''(p_j) d_j^2"""
    return 0.5 * sum(d2psi(a, eps) * x * x for a, x in zip(p, d))


def curv_per_range(p, d, eps):
    return curvature(p, d, eps) / range_exact(len(p), eps)


def brier_regret(r, p):
    return sum((a - b) ** 2 for a, b in zip(r, p))


def brier_curv_per_range(d):
    return sum(x * x for x in d) / 2.0  # Brier range 2


def clip_report(r, eps):
    """the naive alternative to a bounded score: floor each coordinate at eps and renormalise"""
    c = [max(x, eps) for x in r]
    s = sum(c)
    return [x / s for x in c]


def uniform(K):
    return [1.0 / K] * K


def rare_class(K, rho):
    return [rho] + [(1 - rho) / (K - 1)] * (K - 1)
