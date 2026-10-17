"""Continual private counting (Chan-Shi-Song / Dwork et al. binary mechanism).

A stream x_1..x_T with |x_t| <= 1 is summed; after every step we release a noisy
running sum. Each x_t enters at most L = floor(log2 T)+1 dyadic-tree nodes, each
node gets independent Laplace(L*delta/eps) noise (delta = max change of one x_t,
2 for replacement of a trade in [-1,1]), so the whole released sequence is
eps-DP w.r.t. replacing one trader's trade. The running sum at t uses popcount(t)
nodes, so the error is O(L^{1.5} delta / eps) rather than O(T delta / eps) for
independent per-release noise (NaiveCounter).
"""
import math
import random


def tree_levels(T):
    return int(math.floor(math.log2(T))) + 1


def nodes_touched(t, T):
    """Dyadic nodes (level, index) containing step t (1-indexed)."""
    return [(lv, (t - 1) >> lv) for lv in range(tree_levels(T))
            if ((t - 1) >> lv) << lv < T]


def laplace(rng, scale):
    u = rng.random() - 0.5
    return -scale * math.copysign(1.0, u) * math.log(1 - 2 * abs(u))


class TreeCounter:
    def __init__(self, T, eps, delta=2.0, seed=0):
        self.T, self.eps, self.delta = T, eps, delta
        self.L = tree_levels(T)
        self.scale = 0.0 if math.isinf(eps) else self.L * delta / eps
        self.rng = random.Random(seed)
        self.t = 0
        self.alpha = {}   # exact partial sums of open nodes, keyed by level
        self.noisy = {}   # noisy partial sums
        self.cur = {}     # level -> noisy sum of the currently completed node

    def push(self, x):
        """Add x_t, return the noisy prefix sum s_t."""
        self.t += 1
        t = self.t
        i = (t & -t).bit_length() - 1            # lowest set bit: node completed
        total = x + sum(self.alpha.get(j, 0.0) for j in range(i))
        for j in range(i):
            self.alpha.pop(j, None); self.noisy.pop(j, None)
        self.alpha[i] = total
        self.noisy[i] = total + (laplace(self.rng, self.scale) if self.scale else 0.0)
        return sum(self.noisy[j] for j in range(self.L) if (t >> j) & 1)


class NaiveCounter:
    """Fresh Laplace noise on each release; eps-DP needs scale T*delta/eps (composition)."""
    def __init__(self, T, eps, delta=2.0, seed=0):
        self.scale = 0.0 if math.isinf(eps) else T * delta / eps
        self.rng = random.Random(seed)
        self.s = 0.0

    def push(self, x):
        self.s += x
        return self.s + (laplace(self.rng, self.scale) if self.scale else 0.0)
