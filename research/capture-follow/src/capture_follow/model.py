"""2-D crowd simulation of camera platforms that follow a walking creator.

World: a W x W m periodic plaza (minimum-image distances). Pedestrians walk straight at constant speed and
turn at random times; they do not react to any platform (the conservative case for the platform). The
creator walks a similar path at 1.3 m/s. A platform tries to hold a target distance behind the creator.
Step lines (curbs or stairs) run across the plaza every STEP_X metres with one ramp gap; a wheeled platform
cannot cross a step line outside the gap. Every platform figure is an assumption (see README).
"""
import math
import random
from dataclasses import dataclass

W = 30.0            # plaza side (m)
STEP_X = 10.0       # step lines at x = 0, 10, 20 (m)
RAMP = (13.0, 17.0)  # y range of the ramp gap in each step line (m)
CREATOR_V = 1.3
PED_V = 1.2
TARGET = 2.5        # framing distance to hold (m)
BAND = 0.25         # framed if |d - TARGET| <= BAND * TARGET
CONTACT = 0.5       # contact if a pedestrian is nearer than this (m)
CLOSE = 1.0         # close pass if nearer than this (m)
SIGHT = 0.3         # a pedestrian this close to the camera-creator line blocks the view (m)


@dataclass(frozen=True)
class Platform:
    name: str
    vmax: float       # m/s
    accel: float      # m/s^2
    avoid: bool       # repel from pedestrians
    mobile: bool = True
    wheeled: bool = False   # blocked by step lines outside the ramp
    cross_speed: float = 1.0  # speed factor while crossing a step line (wheel-legs < 1)
    flies: bool = False
    base_w: float = 0.0     # camera, compute, gimbal (W)
    move_w: float = 0.0     # extra W at vmax, scaled linearly with speed
    packed_l: float = 0.0   # packed volume (litres), assumed
    mass_kg: float = 0.0


PLATFORMS = [
    Platform("tripod", 0, 0, False, mobile=False, base_w=5, packed_l=3.0, mass_kg=1.2),
    Platform("wheeled, no avoidance", 1.5, 1.5, False, wheeled=True, base_w=15, move_w=60, packed_l=25, mass_kg=6),
    Platform("wheeled", 1.5, 1.5, True, wheeled=True, base_w=15, move_w=60, packed_l=25, mass_kg=6),
    Platform("wheel-legs", 1.5, 1.5, True, cross_speed=0.4, base_w=25, move_w=90, packed_l=40, mass_kg=10),
    Platform("drone, no avoidance", 8.0, 5.0, False, flies=True, base_w=60, move_w=40, packed_l=1.5, mass_kg=0.25),
    Platform("drone", 8.0, 5.0, True, flies=True, base_w=60, move_w=40, packed_l=1.5, mass_kg=0.25),
]


def wrap(v):
    return v % W


def delta(a, b):
    """Minimum-image difference a - b on the periodic plaza."""
    d = (a - b + W / 2) % W - W / 2
    return d


def dist(p, q):
    return math.hypot(delta(p[0], q[0]), delta(p[1], q[1]))


def crosses_step(p, q):
    """True if the move p -> q crosses a step line outside the ramp gap."""
    kp, kq = math.floor(p[0] / STEP_X), math.floor(q[0] / STEP_X)
    if kp == kq:
        return False
    y = q[1]
    return not (RAMP[0] <= y % W <= RAMP[1])


def crosses_any(p, q):
    return math.floor(p[0] / STEP_X) != math.floor(q[0] / STEP_X)


class Walker:
    def __init__(self, rng, speed):
        self.p = [rng.uniform(0, W), rng.uniform(0, W)]
        self.speed, self.rng = speed, rng
        self.turn_in = 0
        self.h = rng.uniform(0, 2 * math.pi)

    def step(self, dt):
        self.turn_in -= dt
        if self.turn_in <= 0:
            self.h += self.rng.gauss(0, 0.8)
            self.turn_in = self.rng.uniform(4, 12)
        self.p[0] = wrap(self.p[0] + self.speed * math.cos(self.h) * dt)
        self.p[1] = wrap(self.p[1] + self.speed * math.sin(self.h) * dt)


def seg_dist(p, a, b):
    """Distance from point p to segment a-b (minimum image, relative to a)."""
    bx, by = delta(b[0], a[0]), delta(b[1], a[1])
    px, py = delta(p[0], a[0]), delta(p[1], a[1])
    L2 = bx * bx + by * by
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (px * bx + py * by) / L2))
    return math.hypot(px - t * bx, py - t * by)


def simulate(plat, density, seed, duration=240.0, dt=0.25, steps_on=True):
    """Run one walk. Returns a dict of metrics. All platforms see the same crowd for a given seed."""
    rng = random.Random(seed)
    n = int(round(density * W * W))
    peds = [Walker(rng, PED_V) for _ in range(n)]
    creator = Walker(rng, CREATOR_V)
    creator.p = [5.0, 15.0]  # starts on the ramp row
    # platform starts TARGET behind the creator
    pos = [creator.p[0] - TARGET * math.cos(creator.h), creator.p[1] - TARGET * math.sin(creator.h)]
    if plat.wheeled:
        pos[1] = creator.p[1]
    vel = [0.0, 0.0]
    steps = int(duration / dt)
    framed = clear = blocked = 0
    contact_steps = close_steps = 0
    contacts = 0
    in_contact = False
    energy_j = 0.0
    dev = 0.0
    for _ in range(steps):
        for w in peds:
            w.step(dt)
        creator.step(dt)
        c = creator.p
        # desired point: TARGET behind the creator along its heading
        tx = c[0] - TARGET * math.cos(creator.h)
        ty = c[1] - TARGET * math.sin(creator.h)
        if plat.mobile:
            ex, ey = delta(tx, pos[0]), delta(ty, pos[1])
            dvx, dvy = 1.5 * ex, 1.5 * ey
            if plat.avoid:
                for w in peds:
                    ax, ay = delta(pos[0], w.p[0]), delta(pos[1], w.p[1])
                    if abs(ax) < 2.0 and abs(ay) < 2.0:
                        d = math.hypot(ax, ay) or 1e-6
                        if d < 2.0:
                            k = 1.2 * (1 / d - 1 / 2.0)
                            dvx += k * ax / d
                            dvy += k * ay / d
            sp = math.hypot(dvx, dvy)
            vlim = plat.vmax
            if sp > vlim:
                dvx, dvy = dvx * vlim / sp, dvy * vlim / sp
            # accel limit
            ax_, ay_ = dvx - vel[0], dvy - vel[1]
            am = math.hypot(ax_, ay_)
            if am > plat.accel * dt:
                ax_, ay_ = ax_ * plat.accel * dt / am, ay_ * plat.accel * dt / am
            vel[0] += ax_
            vel[1] += ay_
            f = 1.0
            nx, ny = wrap(pos[0] + vel[0] * dt), wrap(pos[1] + vel[1] * dt)
            if steps_on and not plat.flies and crosses_any(pos, (nx, ny)):
                if plat.wheeled:
                    if crosses_step(pos, (nx, ny)):
                        nx, ny = pos[0], pos[1]
                        vel[0] = vel[1] = 0.0
                        blocked += 1
                else:
                    nx = wrap(pos[0] + vel[0] * dt * plat.cross_speed)
                    ny = wrap(pos[1] + vel[1] * dt * plat.cross_speed)
            pos[0], pos[1] = nx, ny
            v = math.hypot(vel[0], vel[1])
            energy_j += (plat.base_w + plat.move_w * min(1.0, v / plat.vmax)) * dt
        else:
            energy_j += plat.base_w * dt
        d = dist(pos, c)
        dev += abs(d - TARGET)
        if abs(d - TARGET) <= BAND * TARGET:
            framed += 1
        near = min((dist(pos, w.p) for w in peds), default=99.0)
        if near < CLOSE:
            close_steps += 1
        if near < CONTACT:
            contact_steps += 1
            if not in_contact:
                contacts += 1
            in_contact = True
        else:
            in_contact = False
        if plat.flies or not any(seg_dist(w.p, pos, c) < SIGHT for w in peds if dist(w.p, c) < d + 1):
            clear += 1
    hours = duration / 3600.0
    return {
        "framed": framed / steps, "clear": clear / steps, "blocked": blocked / steps,
        "close_s_per_h": close_steps * dt / hours, "contacts_per_h": contacts / hours,
        "wh_per_h": energy_j / 3600.0 / hours, "mean_dev": dev / steps,
    }
