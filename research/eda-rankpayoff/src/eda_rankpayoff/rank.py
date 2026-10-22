"""Rank agreement of a cheap rung with the truth versus its payoff as a top-k screen. Stdlib only.

A screen is a list of cheap scores (lower is better), one per design; the truth is a list of expensive scores.
"""
import math
import random


def ranks(x):
    """Average ranks (1-based), ties share the mean rank."""
    order = sorted(range(len(x)), key=lambda i: x[i])
    r = [0.0] * len(x)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and x[order[j + 1]] == x[order[i]]:
            j += 1
        for t in range(i, j + 1):
            r[order[t]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    sa = math.sqrt(sum((v - ma) ** 2 for v in a))
    sb = math.sqrt(sum((v - mb) ** 2 for v in b))
    return sum((u - ma) * (v - mb) for u, v in zip(a, b)) / (sa * sb)


def spearman(a, b):
    return pearson(ranks(a), ranks(b))


def kendall(a, b):
    """Kendall tau-b."""
    n = len(a)
    c = d = ta = tb = 0
    for i in range(n):
        for j in range(i + 1, n):
            da, db = a[i] - a[j], b[i] - b[j]
            if da == 0 and db == 0:
                continue
            if da == 0:
                ta += 1
            elif db == 0:
                tb += 1
            elif (da > 0) == (db > 0):
                c += 1
            else:
                d += 1
    return (c - d) / math.sqrt((c + d + ta) * (c + d + tb))


def top_overlap(screen, truth, m):
    """Share of the truth's best m designs that are also in the screen's best m."""
    s = sorted(range(len(screen)), key=lambda i: (screen[i], i))[:m]
    t = sorted(range(len(truth)), key=lambda i: (truth[i], i))[:m]
    return len(set(s) & set(t)) / m


def best_rank(screen, truth):
    """1-based position of the truly best design in the screen's order (ties by index)."""
    best = min(range(len(truth)), key=lambda i: (truth[i], i))
    return sorted(range(len(screen)), key=lambda i: (screen[i], i)).index(best) + 1


def capture(screen, truth, n0, k, trials, seed=0):
    """Over random pools of n0 designs: P(the pool's truly best design is among the screen's top k), and the
    mean ratio of the best true value among those k to the pool's true best (1 is perfect)."""
    rng = random.Random(seed)
    hit, ratio = 0, 0.0
    for _ in range(trials):
        pool = rng.sample(range(len(truth)), n0)
        tbest = min(truth[i] for i in pool)
        top = sorted(pool, key=lambda i: (screen[i], i))[:k]
        got = min(truth[i] for i in top)
        hit += got == tbest
        ratio += got / tbest
    return hit / trials, ratio / trials
