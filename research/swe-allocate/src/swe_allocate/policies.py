"""Track-allocation policies replayed offline on a bootstrap environment.

An arm is a track. Pulling an arm runs one project: a (value, cost) pair drawn with
replacement from that track's committed projects. A policy picks arms until the cost
budget is spent; the score is total value. Costs are lines added (a weak proxy for tokens).
"""
import random

def make_env(pools):
    """pools: {arm: [(value, cost), ...]}. Returns a pull(arm, rng) function."""
    def pull(arm, rng):
        return rng.choice(pools[arm])
    return pull

class Uniform:
    name = "uniform"
    def __init__(self, arms, rng): self.arms, self.rng = arms, rng
    def choose(self, t): return self.rng.choice(self.arms)
    def update(self, arm, v, c): pass

class _Stats:
    def __init__(self, arms):
        self.n = {a: 0 for a in arms}; self.v = {a: 0.0 for a in arms}; self.c = {a: 0.0 for a in arms}
    def update(self, arm, v, c):
        self.n[arm] += 1; self.v[arm] += v; self.c[arm] += c

class Greedy(_Stats):
    """Try each arm twice, then always the best observed value per cost."""
    name = "greedy"
    def __init__(self, arms, rng): super().__init__(arms); self.arms = arms
    def choose(self, t):
        for a in self.arms:
            if self.n[a] < 2: return a
        return max(self.arms, key=lambda a: self.v[a] / self.c[a])

class Thompson(_Stats):
    """Bootstrap Thompson: resample each arm's observed projects, pick the best sampled ratio."""
    name = "thompson"
    def __init__(self, arms, rng):
        super().__init__(arms); self.arms, self.rng = arms, rng
        self.obs = {a: [] for a in arms}
    def update(self, arm, v, c):
        super().update(arm, v, c); self.obs[arm].append((v, c))
    def choose(self, t):
        for a in self.arms:
            if self.n[a] < 2: return a
        best, bs = None, -1.0
        for a in self.arms:
            s = [self.rng.choice(self.obs[a]) for _ in range(len(self.obs[a]))]
            r = sum(x[0] for x in s) / sum(x[1] for x in s)
            if r > bs: best, bs = a, r
        return best

class KnapsackUCB(_Stats):
    """UCB on value, LCB on cost, ratio of the two (Badanidiyuru et al. 2018, UCB-BwK style).

    Simplified single-resource form: with one budget the index is optimistic value over
    pessimistic cost, with a Hoeffding-style radius. Value is in [1,3] and cost is
    normalised by cmax, so both radii use range 2 and 1.
    """
    name = "knapsack-ucb"
    def __init__(self, arms, rng, cmax=1.0):
        super().__init__(arms); self.arms, self.cmax = arms, cmax
    def choose(self, t):
        for a in self.arms:
            if self.n[a] < 2: return a
        import math
        def idx(a):
            n = self.n[a]; rad = math.sqrt(math.log(max(t, 2)) / n)
            v = self.v[a] / n + 2 * rad
            c = max(self.c[a] / n / self.cmax - rad, 0.05)
            return v / c
        return max(self.arms, key=idx)

def run_once(policy_cls, pools, budget, seed, cmax=1.0):
    rng = random.Random(seed)
    arms = sorted(pools)
    pull = make_env(pools)
    pol = policy_cls(arms, rng, cmax) if policy_cls is KnapsackUCB else policy_cls(arms, rng)
    spent = total = 0.0; t = 0; runs = 0
    env_rng = random.Random(seed + 1)
    while spent < budget:
        t += 1
        a = pol.choose(t)
        v, c = pull(a, env_rng)
        spent += c; total += v; runs += 1
        pol.update(a, v, c)
    return total, runs

def oracle_ratio(pools):
    """Best single arm by true value-per-cost, and the expected value of spending the whole budget on it."""
    best = max(pools, key=lambda a: sum(v for v, _ in pools[a]) / sum(c for _, c in pools[a]))
    return best, sum(v for v, _ in pools[best]) / sum(c for _, c in pools[best])

def mean_ci(xs, z=1.96):
    n = len(xs); m = sum(xs) / n
    sd = (sum((x - m) ** 2 for x in xs) / (n - 1)) ** 0.5
    return m, m - z * sd / n ** 0.5, m + z * sd / n ** 0.5
