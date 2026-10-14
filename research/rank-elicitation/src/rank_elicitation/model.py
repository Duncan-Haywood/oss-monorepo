"""Eliciting the ranking of K outcome classes by probability.

A report is a ranking sigma (sigma[y] = position of class y, 0 = top). With weights
1 = w_0 > w_1 > ... > w_{K-1} = 0 the loss is  1 - w[sigma[y]]  in [0, 1]; it is linear
in the outcome indicator, so the expected loss is 1 - <w o sigma, p> and, by the
rearrangement inequality, is minimised exactly by the true ranking of p.
"""
import itertools
import math

__all__ = ["equal_weights", "topk_weights", "geometric_weights", "true_ranking",
           "rank_loss", "exp_rank_loss", "rank_regret", "swap_regret", "swap_regret_brier",
           "max_rank_regret", "brute_max_regret", "swap_diff_stats", "swap_diff_stats_brier",
           "detection_n", "crossover_gap", "all_rankings"]


def equal_weights(K):
    return [1 - r / (K - 1) for r in range(K)]


def topk_weights(K, k):
    """indicator of the top-k set: elicits the set (order inside and outside is free)"""
    return [1.0] * k + [0.0] * (K - k)


def geometric_weights(K, q):
    """top-heavy weights normalised to [0,1]"""
    raw = [q ** r for r in range(K)]
    lo, hi = raw[-1], raw[0]
    return [(x - lo) / (hi - lo) for x in raw]


def true_ranking(p):
    order = sorted(range(len(p)), key=lambda y: -p[y])
    sigma = [0] * len(p)
    for pos, y in enumerate(order):
        sigma[y] = pos
    return sigma


def all_rankings(K):
    return [list(s) for s in itertools.permutations(range(K))]


def rank_loss(sigma, y, w):
    return 1 - w[sigma[y]]


def exp_rank_loss(sigma, p, w):
    return sum(py * rank_loss(sigma, y, w) for y, py in enumerate(p))


def rank_regret(sigma, p, w):
    return exp_rank_loss(sigma, p, w) - exp_rank_loss(true_ranking(p), p, w)


def swap_regret(p_i, p_j, w, r):
    """swap two classes holding adjacent true ranks r, r+1 (p_i >= p_j): (p_i-p_j)(w_r-w_{r+1})"""
    return (p_i - p_j) * (w[r] - w[r + 1])


def swap_regret_brier(p_i, p_j):
    """report the true probabilities with p_i and p_j exchanged: Brier regret 2 (p_i-p_j)^2"""
    return 2 * (p_i - p_j) ** 2


def max_rank_regret(p, w):
    """the reversed ranking is the worst report (rearrangement inequality)"""
    ps = sorted(p, reverse=True)
    K = len(p)
    return sum(ps[r] * (w[r] - w[K - 1 - r]) for r in range(K))


def brute_max_regret(p, w):
    return max(rank_regret(s, p, w) for s in all_rankings(len(p)))


def swap_diff_stats(p_i, p_j, dw):
    """per-task (swapped - honest) loss difference: +dw on class i, -dw on class j, else 0"""
    mean = (p_i - p_j) * dw
    var = (p_i + p_j) * dw ** 2 - mean ** 2
    return mean, var


def swap_diff_stats_brier(p_i, p_j):
    """same swap reported as probabilities under Brier: +-2(p_i-p_j) on classes i, j"""
    d = p_i - p_j
    return 2 * d * d, 4 * d * d * (p_i + p_j) - 4 * d ** 4


def detection_n(mean, var, z):
    return z * z * var / (mean * mean)


def crossover_gap(K):
    """linear (equal weights, range 1) beats Brier per unit range iff gap < 1/(K-1)"""
    return 1.0 / (K - 1)
