"""Stiction twin.  Real plant: unit mass with Coulomb friction, kinetic level Fc and static (breakaway) level Fs >= Fc;
twin: frictionless (or, with Fs = Fc, a twin whose sliding friction was identified correctly).

Loop (semi-implicit Euler, step dt): z += x dt; u = -kp x - kd v - ki z; while v == 0 and |u| <= Fs the mass sticks;
otherwise v += dt (u - Fc sgn(v or u)), and a sign change of v within a step is a stop (v = 0).  Twin (no friction):
s^3 + kd s^2 + kp s + ki is Hurwitz iff kd kp > ki.  The dynamics are piecewise linear in (x, v, z, Fc, Fs)
jointly, so scaling (x0, Fc, Fs) by s scales the whole trajectory by s exactly.
"""


def run_loop(kp, kd, ki, Fc, Fs, x0, n, dt=0.01, v0=0.0):
    """Real loop from position x0, velocity v0, z = 0.  Returns the list of positions x after each of n steps."""
    x, v, z = x0, v0, 0.0
    xs = []
    for _ in range(n):
        z += x * dt
        u = -kp * x - kd * v - ki * z
        if not (v == 0.0 and abs(u) <= Fs):
            sg = (1.0 if v > 0 else -1.0) if v != 0.0 else (1.0 if u > 0 else -1.0)
            vn = v + dt * (u - Fc * sg)
            if v != 0.0 and vn * v < 0:
                vn = 0.0
            v = vn
        x += v * dt
        xs.append(x)
    return xs


def twin_stable(kp, kd, ki):
    """Routh condition for the frictionless twin s^3 + kd s^2 + kp s + ki."""
    return kp > 0 and kd > 0 and ki > 0 and kd * kp > ki


def tail_amplitude(xs, frac=0.1):
    """Half peak-to-peak of the last `frac` of the trajectory."""
    t = xs[int(len(xs) * (1 - frac)):]
    return (max(t) - min(t)) / 2


def max_error(xs, frac=0.1):
    t = xs[int(len(xs) * (1 - frac)):]
    return max(abs(a) for a in t)
