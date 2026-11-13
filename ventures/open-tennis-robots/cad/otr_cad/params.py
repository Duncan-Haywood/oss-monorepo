"""Collector parameters: every dimension the parts are generated from, in millimetres.

Robot frame: origin on the ground under the middle of the drive axle,
x forward, y to the left, z up. Change a number here and rebuild; the
checks in `check()` say if the change breaks fit, clearance or pickup.

Dimensions of bought-in parts (motor, wheel, bearing, caster, Pi) are the
values the parts below were drawn around. Check them against the datasheet
of what you actually buy before cutting metal.
"""

from __future__ import annotations

import functools
import math
from dataclasses import dataclass, field


def _bezier_stats(pts: tuple, n: int = 24) -> tuple[float, float, float]:
    """(length mm, peak curvature 1/mm, flattest slope deg) of a planar cubic Bezier through control points `pts`."""
    def at(t):
        u = 1 - t
        return tuple(u**3 * pts[0][i] + 3 * u * u * t * pts[1][i] + 3 * u * t * t * pts[2][i] + t**3 * pts[3][i] for i in (0, 1))

    length, prev = 0.0, at(0.0)
    for k in range(1, n + 1):
        q = at(k / n)
        length += math.dist(prev, q)
        prev = q
    kmax, smin = 0.0, 90.0
    for k in range(n + 1):
        t = k / n
        u = 1 - t
        a = tuple(3 * u * u * (pts[1][i] - pts[0][i]) + 6 * u * t * (pts[2][i] - pts[1][i]) + 3 * t * t * (pts[3][i] - pts[2][i]) for i in (0, 1))
        b = tuple(6 * u * (pts[2][i] - 2 * pts[1][i] + pts[0][i]) + 6 * t * (pts[3][i] - 2 * pts[2][i] + pts[1][i]) for i in (0, 1))
        sp = math.hypot(*a)
        if sp > 1e-9:
            kmax = max(kmax, abs(a[0] * b[1] - a[1] * b[0]) / sp ** 3)
            smin = min(smin, math.degrees(math.atan2(abs(a[1]), abs(a[0]))))
    return length, kmax, smin


COLLAR_SOCKET_MM = 25.0  # depth of the hose socket in the sleeve take-up's printed collar


@functools.lru_cache(maxsize=4096)
def _hose_curve_range(ox: float, oz: float, mx: float, mz: float, tilt_rad: float,
                      r_min: float, slope_min: float, step: float = 25.0) -> tuple[float, float] | None:
    """Shortest and longest hose (mm) that leaves the outlet straight down and enters the socket mouth along
    the column axis (tilted `tilt_rad` with the head), as a cubic Bezier with handle lengths from `step` to 900 mm,
    never bending tighter than `r_min` and never flatter than `slope_min` degrees. None if no such curve exists."""
    lo = hi = None
    n = int(900 / step)
    for i in range(1, n + 1):
        l0 = i * step
        for j in range(1, n + 1):
            l1 = j * step
            pts = ((ox, oz), (ox, oz - l0), (mx - l1 * math.sin(tilt_rad), mz + l1 * math.cos(tilt_rad)), (mx, mz))
            length, kmax, smin = _bezier_stats(pts)
            if kmax <= 1 / r_min and smin >= slope_min:
                lo = length if lo is None else min(lo, length)
                hi = length if hi is None else max(hi, length)
    return None if lo is None else (lo, hi)


@functools.lru_cache(maxsize=4096)
def _hose_curve_range_3d(o: tuple, m: tuple, u: tuple, r_min: float, slope_min: float,
                         step: float = 25.0, n: int = 24) -> tuple[float, float] | None:
    """3-D form of `_hose_curve_range` (2026-11-10): the hose leaves outlet point `o` straight down and enters socket
    mouth `m` along the unit column axis `u` (pointing out of the socket, up the column), which need not lie in the
    x-z plane once the head turns in azimuth. Same Bezier family, bend limit and fall limit; the fall is measured
    from the horizontal plane (tangent's z against its horizontal length). Shortest and longest fitting hose, or None."""
    kcap = 1 / r_min
    tan_min = math.tan(math.radians(slope_min))
    ts = [k / n for k in range(n + 1)]
    lo = hi = None
    cnt = int(900 / step)
    for i in range(1, cnt + 1):
        l0 = i * step
        p0 = o
        p1 = (o[0], o[1], o[2] - l0)
        for j in range(1, cnt + 1):
            l1 = j * step
            p2 = (m[0] + l1 * u[0], m[1] + l1 * u[1], m[2] + l1 * u[2])
            p3 = m
            d01 = [p1[c] - p0[c] for c in range(3)]
            d12 = [p2[c] - p1[c] for c in range(3)]
            d23 = [p3[c] - p2[c] for c in range(3)]
            s0 = [p2[c] - 2 * p1[c] + p0[c] for c in range(3)]
            s1 = [p3[c] - 2 * p2[c] + p1[c] for c in range(3)]
            ok = True
            for t in ts:
                w = 1 - t
                a = [3 * w * w * d01[c] + 6 * w * t * d12[c] + 3 * t * t * d23[c] for c in range(3)]
                h = math.hypot(a[0], a[1])
                if abs(a[2]) < tan_min * h - 1e-12:      # flatter than the fall limit
                    ok = False
                    break
                b = [6 * w * s0[c] + 6 * t * s1[c] for c in range(3)]
                cx = a[1] * b[2] - a[2] * b[1]
                cy = a[2] * b[0] - a[0] * b[2]
                cz = a[0] * b[1] - a[1] * b[0]
                sp = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2)
                if sp > 1e-9 and math.sqrt(cx * cx + cy * cy + cz * cz) > kcap * sp ** 3:
                    ok = False
                    break
            if not ok:
                continue
            length, prev = 0.0, p0
            for t in ts[1:]:
                w = 1 - t
                q = tuple(w ** 3 * p0[c] + 3 * w * w * t * p1[c] + 3 * w * t * t * p2[c] + t ** 3 * p3[c] for c in range(3))
                length += math.dist(prev, q)
                prev = q
            lo = length if lo is None else min(lo, length)
            hi = length if hi is None else max(hi, length)
    return None if lo is None else (lo, hi)


# Copper resistance per metre at 20 C by AWG (standard table), and the outside diameter of silicone-insulated
# fine-strand hook-up wire of that gauge (an assumption: read your reel). Used by the cable checks (2026-11-13).
AWG_OHM_PER_M = {14: 8.29e-3, 16: 13.2e-3, 18: 20.9e-3, 20: 33.3e-3, 22: 52.9e-3, 24: 84.2e-3, 26: 134e-3}
AWG_OD_MM = {14: 3.0, 16: 2.5, 18: 2.0, 20: 1.7, 22: 1.5, 24: 1.3, 26: 1.1}


@functools.lru_cache(maxsize=4096)
def _cable_loop_range(f: tuple, h: tuple, d: tuple, elev_deg: float, shape: tuple, r_min: float, rb: float,
                      step: float = 10.0, hmax: float = 360.0, n: int = 32,
                      target: float | None = None) -> tuple | None:
    """Shortest and longest free cable loop (mm) in the head's mid-plane (y = 0), pivot-relative (x, z), that leaves
    the turntable gland `f` straight up and enters the head clip `h` along `-d` (`d` points from the clip into the
    loop, already turned with the head), as a cubic Bezier with handles `step` to `hmax`, never bending tighter than
    `r_min` and keeping the bundle (radius `rb`) off everything in `shape`:
    (turntable top z, pivot bolt radius, head x0, head x1, head-frame z above which the head is full, lower wheel
    centre z and radius in the head frame, pivot z in the head frame, head-frame standoff circles (x, z, r)...).
    With `target`, also returns the control points of the fitting curve whose length is nearest it.
    None if no curve fits (2026-11-13)."""
    z_tt, bolt_r, hx0, hx1, hz_full, wz, wr, pz, *stand = shape
    c, s = math.cos(math.radians(elev_deg)), math.sin(math.radians(elev_deg))

    def free(x: float, z: float) -> bool:
        if z < z_tt + rb or math.hypot(x, z) < bolt_r + rb:
            return False
        hx, hz = x * c + z * s, -x * s + z * c + pz          # head frame (x from the wheel centres, z from the ball path)
        if hx0 - rb < hx < hx1 + rb and hz > hz_full - rb:
            return False
        if math.hypot(hx, hz - wz) < wr + rb:
            return False
        return all(math.hypot(hx - sx, hz - sz) >= sr + rb for sx, sz, sr in stand)

    kcap = 1 / r_min
    lo = hi = None
    best = None
    cnt = int(hmax / step)
    for i in range(1, cnt + 1):
        p1 = (f[0], f[1] + i * step)
        for j in range(1, cnt + 1):
            p2 = (h[0] + j * step * d[0], h[1] + j * step * d[1])
            pts = (f, p1, p2, h)
            ok, length, prev, prev_a = True, 0.0, f, None
            for k in range(n + 1):
                t = k / n
                u = 1 - t
                q = (u ** 3 * f[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * h[0],
                     u ** 3 * f[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * h[1])
                if 0 < k < n and not free(*q):
                    ok = False
                    break
                a = [3 * u * u * (p1[m] - f[m]) + 6 * u * t * (p2[m] - p1[m]) + 3 * t * t * (h[m] - p2[m]) for m in (0, 1)]
                b = [6 * u * (p2[m] - 2 * p1[m] + f[m]) + 6 * t * (h[m] - 2 * p2[m] + p1[m]) for m in (0, 1)]
                sp = math.hypot(*a)
                # a fold back on itself (handles past each other on one line) has zero cross product: catch it as a
                # tangent that turns more than 90 deg between samples, or stops
                if sp < 1e-6 or (prev_a and a[0] * prev_a[0] + a[1] * prev_a[1] <= 0) \
                        or abs(a[0] * b[1] - a[1] * b[0]) > kcap * sp ** 3:
                    ok = False
                    break
                prev_a = a
                if k:
                    length += math.dist(prev, q)
                prev = q
            if not ok:
                continue
            lo = length if lo is None else min(lo, length)
            hi = length if hi is None else max(hi, length)
            if target is not None and (best is None or abs(length - target) < abs(best[0] - target)):
                best = (length, pts)
    if lo is None:
        return None
    return (lo, hi) if target is None else (lo, hi, best)


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
    post_half_y: float = 160.0    # 130 until 2026-11-12: nose up 45 deg the head's plates met a rear post at 32.3 deg, short of the hard stops' reach
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
    az_max: float = 30.0          # head turns this far either side of straight ahead (hardware/feeder-catcher.md)
    az_steps: int = 2             # azimuth poses checked from 0 to az_max (the hopper sits on y = 0, so -az mirrors +az)

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
    # Wheel-axle squaring stack (assumptions: laser-cut 5052 plates, spacers cut on a saw; measure the first build).
    seat_gap_mm: float = 0.25     # motor face lifted off the plate at one edge (flatness, burr)
    bore_pos_tol_mm: float = 0.15  # laser bore position error, each plate
    plate_slot_play_mm: float = 0.4  # plates' x-offset from tab-and-slot clearance
    spacer_len_tol_mm: float = 0.3  # spacer length difference front to rear
    # Sleeve take-up (2026-11-10): the hose's top end slides up and down inside a rigid vertical sleeve under the
    # outlet, so the ball path stays a vertical drop plus one falling curve (assumptions: measure the first build).
    sleeve_overlap_mm: float = 20.0   # the collar never comes nearer than this to the sleeve's lower end
    sleeve_clear_mm: float = 14.0     # sleeve bore over the hose OD: room for the printed collar's socket wall
    sleeve_wall_mm: float = 3.0       # rigid tube wall (assumption: a drain or ducting tube; measure yours)
    sleeve_top_mm: float = 20.0       # outlet to the sleeve's top end (the printed socket under the sloped shelf)
    collar_h_mm: float = 40.0         # printed collar bonded on the hose's top end, slides in the sleeve
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
    hopper_out_x: float = -400.0   # -330 until 2026-11-10; -400 is as far back as the front posts allow (30 mm in from the shelf's front edge)
    hopper_out_z: float = 2025.0   # underside of the shelf at the outlet: the lowest at which the sleeve take-up fits every pose
                                   # (1560 left no hose curve at -15 or +45 deg, 2026-11-03; 1700 needed a pulley loop, 2026-11-10;
                                   # 2000 fitted azimuth 0 only: at +45 deg turned 30 deg the shortest hose was 31 mm too long, 2026-11-10)
    post_front_x: float = -380.0
    post_rear_x: float = -640.0
    shelf_post_y: float = 290.0    # 225 until 2026-11-10 (turned 30 deg at 15-35 deg nose up, the head's plates cut into the front posts); 245 until 2026-11-12 (clear to 31.6 deg only, short of the hard stops' reach)
    # Hopper frame loads and bracing (all assumptions to replace with a measurement).
    tub_mass_kg: float = 1.6          # empty storage tub
    side_load_g: float = 0.25         # sway load at the shelf as a fraction of the full hopper's weight
    side_load_min_n: float = 60.0     # a person leaning on it or a bump, if that is larger
    ext_E_mpa: float = 70000.0        # 6063 aluminium
    ext_I_weak_mm4: float = 9000.0    # 2040 T-slot, weak axis (catalogue figure is about 0.9 cm^4: check yours)
    ext_I_2020_mm4: float = 6000.0    # 2020 T-slot, either axis (about 0.6 cm^4)
    ext_A_2020_mm2: float = 360.0     # 2020 T-slot cross-section
    brace_foot_z: float = 120.0       # lower brace end above the deck
    brace_head_z: float = 120.0       # upper brace end below the shelf underside
    brace_min_factor: float = 3.0     # Euler buckling load over the brace's working load
    # Azimuth drive (2026-11-10): a NEMA 17 stepper hangs under the mast plate at +y and turns the turntable through a
    # bought steel pinion meshing with a printed gear sector bolted under the turntable plate's +y edge. The head turns
    # +-az_max only, so only a sector is made; the rest of the plate is trimmed inside the pinion's reach. Teeth are
    # printed, not cut in the plate: m1.5 slots are about 1.2 mm wide, too fine to laser in 5 mm aluminium.
    az_module: float = 1.5            # mm; a 15-tooth m1.5 pinion with a 5 mm bore is a stock part
    az_pinion_teeth: int = 15
    az_gear_teeth: int = 150          # full-circle count of the sector's teeth (pitch radius 112.5 mm)
    az_pressure_deg: float = 20.0
    az_sector_margin_deg: float = 10.0  # teeth beyond +-az_max at each end (8 until 2026-11-12: the hard stops at +-az_stop_deg need a tooth pitch of full mesh past them)
    az_clear_mm: float = 3.0          # trimmed plate edge inside the pinion's tip circle
    az_gear_gap_mm: float = 1.5       # printed sector's underside above the mast plate
    az_backlash_mm: float = 0.10      # tooth thinning at the pitch circle, printed into the sector (assumption: measure it)
    print_min_gap_mm: float = 0.8     # narrowest slot a 0.4 mm nozzle prints cleanly (two line widths; assumption)
    az_slew_deg: float = 30.0         # largest move between two shots: drill.example.json's corners at y +-2.5 m, x 9.5 m are 29.5 deg apart
    az_slew_s: float = 1.0            # time allowed for it: half of a 2 s feed interval, about a commercial machine's fastest (assumption)
    az_inertia_kgm2: float = 0.35     # turning inertia; the build measures it from the CAD (0.34 nose up 45 deg with the elevation actuator, 0.31 before it) and fails if this is below it
    az_bearing_mu: float = 0.02       # lazy-susan bearing, rolling friction at its ball circle (assumption)
    az_gear_eff: float = 0.90         # spur mesh efficiency, greased (assumption)
    az_shock: float = 1.5             # service factor on the tooth load (stepper start, a knock on the head)
    petg_bend_allow_mpa: float = 10.0  # printed PETG tooth-root bending, well under its ~50 MPa flexural strength (assumption)
    hose_pull_n: float = 5.0          # hose tension at the column socket (the take-up's assumption)
    stepper_torque_nm: float = 0.30   # pull-out torque at the slew speed (assumption: a 0.45 N m 17HS4401 class at 24 V; read your curve)
    stepper_hold_nm: float = 0.40     # holding torque when energised (same class)
    stepper_rotor_kgm2: float = 5.4e-6  # rotor inertia (54 g cm^2, same class)
    stepper_steps: int = 200
    stepper_body_mm: float = 48.0     # 42.3 mm square, this long under its flange
    az_torque_factor: float = 2.0     # pull-out (and holding) torque over the needed torque
    aim_range_m: float = 24.0         # net to the far baseline: where an azimuth error is read as a sideways miss
    # Azimuth home switch (2026-11-12): a subminiature roller-lever switch lies flat on a printed bracket on the mast plate,
    # inside the gear sector's inner edge, its roller pointing out. A cam lobe on the sector's inner edge, from a ramp to
    # the sector's end, holds it closed at every angle at or below `az_home_deg`, so the switch also says which side of
    # home the head is on at power-up (`home_switch_design`). Switch figures are assumptions (a D2F-L3 class part):
    # read your datasheet, and set the bracket's radial slots so it clicks in the middle of the lobe.
    az_home_deg: float = -32.0        # the turntable angle where the switch closes, turning negative (firmware AZ_HOME_DEG)
    home_sw_deg: float = 45.0         # world angle of the switch about the turntable axis, from +x (front, toward +y)
    home_sw_body: tuple = (12.8, 6.5, 5.8)  # tangential, radial, vertical (mm), lying flat (assumption)
    home_sw_hole_pitch: float = 6.5   # its two mounting holes (M2 self-tapping into the bracket; assumption)
    home_sw_lever_mm: float = 5.0     # body front to the roller's outer edge, free (assumption; at least the roller's diameter)
    home_sw_roller_r: float = 2.4     # roller radius; its axis is vertical, lying flat (assumption)
    home_sw_pretravel_mm: float = 1.2  # roller travel to the click (assumption)
    home_sw_overtravel_mm: float = 1.0  # roller travel past the click before the lever bottoms (assumption)
    home_sw_repeat_mm: float = 0.05   # operating-position repeatability at the roller (assumption)
    home_sw_op_tol_mm: float = 0.3    # operating-position tolerance part to part, at the roller (assumption)
    home_sw_free_clear_mm: float = 1.0  # roller's free edge inside the sector's plain inner arc
    home_cam_ramp_deg: float = 45.0   # lobe lead-in against the roller's travel (roller levers take up to about 45)
    home_runout_mm: float = 0.3       # bearing radial runout plus the lobe's print error, after the switch is set (assumption)
    home_bracket_t: float = 2.0       # printed bracket floor under the switch
    home_slot_mm: float = 1.5         # radial adjustment either way in the bracket's M3 slots
    az_microsteps: int = 4            # firmware AZ_MICROSTEPS: sets the step the homing creep can resolve
    # Azimuth hard stops (2026-11-12): two printed blocks on the mast plate, in the bearing gap the gear sector turns in,
    # each with a polyurethane pad glued on its face. The sector's own end faces hit the pads at +-az_stop_deg, past the
    # working range and the home click and before the pinion leaves the teeth (`az_stop_design`). Pad and insert
    # figures are assumptions: read your sheet's datasheet, and push a printed sector into a stop with a scale.
    az_stop_deg: float = 35.0         # turntable angle where a sector end meets its stop's pad, either side
    az_stop_margin_deg: float = 2.0   # stop at least this far past az_max (a runaway at full speed hits it, not a target)
    az_stop_mesh_pitches: float = 1.0  # whole tooth pitches of sector left past the pinion's line at a stop
    stop_pad_r: tuple = (95.0, 107.0)  # pad's radial span about the turntable axis: inside the sector's root circle
    stop_pad_h: float = 6.0           # pad height (z), within the sector's face width
    stop_pad_t: float = 5.0           # pad thickness, along the turning direction (4 mm would compress 49% at the runaway speed, no margin on the 50% counted on)
    stop_pad_e_mpa: float = 5.5       # compression modulus, Shore 70A polyurethane sheet (assumption)
    stop_pad_strain: float = 0.5      # largest compression the pad is counted on (assumption; PU bumpers run 40-50%)
    stop_block_depth: float = 16.0    # printed block behind the pad, along the turning direction
    stop_hit_deg_s: float = 60.0      # speed into a stop: the firmware's AZ_VMAX_DEG_S (a lost-step runaway at full speed)
    insert_shear_n: float = 300.0     # allowed shear on one M4 heat-set insert in PETG (assumption; push-out tests run higher)

    # Elevation drive (2026-11-11): a linear actuator in a plane outboard of the -y (guard-side) cheek pushes a pin on
    # the guard plate. Gravity on the head is measured from the CAD (`feeder.head_moment`); the pin and anchor were
    # chosen by a grid search (README "Elevation drive") for the least peak push with a stock 150 mm stroke.
    elev_pin_x: float = -175.0        # pin, head frame (x from the wheel centres): behind the feed column's rear wall at -161
    elev_pin_z: float = 60.0          # pin, head frame (z from the ball path): above the feed roof (47.5) with room for a nut
    elev_anchor_dx: float = -100.0    # anchor, from the pivot (world x, turns with the turntable, not with elevation)
    elev_anchor_dz: float = -75.0     # anchor, from the pivot (world z): 65 mm above the turntable plate, on the cheek's tab
    elev_act_y: float = -72.0         # actuator's centre plane: outboard of the -y cheek (outer face at -52.5)
    elev_act_r: float = 13.0          # actuator body radius for the clearance check (about a 1 in body; check yours)
    elev_act_stroke: float = 150.0    # stock 6 in stroke
    elev_act_closed: float = 246.0    # hole-to-hole length retracted (read your datasheet): its own retract limit must stop
                                      # the head between +45 deg and `elev_clear_max` (2026-11-11; was 240, which pulled
                                      # the plates into the turntable and mast plates at +48.8 deg)
    elev_clear_max: float = 46.3      # the head plates clear the turntable plate up to +46.36 deg (bisection on the
                                      # swept solids, 2026-11-11; test_cad re-checks both sides)
    elev_act_force_n: float = 220.0   # rated push (assumption: a 50 lb class 12-24 V actuator)
    elev_act_speed_mm_s: float = 20.0  # speed at that load (assumption)
    elev_end_mm: float = 3.0          # kept off each end stop
    elev_force_factor: float = 2.0    # rated push over the largest push needed

    # Shuttle drive (2026-11-11): a hobby servo outboard of the motor plate turns a crank; a rod from the crank pin
    # runs to a pin in the shuttle's side through a slot in the motor plate. An in-line slider-crank with the crank
    # in front: a 180 deg turn of the servo is the whole stroke, and both ends of the stroke are the crank's dead
    # centres, where the shuttle's position does not depend on the servo's angle and loads on the shuttle cannot
    # turn the servo. It replaces the BOM's 100 mm linear actuator, which at 20-30 mm/s needs 3 to 5 s a stroke.
    shuttle_pin_back: float = 20.0    # shuttle pin, ahead of the shuttle's rear end
    shuttle_rod_mm: float = 120.0     # rod, pin centre to pin centre
    shuttle_rod_t: float = 5.0        # rod and crank thickness (printed)
    shuttle_pin_d: float = 5.0        # M4 shoulder bolts: 5 mm shoulder
    servo_l: float = 40.5             # standard-size servo body (assumed dimensions: measure yours)
    servo_w: float = 20.0
    servo_h: float = 40.5             # body below its top face
    servo_flange_l: float = 54.0      # mounting tabs tip to tip
    servo_flange_below: float = 12.0  # tabs' outer face below the top face
    servo_shaft_from_end: float = 10.0
    servo_spline_mm: float = 5.0      # top face to the crank's inner face (spline and round horn)
    servo_range_deg: float = 180.0    # turn between the gate pulses (GATE_LO_US/GATE_HI_US in firmware/esp32/config.py)
    servo_stall_nm: float = 1.75      # 18 kg cm class (DS3218 class at 5 V, as commonly listed; an assumption: read yours)
    servo_s_per_60: float = 0.16      # no-load speed, same class (assumption)
    servo_torque_factor: float = 1.5  # stall torque over the largest torque needed
    feed_mu_slide: float = 0.35       # printed PETG shuttle on PETG and aluminium (assumption: measure it)
    feed_mu_ball: float = 0.6         # felt ball on the shuttle's top (assumption)
    feed_dwell_s: float = 0.10        # shuttle held forward while the wheels take the ball (assumption)
    feed_interval_min_s: float = 2.0  # shortest drill interval to support (about a commercial machine's fastest, as az_slew_s)

    # Cables to the head (2026-11-13). The launcher ESCs, the ESP32 and a 6 V buck for the shuttle servo sit on the
    # base deck; everything that tilts or turns is wired from there. The bundle rises on the turntable axis through the
    # mast and turntable plates' 40 mm holes (it twists there as the head turns, and never swings), leaves a printed
    # gland on the turntable plate straight up and makes one free loop in the head's mid-plane to a printed clip on the
    # head's rear lower standoff. Loose wires in a spiral wrap, so each bends about its own axis: the loop's bend limit
    # is `cable_bend_factor` times the thickest wire, not the bundle. Wire and servo figures are assumptions.
    head_wires: tuple = (("launcher motor phases", 6, 14), ("wheel tachometers", 6, 26),
                         ("shuttle servo signal", 1, 26), ("shuttle servo supply and return", 2, 20))
    turntable_wires: tuple = (("elevation actuator", 2, 18), ("elevation feedback pot", 3, 26))
    bundle_fill: float = 0.6          # wire area over the bundle's circle (assumption)
    cable_bend_factor: float = 10.0   # moving wire's smallest bend radius over its own diameter (assumption)
    cable_clear_mm: float = 3.0       # bundle kept this far off every part
    cable_twist_deg_m: float = 180.0  # twist a free run of loose wires may take, either way, per metre (assumption)
    cable_gland_h: float = 12.0       # the loop leaves the gland this far above the turntable plate
    cable_clip_x: float = -200.0      # head frame: bundle centre at the standoff clip (rear lower standoff at -215, -150)
    cable_clip_z: float = -180.0
    cable_clip_dir_deg: float = 90.0  # head frame: the loop leaves the clip this way (90 = up, toward the ball path)
    cable_clamp_z: float = 420.0      # fixed clamp on the turntable axis, under the mast plate: the twist runs from here
    bearing_bore_d: float = 60.0      # lazy-susan bearing's open centre (assumption: read yours)
    electronics_x: float = -600.0     # ESP32, ESCs and the servo's buck on the deck's M3 grid, behind the battery
    servo_supply_v: float = 6.0       # buck output for the shuttle servo (standard-size servos take 4.8 to 6.8 V)
    servo_stall_v: float = 5.0        # the voltage `servo_stall_nm` is quoted at
    servo_stall_a: float = 3.0        # stall current at `servo_supply_v` (assumption: DS3218 class; read yours)
    servo_lead_awg: int = 20          # servo supply and return from the buck to the servo
    servo_vih: float = 2.4            # servo's signal input threshold (assumption: many accept 3.3 V logic; check yours)
    logic_high_v: float = 3.3         # the ESP32's output high

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

    # ---- hopper frame: four posts, then two diagonal braces each way ----------
    @property
    def hopper_load_n(self) -> float:
        """Weight on the posts: the full tub of balls, the tub and the 5 mm aluminium shelf (density 2.7 g/cm^3)."""
        shelf_kg = self.shelf_l * self.shelf_w * self.plate_t * 2.7e-6
        return 9.81 * (self.tub_capacity() * self.ball_g / 1000 + self.tub_mass_kg + shelf_kg)

    @property
    def hopper_side_load_n(self) -> float:
        return max(self.side_load_g * self.hopper_load_n, self.side_load_min_n)

    @property
    def post_len(self) -> float:
        """Mean post length, deck to shelf underside."""
        xs = (self.post_front_x, self.post_rear_x)
        return sum(self.shelf_underside_z(x + 10.0) for x in xs) / 2 - (self.rail_top + self.plate_t)

    def brace_ends(self, axis: str) -> tuple[tuple[float, float], tuple[float, float]]:
        """Centre-line ends (a, z) of a diagonal in the x-z plane (axis 'x', a = x) or the y-z plane ('y', a = y).

        x braces rise from the rear post's foot to the front post's head, on the outer face of each side pair of
        posts; the y brace rises from the left rear post's foot to the right rear post's head, behind the pair.
        """
        z0 = self.rail_top + self.plate_t + self.brace_foot_z
        if axis == "x":
            return (self.post_rear_x, z0), (self.post_front_x, self.shelf_underside_z(self.post_front_x + 10.0) - self.brace_head_z)
        return (-self.shelf_post_y, z0), (self.shelf_post_y, self.shelf_underside_z(self.post_rear_x + 10.0) - self.brace_head_z)

    def brace_len(self, axis: str) -> float:
        (a0, z0), (a1, z1) = self.brace_ends(axis)
        return math.hypot(a1 - a0, z1 - z0)

    def brace_force_n(self, axis: str) -> float:
        """Axial force in one diagonal under the side load, taking the posts' ends as pins (M5 joints carry no
        useful moment). Two x braces share a load toward the net; the one y brace takes the whole load along it
        (the shelf, bolted to all four posts, holds the front pair's heads to the rear pair's in plan)."""
        (a0, z0), (a1, z1) = self.brace_ends(axis)
        return self.hopper_side_load_n / (2 if axis == "x" else 1) * self.brace_len(axis) / abs(a1 - a0)

    def brace_buckling_n(self, axis: str) -> float:
        """Euler load of a pinned 2020 diagonal."""
        return math.pi ** 2 * self.ext_E_mpa * self.ext_I_2020_mm4 / self.brace_len(axis) ** 2

    def post_buckling_n(self) -> float:
        """Euler load of one pinned, unbraced 2040 post about its weak axis."""
        return math.pi ** 2 * self.ext_E_mpa * self.ext_I_weak_mm4 / self.post_len ** 2

    def check_hopper_frame(self) -> list[str]:
        bad = []
        per_post = self.hopper_load_n / 4
        if self.post_buckling_n() < 4 * per_post:
            bad.append(f"a hopper post buckles at {self.post_buckling_n():.0f} N, under 4x its {per_post:.0f} N share")
        for ax in ("x", "y"):
            f, cr = self.brace_force_n(ax), self.brace_buckling_n(ax)
            if cr < self.brace_min_factor * f:
                bad.append(f"{ax} brace carries {f:.0f} N and buckles at {cr:.0f} N (needs {self.brace_min_factor:g}x)")
        return bad

    def hose_chords(self, steps: int = 4) -> list[tuple[float, float, float]]:
        """(elevation, chord mm, slope deg) from the hopper outlet to the socket mouth over the elevation range."""
        out = []
        for i in range(steps + 1):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / steps
            mx, mz = self.mouth_world(e)
            dx, dz = self.hopper_out_x - mx, self.hopper_out_z - mz
            out.append((e, math.hypot(dx, dz), math.degrees(math.atan2(dz, abs(dx)))))
        return out

    def hose_pose_ranges(self, steps: int = 4) -> list[tuple[float, tuple[float, float] | None]]:
        """(elevation, (shortest, longest) hose mm that fits that pose, or None) with the hose leaving the outlet
        straight down and entering the socket along the column axis, never tighter than `hose_min_bend` and
        never flatter than `feed_min_slope_deg` (`_hose_curve_range`). Unlike `hose_chords` this uses the end directions."""
        out = []
        for i in range(steps + 1):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / steps
            mx, mz = self.mouth_world(e)
            out.append((e, _hose_curve_range(self.hopper_out_x, self.hopper_out_z, mx, mz, math.radians(e),
                                             self.hose_min_bend, self.feed_min_slope_deg)))
        return out

    def hose_take_up_mm(self) -> float | None:
        """Hose length a fixed cut cannot absorb over the elevation range: the longest shortest-fit minus the
        shortest longest-fit. 0 or less means one cut length fits every pose; None if some pose has no fit at all."""
        r = [x for _, x in self.hose_pose_ranges()]
        if any(x is None for x in r):
            return None
        return max(lo for lo, _ in r) - min(hi for _, hi in r)

    def take_up_stroke_mm(self, ratio: float = 2.0) -> float | None:
        """Travel of a take-up that absorbs `hose_take_up_mm`: a spring-loaded pulley the hose loops round moves
        1/ratio of the hose length it pays out (ratio 2 for a single floating pulley). None if some pose has no fit."""
        t = self.hose_take_up_mm()
        return None if t is None else max(t, 0.0) / ratio

    def take_up_design(self, tension_n: float = 5.0, margin_mm: float = 30.0) -> dict | None:
        """A floating-pulley take-up sized from the pose ranges (2026-11-04). Rejected 2026-11-10: the 180 deg wrap turns
        the ball path uphill (`pulley_take_up_passes_balls`); kept to compare with `sleeve_take_up_design`. The hose runs fixed length `fixed_mm` plus
        twice the pulley's travel x (ratio 2). Fixed length is the shortest longest-fit, so x never goes below 0; each
        pose needs x in [(lo - fixed)/2, (hi - fixed)/2]. Pulley diameter is twice the hose's minimum bend radius; the
        track is the stroke plus one pulley diameter plus a margin at each end. The spring pulls the pulley with twice the
        hose tension `tension_n` (an assumption: enough to keep the hose taut without dragging the head). Returns None if
        some pose has no fit; `ok` is False if the same x cannot be chosen monotonically (never in practice) or a pose
        window is empty."""
        r = self.hose_pose_ranges()
        if any(x is None for _, x in r):
            return None
        fixed = min(hi for _, (lo, hi) in r)
        poses = []
        for e, (lo, hi) in r:
            xlo, xhi = max(0.0, (lo - fixed) / 2), (hi - fixed) / 2
            poses.append((e, xlo, xhi))
        stroke = max(xlo for _, xlo, _ in poses)
        # park the pulley at the lowest x each pose allows; it must stay inside the stroke
        ok = all(xlo <= xhi + 1e-9 and xlo <= stroke + 1e-9 for _, xlo, xhi in poses)
        d = 2 * self.hose_min_bend
        return {"fixed_mm": fixed, "stroke_mm": stroke, "pulley_d_mm": d, "track_mm": stroke + d + 2 * margin_mm,
                "spring_n": 2 * tension_n, "poses": poses, "ok": ok}

    def pulley_wrap_max_deg(self) -> float:
        """Largest angle a ball-carrying hose may wrap round a pulley (2026-11-10). On a horizontal axle the hose's
        direction turns by the wrap angle; starting from straight down it must stay at least `feed_min_slope_deg`
        below horizontal, so the wrap can be at most 90 - that. A floating pulley stores hose only with a 180 deg wrap,
        which turns the hose back upward on one leg: balls that roll by gravity cannot climb it."""
        return 90.0 - self.feed_min_slope_deg

    def pulley_take_up_passes_balls(self) -> bool:
        """False whenever a floating-pulley take-up is needed: its 180 deg wrap exceeds `pulley_wrap_max_deg`."""
        return 180.0 <= self.pulley_wrap_max_deg()

    def mouth_world_3d(self, elev_deg: float, az_deg: float) -> tuple[tuple, tuple]:
        """Socket mouth (x, y, z) and the column's unit axis (up the column, out of the socket) with the head tilted
        `elev_deg` nose up and turned `az_deg` on the turntable, whose axis is the vertical through (head_x, 0)."""
        mx, mz = self.mouth_world(elev_deg)
        t, a = math.radians(elev_deg), math.radians(az_deg)
        r = mx - self.head_x
        pos = (self.head_x + r * math.cos(a), r * math.sin(a), mz)
        axis = (-math.sin(t) * math.cos(a), -math.sin(t) * math.sin(a), math.cos(t))
        return pos, axis

    def _ranges_from(self, ox: float, oz: float, steps: int = 4, az: bool = True):
        """(elevation, azimuth, hose range or None) for each pose, from a start point straight above (ox, 0, oz).
        Azimuth 0 uses the planar `_hose_curve_range`; turned poses use `_hose_curve_range_3d` (added 2026-11-10:
        before that the take-up was sized at azimuth 0 only). `az=False` gives the azimuth-0 poses alone."""
        azs = [0.0] if not az or self.az_max <= 0 else [self.az_max * k / self.az_steps for k in range(self.az_steps + 1)]
        out = []
        for i in range(steps + 1):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / steps
            for a in azs:
                if a == 0.0:
                    mx, mz = self.mouth_world(e)
                    rng = _hose_curve_range(ox, oz, mx, mz, math.radians(e), self.hose_min_bend, self.feed_min_slope_deg)
                else:
                    m, u = self.mouth_world_3d(e, a)
                    m = tuple(round(v, 9) for v in m)
                    u = tuple(round(v, 12) for v in u)
                    rng = _hose_curve_range_3d((ox, 0.0, oz), m, u, self.hose_min_bend, self.feed_min_slope_deg)
                out.append((e, a, rng))
        return out

    def sleeve_take_up_design(self, tension_n: float = 5.0, step_mm: float = 25.0, max_mm: float = 600.0,
                              azimuth: bool = True) -> dict | None:
        """A take-up that keeps the ball path falling (2026-11-10). A rigid vertical sleeve hangs `sleeve_mm` under the
        hopper outlet; the hose's top end slides inside it, held up by a constant-force spring, so the free hose starts at
        the sleeve's lower end and its free length changes by the slide. Balls drop straight down the sleeve into the hose,
        then follow the one falling curve that `_hose_curve_range` checks. `sleeve_mm` (outlet to the sleeve's lower
        end) must hold the stroke (longest shortest-fit minus shortest longest-fit, from the lower start), the collar,
        the gap under the shelf and `sleeve_overlap_mm`. Searches sleeve lengths
        upward in `step_mm`; None if no length up to `max_mm` works (a longer sleeve lowers the start, which can only
        be done while every pose still has a curve). The spring pulls `tension_n` on one hose leg (assumption).
        Poses are (elevation, azimuth, slide low, slide high); since 2026-11-10 they include the head turned to
        `az_max` (`azimuth=False` sizes at azimuth 0 alone, as before)."""
        ox, oz = self.hopper_out_x, self.hopper_out_z
        ls = self.sleeve_overlap_mm
        seen_fit = False
        while ls <= max_mm + 1e-9:
            r = self._ranges_from(ox, oz - ls, az=azimuth)
            if any(x is None for _, _, x in r):
                if seen_fit:
                    return None    # dropping further only loses poses
                ls += step_mm
                continue
            seen_fit = True
            fixed = min(hi for _, _, (lo, hi) in r)
            stroke = max(0.0, max(lo for _, _, (lo, hi) in r) - fixed)
            if stroke + self.sleeve_overlap_mm + self.collar_h_mm + self.sleeve_top_mm <= ls + 1e-9:
                poses = [(e, a, max(0.0, lo - fixed), hi - fixed) for e, a, (lo, hi) in r]
                return {"sleeve_mm": ls, "start_z": oz - ls, "stroke_mm": stroke, "free_mm": (fixed, fixed + stroke),
                        "hose_cut_mm": math.ceil((fixed + stroke + self.sleeve_overlap_mm + COLLAR_SOCKET_MM) / 10) * 10,
                        "tube_mm": ls - self.sleeve_top_mm, "collar_travel": (ls - self.sleeve_overlap_mm - stroke, ls - self.sleeve_overlap_mm),
                        "sleeve_id_mm": self.hose_od + self.sleeve_clear_mm, "spring_n": tension_n, "poses": poses}
            ls += step_mm
        return None

    def lowest_sleeve_outlet(self, xs=(-600.0, -550.0, -500.0, -450.0, -400.0, -350.0),
                             z_lo: float = 1650.0, z_hi: float = 2100.0, z_step: float = 25.0) -> list[tuple]:
        """For each outlet x, the lowest outlet height (to `z_step`) at which `sleeve_take_up_design` works, with its
        design: (x, z or None, design or None). Slow (a few seconds per x): for the README, not the build."""
        from dataclasses import replace
        out = []
        for x in xs:
            hit = (x, None, None)
            z = z_lo
            while z <= z_hi + 1e-9:
                d = replace(self, hopper_out_x=float(x), hopper_out_z=float(z)).sleeve_take_up_design()
                if d is not None:
                    hit = (x, z, d)
                    break
                z += z_step
            out.append(hit)
        return out

    def hose_take_up_by_elev_max(self, maxes=(15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0)):
        """(top elevation, take-up mm or None) with the hose fitted over elev_min..that top elevation instead of the
        full range, to show what each extra degree of nose-up costs the hose. Same bend and fall limits."""
        from dataclasses import replace
        return [(m, replace(self, elev_max=float(m)).hose_take_up_mm()) for m in maxes]

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
        bad += self.check_hopper_frame()
        bad += self.check_launch()
        bad += self.check_azimuth()
        bad += self.check_home_switch()
        bad += self.check_az_stops()
        bad += self.check_cables()
        return bad

    # ---- azimuth drive (2026-11-10) -------------------------------------------
    @property
    def az_gear_r(self) -> float:
        return self.az_module * self.az_gear_teeth / 2

    @property
    def az_pinion_r(self) -> float:
        return self.az_module * self.az_pinion_teeth / 2

    @property
    def az_centre_dist(self) -> float:
        """Turntable axis to the stepper shaft, mm. The stepper sits on +y, under the mast plate."""
        return self.az_gear_r + self.az_pinion_r

    @property
    def az_ratio(self) -> float:
        return self.az_gear_teeth / self.az_pinion_teeth

    @property
    def az_trim_r(self) -> float:
        """Radius the turntable plate is trimmed to outside the toothed sector: inside the pinion's tip circle."""
        return self.az_centre_dist - (self.az_pinion_r + self.az_module) - self.az_clear_mm

    @property
    def az_sector_half_deg(self) -> float:
        return self.az_max + self.az_sector_margin_deg

    @property
    def az_gear_inner_r(self) -> float:
        """Inner edge of the printed sector."""
        return self.az_gear_r - 1.25 * self.az_module - 18.0

    @property
    def az_bolt_r(self) -> float:
        """M4 bolts through the plate into the sector's heat-set inserts."""
        return (self.az_gear_inner_r + self.az_trim_r) / 2

    def az_tooth_half_angle(self, r: float) -> float:
        """Half the gear tooth's angular thickness (rad) at radius r: involute flank, thinned by `az_backlash_mm` at
        the pitch circle."""
        a = math.radians(self.az_pressure_deg)
        rp = self.az_gear_r
        rb = rp * math.cos(a)
        inv = lambda x: math.tan(x) - x  # noqa: E731
        ar = math.acos(min(1.0, rb / r))
        s_p = math.pi * self.az_module / 2 - self.az_backlash_mm
        return s_p / (2 * rp) + inv(a) - inv(ar)

    def az_root_gap_mm(self) -> float:
        """Narrowest slot in the printed sector: the tooth space at the root circle (no fillet)."""
        rr = self.az_gear_r - 1.25 * self.az_module
        return rr * (2 * math.pi / self.az_gear_teeth - 2 * self.az_tooth_half_angle(rr))

    def az_tip_land_mm(self) -> float:
        ra = self.az_gear_r + self.az_module
        return ra * 2 * self.az_tooth_half_angle(ra)

    @property
    def az_gear_face_mm(self) -> float:
        """Printed sector thickness: it fills the bearing gap under the turntable plate, less `az_gear_gap_mm`."""
        return self.bearing_h - self.az_gear_gap_mm

    def az_hose_torque_nm(self) -> float:
        """Hose pull about the turntable axis, worst pose. A taut hose without bending stiffness pulls its end toward
        its other end, so the force is `hose_pull_n` along the chord from the socket mouth to the hose's start (the
        take-up sleeve's lower end, or the outlet if no sleeve fits); its moment about the vertical axis is zero with
        the head straight ahead and grows as it turns. The hose's own bending and twisting stiffness is not modelled:
        hang a hose and measure the torque with a spring scale on the head."""
        t = self.sleeve_take_up_design()
        sx, sz = self.hopper_out_x, (t["start_z"] if t else self.hopper_out_z)
        azs = [self.az_max * k / self.az_steps for k in range(self.az_steps + 1)] if self.az_max > 0 else [0.0]
        worst = 0.0
        for i in range(5):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / 4
            for a in azs:
                (mx, my, mz), _ = self.mouth_world_3d(e, a)
                dx, dy, dz = sx - mx, -my, sz - mz
                n = math.sqrt(dx * dx + dy * dy + dz * dz)
                rx, ry = mx - self.head_x, my
                worst = max(worst, abs(rx * dy - ry * dx) / n * self.hose_pull_n / 1000)
        return worst

    def azimuth_drive(self, inertia_kgm2: float | None = None, load_n: float = 60.0) -> dict:
        """Size the stepper and the gear sector for a `az_slew_deg` move in `az_slew_s` (triangular speed profile:
        half the time speeding up, half slowing down). `inertia_kgm2` is the turning inertia about the turntable axis
        (default `az_inertia_kgm2`; the build measures it from the CAD); `load_n` is the weight on the bearing.

        Torques at the turntable: inertia x peak angular acceleration, the bearing's rolling friction
        (mu x load x ball-circle radius) and the hose bound. The motor sees them through the ratio and mesh efficiency,
        plus its own rotor and the pinion speeding up. Tooth bending is Lewis' equation, Y = 0.484 - 2.87/z for 20 deg
        full-depth teeth, face width = the printed sector's thickness, tangential load x `az_shock`. Aim resolution is one full step
        at the output; backlash is `az_backlash_mm` over the pitch radius."""
        j = self.az_inertia_kgm2 if inertia_kgm2 is None else inertia_kgm2
        th = math.radians(self.az_slew_deg)
        t = self.az_slew_s
        alpha = 4 * th / t ** 2
        omega = 2 * th / t
        t_inertia = j * alpha
        t_bearing = self.az_bearing_mu * load_n * self.bearing_d / 2 / 1000
        t_hose = self.az_hose_torque_nm()
        t_out = t_inertia + t_bearing + t_hose
        rp_m = (self.az_pinion_r + self.az_module) / 1000
        pinion_j = 0.5 * (7850 * math.pi * rp_m ** 2 * 0.012) * rp_m ** 2   # steel disc, 12 mm long (bound)
        t_motor = t_out / (self.az_ratio * self.az_gear_eff) + (self.stepper_rotor_kgm2 + pinion_j) * alpha * self.az_ratio
        rpm = omega * self.az_ratio * 60 / (2 * math.pi)
        f_t = t_out / (self.az_gear_r / 1000) * self.az_shock
        y = 0.484 - 2.87 / self.az_gear_teeth
        sigma = f_t / (self.az_gear_face_mm * self.az_module * y)
        step = self.stepper_steps * self.az_ratio
        step_deg = 360 / step
        back_deg = math.degrees(self.az_backlash_mm / self.az_gear_r)
        hold_static = (t_bearing + t_hose) / (self.az_ratio * self.az_gear_eff)
        return {
            "alpha_rad_s2": alpha, "omega_rad_s": omega, "inertia_kgm2": j,
            "torque_inertia_nm": t_inertia, "torque_bearing_nm": t_bearing, "torque_hose_nm": t_hose,
            "torque_out_nm": t_out, "torque_motor_nm": t_motor, "motor_rpm": rpm,
            "torque_margin": self.stepper_torque_nm / t_motor, "hold_margin": self.stepper_hold_nm / max(hold_static, 1e-9),
            "tooth_force_n": f_t, "tooth_stress_mpa": sigma, "lewis_y": y,
            "step_deg": step_deg, "step_miss_mm": math.tan(math.radians(step_deg)) * self.aim_range_m * 1000,
            "backlash_deg": back_deg, "backlash_miss_mm": math.tan(math.radians(back_deg)) * self.aim_range_m * 1000,
            "root_gap_mm": self.az_root_gap_mm(), "tip_land_mm": self.az_tip_land_mm(),
            "fastest_slew_s": self.fastest_slew_s(j, load_n),
        }

    def fastest_slew_s(self, inertia_kgm2: float, load_n: float = 60.0) -> float:
        """Shortest `az_slew_s` that still keeps `az_torque_factor` on the motor (bisection; the hose and friction terms
        do not shrink with time, so a slow enough move always passes unless they alone eat the margin)."""
        from dataclasses import replace
        lo, hi = 0.02, 10.0
        if replace(self, az_slew_s=hi)._margin_only(inertia_kgm2, load_n) < self.az_torque_factor:
            return math.inf
        for _ in range(50):
            mid = (lo + hi) / 2
            m = replace(self, az_slew_s=mid)._margin_only(inertia_kgm2, load_n)
            lo, hi = (lo, mid) if m >= self.az_torque_factor else (mid, hi)
        return hi

    def _margin_only(self, j: float, load_n: float) -> float:
        th = math.radians(self.az_slew_deg)
        alpha = 4 * th / self.az_slew_s ** 2
        t_out = j * alpha + self.az_bearing_mu * load_n * self.bearing_d / 2 / 1000 + self.az_hose_torque_nm()
        rp_m = (self.az_pinion_r + self.az_module) / 1000
        pinion_j = 0.5 * (7850 * math.pi * rp_m ** 2 * 0.012) * rp_m ** 2
        t_motor = t_out / (self.az_ratio * self.az_gear_eff) + (self.stepper_rotor_kgm2 + pinion_j) * alpha * self.az_ratio
        return self.stepper_torque_nm / t_motor

    def check_azimuth(self, inertia_kgm2: float | None = None) -> list[str]:
        bad = []
        d = self.azimuth_drive(inertia_kgm2)
        if d["torque_margin"] < self.az_torque_factor:
            bad.append(f"azimuth stepper needs {d['torque_motor_nm']:.3f} N m for {self.az_slew_deg:g} deg in "
                       f"{self.az_slew_s:g} s against {self.stepper_torque_nm:g} N m pull-out ({self.az_torque_factor:g}x wanted)")
        if d["hold_margin"] < self.az_torque_factor:
            bad.append("azimuth stepper cannot hold the head against the hose and bearing drag")
        if d["tooth_stress_mpa"] > self.petg_bend_allow_mpa:
            bad.append(f"printed azimuth gear teeth bend at {d['tooth_stress_mpa']:.1f} MPa (allowed {self.petg_bend_allow_mpa:g})")
        if d["root_gap_mm"] < self.print_min_gap_mm:
            bad.append(f"printed azimuth gear slots are {d['root_gap_mm']:.2f} mm wide, under {self.print_min_gap_mm:g} mm")
        if d["tip_land_mm"] < self.print_min_gap_mm:
            bad.append("printed azimuth gear teeth come to a point")
        if self.az_gear_face_mm < 6.0:
            bad.append("bearing gap too thin for the printed azimuth gear sector")
        # The trimmed plate must clear everything bolted to it (cheek feet, bearing bolts) and the bearing itself.
        foot_r = max(math.hypot(35.0 + 12.0, self.plate_half_y + self.plate_t + self.cheek_gap + self.plate_t + 20.0), 0)
        if self.az_trim_r < max(foot_r, self.bearing_d / 2) + 5:
            bad.append("turntable plate trimmed for the pinion cuts into the cheek feet or the bearing")
        if self.az_sector_half_deg + 90 > 180 - 5 or self.az_gear_inner_r < self.bearing_d / 2 + 5:
            bad.append("azimuth gear sector does not fit outside the bearing")
        if self.az_bolt_r + 6 > self.az_trim_r or self.az_bolt_r - 6 < self.az_gear_inner_r:
            bad.append("azimuth gear sector's bolts miss the turntable plate")
        # The stepper's square body under the mast plate must sit inside the plate and clear the +y posts.
        half = 42.3 / 2
        if self.az_centre_dist + half > self.post_half_y + 40 - 5:
            bad.append("azimuth stepper overhangs the mast plate")
        if self.post_dx - 10 < half + 5:
            bad.append("azimuth stepper hits the mast posts")
        return bad

    # ---- azimuth home switch (2026-11-12) -------------------------------------
    def az_sector_ends_deg(self) -> tuple[float, float]:
        """Plate angles (deg from +x) of the gear sector's two ends, as `feeder.az_gear_profile` draws them: the outer
        teeth's root corners plus a quarter pitch."""
        pitch = 2 * math.pi / self.az_gear_teeth
        n = int(math.radians(self.az_sector_half_deg) // pitch)
        rr = self.az_gear_r - 1.25 * self.az_module
        e = n * pitch + self.az_tooth_half_angle(rr) + pitch / 4
        return 90.0 - math.degrees(e), 90.0 + math.degrees(e)

    def home_switch_design(self) -> dict:
        """Where the home switch and its cam lobe sit, and what the switch can tell the firmware.

        Radii about the turntable axis: the roller's free outer edge sits `home_sw_free_clear_mm` inside the sector's
        plain inner arc, so the arc never touches it; the lobe's face is pretravel plus half the overtravel further in,
        so the click lands in the middle of the lever's usable travel. Plate angle under the switch is
        `home_sw_deg - az` (the turntable turns counter-clockwise for positive az), so a lobe from the trip angle to the
        sector's high end holds the switch closed for every az at or below `az_home_deg`, down past where the pinion
        runs off the teeth. On the ramp the roller moves `tan(ramp)` mm in per mm of arc, so a radial error `d` moves the
        trip by `d / tan(ramp)` of arc: repeatability sets how alike two homings are, the part tolerance only shifts
        the home (calibrate AZ_HOME_DEG once). A round roller meets the ramp at the ramp's own angle round its rim, so
        it is touched, and pushed, rho (1/cos(ramp) - 1) / tan(ramp) of arc sooner than its tip would be; the ramp is
        set that much further along so the click still lands at `az_home_deg`."""
        ri = self.az_gear_inner_r
        r_c = ri - self.home_sw_free_clear_mm
        depth = self.home_sw_pretravel_mm + self.home_sw_overtravel_mm / 2
        r_lobe = r_c - depth
        tan = math.tan(math.radians(self.home_cam_ramp_deg))
        r_mid = (ri + r_lobe) / 2
        ramp_deg = math.degrees((ri - r_lobe) / tan / r_mid)
        trip = self.home_sw_deg - self.az_home_deg                       # plate angle under the switch at home
        to_trip = math.degrees((ri - r_c + self.home_sw_pretravel_mm) / tan / r_mid)
        cr = math.radians(self.home_cam_ramp_deg)
        early = math.degrees(self.home_sw_roller_r * (1 / math.cos(cr) - 1) / tan / r_mid)
        ramp0 = trip - to_trip + early                                   # ramp starts on the plain arc
        ramp1 = ramp0 + ramp_deg                                         # full depth from here to the end
        contact = ramp0 + math.degrees((ri - r_c) / tan / r_mid) - early  # roller first touched (on its rim)
        lo_end, hi_end = self.az_sector_ends_deg()
        tw, rw, hz = self.home_sw_body
        r_body_out = r_c - self.home_sw_lever_mm
        r_body_in = r_body_out - rw
        rep_deg = math.degrees(self.home_sw_repeat_mm / tan / r_c)
        tol_deg = math.degrees(self.home_sw_op_tol_mm / tan / r_c)
        micro_deg = 360 / (self.stepper_steps * self.az_microsteps * self.az_ratio)
        miss = lambda d: math.tan(math.radians(d)) * self.aim_range_m * 1000  # noqa: E731
        pinion_off = 90.0 - hi_end            # az where the pinion leaves the teeth turning negative
        return {
            "r_inner": ri, "r_roller": r_c, "r_lobe": r_lobe, "depth_mm": depth,
            "r_body_in": r_body_in, "r_body_out": r_body_out,
            "z_floor": self.mast_top_z + self.plate_t, "z_body_top": self.mast_top_z + self.plate_t + self.home_bracket_t + hz,
            "ramp0_deg": ramp0, "ramp1_deg": ramp1, "trip_plate_deg": trip, "sector_ends_deg": (lo_end, hi_end),
            "az_contact": self.home_sw_deg - contact, "az_closed_to": self.home_sw_deg - hi_end,
            "az_pinion_off": pinion_off, "az_lo_end_passes": self.home_sw_deg - lo_end,
            "repeat_deg": rep_deg, "repeat_miss_mm": miss(rep_deg), "tol_deg": tol_deg, "tol_miss_mm": miss(tol_deg),
            "microstep_deg": micro_deg, "microstep_miss_mm": miss(micro_deg),
            "travel_window_mm": (self.home_sw_pretravel_mm + self.home_runout_mm,
                                 self.home_sw_pretravel_mm + self.home_sw_overtravel_mm - self.home_runout_mm),
            "off_cam_max_deg": self.az_home_deg - pinion_off,
        }

    def check_home_switch(self) -> list[str]:
        bad = []
        h = self.home_switch_design()
        if not self.az_home_deg < -self.az_max:
            bad.append(f"azimuth home {self.az_home_deg:g} deg is inside the working range +-{self.az_max:g}")
        if h["az_contact"] > -self.az_max - 0.5:
            bad.append(f"home cam touches the switch roller at {h['az_contact']:.2f} deg, within 0.5 deg of the working range")
        if self.az_home_deg - 1.0 < h["az_pinion_off"]:
            bad.append("azimuth home is within 1 deg of where the pinion runs off the gear sector")
        if h["az_closed_to"] > h["az_pinion_off"]:
            bad.append("home cam ends before the pinion leaves the teeth: a head turned past it reads open")
        lo, hi = h["travel_window_mm"]
        if not lo <= h["depth_mm"] <= hi:
            bad.append(f"home cam depth {h['depth_mm']:.2f} mm is outside the switch's usable travel {lo:.2f}-{hi:.2f} mm")
        if self.home_sw_lever_mm < 2 * self.home_sw_roller_r + 0.2:
            bad.append("home switch roller would sit inside the switch body (lever shorter than the roller)")
        if self.home_sw_free_clear_mm < self.home_runout_mm + 0.2:
            bad.append("home switch roller could rub the sector's plain inner arc")
        if not h["ramp0_deg"] > h["sector_ends_deg"][0] + 2 or h["ramp1_deg"] > h["sector_ends_deg"][1] - 2:
            bad.append("home cam lobe does not fit on the gear sector")
        corner = math.hypot(h["r_body_out"] + self.home_slot_mm, self.home_sw_body[0] / 2)
        if corner > h["r_lobe"] - 1.0:
            bad.append("home switch body (at the slots' outer end) comes within 1 mm of the cam lobe")
        if h["r_body_in"] - self.home_slot_mm < self.bearing_d / 2 + 1.0:
            bad.append("home switch bracket runs into the turntable bearing")
        if h["z_body_top"] > self.mast_top_z + self.plate_t + self.bearing_h - 1.0:
            bad.append("home switch is taller than the bearing gap")
        if abs((self.home_sw_deg - 90.0 + 180) % 360 - 180) < 25:
            bad.append("home switch sits by the pinion")
        return bad

    # ---- azimuth hard stops (2026-11-12) --------------------------------------
    def az_stop_world_deg(self) -> tuple[float, float]:
        """World angles (deg from +x, counter-clockwise) of the two pads' contact faces: the sector's low end meets the
        negative stop turning negative, its high end the positive stop turning positive."""
        lo, hi = self.az_sector_ends_deg()
        return lo - self.az_stop_deg, hi + self.az_stop_deg

    @property
    def az_reach_deg(self) -> float:
        """Furthest the head can turn either side: to a stop, plus the pad squeezed to `stop_pad_strain`. Everything
        that turns must clear everything fixed out to here, not just to `az_max` (the sweeps check it)."""
        return self.az_stop_deg + math.degrees(self.stop_pad_strain * self.stop_pad_t / (sum(self.stop_pad_r) / 2))

    def az_stop_design(self, inertia_kgm2: float | None = None) -> dict:
        """What the hard stops must take, and where they sit.

        Position: past `az_max` by `az_stop_margin_deg`; past the home click by the bracket slots' whole adjustment
        (a radial shift `home_slot_mm` moves the click by that much arc on the 45 deg ramp) plus 0.5 deg; and with
        `az_stop_mesh_pitches` of teeth left beyond the pinion's line, so the pinion is in full mesh when the stall
        torque arrives (`last tooth centre - pitches x pitch` at the pinion's plate angle 90 - az).

        Impact: the head runs into a pad at `stop_hit_deg_s` (the firmware's top speed: a lost-step runaway, not a
        commanded move, since the firmware clamps targets to +-az_max). Its kinetic energy, with the rotor and pinion
        reflected through the ratio, goes into the pad as a linear spring k = E A / t; the peak force sqrt(2 E k) must
        come with a compression under `stop_pad_strain`. The stepper keeps pushing at its holding torque through the
        mesh, which adds its tangential force at the pad. The worst sector insert carries the direct share plus the
        moment of that force about the three inserts' centroid. Stalled against a stop, the pinion's tooth load at
        holding torque is checked with the same Lewis form as the drive."""
        j = self.az_inertia_kgm2 if inertia_kgm2 is None else inertia_kgm2
        pitch = 360.0 / self.az_gear_teeth
        n = int(self.az_sector_half_deg // pitch)
        last_tooth = 90.0 + n * pitch
        stop_mesh_max = last_tooth - self.az_stop_mesh_pitches * pitch - 90.0
        slot_deg = math.degrees(self.home_slot_mm / math.tan(math.radians(self.home_cam_ramp_deg))
                                / self.home_switch_design()["r_roller"])
        rp_m = (self.az_pinion_r + self.az_module) / 1000
        pinion_j = 0.5 * (7850 * math.pi * rp_m ** 2 * 0.012) * rp_m ** 2
        j_all = j + (self.stepper_rotor_kgm2 + pinion_j) * self.az_ratio ** 2
        w = math.radians(self.stop_hit_deg_s)
        energy_j = 0.5 * j_all * w * w
        r0, r1 = self.stop_pad_r
        area = (r1 - r0) * self.stop_pad_h
        k = self.stop_pad_e_mpa * area / self.stop_pad_t * 1000          # N/m
        x_mm = math.sqrt(2 * energy_j / k) * 1000
        f_impact = k * x_mm / 1000
        r_c = (r0 + r1) / 2
        f_stall = self.stepper_hold_nm * self.az_ratio * self.az_gear_eff / (r_c / 1000)
        f_peak = f_impact + f_stall
        cap_j = 0.5 * k * (self.stop_pad_strain * self.stop_pad_t / 1000) ** 2
        fastest = math.degrees(math.sqrt(2 * cap_j / j_all))
        # Inserts: the force acts tangentially at r_c on the sector's high end (the low end mirrors it).
        lo_end, hi_end = self.az_sector_ends_deg()
        bolts = [(self.az_bolt_r * math.cos(math.radians(a)), self.az_bolt_r * math.sin(math.radians(a)))
                 for a in (90.0 - (self.az_sector_half_deg - 6.0), 90.0, 90.0 + (self.az_sector_half_deg - 6.0))]
        cx, cy = sum(b[0] for b in bolts) / 3, sum(b[1] for b in bolts) / 3
        a = math.radians(hi_end)
        px, py = r_c * math.cos(a), r_c * math.sin(a)
        fx, fy = f_peak * math.sin(a), -f_peak * math.cos(a)                # the pad pushes the end back (clockwise)
        m = (px - cx) * fy - (py - cy) * fx                                  # N mm about the centroid
        r2 = sum((bx - cx) ** 2 + (by - cy) ** 2 for bx, by in bolts)
        insert = max(math.hypot(fx / 3 - m * (by - cy) / r2, fy / 3 + m * (bx - cx) / r2) for bx, by in bolts)
        f_tooth = self.stepper_hold_nm / (self.az_pinion_r / 1000)          # the steel pinion pushes the printed teeth
        y_gear = 0.484 - 2.87 / self.az_gear_teeth
        sigma = f_tooth / (self.az_gear_face_mm * self.az_module * y_gear)
        block_bear = f_peak / 2 / (4.0 * (self.bearing_h - self.az_gear_gap_mm))  # two M4 screws bearing in the block
        return {
            "world_deg": self.az_stop_world_deg(), "last_tooth_deg": last_tooth, "stop_mesh_max_deg": stop_mesh_max,
            "slot_deg": slot_deg, "stop_home_min_deg": -self.az_home_deg + slot_deg + 0.5,
            "pinion_off_deg": hi_end - 90.0,
            "inertia_all_kgm2": j_all, "energy_j": energy_j, "pad_k_n_mm": k / 1000, "pad_x_mm": x_mm,
            "pad_strain": x_mm / self.stop_pad_t, "pad_capacity_j": cap_j, "fastest_hit_deg_s": fastest,
            "force_impact_n": f_impact, "force_stall_n": f_stall, "force_peak_n": f_peak,
            "pad_pressure_mpa": f_peak / area, "insert_n": insert, "stall_tooth_n": f_tooth, "stall_tooth_mpa": sigma,
            "block_bearing_mpa": block_bear,
        }

    def check_az_stops(self, inertia_kgm2: float | None = None) -> list[str]:
        bad = []
        d = self.az_stop_design(inertia_kgm2)
        s = self.az_stop_deg
        if s < self.az_max + self.az_stop_margin_deg:
            bad.append(f"azimuth hard stops at +-{s:g} deg are within {self.az_stop_margin_deg:g} deg of the working range")
        if s < d["stop_home_min_deg"]:
            bad.append(f"azimuth hard stop at -{s:g} deg can land before the home click (needs {d['stop_home_min_deg']:.2f})")
        if s > d["stop_mesh_max_deg"]:
            bad.append(f"azimuth hard stops at +-{s:g} deg leave under {self.az_stop_mesh_pitches:g} tooth pitch of mesh "
                       f"(at most {d['stop_mesh_max_deg']:.2f} deg)")
        if d["pad_strain"] > self.stop_pad_strain:
            bad.append(f"azimuth stop pad compresses {d['pad_strain']:.0%} at {self.stop_hit_deg_s:g} deg/s "
                       f"(allowed {self.stop_pad_strain:.0%})")
        if d["insert_n"] > self.insert_shear_n:
            bad.append(f"azimuth gear sector's worst insert takes {d['insert_n']:.0f} N at a stop "
                       f"(allowed {self.insert_shear_n:g} N)")
        if d["stall_tooth_mpa"] > self.petg_bend_allow_mpa:
            bad.append(f"stalled against a stop, the printed teeth bend at {d['stall_tooth_mpa']:.1f} MPa")
        if max(d["pad_pressure_mpa"], d["block_bearing_mpa"]) > self.petg_bend_allow_mpa:
            bad.append("azimuth stop block or the sector's end face is crushed at a stop")
        r0, r1 = self.stop_pad_r
        rr = self.az_gear_r - 1.25 * self.az_module
        if r1 + 2.0 > rr - 1.0 or r0 - 1.0 < self.home_switch_design()["r_lobe"] + 1.0:
            bad.append("azimuth stop pad is not inside the sector's end face (root circle to cam lobe)")
        if self.stop_pad_h > self.az_gear_face_mm - 1.0:
            bad.append("azimuth stop pad is taller than the sector's face")
        lo, hi = d["world_deg"]
        if min(abs(lo - self.home_sw_deg), abs(hi - self.home_sw_deg)) < 15 or min(abs(lo - 90), abs(hi - 90)) < 25:
            bad.append("an azimuth stop block sits by the home switch or the pinion")
        return bad

    # ---- elevation drive (2026-11-11) -----------------------------------------
    def _rot_pivot(self, x: float, z: float, elev_deg: float) -> tuple[float, float]:
        t = math.radians(elev_deg)
        return x * math.cos(t) - z * math.sin(t), x * math.sin(t) + z * math.cos(t)

    def elev_pin_rel(self, elev_deg: float) -> tuple[float, float]:
        """(x, z) of the actuator pin from the pivot, world frame, with the head tilted `elev_deg` nose up."""
        return self._rot_pivot(self.elev_pin_x, self.elev_pin_z - self.pivot_z_rel, elev_deg)

    def elev_act_len(self, elev_deg: float) -> float:
        """Actuator length, anchor hole to pin hole (mm), measured in its own (x-z) plane."""
        px, pz = self.elev_pin_rel(elev_deg)
        return math.hypot(px - self.elev_anchor_dx, pz - self.elev_anchor_dz)

    def _elevs(self, steps: int = 24) -> list[float]:
        return [self.elev_min + (self.elev_max - self.elev_min) * i / steps for i in range(steps + 1)]

    def elev_hose_moment_nm(self, elev_deg: float) -> float:
        """Nose-up moment (N m) of the hose pull about the pivot: `hose_pull_n` at the socket mouth along the chord to
        the hose's start (the sleeve's lower end, or the outlet). Same taut-string bound as `az_hose_torque_nm`."""
        t = self.sleeve_take_up_design()
        sx, sz = self.hopper_out_x, (t["start_z"] if t else self.hopper_out_z)
        mx, mz = self.mouth_world(elev_deg)
        dx, dz = sx - mx, sz - mz
        n = math.hypot(dx, dz)
        fx, fz = self.hose_pull_n * dx / n, self.hose_pull_n * dz / n
        rx, rz = mx - self.head_x, mz - self.pivot_z
        return (rx * fz - rz * fx) / 1000

    def elevation_drive(self, gravity_nm: dict[float, float]) -> dict:
        """Size the elevation actuator. `gravity_nm` maps elevation (deg) to the head's nose-up gravity moment about
        the pivot (N m), measured from the CAD by `feeder.head_moment`; it is interpolated linearly between the
        measured poses. Push needed at each pose = (gravity + hose) moment over the actuator's lever arm about the
        pivot (the pin's moment arm along the actuator's line), with the hose taut or slack, whichever needs more;
        positive is a push. The window is what a bought
        actuator must span: retracted no longer than the shortest pose, extended no shorter than the longest. Rate is
        degrees per second at `elev_act_speed_mm_s`, from the length's slope with elevation (the slowest pose).
        Inertia is left out: at 20 mm/s the head's angular speed is a few degrees per second."""
        ks = sorted(gravity_nm)

        def g(e: float) -> float:
            for a, b in zip(ks, ks[1:]):
                if a - 1e-9 <= e <= b + 1e-9:
                    return gravity_nm[a] + (gravity_nm[b] - gravity_nm[a]) * (e - a) / (b - a)
            return gravity_nm[ks[0]] if e < ks[0] else gravity_nm[ks[-1]]

        rows = []
        for e in self._elevs():
            px, pz = self.elev_pin_rel(e)
            dx, dz = px - self.elev_anchor_dx, pz - self.elev_anchor_dz
            length = math.hypot(dx, dz)
            ux, uz = dx / length, dz / length
            arm = px * uz - pz * ux          # nose-up moment (m per N, x1000) of a unit push along anchor -> pin
            hose = self.elev_hose_moment_nm(e)
            # the hose may pull anywhere from 0 to hose_pull_n (slack or taut): take the worse end
            push = max((-(g(e) + k * hose) * 1000 / arm for k in (0.0, 1.0)), key=abs)
            h = 0.25
            rate = h / abs(self.elev_act_len(e + h) - self.elev_act_len(e - h)) * 2  # deg per mm
            rows.append({"elev": e, "len_mm": length, "arm_mm": arm, "gravity_nm": g(e),
                         "hose_nm": hose, "push_n": push, "deg_per_mm": rate})
        lens = [r["len_mm"] for r in rows]
        pushes = [r["push_n"] for r in rows]
        peak = max(pushes, key=abs)
        return {
            "rows": rows, "len_min_mm": min(lens), "len_max_mm": max(lens), "travel_mm": max(lens) - min(lens),
            # retracted: no margin at that end, because the actuator's own limit is the safe stop past +45 deg
            "closed_max_mm": min(lens), "closed_min_mm": self.elev_act_len(self.elev_clear_max),
            "extended_min_mm": max(lens) + self.elev_end_mm,
            "push_peak_n": peak, "push_min_n": min(pushes, key=abs), "one_way": all(x > 0 for x in pushes) or all(x < 0 for x in pushes),
            "arm_min_mm": min(abs(r["arm_mm"]) for r in rows), "force_margin": self.elev_act_force_n / abs(peak),
            "full_sweep_s": (max(lens) - min(lens)) / self.elev_act_speed_mm_s,
            "deg_per_s_min": min(r["deg_per_mm"] for r in rows) * self.elev_act_speed_mm_s,
            "deg_per_s_max": max(r["deg_per_mm"] for r in rows) * self.elev_act_speed_mm_s,
            "monotonic": all(b > a for a, b in zip(lens, lens[1:])) or all(b < a for a, b in zip(lens, lens[1:])),
        }


    # ---- shuttle drive (2026-11-11) -------------------------------------------
    @property
    def shuttle_zc(self) -> float:
        """Head-frame z of the shuttle's mid-height: the line its pin and rod work on."""
        return self.shuttle_z0 + self.shuttle_h / 2

    @property
    def shuttle_pin_x(self) -> float:
        """Head-frame x of the shuttle pin with the shuttle retracted (pocket under the column)."""
        return self.shuttle_rear + self.shuttle_pin_back

    @property
    def crank_r(self) -> float:
        return self.feed_stroke / 2

    @property
    def crank_x(self) -> float:
        """Head-frame x of the servo shaft: the crank points back at the retracted dead centre."""
        return self.shuttle_pin_x + self.shuttle_rod_mm + self.crank_r

    @property
    def drive_y0(self) -> float:
        """Outer face of the motor plate (+y), where the drive's layers start."""
        return self.plate_half_y + self.plate_t

    @property
    def servo_top_y(self) -> float:
        return self.drive_y0 + 1.0 + 2 * self.shuttle_rod_t + 1.0 + self.servo_spline_mm

    def shuttle_kinematics(self, theta_deg: float) -> tuple[float, float, float]:
        """(slider pin x, crank pin x, crank pin z) in the head frame at crank angle `theta_deg` (0 = retracted dead
        centre, 180 = forward)."""
        t = math.radians(theta_deg)
        r, L = self.crank_r, self.shuttle_rod_mm
        cx, cz = self.crank_x - r * math.cos(t), self.shuttle_zc + r * math.sin(t)
        return cx - math.sqrt(L * L - (r * math.sin(t)) ** 2), cx, cz

    def shuttle_drive(self, shuttle_kg: float, steps: int = 180) -> dict:
        """Size the servo slider-crank that moves the shuttle (2026-11-11).

        Load on the shuttle, each way: the column of balls standing on its top (sleeve, hose and column full,
        single file, plus a tub's depth over the outlet; all their weight on the bottom ball, conservative) at
        `feed_mu_ball`, the shuttle and one ball sliding at `feed_mu_slide`, and their weight along the path uphill
        (forward at the top tilt, back at the bottom tilt). The pin sits off the shuttle's centre line, so the push
        cocks it between the head plates: a drawer of guide length l pushed at offset e needs
        1 / (1 - 2 mu e / l) more force and jams when e >= l / (2 mu). The rod's angle presses the shuttle on its
        floor or roof, adding mu tan(phi). Torque at the crank from virtual work, T = F dx/dtheta, and the stroke time
        from a linear torque-speed line (no-load speed at zero torque, stopped at stall). Every friction, mass and
        servo figure is an assumption to replace with a measurement."""
        t = self.sleeve_take_up_design() or {}
        stack_mm = (t.get("tube_mm", 0.0) + t.get("hose_cut_mm", self.hose_len)
                    + (self.col_top + self.socket_h - (self.shuttle_z0 + self.shuttle_h)) + self.tub_h)
        balls = stack_mm / self.ball_d
        gN = 9.81
        ball_n = self.ball_g / 1000 * gN
        column_n = balls * ball_n
        e = self.drive_y0 + 1.0 + self.shuttle_rod_t / 2
        guide = self.feed_col_x + 60.0 - self.shuttle_rear
        mu = self.feed_mu_slide
        cock = 2 * mu * e / guide
        friction = self.feed_mu_ball * column_n + mu * (shuttle_kg * gN + ball_n)
        up_fwd = (shuttle_kg * gN + ball_n) * math.sin(math.radians(max(0.0, self.elev_max)))
        up_back = shuttle_kg * gN * math.sin(math.radians(max(0.0, -self.elev_min)))
        w0 = math.radians(60.0) / self.servo_s_per_60
        r, L = self.crank_r / 1000, self.shuttle_rod_mm / 1000
        out = {}
        for way, load in (("fwd", friction + up_fwd), ("back", friction + up_back)):
            peak_t = peak_f = 0.0
            time = 0.0
            dth = math.radians(self.servo_range_deg) / steps
            for i in range(steps):
                th = (i + 0.5) * dth
                s = r * math.sin(th)
                root = math.sqrt(L * L - s * s)
                phi = math.asin(s / L)
                denom = 1 - cock - mu * math.tan(phi)
                f = load / denom if denom > 0 else math.inf
                dxdth = r * math.sin(th) + r * r * math.sin(th) * math.cos(th) / root
                torque = f * abs(dxdth)
                peak_t, peak_f = max(peak_t, torque), max(peak_f, f)
                frac = torque / self.servo_stall_nm
                time += dth / (w0 * (1 - frac)) if frac < 1 else math.inf
            out[way] = {"load_n": load, "peak_force_n": peak_f, "peak_torque_nm": peak_t, "stroke_s": time}
        drop_mm = self.shuttle_h
        drop_s = math.sqrt(2 * drop_mm / 1000 / (gN * math.cos(math.radians(max(abs(self.elev_min), abs(self.elev_max))))))
        peak = max(out["fwd"]["peak_torque_nm"], out["back"]["peak_torque_nm"])
        cycle = out["fwd"]["stroke_s"] + self.feed_dwell_s + out["back"]["stroke_s"] + drop_s
        x_ret = self.shuttle_kinematics(0)[0]
        x_fwd = self.shuttle_kinematics(180)[0]
        return {"stack_balls": balls, "column_n": column_n, "offset_mm": e, "guide_mm": guide,
                "jam_offset_mm": guide / (2 * mu), "cock_factor": 1 / (1 - cock),
                "rod_angle_max_deg": math.degrees(math.asin(self.crank_r / self.shuttle_rod_mm)),
                "stroke_mm": x_fwd - x_ret, "fwd": out["fwd"], "back": out["back"], "peak_torque_nm": peak,
                "torque_margin": self.servo_stall_nm / peak if peak > 0 else math.inf,
                "no_load_stroke_s": math.radians(self.servo_range_deg) / w0, "drop_s": drop_s, "cycle_s": cycle,
                "balls_per_min": 60 / cycle,
                "actuator_cycle_s": 2 * self.feed_stroke / self.elev_act_speed_mm_s + self.feed_dwell_s + drop_s}

    def check_shuttle_drive(self, shuttle_kg: float) -> list[str]:
        bad = []
        d = self.shuttle_drive(shuttle_kg)
        if abs(d["stroke_mm"] - self.feed_stroke) > 0.01:
            bad.append(f"shuttle crank gives {d['stroke_mm']:.1f} mm of stroke, not {self.feed_stroke:g}")
        if d["offset_mm"] >= d["jam_offset_mm"] / 2:
            bad.append(f"shuttle pin is {d['offset_mm']:.0f} mm off the shuttle's centre line; it jams at "
                       f"{d['jam_offset_mm']:.0f} mm (2x wanted)")
        if d["torque_margin"] < self.servo_torque_factor:
            bad.append(f"shuttle servo needs {d['peak_torque_nm']:.2f} N m against {self.servo_stall_nm:g} N m stall "
                       f"({self.servo_torque_factor:g}x wanted)")
        if d["cycle_s"] > self.feed_interval_min_s:
            bad.append(f"shuttle cycle {d['cycle_s']:.2f} s is longer than the {self.feed_interval_min_s:g} s drill interval")
        if self.shuttle_pin_x - self.shuttle_pin_d < self.shuttle_rear + 4 or \
                self.shuttle_pin_x + self.shuttle_pin_d > self.feed_col_x - self.hole_d / 2:
            bad.append("shuttle pin is not in the shuttle's solid rear")
        if self.shuttle_pin_x - self.shuttle_pin_d < self.head_x0 + 6:
            bad.append("shuttle slot runs off the motor plate's rear edge")
        if self.crank_x + self.servo_flange_l > self.head_x1:
            bad.append("shuttle servo is off the front of the motor plate")
        return bad

    # ---- cables to the head (2026-11-13) ----------------------------------------
    def bundle_od(self, wires: tuple) -> float:
        """Diameter (mm) of a loose round bundle of `wires` ((name, count, AWG), ...) at `bundle_fill`."""
        area = sum(n * AWG_OD_MM[g] ** 2 for _, n, g in wires)
        return math.sqrt(area / self.bundle_fill)

    @property
    def cable_bend_r(self) -> float:
        """Smallest bend radius of the moving loop: the thickest head wire's, since loose wires bend one by one."""
        return self.cable_bend_factor * max(AWG_OD_MM[g] for _, _, g in self.head_wires)

    def elev_act_limits(self) -> tuple[float, float]:
        """Elevation (deg) at the actuator's own limits: fully extended (nose down) and fully retracted (nose up). A
        runaway or a hand on the head can drive it anywhere between, so the cables must reach both, not only the
        +-range the drills use."""
        def at(length: float) -> float:
            lo, hi = -80.0, 80.0                     # the actuator shortens as the nose rises
            for _ in range(60):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if self.elev_act_len(mid) > length else (lo, mid)
            return (lo + hi) / 2
        return at(self.elev_act_closed + self.elev_act_stroke), at(self.elev_act_closed)

    def _loop_shape(self) -> tuple:
        rb = self.bundle_od(self.head_wires) / 2 + self.cable_clear_mm
        stand = tuple((x, z, 5.0) for x, z in ((-215.0, -150.0), (95.0, -150.0)))   # feeder._standoffs, lower pair
        shape = (self.turntable_top - self.pivot_z, 8.0, self.head_x0, self.head_x1,
                 self.floor_top - self.feed_floor_t, self.head_gap_axis * -1, self.wheel_head_d / 2, self.pivot_z_rel, *stand)
        return shape, rb

    def cable_loop_poses(self) -> list[float]:
        ext, ret = self.elev_act_limits()
        return [ext, self.elev_min, 0.0, 15.0, 30.0, self.elev_max, ret]

    def cable_loop_ends(self, elev_deg: float) -> tuple[tuple, tuple, tuple]:
        """Pivot-relative (x, z) of the gland exit and the head clip, and the direction from the clip into the loop
        (`cable_clip_dir_deg` in the head frame, turned with the head), with the head at `elev_deg`."""
        c, s = math.cos(math.radians(elev_deg)), math.sin(math.radians(elev_deg))
        f = (0.0, self.turntable_top + self.cable_gland_h - self.pivot_z)
        hx, hz = self.cable_clip_x, self.cable_clip_z - self.pivot_z_rel
        dx, dz = math.cos(math.radians(self.cable_clip_dir_deg)), math.sin(math.radians(self.cable_clip_dir_deg))
        return f, (hx * c - hz * s, hx * s + hz * c), (dx * c - dz * s, dx * s + dz * c)

    def cable_loop_design(self) -> dict | None:
        """Size the free loop between the turntable gland and the head clip (2026-11-13).

        Each pose, from the actuator's extended limit to its retracted limit, gets the range of loop lengths that fit
        (`_cable_loop_range`); the wire is cut once, so it must fit every pose. Returns the common window, the cut
        length in its middle, the curve each pose takes at that length (pivot-relative control points), the loop's
        furthest reach from the turntable axis and its lowest point. None if no single length fits every pose."""
        shape, rb = self._loop_shape()
        r_min = self.cable_bend_r
        ranges = {}
        for e in self.cable_loop_poses():
            f, h, d = self.cable_loop_ends(e)
            ranges[e] = _cable_loop_range(f, h, d, e, shape, r_min, rb)
            if ranges[e] is None:
                return None
        lo = max(r[0] for r in ranges.values())
        hi = min(r[1] for r in ranges.values())
        if lo > hi:
            return {"ranges": ranges, "window": None, "rb": rb, "r_min": r_min}
        cut = (lo + hi) / 2
        curves = {}
        for e in ranges:
            f, h, d = self.cable_loop_ends(e)
            curves[e] = _cable_loop_range(f, h, d, e, shape, r_min, rb, target=cut)[2]
        def pts(ctrl, n=32):
            out = []
            for k in range(n + 1):
                t = k / n
                u = 1 - t
                out.append(tuple(u ** 3 * ctrl[0][m] + 3 * u * u * t * ctrl[1][m] + 3 * u * t * t * ctrl[2][m] + t ** 3 * ctrl[3][m]
                                 for m in (0, 1)))
            return out
        reach = max(abs(q[0]) for _, c in curves.values() for q in pts(c))
        low = min(q[1] for _, c in curves.values() for q in pts(c))
        return {"ranges": ranges, "window": (lo, hi), "cut_mm": cut, "curves": curves, "rb": rb, "r_min": r_min,
                "reach_mm": reach, "lowest_z": self.pivot_z + low, "fit_err_mm": max(abs(l - cut) for l, _ in curves.values())}

    def cable_twist(self) -> dict:
        """The bundle's run on the turntable axis (2026-11-13): it twists by the head's azimuth between the fixed clamp
        under the mast plate and the gland on the turntable plate. Returns the run's length, the twist rate at the
        hard stops' reach, the bundle's diameter there (head and turntable wires) and the room it has in the plates'
        40 mm holes and the bearing's open centre."""
        run = self.turntable_top + self.cable_gland_h - self.cable_clamp_z
        od = self.bundle_od(self.head_wires + self.turntable_wires)
        rate = self.az_reach_deg / (run / 1000) if run > 0 else math.inf
        # outer wire's stretch at that twist: a helix of radius od/2 over the run
        helix = math.sqrt(1 + (od / 2 * math.radians(self.az_reach_deg) / run) ** 2) - 1 if run > 0 else math.inf
        return {"run_mm": run, "rate_deg_m": rate, "od_mm": od, "hole_gap_mm": (40.0 - od) / 2,
                "bore_gap_mm": (self.bearing_bore_d - od) / 2, "helix_strain": helix,
                "clamp_below_stepper_mm": self.mast_top_z - self.stepper_body_mm - self.cable_clamp_z}

    def servo_supply(self, peak_torque_nm: float, cut_mm: float | None = None) -> dict:
        """The shuttle servo's 6 V supply (2026-11-13). The buck sits on the deck with the ESP32, so its return shares
        the ESP32's ground. At stall the servo draws `servo_stall_a`; the leads' resistance takes some of the voltage,
        and the return's drop lifts the servo's ground above the ESP32's, which eats into the 3.3 V signal. Run
        length: deck to the axis, up the axis to the gland, the free loop, and the head from the clip to the servo.
        Stall torque is taken as proportional to the terminal voltage below `servo_stall_v` and no higher above it
        (conservative). Returns every AWG's result and the chosen gauge's."""
        cut = cut_mm if cut_mm is not None else 400.0
        servo_x, servo_z = self.crank_x, self.shuttle_zc
        head = abs(self.cable_clip_x - servo_x) + abs(self.cable_clip_z - servo_z) + self.servo_top_y
        run = (abs(self.electronics_x - self.head_x) + (self.turntable_top + self.cable_gland_h - self.rail_top - self.plate_t)
               + cut + head) / 1000
        r_motor = self.servo_supply_v / self.servo_stall_a
        rows = {}
        for awg, ohm in sorted(AWG_OHM_PER_M.items()):
            r_lead = run * ohm
            i = self.servo_supply_v / (r_motor + 2 * r_lead)
            v_term = i * r_motor
            ground = i * r_lead
            torque = self.servo_stall_nm * min(1.0, v_term / self.servo_stall_v)
            rows[awg] = {"v_term": v_term, "ground_shift_v": ground, "signal_high_v": self.logic_high_v - ground,
                         "stall_nm": torque, "torque_margin": torque / peak_torque_nm if peak_torque_nm > 0 else math.inf}
        return {"run_m": run, "stall_a": self.servo_stall_a, "awg": rows, "chosen": rows[self.servo_lead_awg],
                "buck_w": self.servo_supply_v * self.servo_stall_a}

    def check_cables(self, peak_servo_nm: float | None = None) -> list[str]:
        bad = []
        t = self.cable_twist()
        if t["rate_deg_m"] > self.cable_twist_deg_m:
            bad.append(f"cable twists {t['rate_deg_m']:.0f} deg/m on the turntable axis at the {self.az_reach_deg:.1f} deg reach "
                       f"({self.cable_twist_deg_m:g} allowed): lower the clamp")
        if t["hole_gap_mm"] < 2 or t["bore_gap_mm"] < 2:
            bad.append(f"the {t['od_mm']:.1f} mm bundle does not pass the plates' 40 mm holes or the bearing's open centre")
        if t["clamp_below_stepper_mm"] < 10:
            bad.append("the axis cable clamp is not below the azimuth stepper")
        d = self.cable_loop_design()
        if d is None or d["window"] is None:
            bad.append("no single cable length makes a loop from the turntable gland to the head clip at every elevation "
                       "between the actuator's limits")
        if peak_servo_nm is not None:
            s = self.servo_supply(peak_servo_nm, d["cut_mm"] if d and d["window"] else None)["chosen"]
            if s["torque_margin"] < self.servo_torque_factor:
                bad.append(f"shuttle servo at {s['v_term']:.2f} V on stall has {s['torque_margin']:.2f}x the torque it needs "
                           f"({self.servo_torque_factor:g}x wanted): heavier servo leads")
            if s["signal_high_v"] < self.servo_vih + 0.3:
                bad.append(f"servo ground rises {s['ground_shift_v']:.2f} V at stall, leaving the signal {s['signal_high_v']:.2f} V "
                           f"against a {self.servo_vih:g} V threshold: heavier servo leads")
        return bad

    def check_elevation(self, gravity_nm: dict[float, float]) -> list[str]:
        bad = []
        d = self.elevation_drive(gravity_nm)
        if self.elev_act_closed > d["closed_max_mm"]:
            bad.append(f"elevation actuator is {self.elev_act_closed:g} mm retracted; the shortest pose needs "
                       f"{d['closed_max_mm']:.1f} mm or less")
        if self.elev_act_closed < d["closed_min_mm"]:
            bad.append(f"elevation actuator is {self.elev_act_closed:g} mm retracted: fully retracted it pulls the head past "
                       f"+{self.elev_clear_max:g} deg into the turntable plate (needs {d['closed_min_mm']:.1f} mm or more)")
        if self.elev_act_closed + self.elev_act_stroke < d["extended_min_mm"]:
            bad.append(f"elevation actuator reaches {self.elev_act_closed + self.elev_act_stroke:g} mm; the longest pose needs "
                       f"{d['extended_min_mm']:.0f} mm")
        if not d["monotonic"]:
            bad.append("elevation actuator length is not monotonic over the range (the pin passes its dead centre)")
        if d["force_margin"] < self.elev_force_factor:
            bad.append(f"elevation actuator must push {abs(d['push_peak_n']):.0f} N against {self.elev_act_force_n:g} N rated "
                       f"({self.elev_force_factor:g}x wanted)")
        if not self.elev_pin_x - 8 > self.head_x0 + 10 or self.elev_pin_x + 8 > self.feed_col_x - self.hole_d / 2 - 2:
            bad.append("elevation pin is off the head plate or inside the feed column")
        if self.elev_pin_z - 8 < self.roof_bottom + self.feed_floor_t or self.elev_pin_z + 12 > self.head_z1:
            bad.append("elevation pin's nut hits the feed roof or the pin is off the plate")
        y_cheek = self.plate_half_y + self.plate_t + self.cheek_gap + self.plate_t
        if -self.elev_act_y - self.elev_act_r < y_cheek + 4:
            bad.append("elevation actuator rubs the -y cheek")
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

    def launch_window(self, topspin_rpm: float | None = None) -> tuple[float, float, str]:
        """(slowest, fastest, binding limit) muzzle speed in m/s that passes the wheel-rpm and
        nip-traction checks of `check_launch` at the given topspin (default `launch_topspin_rpm`).
        The slowest is set by the bottom wheel: at low speed the spin difference would need it to run
        backwards. The fastest is set by the wheels' rpm limit or by the nip's traction ("wheel rpm"
        or "nip traction"). Returns (0, 0, ...) if no speed passes. Bisection on `check_launch`'s tests."""
        from dataclasses import replace
        spin = self.launch_topspin_rpm if topspin_rpm is None else topspin_rpm

        def state(v: float) -> tuple[bool, bool, bool]:
            q = replace(self, launch_v_max=v, launch_topspin_rpm=spin)
            rt, rb = q.launch_rpm
            return rb >= 0, max(rt, rb) <= q.wheel_rpm_max, q.launch_force_n * 1.5 <= q.launch_traction_n

        lo, hi = 0.0, 200.0
        for _ in range(60):  # slowest: the bottom wheel stops running backwards
            mid = (lo + hi) / 2
            lo, hi = (lo, mid) if state(mid)[0] else (mid, hi)
        vmin = hi
        if not all(state(vmin)):
            return 0.0, 0.0, "wheel rpm" if not state(vmin)[1] else "nip traction"
        lo, hi = vmin, 200.0
        for _ in range(60):  # fastest: rpm and traction limits both tighten with speed
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if all(state(mid)) else (lo, mid)
        return vmin, lo, ("wheel rpm" if not state(hi)[1] else "nip traction")

    def plate_clearance(self, v: float | None = None) -> dict:
        """Ball against the head plates after release (2026-11-09). The ball leaves the wheels with its centre at
        -nip_x and is free of the plates when its centre is a ball radius past `head_x1`; over that run it has
        `plate_half_y - ball_d/2` either side. Returns the side gap, the run, the transit time at `v` (default
        `launch_v_max`), the largest yaw error (deg) that still clears and the sideways speed that would just touch.
        Topspin and gravity act in the plates' plane (z), and the plates span head_z0..head_z1 around the ball, so
        only yaw (a wheel pair out of square with the plates, or a sideways push from a worn wheel) can hit them."""
        v = self.launch_v_max if v is None else v
        r = self.ball_d / 2
        gap = self.plate_half_y - r
        run = self.head_x1 + r + self.nip_x
        yaw = math.degrees(math.atan2(gap, run)) if run > 0 else 90.0
        t = run / 1000 / v if v > 0 else math.inf
        return {"gap_mm": gap, "run_mm": run, "transit_ms": t * 1000, "yaw_tol_deg": yaw,
                "side_speed_ms": gap / 1000 / t if t > 0 else math.inf}

    def axle_squaring(self) -> dict:
        """Wheel-axle yaw against the head plates (2026-11-09): the tolerance stack for `plate_clearance`'s limit.
        The axle's direction is set by two things: the motor face seating on the motor plate (flatness and burrs
        lift one edge by `seat_gap_mm` over the motor diameter) and the two bores not being exactly opposite each
        other (laser position error on each plate plus the plates' x-offset from their spacer slots) over the span
        between the bearings. Plates that are not parallel add the spacer length difference over the plate length.
        Returns each term in degrees, the worst-case sum, the root-sum-square, the limit and the margin
        (limit / worst case). All the tolerances are assumptions to replace with a measurement."""
        span = 2 * (self.plate_half_y + self.plate_t / 2)
        seat = math.degrees(math.atan2(self.seat_gap_mm, self.motor_d))
        bores = math.degrees(math.atan2(2 * self.bore_pos_tol_mm + self.plate_slot_play_mm, span))
        length = self.head_x1 - self.head_x0
        par = math.degrees(math.atan2(self.spacer_len_tol_mm, length))
        terms = {"motor_seat_deg": seat, "bore_offset_deg": bores, "plate_parallel_deg": par}
        worst = sum(terms.values())
        rss = math.sqrt(sum(v * v for v in terms.values()))
        limit = self.plate_clearance()["yaw_tol_deg"]
        return {**terms, "worst_deg": worst, "rss_deg": rss, "limit_deg": limit,
                "margin": limit / worst if worst > 0 else math.inf}

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
