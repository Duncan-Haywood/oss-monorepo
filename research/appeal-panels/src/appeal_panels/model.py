"""Escalating appeal panels (Kleros / optimistic-dispute style) with fee-priced appeals.

Setup.  A dispute has a true verdict.  Tier k (k = 1..K) is a panel of n_k jurors (n_k odd), each independently correct with
probability a > 1/2, so tier k is correct with probability M_k = P(Bin(n_k, a) > n_k/2).  The loser of tier k may appeal to tier
k+1 (k < K) by paying the up-front, non-refundable fee f_{k+1} = j n_{k+1}; the winner of the last held tier gets prize V.
Appeals are decided myopically: a side appeals iff (its chance of winning tier k+1) * V > f_{k+1}.  The truth side wins tier
k+1 w.p. q = M_{k+1}, the wrong side w.p. 1 - q, so for each appeal tier the fee sits in one of three regimes:
    f <  V (1-q)        both sides appeal        -> appeals are wasted, tier K alone decides (accuracy M_K)
    V (1-q) <= f < V q  only the truth side does -> error is the product  prod_k (1 - M_k)  over tiers reached
    f >= V q            nobody appeals           -> tier 1 decides
The efficient window  V(1-q) <= j n < V q  is non-empty for n in a band because 1-q falls exponentially in n and j n is linear.
Shared bias (rho): with probability rho the whole jury pool is one common draw -- every tier returns the same verdict, correct
w.p. a -- so no number of tiers pushes accuracy above  rho a + (1-rho)(1 - prod (1-M_k)).  Appellants do not observe the state
and price appeals at the marginal q_k = rho a + (1-rho) M_k.
"""
import math, random

__all__ = ["maj", "tier_q", "policy", "regime", "evaluate", "simulate", "error_product", "window", "min_deterring_size",
           "single_panel_size", "wasteful_accuracy"]


def maj(n, a):
    """P(Bin(n, a) > n/2), exact."""
    return sum(math.comb(n, i) * a ** i * (1 - a) ** (n - i) for i in range(n // 2 + 1, n + 1))


def tier_q(n, a, rho=0.0):
    """Marginal probability a tier-n panel is correct as seen by appellants (rho = shared-bias mass)."""
    return rho * a + (1 - rho) * maj(n, a)


def regime(f, V, q):
    """'both' | 'truth' | 'none': who appeals at fee f when the appeal wins for the truth side w.p. q."""
    if f < V * (1 - q):
        return "both"
    if f < V * q:
        return "truth"
    return "none"


def policy(ns, a, V, j, rho=0.0):
    """Appeal decisions by tier (index k = tier k+1): truth_appeals[k], wrong_appeals[k]; entry 0 is unused (tier 1 always held)."""
    T, W = [False], [False]
    for n in ns[1:]:
        r = regime(j * n, V, tier_q(n, a, rho))
        T.append(r in ("both", "truth")); W.append(r == "both")
    return T, W


def evaluate(ns, a, V, j, rho=0.0, truth_appeals=None, wrong_appeals=None):
    """Exact (accuracy, expected juror seats, expected number of tiers held, expected number of appeals by the wrong side).
    Independent-state mixture weight 1-rho, shared-state weight rho; appeal rules default to the myopic policy."""
    K = len(ns)
    if truth_appeals is None:
        truth_appeals, wrong_appeals = policy(ns, a, V, j, rho)
    M = [maj(n, a) for n in ns]
    # independent state: chain over (tier, ruling correct?)
    acc = cost = tiers = wapp = 0.0
    pc, pw = M[0], 1 - M[0]                       # mass currently holding a correct / wrong ruling at tier 1
    cost += ns[0]; tiers += 1
    for k in range(K):
        nc = nw = 0.0
        stop_c, stop_w = pc, pw
        if k + 1 < K:
            if wrong_appeals[k + 1]:
                nc += pc * M[k + 1]; nw += pc * (1 - M[k + 1]); stop_c = 0.0; wapp += pc
            if truth_appeals[k + 1]:
                nc += pw * M[k + 1]; nw += pw * (1 - M[k + 1]); stop_w = 0.0
            m = nc + nw
            cost += ns[k + 1] * m; tiers += m
        acc += stop_c
        pc, pw = nc, nw
    ind = (acc, cost, tiers, wapp)
    if not rho:
        return ind
    # shared state: same verdict at every tier; appeals burn fees but cannot flip it
    def shared(correct):
        c, t, k = float(ns[0]), 1.0, 0
        ap = truth_appeals if not correct else wrong_appeals
        while k + 1 < K and ap[k + 1]:
            k += 1; c += ns[k]; t += 1
        return c, t
    (cc, ct), (wc, wt) = shared(True), shared(False)
    sh_cost = a * cc + (1 - a) * wc
    sh_tiers = a * ct + (1 - a) * wt
    sh_wapp = a * (ct - 1)
    return (rho * a + (1 - rho) * ind[0], rho * sh_cost + (1 - rho) * ind[1], rho * sh_tiers + (1 - rho) * ind[2],
            rho * sh_wapp + (1 - rho) * ind[3])


def simulate(ns, a, V, j, rho=0.0, trials=100000, seed=0, truth_appeals=None, wrong_appeals=None):
    """Monte Carlo of the same game with actual juror draws.  Returns (accuracy, mean juror seats, mean tiers)."""
    rng = random.Random(seed)
    K = len(ns)
    if truth_appeals is None:
        truth_appeals, wrong_appeals = policy(ns, a, V, j, rho)
    ok = cs = tt = 0
    for _ in range(trials):
        shared = rng.random() < rho
        sv = rng.random() < a
        def verdict(n):
            return sv if shared else sum(rng.random() < a for _ in range(n)) > n // 2
        k = 0; c = verdict(ns[0]); cs += ns[0]; tt += 1
        while k + 1 < K and (wrong_appeals[k + 1] if c else truth_appeals[k + 1]):
            k += 1; c = verdict(ns[k]); cs += ns[k]; tt += 1
        ok += c
    return ok / trials, cs / trials, tt / trials


def error_product(ns, a):
    """Efficient-window error: prod_k (1 - M_k) (truth appeals every loss, wrong side never appeals)."""
    p = 1.0
    for n in ns:
        p *= 1 - maj(n, a)
    return p


def wasteful_accuracy(ns, a):
    """If both sides always appeal, the last tier decides alone."""
    return maj(ns[-1], a)


def window(n, a, V, j):
    """Is the efficient fee window open at panel size n?  Returns (lower, fee, upper) = (V(1-q), j n, V q)."""
    q = maj(n, a)
    return V * (1 - q), j * n, V * q


def min_deterring_size(a, V, j, rho=0.0, nmax=999):
    """Smallest odd n with j n >= V (1 - q_n): the wrong side is deterred from appealing to a size-n tier."""
    for n in range(1, nmax + 1, 2):
        if j * n >= V * (1 - tier_q(n, a, rho)):
            return n
    return None


def single_panel_size(cost, j):
    """Largest odd panel a one-shot court can afford with the given expected budget."""
    n = int(cost / j)
    return n if n % 2 else n - 1
