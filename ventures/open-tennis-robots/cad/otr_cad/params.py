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
    head_x0: float = -250.0       # plate rear edge, relative to the wheel centres (the feed shuttle runs back here)
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

    # Feed: balls queue in a column that drops into the pocket of a sliding
    # shuttle between the head plates; the shuttle carries one ball forward to
    # the wheels, its solid rear closing the column meanwhile. A hose joins the
    # column's top socket to the hopper.
    feed_col_x: float = -125.0    # column axis, relative to the wheel centres
    feed_clear: float = 0.8       # printed parts' gap to each head plate
    feed_stroke: float = 95.0
    feed_floor_t: float = 8.0
    shuttle_h: float = 72.0       # taller than one ball, shorter than two
    socket_h: float = 40.0
    # Front retainer: two printed flexure arms narrow the shuttle's open front so a ball
    # cannot roll out when the head tilts nose-down; the wheels pull it through.
    retain_frac: float = 0.87     # narrowed gap, as a fraction of the ball diameter
    retain_t: float = 1.6         # arm thickness (about four 0.4 mm lines)
    retain_relief: float = 5.0    # gap behind each arm for it to flex into
    retain_len: float = 32.0      # arm length from its root to the free end
    petg_e_mpa: float = 1500.0    # printed PETG bending modulus across layers (assumption)
    petg_strain_max: float = 0.02  # working strain limit for a printed arm (assumption)
    ball_g: float = 57.0          # ITF ball mass is 56 to 59.4 g
    wheel_pull_n: float = 60.0    # force the wheels put on a ball along the path (assumption: measure it)
    # Launch: top speed and spin the head must reach, and the traction the nip must give.
    launch_v_max: float = 25.0    # m/s off the muzzle (assumption: a fast practice drive)
    launch_topspin_rpm: float = 3000.0  # at that speed (assumption)
    speed_eff: float = 0.85       # exit speed / mean wheel surface speed: tennisbots.launcher.WheelLauncher default
    spin_eff: float = 0.5         # exit spin / no-slip spin: same default
    wheel_rpm_max: float = 7000.0  # same default: motor and bearing limit (assumption)
    ball_stiff_n_mm: float = 20.0  # force per mm of squeeze between the wheels (assumption: measure it)
    wheel_mu: float = 0.8         # rubber on felt (assumption: measure it)
    hose_id: float = 72.0
    hose_od: float = 82.0
    hose_min_bend: float = 150.0  # smallest bend radius the hose tolerates
    feed_min_slope_deg: float = 30.0  # steepest-needed: a ball will not roll down less in a smooth hose (assumption)

    # Hopper: a storage tub on a sloped laser shelf, on four posts on the deck.
    tub_l: float = 440.0
    tub_w: float = 340.0
    tub_h: float = 250.0
    tub_wall: float = 3.0
    packing: float = 0.55         # fraction of the tub's inside volume that balls fill, with a sloped floor
    want_balls: int = 120
    shelf_slope_deg: float = 12.0  # falls toward the net, to the outlet
    hopper_out_x: float = -330.0
    hopper_out_z: float = 1560.0   # underside of the shelf at the outlet
    post_front_x: float = -380.0
    post_rear_x: float = -640.0
    shelf_post_y: float = 225.0

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

    # ---- feed geometry (head frame: x forward, z up from the ball path) --------
    @property
    def shuttle_z0(self) -> float:
        return -self.ball_d / 2 + 0.5

    @property
    def floor_top(self) -> float:
        return -self.ball_d / 2

    @property
    def roof_bottom(self) -> float:
        return self.shuttle_z0 + self.shuttle_h + 0.5

    @property
    def hole_d(self) -> float:
        return self.ball_d + 3.0

    @property
    def col_top(self) -> float:
        return self.head_z1 + 1.5

    @property
    def mouth_rel(self) -> tuple[float, float]:
        """Hose socket mouth, head frame (x, z)."""
        return (self.feed_col_x, self.col_top + self.socket_h)

    @property
    def nip_x(self) -> float:
        """Ball-centre x at which the ball first touches both wheels."""
        reach = self.wheel_head_d / 2 + self.ball_d / 2
        return -math.sqrt(reach ** 2 - self.head_gap_axis ** 2)

    def mouth_world(self, elev_deg: float) -> tuple[float, float]:
        """World (x, z) of the socket mouth with the head tilted `elev_deg` nose up about the pivot."""
        mx, mz = self.mouth_rel
        dx, dz = mx, mz - self.pivot_z_rel
        t = math.radians(elev_deg)
        return (self.head_x + dx * math.cos(t) - dz * math.sin(t),
                self.pivot_z + dx * math.sin(t) + dz * math.cos(t))

    @property
    def shelf_origin(self) -> tuple[float, float]:
        """World (x, z) of the shelf's underside centre; the shelf falls toward +x."""
        s = math.radians(self.shelf_slope_deg)
        a = self.shelf_l / 2 - 55.0
        return (self.hopper_out_x - a * math.cos(s), self.hopper_out_z + a * math.sin(s))

    @property
    def retain_gap(self) -> float:
        return self.retain_frac * self.ball_d

    @property
    def retain_defl(self) -> float:
        """How far each arm must spring outward to let the ball through."""
        return (self.ball_d - self.retain_gap) / 2

    @property
    def retain_arm_n(self) -> float:
        """Side force of one arm at full deflection (end-loaded cantilever; worst case)."""
        i = self.shuttle_h * self.retain_t ** 3 / 12
        return 3 * self.petg_e_mpa * i * self.retain_defl / self.retain_len ** 3

    @property
    def retain_arm_strain(self) -> float:
        return 3 * self.retain_t * self.retain_defl / (2 * self.retain_len ** 2)

    @property
    def retain_pass_n(self) -> float:
        """Pull along the path to drag a ball through both arms (frictionless contact on the ball's circle)."""
        half = self.retain_gap / 2
        r = self.ball_d / 2
        return 2 * self.retain_arm_n * math.sqrt(r * r - half * half) / half

    @property
    def retain_hold_n(self) -> float:
        """Ball weight along the path at the steepest nose-down tilt."""
        return self.ball_g / 1000 * 9.81 * math.sin(math.radians(-self.elev_min))

    @property
    def nip_len(self) -> float:
        """Distance the ball's centre travels while it touches both wheels (rigid-ball geometry), mm."""
        return -2 * self.nip_x

    @property
    def launch_rpm(self) -> tuple[float, float]:
        """(top, bottom) wheel rpm for `launch_v_max` with `launch_topspin_rpm`, as WheelLauncher.wheel_rpm."""
        r = self.wheel_head_d / 2000
        total = 2 * self.launch_v_max / self.speed_eff
        diff = 2 * (self.ball_d / 2000) * self.launch_topspin_rpm * 2 * math.pi / 60 / self.spin_eff
        per = 60 / (2 * math.pi * r)
        return (total + diff) / 2 * per, (total - diff) / 2 * per

    @property
    def launch_force_n(self) -> float:
        """Mean push along the path to take a ball from rest to `launch_v_max` within the nip."""
        if self.nip_len <= 0:
            return math.inf
        return self.ball_g / 1000 * self.launch_v_max ** 2 / (2 * self.nip_len / 1000)

    @property
    def launch_traction_n(self) -> float:
        """Most the two wheels can push with, at the full squeeze (Coulomb friction, both sides)."""
        return 2 * self.wheel_mu * self.ball_stiff_n_mm * (self.ball_d - self.wheel_gap)

    @property
    def shuttle_rear(self) -> float:
        """Rear end of the shuttle: it still shuts the column when pushed fully forward."""
        return self.feed_col_x - self.hole_d / 2 - 2.0 - self.feed_stroke

    def shelf_underside_z(self, x: float) -> float:
        cx, cz = self.shelf_origin
        return cz - (x - cx) * math.tan(math.radians(self.shelf_slope_deg))

    @property
    def shelf_l(self) -> float:
        return self.tub_l + 20.0

    @property
    def shelf_w(self) -> float:
        return 2 * (self.shelf_post_y + 25.0)

    def tub_capacity(self) -> int:
        inside = (self.tub_l - 2 * self.tub_wall) * (self.tub_w - 2 * self.tub_wall) * (self.tub_h - self.tub_wall)
        return int(self.packing * inside / (math.pi / 6 * self.ball_d ** 3))

    def hose_chords(self, steps: int = 4) -> list[tuple[float, float, float]]:
        """(elevation, chord mm, slope deg) from the hopper outlet to the socket mouth over the elevation range."""
        out = []
        for i in range(steps + 1):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / steps
            mx, mz = self.mouth_world(e)
            dx, dz = self.hopper_out_x - mx, self.hopper_out_z - mz
            out.append((e, math.hypot(dx, dz), math.degrees(math.atan2(dz, abs(dx)))))
        return out

    @property
    def hose_len(self) -> float:
        """Cut length: the longest chord with 5% spare, rounded up to 10 mm."""
        return math.ceil(max(c for _, c, _ in self.hose_chords()) * 1.05 / 10) * 10

    def hose_bow_radius(self) -> float:
        """Smallest bend radius, taking the hose as a circular arc of its cut length across the shortest chord."""
        c = min(c for _, c, _ in self.hose_chords())
        length = self.hose_len
        if length <= c:
            return math.inf
        lo, hi = c / 2, 1e6   # arc length 2 r asin(c / 2r) falls from pi c / 2 toward c as r grows
        if length >= math.pi * c / 2:  # more than a semicircle: radius is c/2 or less
            return c / 2
        for _ in range(80):
            r = (lo + hi) / 2
            if 2 * r * math.asin(c / (2 * r)) > length:
                lo = r
            else:
                hi = r
        return (lo + hi) / 2

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
        bad += self.check_feed()
        bad += self.check_launch()
        return bad

    def check_launch(self) -> list[str]:
        bad = []
        rt, rb = self.launch_rpm
        if rb < 0 or max(rt, rb) > self.wheel_rpm_max:
            bad.append(f"launch of {self.launch_v_max:g} m/s with {self.launch_topspin_rpm:g} rpm topspin needs wheels at "
                       f"{rt:.0f} and {rb:.0f} rpm, outside 0 to {self.wheel_rpm_max:g}")
        if self.launch_force_n * 1.5 > self.launch_traction_n:
            bad.append(f"nip pushes at most {self.launch_traction_n:.0f} N but {self.launch_v_max:g} m/s needs "
                       f"{self.launch_force_n:.0f} N over {self.nip_len:.0f} mm (1.5x margin)")
        if self.head_x1 < -self.nip_x + self.ball_d / 2 + 5:
            bad.append("head plates end before the ball has left the wheels")
        return bad

    def retain_strain_bad(self) -> str:
        if not 0.5 < self.retain_frac < 0.95:
            return "retainer gap must be 50 to 95% of the ball diameter"
        if self.retain_arm_strain > self.petg_strain_max:
            return f"retainer arm strain {self.retain_arm_strain:.1%} is over the {self.petg_strain_max:.0%} limit"
        if self.retain_pass_n * 1.5 > self.wheel_pull_n:
            return f"wheels ({self.wheel_pull_n:g} N) may not pull a ball through the retainer ({self.retain_pass_n:.0f} N)"
        if self.retain_pass_n < 3 * self.retain_hold_n:
            return "retainer is too weak to hold a ball at the steepest nose-down tilt"
        if self.retain_gap / 2 + self.retain_t + self.retain_relief + 3 > self.plate_half_y - self.feed_clear - 0.2:
            return "retainer arms and relief do not fit across the shuttle"
        return ""

    def check_feed(self) -> list[str]:
        bad = []
        if not self.ball_d < self.shuttle_h < 2 * self.ball_d - 5:
            bad.append("shuttle must be taller than one ball and shorter than two, or it does not meter")
        tube_od = 2 * self.plate_half_y - 2 * self.feed_clear
        if tube_od < self.hole_d + 6:
            bad.append("column wall under 3 mm between the head plates")
        if self.feed_col_x + tube_od / 2 > -self.wheel_head_d / 2 - 3:
            bad.append("feed column touches the top wheel")
        if not self.nip_x <= self.feed_col_x + self.feed_stroke <= 0:
            bad.append("feed stroke does not carry the ball to the wheels")
        if self.feed_col_x - self.hole_d / 2 - 10 < self.head_x0:
            bad.append("feed column is behind the head plates")
        if self.hose_id < self.ball_d + 3 or self.hose_od > self.hole_d + 15:
            bad.append("hose does not pass a ball, or is too wide for its socket")
        if self.tub_capacity() < self.want_balls:
            bad.append(f"tub holds about {self.tub_capacity()} balls, under the {self.want_balls} wanted")
        if self.retain_strain_bad():
            bad.append(self.retain_strain_bad())
        slopes = [s for _, _, s in self.hose_chords()]
        if min(slopes) < self.feed_min_slope_deg:
            bad.append(f"hose chord falls only {min(slopes):.0f} deg at its flattest; balls need {self.feed_min_slope_deg:g}")
        if self.hose_bow_radius() < self.hose_min_bend:
            bad.append(f"hose bows to a {self.hose_bow_radius():.0f} mm radius when the head is at its closest pose; "
                       f"the hose allows {self.hose_min_bend:g}")
        return bad


DEFAULT_FEEDER = Feeder()
