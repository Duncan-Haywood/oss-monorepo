"""Follow-up to thrust-twin.  Vehicle x'' = g ((u/u_h)^2 - 1), throttle ratio r = u/u_h in [0, 2]: true thrust exponent 2,
hover trim exact (so no steady offset).  The controller's thrust model is T = g r^n_hat, with an assumed exponent n_hat
(the truth is 2).  PD command a_cmd = kp (x0 - x) - kd v, then one of two inverses of that model:
  linear: r = 1 + a_cmd / (n_hat g)            (inverse of the hover linearisation; thrust-twin uses n_hat = 2)
  exact : r = (1 + a_cmd / g)^(1/n_hat)        (a_cmd <= -g has no solution -> r = 0)
Realised x'' = g (r^2 - 1).  With n_hat = 2 the exact inverse gives x'' = a_cmd inside the throttle limits a_cmd in [-g, 3g].
"""
import math

G = 9.81


def ratio(a_cmd, n_hat, mode, g=G):
    if mode == "linear":
        r = 1.0 + a_cmd / (n_hat * g)
    elif mode == "exact":
        r = max(0.0, 1.0 + a_cmd / g) ** (1.0 / n_hat)
    else:
        raise ValueError(mode)
    return min(max(r, 0.0), 2.0)


def accel(a_cmd, n_hat, mode, g=G):
    r = ratio(a_cmd, n_hat, mode, g)
    return g * (r * r - 1.0)


def gains(wn, zeta):
    return wn * wn, 2.0 * zeta * wn


def step(kp, kd, x0, T, n_hat, mode, dt=1e-3, g=G):
    def acc(x, v):
        return accel(kp * (x0 - x) - kd * v, n_hat, mode, g)

    x = v = 0.0
    out = []
    for _ in range(int(round(T / dt))):
        k1x, k1v = v, acc(x, v)
        k2x, k2v = v + dt / 2 * k1v, acc(x + dt / 2 * k1x, v + dt / 2 * k1v)
        k3x, k3v = v + dt / 2 * k2v, acc(x + dt / 2 * k2x, v + dt / 2 * k2v)
        k4x, k4v = v + dt * k3v, acc(x + dt * k3x, v + dt * k3v)
        x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
        v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        out.append(x)
    return out


def overshoot(xs, x0):
    s = 1.0 if x0 > 0 else -1.0
    return max(0.0, max((x - x0) * s for x in xs) / abs(x0))


def settle_time(xs, x0, dt=1e-3, tol=0.02):
    last = None
    for i, x in enumerate(xs):
        if abs(x - x0) > tol * abs(x0):
            last = i
    if last is None:
        return 0.0
    return math.inf if last == len(xs) - 1 else (last + 1) * dt


def twin_overshoot(zeta):
    return math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)) if zeta < 1 else 0.0
