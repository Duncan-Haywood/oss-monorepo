"""Glosten-Milgrom (GM) pricing of a binary verification claim vs an LMSR of liquidity b.

State s in {0,1} (claim is honest / faulty), prior p0 = P(s=1).  Each round one trader arrives and
buys or sells one unit of the claim.  With probability mu the trader is informed: it sees a signal
correct with probability q and buys if the signal says 1, sells otherwise.  Otherwise it is a noise
trader who buys or sells with probability 1/2.  Then
    P(buy | s=1) = (1+m)/2,  P(buy | s=0) = (1-m)/2,   m = mu (2q - 1),
so a competitive GM market maker's posterior log-odds moves by exactly k = ln((1+m)/(1-m)) per net
buy: it is an LMSR with b* = 1/k = 1/(2 atanh m).  Everything below depends on the trade history
only through the net flow F = B - S (buys minus sells).
"""
import math

__all__ = ["logit", "sigmoid", "flow_slope", "b_star", "informed_fraction_for_b", "gm_price",
           "bayes_price_bruteforce", "lmsr_price", "lmsr_cost", "flow_pmf", "log_loss_expected",
           "excess_log_loss", "lmsr_mm_pnl", "gm_mm_pnl", "mixture_price", "trades_to_confidence"]


def logit(p):
    return math.log(p / (1 - p))


def sigmoid(x):
    if x >= 0:
        return 1 / (1 + math.exp(-x))
    e = math.exp(x)
    return e / (1 + e)


def flow_slope(m):
    """log-odds change per unit of net flow, k = ln((1+m)/(1-m)) = 2 atanh(m)."""
    return math.log((1 + m) / (1 - m))


def b_star(m):
    """LMSR liquidity that reproduces GM pricing exactly: 1/k."""
    return 1 / flow_slope(m)


def informed_fraction_for_b(b, q=1.0):
    """inverse of b_star: the informed share mu that makes b the GM-consistent liquidity."""
    return math.tanh(1 / (2 * b)) / (2 * q - 1)


def gm_price(F, m, p0=0.5):
    """P(s=1 | net flow F) for a GM maker who knows m."""
    return sigmoid(logit(p0) + flow_slope(m) * F)


def bayes_price_bruteforce(B, S, m, p0=0.5):
    """the same posterior computed from the trade likelihoods directly (no closed form)."""
    l1 = p0 * ((1 + m) / 2) ** B * ((1 - m) / 2) ** S
    l0 = (1 - p0) * ((1 - m) / 2) ** B * ((1 + m) / 2) ** S
    return l1 / (l1 + l0)


def lmsr_price(F, b, p0=0.5):
    """LMSR price of the yes share after net flow F (initial price p0)."""
    return sigmoid(logit(p0) + F / b)


def lmsr_cost(qy, qn, b):
    """C(q) = b ln(e^{qy/b} + e^{qn/b}), computed stably."""
    hi = max(qy, qn)
    return hi + b * math.log(math.exp((qy - hi) / b) + math.exp((qn - hi) / b))


def _lbinom(n, k):
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def flow_pmf(n, m, state):
    """pmf of the number of buys K in n trades and the net flow F = 2K - n, in the given state."""
    a = (1 + m) / 2 if state == 1 else (1 - m) / 2
    la, lb = math.log(a), math.log(1 - a)
    return [(math.exp(_lbinom(n, k) + k * la + (n - k) * lb), 2 * k - n) for k in range(n + 1)]


def _ll(p, s):
    p = min(max(p, 1e-300), 1 - 1e-16)
    return -math.log(p if s == 1 else 1 - p)


def log_loss_expected(n, m, price_fn, p0=0.5):
    """expected log loss of price_fn(F) after n trades, exact over state ~ Bernoulli(p0) and flow."""
    tot = 0.0
    for s, w in ((1, p0), (0, 1 - p0)):
        tot += w * sum(pr * _ll(price_fn(F), s) for pr, F in flow_pmf(n, m, s))
    return tot


def excess_log_loss(n, m, b, p0=0.5):
    """expected log-loss regret of an LMSR with liquidity b against the GM/Bayes price (true m)."""
    return (log_loss_expected(n, m, lambda F: lmsr_price(F, b, p0), p0)
            - log_loss_expected(n, m, lambda F: gm_price(F, m, p0), p0))


def lmsr_mm_pnl(n, m, b, state):
    """exact expected market-maker profit of an LMSR with liquidity b over n trades, given the state.
    A sell of one yes share is a purchase of one no share; the maker pays qy if s=1 else qn."""
    tot = 0.0
    a = (1 + m) / 2 if state == 1 else (1 - m) / 2
    for k in range(n + 1):
        pr = math.exp(_lbinom(n, k) + k * math.log(a) + (n - k) * math.log(1 - a)) if 0 < a < 1 else float(k == n * (a == 1))
        B, S = k, n - k
        revenue = lmsr_cost(B, S, b) - lmsr_cost(0, 0, b)
        tot += pr * (revenue - (B if state == 1 else S))
    return tot


def gm_mm_pnl(n, m, state, p0=0.5):
    """exact expected profit of the competitive GM maker (ask = P(s=1|buy,h), bid = P(s=1|sell,h))
    over n trades, given the state; DP over the net flow."""
    k = flow_slope(m)
    a = (1 + m) / 2 if state == 1 else (1 - m) / 2
    dist = {0: 1.0}
    pnl = 0.0
    y = 1.0 if state == 1 else 0.0
    for _ in range(n):
        nxt = {}
        for F, pr in dist.items():
            ask = sigmoid(logit(p0) + k * F + k)
            bid = sigmoid(logit(p0) + k * F - k)
            pnl += pr * (a * (ask - y) + (1 - a) * (y - bid))
            nxt[F + 1] = nxt.get(F + 1, 0) + pr * a
            nxt[F - 1] = nxt.get(F - 1, 0) + pr * (1 - a)
        dist = nxt
    return pnl


def mixture_price(B, S, ms, weights, p0=0.5):
    """Bayes price when the flow parameter m is unknown, with prior `weights` on the grid `ms`."""
    l1 = sum(w * ((1 + m) / 2) ** B * ((1 - m) / 2) ** S for m, w in zip(ms, weights))
    l0 = sum(w * ((1 - m) / 2) ** B * ((1 + m) / 2) ** S for m, w in zip(ms, weights))
    return p0 * l1 / (p0 * l1 + (1 - p0) * l0)


def trades_to_confidence(m, target):
    """Wald-style approximation to the expected number of trades until the price reaches `target`
    in the true state: logit(target) / (k m), since the mean log-odds drift is k m per trade."""
    return logit(target) / (flow_slope(m) * m)
