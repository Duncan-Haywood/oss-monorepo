"""Constant-product market makers (Gnosis FPMM / Uniswap-style) as cost-function prediction markets.

Setup.  n outcomes.  The pool holds reserves r_i of outcome-i tokens and keeps the product invariant  prod_i r_i = C0^n.
A trader who has bought q_i net outcome-i shares (q_i < 0 = sold back) has, in aggregate, put collateral C(q) - C0 into the pool
(each unit of collateral mints one token of every outcome, so r_i = C - q_i).  Hence the cost function C(q) is defined implicitly by
    prod_i (C - q_i) = C0^n ,      C > max_i q_i .
Differentiating the log:  dC/dq_i = (1/r_i) / sum_j (1/r_j)  -- a price vector on the simplex, so this is an ordinary cost-function
market (Abernethy-Chen-Vaughan) and the AMM <-> prediction-market dictionary of Frongillo-Papireddygari-Waggoner applies.
Facts used and tested here:
  * worst-case maker loss  sup_q [ q_o - (C(q)-C0) ] = C0  (never attained);
  * a trader who believes pi and moves the price to pi pays  C0((prod pi)^(1/n)/min pi - 1)  and earns exactly
        C0 (1 - n * geometric_mean(pi))          (LMSR at equal worst-case loss: C0 (1 - H(pi)/ln n));
  * lagging outcomes' prices fall polynomially, (C0/gap)^n, not exponentially as in LMSR (Hedge).
"""
import math, random

__all__ = ["solve_C", "cost", "prices", "reserves", "informed_profit", "informed_cost", "lmsr_informed_profit", "lmsr_cost",
           "lmsr_prices", "binary_cost_to_price", "binary_shares_to_price", "worst_case_loss", "router", "routing_regret",
           "regret_decomposition", "laggard_price"]


def solve_C(q, C0):
    """Root of sum_i ln(C - q_i) = n ln C0 on (max q, max q + C0]  (bisection; the sum is increasing in C)."""
    n = len(q); lo, hi = max(q), max(q) + C0
    target = n * math.log(C0)
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if mid <= lo or mid >= hi:
            break
        if sum(math.log(mid - x) for x in q) < target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def cost(q, C0):
    """Net collateral C(q) - C0 the pool has received; cost(0) = 0."""
    return solve_C(q, C0) - C0


def reserves(q, C0):
    C = solve_C(q, C0)
    return [C - x for x in q]


def prices(q, C0):
    inv = [1.0 / r for r in reserves(q, C0)]
    s = sum(inv)
    return [x / s for x in inv]


def laggard_price(gap, n, C0):
    """Price of an outcome trailing n-1 ... symmetric 'one leader, n-1 tied laggards at distance gap' state, computed exactly."""
    q = [0.0] + [-gap] * (n - 1)
    return prices(q, C0)[1]


def worst_case_loss(q, C0, o):
    """Maker's loss when outcome o occurs: shares paid out minus collateral received."""
    return q[o] - cost(q, C0)


def informed_cost(pi, C0):
    """Cost of buying (no selling, min q = 0) the bundle that moves the price vector to pi."""
    n = len(pi); gm = math.prod(pi) ** (1.0 / n)
    return C0 * (gm / min(pi) - 1.0)


def informed_profit(pi, C0):
    """Expected profit under belief pi of the trader who moves prices to pi:  C0 (1 - n GM(pi))."""
    n = len(pi)
    return C0 * (1.0 - n * math.prod(pi) ** (1.0 / n))


def lmsr_informed_profit(pi, b):
    """b KL(pi || uniform) = b (ln n - H(pi))."""
    n = len(pi)
    return b * (math.log(n) - (-sum(p * math.log(p) for p in pi if p > 0)))


def lmsr_cost(q, b):
    m = max(q)
    return b * (m / b + math.log(sum(math.exp((x - m) / b) for x in q))) - b * math.log(len(q))


def lmsr_prices(q, b):
    m = max(q); e = [math.exp((x - m) / b) for x in q]; s = sum(e)
    return [x / s for x in e]


def binary_cost_to_price(p, C0):
    """Cost to move a fresh binary FPMM from 1/2 to p (buying YES): C0 (sqrt(p/(1-p)) - 1)."""
    return C0 * (math.sqrt(p / (1 - p)) - 1.0)


def binary_shares_to_price(p, C0):
    """YES shares bought to move a fresh binary FPMM to p: C0 (2p-1)/sqrt(p(1-p))."""
    return C0 * (2 * p - 1) / math.sqrt(p * (1 - p))


def router(kind, n, scale):
    """Return f(q) -> price vector for an expert router.  kind 'cfmm' (scale = C0) or 'lmsr' (scale = b)."""
    if kind == "cfmm":
        return lambda q: prices(q, scale)
    return lambda q: lmsr_prices(q, scale)


def routing_regret(kind, scale, gains, mu=None):
    """Run the router on a gain sequence g_t in [0,1]^n (q += g_t, price read before the update).
    Returns (learner reward sum p_{t-1}.g_t, best fixed expert's total gain, per-round prices)."""
    n = len(gains[0]); q = [0.0] * n; f = router(kind, n, scale)
    got = 0.0; hist = []
    for g in gains:
        p = f(q); hist.append(p)
        got += sum(pi * gi for pi, gi in zip(p, g))
        q = [x + gi for x, gi in zip(q, g)]
    Q = [sum(g[i] for g in gains) for i in range(n)]
    return got, max(Q), hist


def regret_decomposition(gains, C0):
    """Exact identity for the CFMM router:  regret_i = [Q_i - (C(q_T)-C(0))] + sum_t D_t  with D_t the Bregman terms of C.
    Returns (regret vs best expert, settlement term for the best expert (<= C0), sum of Bregman terms)."""
    n = len(gains[0]); q = [0.0] * n; Cq = 0.0; sumD = 0.0; got = 0.0
    for g in gains:
        p = prices(q, C0); q2 = [x + gi for x, gi in zip(q, g)]; C2 = cost(q2, C0)
        got += sum(pi * gi for pi, gi in zip(p, g))
        sumD += C2 - Cq - sum(pi * gi for pi, gi in zip(p, g))
        q, Cq = q2, C2
    i = max(range(n), key=lambda k: q[k])
    return q[i] - got, q[i] - Cq, sumD
