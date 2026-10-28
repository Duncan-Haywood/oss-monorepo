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


def kth_inversion(s, y, k):
    """iota^(k): max over x of the k-th largest of max(0, log y[z] - log y[x]) over z != x with s[z] <= s[x] (0 if fewer than k
    such z). A cut keeping k points loses x only if all k survivors lie in that set, and the best of any k of them is at most
    the k-th largest, so the cut costs at most iota^(k) (milestone 37). iota^(1) = iota; it is non-increasing in k."""
    ly = [math.log(v) for v in y]
    best = 0.0
    for x in range(len(s)):
        vals = sorted((max(0.0, ly[z] - ly[x]) for z in range(len(s)) if z != x and s[z] <= s[x]), reverse=True)
        if len(vals) >= k:
            best = max(best, vals[k - 1])
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


def pair_value(si, sj, yi, yj):
    """Inversion of one pair: how much worse than the other the candidate that the rung ranks at or ahead is (0 if none)."""
    v = 0.0
    if si <= sj:
        v = max(v, math.log(yi) - math.log(yj))
    if sj <= si:
        v = max(v, math.log(yj) - math.log(yi))
    return v


def pair_values(s, y):
    """pair_value for every unordered pair of the pool."""
    n = len(s)
    return [pair_value(s[i], s[j], y[i], y[j]) for i in range(n) for j in range(i + 1, n)]


def pilot_quantile(s, y, idx):
    """Largest pair value over disjoint pairs of the pilot indices idx (len(idx) // 2 pairs, in the order given)."""
    return max(pair_value(s[idx[2 * k]], s[idx[2 * k + 1]], y[idx[2 * k]], y[idx[2 * k + 1]]) for k in range(len(idx) // 2))


def pairs_needed(alpha, delta):
    """Smallest n with 1 - (1 - alpha)^n >= 1 - delta: disjoint pilot pairs for an alpha-exceedance bound w.p. 1 - delta."""
    return math.ceil(math.log(delta) / math.log(1 - alpha) - 1e-12)


def pilot_top_inversion(s, y, idx, top=3):
    """Largest log y[b] - log y[a] (clipped at 0) over the `top` best pilot points a (lowest y among idx) and every other
    pilot point b the rung ranks at or ahead of a: how badly the rung lets a worse point outrank a good one, seen from the pilot."""
    best = sorted(idx, key=lambda i: y[i])[:top]
    v = 0.0
    for a in best:
        for b in idx:
            if b != a and s[b] <= s[a]:
                v = max(v, math.log(y[b]) - math.log(y[a]))
    return v
