"""Predictability horizon of a Lorenz-63 digital twin (stdlib only)."""
import math

SIGMA, RHO, BETA = 10.0, 28.0, 8.0 / 3.0


def f(s, p):
    x, y, z = s
    sg, r, b = p
    return (sg * (y - x), x * (r - z) - y, x * y - b * z)


def rk4(s, p, h):
    def add(a, k, c):
        return tuple(ai + c * ki for ai, ki in zip(a, k))
    k1 = f(s, p)
    k2 = f(add(s, k1, h / 2), p)
    k3 = f(add(s, k2, h / 2), p)
    k4 = f(add(s, k3, h), p)
    return tuple(si + h / 6 * (a + 2 * b + 2 * c + d)
                 for si, a, b, c, d in zip(s, k1, k2, k3, k4))


def spin_up(p=(SIGMA, RHO, BETA), h=0.005, t=20.0):
    s = (1.0, 1.0, 1.0)
    for _ in range(int(t / h)):
        s = rk4(s, p, h)
    return s


def dist(a, b):
    return math.sqrt(sum((u - v) ** 2 for u, v in zip(a, b)))


def horizon(s0, delta0, tol, twin_p=(SIGMA, RHO, BETA), h=0.005, tmax=40.0, dirn=(1, 0, 0)):
    """Time until twin (started delta0 away, twin_p) is tol away from truth."""
    n = math.sqrt(sum(d * d for d in dirn))
    s_t = s0
    s_w = tuple(a + delta0 * d / n for a, d in zip(s0, dirn))
    truth = (SIGMA, RHO, BETA)
    for i in range(int(tmax / h)):
        s_t = rk4(s_t, truth, h)
        s_w = rk4(s_w, twin_p, h)
        if dist(s_t, s_w) >= tol:
            return (i + 1) * h
    return tmax


def lyapunov(s0, h=0.005, t=60.0, d0=1e-8, renorm=20):
    """Largest exponent by Benettin two-trajectory renormalisation."""
    p = (SIGMA, RHO, BETA)
    a, b = s0, (s0[0] + d0, s0[1], s0[2])
    tot, steps = 0.0, int(t / h)
    for i in range(1, steps + 1):
        a, b = rk4(a, p, h), rk4(b, p, h)
        if i % renorm == 0:
            d = dist(a, b)
            tot += math.log(d / d0)
            b = tuple(u + (v - u) * d0 / d for u, v in zip(a, b))
    return tot / (steps * h)
