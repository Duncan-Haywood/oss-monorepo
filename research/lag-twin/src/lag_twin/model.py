"""Lag twin.  Real plant: unit mass x'' = u with a first-order actuator  tau u' = u_cmd - u,  under PD control
u_cmd = -kp x - kd v.  Twin: instantaneous actuator (tau = 0), closed loop s^2 + kd s + kp, stable for every kp, kd > 0.
Real: tau s^3 + s^2 + kd s + kp, Hurwitz iff kd > tau kp (Routh), i.e. tau < tau* = kd/kp.  At tau = tau* the
imaginary roots are +-j sqrt(kp): the loop starts to hunt at the twin's own natural frequency.
With kp = wn^2, kd = 2 zeta wn everything depends only on (zeta, eps = wn tau): stable iff eps < 2 zeta.
"""
import cmath
import math


def gains(wn, zeta):
    return wn * wn, 2.0 * zeta * wn


def tau_star(kp, kd):
    """Largest actuator time constant for which the real loop is stable."""
    return kd / kp


def real_stable(kp, kd, tau):
    return kp > 0 and kd > 0 and kd > tau * kp


def poles(kp, kd, tau):
    """Closed-loop poles: roots of tau s^3 + s^2 + kd s + kp (Durand-Kerner), or of s^2 + kd s + kp if tau == 0."""
    if tau == 0.0:
        d = cmath.sqrt(kd * kd - 4 * kp)
        return [(-kd + d) / 2, (-kd - d) / 2]
    c = [1.0, 1.0 / tau, kd / tau, kp / tau]          # monic
    r = [(0.4 + 0.9j) ** k * max(1.0, abs(c[3]) ** (1 / 3)) for k in range(3)]
    for _ in range(500):
        new = []
        for i in range(3):
            p = ((r[i] + c[1]) * r[i] + c[2]) * r[i] + c[3]
            q = 1.0
            for j in range(3):
                if j != i:
                    q *= r[i] - r[j]
            new.append(r[i] - p / q)
        done = max(abs(a - b) for a, b in zip(new, r)) < 1e-15 * (1 + max(abs(a) for a in new))
        r = new
        if done:
            break
    return r


def decay_rate(kp, kd, tau):
    """Asymptotic decay rate -max Re(pole): negative if unstable."""
    return -max(p.real for p in poles(kp, kd, tau))


def growth_rate_slope(wn, zeta):
    """d Re(s) / d tau at tau = tau*: wn^2 / (2 (1 + 4 zeta^2))  (implicit differentiation of the characteristic polynomial)."""
    return wn * wn / (2.0 * (1.0 + 4.0 * zeta * zeta))


def step(kp, kd, tau, x0, T, dt=None):
    """RK4 response from x(0) = x0, v = 0, u = 0 (actuator at rest).  Returns list of x at t = dt, 2dt, ... """
    if dt is None:
        dt = min(1e-3, tau / 20.0) if tau > 0 else 1e-3
    n = int(round(T / dt))

    def f(x, v, u):
        if tau == 0.0:
            return v, -kp * x - kd * v, 0.0
        return v, u, (-kp * x - kd * v - u) / tau

    x, v, u = x0, 0.0, 0.0
    out = []
    for _ in range(n):
        a = f(x, v, u)
        b = f(x + dt / 2 * a[0], v + dt / 2 * a[1], u + dt / 2 * a[2])
        c = f(x + dt / 2 * b[0], v + dt / 2 * b[1], u + dt / 2 * b[2])
        d = f(x + dt * c[0], v + dt * c[1], u + dt * c[2])
        x += dt / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0])
        v += dt / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1])
        u += dt / 6 * (a[2] + 2 * b[2] + 2 * c[2] + d[2])
        out.append(x)
    return out


def twin_overshoot(zeta):
    """Overshoot of the 2nd-order twin past the target, as a fraction of x0 (0 for zeta >= 1)."""
    return math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)) if zeta < 1 else 0.0


def overshoot(xs, x0):
    """Largest excursion to the far side of the target, as a fraction of |x0|."""
    return max(0.0, max(-x * (1 if x0 > 0 else -1) for x in xs) / abs(x0))
