"""Spinning 2-D lidar on a moving platform (real) vs a snapshot scan (twin).

Real sensor: the beam azimuth advances at 2*pi/tau, so beam i is fired at t_i = tau*i/n while the platform
moves along x (x(t) = v t + a t^2/2) and yaws (psi(t) = omega t).  Twin: every beam is fired at t = 0.
Pure Python, no dependencies.
"""
import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Room:
    d1: float = 10.0   # front wall x = +d1 (sensor starts at the origin)
    d2: float = 8.0    # back wall  x = -d2
    w: float = 5.0     # side walls y = +-w


@dataclass(frozen=True)
class Lidar:
    tau: float = 0.1            # seconds per revolution (10 Hz)
    n: int = 3600               # beams per revolution
    phi0: float = -math.pi / 2  # azimuth of the first beam: the seam sits on a side wall (parallel to x)
    spin: int = 1               # +1 counter-clockwise, -1 clockwise

    def t(self, i):
        return self.tau * i / self.n

    def phi(self, t):
        return self.phi0 + self.spin * 2 * math.pi * t / self.tau


def pose(t, v=0.0, a=0.0, omega=0.0):
    return v * t + 0.5 * a * t * t, omega * t


def cast(room, px, py, alpha):
    """Range from (px, py) along world angle alpha to the rectangle's walls."""
    c, s = math.cos(alpha), math.sin(alpha)
    best = math.inf
    if c > 1e-15:
        best = min(best, (room.d1 - px) / c)
    if c < -1e-15:
        best = min(best, (-room.d2 - px) / c)
    if s > 1e-15:
        best = min(best, (room.w - py) / s)
    if s < -1e-15:
        best = min(best, (-room.w - py) / s)
    return best


def scan(room, lid, v=0.0, a=0.0, omega=0.0, sigma=0.0, rng=None):
    """Real scan: list of (t, phi, r); the platform moves while the beam sweeps."""
    out = []
    for i in range(lid.n):
        t = lid.t(i)
        phi = lid.phi(t)
        x, psi = pose(t, v, a, omega)
        r = cast(room, x, 0.0, psi + phi)
        if sigma:
            r += rng.gauss(0.0, sigma)
        out.append((t, phi, r))
    return out


def snapshot(room, lid, sigma=0.0, rng=None):
    """Twin scan: all beams fired at t = 0 from the start pose."""
    return scan(room, lid, 0.0, 0.0, 0.0, sigma, rng)


def naive_points(sc):
    """Place every return in the sensor frame of the scan start (what a snapshot twin assumes)."""
    return [(r * math.cos(phi), r * math.sin(phi)) for _, phi, r in sc]


def deskew_points(sc, v=0.0, a=0.0, omega=0.0):
    """Place every return using the platform pose at its firing time (motion compensation)."""
    pts = []
    for t, phi, r in sc:
        x, psi = pose(t, v, a, omega)
        pts.append((x + r * math.cos(phi + psi), r * math.sin(phi + psi)))
    return pts


def fan(sc, center, half):
    """Indices of beams within `half` radians of azimuth `center`."""
    return [k for k, (_, phi, _) in enumerate(sc) if abs((phi - center + math.pi) % (2 * math.pi) - math.pi) < half]


def tilt(points):
    """Total-least-squares tilt of a near-vertical line: atan(dx/dy) of its principal direction (radians)."""
    n = len(points)
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    sxx = sum((p[0] - mx) ** 2 for p in points)
    syy = sum((p[1] - my) ** 2 for p in points)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in points)
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)    # direction of the major axis from +x
    dx, dy = math.cos(ang), math.sin(ang)
    if dy < 0:
        dx, dy = -dx, -dy
    return math.atan2(dx, dy)


def wall_x(points, idx):
    return sum(points[k][0] for k in idx) / len(idx)


# ---- closed forms (constant velocity, spin +1, seam on a side wall) -----------------------------------------
def naive_wall_x(room, lid, v, phi, front=True):
    """Naive x of the front (or back) wall point seen at azimuth phi: d - v t(phi), with the wall's own sign."""
    t = lid.tau * (phi - lid.phi0) / (2 * math.pi) * lid.spin
    return (room.d1 if front else -room.d2) - v * t


def tilt_first_order(room, lid, v, front=True):
    """First-order wall tilt at the wall centre: -+ spin v tau / (2 pi d)."""
    d = room.d1 if front else room.d2
    return (-1 if front else 1) * lid.spin * v * lid.tau / (2 * math.pi * d)


def length_bias(lid, v):
    """Apparent front-to-back length minus true length: spin v tau / 2 (seam on a side wall)."""
    return lid.spin * v * lid.tau / 2


def converge_angle(room, lid, v):
    """Tilt(back) - tilt(front), first order: spin v tau/(2 pi) (1/d1 + 1/d2)."""
    return lid.spin * v * lid.tau / (2 * math.pi) * (1 / room.d1 + 1 / room.d2)


def velocity_from_converge(room, lid, theta):
    """Invert converge_angle using wall distances measured in the scan itself."""
    return theta * 2 * math.pi / (lid.tau * lid.spin * (1 / room.d1 + 1 / room.d2))


def bearing_bias(lid, omega, beta):
    """Naive azimuth minus world bearing beta (from start heading) of a landmark, yaw rate omega, phi0 = 0, spin +1."""
    k = omega * lid.tau / (2 * math.pi)
    return -k * beta / (1 + k)


def landmark_azimuth(lid, omega, beta):
    """Azimuth at which a landmark at world bearing beta (phi0 = 0 scan) is actually returned, by bisection on time."""
    lo, hi = 0.0, lid.tau
    f = lambda t: (2 * math.pi * t / lid.tau + omega * t) - beta
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    t = 0.5 * (lo + hi)
    return 2 * math.pi * t / lid.tau


def odometry_velocity(room, lid, v0, a, center=0.0, half=0.3, scans=2):
    """Front-wall scan-to-scan velocity estimate from naive scans k=0,1: (x_k - x_{k+1}) / tau, frames at scan starts."""
    xs = []
    for k in range(scans):
        t0 = k * lid.tau
        x0 = v0 * t0 + 0.5 * a * t0 * t0
        vk = v0 + a * t0
        r = Room(room.d1 - x0, room.d2 + x0, room.w)
        sc = scan(r, lid, vk, a)
        idx = fan(sc, center, half)
        xs.append(wall_x(naive_points(sc), idx))
    return (xs[0] - xs[1]) / lid.tau
