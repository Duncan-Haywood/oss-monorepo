"""Sybil splitting and merging under stake-weighted reward pools, and in self-financed wagering."""
import math
import random

__all__ = ["share", "payoff", "best_k", "k_star_per_head", "deterrence_fee", "merge_gain",
           "wswm_coalition_net", "lottery_share_mc"]


def share(k, S, n, s, alpha):
    """Pool share of an attacker with total stake S split into k equal identities, against n honest
    identities of stake s, when identity i earns a fraction w_i^alpha / sum_j w_j^alpha."""
    mine = k * (S / k) ** alpha
    return mine / (mine + n * s ** alpha)


def payoff(k, R, c, S, n, s, alpha):
    return R * share(k, S, n, s, alpha) - c * k


def best_k(R, c, S, n, s, alpha, kmax=5000):
    """Integer k in [1, kmax] maximising the attacker's payoff (ties -> smaller k)."""
    best = max(range(1, kmax + 1), key=lambda k: (payoff(k, R, c, S, n, s, alpha), -k))
    return best, payoff(best, R, c, S, n, s, alpha)


def k_star_per_head(R, c, n):
    """alpha = 0 (one identity, one share): continuous optimum of R k/(k+n) - c k is sqrt(R n / c) - n."""
    return max(1.0, math.sqrt(R * n / c) - n)


def deterrence_fee(R, n):
    """alpha = 0: smallest per-identity cost that makes a second identity unprofitable.
    R(2/(n+2) - 1/(n+1)) = R n / ((n+1)(n+2)); payoff is concave in k, so this deters all splitting."""
    return R * n / ((n + 1) * (n + 2))


def merge_gain(m, s, rest, alpha):
    """Change in pooled share when m honest identities of stake s merge into one, others' weight = rest."""
    sep = m * s ** alpha
    return (m * s) ** alpha / ((m * s) ** alpha + rest) - sep / (sep + rest)


def _brier(q, y):
    return 1.0 - (y - q) ** 2  # score, higher is better


def wswm_coalition_net(p, wagers, reports, others_w, others_q, others_p):
    """Exact expected net payoff of a coalition in weighted-score wagering  w_i (S_i - Sbar_w).
    Outcome y~Bernoulli(p) is the coalition's belief; the others' expected scores use their own belief
    others_p (per identity).  Brier score.  Returns sum over coalition identities."""
    def es(q, pr):
        return pr * _brier(q, 1) + (1 - pr) * _brier(q, 0)
    W = sum(wagers) + sum(others_w)
    tot = sum(w * es(q, p) for w, q in zip(wagers, reports)) + sum(
        w * es(q, pr) for w, q, pr in zip(others_w, others_q, others_p))
    sbar = tot / W  # expectation of the weighted mean score (linear in scores)
    return sum(w * es(q, p) for w, q in zip(wagers, reports)) - sum(wagers) * sbar


def lottery_share_mc(k, S, n, s, alpha, trials=200000, seed=0):
    """Monte Carlo win frequency of a stake^alpha-weighted lottery for the attacker's k identities."""
    rng = random.Random(seed)
    mine, other = k * (S / k) ** alpha, n * s ** alpha
    return sum(rng.random() * (mine + other) < mine for _ in range(trials)) / trials
