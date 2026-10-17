"""Position rent in a sequential LMSR verification market.

Binary state y, uniform prior.  Trader k holds a private signal s_k equal to y with probability a_k (conditionally
independent), and trades once, in order, moving an LMSR (liquidity b, log score) to its Bayesian posterior.  Trader k's
realised profit is b[ln p_k(y) - ln p_{k-1}(y)], so in expectation

    rent_k = b (H(y | s_<k) - H(y | s_<=k)) = b I(y; s_k | s_<k)            (conditional mutual information)

and the rents telescope: sum_k rent_k = b I(y; s_1..n) <= b ln 2, the market maker's *expected* loss (its worst case
is b ln 2 for any trade sequence).  The identity holds for any order, so ordering only redistributes a fixed total.
"""
import math, random
from itertools import product

__all__ = ["entropy_after", "rents", "rents_iid", "chern", "accuracy", "entry_count", "b_for_size",
           "simulate_lmsr", "pair_premium", "order_shares"]


def _post(prior_logit, s, a):
    lam = math.log(a / (1 - a))
    return prior_logit + (lam if s else -lam)


def entropy_after(accs):
    """H(y | s_1..s_n) in nats, by exact enumeration of the 2^n signal vectors (y=1 wlog by symmetry)."""
    n = len(accs)
    H = 0.0
    for s in product((1, 0), repeat=n):
        pr, L = 1.0, 0.0
        for si, a in zip(s, accs):
            pr *= a if si else 1 - a
            L = _post(L, si, a)
        H += pr * math.log1p(math.exp(-L))      # -ln sigmoid(L)
    return H


def rents(accs, b=1.0):
    """Expected LMSR profit of each trader (in arrival order) for heterogeneous accuracies; exact."""
    Hs = [math.log(2)] + [entropy_after(accs[:k]) for k in range(1, len(accs) + 1)]
    return [b * (Hs[k] - Hs[k + 1]) for k in range(len(accs))]


def rents_iid(a, n, b=1.0):
    """Same for n iid traders, O(n^2) via the binomial count of 'for' signals."""
    lam = math.log(a / (1 - a))
    Hs = [math.log(2)]
    for k in range(1, n + 1):
        H = 0.0
        for j in range(k + 1):
            pr = math.comb(k, j) * a ** j * (1 - a) ** (k - j)
            H += pr * math.log1p(math.exp(-(2 * j - k) * lam))
        Hs.append(H)
    return [b * (Hs[k] - Hs[k + 1]) for k in range(n)]


def chern(a):
    """Chernoff information of the signal, -ln(2 sqrt(a(1-a))): exponential rate at which rents die."""
    return -math.log(2 * math.sqrt(a * (1 - a)))


def accuracy(a, n):
    """P(market's final price favours the truth), ties counted 1/2."""
    tot = 0.0
    for j in range(n + 1):
        pr = math.comb(n, j) * a ** j * (1 - a) ** (n - j)
        tot += pr if 2 * j > n else (0.5 * pr if 2 * j == n else 0.0)
    return tot


def entry_count(a, b, c, nmax=400):
    """Largest n such that trader n still covers cost c (rents are followed in arrival order; stop at first shortfall)."""
    r = rents_iid(a, nmax, b)
    n = 0
    for x in r:
        if x < c:
            break
        n += 1
    return n


def b_for_size(a, n, c):
    """Smallest liquidity that makes the n-th trader break even: c / rent_n(b=1)."""
    return c / rents_iid(a, n)[-1]


def simulate_lmsr(accs, b, trials, seed=0):
    """Play the market with an explicit LMSR cost function and Bayesian traders; returns mean profit per position and
    mean market-maker loss.  Trader buys the shares that move the price to its posterior."""
    rng = random.Random(seed)
    n = len(accs)
    prof = [0.0] * n
    mm = 0.0
    for _ in range(trials):
        y = rng.random() < 0.5
        q = [0.0, 0.0]                              # shares of outcome 0,1
        cost = lambda q: b * math.log(math.exp(q[0] / b) + math.exp(q[1] / b))
        L = 0.0
        for k, a in enumerate(accs):
            s = (y if rng.random() < a else not y)
            L = _post(L, s, a)
            target_q1 = q[0] + b * L               # price p1 = sigma((q1-q0)/b)
            new = [q[0], target_q1]
            pay = cost(new) - cost(q)
            payoff = (new[1] - q[1]) if y else 0.0
            prof[k] += payoff - pay
            q = new
        mm += cost(q) - cost([0.0, 0.0]) - (q[1] if y else q[0])
    return [p / trials for p in prof], mm / trials


def pair_premium(a1, a2, b=1.0):
    """Rent of trader 1 (accuracy a1) when first vs second behind a2; and the two orderings' totals (equal)."""
    first = rents([a1, a2], b)[0]
    second = rents([a2, a1], b)[1]
    return first, second


def order_shares(accs, b=1.0):
    """Rent share of the most accurate trader under best-first and worst-first ordering."""
    hi = max(accs)
    best = sorted(accs, reverse=True)
    worst = sorted(accs)
    rb, rw = rents(best, b), rents(worst, b)
    return rb[0] / sum(rb), rw[-1] / sum(rw), sum(rb), sum(rw)
