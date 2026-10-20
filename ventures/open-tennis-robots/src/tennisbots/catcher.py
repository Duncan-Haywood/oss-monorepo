"""Catch-net positioning for the feeder: move the net to where the return will arrive.

The feeder stands behind the robot-side baseline on a base that slides
sideways (on wheels or a rail). Its catch net is a vertical frame in the
plane x = `plane_x`. While the player's return is in the air, the tracker
predicts where the ball will cross that plane and the base drives there.
The ball drops into a funnel at the bottom of the net and rolls back into
the feeder's hopper, so caught returns are re-fed.

`study()` runs that loop in simulation over randomised returns, with
camera noise and latency, so you can size the net and the drive before you
build them.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from . import ballistics as bl
from . import court
from .tracker import BallTracker


@dataclass(frozen=True)
class CatchRig:
    net_width: float = 3.0       # m, usable catching width
    net_height: float = 2.5      # m, top of the frame
    plane_x: float = -court.HALF_LENGTH - 0.8
    rail_half: float = 4.0       # base centre may travel +/- this far from the centre line
    max_speed: float = 2.5       # m/s, base lateral speed
    max_accel: float = 5.0       # m/s^2
    latency: float = 0.10        # s, camera exposure -> motor command

    def catches(self, base_y: float, ball_y: float, ball_z: float, ball_r: float = bl.DEFAULT_BALL.radius) -> bool:
        return abs(ball_y - base_y) <= self.net_width / 2 - ball_r and ball_z <= self.net_height - ball_r


def step_toward(y: float, v: float, target: float, dt: float, vmax: float, amax: float) -> tuple[float, float]:
    """One control step of a time-optimal (bang-bang with braking) 1-D move."""
    d = target - y
    if abs(d) < 1e-3 and abs(v) <= amax * dt:
        return target, 0.0
    braking = v * v / (2 * amax)
    if v * d > 0 and braking >= abs(d):
        a = -math.copysign(amax, v)
    else:
        a = math.copysign(amax, d)
    v = max(-vmax, min(vmax, v + a * dt))
    y += v * dt
    return y, v


def move(y: float, v: float, target: float, duration: float, vmax: float, amax: float,
         dt: float = 0.002) -> tuple[float, float]:
    """Position and velocity after driving toward `target` for `duration` seconds."""
    t = 0.0
    while t < duration - 1e-12:
        h = min(dt, duration - t)
        y, v = step_toward(y, v, target, h, vmax, amax)
        t += h
    return y, v


@dataclass(frozen=True)
class CatchPlan:
    target_y: float          # where the base is told to go
    cross_t: float           # predicted time the ball reaches the net plane
    cross_y: float
    cross_z: float
    base_y_at_cross: float   # where the base will be by then
    catchable: bool


def plan(flight: bl.Flight, now: float, base_y: float, base_v: float, rig: CatchRig = CatchRig()) -> CatchPlan | None:
    """Plan a catch from a predicted flight; None if it never reaches the net plane."""
    c = flight.crossing(rig.plane_x)
    if c is None:
        return None
    target = max(-rig.rail_half, min(rig.rail_half, c.pos[1]))
    available = max(0.0, c.t - now - rig.latency)
    y_at, _ = move(base_y, base_v, target, available, rig.max_speed, rig.max_accel)
    return CatchPlan(target, c.t, c.pos[1], c.pos[2], y_at, rig.catches(y_at, c.pos[1], c.pos[2]))


# --- simulation study -------------------------------------------------------

@dataclass(frozen=True)
class ReturnDistribution:
    """Assumed spread of a club player's returns. Change it to match your player."""

    hit_x: tuple[float, float] = (10.0, 12.5)
    hit_y: tuple[float, float] = (-3.5, 3.5)
    hit_z: tuple[float, float] = (0.6, 1.2)
    speed: tuple[float, float] = (14.0, 28.0)          # m/s off the racket
    elevation_deg: tuple[float, float] = (1.0, 14.0)
    topspin_rpm: tuple[float, float] = (0.0, 2500.0)
    aim_y: tuple[float, float] = (-4.1, 4.1)            # where on the robot's baseline they aim

    def sample(self, rng: random.Random, ball: bl.BallModel) -> bl.Flight | None:
        """One return that lands in the robot's singles half, or None (into the net or out)."""
        u = lambda r: rng.uniform(*r)  # noqa: E731
        p = (u(self.hit_x), u(self.hit_y), u(self.hit_z))
        aim_y = u(self.aim_y)
        az = math.atan2(aim_y - p[1], -court.HALF_LENGTH - p[0])
        v = bl.launch_velocity(u(self.speed), math.radians(u(self.elevation_deg)), az)
        spin = bl.spin_vector(v, u(self.topspin_rpm) * bl.RPM)
        f = bl.simulate(p, v, spin, ball=ball, dt=0.004, max_bounces=3, net=True)
        b = f.first_bounce
        if f.hit_net or b is None or not court.singles_half(-1).contains(b.pos[0], b.pos[1]):
            return None
        return f


@dataclass
class StudyResult:
    returns: int = 0
    caught: int = 0
    too_wide: int = 0
    too_high: int = 0
    stopped_short: int = 0

    @property
    def catch_rate(self) -> float:
        return self.caught / self.returns if self.returns else 0.0


def study(n: int = 300, rig: CatchRig = CatchRig(), dist: ReturnDistribution = ReturnDistribution(), *,
          seed: int = 1, fps: float = 120.0, sigma: float = 0.05, replan_hz: float = 20.0,
          ball: bl.BallModel = bl.DEFAULT_BALL) -> StudyResult:
    """Closed-loop simulation: noisy camera fixes -> tracker -> plan -> base motion.

    The base starts at rest at a random spot within 1 m of the centre line
    (where it fed from). Every 1/replan_hz s it re-predicts the crossing and
    retargets; commands take effect `rig.latency` s after the frame they
    were computed from.
    """
    rng = random.Random(seed)
    res = StudyResult()
    while res.returns < n:
        truth = dist.sample(rng, ball)
        if truth is None:
            continue
        res.returns += 1
        cross = truth.crossing(rig.plane_x)
        if cross is None:
            res.stopped_short += 1
            continue
        tracker = BallTracker(measurement_sigma=sigma, ball=ball)
        y, v = rng.uniform(-1, 1), 0.0
        target = y
        pending: list[tuple[float, float]] = []   # (time command takes effect, target)
        frame = 1 / fps
        next_plan = 0.0
        next_frame = 0.0
        t = 0.0
        states = truth.states
        i = 0
        dt = 0.004
        while t < cross.t:
            # Advance the true ball to time t and take a noisy fix every frame.
            while i + 1 < len(states) and states[i + 1].t <= t:
                i += 1
            if t >= next_frame:
                next_frame += frame
                tp = states[i].pos
                tracker.observe(t, tuple(c + rng.gauss(0, sigma) for c in tp))
                if tracker.ready and t >= next_plan:
                    next_plan = t + 1 / replan_hz
                    pred = tracker.predict(max_bounces=3, stop_x=rig.plane_x - 0.5)
                    c = pred.crossing(rig.plane_x)
                    if c is not None:
                        pending.append((t + rig.latency, max(-rig.rail_half, min(rig.rail_half, c.pos[1]))))
            while pending and pending[0][0] <= t:
                target = pending.pop(0)[1]
            y, v = step_toward(y, v, target, dt, rig.max_speed, rig.max_accel)
            t += dt
        if rig.catches(y, cross.pos[1], cross.pos[2]):
            res.caught += 1
        elif cross.pos[2] > rig.net_height - ball.radius:
            res.too_high += 1
        else:
            res.too_wide += 1
    return res
