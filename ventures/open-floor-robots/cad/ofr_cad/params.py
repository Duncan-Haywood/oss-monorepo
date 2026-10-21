"""Platform parameters: every dimension the parts are generated from, in millimetres.

Robot frame: origin on the floor under the middle of the drive axle, x
forward, y to the left, z up. One chassis, three cleaning modules:

* vacuum: roller brush and nozzle, side brush, dust bin with the fan on top;
* mop:    water tank, peristaltic pump, vibrating pad on a lift, rear caster;
* combo:  the vacuum's nozzle and side brush, a split bin and tank, a
          narrower pad behind the nozzle, rear caster.

Change a number and rebuild; `check()` says if the change breaks fit,
clearance, sensing or balance. Dimensions of bought-in parts (gearmotor,
wheel, caster, fan, pump, servo, lidar) are what the parts were drawn
around: check them against the datasheet of what you buy before cutting.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

VARIANTS = ("vacuum", "mop", "combo")


@dataclass(frozen=True)
class Robot:
    variant: str = "vacuum"

    # Base plate (laser-cut aluminium) and top deck (laser-cut cast acrylic).
    base_r: float = 150.0
    plate_t: float = 3.0
    base_z: float = 18.0          # underside of the base plate above the floor
    deck_r: float = 163.0
    deck_t: float = 3.0
    deck_z: float = 95.0          # underside of the deck

    # Bumper (front half, sprung) and skirt (rear half, fixed): printed quarter arcs.
    shell_r: float = 165.0        # outer radius = the robot's footprint
    shell_wall: float = 4.0
    shell_z0: float = 24.0
    shell_z1: float = 84.0
    bumper_travel: float = 5.0
    tab_r0: float = 138.0         # tabs reach in to here, over the base plate
    tab_w: float = 16.0
    tab_t: float = 6.0
    tab_gap: float = 3.0          # spacer between base top and tab
    bumper_tabs_deg: tuple = (20.0, 75.0)
    skirt_tabs_deg: tuple = (110.0, 145.0)

    # Drive: 25 mm gearmotor with encoder (JGA25-370 class), 72 mm wheel.
    wheel_d: float = 72.0
    wheel_w: float = 22.0
    wheel_y: float = 115.0        # centre plane |y|
    motor_d: float = 25.0
    motor_len: float = 72.0       # gearbox + motor + encoder
    hub_gap: float = 2.0          # wheel inner face to gearbox face
    pod_w: float = 44.0
    pod_len: float = 40.0
    pod_wall: float = 5.0

    # Casters: ball casters on printed spacers under the base.
    caster_x: float = 130.0
    rear_caster_x: float = -138.0
    caster_height: float = 13.0   # mounting face to floor
    caster_r: float = 9.0
    caster_pad: float = 20.0      # printed spacer, square

    # Battery: 4S2P 18650 Li-ion with BMS, strapped down.
    battery: tuple = (75.0, 75.0, 40.0)  # x, y, z envelope
    battery_x: float = 72.0

    # Electronics carrier (Pi Zero 2 W, ESP32-S3, 2 x DRV8871, PCA9685, buck).
    elec: tuple = (70.0, 55.0, 30.0)
    elec_xy: tuple = (68.0, 72.0)

    # Cliff sensors: (angle deg, radius) of each window. Four front, two rear.
    cliff_r: float = 128.0
    cliff_front_deg: tuple = (10.0, 66.0, -10.0, -66.0)
    cliff_rear_deg: tuple = (125.0, -125.0)
    cliff_window: float = 8.0

    # Vacuum nozzle: roller brush across the base slot, printed housing over it.
    roller_d: float = 40.0
    roller_len: float = 160.0
    roller_x: float = -50.0
    nozzle_clear: float = 3.0     # slot edge to roller
    housing_wall: float = 3.0
    housing_h: float = 37.0       # above the base top
    housing_half_y: float = 95.0
    nozzle_lip_gap: float = 4.0   # silicone lip bottom edge above the floor
    side_brush_xy: tuple = (110.0, -88.0)
    side_brush_r: float = 55.0

    # Rear module footprint (bin and/or tank).
    module_x0: float = -148.0
    module_x1: float = -84.0
    module_half_y: float = 50.0
    module_wall: float = 2.0
    bin_h: float = 42.0           # vacuum and combo: fan sits on top
    tank_h: float = 70.0          # mop and combo tank (no fan above it)
    combo_split_y: float = 10.0   # combo: bin from -half_y to split, tank from split + 2 to +half_y
    fan_d: float = 60.0
    fan_h: float = 28.0

    # Mop: pad on a printed plate, lifted by two micro servos on guide rods.
    pad_t: float = 5.0
    plate_th: float = 8.0
    mop_x0: float = -125.0
    mop_x1_mop: float = -30.0
    mop_x1_combo: float = -78.0
    mop_half_y_mop: float = 85.0
    mop_half_y_combo: float = 75.0
    rod_d: float = 6.0
    rod_y: float = 65.0
    rod_len: float = 37.0
    lift: float = 4.5             # pad lift travel
    erm: tuple = (7.0, 25.0)      # vibration motor diameter, length
    pump: tuple = (32.0, 50.0, 28.0)

    # Lidar turret on the deck.
    lidar_d: float = 70.0
    lidar_h: float = 38.0
    lidar_x: float = 60.0

    # Deck posts (printed columns).
    posts_xy: tuple = ((75.0, 120.0), (75.0, -120.0), (-70.0, 125.0), (-70.0, -125.0))
    post_d: float = 12.0

    # Masses of bought-in parts (g), for the balance check. Typical, not weighed.
    m_battery: float = 420.0
    m_motor: float = 100.0
    m_wheel: float = 40.0
    m_lidar: float = 110.0
    m_elec: float = 90.0
    m_fan: float = 90.0
    m_roller: float = 60.0
    m_brush_motor: float = 60.0
    m_side_brush: float = 30.0
    m_pump: float = 60.0
    m_servo: float = 10.0

    def __post_init__(self):
        if self.variant not in VARIANTS:
            raise ValueError(f"variant must be one of {VARIANTS}")

    # ---- what this variant carries -----------------------------------------
    @property
    def has_vacuum(self) -> bool:
        return self.variant in ("vacuum", "combo")

    @property
    def has_mop(self) -> bool:
        return self.variant in ("mop", "combo")

    @property
    def has_rear_caster(self) -> bool:
        """A full tank behind the axle tips the robot back when the pad is up, so mop builds get a second caster."""
        return self.has_mop

    # ---- derived -------------------------------------------------------------
    @property
    def base_top(self) -> float:
        return self.base_z + self.plate_t

    @property
    def deck_top(self) -> float:
        return self.deck_z + self.deck_t

    @property
    def axle_z(self) -> float:
        return self.wheel_d / 2

    @property
    def track(self) -> float:
        return 2 * self.wheel_y

    @property
    def wheel_inner_y(self) -> float:
        return self.wheel_y - self.wheel_w / 2

    @property
    def motor_face_y(self) -> float:
        return self.wheel_inner_y - self.hub_gap

    @property
    def pod_y(self) -> float:
        """Pod centre |y|: it grips the gearbox end of the motor."""
        return self.motor_face_y - self.pod_len / 2

    @property
    def roller_z(self) -> float:
        return self.roller_d / 2

    @property
    def slot(self) -> tuple[float, float, float]:
        """Nozzle slot in the base: (x0, x1, half_y)."""
        r = self.roller_d / 2 + self.nozzle_clear
        return (self.roller_x - r, self.roller_x + r, self.roller_len / 2 + 5)

    @property
    def housing_x(self) -> tuple[float, float]:
        x0, x1, _ = self.slot
        return (x0 - self.housing_wall, x1 + self.housing_wall)

    @property
    def mop_x1(self) -> float:
        return self.mop_x1_combo if self.variant == "combo" else self.mop_x1_mop

    @property
    def mop_half_y(self) -> float:
        return self.mop_half_y_combo if self.variant == "combo" else self.mop_half_y_mop

    @property
    def mop_cx(self) -> float:
        return (self.mop_x0 + self.mop_x1) / 2

    @property
    def plate_z(self) -> float:
        return self.pad_t

    @property
    def plate_top(self) -> float:
        return self.pad_t + self.plate_th

    @property
    def side_brush_reach(self) -> float:
        return math.hypot(*self.side_brush_xy) + self.side_brush_r

    def cliff_points(self) -> list[tuple[float, float]]:
        return [(self.cliff_r * math.cos(math.radians(a)), self.cliff_r * math.sin(math.radians(a)))
                for a in self.cliff_front_deg + self.cliff_rear_deg]

    @property
    def cliff_lead(self) -> float:
        """How far the outer front cliff windows sit ahead of the wheel contact line."""
        return min(x for x, y in self.cliff_points()[:4] if abs(y) > 60)

    def bin_box(self) -> tuple[float, float, float, float] | None:
        """(x0, x1, y0, y1) of the dust bin, outside walls."""
        if self.variant == "vacuum":
            return (self.module_x0, self.module_x1, -self.module_half_y, self.module_half_y)
        if self.variant == "combo":
            return (self.module_x0, self.module_x1, -self.module_half_y, self.combo_split_y)
        return None

    def tank_box(self) -> tuple[float, float, float, float] | None:
        if self.variant == "mop":
            return (self.module_x0, self.module_x1, -self.module_half_y, self.module_half_y)
        if self.variant == "combo":
            return (self.module_x0, self.module_x1, self.combo_split_y + 2, self.module_half_y)
        return None

    def _inner_ml(self, box, h) -> float:
        x0, x1, y0, y1 = box
        w = self.module_wall
        return (x1 - x0 - 2 * w) * (y1 - y0 - 2 * w) * (h - 2 * w) / 1000

    def bin_ml(self) -> float:
        b = self.bin_box()
        return self._inner_ml(b, self.bin_h) if b else 0.0

    def tank_ml(self) -> float:
        b = self.tank_box()
        return self._inner_ml(b, self.tank_h) if b else 0.0

    @property
    def overall(self) -> tuple[float, float]:
        """(diameter, height) in mm, lidar included."""
        return (2 * self.shell_r, self.deck_top + self.lidar_h)

    # ---- balance -------------------------------------------------------------
    def bought_masses(self) -> list[tuple[str, float, float, float]]:
        """(what, grams, x, y) of the heavy bought-in parts, tank full."""
        out = [("battery", self.m_battery, self.battery_x, 0.0),
               ("motors", 2 * self.m_motor, 0.0, 0.0), ("wheels", 2 * self.m_wheel, 0.0, 0.0),
               ("lidar", self.m_lidar, self.lidar_x, 0.0), ("electronics", self.m_elec, *self.elec_xy)]
        if self.has_vacuum:
            b = self.bin_box()
            out += [("fan", self.m_fan, (b[0] + b[1]) / 2, (b[2] + b[3]) / 2),
                    ("roller", self.m_roller, self.roller_x, 0.0),
                    ("brush motor", self.m_brush_motor, self.roller_x, -35.0),
                    ("side brush", self.m_side_brush, *self.side_brush_xy)]
        if self.has_mop:
            t = self.tank_box()
            out += [("water (full)", self.tank_ml(), (t[0] + t[1]) / 2, (t[2] + t[3]) / 2),
                    ("pump", self.m_pump, -50.0, 35.0 if self.variant == "combo" else 0.0),
                    ("servos", 2 * self.m_servo, self.mop_cx - 22, 0.0)]
        return out

    def centre_of_mass(self, made: list[tuple[float, float, float]] = ()) -> tuple[float, float]:
        """(x, y) of the centre of mass: bought-in parts plus `made` = [(grams, x, y)]."""
        items = [(m, x, y) for _, m, x, y in self.bought_masses()] + list(made)
        total = sum(m for m, _, _ in items)
        return (sum(m * x for m, x, _ in items) / total, sum(m * y for m, _, y in items) / total)

    # ---- design rules ------------------------------------------------------
    def check(self) -> list[str]:
        bad = []
        if self.motor_d / 2 > self.axle_z - self.base_top - 1.5:
            bad.append("gearmotor does not clear the base plate: bigger wheels or a lower plate")
        if self.motor_face_y - self.motor_len < 10:
            bad.append("gearmotors meet in the middle: shorter motors or a wider track")
        if self.wheel_y + self.wheel_w / 2 + 2 > self.base_r - 12:
            bad.append("wheel slot is too close to the base edge")
        if self.caster_height > self.base_z - 2:
            bad.append("caster spacer would be under 2 mm")
        if self.shell_r - self.shell_wall - self.bumper_travel < self.base_r + 3:
            bad.append("bumper travel would hit the base plate edge")
        for x, y in self.cliff_points():
            if math.hypot(x, y) + self.cliff_window / 2 > self.base_r - 4:
                bad.append("cliff window too close to the base edge")
        if self.has_vacuum:
            sx, sy = self.side_brush_xy
            for x, y in self.cliff_points():
                if math.hypot(x - sx, y - sy) < self.side_brush_r + self.cliff_window / 2:
                    bad.append(f"side brush sweeps under the cliff sensor at ({x:.0f}, {y:.0f}): false cliffs")
            if self.housing_x[1] > -self.pod_w / 2 - 2:
                bad.append("nozzle housing hits the wheel pods")
            if self.roller_len / 2 + 6 > self.wheel_inner_y:
                bad.append("roller is longer than the space between the wheels")
            if self.nozzle_lip_gap < 2 or self.nozzle_lip_gap > self.base_z - 6:
                bad.append("nozzle lip gap out of range")
            if self.bin_box()[3] - self.bin_box()[2] < self.fan_d:
                bad.append("fan is wider than the bin")
            if self.base_top + self.bin_h + self.fan_h > self.deck_z - 1:
                bad.append("fan on the bin does not fit under the deck")
        if self.has_mop:
            if self.base_top + self.tank_h > self.deck_z - 1:
                bad.append("tank does not fit under the deck")
            if self.plate_top + self.lift > self.base_z:
                bad.append("pad lift would hit the base plate")
            if self.erm[0] > self.plate_th - 1:
                bad.append("vibration motor does not fit in the pad plate")
            if self.has_vacuum and self.mop_x1 > self.slot[0] - 3:
                bad.append("pad overlaps the nozzle")
            if self.rod_y + 10 > self.mop_half_y:
                bad.append("guide rods are outside the pad plate")
        # Stopping: at the firmware's speed cap, latency plus braking must fit in the cliff lead.
        v, latency, decel = 0.35, 0.020, 2.0
        stop_mm = 1000 * (v * latency + v * v / (2 * decel))
        if stop_mm > self.cliff_lead:
            bad.append(f"cliff sensors lead the wheels by {self.cliff_lead:.0f} mm; stopping takes {stop_mm:.0f} mm")
        return bad
