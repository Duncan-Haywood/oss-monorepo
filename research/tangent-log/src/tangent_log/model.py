"""Tangent-extended log score for binary outcomes.
Generator G(p)=p ln p+(1-p)ln(1-p) on [eps,1-eps]; outside, G is extended by its second-order Taylor polynomial
(value, slope and curvature c=1/(eps(1-eps)) matched at the joint). Loss l(r,y)=D_G(y||r)=G(y)-G(r)-G'(r)(y-r) is a
Bregman divergence of a C^2 strictly convex G, hence strictly proper on [0,1], equals -ln r_y + kappa_eps on [eps,1-eps],
and is bounded by R_eps = ln((1-eps)/eps)+1/(1-eps)."""
import math

__all__ = ["G", "dG", "d2G", "loss", "exp_loss", "excess", "score_range", "curvature", "brier_curvature_per_range",
           "efficiency", "crossover", "best_eps", "kappa"]


def _c(eps):
    return 1 / (eps * (1 - eps))


def G(p, eps):
    if p < eps:
        q = eps
    elif p > 1 - eps:
        q = 1 - eps
    else:
        return p * math.log(p) + (1 - p) * math.log(1 - p) if 0 < p < 1 else 0.0
    return q * math.log(q) + (1 - q) * math.log(1 - q) + dG(q, eps) * (p - q) + _c(eps) * (p - q) ** 2 / 2


def dG(p, eps):
    if p < eps:
        return dG(eps, eps) + _c(eps) * (p - eps)
    if p > 1 - eps:
        return dG(1 - eps, eps) + _c(eps) * (p - (1 - eps))
    return math.log(p / (1 - p))


def d2G(p, eps):
    return _c(eps) if (p < eps or p > 1 - eps) else 1 / (p * (1 - p))


def loss(r, y, eps):
    """Loss of report r on outcome y in {0,1} (>=0, zero iff r=y)."""
    return G(y, eps) - G(r, eps) - dG(r, eps) * (y - r)


def exp_loss(r, p, eps):
    return p * loss(r, 1, eps) + (1 - p) * loss(r, 0, eps)


def excess(r, p, eps):
    """Expected loss above truthful: equals D_G(p||r) (Bregman divergence of the truth from the report)."""
    return G(p, eps) - G(r, eps) - dG(r, eps) * (p - r)


def score_range(eps):
    """Worst-case loss = loss(0,1) = loss(1,0) = ln((1-eps)/eps) + 1/(1-eps)."""
    return math.log((1 - eps) / eps) + 1 / (1 - eps)


def curvature(p, eps):
    """Incentive strength: excess ~ curvature*(r-p)^2/2 near truth."""
    return d2G(p, eps)


def brier_curvature_per_range():
    """Brier loss (r-y)^2 has curvature 2 and range 1."""
    return 2.0


def efficiency(p, eps):
    """Curvature at truth per unit of payment range."""
    return curvature(p, eps) / score_range(eps)


def crossover(eps):
    """Truth p<1/2 below which the tangent log has more curvature per range than Brier: p(1-p)=1/(2R)."""
    R = score_range(eps)
    disc = 1 - 2 / R
    return None if disc < 0 else (1 - math.sqrt(disc)) / 2


def kappa(eps):
    """Constant offset: loss(r,y) = -ln r_y + kappa on [eps,1-eps], kappa = G_eps(1) (<0)."""
    return G(1, eps)


def best_eps(p, grid=20000):
    """eps in (0,1/2) maximising curvature per range at truth p (grid search): it is eps=p."""
    return max((efficiency(p, e), e) for e in (i / grid / 2 for i in range(1, grid)))[1]
