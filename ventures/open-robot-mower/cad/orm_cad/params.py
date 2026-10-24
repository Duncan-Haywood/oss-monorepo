"""Mower parameters: every dimension the parts are generated from, in millimetres.

Robot frame: origin on the ground under the middle of the rear (drive)
axle, x forward, y to the left, z up. Change a number here and rebuild; the
checks in `check()` say if the change breaks fit, clearance or a safety rule.

Dimensions of bought-in parts (gearmotors, wheels, blade motor, razor
blades, rubber mounts, battery, boards) are the values the parts below were
drawn around. Check them against the datasheet of what you actually buy
before cutting metal.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Mower:
    # Chassis plate (laser-cut aluminium 5052).
    plate_t: float = 4.0
    chassis_x0: float = -95.0      # rear edge
    chassis_x1: float = 470.0      # front edge
    chassis_half_w: float = 150.0
    chassis_z: float = 80.0        # underside height above the ground
    corner_r: float = 20.0

    # Drive: two 37 mm-class gearmotors with encoders, 6 mm D shaft, on printed clamps.
    wheel_d: float = 220.0         # lawn tyre with tread
    wheel_w: float = 60.0
    wheel_gap: float = 12.0        # chassis edge to wheel inner face
    motor_d: float = 37.0
    motor_len: float = 125.0       # gearbox + motor + encoder
    motor_face_inset: float = 5.0
    clamp_len: float = 45.0
    clamp_wall: float = 8.0
    hub_d: float = 50.0            # printed wheel hub
    hub_gap: float = 3.0           # motor face to hub

    # Front casters: printed fork on an M8 stem, bought 75 mm wheel.
    caster_x: float = 450.0
    caster_y: float = 140.0
    caster_wheel_d: float = 75.0
    caster_wheel_w: float = 25.0
    caster_trail: float = 45.0
    caster_washer: float = 2.0     # thrust washer between fork and chassis

    # Cutting system. Blade disc centre x; cut height = blade plane above the ground.
    blade_x: float = 230.0
    cut_min: float = 20.0
    cut_max: float = 50.0
    cut_nominal: float = 35.0      # the height the assembly is drawn at
    disc_r: float = 100.0
    disc_t: float = 3.0
    blade_t: float = 1.0           # razor blades pivot under the disc
    n_blades: int = 3
    blade_pivot_r: float = 92.0
    blade_len: float = 30.0        # pivot hole 6 mm from the inner end
    blade_w: float = 18.0
    blade_tip_r: float = 116.0     # pivot_r + 24: swinging straight out
    blade_hub_d: float = 40.0
    blade_hub_h: float = 16.0
    hub_to_plate: float = 2.0      # rotating hub to the fixed height plate
    blade_motor_d: float = 50.0    # outrunner, 24 V, ~140 kv; can spins above the plate
    blade_motor_h: float = 45.0
    rotating_clearance: float = 2.0

    # Height-adjust plate on three M6 threaded rods hanging from the chassis.
    height_plate_t: float = 4.0
    height_plate_r: float = 70.0
    rod_r: float = 128.0           # rod circle radius, outside the blade tips
    rod_d: float = 6.0
    rod_angles: tuple[float, float, float] = (0.0, 120.0, 240.0)
    lobe_r: float = 11.0

    # Blade guard: printed ring in four segments under the chassis.
    guard_r_in: float = 145.0
    guard_wall: float = 4.0
    guard_bottom: float = 15.0     # above the ground
    guard_tab_angles: tuple[float, ...] = (45.0, 135.0, 225.0, 315.0)
    guard_tab_w: float = 22.0
    guard_tab_t: float = 6.0
    guard_tab_depth: float = 22.0  # tabs reach inward

    # Electronics tray on standoffs, battery on the chassis.
    tray_t: float = 3.0
    tray_x0: float = -55.0
    tray_x1: float = 190.0
    tray_half_w: float = 110.0
    standoff_h: float = 80.0
    battery: tuple[float, float, float] = (70.0, 150.0, 70.0)  # x, y, z: 7S2P 21700 pack + BMS
    battery_x: float = 100.0
    electronics: tuple[float, float, float] = (180.0, 150.0, 30.0)  # Pi, GNSS, ESP32, drivers, ESC
    electronics_x: float = 40.0

    # GNSS mast on the tray, through the shell.
    mast_x: float = 150.0
    mast_y: float = 40.0
    mast_d: float = 16.0
    mast_top: float = 300.0
    antenna: tuple[float, float] = (60.0, 25.0)  # diameter, height

    # Floating shell (printed ASA), on four rubber mounts with 3-axis hall sensors.
    shell_x0: float = -130.0
    shell_x1: float = 510.0
    shell_half_w: float = 245.0
    shell_z0: float = 90.0         # bottom edge of the skirt
    shell_top: float = 240.0
    shell_wall: float = 3.0
    shell_corner_r: float = 50.0
    shell_cols: int = 3            # segments along x
    shell_rows: int = 2            # segments along y
    shell_travel: float = 8.0      # how far a bump may push the shell before it hits anything
    post_xy: tuple[tuple[float, float], ...] = ((-78.0, 120.0), (-78.0, -120.0), (390.0, 100.0), (390.0, -100.0))
    post_d: float = 24.0
    mount_d: float = 20.0          # M6 rubber anti-vibration mount, male-male
    mount_h: float = 15.0
    stop_button_xy: tuple[float, float] = (380.0, -60.0)
    rain_xy: tuple[float, float] = (-60.0, 60.0)

    # Charging contacts at the front, under the chassis.
    contact_x: float = 450.0
    contact_half_y: float = 25.0

    # Printer.
    bed: tuple[float, float, float] = (256.0, 256.0, 256.0)
    bed_margin: float = 6.0

    notes: list[str] = field(default_factory=list)

    # ---- derived -----------------------------------------------------------
    @property
    def chassis_top(self) -> float:
        return self.chassis_z + self.plate_t

    @property
    def axle_z(self) -> float:
        return self.wheel_d / 2

    @property
    def wheel_y(self) -> float:
        return self.chassis_half_w + self.wheel_gap + self.wheel_w / 2

    @property
    def track(self) -> float:
        return 2 * self.wheel_y

    @property
    def motor_face_y(self) -> float:
        return self.chassis_half_w - self.motor_face_inset

    @property
    def wheelbase(self) -> float:
        return self.caster_x - self.caster_trail

    @property
    def guard_r_out(self) -> float:
        return self.guard_r_in + self.guard_wall

    @property
    def cut_width(self) -> float:
        return 2 * self.blade_tip_r

    @property
    def cut_steps(self) -> list[float]:
        n = int(round((self.cut_max - self.cut_min) / 5))
        return [self.cut_min + 5 * i for i in range(n + 1)]

    def plate_z(self, h: float) -> float:
        """Underside of the height plate at cut height h."""
        return h + self.blade_t + self.disc_t + self.blade_hub_h + self.hub_to_plate

    @property
    def rod_bottom(self) -> float:
        return self.plate_z(self.cut_min) - 12.0  # room for the lower nut at the lowest setting

    @property
    def tray_z(self) -> float:
        return self.chassis_top + self.standoff_h

    @property
    def overall(self) -> tuple[float, float, float]:
        return (self.shell_x1 - self.shell_x0, 2 * self.shell_half_w, self.mast_top + self.antenna[1])

    def rod_points(self) -> list[tuple[float, float]]:
        return [(self.blade_x + self.rod_r * math.cos(math.radians(a)), self.rod_r * math.sin(math.radians(a)))
                for a in self.rod_angles]

    def edge_to_blade(self) -> float:
        """Shortest horizontal distance from the shell's outer edge to the blade-tip circle."""
        return min(self.blade_x - self.shell_x0, self.shell_x1 - self.blade_x, self.shell_half_w) - self.blade_tip_r

    def check(self) -> list[str]:
        """Design-rule violations (empty list = all good)."""
        bad = []
        if self.guard_r_in - self.blade_tip_r < 12:
            bad.append("blade tips under 12 mm from the guard wall")
        if self.guard_bottom > self.cut_min - 5:
            bad.append("guard must reach at least 5 mm below the blade plane at the lowest cut")
        if self.guard_bottom < 10:
            bad.append("guard under 10 mm off the ground: it will drag")
        if self.edge_to_blade() < 100:
            bad.append(f"blade tips {self.edge_to_blade():.0f} mm from the shell edge: keep at least 100 mm")
        if self.plate_z(self.cut_max) + self.height_plate_t > self.chassis_z - 2:
            bad.append("height plate hits the chassis at the highest cut")
        if self.rod_r - self.rod_d / 2 - self.blade_tip_r < 6:
            bad.append("height rods inside the blade-tip circle")
        if self.rod_r + self.lobe_r > self.guard_r_in - 3:
            bad.append("height-plate lobes touch the guard")
        if self.rod_bottom <= self.cut_max + self.blade_t + self.disc_t and self.rod_r - self.rod_d / 2 < self.disc_r + 4:
            bad.append("disc runs into the rod ends at the highest cut")
        if self.axle_z - self.motor_d / 2 - self.chassis_top < 4:
            bad.append("drive motor sits on the chassis: under 4 mm of clamp below it")
        if self.motor_face_y - self.motor_len < 15:
            bad.append("drive motors collide in the middle")
        if self.hub_d / 2 > self.axle_z - self.chassis_top - 1:
            bad.append("wheel hub reaches the chassis plate")
        top = self.caster_wheel_d / 2 + math.sqrt(max(0.0, (self.caster_wheel_d / 2) ** 2 - (self.caster_trail - 20) ** 2))
        if top > self.chassis_z - self.caster_washer - 10:
            bad.append("caster wheel hits the fork top plate")
        # The caster swivels: its swept circle must clear the guard.
        sweep = self.caster_trail + self.caster_wheel_d / 2 + 6
        d = math.hypot(self.caster_x - self.blade_x, self.caster_y)
        if d - sweep < self.guard_r_out + 5:
            bad.append("swivelling caster can hit the blade guard")
        if self.shell_half_w - (self.wheel_y + self.wheel_w / 2) - self.shell_wall < self.shell_travel + 5:
            bad.append("shell too close to the wheels for its bump travel")
        if self.shell_z0 < self.chassis_top + 2:
            bad.append("shell skirt below the chassis top")
        if self.shell_top - self.shell_wall - self.axle_z - self.wheel_d / 2 < 10:
            bad.append("shell too close to the top of the wheels")
        sx = (self.shell_x1 - self.shell_x0) / self.shell_cols
        sy = 2 * self.shell_half_w / self.shell_rows
        sz = self.shell_top - self.shell_z0
        if not fits_bed((sx, sy, sz), self.bed, self.bed_margin):
            bad.append(f"shell segments {sx:.0f} x {sy:.0f} x {sz:.0f} mm do not fit the printer bed")
        if self.tray_z <= self.battery[2] + self.chassis_top + 3:
            bad.append("tray sits on the battery")
        if self.tray_z <= self.plate_z(self.cut_max) + self.height_plate_t + self.blade_motor_h + 5:
            bad.append("blade motor reaches the tray at the highest cut")
        return bad


DEFAULT = Mower()


def fits_bed(size, bed, margin) -> bool:
    """A part fits when its sorted dimensions each fit the sorted bed, less a margin."""
    return all(a <= b - margin for a, b in zip(sorted(size), sorted(bed)))


@dataclass(frozen=True)
class Dock:
    """Charging dock: a flat base plate pegged to the lawn and a contact tower.

    Frame: origin on the ground at the front of the plate's centre line, x
    pointing the way the mower drives in (the mower arrives travelling +x).
    """
    plate_t: float = 3.0
    plate_len: float = 640.0
    plate_half_w: float = 250.0
    peg_holes: int = 6
    tower_x: float = 540.0         # tower face, where the mower's contacts touch
    tower_w: float = 180.0
    tower_depth: float = 90.0
    tower_h: float = 80.0          # under the mower's shell skirt when docked
    contact_z: float = 56.0        # contact strip centre above the plate (mower: contact pocket centre)
    contact_half_y: float = 25.0   # mower: contact_half_y
    contact_strip: tuple[float, float, float] = (3.0, 20.0, 30.0)  # spring-steel strip, x y z
    guide_len: float = 240.0       # wheel guide rails
    guide_h: float = 18.0
    guide_w: float = 14.0
    guide_y: float = 232.0         # just outside the mower's wheels (wheel_y + wheel_w / 2 + 10)
    bed: tuple[float, float, float] = (256.0, 256.0, 256.0)
    bed_margin: float = 6.0
    notes: list[str] = field(default_factory=list)

    def check(self) -> list[str]:
        bad = []
        if self.tower_x + self.tower_depth > self.plate_len + 40:
            bad.append("tower overhangs the base plate")
        if self.contact_half_y * 2 + self.contact_strip[1] >= self.tower_w - 20:
            bad.append("contact strips too close to the tower edges")
        for size in ((self.tower_w, self.tower_depth, self.tower_h), (self.guide_len, self.guide_w, self.guide_h)):
            if not fits_bed(size, self.bed, self.bed_margin):
                bad.append(f"printed part {size} does not fit the printer bed")
        return bad
