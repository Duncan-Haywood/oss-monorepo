"""Collector parameters: every dimension the parts are generated from, in millimetres.

Robot frame: origin on the ground under the middle of the drive axle,
x forward, y to the left, z up. Change a number here and rebuild; the
checks in `check()` say if the change breaks fit, clearance or pickup.

Dimensions of bought-in parts (motor, wheel, bearing, caster, Pi) are the
values the parts below were drawn around. Check them against the datasheet
of what you actually buy before cutting metal.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Collector:
    # Tennis ball (ITF 65.4-68.6 mm).
    ball_d: float = 67.0

    # Base plate (laser-cut aluminium).
    plate_t: float = 5.0
    base_x0: float = -260.0       # rear edge
    base_x1: float = 150.0        # front edge
    base_half_w: float = 250.0
    base_z: float = 35.0          # underside height above the ground
    corner_r: float = 15.0

    # Drive: 37 mm-class gearmotor with encoder, 6 mm D shaft, wheel on a hub.
    wheel_d: float = 150.0
    wheel_w: float = 40.0
    wheel_gap: float = 6.0        # base edge to wheel inner face
    motor_d: float = 37.0
    motor_len: float = 125.0      # gearbox + motor + encoder
    motor_face_inset: float = 5.0  # motor output face inside the base edge
    clamp_len: float = 45.0       # printed clamp grips this much gearbox
    clamp_wall: float = 8.0

    # Pickup drum ("ball mower" rod cage). Balls squeeze between rods.
    drum_len: float = 450.0       # inside length between the end discs
    disc_r: float = 176.0         # disc rim rolls on the ground
    rod_circle_r: float = 158.0
    rod_d: float = 3.0            # spring-steel (music) wire
    rod_gap_target: float = 53.0  # clear gap between rods; prototype to tune
    ring_inner_r: float = 135.0
    hub_r: float = 30.0
    spoke_w: float = 30.0
    bearing_od: float = 22.0      # 608/F608 bearing, 8 mm bore
    cover_r: float = 148.0
    clamp_ring_t: float = 3.0
    cover_t: float = 3.0
    drum_x: float = 366.0         # drum centre (drum_z = disc_r: it sits on the ground)

    # Yoke arms: pivot on the base, carry the drum.
    arm_t: float = 5.0
    arm_end_r: float = 20.0
    pivot_x: float = 120.0
    pivot_z: float = 70.0
    arm_gap: float = 3.0          # spacer between drum cover and arm

    # Caster at the rear.
    caster_x: float = -225.0
    caster_height: float = 25.0   # bought-in ball caster, mounting face to ground

    # Electronics tray on standoffs.
    tray_t: float = 3.0
    tray_x0: float = -205.0
    tray_x1: float = -85.0
    tray_half_w: float = 115.0
    standoff_h: float = 30.0

    # Battery envelope (24 V LiFePO4, 10 Ah class), strapped through base slots.
    battery: tuple[float, float, float] = (80.0, 180.0, 100.0)  # x, y, z
    battery_x: float = 90.0

    # Mast (camera) socket.
    mast_d: float = 20.0
    mast_len: float = 1000.0
    mast_x: float = -235.0

    notes: list[str] = field(default_factory=list)

    # ---- derived -----------------------------------------------------------
    @property
    def base_top(self) -> float:
        return self.base_z + self.plate_t

    @property
    def axle_z(self) -> float:
        return self.wheel_d / 2

    @property
    def wheel_y(self) -> float:
        """Wheel centre-plane |y|."""
        return self.base_half_w + self.wheel_gap + self.wheel_w / 2

    @property
    def track(self) -> float:
        return 2 * self.wheel_y

    @property
    def motor_face_y(self) -> float:
        return self.base_half_w - self.motor_face_inset

    @property
    def drum_z(self) -> float:
        return self.disc_r

    @property
    def n_rods(self) -> int:
        return max(3, round(2 * math.pi * self.rod_circle_r / (self.rod_gap_target + self.rod_d)))

    @property
    def rod_gap(self) -> float:
        return 2 * math.pi * self.rod_circle_r / self.n_rods - self.rod_d

    @property
    def rod_len(self) -> float:
        return self.drum_len + 2 * self.plate_t

    @property
    def disc_inner_y(self) -> float:
        return self.drum_len / 2

    @property
    def arm_inner_y(self) -> float:
        return self.disc_inner_y + self.plate_t + max(self.cover_t, self.clamp_ring_t) + self.arm_gap

    @property
    def overall(self) -> tuple[float, float]:
        """(length, width) in mm."""
        return (self.drum_x + self.disc_r - self.base_x0, 2 * (self.wheel_y + self.wheel_w / 2))

    def drum_capacity(self, packing: float = 0.55) -> int:
        """Balls the drum holds at a loose random packing, ignoring the hub."""
        inner = math.pi * (self.rod_circle_r - self.rod_d) ** 2 * self.drum_len
        ball = math.pi / 6 * self.ball_d ** 3
        return int(inner * packing / ball)

    def check(self) -> list[str]:
        """Design-rule violations (empty list = all good)."""
        bad = []
        if not 0.70 * self.ball_d <= self.rod_gap <= 0.85 * self.ball_d:
            bad.append(f"rod gap {self.rod_gap:.1f} mm should squeeze a {self.ball_d} mm ball by 15-30%")
        if self.rod_circle_r + self.rod_d / 2 >= self.disc_r - 6:
            bad.append("rods too close to the disc rim")
        if self.rod_circle_r - self.rod_d / 2 - 6 <= self.ring_inner_r:
            bad.append("rods too close to the inside of the disc ring")
        if self.cover_r >= self.disc_r - 20:
            bad.append("cover overlaps the rod clamp ring")
        if self.drum_x - self.disc_r <= self.base_x1 + 20:
            bad.append("drum would hit the base plate")
        if self.base_z < 30:
            bad.append("ground clearance under 30 mm")
        if self.motor_face_y - self.motor_len < 40:
            bad.append("motors collide in the middle")
        if self.axle_z - self.motor_d / 2 - self.base_top < 4:
            bad.append("motor sits on the base plate: under 4 mm of clamp below it; larger wheels or a lower base")
        tray_ok = self.tray_x0 > self.base_x0 + 10 and self.tray_x1 < -self.motor_d
        if not tray_ok:
            bad.append("electronics tray does not fit between the rear edge and the motors")
        return bad


DEFAULT = Collector()


@dataclass(frozen=True)
class Feeder:
    """Feeder + moving catch net, in millimetres.

    Frame: origin on the ground at the middle of the net plane, x toward the
    player, y along the net (the base rolls along y), z up. The net hangs in
    the plane x = 0..25. The launcher head pivots about a y axis (elevation) on
    a turntable (azimuth) behind the net.
    """
    ball_d: float = 67.0
    plate_t: float = 5.0

    # Base: 2040 extrusion (20 wide x 40 tall) rectangle on four wheels, plus the
    # 3 m net beam as its front member.
    beam_len: float = 3000.0
    base_depth: float = 700.0     # x extent, rear edge to net plane
    base_half_w: float = 450.0    # side rails' outer faces
    rail_w: float = 20.0
    rail_h: float = 40.0
    rail_z: float = 155.0         # underside of the rails
    wheel_d: float = 150.0
    wheel_w: float = 40.0
    wheel_x: tuple[float, float] = (-100.0, -600.0)
    gearmotor_d: float = 37.0
    gearmotor_len: float = 100.0
    bracket_t: float = 5.0

    # Mast: four posts and a turntable.
    post_dx: float = 80.0         # posts at head_x +- this
    post_half_y: float = 130.0
    mast_top_z: float = 640.0     # underside of the fixed mast plate
    bearing_h: float = 10.0       # lazy-susan bearing
    bearing_d: float = 150.0

    # Launcher head (local frame: origin between the wheels, x to the player).
    wheel_head_d: float = 150.0
    wheel_head_w: float = 45.0
    wheel_gap: float = 54.0       # ball squeezed ~13 mm
    plate_half_y: float = 40.0    # inner face of the head plates: room for a 67 mm ball
    motor_d: float = 63.0
    motor_len: float = 70.0
    motor_pitch: float = 25.0     # M4 square
    head_x0: float = -110.0       # plate rear edge, relative to the wheel centres
    head_x1: float = 110.0
    head_z0: float = -225.0
    head_z1: float = 190.0
    pivot_z_rel: float = -200.0   # elevation axis below the ball path
    head_x: float = -110.0        # world x of the wheel centres (muzzle ends at the net plane)
    launch_z: float = 1000.0      # ball path height
    elev_min: float = -15.0
    elev_max: float = 45.0

    # Cheeks that hold the head's pivot bolt.
    cheek_x_half: float = 60.0
    cheek_gap: float = 2.5

    # Net frame.
    pole_d: float = 25.0
    net_w: float = 3000.0
    net_h: float = 2500.0
    camera_bar_len: float = 800.0

    # Wind check
    net_solidity: float = 0.2     # fraction of the net area that is twine
    drag_coeff: float = 1.2
    design_wind: float = 8.0      # m/s steady (Beaufort 5)
    foot_half_y: float = 1450.0

    # ---- derived -----------------------------------------------------------
    @property
    def rail_top(self) -> float:
        return self.rail_z + self.rail_h

    @property
    def pivot_z(self) -> float:
        return self.launch_z + self.pivot_z_rel

    @property
    def head_gap_axis(self) -> float:
        """Wheel centre height above/below the ball path."""
        return self.wheel_head_d / 2 + self.wheel_gap / 2

    @property
    def mast_plate_z(self) -> float:
        return self.mast_top_z

    @property
    def turntable_top(self) -> float:
        return self.mast_top_z + self.plate_t + self.bearing_h + self.plate_t

    @property
    def net_top(self) -> float:
        return self.rail_top + self.net_h

    @property
    def pole_top(self) -> float:
        return self.net_top - 15.0

    @property
    def wheel_y(self) -> float:
        return self.base_half_w + self.bracket_t + 2.0 + self.wheel_w / 2

    @property
    def net_area(self) -> float:
        return self.net_w * self.net_h / 1e6

    @property
    def wind_force_n(self) -> float:
        """Steady drag on the net at design_wind (N): 0.5 rho Cd A solidity v^2."""
        return 0.5 * 1.2 * self.drag_coeff * self.net_area * self.net_solidity * self.design_wind ** 2

    def ballast_kg(self, structure_kg: float) -> float:
        """Ballast, centred between the wheel lines, so the design wind cannot tip the base.

        The wind pushes at the net's mid-height. The base tips about the near
        wheel line from either direction; the weight acts midway between the
        two wheel lines. Conservative: it ignores the feet and the net's own
        flex.
        """
        h = (self.rail_top + self.net_top) / 2 / 1000
        arm = abs(self.wheel_x[0] - self.wheel_x[1]) / 2 / 1000
        need = self.wind_force_n * h / (9.81 * arm)
        return max(0.0, need - structure_kg)

    def check(self) -> list[str]:
        bad = []
        if not 0.80 * self.ball_d <= self.wheel_gap <= 0.90 * self.ball_d:
            bad.append(f"launcher wheel gap {self.wheel_gap:g} mm should squeeze a {self.ball_d:g} mm ball by 10-20%")
        if self.plate_half_y < self.ball_d / 2 + 5:
            bad.append("head plates are too close to the ball path")
        if self.wheel_head_w / 2 + 5 > self.plate_half_y:
            bad.append("launcher wheel touches the head plates")
        if self.rail_z < self.wheel_d / 2 + self.gearmotor_d / 2 + 4:
            bad.append("rails too low for the drive motors")
        if self.turntable_top - self.pivot_z > -60:
            bad.append("pivot is less than 60 mm above the turntable")
        if self.head_x1 + self.head_x < -5 or self.head_x1 + self.head_x > 60:
            bad.append("muzzle is not at the net plane (0 to 60 mm through it)")
        if abs(self.foot_half_y) * 2 > self.beam_len:
            bad.append("feet are beyond the ends of the net beam")
        if self.cheek_x_half > self.head_x1:
            bad.append("cheeks reach past the muzzle")
        return bad


DEFAULT_FEEDER = Feeder()
