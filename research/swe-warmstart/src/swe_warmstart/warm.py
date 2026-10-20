"""Cheap-prior starts for the track-allocation policies.

swe-allocate's greedy and Thompson policies pull every track twice before they exploit. On the
observed history those first pulls were large, early projects and cost the smart policies the
5,000-line budget (swe-decay). Here the forced exploration is replaced by one pull per track, or
by a shrinkage estimate that needs none: each track's value per line is pooled with the
all-tracks ratio seen so far, weighted by a prior of K pseudo-lines.
"""
import os, sys
_D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_D, "..", "..", "..", "swe-decay", "src"))
sys.path.insert(0, os.path.join(_D, "..", "..", "..", "swe-bootstrap", "src"))
from swe_bootstrap.boot import *  # noqa: F401,F403
from swe_bootstrap.boot import Greedy, Thompson
from swe_decay.seq import mean_ci  # noqa: F401


def _forced(cls, k):
    class Forced(cls):
        name = f"{cls.name}-{k}pull"
        def choose(self, t):
            for a in self.arms:
                if self.n[a] < k: return a
            return self._exploit(t)
    return Forced


class _Greedy1(Greedy):
    def _exploit(self, t): return max(self.arms, key=lambda a: self.v[a] / self.c[a])

class _Thompson1(Thompson):
    def _exploit(self, t):
        best, bs = None, -1.0
        for a in self.arms:
            s = [self.rng.choice(self.obs[a]) for _ in range(len(self.obs[a]))]
            r = sum(x[0] for x in s) / sum(x[1] for x in s)
            if r > bs: best, bs = a, r
        return best

Greedy1 = _forced(_Greedy1, 1)
Thompson1 = _forced(_Thompson1, 1)


def shrink_greedy(prior_lines):
    """No forced pulls. Index = (V_a + K r) / (C_a + K), r = pooled value per line so far.
    Before any pull r is undefined and the first arm is drawn at random; an unpulled arm's index is r,
    so it is tried once the pulled arms fall below the pool."""
    class ShrinkGreedy:
        name = f"shrink-{prior_lines:g}"
        def __init__(self, arms, rng):
            self.arms, self.rng = arms, rng
            self.v = {a: 0.0 for a in arms}; self.c = {a: 0.0 for a in arms}
        def update(self, arm, v, c): self.v[arm] += v; self.c[arm] += c
        def choose(self, t):
            tv = sum(self.v.values()); tc = sum(self.c.values())
            if tc == 0: return self.rng.choice(self.arms)
            r = tv / tc
            idx = {a: (self.v[a] + prior_lines * r) / (self.c[a] + prior_lines) for a in self.arms}
            top = max(idx.values())
            return self.rng.choice([a for a in self.arms if idx[a] >= top - 1e-12])
    return ShrinkGreedy
