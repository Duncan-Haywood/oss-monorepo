"""Freivalds-style check of C = A B in floating point.

Probe r; accept iff ||A (B r) - C r|| <= t.  For a corrupted product C' = C + E the residual
in exact arithmetic is E r.  With Gaussian r, E r ~ N(0, E E^T), so ||E r||^2 = sum s_i^2 Z_i^2
over the singular values s_i of E.  Rank-one E (u v^T) gives ||E r|| = F |Z|, F = ||E||_F.
"""
import math, random, struct

__all__ = ["miss_rank1", "probes_needed", "miss_mc", "miss_rademacher_two", "fair_probe_size",
           "f32", "matvec32", "matmul32", "honest_residual", "fit_exponent", "false_positive",
           "grind_tries", "verify_cost_ratio", "gauss_vec", "rademacher_vec", "norm"]


def norm(x):
    return math.sqrt(sum(v * v for v in x))


def miss_rank1(t, F, m=1):
    """P(all m independent Gaussian probes pass) for a rank-one corruption of Frobenius norm F:
    P(F|Z| <= t)^m = erf(t / (sqrt2 F))^m."""
    return math.erf(t / (math.sqrt(2) * F)) ** m


def probes_needed(t, F_star, beta):
    """fewest probes so every corruption with ||E||_F >= F_star is missed w.p. <= beta
    (rank-one is the worst case for a fixed Frobenius norm)."""
    p = miss_rank1(t, F_star)
    return math.ceil(math.log(beta) / math.log(p))


def fair_probe_size(t):
    """Frobenius norm missed by one Gaussian probe exactly half the time: t / (sqrt2 erfinv(1/2))."""
    lo, hi = 0.0, 10.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if math.erf(mid) < 0.5:
            lo = mid
        else:
            hi = mid
    return t / (math.sqrt(2) * lo)


def gauss_vec(n, rng):
    return [rng.gauss(0, 1) for _ in range(n)]


def rademacher_vec(n, rng):
    return [rng.choice((-1.0, 1.0)) for _ in range(n)]


def miss_mc(sigmas, t, trials, rng):
    """Monte-Carlo P(sum s_i^2 Z_i^2 <= t^2) for singular values `sigmas` of the corruption."""
    hit = 0
    for _ in range(trials):
        if sum(s * s * rng.gauss(0, 1) ** 2 for s in sigmas) <= t * t:
            hit += 1
    return hit / trials


def miss_rademacher_two(t, F):
    """Rademacher probes against E = u v^T with v = (a, a, 0, ...), F = sqrt2 a ||u||: the
    residual is ||u|| |a (r1 + r2)| = 0 w.p. 1/2 else sqrt2 F.  Exact miss probability."""
    return 0.5 + (0.5 if math.sqrt(2) * F <= t else 0.0)


def f32(x):
    return struct.unpack("f", struct.pack("f", x))[0]


def matvec32(A, x):
    out = []
    for row in A:
        s = 0.0
        for a, b in zip(row, x):
            s = f32(s + f32(a * b))
        out.append(s)
    return out


def matmul32(A, B):
    n, k, m = len(A), len(B), len(B[0])
    Bt = list(zip(*B))
    C = []
    for row in A:
        crow = []
        for col in Bt:
            s = 0.0
            for a, b in zip(row, col):
                s = f32(s + f32(a * b))
            crow.append(s)
        C.append(crow)
    return C


def honest_residual(n, rng, probe=gauss_vec):
    """||A (B r) - C r|| in float32 for an honest product, A, B entries N(0,1/n), r unit-variance."""
    s = 1 / math.sqrt(n)
    A = [[f32(rng.gauss(0, s)) for _ in range(n)] for _ in range(n)]
    B = [[f32(rng.gauss(0, s)) for _ in range(n)] for _ in range(n)]
    C = matmul32(A, B)
    r = [f32(v) for v in probe(n, rng)]
    lhs = matvec32(A, matvec32(B, r))
    rhs = matvec32(C, r)
    return norm([a - b for a, b in zip(lhs, rhs)])


def fit_exponent(xs, ys):
    """least-squares slope of log y on log x"""
    lx, ly = [math.log(x) for x in xs], [math.log(y) for y in ys]
    mx, my = sum(lx) / len(lx), sum(ly) / len(ly)
    return sum((a - mx) * (b - my) for a, b in zip(lx, ly)) / sum((a - mx) ** 2 for a in lx)


def false_positive(samples, t):
    return sum(1 for s in samples if s > t) / len(samples)


def grind_tries(t, F):
    """If the probe is derived from the result by a hash (Fiat-Shamir) with free retries, a cheater
    tries corruptions until one passes; each passes w.p. erf(t/(sqrt2 F)), so expect 1/p tries."""
    return 1 / miss_rank1(t, F)


def verify_cost_ratio(n, m):
    """flops of m probes (3 matvecs of n^2 each: B r, A(.), C r, ~2n^2 mult-adds each => 6 n^2 m)
    over recomputing the product (2 n^3)"""
    return 6 * n * n * m / (2 * n ** 3)
