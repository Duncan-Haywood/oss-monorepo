"""The real robot behind the same interface as the twin: joint targets in radians (metres for
the lift), body-frame base velocity, joint readings in the same units.

Mapping (per joint, from ``calibration.json`` written by ``experiments/calibrate.py``):

    servo ticks = zero + sign * q * ratio * 4096 / (2 pi)

``ratio`` is the reduction from ``homebot.params`` (3 for the geared shoulder joints, 1
otherwise). ``zero`` is the tick reading with the joint at its zero pose and ``sign`` (+1/-1)
is found by moving the joint by hand in its positive direction during calibration, so the
servo's own direction convention never has to be assumed.

The lift needs ~7 servo turns, beyond position mode's single turn, so it runs in speed mode
and the host unwraps the encoder and closes the position loop. The wheels run in speed mode
with the kiwi inverse kinematics of ``kiwi_wheel_speeds`` (the same convention as the twin).
"""
from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..layout import SERVO_IDS
from ..params import ARM_JOINTS, ARM_RANGES, DEFAULT, Robot
from .feetech import MODE_SPEED, TICKS_PER_REV, FeetechBus

TWO_PI = 2 * math.pi


def kiwi_wheel_speeds(robot: Robot, vx: float, vy: float, wz: float) -> np.ndarray:
    """Wheel angular speeds (rad/s, positive = right-handed about the outward wheel axis)
    for a body-frame base twist. Wheel i at angle phi rolls along (sin phi, -cos phi)."""
    b = robot.base
    out = []
    for phi in b.wheel_angles:
        rim = math.sin(phi) * vx - math.cos(phi) * vy - b.wheel_distance * wz
        out.append(rim / b.wheel_radius)
    return np.array(out)


def base_twist(robot: Robot, wheel_speeds) -> np.ndarray:
    """Inverse of ``kiwi_wheel_speeds`` (odometry)."""
    b = robot.base
    A = np.array([[math.sin(p), -math.cos(p), -b.wheel_distance] for p in b.wheel_angles]) / b.wheel_radius
    return np.linalg.solve(A, np.asarray(wheel_speeds, float))


@dataclass
class JointCal:
    servo_id: int
    zero: int  # ticks at q = 0
    sign: int  # +1 or -1
    ratio: float

    def to_ticks(self, q: float) -> int:
        return int(round(self.zero + self.sign * q * self.ratio * TICKS_PER_REV / TWO_PI))

    def to_q(self, ticks: float) -> float:
        return (ticks - self.zero) * self.sign * TWO_PI / (TICKS_PER_REV * self.ratio)


def joint_ratio(robot: Robot, name: str) -> float:
    base = name[2:] if name[:2] in ("l_", "r_") else name
    if base in ARM_JOINTS:
        return robot.arm_drive(base).ratio
    if name == "lift":
        return robot.lift_drive().ratio
    return 1.0


def check_single_turn(robot: Robot = DEFAULT) -> dict[str, float]:
    """Servo rotation (rad) each position-mode joint needs over its range; must be < 2 pi."""
    out = {}
    for j in ARM_JOINTS:
        lo, hi = ARM_RANGES[j]
        out[j] = (hi - lo) * robot.arm_drive(j).ratio
    h = robot.head
    out["head_pan"] = h.pan_range[1] - h.pan_range[0]
    out["head_tilt"] = h.tilt_range[1] - h.tilt_range[0]
    return out


@dataclass
class Calibration:
    joints: dict[str, JointCal] = field(default_factory=dict)
    wheel_sign: list[int] = field(default_factory=lambda: [1, 1, 1])
    lift_zero_turns: float = 0.0

    @classmethod
    def load(cls, path) -> "Calibration":
        d = json.loads(Path(path).read_text())
        return cls({k: JointCal(**v) for k, v in d["joints"].items()}, d.get("wheel_sign", [1, 1, 1]),
                   d.get("lift_zero_turns", 0.0))

    def save(self, path) -> None:
        Path(path).write_text(json.dumps({"joints": {k: vars(v) for k, v in self.joints.items()},
                                          "wheel_sign": self.wheel_sign, "lift_zero_turns": self.lift_zero_turns},
                                         indent=1))


class RealHomebot:
    """Joint-space interface to the hardware. ``joints`` are the position-mode joints in use."""

    def __init__(self, bus: FeetechBus, cal: Calibration, robot: Robot = DEFAULT,
                 joints: list[str] | None = None, mobile: bool = False):
        self.bus, self.cal, self.robot = bus, cal, robot
        self.joints = joints or list(cal.joints)
        self.mobile = mobile
        self._lift_turns = 0
        self._lift_last = None
        self._wheel_cmd = np.zeros(3)

    # ------------------------------------------------------------------ setup
    def torque_limits(self) -> dict[int, int]:
        """Torque-limit register values (0-1000 = 0-100 % of stall) for the joints whose drive
        limits the servo below stall in the twin (geared joints protect printed teeth; the
        gripper limits the squeeze). The twin uses the same fractions (``Drive.torque_fraction``)."""
        out = {}
        for j in self.joints:
            base = j[2:] if j[:2] in ("l_", "r_") else j
            if base in ARM_JOINTS:
                out[self.cal.joints[j].servo_id] = int(round(1000 * self.robot.arm_drive(base).torque_fraction))
        return out

    def enable(self, on: bool = True) -> None:
        ids = [self.cal.joints[j].servo_id for j in self.joints]
        if on:  # the torque-limit register is RAM: it resets to the EEPROM maximum at power-up
            self.bus.sync_write("torque_limit", self.torque_limits())
        self.bus.sync_write("torque_enable", {sid: int(on) for sid in ids})
        if self.mobile:
            wheel_ids = [SERVO_IDS[f"wheel_{i}"] for i in range(3)] + [SERVO_IDS["lift"]]
            self.bus.sync_write("torque_enable", {sid: int(on) for sid in wheel_ids})

    def configure_speed_mode(self) -> None:
        """One-off: put the wheel and lift servos in constant-speed mode (EEPROM)."""
        for name in ("wheel_0", "wheel_1", "wheel_2", "lift"):
            self.bus.write_eeprom(SERVO_IDS[name], "mode", MODE_SPEED)

    # ------------------------------------------------------------------ joints
    def read_joints(self) -> dict[str, float]:
        ids = {self.cal.joints[j].servo_id: j for j in self.joints}
        ticks = self.bus.sync_read("present_position", list(ids))
        return {ids[sid]: self.cal.joints[ids[sid]].to_q(t) for sid, t in ticks.items()}

    def command_joints(self, targets: dict[str, float]) -> None:
        cmd = {}
        for j, q in targets.items():
            if j not in self.cal.joints:
                continue
            base = j[2:] if j[:2] in ("l_", "r_") else j
            if base in ARM_RANGES:
                lo, hi = ARM_RANGES[base]
                q = min(max(q, lo), hi)
            c = self.cal.joints[j]
            cmd[c.servo_id] = min(max(c.to_ticks(q), 0), TICKS_PER_REV - 1)
        self.bus.sync_write("goal_position", cmd)

    # ------------------------------------------------------------------ base
    def command_base(self, vx: float, vy: float, wz: float, dt: float) -> None:
        """Body-frame twist with the same acceleration ramp as the twin."""
        b = self.robot.base
        want = np.array([np.clip(vx, -b.max_speed, b.max_speed), np.clip(vy, -b.max_speed, b.max_speed),
                         np.clip(wz, -b.max_yaw_rate, b.max_yaw_rate)])
        step = np.array([b.max_accel, b.max_accel, b.max_yaw_accel]) * dt
        self._wheel_cmd = self._wheel_cmd + np.clip(want - self._wheel_cmd, -step, step)
        w = kiwi_wheel_speeds(self.robot, *self._wheel_cmd)
        raw = {SERVO_IDS[f"wheel_{i}"]: int(round(self.cal.wheel_sign[i] * w[i] * TICKS_PER_REV / TWO_PI))
               for i in range(3)}
        self.bus.sync_write("goal_speed", raw)

    def stop_base(self) -> None:
        self._wheel_cmd[:] = 0
        self.bus.sync_write("goal_speed", {SERVO_IDS[f"wheel_{i}"]: 0 for i in range(3)})

    # ------------------------------------------------------------------ lift
    def read_lift(self) -> float:
        sid = SERVO_IDS["lift"]
        t = self.bus.read(sid, "present_position")
        if self._lift_last is not None:
            d = t - self._lift_last
            if d > TICKS_PER_REV / 2:
                self._lift_turns -= 1
            elif d < -TICKS_PER_REV / 2:
                self._lift_turns += 1
        self._lift_last = t
        turns = self._lift_turns + t / TICKS_PER_REV - self.cal.lift_zero_turns
        c = self.cal.joints.get("lift")
        sign = c.sign if c else 1
        return sign * turns * TWO_PI * self.robot.lift.pulley_radius

    def command_lift(self, target: float, gain: float = 4.0) -> float:
        """One step of the host-side lift position loop; returns the measured height."""
        q = self.read_lift()
        v = float(np.clip(gain * (target - q), -0.03, 0.03))  # m/s
        c = self.cal.joints.get("lift")
        sign = c.sign if c else 1
        raw = int(round(sign * v / self.robot.lift.pulley_radius * TICKS_PER_REV / TWO_PI))
        self.bus.write(SERVO_IDS["lift"], "goal_speed", raw, wait_status=False)
        return q


def policy_loop(env, policy, real: RealHomebot, hz: float = 25.0, seconds: float = 10.0, obs_fn=None):
    """Run a twin-trained policy on hardware at ``hz``: read joints, build the observation
    with ``obs_fn(joint_dict) -> obs`` (task-specific), and turn actions into servo targets
    with the env's own rule (``env.joint_targets``: per-joint increments and a lead window),
    so the policy sees the same action semantics as in training."""
    dt = 1.0 / hz
    names = env.ctrl_names
    q = real.read_joints()
    target = np.array([q[j] for j in names])
    t_end = time.monotonic() + seconds
    while time.monotonic() < t_end:
        t0 = time.monotonic()
        q = real.read_joints()
        a = np.asarray(policy(obs_fn(q)), float)
        target = env.joint_targets(target, np.array([q[j] for j in names]), a[:len(names)])
        real.command_joints(dict(zip(names, map(float, target))))
        time.sleep(max(0.0, dt - (time.monotonic() - t0)))
