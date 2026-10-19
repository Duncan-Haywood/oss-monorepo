"""Sequential, no-replacement replay of track-allocation policies.

swe-allocate drew projects with replacement, so a track never ran dry and never got worse.
Here pulling an arm yields that track's next project in commit order; a track with no projects
left leaves the choice set. Policies come from swe-allocate unchanged.
"""
import os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "swe-allocate", "src"))
from swe_allocate.policies import Uniform, Greedy, Thompson, KnapsackUCB, mean_ci  # noqa: F401


def run_seq(policy_cls, seqs, budget, seed, cmax=1.0):
    """seqs: {arm: [(value, cost), ...]} in commit order. Returns (value, runs, arms_exhausted)."""
    rng = random.Random(seed)
    arms = sorted(seqs)
    pol = policy_cls(arms, rng, cmax) if policy_cls is KnapsackUCB else policy_cls(arms, rng)
    nxt = {a: 0 for a in arms}
    spent = total = 0.0; t = runs = 0
    while spent < budget and pol.arms:
        t += 1
        a = pol.choose(t)
        v, c = seqs[a][nxt[a]]
        nxt[a] += 1
        if nxt[a] == len(seqs[a]):
            pol.arms = [x for x in pol.arms if x != a]
        spent += c; total += v; runs += 1
        pol.update(a, v, c)
    return total, runs, len(arms) - len(pol.arms)


def best_fixed_arm(seqs, budget):
    """Hindsight oracle over single arms: spend the budget walking down one track in order."""
    best = (None, -1.0)
    for a, s in seqs.items():
        spent = tot = 0.0
        for v, c in s:
            if spent >= budget: break
            spent += c; tot += v
        if tot > best[1]: best = (a, tot)
    return best


def hindsight(seqs, budget):
    """Reference that sees the whole future: always pull the arm whose next project has the best value per line.
    Not a bound on every policy (it is myopic), but a fixed yardstick that knows the order."""
    nxt = {a: 0 for a in seqs}; spent = total = 0.0
    while spent < budget:
        live = [a for a in seqs if nxt[a] < len(seqs[a])]
        if not live: break
        a = max(live, key=lambda a: seqs[a][nxt[a]][0] / seqs[a][nxt[a]][1])
        v, c = seqs[a][nxt[a]]; nxt[a] += 1; spent += c; total += v
    return total


def fit_decay(seq):
    """Least-squares slope of ln(value per 1000 lines) on pull index; negative = diminishing returns."""
    import math
    ys = [math.log(1000 * v / c) for v, c in seq]
    n = len(ys); xs = list(range(n)); mx = (n - 1) / 2; my = sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else 0.0
