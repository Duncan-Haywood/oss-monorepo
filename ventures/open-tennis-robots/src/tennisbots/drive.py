"""Differential-drive path following (pure pursuit) for the collector rover.

The Raspberry Pi runs this loop at ~20 Hz on the rover's fused pose
(wheel odometry + IMU yaw, corrected by court-line fixes from the camera)
and sends left/right wheel speeds to the motor controller.
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
    track_width: float = 0.42      # m between wheel contact patches
    max_wheel_speed: float = 1.0   # m/s
    lookahead: float = 0.6         # m
    cruise: float = 0.6            # m/s
    goal_tolerance: float = 0.08   # m

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


class PurePursuit:
    def __init__(self, path: list[Point], drive: DiffDrive = DiffDrive()) -> None:
        if len(path) < 2:
            raise ValueError("path needs at least two points")
        self.path = path
        self.drive = drive
        self._seg = 0

    def _lookahead_point(self, pose: Pose) -> Point:
        L = self.drive.lookahead
        p = (pose.x, pose.y)
        for i in range(self._seg, len(self.path) - 1):
            a, b = self.path[i], self.path[i + 1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            fx, fy = a[0] - p[0], a[1] - p[1]
            A = dx * dx + dy * dy
            if A == 0:
                continue
            B = 2 * (fx * dx + fy * dy)
            C = fx * fx + fy * fy - L * L
            disc = B * B - 4 * A * C
            if disc < 0:
                continue
            t = (-B + math.sqrt(disc)) / (2 * A)
            if 0 <= t <= 1:
                self._seg = i
                return (a[0] + t * dx, a[1] + t * dy)
            if t > 1 and i == len(self.path) - 2:
                break
        return self.path[-1]

    def done(self, pose: Pose) -> bool:
        g = self.path[-1]
        return math.hypot(pose.x - g[0], pose.y - g[1]) <= self.drive.goal_tolerance

    def command(self, pose: Pose) -> tuple[float, float]:
        """(left, right) wheel speeds toward the lookahead point."""
        if self.done(pose):
            return 0.0, 0.0
        tx, ty = self._lookahead_point(pose)
        dx, dy = tx - pose.x, ty - pose.y
        # Target in the robot frame.
        c, s = math.cos(pose.heading), math.sin(pose.heading)
        lx, ly = c * dx + s * dy, -s * dx + c * dy
        d2 = lx * lx + ly * ly
        if d2 == 0:
            return 0.0, 0.0
        g = self.path[-1]
        remaining = math.hypot(g[0] - pose.x, g[1] - pose.y)
        v = min(self.drive.cruise, 1.5 * remaining + 0.05)
        if lx < 0:  # target behind: turn on the spot
            return self.drive.wheels(0.0, math.copysign(2.0, ly or 1.0))
        curvature = 2 * ly / d2
        return self.drive.wheels(v, v * curvature)


def follow(path: list[Point], start: Pose, drive: DiffDrive = DiffDrive(), dt: float = 0.05,
           max_time: float = 600.0) -> tuple[Pose, float]:
    """Simulate following `path` from `start`; returns the final pose and elapsed time."""
    pp = PurePursuit(path, drive)
    pose = start
    t = 0.0
    while t < max_time and not pp.done(pose):
        left, right = pp.command(pose)
        pose = drive.integrate(pose, left, right, dt)
        t += dt
    return pose, t
