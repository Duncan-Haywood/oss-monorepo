"""Sampled PD loop on a double integrator with missed samples (stdlib only).

Plant x'' = u, zero-order hold. After a sample at t_j the control u = -kp x - kd v is held
until the next sample that actually arrives, h = m*h0 later (m-1 samples missed in a row).
M(h) is the exact one-interval closed-loop map on (x, v).
"""
import math
import random


def gains(r, h0):
    """PD gains that place both closed-loop poles of the fixed-period loop at z = r."""
    return (1 - r) ** 2 / h0 ** 2, (1 - r) * (3 + r) / (2 * h0)


def step_matrix(h, kp, kd):
    return ((1 - kp * h * h / 2, h - kd * h * h / 2), (-kp * h, 1 - kd * h))


def spectral_radius2(M):
    tr = M[0][0] + M[1][1]
    det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
    disc = tr * tr / 4 - det
    if disc >= 0:
        s = math.sqrt(disc)
        return max(abs(tr / 2 + s), abs(tr / 2 - s))
    return math.sqrt(det)


def miss_law(q, mmax=400):
    """P(interval = m*h0) = (1-q) q^(m-1), the tail beyond mmax folded into mmax."""
    p = [(1 - q) * q ** (m - 1) for m in range(1, mmax + 1)]
    p[-1] += q ** mmax
    return p


def second_moment_op(q, r, h0, mmax=400):
    """3x3 matrix of P -> sum_m p_m M_m P M_m^T on (P11, P12, P22)."""
    kp, kd = gains(r, h0)
    T = [[0.0] * 3 for _ in range(3)]
    for m, p in enumerate(miss_law(q, mmax), 1):
        if p < 1e-300:
            break
        (a, b), (c, d) = step_matrix(m * h0, kp, kd)
        rows = (
            (a * a, 2 * a * b, b * b),
            (a * c, a * d + b * c, b * d),
            (c * c, 2 * c * d, d * d),
        )
        for i in range(3):
            for j in range(3):
                T[i][j] += p * rows[i][j]
    return T


def cubic_stable(T):
    """Jury test: all eigenvalues of the 3x3 matrix T strictly inside the unit circle."""
    tr = T[0][0] + T[1][1] + T[2][2]
    minors = 0.0
    for i, j in ((0, 1), (0, 2), (1, 2)):
        minors += T[i][i] * T[j][j] - T[i][j] * T[j][i]
    det = (T[0][0] * (T[1][1] * T[2][2] - T[1][2] * T[2][1])
           - T[0][1] * (T[1][0] * T[2][2] - T[1][2] * T[2][0])
           + T[0][2] * (T[1][0] * T[2][1] - T[1][1] * T[2][0]))
    a2, a1, a0 = -tr, minors, -det
    p1 = 1 + a2 + a1 + a0
    pm1 = -1 + a2 - a1 + a0
    return p1 > 0 and pm1 < 0 and abs(a0) < 1 and abs(a0 * a0 - 1) > abs(a0 * a2 - a1)


def ms_stable(q, r, h0):
    return cubic_stable(second_moment_op(q, r, h0))


def lyapunov(q, r, h0, n=200000, seed=7):
    """Almost-sure growth rate per sample of |(x, v)|, from one long product with renormalisation.

    Intervals come from a fixed uniform stream by inverse CDF, so a larger q never gives a
    shorter interval on the same stream (common random numbers across q)."""
    kp, kd = gains(r, h0)
    rng = random.Random(seed)
    cache = {}
    x, v, acc = 1.0, 0.0, 0.0
    for _ in range(n):
        u = rng.random()
        m = 1 if q <= 0 else 1 + int(math.log(max(u, 1e-300)) / math.log(q)) if q < 1 else 10 ** 6
        m = min(m, 400)
        if m not in cache:
            cache[m] = step_matrix(m * h0, kp, kd)
        (a, b), (c, d) = cache[m]
        x, v = a * x + b * v, c * x + d * v
        nrm = math.hypot(x, v)
        acc += math.log(nrm)
        x, v = x / nrm, v / nrm
    return acc / n


def bisect_q(pred_stable, lo=0.0, hi=0.999, tol=0.002):
    """Largest q with pred_stable(q) true, assuming stability is lost once as q grows."""
    if not pred_stable(lo):
        return 0.0
    if pred_stable(hi):
        return hi
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if pred_stable(mid):
            lo = mid
        else:
            hi = mid
    return lo


def draw_m(rng, q):
    u = rng.random()
    return 1 if q <= 0 else min(400, 1 + int(math.log(max(u, 1e-300)) / math.log(q)))


def mc_moment(q, r, h0, steps, runs, seed=11):
    """Monte Carlo E[x^2 + v^2] after `steps` samples from (1, 0), and the share of runs with
    |state| < 1e-6 at the end."""
    kp, kd = gains(r, h0)
    rng = random.Random(seed)
    acc, small = 0.0, 0
    for _ in range(runs):
        x, v = 1.0, 0.0
        for _ in range(steps):
            (a, b), (c, d) = step_matrix(draw_m(rng, q) * h0, kp, kd)
            x, v = a * x + b * v, c * x + d * v
        acc += x * x + v * v
        small += math.hypot(x, v) < 1e-6
    return acc / runs, small / runs


def exact_moment(q, r, h0, steps):
    """E[x^2 + v^2] after `steps` samples from (1, 0), by iterating the second-moment operator."""
    T = second_moment_op(q, r, h0)
    P = [1.0, 0.0, 0.0]
    for _ in range(steps):
        P = [sum(T[i][j] * P[j] for j in range(3)) for i in range(3)]
    return P[0] + P[2]
