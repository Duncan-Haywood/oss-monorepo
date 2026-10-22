"""Allies as patches on a 2D grid: does `society-allies`' block-versus-neighbourhood rule carry over from a ring?

Same walking-side game as `society-allies`: agents meet in pairs and pick a side, L or R; people take
the majority of their last M partners (error eps), committed robots always walk L. Space is a W x W
torus and a partner sits within Chebyshev distance k (a (2k+1)^2 - 1 site neighbourhood, chosen
uniformly). Robots come in patches of `block` sites, filled row by row inside a ceil(sqrt(block))-wide
square, the patches on an evenly spaced lattice. block = 1 is evenly spread robots.

Stdlib only. Stylised: one binary choice per meeting, a square torus for an encounter network.
"""
import math
import random
from math import comb

L, R = 1, 0


def patch_placement(w, n_robots, block):
    """Robot sites (x, y) on a w x w torus: ceil(n_robots / block) patches of `block` sites
    (the last may be short), patch origins on an evenly spaced lattice."""
    if n_robots == 0:
        return set()
    block = max(1, min(block, n_robots))
    nb = -(-n_robots // block)
    side = math.isqrt(block - 1) + 1  # ceil(sqrt(block))
    gx = math.isqrt(nb - 1) + 1
    gy = -(-nb // gx)
    sites = set()
    left = n_robots
    for b in range(nb):
        ox = int((b % gx) * w / gx)
        oy = int((b // gx) * w / gy)
        size = min(block, left)
        for t in range(size):
            sites.add(((ox + t % side) % w, (oy + t // side) % w))
        left -= size
    return sites


def simulate(w=16, rho=0.2, block=1, k=2, m=9, eps=0.02, rounds=500, seed=0):
    """One crowd on a w x w torus. Returns the final share of people whose memory majority is L,
    and conflicts per human meeting."""
    rng = random.Random(seed)
    n = w * w
    robot = {x * w + y for x, y in patch_placement(w, round(rho * n), block)}
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n
    half = m // 2
    span = 2 * k + 1
    # a toroidal neighbourhood larger than the torus would repeat sites: cap at the torus
    assert span <= w, "neighbourhood wider than the torus"

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
            while True:
                dx, dy = rng.randint(-k, k), rng.randint(-k, k)
                if dx or dy:
                    break
            j = ((i // w + dx) % w) * w + (i % w + dy) % w
            si, sj = choose(i), choose(j)
            remember(i, sj)
            remember(j, si)
            h = (i not in robot) + (j not in robot)
            hm += h
            if si != sj:
                hc += h
    return {"final_share_l": sum(cnt[i] > half for i in humans) / len(humans),
            "human_conflict_rate": hc / hm if hm else 0.0}


def meanfield_threshold(m=9, eps=0.02, iters=4000):
    """Least robot share at which a well-mixed crowd tips (the `society-blocs` map with sl = sr = 0):
    q = rho + (1 - rho)(x(1 - eps) + eps/2), x' = P(Bin(m, q) >= (m + 1)/2), iterated from x = 0."""
    need = (m + 1) // 2

    def tips(rho):
        x = 0.0
        for _ in range(iters):
            q = rho + (1 - rho) * (x * (1 - eps) + eps / 2)
            x = sum(comb(m, j) * q ** j * (1 - q) ** (m - j) for j in range(need, m + 1))
        return x > 0.5

    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if tips(mid) else (mid, hi)
    return hi
