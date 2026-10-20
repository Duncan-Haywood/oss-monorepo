"""Thrust twin.  Altitude hold of a unit-mass vehicle, x'' = T(u) - g, throttle u in [0, 1].
Real thrust T = k u^2 (hover throttle u_h = sqrt(g/k)).  Twin thrust: the linearisation at hover,
T_lin = g + 2 k u_h (u - u_h).  Controller designed in the twin: PD acceleration command
a_cmd = kp e + kd (-v),  e = target - x,  throttle u = u_h + a_cmd / (2 k u_h)  (the twin's exact inverse).
In the twin x'' = a_cmd exactly (linear second order).  In the real vehicle, with u = u_h + d, d = a_cmd/(2 k u_h):
  x'' = k (u_h + d)^2 - g = 2 k u_h d + k d^2 = a_cmd + a_cmd^2 / (4 g)          (because k u_h^2 = g)
so the realised acceleration depends only on a_cmd / g.  Over-delivers when climbing (a_cmd > 0), under-delivers
when descending, and hits the throttle floor u = 0 at a_cmd = -2g (free fall, x'' = -g).
"""
import math

G = 9.81


def accel_real(a_cmd, g=G, clip=True):
    """Realised acceleration x'' for commanded a_cmd.  Throttle clipped to [0, u_max = 2 u_h] if clip."""
    u_rel = 1.0 + a_cmd / (2.0 * g)          # u / u_h
    if clip:
        u_rel = min(max(u_rel, 0.0), 2.0)    # full throttle = twice hover (thrust-to-weight 4)
    return g * u_rel * u_rel - g


def accel_closed_form(a_cmd, g=G):
    return a_cmd + a_cmd * a_cmd / (4.0 * g)


def gains(wn, zeta):
    return wn * wn, 2.0 * zeta * wn


def step(kp, kd, x0, T, real=True, clip=True, dt=1e-3, g=G):
    """RK4 from x(0) = 0 to target x0 (error e = x0 - x), v = 0.  Returns list of x at dt, 2dt, ..."""
    def acc(x, v):
        a = kp * (x0 - x) - kd * v
        return accel_real(a, g, clip) if real else a

    n = int(round(T / dt))
    x = v = 0.0
    out = []
    for _ in range(n):
        k1x, k1v = v, acc(x, v)
        k2x, k2v = v + dt / 2 * k1v, acc(x + dt / 2 * k1x, v + dt / 2 * k1v)
        k3x, k3v = v + dt / 2 * k2v, acc(x + dt / 2 * k2x, v + dt / 2 * k2v)
        k4x, k4v = v + dt * k3v, acc(x + dt * k3x, v + dt * k3v)
        x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
        v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        out.append(x)
    return out


def overshoot(xs, x0):
    """Largest excursion past the target as a fraction of |x0|."""
    s = 1.0 if x0 > 0 else -1.0
    return max(0.0, max((x - x0) * s for x in xs) / abs(x0))


def settle_time(xs, x0, dt=1e-3, tol=0.02):
    """First time after which |x - x0| <= tol |x0| for good (inf if never)."""
    last = None
    for i, x in enumerate(xs):
        if abs(x - x0) > tol * abs(x0):
            last = i
    if last is None:
        return 0.0
    return math.inf if last == len(xs) - 1 else (last + 1) * dt


def twin_overshoot(zeta):
    return math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)) if zeta < 1 else 0.0
