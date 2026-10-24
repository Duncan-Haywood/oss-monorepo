"""Closed-loop coverage simulation: the plan driven by a noisy robot.

The planner's coverage figure assumes the robot is exactly on its path.
This drives the plan the way the robot's Pi does it (turn on the spot to
each segment's heading, then drive straight with cross-track correction)
through differential-drive kinematics with:

* wheel slip: each wheel's speed is off by a random factor (sigma
  `slip`), redrawn every `slip_period` seconds;
* localisation error: the controller sees the true pose plus an error
  that wanders slowly (a first-order Gauss-Markov process with time
  constant `tau`, standard deviation `pose_sigma` in position and
  `heading_sigma` in heading). Scan-matching error is correlated like
  this: white noise would average out in the controller and flatter it.

It paints the cleaning footprint along the true trajectory and reports
coverage, time, the worst off-path error and how often the bumper hit
something (walls stop the body: a move that would put any of it inside a
wall or furniture is refused, as the bumper and motors would). Seeded, so
it repeats. The noise levels are assumptions, not measurements of any
sensor.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from . import variants as V
from .coverage import EDGE, LANE, Plan, coverage, cspace, disk
from .drive import DiffDrive, Pose


@dataclass(frozen=True)
class Noise:
    slip: float = 0.03
    slip_period: float = 0.5
    pose_sigma: float = 0.02
    heading_sigma: float = 0.02
    tau: float = 5.0


@dataclass
class SimResult:
    coverage: float
    nominal_coverage: float
    time_s: float
    distance_m: float
    max_offtrack_m: float
    bumps: int = 0


def _wrap(a: float) -> float:
    return math.atan2(math.sin(a), math.cos(a))


def simulate(plan: Plan, tool: V.Tool, noise: Noise = Noise(), seed: int = 1, dt: float = 0.05,
             cruise: float = V.CRUISE, transit: float = V.TRANSIT, turn_rate: float = V.TURN_RATE,
             track: float = V.TRACK, radius: float = V.CHASSIS_RADIUS) -> SimResult:
    rng = random.Random(seed)
    g = plan.grid
    pts = plan.points()
    drive = DiffDrive(track_width=track, max_wheel_speed=1.0)
    pose = Pose(pts[0][0], pts[0][1], 0.0)
    body_ok = cspace(g, radius)
    bumps = 0
    painted = bytearray(g.w * g.h)
    painted_nominal = bytearray(g.w * g.h)
    offs = {EDGE: disk(tool.edge_reach / g.res), LANE: disk(tool.width / 2 / g.res)}
    slip_l = slip_r = 1.0
    t = next_slip = 0.0
    dist = 0.0
    worst = 0.0

    def mark(into, x, y, phase):
        o = offs.get(phase)
        if not o:
            return
        ci, cj = int(math.floor(x / g.res)), int(math.floor(y / g.res))
        for di, dj in o:
            i, j = ci + di, cj + dj
            if 0 <= i < g.w and 0 <= j < g.h and g.free[j * g.w + i]:
                into[j * g.w + i] = 1

    def fits(x, y):
        i, j = int(math.floor(x / g.res)), int(math.floor(y / g.res))
        return 0 <= i < g.w and 0 <= j < g.h and body_ok[j * g.w + i] == 1

    def step(left, right, phase):
        nonlocal pose, t, next_slip, slip_l, slip_r, dist, bumps
        if t >= next_slip:
            slip_l = 1 + rng.gauss(0, noise.slip)
            slip_r = 1 + rng.gauss(0, noise.slip)
            next_slip = t + noise.slip_period
        new = drive.integrate(pose, left * slip_l, right * slip_r, dt)
        if not fits(new.x, new.y):
            # Bumper contact: a round body slides along what it hit, or stops.
            bumps += 1
            if fits(new.x, pose.y):
                new = Pose(new.x, pose.y, new.heading)
            elif fits(pose.x, new.y):
                new = Pose(pose.x, new.y, new.heading)
            else:
                new = Pose(pose.x, pose.y, new.heading)
        dist += math.hypot(new.x - pose.x, new.y - pose.y)
        pose = new
        t += dt
        mark(painted, pose.x, pose.y, phase)

    a = math.exp(-dt / noise.tau)
    b = math.sqrt(1 - a * a)
    drift = [rng.gauss(0, noise.pose_sigma), rng.gauss(0, noise.pose_sigma), rng.gauss(0, noise.heading_sigma)]

    def seen():
        drift[0] = a * drift[0] + b * rng.gauss(0, noise.pose_sigma)
        drift[1] = a * drift[1] + b * rng.gauss(0, noise.pose_sigma)
        drift[2] = a * drift[2] + b * rng.gauss(0, noise.heading_sigma)
        return pose.x + drift[0], pose.y + drift[1], pose.heading + drift[2]

    for k in range(1, len(pts)):
        (ax, ay), (bx, by) = pts[k - 1], pts[k]
        phase = plan.phases[k]
        seg = math.hypot(bx - ax, by - ay)
        if seg == 0:
            continue
        hx, hy = (bx - ax) / seg, (by - ay) / seg
        n = max(1, int(math.ceil(seg / (g.res / 2))))
        for s in range(n + 1):
            mark(painted_nominal, ax + (bx - ax) * s / n, ay + (by - ay) * s / n, phase)
        want = math.atan2(hy, hx)
        # Turn on the spot until the seen heading is within 3 degrees.
        for _ in range(int(2 * math.pi / (turn_rate * dt)) + 20):
            ex, ey, eh = seen()
            err = _wrap(want - eh)
            if abs(err) < math.radians(3):
                break
            w = math.copysign(min(turn_rate, abs(err) / dt), err)
            step(-w * track / 2, w * track / 2, phase)
        speed = cruise if phase in (EDGE, LANE) else transit
        # Drive until the seen position passes the segment end.
        for _ in range(int(seg / (speed * dt) * 3) + 40):
            ex, ey, eh = seen()
            along = (ex - ax) * hx + (ey - ay) * hy
            if along >= seg:
                break
            cross = -(ex - ax) * hy + (ey - ay) * hx
            herr = _wrap(want - eh)
            omega = 2.0 * herr - 8.0 * cross
            v = min(speed, max(0.05, (seg - along) * 2))
            step(v - omega * track / 2, v + omega * track / 2, phase)
            true_cross = abs(-(pose.x - ax) * hy + (pose.y - ay) * hx)
            worst = max(worst, true_cross)
    return SimResult(coverage(g, painted), coverage(g, painted_nominal), t, dist, worst, bumps)
