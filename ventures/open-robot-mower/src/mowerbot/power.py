"""Power budget, runtime per charge, and splitting a plan into charge sessions.

Every coefficient below is a stated assumption for planning, not a
measurement: rolling resistance on grass varies with wheel tread, grass
height and soil moisture by a factor of two or more, and the cutting
energy per square metre depends on grass density, height removed and
blade sharpness. Measure your own build (log battery current over a
mowing session) and pass the numbers back in.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .planner import FreeSpace, Lawn, Plan
from . import geometry as g

G = 9.81


@dataclass(frozen=True)
class PowerSpec:
    mass_kg: float = 9.5             # cad manifest estimate (8.5 kg) + 1 kg for wiring, fasteners, unmodelled parts
    crr: float = 0.12                # rolling resistance coefficient on mown grass (assumption)
    drive_eff: float = 0.55          # battery -> wheel, gearmotor + driver (assumption)
    electronics_w: float = 7.0       # Pi 4/5 lightly loaded + GNSS + ESP32 + IMU (estimate)
    blade_idle_w: float = 10.0       # disc spinning in air at cutting rpm (assumption: measure it)
    cut_j_per_m2: float = 60.0       # energy to cut one m^2 of maintained lawn (assumption)
    blade_eff: float = 0.8           # BLDC + ESC
    battery_wh: float = 25.2 * 5.0   # 7S Li-ion, 5 Ah
    usable: float = 0.8              # keep 20% in reserve for battery life and the trip home
    charger_w: float = 29.4 * 2.0    # 29.4 V 2 A charger
    charge_eff: float = 0.88         # CC-CV taper and losses (assumption)


@dataclass
class Budget:
    drive_w: float
    blade_w: float
    electronics_w: float

    @property
    def total_w(self) -> float:
        return self.drive_w + self.blade_w + self.electronics_w


def budget(spec: PowerSpec, speed: float, cut_width: float, slope_deg: float = 0.0, cutting: bool = True) -> Budget:
    th = math.radians(slope_deg)
    force = spec.mass_kg * G * (spec.crr * math.cos(th) + math.sin(th))
    drive = max(0.0, force * speed) / spec.drive_eff
    blade = (spec.blade_idle_w + spec.cut_j_per_m2 * speed * cut_width) / spec.blade_eff if cutting else 0.0
    return Budget(drive, blade, spec.electronics_w)


def runtime_h(spec: PowerSpec, speed: float, cut_width: float, slope_deg: float = 0.0) -> float:
    return spec.battery_wh * spec.usable / budget(spec, speed, cut_width, slope_deg).total_w


@dataclass
class Session:
    mow_s: float
    mow_m: float
    return_m: float
    charge_s: float


@dataclass
class Schedule:
    sessions: list[Session]
    total_s: float          # mowing + travel + charging, start to finish
    mowing_s: float


def schedule(lawn: Lawn, p: Plan, spec: PowerSpec = PowerSpec(), transit_speed: float = 0.5) -> Schedule:
    """Walk the plan, going home to charge whenever the energy left would not cover the trip back.

    The trip home and back is routed round the holes on the same free-space
    graph the planner uses, at `transit_speed` with the blade off.
    """
    s = p.settings
    free = FreeSpace(lawn, s.edge)
    cut_w = budget(spec, s.speed, s.cut_width).total_w
    turn_w = spec.electronics_w + spec.blade_idle_w / spec.blade_eff + 4.0  # turning on the spot: assumption
    move_w = budget(spec, transit_speed, s.cut_width, cutting=False).total_w
    capacity = spec.battery_wh * spec.usable * 3600.0
    sessions: list[Session] = []
    energy = capacity
    mow_s = mow_m = 0.0
    total = 0.0
    path = p.path
    prev_h = None

    def trip_home(pt):
        return g.path_length(free.route(pt, lawn.dock))

    i = 0
    while i < len(path) - 1:
        a, b = path[i], path[i + 1]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        h = math.atan2(b[1] - a[1], b[0] - a[0])
        turn = abs(math.atan2(math.sin(h - prev_h), math.cos(h - prev_h))) if prev_h is not None else 0.0
        dt = L / s.speed + turn / s.turn_rate
        de = cut_w * L / s.speed + turn_w * turn / s.turn_rate
        home = trip_home(b) if i < len(path) - 2 else 0.0
        if energy - de < move_w * home / transit_speed and mow_m > 0:
            back = trip_home(a)
            used = capacity - energy + move_w * back / transit_speed
            charge = used / (spec.charger_w * spec.charge_eff)
            sessions.append(Session(mow_s, mow_m, back, charge))
            total += 2 * back / transit_speed + charge
            energy = capacity - move_w * back / transit_speed
            mow_s = mow_m = 0.0
            prev_h = None
            continue
        energy -= de
        mow_s += dt
        mow_m += L
        total += dt
        prev_h = h
        i += 1
    used = capacity - energy
    sessions.append(Session(mow_s, mow_m, 0.0, used / (spec.charger_w * spec.charge_eff)))
    return Schedule(sessions, total, sum(x.mow_s for x in sessions))
