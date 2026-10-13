"""Binary LMSR with a proportional fee f on the cost of every purchase.

Price p = P(yes).  Buying yes shares moving the price p -> p' > p costs  b ln((1-p)/(1-p'))  and pays a fee f times that;
buying no shares moving p -> p' < p costs  b ln(p/p').  A risk-neutral trader with belief q buys yes while the marginal
price p(1+f) < q and buys no while (1-p)(1+f) < 1-q, so trading stops at the edge of the band
[q/(1+f), (q+f)/(1+f)] of width f/(1+f), whatever q is.
"""
import math, random

__all__ = ["logit", "sigmoid", "band", "trade_target", "cost", "fee_revenue", "trader_profit", "signal_thresholds",
           "market_run", "maker_worst_case"]


def logit(p):
    return math.log(p / (1 - p))


def sigmoid(x):
    return 1 / (1 + math.exp(-x)) if x >= 0 else math.exp(x) / (1 + math.exp(x))


def band(q, f):
    """prices at which a trader with belief q does not trade: [q/(1+f), (q+f)/(1+f)]."""
    return q / (1 + f), (q + f) / (1 + f)


def trade_target(p, q, f):
    """price after a risk-neutral trader with belief q trades against price p (moves to the nearest band edge)."""
    lo, hi = band(q, f)
    return min(max(p, lo), hi)


def cost(p, p2, b):
    """LMSR cost of moving the price p -> p2 (before fee)."""
    return b * math.log((1 - p) / (1 - p2)) if p2 >= p else b * math.log(p / p2)


def fee_revenue(path, b, f):
    """fee on the gross cost of a sequence of prices path[0], path[1], ..."""
    return f * sum(cost(a, c, b) for a, c in zip(path, path[1:]))


def trader_profit(p, p2, q, b, f):
    """exact expected profit (belief q) of moving the price p -> p2, including the fee."""
    c = cost(p, p2, b)
    if p2 >= p:
        x = b * math.log(p2 * (1 - p) / (p * (1 - p2)))          # yes shares bought
        return q * x - (1 + f) * c
    x = b * math.log((1 - p2) * p / ((1 - p) * p2))               # no shares bought
    return (1 - q) * x - (1 + f) * c


def signal_thresholds(p, f):
    """smallest log-likelihood ratio |lambda| of a naive trader (q = sigmoid(logit p + lambda)) that moves the price:
    (up, down); inf if the fee makes that side untradable at this price."""
    up = logit(min(p * (1 + f), 1 - 1e-15)) - logit(p) if p * (1 + f) < 1 else math.inf
    r = 1 - (1 - p) * (1 + f)
    down = logit(p) - logit(r) if r > 0 else math.inf
    return up, down


def market_run(n, acc, f, b, rng, p0=0.5):
    """n sequential traders, each with an independent signal of accuracy acc about a fair-coin state, who believe
    q = sigmoid(logit p + lambda_i) (the price is treated as a sufficient statistic for earlier signals).
    Returns (final price, state, maker net P&L incl. fees, fee revenue, path, signed LLRs)."""
    state = rng.random() < 0.5
    lam = math.log(acc / (1 - acc))
    p, path, pay, fees = p0, [p0], 0.0, 0.0
    yes_sold = no_sold = 0.0
    total_cost = 0.0
    lams = []
    for _ in range(n):
        good = rng.random() < acc
        l = lam if good == state else -lam                          # +lam points at "yes"
        lams.append(l)
        q = sigmoid(logit(p) + l)
        p2 = trade_target(p, q, f)
        if p2 > p:
            yes_sold += b * math.log(p2 * (1 - p) / (p * (1 - p2)))
        elif p2 < p:
            no_sold += b * math.log((1 - p2) * p / ((1 - p) * p2))
        c = cost(p, p2, b)
        total_cost += c
        fees += f * c
        p = p2
        path.append(p)
    payout = yes_sold if state else no_sold
    return p, state, total_cost + fees - payout, fees, path, lams


def maker_worst_case(b, fee_paid):
    """no-fee LMSR loss is bounded by b ln 2 from p0 = 1/2; fees only add to the maker's revenue."""
    return b * math.log(2) - fee_paid
