"""Allies placed together: how big a block of committed robots can be before a ring crowd stops tipping.

Same walking-side game as `society-robotnorms`: agents meet in pairs and pick a
side, L or R; people take the majority of their last M partners (error eps),
committed robots always walk L. Space is a ring where a partner sits within k
sites. Robots come in blocks of `block` neighbours, the blocks evenly spaced;
block = 1 is the "evenly spread" placement of `society-robotnorms`, and
block = number of robots is its "one block".

Stdlib only. Stylised: one binary choice per meeting, a 1D ring for an encounter network.
"""
import random

L, R = 1, 0


def block_placement(n, n_robots, block):
    """Robot sites: ceil(n_robots / block) blocks of `block` adjacent sites (the last may be short), evenly spaced."""
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


def simulate(n=200, rho=0.12, block=1, k=2, m=9, eps=0.02, rounds=500, seed=0):
    """One ring crowd. Returns the final share of people whose memory majority is L, and conflicts per human meeting."""
    rng = random.Random(seed)
    nr = round(rho * n)
    robot = block_placement(n, nr, block)
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n
    half = m // 2

    def choose(i):
        if i in robot:
            return L
        if rng.random() < eps:
            return L if rng.random() < 0.5 else R
        return L if cnt[i] > half else R

    def remember(i, s):
        if i in robot:
            return
        old = mem[i][ptr[i]]
        mem[i][ptr[i]] = s
        cnt[i] += s - old
        ptr[i] = (ptr[i] + 1) % m

    humans = [i for i in range(n) if i not in robot]
    hc = hm = 0
    for _ in range(rounds):
        for _ in range(n // 2):
            i = rng.randrange(n)
            d = rng.randint(1, k) * (1 if rng.random() < 0.5 else -1)
            j = (i + d) % n
            si, sj = choose(i), choose(j)
            remember(i, sj)
            remember(j, si)
            h = (i not in robot) + (j not in robot)
            hm += h
            if si != sj:
                hc += h
    return {"final_share_l": sum(cnt[i] > half for i in humans) / len(humans),
            "human_conflict_rate": hc / hm if hm else 0.0}
