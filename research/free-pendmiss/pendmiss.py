"""Inverted pendulum x'' = w2 x + u (linearised), zero-order-hold state feedback,
random sampling intervals.  Stdlib only.

Exact discretisation over an interval h:  x+ = Ad(h) x + Bd(h) u, with
Ad = [[cosh wh, sinh(wh)/w],[w sinh wh, cosh wh]],  Bd = [(cosh wh - 1)/w2, sinh(wh)/w].
Gain K places both closed-loop poles at `pole` (Ackermann, 2x2 closed form).
"""
import math
import random

G_ACC = 9.80665  # m/s^2, standard gravity (CGPM 1901)


def omega2(length):
    """Linearised inverted point-mass pendulum: w^2 = g / L."""
    return G_ACC / length


def disc(w2, h):
    w = math.sqrt(w2)
    c, s = math.cosh(w * h), math.sinh(w * h)
    return [[c, s / w], [w * s, c]], [(c - 1) / w2, s / w]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(2)) for j in range(2)] for i in range(2)]


def matvec(a, v):
    return [a[0][0] * v[0] + a[0][1] * v[1], a[1][0] * v[0] + a[1][1] * v[1]]


def transpose(a):
    return [[a[0][0], a[1][0]], [a[0][1], a[1][1]]]


def gain(w2, h, pole):
    """K (row) with eig(Ad - Bd K) = {pole, pole}; Ackermann: K = [0 1] C^-1 phi(Ad)."""
    a, b = disc(w2, h)
    ab = matvec(a, b)
    det = b[0] * ab[1] - b[1] * ab[0]
    ci = [[ab[1] / det, -ab[0] / det], [-b[1] / det, b[0] / det]]  # inverse of C=[b ab]
    a2 = matmul(a, a)
    phi = [[a2[i][j] - 2 * pole * a[i][j] + (pole * pole if i == j else 0.0) for j in range(2)] for i in range(2)]
    last = [ci[1][0], ci[1][1]]
    return [last[0] * phi[0][j] + last[1] * phi[1][j] for j in range(2)]


def closed(w2, h, k):
    a, b = disc(w2, h)
    return [[a[i][j] - b[i] * k[j] for j in range(2)] for i in range(2)]


def spectral_radius(m):
    tr, det = m[0][0] + m[1][1], m[0][0] * m[1][1] - m[0][1] * m[1][0]
    d = tr * tr / 4 - det
    if d >= 0:
        r = math.sqrt(d)
        return max(abs(tr / 2 + r), abs(tr / 2 - r))
    return math.sqrt(det)


def kron(a, b):
    return [[a[i // 2][j // 2] * b[i % 2][j % 2] for j in range(4)] for i in range(4)]


def mat4mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def ms_rate(gs, ws, squarings=12):
    """Spectral radius of M = sum_i w_i G_i (x) G_i, the second-moment operator of the
    iid switched system x+ = G x.  The system is mean-square stable iff this is < 1.
    Computed as ||M^n||^(1/n), n = 2^squarings, by repeated squaring with rescaling
    (no normalisation of a possibly nilpotent iterate, so deadbeat gains are exact)."""
    m = [[0.0] * 4 for _ in range(4)]
    for g, w in zip(gs, ws):
        kk = kron(g, g)
        for i in range(4):
            for j in range(4):
                m[i][j] += w * kk[i][j]
    log_scale = 0.0  # true M^n = exp(log_scale) * m
    for _ in range(squarings):
        nrm = max(abs(v) for row in m for v in row)
        if nrm == 0.0:
            return 0.0
        m = [[v / nrm for v in row] for row in m]
        log_scale += math.log(nrm)
        m = mat4mul(m, m)
        log_scale *= 2.0
    nrm = max(abs(v) for row in m for v in row)
    if nrm == 0.0:
        return 0.0
    return math.exp((log_scale + math.log(nrm)) / 2 ** squarings)


def lyapunov(sampler, mats_for, steps, rng):
    """Almost-sure exponent per step of ||x_n||, with renormalisation."""
    x = [1.0, 0.7]
    acc = 0.0
    for _ in range(steps):
        h = sampler(rng)
        x = matvec(mats_for(h), x)
        n = math.hypot(x[0], x[1])
        acc += math.log(n)
        x = [x[0] / n, x[1] / n]
    return acc / steps


def threshold(f, lo, hi, it=40):
    """Largest x in [lo,hi] with f true (f true then false). hi if f(hi); None if not f(lo)."""
    if not f(lo):
        return None
    if f(hi):
        return hi
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if f(mid) else (lo, mid)
    return lo
