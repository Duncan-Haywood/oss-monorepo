"""Cost-function prediction markets defined by a regulariser R on the simplex.

    C(q) = max_p  <p, q> - b R(p),      price(q) = grad C(q) = argmax_p (...)

Traders buy share vector ``dq`` (one entry per outcome / expert) paying
C(q+dq) - C(q). The price vector is exactly the FTRL / mirror-descent iterate
of online learning with cumulative gains ``q`` (Abernethy-Chen-Vaughan 2013;
Frongillo et al. 2012). ``max R - min R`` times ``b`` bounds the market maker's
worst-case loss.

* EntropicMarket: R = negative entropy   -> LMSR (Hanson 2003), softmax prices.
* QuadraticMarket: R = 1/2 ||p||^2        -> sparsemax prices (exact zeros).
"""
import math

from .simplex import softmax, project_simplex


class _Market:
    def __init__(self, n, b=1.0):
        if n < 2 or b <= 0:
            raise ValueError("need n >= 2 outcomes and b > 0")
        self.n, self.b = n, b
        self.q = [0.0] * n

    # subclasses define price / reg / reg_range
    def cost(self, q=None):
        q = self.q if q is None else q
        p = self.price(q)
        return sum(pi * qi for pi, qi in zip(p, q)) - self.b * self.reg(p)

    def prices(self):
        return self.price(self.q)

    def trade(self, dq):
        """Apply a trade; returns the payment (>= <price_before, dq> by convexity)."""
        new = [a + d for a, d in zip(self.q, dq)]
        pay = self.cost(new) - self.cost()
        self.q = new
        return pay

    def max_loss_bound(self):
        return self.b * self.reg_range

    def maker_loss(self, outcome):
        """Realised loss if `outcome` occurs: payout q[outcome] minus revenue."""
        return self.q[outcome] - (self.cost() - self.cost([0.0] * self.n))


class EntropicMarket(_Market):
    """LMSR with liquidity b: prices softmax(q / b)."""

    def __init__(self, n, b=1.0):
        super().__init__(n, b)
        self.reg_range = math.log(n)

    def price(self, q):
        return softmax([x / self.b for x in q])

    def reg(self, p):
        return sum(x * math.log(x) for x in p if x > 0)


class QuadraticMarket(_Market):
    """Quadratic-potential market: prices = projection of q/b onto the simplex."""

    def __init__(self, n, b=1.0):
        super().__init__(n, b)
        self.reg_range = 0.5 * (1.0 - 1.0 / n)

    def price(self, q):
        return project_simplex([x / self.b for x in q])

    def reg(self, p):
        return 0.5 * sum(x * x for x in p)
