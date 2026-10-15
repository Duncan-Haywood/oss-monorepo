"""Mount twin.  A robot drives a planar path with heading theta(t) and body-frame velocity vb(t).  A radar measures ego
velocity in the *sensor* frame, which is yawed by e relative to the body.  The twin assumes e = 0 and uses the sensor-frame
velocity as the body-frame one.  In 2-D rotations commute, so the dead-reckoned path is the true path rotated by -e about
the start: error = 2 sin(e/2) |p(t) - p(0)|, bounded by the path diameter and zero after any closed loop.
"""
import math
import random


def rot(a, v):
    c, s = math.cos(a), math.sin(a)
    return (c * v[0] - s * v[1], s * v[0] + c * v[1])


def random_path(n, speed=1.0, turn=0.1, seed=0):
    """Heading random walk with step std `turn`; returns (thetas, body velocities)."""
    r = random.Random(seed)
    th, ths = 0.0, []
    for _ in range(n):
        th += r.gauss(0, turn)
        ths.append(th)
    return ths, [(speed, 0.0)] * n


def integrate(thetas, vbs, dt=1.0):
    p, out = (0.0, 0.0), [(0.0, 0.0)]
    for th, vb in zip(thetas, vbs):
        w = rot(th, vb)
        p = (p[0] + w[0] * dt, p[1] + w[1] * dt)
        out.append(p)
    return out


def dead_reckon(thetas, vbs, e, dt=1.0):
    """Twin's estimate: the sensor-frame velocity (true body velocity rotated by -e) used as body velocity."""
    return integrate(thetas, [rot(-e, v) for v in vbs], dt)


def fit_rotation(est, ref):
    """Closed-form least-squares rotation angle a minimising sum |R(a) est_i - ref_i|^2 (2-D Kabsch about the origin)."""
    cr = sum(x[0] * y[1] - x[1] * y[0] for x, y in zip(est, ref))
    dt = sum(x[0] * y[0] + x[1] * y[1] for x, y in zip(est, ref))
    return math.atan2(cr, dt)


def chord(e):
    return 2.0 * math.sin(abs(e) / 2.0)


def fit_std(e_sigma, pts):
    """Large-sample std of the fitted angle when ref = truth + N(0, sigma^2 I): sigma / sqrt(sum |p_i|^2)."""
    return e_sigma / math.sqrt(sum(p[0] ** 2 + p[1] ** 2 for p in pts))


def lap_error_3d(e, radius, laps, speed=1.0):
    """3-D: level circle, mount *pitched* by e.  The estimated climb rate is speed*sin(e), so the vertical error after
    `laps` laps is exactly laps * 2 pi radius sin(e): loop closure in x-y does not remove it."""
    return laps * 2 * math.pi * radius * math.sin(e)


def simulate_lap_3d(e, radius, laps, steps_per_lap=2000, speed=1.0):
    """Numerical check of lap_error_3d: integrate R_z(theta) R_y(-e) (speed,0,0) around a circle of the given radius."""
    n = steps_per_lap * laps
    dth = 2 * math.pi / steps_per_lap
    dt = radius * dth / speed
    x = y = z = 0.0
    for k in range(n):
        th = (k + 0.5) * dth
        vx, vz = speed * math.cos(e), speed * math.sin(e)
        x += (math.cos(th) * vx) * dt
        y += (math.sin(th) * vx) * dt
        z += vz * dt
    return x, y, z
