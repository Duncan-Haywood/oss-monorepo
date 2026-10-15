"""Grid twin: shortest-path length on a k-connected lattice vs the Euclidean length of the real route."""
import heapq
import math
import random

SQ2 = math.sqrt(2.0)


def moves(k):
    """Primitive moves of a 4-, 8- or 16-connected lattice."""
    m = [(1, 0), (0, 1), (-1, 0), (0, -1)]
    if k >= 8:
        m += [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    if k >= 16:
        m += [(1, 2), (2, 1), (-1, 2), (-2, 1), (-1, -2), (-2, -1), (1, -2), (2, -1)]
    if k not in (4, 8, 16):
        raise ValueError("k must be 4, 8 or 16")
    return m


def ratio(k, phi):
    """Asymptotic grid length / Euclidean length for a route at heading phi (scale free: independent of cell size).
    Write the unit direction as a*u_a + b*u_b over the two primitives bracketing phi; cost is a|p_a| + b|p_b|."""
    ms = sorted(moves(k), key=lambda p: math.atan2(p[1], p[0]) % (2 * math.pi))
    ang = [math.atan2(p[1], p[0]) % (2 * math.pi) for p in ms]
    phi %= 2 * math.pi
    n = len(ms)
    for i in range(n):
        lo, hi = ang[i], ang[(i + 1) % n] + (2 * math.pi if i == n - 1 else 0.0)
        ph = phi + (2 * math.pi if phi < lo else 0.0)
        if lo <= ph <= hi:
            a, b = ms[i], ms[(i + 1) % n]
            det = a[0] * b[1] - a[1] * b[0]
            u, v = math.cos(phi), math.sin(phi)
            wa = (u * b[1] - v * b[0]) / det
            wb = (a[0] * v - a[1] * u) / det
            return wa * math.hypot(*a) + wb * math.hypot(*b)
    raise AssertionError("no bracketing pair")


def octile(dx, dy):
    """Exact 8-connected free-space cost (in cells) to reach lattice offset (dx, dy)."""
    dx, dy = abs(dx), abs(dy)
    return max(dx, dy) + (SQ2 - 1.0) * min(dx, dy)


def dijkstra(k, n, target):
    """Shortest path cost from (0,0) to target on the (2n+1)^2 lattice with no obstacles, by Dijkstra."""
    ms = [(p, math.hypot(*p)) for p in moves(k)]
    dist = {(0, 0): 0.0}
    pq = [(0.0, (0, 0))]
    while pq:
        d, u = heapq.heappop(pq)
        if u == target:
            return d
        if d > dist[u]:
            continue
        for (dx, dy), c in ms:
            v = (u[0] + dx, u[1] + dy)
            if abs(v[0]) > n or abs(v[1]) > n:
                continue
            nd = d + c
            if nd < dist.get(v, 1e300):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    raise AssertionError("unreachable")


def mean_ratio(k, m=200000):
    """Mean of ratio over a uniform heading (midpoint rule)."""
    return sum(ratio(k, 2 * math.pi * (i + 0.5) / m) for i in range(m)) / m


def max_ratio(k, m=200000):
    best, arg = 0.0, 0.0
    for i in range(m):
        ph = math.pi / 2 * (i + 0.5) / m
        r = ratio(k, ph)
        if r > best:
            best, arg = r, ph
    return best, arg


def flip_probability_mc(k, rho, n, seed=0):
    """P(grid twin ranks the longer route (Euclid length rho > 1 times the shorter) shorter), independent uniform headings."""
    rng = random.Random(seed)
    c = 0
    for _ in range(n):
        if rho * ratio(k, rng.uniform(0, 2 * math.pi)) < ratio(k, rng.uniform(0, 2 * math.pi)):
            c += 1
    return c / n


def flip_probability_quad(k, rho, m=2000):
    """Same probability by deterministic midpoint quadrature over both headings. The move set is symmetric under 90-degree
    rotation and reflection in the diagonal, so the heading distribution of ratio is that of phi uniform on [0, pi/4]."""
    import bisect
    rs = sorted(ratio(k, (math.pi / 4) * (i + 0.5) / m) for i in range(m))
    # flip iff rho * r2 < r1 (r1: shorter route, r2: longer route)
    c = 0
    for r2 in rs:
        t = rho * r2
        c += m - bisect.bisect_right(rs, t)       # count r1 > t
    return c / (m * m)
