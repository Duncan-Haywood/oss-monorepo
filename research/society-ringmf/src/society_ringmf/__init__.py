"""Local mean-field for the ring walking-side game of `society-allies`.

Each person i has x_i, the chance their memory majority is L. A partner is
uniform over the 2k nearest sites; it plays L with probability 1 for a robot and
(1 - eps) * x_j + eps / 2 for a person. Person i's memory slots are treated as
independent draws with success rate q_i (the mean over partners), so
x_i = P(Binomial(M, q_i) > M / 2). Iterating from x = 0 (everyone starts on R)
follows the crowd to the fixed point nearest the starting state.

Stdlib only. The approximation drops the time correlation in each person's memory.
"""
from math import comb



def block_placement(n, n_robots, block):
    """Same placement as `society-allies` (a test checks they agree): evenly spaced blocks of adjacent sites."""
    if n_robots == 0:
        return set()
    block = max(1, min(block, n_robots))
    nb = -(-n_robots // block)
    sites = set()
    left = n_robots
    for b in range(nb):
        start = int(b * n / nb)
        size = min(block, left)
        sites.update((start + t) % n for t in range(size))
        left -= size
    return sites


def majority_prob(q, m):
    """P(Binomial(m, q) > m / 2), m odd."""
    return sum(comb(m, s) * q**s * (1 - q) ** (m - s) for s in range(m // 2 + 1, m + 1))


def fixed_point(n=200, rho=0.12, block=1, k=2, m=9, eps=0.02, iters=3000, tol=1e-10):
    """Iterate the local map from x = 0. Returns (mean x over people, iterations used)."""
    robot = block_placement(n, round(rho * n), block)
    table = [majority_prob(i / 1000, m) for i in range(1001)]
    x = [0.0] * n
    for it in range(1, iters + 1):
        c = [1.0 if i in robot else (1 - eps) * x[i] + eps / 2 for i in range(n)]
        new = x[:]
        delta = 0.0
        for i in range(n):
            if i in robot:
                continue
            q = sum(c[(i + d) % n] + c[(i - d) % n] for d in range(1, k + 1)) / (2 * k)
            v = table[round(q * 1000)]
            delta = max(delta, abs(v - x[i]))
            new[i] = v
        x = new
        if delta < tol:
            break
    people = [x[i] for i in range(n) if i not in robot]
    return sum(people) / len(people), it
