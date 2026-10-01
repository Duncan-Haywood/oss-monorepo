"""Fractional-Kelly wealth markets for binary events. Stdlib only.

Agent i has wealth w_i, belief q_i = P(y=1) and bets a fraction lam_i of wealth Kelly-style on the two
Arrow securities, keeping (1-lam_i) in the risk-free portfolio. Its demand is then w_i * qt_i(y)/p(y)
shares with the shaded belief qt_i = lam_i q_i + (1-lam_i) p. Clearing (total shares = total wealth) gives
    p = sum_i lam_i w_i q_i / sum_i lam_i w_i          (risk-tolerance-weighted price)
and the wealth update  w_i' = w_i (1 - lam_i + lam_i q_i(y)/p(y)),  which conserves total wealth.
"""
import math, random

__all__ = ["kl", "chi2", "price", "step", "run", "clearing_residual", "expected_transfer", "growth",
           "optimal_lambda", "manip_cost", "manip_lambda_weight", "lmsr_cost", "regret_bound",
           "manipulated_price", "bayes_log_loss"]


def kl(p, q):
    t = 0.0
    if p > 0:
        t += p * math.log(p / q)
    if p < 1:
        t += (1 - p) * math.log((1 - p) / (1 - q))
    return t


def chi2(p0, p):
    """Chi-square divergence chi2(Bern(p0) || Bern(p)) = (p0-p)^2 / (p(1-p))."""
    return (p0 - p) ** 2 / (p * (1 - p))


def price(w, lam, q):
    v = [l * x for l, x in zip(lam, w)]
    return sum(a * b for a, b in zip(v, q)) / sum(v)


def step(w, lam, q, y):
    """One round: returns (new wealth list, price). y in {0,1}."""
    p = price(w, lam, q)
    py = p if y == 1 else 1 - p
    out = []
    for wi, li, qi in zip(w, lam, q):
        qy = qi if y == 1 else 1 - qi
        out.append(wi * (1 - li + li * qy / py))
    return out, p


def run(w0, lam, q, ys):
    """Play a sequence; returns dict with market log-loss, each expert's log-loss, final wealth."""
    w = list(w0)
    L = 0.0
    Li = [0.0] * len(q)
    for y in ys:
        w, p = step(w, lam, q, y)
        L -= math.log(p if y == 1 else 1 - p)
        for i, qi in enumerate(q):
            Li[i] -= math.log(qi if y == 1 else 1 - qi)
    return {"loss": L, "expert_loss": Li, "wealth": w}


def clearing_residual(w, lam, q, y):
    """Total shares demanded at outcome y minus total wealth; zero at the market price."""
    p = price(w, lam, q)
    py = p if y == 1 else 1 - p
    tot = 0.0
    for wi, li, qi in zip(w, lam, q):
        qy = qi if y == 1 else 1 - qi
        qt = li * qy + (1 - li) * py
        tot += wi * qt / py
    return tot - sum(w)


def expected_transfer(w_i, lam_i, q_i, p, pi):
    """Expected wealth change of a price-taker under true P(y=1)=pi:
    lam w (q-p)(pi-p)/(p(1-p))."""
    return lam_i * w_i * (q_i - p) * (pi - p) / (p * (1 - p))


def growth(lam, q, p, pi):
    """Expected log-growth of wealth under truth pi for a price-taker with belief q at price p."""
    a = q / p
    b = (1 - q) / (1 - p)
    return pi * math.log(1 - lam + lam * a) + (1 - pi) * math.log(1 - lam + lam * b)


def optimal_lambda(pi, p, q):
    """Growth-optimal Kelly fraction (pi-p)/(q-p), clipped to [0,1]: the bet that makes the shaded
    belief lam*q+(1-lam)*p equal to the truth."""
    if q == p:
        return 0.0
    return min(1.0, max(0.0, (pi - p) / (q - p)))


def manip_cost(V, p0, p):
    """Expected loss of a manipulator who moves the price from p0 to p against others (weight V =
    sum lam w) whose rest-price p0 equals the truth: V * chi2(p0 || p)."""
    return V * chi2(p0, p)


def manip_lambda_weight(V, p0, q, p):
    """Risk-tolerance-weighted wealth Lam = lam_m w_m a manipulator with belief q needs to reach price p."""
    return (p - p0) * V / (q - p)


def manipulated_price(V, p0, Lam, q):
    return (V * p0 + Lam * q) / (V + Lam)


def lmsr_cost(b, p0, p):
    """Expected loss of an LMSR manipulator moving the price from p0 to p when the truth is p0."""
    return b * kl(p0, p)


def regret_bound(s0, lam):
    """log-loss(market) - log-loss(expert i) <= ln(1/s0_i)/lam_i, s0_i = w_i(0)/W."""
    return math.log(1 / s0) / lam


def bayes_log_loss(w0, q, ys):
    """Bayes-mixture log-loss -ln sum_i (w_i/W) prod_t q_i(y_t)."""
    W = sum(w0)
    lp = []
    for wi, qi in zip(w0, q):
        s = math.log(wi / W)
        for y in ys:
            s += math.log(qi if y == 1 else 1 - qi)
        lp.append(s)
    m = max(lp)
    return -(m + math.log(sum(math.exp(x - m) for x in lp)))
