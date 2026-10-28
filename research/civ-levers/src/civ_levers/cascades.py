"""Threshold (complex) contagion on Watts-Strogatz graphs, and where to seed it.

A person adopts once at least `T` neighbours have; T = 1 is a simple contagion,
T >= 2 a complex one (Centola and Macy 2007). Synchronous, progressive, deterministic
once the graph and the seeds are fixed.
"""
import numpy as np


def watts_strogatz(n, k, p, rng):
    """Ring lattice with k nearest neighbours (k even), each lattice edge rewired
    with probability p to a uniform random non-neighbour. Returns adjacency sets."""
    adj = [set() for _ in range(n)]
    for i in range(n):
        for d in range(1, k // 2 + 1):
            j = (i + d) % n
            adj[i].add(j)
            adj[j].add(i)
    for i in range(n):
        for d in range(1, k // 2 + 1):
            j = (i + d) % n
            if j in adj[i] and rng.random() < p:
                choices = rng.integers(0, n, size=20)
                for c in choices:
                    c = int(c)
                    if c != i and c not in adj[i]:
                        adj[i].discard(j)
                        adj[j].discard(i)
                        adj[i].add(c)
                        adj[c].add(i)
                        break
    return adj


def spread(adj, seeds, T):
    """Run to a fixed point. Returns (final adopted fraction, rounds)."""
    n = len(adj)
    on = np.zeros(n, bool)
    on[list(seeds)] = True
    count = np.zeros(n, int)
    frontier = list(seeds)
    rounds = 0
    while frontier:
        new = []
        for u in frontier:
            for v in adj[u]:
                count[v] += 1
                if not on[v] and count[v] >= T:
                    on[v] = True
                    new.append(v)
        frontier = new
        rounds += bool(new)
    return on.mean(), rounds


def seeds_random(adj, s, rng):
    return [int(x) for x in rng.choice(len(adj), s, replace=False)]


def seeds_hubs(adj, s, rng):
    deg = np.array([len(a) for a in adj]) + rng.random(len(adj)) * 1e-6
    return [int(x) for x in np.argsort(-deg)[:s]]


def seeds_patch(adj, s, rng):
    """A random person plus the people closest to them, breadth first."""
    start = int(rng.integers(len(adj)))
    seen, order = {start}, [start]
    for u in order:
        for v in sorted(adj[u]):
            if v not in seen:
                seen.add(v)
                order.append(v)
        if len(order) >= s:
            break
    return order[:s]


def seeds_spread(adj, s, rng):
    """Greedy: random order, keep a person only if no kept seed is within 2 steps."""
    n = len(adj)
    chosen, blocked = [], set()
    for u in rng.permutation(n):
        u = int(u)
        if u in blocked:
            continue
        chosen.append(u)
        blocked |= {u} | adj[u] | {w for v in adj[u] for w in adj[v]}
        if len(chosen) == s:
            break
    return chosen


RULES = {"random": seeds_random, "hubs": seeds_hubs, "patch": seeds_patch, "spread": seeds_spread}
