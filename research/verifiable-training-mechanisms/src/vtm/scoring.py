"""Paying for evidence-gathering with a proper score (Beta-Bernoulli, exact)."""
from math import comb

__all__ = ["brier_value", "implement_cost"]


def _beta_binom(n, k, a, b):
    """P(k successes in n) when p ~ Beta(a, b), via the rising-factorial form (no lgamma)."""
    num = 1.0
    for i in range(k):
        num *= (a + i)
    for i in range(n - k):
        num *= (b + i)
    den = 1.0
    for i in range(n):
        den *= (a + b + i)
    return comb(n, k) * num / den


def brier_value(n, a, b):
    """Gain in expected Brier score from n samples over none, summed from the beta-binomial law.

    Score is 1 - (y - q)^2 for report q; the posterior mean is optimal."""
    def G(q):
        return 1.0 - q * (1.0 - q)
    base = G(a / (a + b))
    return sum(_beta_binom(n, k, a, b) * G((a + k) / (a + b + n)) for k in range(n + 1)) - base


def implement_cost(n, a, b, c, nmax=None):
    """Least score scale alpha making n samples a best effort (cost c each), and its rent.

    alpha is the largest of c (n - m) / (V(n) - V(m)) over m < n, and the rent is alpha V(n) - c n.
    Returns (alpha, rent)."""
    V = [brier_value(m, a, b) for m in range(n + 1)]
    alpha = max(c * (n - m) / (V[n] - V[m]) for m in range(n))
    return alpha, alpha * V[n] - c * n
