"""Procurement of k identical compute units from n devices with private costs c_i ~ U[0,1].

Mechanism M(k, r): accept the (up to) k lowest bids that are <= r; every winner is paid
min(r, (k+1)-th lowest bid overall).  This is dominant-strategy truthful (threshold payment).
Buyer values each unit at v.
"""
import math, random

def binom_pmf(n, j, p):
    return math.comb(n, j) * p ** j * (1 - p) ** (n - j)

def binom_cdf(n, j, p):
    return sum(binom_pmf(n, i, p) for i in range(0, min(j, n) + 1)) if j >= 0 else 0.0

def expected_winners(n, k, r):
    """E[min(k, N)], N ~ Bin(n, r) = number of devices with cost <= r."""
    return sum(min(k, j) * binom_pmf(n, j, r) for j in range(n + 1))

def expected_payment(n, k, r=1.0):
    """Exact expected total payment of M(k, r) under U[0,1] costs."""
    low = sum(j * r * binom_pmf(n, j, r) for j in range(0, k + 1))
    # E[c_(k+1); c_(k+1) <= r] = (k+1)/(n+1) * P(c_(k+2 of n+1) <= r) = (k+1)/(n+1) * P(Bin(n+1,r) >= k+2)
    tail = 1.0 - binom_cdf(n + 1, k + 1, r)
    return low + k * (k + 1) / (n + 1) * tail

def expected_cost(n, k, r=1.0):
    """Exact expected true cost of the winners: E[sum of k lowest costs <= r]."""
    # E[c_(i) 1{c_(i)<=r}] = i/(n+1) * P(Bin(n+1,r) >= i+1)
    return sum(i / (n + 1) * (1.0 - binom_cdf(n + 1, i, r)) for i in range(1, k + 1))

def buyer_utility(n, k, r, v):
    return v * expected_winners(n, k, r) - expected_payment(n, k, r)

def best_reserve(n, k, v, grid=2000):
    best = max(range(grid + 1), key=lambda i: buyer_utility(n, k, i / grid, v))
    return best / grid

def frugality(n, k):
    """E[payment] / E[cost of winners] with no reserve; exactly 2 for U[0,1]."""
    return expected_payment(n, k) / expected_cost(n, k)

def simulate(n, k, r, v, trials, seed=0):
    rng = random.Random(seed); pay = cost = win = 0.0
    for _ in range(trials):
        c = sorted(rng.random() for _ in range(n))
        w = [x for x in c[:k] if x <= r]
        price = min(r, c[k]) if n > k else r
        pay += price * len(w); cost += sum(w); win += len(w)
    return dict(payment=pay / trials, cost=cost / trials, winners=win / trials,
                utility=(v * win - pay) / trials)

# ---- first-price equilibrium (revenue equivalence) ----
def win_prob(n, k, x):
    """P(a device with cost x is selected without reserve): fewer than k of the other n-1 costs below x."""
    return binom_cdf(n - 1, k - 1, x)

def fp_bid(n, k, c, r=1.0, steps=2000):
    """b(c) = c + int_c^r W(x)dx / W(c); symmetric increasing equilibrium bid of the pay-as-bid auction."""
    if c >= r: return c
    h = (r - c) / steps
    s = sum(win_prob(n, k, c + (i + 0.5) * h) for i in range(steps)) * h
    return c + s / win_prob(n, k, c)

def fp_expected_payment(n, k, r=1.0, seed=0, trials=20000):
    rng = random.Random(seed); pay = 0.0
    for _ in range(trials):
        c = sorted(rng.random() for _ in range(n))
        pay += sum(fp_bid(n, k, x, r, 200) for x in c[:k] if x <= r)
    return pay / trials

def fp_deviation_gain(n, k, c, r=1.0, grid=400, seed=1, trials=4000):
    """Max over bids of the expected profit of a deviator with cost c, minus profit at equilibrium bid. ~0."""
    rng = random.Random(seed)
    others = [[fp_bid(n, k, rng.random(), r, 100) for _ in range(n - 1)] for _ in range(trials)]
    thr = sorted(sorted(o)[k - 1] for o in others)  # k-th lowest rival bid; deviator wins iff bid < it
    def profit(b):
        import bisect
        return (b - c) * (1 - bisect.bisect_right(thr, b) / trials) if b <= r * 2 else 0.0
    eq = profit(fp_bid(n, k, c, r, 400))
    top = max(profit(c + (fp_bid(n, k, 0.0, r, 400) + 1) * i / grid) for i in range(grid + 1))
    return top - eq
