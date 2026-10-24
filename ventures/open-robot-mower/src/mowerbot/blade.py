"""Blade disc: stored energy, tip speed, and how fast it stops.

The disc carries pivoting razor blades (the replaceable kind sold for
robotic mowers). When the firmware drops the blade, the ESC short-brakes
the BLDC: with the phases shorted the back-EMF drives a current that
brakes the rotor with a torque proportional to speed, k_t^2 / R * omega.
Bearing friction adds a constant torque and air drag a torque in omega^2.

    J d(omega)/dt = -(b * omega + T_f + c * omega^2),   b = k_t^2 / R_phase

This module integrates that and reports the time to stop. The motor
constants are typical of a 24 V outrunner, not a datasheet: read your
motor's Kv and phase resistance and pass them in. Then measure the real
stop time with a phone's slow-motion video before trusting any of it.

The project's design target is a stop within 1.0 s of any stop signal
(lift, tilt, bump, stop button, watchdog). It is this project's own target,
chosen with margin; check the requirements that apply where you live.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

TARGET_STOP_S = 1.0


@dataclass(frozen=True)
class BladeSpec:
    rpm: float = 2800.0
    disc_r: float = 0.100            # m (cad params: disc_r)
    disc_t: float = 0.003            # m, aluminium 5052
    disc_density: float = 2680.0     # kg/m^3
    disc_fill: float = 0.82          # fraction of a full disc left after holes and lightening
    n_blades: int = 3
    blade_mass: float = 0.003        # kg, one razor blade (typical, check yours)
    blade_pivot_r: float = 0.092     # m, pivot screw radius
    blade_cg_offset: float = 0.012   # m, blade centre of mass outboard of the pivot
    blade_tip_r: float = 0.116       # m
    hub_inertia: float = 2.0e-5      # kg m^2, printed hub + screws (estimate)
    rotor_inertia: float = 2.5e-5    # kg m^2, outrunner bell (estimate, check datasheet)
    kv: float = 140.0                # rpm per volt
    phase_r: float = 0.45            # ohm, phase to phase
    friction_nm: float = 0.02        # bearings + seal (assumption)
    drag_c: float = 2.0e-7           # N m s^2, air drag on disc and blades (assumption)

    @property
    def omega(self) -> float:
        return self.rpm * 2 * math.pi / 60

    @property
    def disc_mass(self) -> float:
        return math.pi * self.disc_r ** 2 * self.disc_t * self.disc_density * self.disc_fill

    @property
    def inertia(self) -> float:
        disc = 0.5 * self.disc_mass * self.disc_r ** 2
        blades = self.n_blades * self.blade_mass * (self.blade_pivot_r + self.blade_cg_offset) ** 2
        return disc + blades + self.hub_inertia + self.rotor_inertia

    @property
    def kt(self) -> float:
        return 60 / (2 * math.pi * self.kv)

    @property
    def brake_b(self) -> float:
        return self.kt ** 2 / self.phase_r


@dataclass
class BladeReport:
    tip_speed_mps: float
    stored_energy_j: float
    blade_energy_j: float     # one blade's own kinetic energy (it can fly off if its screw fails)
    stop_s_brake: float
    stop_s_coast: float
    meets_target: bool


def stop_time(spec: BladeSpec, brake: bool = True, dt: float = 1e-4, stop_rpm: float = 30.0) -> float:
    """Seconds from the stop signal until the disc is below `stop_rpm` (RK4)."""
    J = spec.inertia
    b = spec.brake_b if brake else 0.0
    w = spec.omega
    w_end = stop_rpm * 2 * math.pi / 60

    def f(w):
        return -(b * w + spec.friction_nm + spec.drag_c * w * w) / J

    t = 0.0
    while w > w_end and t < 120.0:
        k1 = f(w)
        k2 = f(w + dt * k1 / 2)
        k3 = f(w + dt * k2 / 2)
        k4 = f(w + dt * k3)
        w += dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6
        t += dt
    return t


def report(spec: BladeSpec = BladeSpec()) -> BladeReport:
    w = spec.omega
    r_cg = spec.blade_pivot_r + spec.blade_cg_offset
    brake = stop_time(spec, True)
    return BladeReport(
        tip_speed_mps=w * spec.blade_tip_r,
        stored_energy_j=0.5 * spec.inertia * w * w,
        blade_energy_j=0.5 * spec.blade_mass * (w * r_cg) ** 2,
        stop_s_brake=brake,
        stop_s_coast=stop_time(spec, False, dt=1e-3),
        meets_target=brake <= TARGET_STOP_S,
    )
