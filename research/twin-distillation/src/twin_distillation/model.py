"""Distilling a privileged teacher trained in a digital twin into a noisy-sensor student. Scalar plant x' = a x + b u + w, w ~ N(0, s2).
The teacher sees the true state and applies u = -g x with the twin-optimal LQR gain g. The student sees only z = x + zeta, zeta ~ N(0, s),
and is a linear policy u = -k z. Behaviour cloning fits k by least squares on (z, teacher action) pairs collected in the twin,
so k = g P / (P + s) where P is the state variance of whatever loop generated the data (attenuation by the sensor noise).
Everything is Gaussian and linear, so costs, variances and the cloned gain are closed forms."""
import math
import random

__all__ = ["lqr_gain", "stationary_var", "cost", "regret", "best_student_gain", "bc_gain", "dagger_fixed_point", "dagger_path",
           "dart_noise", "bc_fit", "simulate_cost"]


def lqr_gain(a, b, q=1.0, r=0.1):
    """Riccati gain of the exact-state teacher."""
    B = r * (1 - a * a) - q * b * b
    p = (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)
    return a * b * p / (r + b * b * p)


def stationary_var(a, b, k, s, s2=1.0, nu=0.0):
    """Var x when the applied action is u = -k (x + zeta) + e, zeta ~ N(0, s) (s = 0 for the exact-state teacher), e ~ N(0, nu)."""
    c = a - b * k
    return math.inf if abs(c) >= 1 else (s2 + b * b * (k * k * s + nu)) / (1 - c * c)


def cost(a, b, k, s, s2=1.0, q=1.0, r=0.1):
    """Stage cost E[q x^2 + r u^2] of the student u = -k z in the plant (a, b, s2) with sensor noise s."""
    P = stationary_var(a, b, k, s, s2)
    return math.inf if math.isinf(P) else q * P + r * k * k * (P + s)


def best_student_gain(a, b, s, s2=1.0, q=1.0, r=0.1):
    """Cost-minimising memoryless gain on z (golden section over the stable interval; the cost is unimodal there)."""
    lo, hi = max(0.0, (a - 1) / b) if b > 0 else 0.0, (a + 1) / b
    lo, hi = lo + 1e-9, hi - 1e-9
    g = (math.sqrt(5) - 1) / 2
    x1, x2 = hi - g * (hi - lo), lo + g * (hi - lo)
    f1, f2 = cost(a, b, x1, s, s2, q, r), cost(a, b, x2, s, s2, q, r)
    for _ in range(200):
        if f1 < f2:
            hi, x2, f2 = x2, x1, f1
            x1 = hi - g * (hi - lo)
            f1 = cost(a, b, x1, s, s2, q, r)
        else:
            lo, x1, f1 = x1, x2, f2
            x2 = lo + g * (hi - lo)
            f2 = cost(a, b, x2, s, s2, q, r)
    return (lo + hi) / 2


def regret(a, b, k, s, s2=1.0, q=1.0, r=0.1):
    """Excess real cost over the best memoryless student for the real plant."""
    return cost(a, b, k, s, s2, q, r) - cost(a, b, best_student_gain(a, b, s, s2, q, r), s, s2, q, r)


def bc_gain(g, P, s):
    """Least-squares gain of u = -g x regressed on z = x + zeta when Var x = P: g P / (P + s)."""
    return g * P / (P + s)


def dagger_fixed_point(g, a, b, s, s2=1.0):
    """On-policy limit: k = bc_gain(g, P(k), s) with P(k) the student's own loop in the plant (a, b, s2). Bisection on k - bc(k)."""
    f = lambda k: k - bc_gain(g, stationary_var(a, b, k, s, s2), s)
    lo, hi = 0.0, min(g, (a + 1) / b - 1e-9)
    if f(hi) <= 0:
        return hi
    for _ in range(200):
        m = (lo + hi) / 2
        if f(m) > 0:
            hi = m
        else:
            lo = m
    return (lo + hi) / 2


def dagger_path(g, a, b, s, s2=1.0, rounds=8):
    """Aggregated-data DAgger: round 0 is teacher data, round n adds data from the current student; pooled least squares.
    Returns the gains after each round (gain 0 is BC)."""
    Ps = [stationary_var(a, b, g, 0.0, s2)]
    ks = [g * Ps[0] / (Ps[0] + s)]
    for _ in range(rounds):
        Ps.append(stationary_var(a, b, ks[-1], s, s2))
        m = sum(Ps)
        ks.append(g * m / (m + len(Ps) * s))
    return ks


def dart_noise(g, a, b, s2, target_P):
    """Injected teacher-action noise nu >= 0 that makes the twin's demonstration state variance equal target_P (labels stay clean)."""
    c = a - b * g
    return max(0.0, ((1 - c * c) * target_P - s2) / (b * b))


def bc_fit(a, b, g, s, s2, n, rng, nu=0.0):
    """Monte-Carlo behaviour cloning: run the teacher for n steps in the plant (a, b, s2) with executed noise nu, record (z, -g x), fit
    the no-intercept least-squares gain."""
    x, num, den = 0.0, 0.0, 0.0
    sd_w, sd_z, sd_e = math.sqrt(s2), math.sqrt(s), math.sqrt(nu)
    for _ in range(200):
        x = (a - b * g) * x + sd_w * rng.gauss(0, 1) - b * sd_e * rng.gauss(0, 1)
    for _ in range(n):
        z = x + sd_z * rng.gauss(0, 1)
        num += z * (-g * x)
        den += z * z
        x = a * x - b * g * x + sd_w * rng.gauss(0, 1) - b * sd_e * rng.gauss(0, 1)
    return -num / den


def simulate_cost(a, b, k, s, s2, n, rng):
    """Monte-Carlo stage cost of the student in the plant (a, b, s2) with sensor noise s, q = 1, r = 0.1."""
    x, tot = 0.0, 0.0
    sd_w, sd_z = math.sqrt(s2), math.sqrt(s)
    for t in range(n + 200):
        z = x + sd_z * rng.gauss(0, 1)
        u = -k * z
        if t >= 200:
            tot += x * x + 0.1 * u * u
        x = a * x + b * u + sd_w * rng.gauss(0, 1)
    return tot / n
