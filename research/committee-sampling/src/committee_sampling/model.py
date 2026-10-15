"""Random verifier committees drawn from a pool of N nodes of which B are Byzantine (colluding, always vote wrong).

A committee of m distinct members is drawn uniformly without replacement (hypergeometric); with replacement or
stake-weighted draws it is binomial(m, s) with s the Byzantine share of the sampling weight.  An honest member votes
right.  A threshold-t rule accepts a claim iff at least t members vote for it.  Safety fails if a wrong claim is
accepted (Byzantine count >= t); liveness fails if the right claim cannot reach t (Byzantine count > m - t).
"""
import math

__all__ = ["hyper_pmf", "hyper_tail", "binom_tail", "kl_half", "hoeffding", "chernoff_size", "min_committee",
           "safety_liveness", "best_threshold", "stake_share", "adaptive_cost", "optimal_size"]


def hyper_pmf(N, B, m, k):
    if k < 0 or k > m or k > B or m - k > N - B:
        return 0.0
    return math.comb(B, k) * math.comb(N - B, m - k) / math.comb(N, m)


def hyper_tail(N, B, m, t):
    """P(Byzantine count in the committee >= t), sampling without replacement."""
    return sum(hyper_pmf(N, B, m, k) for k in range(max(t, 0), min(m, B) + 1))


def binom_tail(m, s, t):
    """P(Binomial(m, s) >= t): with replacement, or stake-weighted draws with Byzantine stake share s."""
    if t <= 0:
        return 1.0
    if s <= 0:
        return 0.0
    if s >= 1:
        return 1.0
    ls, l1 = math.log(s), math.log1p(-s)     # log-space: comb(m, k) overflows a float for m in the thousands
    return sum(math.exp(math.lgamma(m + 1) - math.lgamma(k + 1) - math.lgamma(m - k + 1) + k * ls + (m - k) * l1)
               for k in range(t, m + 1))


def kl_half(s):
    """KL(1/2 || s) in nats: the Chernoff exponent of a majority of Byzantine members."""
    return 0.5 * math.log(0.5 / s) + 0.5 * math.log(0.5 / (1 - s))


def hoeffding(m, s):
    return math.exp(-2 * m * (0.5 - s) ** 2)


def chernoff_size(s, eps):
    """m ~ ln(1/eps)/KL(1/2||s): first-order committee size for majority failure eps (ignores the polynomial factor)."""
    return math.log(1 / eps) / kl_half(s)


def min_committee(N, B, eps, rule="majority", replace=False, mmax=None):
    """smallest odd m whose majority-capture probability is <= eps (m <= N if drawn without replacement)."""
    mmax = mmax or (N if not replace else 100000)
    for m in range(1, mmax + 1, 2):
        t = m // 2 + 1
        p = binom_tail(m, B / N, t) if replace else hyper_tail(N, B, m, t)
        if p <= eps:
            return m
    return None


def safety_liveness(N, B, m, t):
    """(P safety fails, P liveness fails) for a threshold-t rule on a committee of m without replacement."""
    return hyper_tail(N, B, m, t), hyper_tail(N, B, m, m - t + 1)


def best_threshold(N, B, m, w=1.0):
    """threshold minimising  safety + w * liveness failure; returns (t, safety, liveness)."""
    best = None
    for t in range(1, m + 1):
        s, l = safety_liveness(N, B, m, t)
        c = s + w * l
        if best is None or c < best[0]:
            best = (c, t, s, l)
    return best[1], best[2], best[3]


def stake_share(n_adv, n_hon, kappa):
    """Byzantine share of stake when the adversary's n_adv nodes each hold kappa times an honest node's stake."""
    return n_adv * kappa / (n_adv * kappa + n_hon)


def adaptive_cost(m, price):
    """cost to bribe a majority of an already-chosen committee: price * (floor(m/2)+1); linear in m."""
    return price * (m // 2 + 1)


def optimal_size(s, per_member, loss, mmax=400):
    """committee size (odd) minimising m*per_member + loss*P(majority captured), binomial model."""
    best = None
    for m in range(1, mmax + 1, 2):
        c = m * per_member + loss * binom_tail(m, s, m // 2 + 1)
        if best is None or c < best[0]:
            best = (c, m)
    return best[1], best[0]
