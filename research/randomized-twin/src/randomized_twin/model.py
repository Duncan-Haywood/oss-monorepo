"""Domain randomization in the scalar LQ setting. Plant x' = a x + b u + w; the twin's input gain is randomised b ~ U[bh(1-eps), bh(1+eps)]
(a known); one gain k is trained to minimise the expected simulated cost; it is deployed on the true plant b."""
import math

__all__ = ["cost", "optimal_gain", "dr_cost", "dr_gain", "cliff_eps", "regret", "dr_regret", "worst_regret", "minimax_gain",
           "price_of_randomization", "dr_gain_local"]


def cost(a, b, k, q=1.0, r=0.1, s2=1.0):
    c = a - b * k
    return math.inf if abs(c) >= 1 else s2 * (q + r * k * k) / (1 - c * c)


def optimal_gain(a, b, q=1.0, r=0.1):
    B = r * (1 - a * a) - q * b * b
    p = (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)
    return a * b * p / (r + b * b * p)


def _gl(n=64):
    """Gauss-Legendre nodes and weights on [-1, 1] by Newton iteration."""
    xs, ws = [], []
    for i in range(1, n + 1):
        x = math.cos(math.pi * (i - 0.25) / (n + 0.5))
        for _ in range(100):
            p0, p1 = 1.0, x
            for j in range(2, n + 1):
                p0, p1 = p1, ((2 * j - 1) * x * p1 - (j - 1) * p0) / j
            dp = n * (x * p1 - p0) / (x * x - 1)
            dx = p1 / dp
            x -= dx
            if abs(dx) < 1e-15:
                break
        xs.append(x); ws.append(2 / ((1 - x * x) * dp * dp))
    return xs, ws


_XS, _WS = _gl(64)


def dr_cost(a, bh, eps, k, q=1.0, r=0.1, s2=1.0):
    """E_b J_b(k), b uniform on bh(1 +- eps); +inf if any b in the range destabilises k (integrand is unbounded there)."""
    lo, hi = bh * (1 - eps), bh * (1 + eps)
    if max(abs(a - lo * k), abs(a - hi * k)) >= 1:
        return math.inf
    return sum(w * cost(a, (lo + hi) / 2 + (hi - lo) / 2 * x, k, q, r, s2) for x, w in zip(_XS, _WS)) / 2


def _golden(f, lo, hi, it=120):
    g = (math.sqrt(5) - 1) / 2
    c, d = hi - g * (hi - lo), lo + g * (hi - lo)
    fc, fd = f(c), f(d)
    for _ in range(it):
        if fc < fd:
            hi, d, fd = d, c, fc
            c = hi - g * (hi - lo); fc = f(c)
        else:
            lo, c, fc = c, d, fd
            d = lo + g * (hi - lo); fd = f(d)
    return (lo + hi) / 2


def cliff_eps(a, bh, k):
    """Largest eps for which the nominal-trained-or-any gain k stays stable over the whole range: bh(1+eps) k < 1+a (k>0)."""
    return (1 + a) / (bh * k) - 1


def dr_gain(a, bh, eps, q=1.0, r=0.1, s2=1.0):
    """Gain minimising the randomised expected cost. eps=0 gives the nominal Riccati gain."""
    if eps == 0:
        return optimal_gain(a, bh, q, r)
    hi = (1 + a) / (bh * (1 + eps)) * (1 - 1e-9)
    return _golden(lambda k: dr_cost(a, bh, eps, k, q, r, s2), 0.0, hi)


def dr_gain_local(a, bh, eps, q=1.0, r=0.1, s2=1.0, h=1e-3):
    """Small-eps law k_eps - k* = -(eps bh)^2 J_kbb / (6 J_kk), derivatives of J_b(k) at (bh, k*) by finite differences."""
    ks = optimal_gain(a, bh, q, r)
    f = lambda k, b: cost(a, b, k, q, r, s2)
    jkk = (f(ks + h, bh) - 2 * f(ks, bh) + f(ks - h, bh)) / (h * h)
    g = lambda b: (f(ks + h, b) - f(ks - h, b)) / (2 * h)                      # dJ/dk at k*
    jkbb = (g(bh + h) - 2 * g(bh) + g(bh - h)) / (h * h)
    return ks - (eps * bh) ** 2 * jkbb / (6 * jkk)


def regret(a, b, k, q=1.0, r=0.1, s2=1.0):
    return cost(a, b, k, q, r, s2) - cost(a, b, optimal_gain(a, b, q, r), q, r, s2)


def dr_regret(a, b, bh, eps, q=1.0, r=0.1, s2=1.0):
    return regret(a, b, dr_gain(a, bh, eps, q, r, s2), q, r, s2)


def worst_regret(a, bh, eps, k, q=1.0, r=0.1, s2=1.0, n=201):
    """Max over the randomisation range of the deployed regret of gain k (grid)."""
    worst = 0.0
    for i in range(n):
        b = bh * (1 - eps) + 2 * bh * eps * i / (n - 1)
        worst = max(worst, regret(a, b, k, q, r, s2))
    return worst


def minimax_gain(a, bh, eps, q=1.0, r=0.1, s2=1.0):
    """Gain minimising worst-case regret over the range (regret at the endpoints binds: J_b(k)-J_b(k*_b) is quasi-convex in b)."""
    hi = (1 + a) / (bh * (1 + eps)) * (1 - 1e-9)
    f = lambda k: max(regret(a, bh * (1 - eps), k, q, r, s2), regret(a, bh * (1 + eps), k, q, r, s2))
    return _golden(f, 0.0, hi)


def price_of_randomization(a, bh, eps, q=1.0, r=0.1, s2=1.0):
    """Regret paid when the twin was exactly right (b = bh)."""
    return dr_regret(a, bh, bh, eps, q, r, s2)
