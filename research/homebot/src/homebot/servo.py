"""Servo and transmission physics shared by the simulator and the analyses.

The servos are hobby bus servos: a brushed DC motor, a spur gear train and an internal
position (or speed) loop that drives the motor with a PWM duty ``u`` in [-1, 1].
A brushed motor at duty ``u`` gives, at the servo output,

    tau = u * tau_stall - b * omega,     b = tau_stall / omega_no_load,

so at full duty the torque falls linearly from ``tau_stall`` at rest to zero at the no-load
speed. If the internal loop is proportional and saturates, ``u = clip(K * e, -1, 1)``, the
servo torque is ``clip(kp * e, -tau_stall, tau_stall) - b * omega`` with ``kp = K * tau_stall``.
MuJoCo reproduces this exactly with a force-limited position actuator plus joint damping
``b``: the actuator clamps ``kp * e`` and the damping supplies the back-EMF slope (see
``Drive.mjcf_position``). A speed-mode servo (wheels) uses a feed-forward duty
``omega* / omega_no_load`` plus a proportional speed term, which becomes a general
actuator ``gain = K + b, bias = -K * omega`` with the same clamp and damping.

An optional reduction between servo and joint (printed gears, a belt pulley for the lift)
multiplies torque by ``ratio * efficiency``, divides speed by ``ratio``, multiplies
damping, stiffness and reflected inertia by ``ratio**2``. For a prismatic joint driven by
a pulley of pitch radius ``r`` the ratio is ``1 / r`` (servo radians per joint metre).

The internal gain ``kp``, rotor inertia and Coulomb friction are not on any datasheet:
the defaults are order-of-magnitude estimates to be replaced by ``homebot.sysid`` fits.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

KGCM = 9.80665e-2  # N*m per kg*cm


@dataclass(frozen=True)
class ServoSpec:
    """Datasheet values plus the model parameters a datasheet does not give."""

    name: str
    supply_v: float
    stall_torque: float  # N*m at the servo output, at supply_v
    no_load_speed: float  # rad/s at the servo output, at supply_v
    stall_current: float  # A
    mass: float  # kg
    gear_ratio: float  # motor turns per output turn (internal gearbox)
    ticks_per_rev: int
    price_usd: float  # typical single-unit street price, see hardware/BOM.md
    # Not on datasheets; estimates until identified on hardware (homebot.sysid).
    kp: float  # N*m/rad, slope of the internal position loop before it saturates
    kv: float  # N*m*s/rad, proportional gain of the internal speed loop (wheel mode)
    rotor_inertia: float  # kg*m^2 at the motor shaft
    friction: float  # N*m Coulomb friction at the output
    position_noise: float = field(default=0.0)  # rad, encoder quantisation is added separately

    @property
    def damping(self) -> float:
        """Back-EMF slope at full duty, N*m*s/rad at the servo output."""
        return self.stall_torque / self.no_load_speed

    @property
    def armature(self) -> float:
        """Rotor inertia reflected to the output, kg*m^2."""
        return self.rotor_inertia * self.gear_ratio ** 2

    @property
    def tick(self) -> float:
        """Encoder resolution, rad per tick."""
        return 2 * math.pi / self.ticks_per_rev

    def saturation_error(self) -> float:
        """Position error (rad) at which the internal loop reaches full duty."""
        return self.stall_torque / self.kp


@dataclass(frozen=True)
class Drive:
    """A servo, an optional reduction to the joint, and how the joint is commanded."""

    servo: ServoSpec
    ratio: float = 1.0  # servo output radians per joint unit (rad or m)
    efficiency: float = 1.0  # torque efficiency of the reduction
    extra_friction: float = 0.0  # joint-side Coulomb friction of the reduction/bearings
    mode: str = "position"  # "position" or "velocity"
    torque_fraction: float = 1.0  # servo torque-limit register as a fraction of stall

    @property
    def max_effort(self) -> float:
        """Stall torque (N*m) or force (N) available at the joint."""
        return self.servo.stall_torque * self.torque_fraction * self.ratio * self.efficiency

    @property
    def max_speed(self) -> float:
        """No-load joint speed, rad/s or m/s."""
        return self.servo.no_load_speed / self.ratio

    @property
    def damping(self) -> float:
        return self.servo.damping * self.ratio ** 2 * self.efficiency

    @property
    def armature(self) -> float:
        return self.servo.armature * self.ratio ** 2

    @property
    def friction(self) -> float:
        return self.servo.friction * self.ratio + self.extra_friction

    @property
    def kp(self) -> float:
        return self.servo.kp * self.ratio ** 2 * self.efficiency

    @property
    def kv(self) -> float:
        return self.servo.kv * self.ratio ** 2 * self.efficiency

    @property
    def resolution(self) -> float:
        """Joint units per encoder tick."""
        return self.servo.tick / self.ratio

    def torque_speed_limit(self, speed: float) -> float:
        """Largest effort the drive can deliver in the direction of motion at ``speed``."""
        return max(0.0, self.max_effort - self.damping * abs(speed))

    def scaled(self, **kw) -> "Drive":
        """Copy with servo fields replaced (used by domain randomisation and sysid)."""
        return replace(self, servo=replace(self.servo, **kw))


def mjcf_joint_attrs(drive: Drive, share: float = 1.0) -> dict:
    """Joint attributes that carry the drive's passive dynamics (``share`` of them when one
    servo drives several coupled joints)."""
    return {
        "damping": f"{drive.damping * share:.6g}",
        "armature": f"{drive.armature * share:.6g}",
        "frictionloss": f"{drive.friction * share:.6g}",
    }


def mjcf_actuator(drive: Drive, name: str, joint: str, ctrlrange: tuple[float, float]) -> tuple[str, dict]:
    """(tag, attributes) of the MuJoCo actuator that reproduces the servo loop."""
    f = drive.max_effort
    if drive.mode == "position":
        return "position", {
            "name": name,
            "joint": joint,
            "kp": f"{drive.kp:.6g}",
            "forcerange": f"{-f:.6g} {f:.6g}",
            "forcelimited": "true",
            "ctrlrange": f"{ctrlrange[0]:.6g} {ctrlrange[1]:.6g}",
            "ctrllimited": "true",
        }
    if drive.mode == "velocity":
        k = drive.kv
        b = drive.damping
        return "general", {
            "name": name,
            "joint": joint,
            "gaintype": "fixed",
            "biastype": "affine",
            "gainprm": f"{k + b:.6g}",
            "biasprm": f"0 0 {-k:.6g}",
            "forcerange": f"{-f:.6g} {f:.6g}",
            "forcelimited": "true",
            "ctrlrange": f"{ctrlrange[0]:.6g} {ctrlrange[1]:.6g}",
            "ctrllimited": "true",
        }
    raise ValueError(f"unknown drive mode {drive.mode!r}")
