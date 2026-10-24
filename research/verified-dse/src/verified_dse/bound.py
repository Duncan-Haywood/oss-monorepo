"""Largest rung inversion and the successive-halving regret bound it gives (milestone 6)."""
import math
import random


def inversion(s, y):
    """iota = max over pairs with s[i] <= s[j] of log y[i] - log y[j], clipped at 0 (i is ranked no worse than j
    but is truly worse). One scan in rung order, O(n log n): carry the largest log y seen so far."""
    n = len(s)
    ly = [math.log(v) for v in y]
    order = sorted(range(n), key=lambda i: s[i])
    best, run_max, i = 0.0, -math.inf, 0
    while i < n:
        j = i
        while j + 1 < n and s[order[j + 1]] == s[order[i]]:
            j += 1
        group = order[i:j + 1]
        # a tie group counts as ranked level, so each member pairs with every member of the group and all before it
        run_max = max([run_max] + [ly[g] for g in group])
        best = max(best, run_max - min(ly[g] for g in group))
        i = j + 1
    return best


def halve(scores, y, keep, rng):
    """Successive halving: scores is a list of per-rung score lists (cut rungs), keep the survivor counts after each cut.
    Ties are broken at random. Returns the best y among the final survivors."""
    alive = list(range(len(y)))
    for s, k in zip(scores, keep):
        alive.sort(key=lambda i: (s[i], rng.random()))
        alive = alive[:k]
    return min(y[i] for i in alive)


def bound(iotas):
    """Regret bound in log units: the sum of the inversions of the cut rungs."""
    return sum(iotas)
