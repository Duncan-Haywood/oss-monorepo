"""Differential drive and path following for the mower.

Two rear drive wheels, two front casters. The Raspberry Pi runs `LineFollower`
at ~20 Hz on the fused pose (RTK GNSS position, IMU yaw, wheel odometry) and
sends left/right wheel speeds to the ESP32. Stripe ends are sharp 180-degree
turns, which pure pursuit on its own rounds off (leaving uncut corners), so
the follower drives one segment at a time: turn on the spot when the next
segment's heading is far off, then pure pursuit along the segment with the
lookahead point clamped to its end.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

Point = tuple[float, float]


@dataclass
class Pose:
    x: float
    y: float
    heading: float  # rad, 0 = +x


@dataclass(frozen=True)
class DiffDrive:
    track_width: float = 0.384     # m between wheel centre-planes (cad params: track)
    max_wheel_speed: float = 0.6   # m/s
    lookahead: float = 0.35        # m
    cruise: float = 0.35           # m/s while cutting
    turn_rate: float = 1.2         # rad/s, turning on the spot
    goal_tolerance: float = 0.03   # m

    def wheels(self, v: float, omega: float) -> tuple[float, float]:
        """(left, right) wheel speeds for body speed v and turn rate omega, scaled to the limit."""
        left = v - omega * self.track_width / 2
        right = v + omega * self.track_width / 2
        k = max(1.0, abs(left) / self.max_wheel_speed, abs(right) / self.max_wheel_speed)
        return left / k, right / k

    def integrate(self, pose: Pose, left: float, right: float, dt: float) -> Pose:
        v = (left + right) / 2
        w = (right - left) / self.track_width
        h = pose.heading + w * dt / 2
        return Pose(pose.x + v * math.cos(h) * dt, pose.y + v * math.sin(h) * dt,
                    math.atan2(math.sin(pose.heading + w * dt), math.cos(pose.heading + w * dt)))


def _wrap(a: float) -> float:
    return math.atan2(math.sin(a), math.cos(a))


class LineFollower:
    """Follows a polyline segment by segment. `command(pose)` -> (left, right) m/s."""

    TURN_IN_PLACE = math.radians(35)

    def __init__(self, path: list[Point], drive: DiffDrive = DiffDrive()) -> None:
        if len(path) < 2:
            raise ValueError("path needs at least two points")
        self.path = path
        self.drive = drive
        self.seg = 0
        self.turning = True

    @property
    def finished(self) -> bool:
        return self.seg >= len(self.path) - 1

    def _advance(self, pose: Pose) -> None:
        while not self.finished:
            a, b = self.path[self.seg], self.path[self.seg + 1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            along = ((pose.x - a[0]) * dx + (pose.y - a[1]) * dy) / L if L else 0.0
            if L == 0 or along >= L - self.drive.goal_tolerance:
                self.seg += 1
                self.turning = True
            else:
                return

    def command(self, pose: Pose) -> tuple[float, float]:
        self._advance(pose)
        if self.finished:
            return 0.0, 0.0
        a, b = self.path[self.seg], self.path[self.seg + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        seg_heading = math.atan2(dy, dx)
        err = _wrap(seg_heading - pose.heading)
        if self.turning:
            if abs(err) > math.radians(4):
                w = math.copysign(min(self.drive.turn_rate, 3.0 * abs(err) + 0.1), err)
                return self.drive.wheels(0.0, w)
            self.turning = False
        if abs(err) > self.TURN_IN_PLACE:
            self.turning = True
            return self.drive.wheels(0.0, math.copysign(self.drive.turn_rate, err))
        # Pure pursuit on this segment: lookahead point ahead of our projection, clamped to b.
        along = ((pose.x - a[0]) * dx + (pose.y - a[1]) * dy) / L
        t = min(L, max(0.0, along) + self.drive.lookahead)
        tx, ty = a[0] + dx * t / L, a[1] + dy * t / L
        c, s = math.cos(pose.heading), math.sin(pose.heading)
        lx, ly = c * (tx - pose.x) + s * (ty - pose.y), -s * (tx - pose.x) + c * (ty - pose.y)
        d2 = lx * lx + ly * ly
        if d2 < 1e-9:
            return 0.0, 0.0
        remaining = L - along
        v = min(self.drive.cruise, 1.5 * remaining + 0.05)
        return self.drive.wheels(v, v * 2 * ly / d2)
