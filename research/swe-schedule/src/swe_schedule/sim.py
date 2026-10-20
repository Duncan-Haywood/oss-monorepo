"""Monte Carlo model of duplicate work among parallel agent runs that pick from a shared pool.

n runs start at nominal times; each reads the repository state at `start + read` and picks one of
`pool` items uniformly among those whose claim it can already see. A run's claim (pushed branch and
pull request) becomes visible `latency` minutes after its start. Two runs holding the same item
make one of them redundant. Everything is in minutes. All timing constants are ASSUMED.

Policies:
  uniform   every run starts at the same time (jitter only): the current setup
  stagger   run i starts i * gap minutes after the first
  slots     run i is handed item (offset + i) mod pool by the scheduler: no look-up needed
"""
import math
import random


def birthday_distinct(n, pool):
    """Expected number of distinct items when n runs pick uniformly with no information."""
    return pool * (1.0 - (1.0 - 1.0 / pool) ** n)


def p_any_collision(n, pool):
    """Probability that at least two of n blind uniform picks coincide."""
    p = 1.0
    for i in range(n):
        p *= (pool - i) / pool
    return 1.0 - p


def one_batch(rng, n, pool, policy, gap=0.0, read=2.0, latency=3.0, jitter=0.5, latency_exp=True):
    """Return (distinct items held, runs) for one batch of n runs."""
    if policy == "slots":
        off = rng.randrange(pool)
        return len({(off + i) % pool for i in range(n)}), n
    starts = [(i * gap if policy == "stagger" else 0.0) + rng.uniform(0, jitter) for i in range(n)]
    order = sorted(range(n), key=lambda i: starts[i])
    picks = {}     # run -> item
    visible = {}   # run -> time its claim becomes visible
    for i in order:
        t = starts[i] + read
        taken = {picks[j] for j in picks if visible[j] <= t}
        free = [x for x in range(pool) if x not in taken]
        picks[i] = rng.choice(free) if free else rng.randrange(pool)
        lat = rng.expovariate(1.0 / latency) if latency_exp else latency
        visible[i] = starts[i] + read + lat
    return len(set(picks.values())), n


def waste(trials, seed, n=4, pool=11, policy="uniform", **kw):
    """Mean fraction of runs that duplicate another run's item, with a standard error."""
    rng = random.Random(seed)
    xs = []
    for _ in range(trials):
        d, m = one_batch(rng, n, pool, policy, **kw)
        xs.append(1.0 - d / m)
    mu = sum(xs) / trials
    var = sum((x - mu) ** 2 for x in xs) / (trials - 1)
    return mu, math.sqrt(var / trials)
