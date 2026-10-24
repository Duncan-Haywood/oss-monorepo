"""Closed-loop mowing simulation: the plan, driven by the line follower on noisy RTK fixes.

What is modelled:
* differential-drive kinematics with a wheel-speed slip factor (grass);
* position from RTK GNSS with Gaussian noise (fixed solution: ~1-2 cm);
* fix losses (RTK float / no corrections) as a Poisson process: the robot
  stops with the blade off and waits for the fix to return, as real wire-free
  mowers do, so a loss costs time, not coverage;
* heading from the IMU with a small Gaussian error.

What is not: wheel slip on slopes, uneven ground, the shell bumping into
things, grass load slowing the blade. Treat results as a check on the
planner and follower, not a prediction for a real lawn.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from . import coverage
from .drive import DiffDrive, LineFollower, Pose
from .planner import Lawn, Plan


@dataclass(frozen=True)
class Noise:
    gnss_sigma: float = 0.015        # m, per fix, RTK fixed
    heading_sigma_deg: float = 1.0   # IMU yaw error
    slip: float = 0.03               # fraction of wheel speed lost on grass (mean)
    fix_losses_per_hour: float = 2.0
    mean_outage_s: float = 30.0


@dataclass
class SimResult:
    time_s: float
    driven_m: float
    waiting_s: float
    fix_losses: int
    coverage: coverage.Coverage
    finished: bool
    max_cross_track_m: float


def run(lawn: Lawn, p: Plan, noise: Noise = Noise(), drive: DiffDrive | None = None, dt: float = 0.05,
        seed: int = 1, res: float = 0.05, max_time_s: float | None = None) -> SimResult:
    rng = random.Random(seed)
    drive = drive or DiffDrive(cruise=p.settings.speed, turn_rate=p.settings.turn_rate)
    path = p.path
    follower = LineFollower(path, drive)
    a, b = path[0], path[1]
    truth = Pose(a[0], a[1], math.atan2(b[1] - a[1], b[0] - a[0]))
    raster = coverage.Raster(lawn, res)
    r = p.settings.cut_width / 2
    limit = max_time_s or 3 * p.time_s + 600
    t = driven = waiting = 0.0
    losses = 0
    outage_left = 0.0
    loss_rate = noise.fix_losses_per_hour / 3600.0
    max_xt = 0.0
    while t < limit and not follower.finished:
        t += dt
        if outage_left > 0:
            outage_left -= dt
            waiting += dt
            continue
        if rng.random() < loss_rate * dt:
            losses += 1
            outage_left = rng.expovariate(1.0 / noise.mean_outage_s)
            continue
        est = Pose(truth.x + rng.gauss(0, noise.gnss_sigma), truth.y + rng.gauss(0, noise.gnss_sigma),
                   truth.heading + math.radians(rng.gauss(0, noise.heading_sigma_deg)))
        left, right = follower.command(est)
        k = 1.0 - noise.slip * (0.5 + rng.random())
        nxt = drive.integrate(truth, left * k, right * k, dt)
        raster.sweep((truth.x, truth.y), (nxt.x, nxt.y), r)
        driven += math.hypot(nxt.x - truth.x, nxt.y - truth.y)
        truth = nxt
        if not follower.finished:
            sa, sb = path[follower.seg], path[follower.seg + 1]
            max_xt = max(max_xt, _cross_track((truth.x, truth.y), sa, sb))
    return SimResult(t, driven, waiting, losses, raster.result(), follower.finished, max_xt)


def _cross_track(p, a, b) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    if L == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    return abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / L
