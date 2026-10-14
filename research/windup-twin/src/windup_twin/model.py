"""Windup twin.  Real plant: integrator x' = sat_U(u) + d (a velocity-commanded axis, bounded command, constant load d),
PI control u = -kp x - ki z, z' = x.  Twin: no saturation, d = 0, closed loop s^2 + kp s + ki (stable for all kp, ki > 0).
With kp = 2 zeta wn, ki = wn^2 the twin's step overshoot is exp(-pi zeta / sqrt(1 - zeta^2)), independent of the step size.
Real: while u is saturated at -U the integrator state z keeps accumulating ("windup"), so the overshoot depends on x0/U.
"""
import math


def gains(wn, zeta):
    return 2.0 * zeta * wn, wn * wn


def twin_overshoot(zeta):
    return math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)) if zeta < 1 else 0.0


def sat(u, U):
    return max(-U, min(U, u))


def simulate(kp, ki, U, x0, T, d=0.0, dt=1e-3, antiwindup=False):
    """RK4 of x' = sat(u) + d, z' = x (back-calculation-free clamping if antiwindup: z frozen while u saturated and
    x pushes it further into saturation).  Returns (xs, zs) sampled every dt, including t = 0."""
    def u_of(x, z):
        return -kp * x - ki * z

    def f(x, z):
        u = u_of(x, z)
        zd = x
        if antiwindup and abs(u) > U and u * (-x) > 0:   # saturated and the integrator drives u further out
            zd = 0.0
        return sat(u, U) + d, zd

    n = int(round(T / dt))
    x, z = x0, 0.0
    xs, zs = [x], [z]
    for _ in range(n):
        a = f(x, z)
        b = f(x + dt / 2 * a[0], z + dt / 2 * a[1])
        c = f(x + dt / 2 * b[0], z + dt / 2 * b[1])
        e = f(x + dt * c[0], z + dt * c[1])
        x += dt / 6 * (a[0] + 2 * b[0] + 2 * c[0] + e[0])
        z += dt / 6 * (a[1] + 2 * b[1] + 2 * c[1] + e[1])
        xs.append(x)
        zs.append(z)
    return xs, zs


def overshoot(xs, x0):
    """Largest excursion to the far side of the target, as a fraction of |x0|."""
    s = 1 if x0 > 0 else -1
    return max(0.0, max(-x * s for x in xs) / abs(x0))


def settle_time(xs, x0, dt, tol=0.02):
    """Last time |x| exceeds tol |x0| (inf if the run ends outside the band)."""
    lim = tol * abs(x0)
    last = -1
    for i, x in enumerate(xs):
        if abs(x) > lim:
            last = i
    if last == len(xs) - 1:
        return math.inf
    return (last + 1) * dt


def saturated_phase(kp, ki, U, x0, d=0.0):
    """Exact closed form for the initial saturated phase (x0 > 0, u = -U): x(t) = x0 - (U-d) t,
    z(t) = x0 t - (U-d) t^2/2.  Returns (t_exit, z_exit): the first t with kp x + ki z = U, or None if u never reaches
    -U or never leaves it (requires U > d)."""
    a = U - d
    if a <= 0 or kp * x0 <= U:
        return None
    # g(t) = kp (x0 - a t) + ki (x0 t - a t^2 / 2) - U is decreasing-then-... solve g(t) = 0 by the smaller positive root
    A, B, C = -ki * a / 2.0, ki * x0 - kp * a, kp * x0 - U
    disc = B * B - 4 * A * C
    if disc < 0:
        return None
    r = [(-B + s * math.sqrt(disc)) / (2 * A) for s in (1, -1)]
    r = [t for t in r if t > 0]
    if not r:
        return None
    t = min(r)
    return t, x0 * t - a * t * t / 2.0
