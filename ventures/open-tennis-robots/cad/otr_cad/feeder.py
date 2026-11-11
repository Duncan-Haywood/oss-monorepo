"""Feeder + catch net: every fabricated part, generated from `params.Feeder`.

Same three kinds of made part as the collector (laser sheet, printed PETG,
stock cut to length); bought-in parts are envelopes for the collision checks.
Frame: origin on the ground at the middle of the net plane, x to the player,
y along the net, z up. The base rolls along y.

Feed: a column of balls drops into the pocket of a printed shuttle that slides
between the head plates and carries one ball forward to the wheels (its solid
rear shuts the column meanwhile); a hose runs up to a tub on a sloped shelf.

Azimuth (2026-11-10): a NEMA 17 stepper under the mast plate turns a bought
m1.5 pinion that meshes with a printed gear sector bolted under the turntable
plate; the plate is trimmed inside the pinion's reach.

Elevation (2026-11-11): a linear actuator outboard of the -y cheek, anchored on
a tab of that cheek, pushes a pin on the guard plate; it is posed for each
elevation in the sweeps (`elev_actuator_shapes`).

Not modelled yet: the netting and its trough, the hopper agitator, the shuttle
actuator and its bracket, and the cable runs. They are listed in `hardware/feeder-catcher.md`.
"""

from __future__ import annotations

import math

from build123d import (
    Axis,
    Box,
    BuildSketch,
    Circle,
    Cone,
    Cylinder,
    Location,
    Locations,
    Mode,
    Polygon,
    RectangleRounded,
    SlotOverall,
    extrude,
)

from .collector import ROT_XZ, ROT_Y_AXIS, Part, _holes
from .params import Feeder

BATTERY_X = -450.0  # battery centre on the deck
AZ_BOSS_D = 23.0       # NEMA 17 pilot boss is 22 mm across
AZ_MOTOR_PITCH = 31.0  # NEMA 17 M3 square
SPIGOT_BOLT_R = 64.0  # M4 ring of the sleeve socket under the shelf (48 until 2026-11-10; the sleeve's wall now sits there)


# ---------------------------------------------------------------- helpers

def _head_loc(p: Feeder, x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Location:
    """Head-local point (x forward, z up) as a world Location."""
    return Location((p.head_x + x, y, p.launch_z + z))


def _head_plate_sketch(p: Feeder, *, motors: bool):
    cz = (p.head_z0 + p.head_z1) / 2
    with BuildSketch() as s:
        with Locations(((p.head_x0 + p.head_x1) / 2, cz)):
            RectangleRounded(p.head_x1 - p.head_x0, p.head_z1 - p.head_z0, 12)
        g = p.head_gap_axis
        if motors:
            for z in (g, -g):
                with Locations((0, z)):
                    Circle(14 / 2, mode=Mode.SUBTRACT)  # shaft clearance
                _holes([(sx * p.motor_pitch / 2, z + sz * p.motor_pitch / 2) for sx in (-1, 1) for sz in (-1, 1)], 4.4)
        _holes(_standoffs(p), 5.5)
        _holes([(0, p.pivot_z_rel)], 8.4)
        if not motors:
            _holes([(p.elev_pin_x, p.elev_pin_z)], 6.4)  # elevation actuator's pin (M6), guard side
        _holes(_feed_screws(p), 4.4)             # M4 into the feed floor and roof
    return s.sketch


def _standoffs(p: Feeder):
    # Rear pair sits behind the feed column; front pair is ahead of the wheels.
    return [(x, sz * 150.0) for x in (-215.0, 95.0) for sz in (-1, 1)]


def _feed_screws(p: Feeder):
    """Head-frame (x, z) of the M4 screws through each head plate into the feed floor and roof."""
    zf = p.floor_top - p.feed_floor_t / 2
    zr = p.roof_bottom + p.feed_floor_t / 2
    return [(-220.0, zf), (-110.0, zf), (-220.0, zr), (-90.0, zr)]


def _shelf_posts(p: Feeder):
    return [(x, sy * p.shelf_post_y) for x in (p.post_rear_x, p.post_front_x) for sy in (-1, 1)]


def _post_xy(p: Feeder):
    return [(p.head_x + sx * p.post_dx, sy * p.post_half_y) for sx in (-1, 1) for sy in (-1, 1)]


def _ring(r: float, n: int, phase_deg: float = 0.0):
    return [(r * math.cos(math.radians(phase_deg + 360 * i / n)), r * math.sin(math.radians(phase_deg + 360 * i / n)))
            for i in range(n)]


def _foot_xy(p: Feeder):
    """Cheek feet: world (x, |y|) of the vertical pilot hole under each."""
    return [(p.head_x + sx * 35.0, p.plate_half_y + p.plate_t + p.cheek_gap + p.plate_t + 10.0) for sx in (-1, 1)]


# ---------------------------------------------------------------- laser parts

def head_motor_plate(p: Feeder) -> Part:
    face = _head_plate_sketch(p, motors=True)
    return Part("head_motor_plate", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((p.head_x, p.plate_half_y + p.plate_t, p.launch_z), ROT_XZ)],
                flat=face, thickness=p.plate_t,
                notes=f"Both outrunners mount on this plate (M4 on a {p.motor_pitch:g} mm square; check your motor). "
                      "Pivot bolt M8 through the lower hole.")


def head_guard_plate(p: Feeder) -> Part:
    face = _head_plate_sketch(p, motors=False)
    return Part("head_guard_plate", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((p.head_x, -p.plate_half_y, p.launch_z), ROT_XZ)],
                flat=face, thickness=p.plate_t,
                notes="Keeps hands and balls off the open side of the wheels; held by four M5 standoffs.")


ELEV_TAB_PAD = 16.0  # aluminium round the actuator's anchor hole


def elev_anchor_world(p: Feeder) -> tuple[float, float]:
    return p.head_x + p.elev_anchor_dx, p.pivot_z + p.elev_anchor_dz


def _cheek_face(p: Feeder, tab: bool):
    z0 = p.turntable_top
    z1 = p.pivot_z + 25.0
    with BuildSketch() as s:
        with Locations((p.head_x, (z0 + z1) / 2)):
            RectangleRounded(2 * p.cheek_x_half, z1 - z0, 8)
        if tab:  # reaches back to the elevation actuator's anchor
            ax, az = elev_anchor_world(p)
            x0, x1 = ax - ELEV_TAB_PAD, p.head_x - p.cheek_x_half + 10.0
            z_top = az + ELEV_TAB_PAD
            with Locations(((x0 + x1) / 2, (z0 + z_top) / 2)):
                RectangleRounded(x1 - x0, z_top - z0, 8)
            _holes([(ax, az)], 6.4)
        _holes([(p.head_x, p.pivot_z)], 8.4)
        _holes([(p.head_x + sx * 35.0, z0 + 30.0) for sx in (-1, 1)], 4.4)
    return s.sketch


def trunnion_cheek(p: Feeder) -> Part:
    face = _cheek_face(p, tab=False)
    y_in = p.plate_half_y + p.plate_t + p.cheek_gap
    return Part("trunnion_cheek", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((0, y_in + p.plate_t, 0), ROT_XZ)],
                flat=face, thickness=p.plate_t,
                notes="Motor-side (+y) cheek: holds the head's M8 pivot bolt; a printed foot bolts it to the turntable plate.")


def trunnion_cheek_elev(p: Feeder) -> Part:
    face = _cheek_face(p, tab=True)
    y_in = p.plate_half_y + p.plate_t + p.cheek_gap
    return Part("trunnion_cheek_elev", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((0, -y_in, 0), ROT_XZ)],
                flat=face, thickness=p.plate_t,
                notes="Guard-side (-y) cheek: holds the pivot bolt, and its rear tab carries the elevation actuator's "
                      "anchor (M6 shoulder bolt). Same feet as the other cheek.")


MAST_NOTCH_R = 115.0  # the head's plates reach below the mast plate's top only beyond 119.6 mm behind the axis (+45 deg)


def _mast_notch(p: Feeder) -> list[tuple[float, float]]:
    """Cut-out at the mast plate's rear: everything beyond MAST_NOTCH_R behind the axis that the head's plates
    (half-width plate_half_y + plate_t, plus 5 mm) sweep over when it turns +-az_max. Found 2026-11-10 by the
    azimuth sweep: nose up 45 deg and turned 15 deg, the guard plate cut 78 mm^3 into the plate's rear edge."""
    w = p.plate_half_y + p.plate_t + 5.0
    rs = [MAST_NOTCH_R + k * 10.0 for k in range(15)]
    ang = lambda r: math.radians(p.az_max) + math.asin(min(1.0, w / r))  # noqa: E731
    upper = [(p.head_x - r * math.cos(ang(r)), r * math.sin(ang(r))) for r in rs]
    a0 = ang(MAST_NOTCH_R)
    arc = [(p.head_x - MAST_NOTCH_R * math.cos(a0 * (2 * k / 12 - 1)), MAST_NOTCH_R * math.sin(a0 * (2 * k / 12 - 1)))
           for k in range(1, 12)]
    lower = [(x, -y) for x, y in reversed(upper)]
    return upper + [(p.head_x - 400.0, upper[-1][1]), (p.head_x - 400.0, -upper[-1][1])] + lower + arc


def mast_plate(p: Feeder) -> Part:
    with BuildSketch() as s:
        with Locations((p.head_x, 0)):
            RectangleRounded(2 * p.post_dx + 60, 2 * p.post_half_y + 80, 10)
        _holes([(x, y) for x, y in _post_xy(p)], 5.5)
        _holes([(p.head_x + x, y) for x, y in _ring(60, 4)], 5.5)
        Polygon(*_mast_notch(p), align=None, mode=Mode.SUBTRACT)  # the head's rear dips past it, nose up and turned
        with Locations((p.head_x, 0)):
            Circle(20, mode=Mode.SUBTRACT)  # cables to the turntable
        with Locations((p.head_x, p.az_centre_dist)):
            Circle(AZ_BOSS_D / 2, mode=Mode.SUBTRACT)  # azimuth stepper's boss and shaft
        _holes(_az_motor_holes(p), 3.4)
    face = s.sketch
    return Part("mast_plate", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((0, 0, p.mast_top_z))], flat=face, thickness=p.plate_t,
                notes="Bolts to the end-tapped posts (M5) and to the fixed ring of the turntable bearing; the azimuth "
                      "stepper hangs under it on four M3 screws.")


def _az_motor_holes(p: Feeder):
    return [(p.head_x + sx * AZ_MOTOR_PITCH / 2, p.az_centre_dist + sy * AZ_MOTOR_PITCH / 2) for sx in (-1, 1) for sy in (-1, 1)]


def _az_bolt_angles(p: Feeder):
    """Plate-frame angles (deg from +x) of the three M4 bolts holding the gear sector."""
    h = p.az_sector_half_deg - 6.0
    return [90.0 - h, 90.0, 90.0 + h]


def _az_bolts(p: Feeder):
    r = p.az_bolt_r
    return [(p.head_x + r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a in _az_bolt_angles(p)]


def turntable_plate(p: Feeder) -> Part:
    h = math.radians(p.az_sector_half_deg)
    r_out = p.az_trim_r + 5.0
    wedge = [(p.head_x, 0.0)] + [(p.head_x + r_out * math.cos(math.pi / 2 + h * (2 * i / 24 - 1)),
                                   r_out * math.sin(math.pi / 2 + h * (2 * i / 24 - 1))) for i in range(25)]
    with BuildSketch() as s:
        with Locations((p.head_x, 0)):
            RectangleRounded(2 * p.cheek_x_half + 80, 2 * (p.plate_half_y + p.plate_t + p.cheek_gap + 2 * p.plate_t + 30), 10)
        Polygon(*wedge, align=None)                       # carries the gear sector's bolts
        with Locations((p.head_x, 0)):
            Circle(p.az_trim_r, mode=Mode.INTERSECT)      # inside the pinion's tip circle at every azimuth
        _holes([(p.head_x + x, y) for x, y in _ring(60, 4, 45)], 5.5)
        _holes([(x, sy * yy) for x, yy in _foot_xy(p) for sy in (-1, 1)], 4.4)
        _holes(_az_bolts(p), 4.4)
        with Locations((p.head_x, 0)):
            Circle(20, mode=Mode.SUBTRACT)
    face = s.sketch
    z = p.mast_top_z + p.plate_t + p.bearing_h
    return Part("turntable_plate", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((0, 0, z))], flat=face, thickness=p.plate_t,
                notes=f"Bolts to the rotating ring of the bearing. Trimmed to a {p.az_trim_r:g} mm radius so the azimuth "
                      f"pinion clears it at every angle; the printed gear sector bolts under its +y edge (3 x M4).")


def az_gear_profile(p: Feeder, pts_per_flank: int = 6) -> list[tuple[float, float]]:
    """Gear sector outline about the turntable axis (axis at the origin), from +x counter-clockwise: tooth flanks
    are involutes, thinned by the backlash allowance; tooth spaces span plate angles 90 +- the sector half-angle."""
    rp = p.az_gear_r
    ra, rr = rp + p.az_module, rp - 1.25 * p.az_module
    pitch = 2 * math.pi / p.az_gear_teeth
    h = math.radians(p.az_sector_half_deg)
    n = int(h // pitch)
    radii = [rr + (ra - rr) * k / pts_per_flank for k in range(pts_per_flank + 1)]
    pts = []
    for i in range(-n, n + 1):
        c = math.pi / 2 + i * pitch
        flank = [(r, p.az_tooth_half_angle(r)) for r in radii]
        pts += [(r * math.cos(c - w), r * math.sin(c - w)) for r, w in flank]            # leading flank, root to tip
        pts += [(r * math.cos(c + w), r * math.sin(c + w)) for r, w in reversed(flank)]  # trailing flank, tip to root
    pts.sort(key=lambda q: math.atan2(q[1], q[0]))
    a0 = math.atan2(pts[0][1], pts[0][0]) - pitch / 4
    a1 = math.atan2(pts[-1][1], pts[-1][0]) + pitch / 4
    ri = p.az_gear_inner_r
    end = [(rr * math.cos(a1), rr * math.sin(a1))]
    inner = [(ri * math.cos(a1 + (a0 - a1) * k / 24), ri * math.sin(a1 + (a0 - a1) * k / 24)) for k in range(25)]
    return [(rr * math.cos(a0), rr * math.sin(a0))] + pts + end + inner


def base_deck(p: Feeder) -> Part:
    x0, x1 = -(p.base_depth - 30.0), p.head_x - p.post_dx - 20.0 - 10.0
    cx = (x0 + x1) / 2
    hw = p.base_half_w - p.rail_w / 2
    with BuildSketch() as s:
        with Locations((cx, 0)):
            RectangleRounded(x1 - x0, 2 * hw, 8)
        n = 5
        xs = [x0 + 30 + i * (x1 - x0 - 60) / (n - 1) for i in range(n)]
        _holes([(x, sy * hw) for x in xs for sy in (-1, 1)], 5.5)
        _holes(_shelf_posts(p), 5.5)  # hopper posts, M5 from below into their tapped ends
        # Battery strap slots (25 mm strap).
        bx = BATTERY_X
        with Locations((bx - 60, 0), (bx + 60, 0)):
            SlotOverall(40, 6, rotation=90, mode=Mode.SUBTRACT)
        # Universal M3 grid for the Pi, ESP32 carrier, ESCs and motor driver.
        _holes([(x, y) for x in range(int(x0 + 25), int(bx - 90), 10) for y in range(-200, 201, 10) if abs(y) > 20], 3.2)
    face = s.sketch
    return Part("base_deck", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((0, 0, p.rail_top))], flat=face, thickness=p.plate_t,
                notes="Sits on the rails (M5 and T-nuts); holds the battery and electronics.")


def wheel_bracket(p: Feeder, drive: bool) -> Part:
    wx = p.wheel_x[0] if drive else p.wheel_x[1]
    z0, z1 = 30.0, p.rail_top
    with BuildSketch() as s:
        with Locations((wx, (z0 + z1) / 2)):
            RectangleRounded(90, z1 - z0, 8)
        if drive:
            with Locations((wx, p.wheel_d / 2)):
                Circle(14 / 2, mode=Mode.SUBTRACT)
            _holes([(wx + x, p.wheel_d / 2 + y) for x, y in _ring(15.5, 6)], 3.4)
        else:
            with Locations((wx, p.wheel_d / 2)):
                Circle(22 / 2, mode=Mode.SUBTRACT)  # 608 bearing
        _holes([(wx + dx, p.rail_z + p.rail_h / 2) for dx in (-15, 15)], 5.5)
    face = s.sketch
    x = p.base_half_w
    name = "drive_bracket" if drive else "idler_bracket"
    note = ("Gearmotor (37 mm class, M3 on a 31 mm circle) bolts to the inside face." if drive
            else "608 bearing in the bore, 8 mm axle bolt.")
    return Part(name, "laser", "aluminium 5052", 2, extrude(face, p.bracket_t),
                [Location((0, x + p.bracket_t, 0), ROT_XZ), Location((0, -x, 0), ROT_XZ)],
                flat=face, thickness=p.bracket_t, notes=note + " M5 into the side rail's T-slot.")


def hopper_shelf(p: Feeder) -> Part:
    s = math.radians(p.shelf_slope_deg)
    cx, _ = p.shelf_origin
    a_o = p.shelf_l / 2 - 55.0
    with BuildSketch() as sk:
        RectangleRounded(p.shelf_l, p.shelf_w, 10)
        _holes([((x + 0.0 - cx) / math.cos(s), y) for x, y in _shelf_posts(p)], 5.5)
        with Locations((a_o, 0)):
            Circle(80.0 / 2, mode=Mode.SUBTRACT)
        _holes([(a_o + x, y) for x, y in _ring(SPIGOT_BOLT_R, 4, 45)], 4.4)
        with Locations((0, p.tub_w / 2 + 12), (0, -p.tub_w / 2 - 12)):
            SlotOverall(60, 6, mode=Mode.SUBTRACT)  # a 25 mm strap over the tub each side
    face = sk.sketch
    ox, oz = p.shelf_origin
    return Part("hopper_shelf", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((ox, 0, oz), (0, p.shelf_slope_deg, 0))], flat=face, thickness=p.plate_t,
                notes=f"Tub shelf, falls {p.shelf_slope_deg:g} deg toward the net so balls roll to the outlet. "
                      "Posts bolt up through it (M5, end-tapped), the sleeve socket under the outlet hole.")


# ---------------------------------------------------------------- feed parts (printed)

def _feed_w(p: Feeder) -> float:
    return 2 * (p.plate_half_y - p.feed_clear)


def _pilots(blk, p: Feeder, pts, depth: float = 12.0):
    """M4 pilot holes drilled inward along y from both sides at head-frame (x, z)."""
    w = _feed_w(p)
    for x, z in pts:
        for sy in (-1, 1):
            blk = blk - Cylinder(2.0, depth).moved(Location((x, sy * (w / 2 - depth / 2), z), ROT_Y_AXIS))
    return blk


def feed_floor(p: Feeder) -> Part:
    w = _feed_w(p)
    x0, x1 = p.head_x0, -50.0
    zf = p.floor_top - p.feed_floor_t / 2
    blk = Box(x1 - x0, w, p.feed_floor_t).moved(Location(((x0 + x1) / 2, 0, zf)))
    blk = _pilots(blk, p, [(x, z) for x, z in _feed_screws(p) if z == zf])
    return Part("feed_floor", "print", "PETG", 1, blk, [_head_loc(p)],
                notes="Floor of the ball path between the head plates; the shuttle slides on it. "
                      "M4 heat-set inserts take screws through both head plates.")


def feed_roof_column(p: Feeder) -> Part:
    w = _feed_w(p)
    x0, x1 = p.head_x0, -60.0
    zr = p.roof_bottom + p.feed_floor_t / 2
    blk = Box(x1 - x0, w, p.feed_floor_t).moved(Location(((x0 + x1) / 2, 0, zr)))
    z_a = p.roof_bottom + p.feed_floor_t
    tube = Cylinder(w / 2, p.col_top - z_a).moved(Location((p.feed_col_x, 0, (z_a + p.col_top) / 2)))
    sock_od = p.hose_od + 8.0
    sock = Cylinder(sock_od / 2, p.socket_h).moved(Location((p.feed_col_x, 0, p.col_top + p.socket_h / 2)))
    blk = blk + tube + sock
    z_b = p.roof_bottom - 1.0
    blk = blk - Cylinder(p.hole_d / 2, p.col_top - z_b).moved(Location((p.feed_col_x, 0, (z_b + p.col_top) / 2)))
    blk = blk - Cylinder((p.hose_od + 0.5) / 2, p.socket_h).moved(Location((p.feed_col_x, 0, p.col_top + p.socket_h / 2)))
    blk = _pilots(blk, p, [(x, z) for x, z in _feed_screws(p) if z == zr])
    return Part("feed_roof_column", "print", "PETG", 1, blk, [_head_loc(p)],
                notes=f"Roof over the shuttle, a column {p.hole_d:g} mm bore up past the head plates, and a hose socket "
                      f"({p.hose_od + 0.5:g} mm) on top. Print upright, 6 walls.")


def feed_shuttle(p: Feeder) -> Part:
    w = _feed_w(p) - 0.4
    x_rear = p.shuttle_rear
    x_front = p.feed_col_x + 60.0
    blk = Box(x_front - x_rear, w, p.shuttle_h).moved(Location(((x_rear + x_front) / 2, 0, p.shuttle_z0 + p.shuttle_h / 2)))
    zc = p.shuttle_z0 + p.shuttle_h / 2
    blk = blk - Cylinder(p.hole_d / 2, p.shuttle_h + 2).moved(Location((p.feed_col_x, 0, zc)))
    # Open front: full-width slot to the arms' root, then a narrowed gap between two flexure arms.
    x_root = x_front - p.retain_len
    slot_x0 = p.feed_col_x
    blk = blk - Box(x_root - slot_x0, p.hole_d, p.shuttle_h + 2).moved(Location(((slot_x0 + x_root) / 2, 0, zc)))
    blk = blk - Box(x_front - x_root + 1, p.retain_gap, p.shuttle_h + 2).moved(Location(((x_root + x_front + 1) / 2, 0, zc)))
    y_rel = p.retain_gap / 2 + p.retain_t + p.retain_relief / 2
    for sy in (-1, 1):
        blk = blk - Box(x_front - x_root + 1, p.retain_relief, p.shuttle_h + 2).moved(
            Location(((x_root + x_front + 1) / 2, sy * y_rel, zc)))
    blk = blk - Cylinder(2.0, 20).moved(Location((x_rear + 8.0, 0, zc), (0, 90, 0)))  # M4 for the actuator clevis
    return Part("feed_shuttle", "print", "PETG", 1, blk, [_head_loc(p)],
                notes=f"Pocket for one ball ({p.hole_d:g} mm hole); the front is narrowed to {p.retain_gap:.0f} mm between two "
                      f"{p.retain_t:g} mm flexure arms that hold the ball at negative elevation and let the wheels pull it out; the solid rear shuts the column "
                      f"while it moves {p.feed_stroke:g} mm forward. Drawn retracted (pocket under the column). 6 walls.")


def _sleeve_d(p: Feeder) -> tuple[float, float]:
    """(bore, outside diameter) of the take-up sleeve."""
    bore = p.hose_od + p.sleeve_clear_mm
    return bore, bore + 2 * p.sleeve_wall_mm


def hopper_spigot(p: Feeder) -> Part:
    """Socket under the shelf's outlet that holds the take-up sleeve upright (2026-11-10; until then a hose socket).
    A flange on the sloped shelf and a vertical cup the sleeve's top end pushes into, cut flush with the shelf."""
    s = math.radians(p.shelf_slope_deg)
    bore, od = _sleeve_d(p)
    ox, oz = p.hopper_out_x, p.hopper_out_z
    shelf = Location((ox, 0, oz), (0, p.shelf_slope_deg, 0))
    flange = Cylinder(SPIGOT_BOLT_R + 10.0, 5.0).moved(Location((0, 0, -2.5))).moved(shelf)
    top = oz - p.sleeve_top_mm                         # sleeve's top end, under the flange all round
    cup_h = 40.0
    z_hi = oz + (od / 2 + 6.0) * math.tan(s) + 2.0     # reaches the shelf plane all round, then cut flush
    cup = Cylinder(od / 2 + 6.0, z_hi - (top - cup_h)).moved(Location((ox, 0, (z_hi + top - cup_h) / 2)))
    blk = flange + cup
    blk = blk - Box(400.0, 400.0, 200.0).moved(Location((0, 0, 100.0))).moved(shelf)    # nothing above the shelf
    blk = blk - Cylinder(80.0 / 2, 400.0).moved(Location((ox, 0, oz)))                 # ball passage, as the shelf hole
    blk = blk - Cylinder((od + 0.5) / 2, cup_h).moved(Location((ox, 0, top - cup_h / 2)))
    blk = blk - Box(30.0, 10.0, cup_h + 2.0).moved(Location((ox - od / 2 - 5.0, 0, top - cup_h / 2)))  # the sleeve's slot, carried on
    for x, y in _ring(SPIGOT_BOLT_R, 4, 45):
        blk = blk - Cylinder(2.0, 14).moved(Location((x, y, -4.0))).moved(shelf)
    return Part("hopper_spigot", "print", "PETG", 1, blk, [Location((0, 0, 0))],
                notes=f"Sleeve socket under the shelf's outlet hole: flange on the sloped shelf (M4 heat-set inserts), a vertical "
                      f"cup {od + 0.5:g} mm across and {cup_h:g} mm deep for the sleeve's top end. Print flange down, 6 walls.")


# ---------------------------------------------------------------- printed parts

def cheek_foot(p: Feeder) -> Part:
    h = 60.0
    blk = Box(24, 20, h).moved(Location((0, 0, h / 2)))
    blk = blk - Cylinder(2.0, 25).moved(Location((0, 0, 12.5)))                              # M4 up from the plate
    blk = blk - Cylinder(2.0, 24).moved(Location((0, 0, 30), ROT_Y_AXIS))                    # M4 through the cheek
    placements = []
    y_foot = p.plate_half_y + p.plate_t + p.cheek_gap + p.plate_t + 10.0
    for x, _ in _foot_xy(p):
        for sy in (-1, 1):
            placements.append(Location((x, sy * y_foot, p.turntable_top)))
    return Part("cheek_foot", "print", "PETG", 4, blk, placements,
                notes="M4 heat-set inserts; bolts the cheek to the turntable plate, 4 walls, 40% infill.")


def az_gear_sector(p: Feeder) -> Part:
    face_mm = p.az_gear_face_mm
    with BuildSketch() as sk:
        Polygon(*[(p.head_x + x, y) for x, y in az_gear_profile(p)], align=None)
    blk = extrude(sk.sketch, face_mm)
    for x, y in _az_bolts(p):
        blk = blk - Cylinder(2.0, face_mm).moved(Location((x, y, face_mm / 2)))   # M4 heat-set insert, from the top
    z0 = p.mast_top_z + p.plate_t + p.az_gear_gap_mm
    return Part("az_gear_sector", "print", "PETG", 1, blk, [Location((0, 0, z0))],
                notes=f"Azimuth gear: module {p.az_module:g}, {p.az_gear_teeth} teeth on the full circle "
                      f"(pitch radius {p.az_gear_r:g} mm), {2 * p.az_sector_half_deg:g} deg cut. Bolts under the turntable "
                      f"plate (3 x M4 into heat-set inserts); meshes with the stepper's {p.az_pinion_teeth}-tooth pinion. "
                      f"Print flat, 100% infill, 0.1 mm layers for the flanks; grease the teeth.")


def pole_foot(p: Feeder) -> Part:
    h = 60.0
    blk = Box(50, 50, h).moved(Location((0, 0, h / 2)))
    blk = blk - Cylinder(p.pole_d / 2 + 0.25, 40).moved(Location((0, 0, h - 20)))
    blk = blk - Cylinder(2.75, 52).moved(Location((0, 0, 10), (0, 90, 0)))
    return Part("pole_foot", "print", "PETG", 2, blk,
                [Location((-10, s * p.net_w / 2, p.rail_top)) for s in (1, -1)],
                notes="Sockets a 25 mm vertical pole 40 mm deep; M5 screws and T-nuts into the beam. 6 walls.")


def pole_elbow(p: Feeder) -> Part:
    blk = Box(60, 60, 80)
    blk = blk - Cylinder(p.pole_d / 2 + 0.25, 40).moved(Location((0, 0, -20)))
    blk = blk - Cylinder(p.pole_d / 2 + 0.25, 40).moved(Location((0, -10, 0), ROT_Y_AXIS))
    zc = p.net_top - 30.0
    return Part("pole_elbow", "print", "PETG", 2, blk,
                [Location((-10, p.net_w / 2, zc)), Location((-10, -p.net_w / 2, zc), (0, 0, 180))],
                notes="Joins a vertical pole to the top pole; sockets 40 mm deep. 6 walls, 40% gyroid.")


def camera_clamp(p: Feeder) -> Part:
    blk = Box(50, 50, 80).moved(Location((0, 0, 40)))
    blk = blk - Cylinder(p.pole_d / 2 + 0.25, 52).moved(Location((0, 0, 60), ROT_Y_AXIS))
    blk = blk - Box(20.4, 52, 20.4).moved(Location((0, 0, 20)))
    z0 = p.net_top - 30.0 - 60.0
    return Part("camera_clamp", "print", "PETG", 2, blk,
                [Location((-10, s * 300.0, z0)) for s in (1, -1)],
                notes="Clips the top pole and holds the 2020 stereo bar; add an M4 clamp screw each. 6 walls.")


# ---------------------------------------------------------------- stock + bought-in

def _rail(name, qty, dims, places, spec) -> Part:
    dx, dy, dz = dims
    return Part(name, "stock", "aluminium extrusion", qty, Box(dx, dy, dz), places,
                spec=spec, notes="Cut square, deburr, M5 tap each end where a post or rail meets it.")


def extrusions(p: Feeder) -> list[Part]:
    zc = p.rail_z + p.rail_h / 2
    w, h = p.rail_w, p.rail_h
    side_len = p.base_depth - 2 * w
    out = [
        Part("net_beam", "stock", "aluminium extrusion", 1, Box(w, p.beam_len, h),
             [Location((-w / 2, 0, zc))], spec=f"2040 T-slot, cut {p.beam_len:g} mm",
             notes="Front member of the base and the foot of the net. Cut square."),
        _rail("rear_rail", 1, (w, 2 * p.base_half_w, h), [Location((-p.base_depth + w / 2, 0, zc))],
              f"2040 T-slot, cut {2 * p.base_half_w:g} mm"),
        _rail("side_rail", 2, (side_len, w, h),
              [Location((-p.base_depth / 2, s * (p.base_half_w - w / 2), zc)) for s in (1, -1)],
              f"2040 T-slot, cut {side_len:g} mm"),
        _rail("mast_rail", 2, (w, 2 * (p.base_half_w - w), h),
              [Location((p.head_x + s * p.post_dx, 0, zc)) for s in (-1, 1)],
              f"2040 T-slot, cut {2 * (p.base_half_w - w):g} mm"),
    ]
    post_len = p.mast_top_z - p.rail_top
    out.append(Part("mast_post", "stock", "aluminium extrusion", 4, Box(w, h, post_len),
                    [Location((x, y, p.rail_top + post_len / 2)) for x, y in _post_xy(p)],
                    spec=f"2040 T-slot, cut {post_len:g} mm, M5 tapped both ends",
                    notes="Four posts carry the mast plate."))
    for name, x in (("hopper_post_rear", p.post_rear_x), ("hopper_post_front", p.post_front_x)):
        top = p.shelf_underside_z(x + 10.0)
        ln = top - (p.rail_top + p.plate_t)
        out.append(Part(name, "stock", "aluminium extrusion", 2, Box(w, h, ln),
                        [Location((x, sy * p.shelf_post_y, p.rail_top + p.plate_t + ln / 2)) for sy in (-1, 1)],
                        spec=f"2040 T-slot, cut {ln:.0f} mm, M5 tapped both ends",
                        notes="Stands on the deck (20 mm along the net's x); carries the hopper shelf. "
                              "Its top is level, touching the shelf at the net-side edge: shim the other edge. "
                              "Braced by the hopper_brace parts."))
    # Diagonal braces, 2020 on the outer faces so they clear the posts: x braces (one per side) stop
    # sway toward and away from the net, the y brace (behind the rear pair) stops sway along it.
    (xa, xz), (xb, xzb) = p.brace_ends("x")
    ang_x = math.degrees(math.atan2(xzb - xz, xb - xa))
    out.append(Part("hopper_brace_x", "stock", "aluminium extrusion", 2, Box(p.brace_len("x"), 20, 20),
                    [Location(((xa + xb) / 2, sy * (p.shelf_post_y + 20 + 10), (xz + xzb) / 2), (0, -ang_x, 0))
                     for sy in (-1, 1)],
                    spec=f"2020 T-slot, cut {p.brace_len('x'):.0f} mm, ends mitred to {90 - abs(ang_x):.0f} deg",
                    notes="Outside each side pair of posts, rear foot to front head; a 2020 corner bracket "
                          "or a gusset at each end (M5), tightened before the tub is filled."))
    (ya, yz), (yb, yzb) = p.brace_ends("y")
    ang_y = math.degrees(math.atan2(yzb - yz, yb - ya))
    out.append(Part("hopper_brace_y", "stock", "aluminium extrusion", 1, Box(20, p.brace_len("y"), 20),
                    [Location((p.post_rear_x - 20, (ya + yb) / 2, (yz + yzb) / 2), (ang_y, 0, 0))],
                    spec=f"2020 T-slot, cut {p.brace_len('y'):.0f} mm, ends mitred to {90 - abs(ang_y):.0f} deg",
                    notes="Behind the rear posts, left foot to right head, out of the head's swing (the head's "
                          "rear reaches x = -560 mm at +45 deg). The shelf, bolted to all four posts, holds the front "
                          "posts' heads to the rear pair in plan, so one brace braces the frame along the net."))
    out.append(Part("camera_bar", "stock", "aluminium extrusion", 1, Box(20, p.camera_bar_len, 20),
                    [Location((-10, 0, p.net_top - 30.0 - 60.0 + 20.0))],
                    spec=f"2020 T-slot, cut {p.camera_bar_len:g} mm",
                    notes="Stereo cameras mount on this; widen it for more depth accuracy."))
    return out


def poles(p: Feeder) -> list[Part]:
    zc = p.net_top - 30.0
    z0 = p.rail_top + 20.0
    vl = zc - p.pole_d / 2 - 0.5 - z0
    tl = p.net_w + 20.0
    return [
        Part("net_pole_vertical", "stock", "aluminium tube", 2, Cylinder(p.pole_d / 2, vl).moved(Location((0, 0, vl / 2))),
             [Location((-10, s * p.net_w / 2, z0)) for s in (1, -1)],
             spec=f"{p.pole_d:g} mm OD x 1.5 mm aluminium tube (or fibreglass), cut {vl:g} mm",
             notes="Two 1.2 m sections joined by a sleeve if it must fit a car."),
        Part("net_pole_top", "stock", "aluminium tube", 1, Cylinder(p.pole_d / 2, tl).moved(Location((0, 0, 0), ROT_Y_AXIS)),
             [Location((-10, 0, zc))],
             spec=f"{p.pole_d:g} mm OD x 1.5 mm aluminium tube, cut {tl:g} mm",
             notes="Two sections joined by a sleeve at the middle."),
    ]


def feed_hose(p: Feeder) -> Part:
    t = p.sleeve_take_up_design()
    cut = t["hose_cut_mm"] if t else p.hose_len
    return Part("feed_hose", "stock", "flexible hose", 1, Cylinder(p.hose_od / 2, cut),
                [],  # a hose's pose changes with the head; checked by end-direction curves in params, not as a solid
                spec=f"{p.hose_id:g} mm ID smooth-bore flexible hose ({p.hose_od:g} mm OD), cut {cut:g} mm",
                notes=f"Take-up sleeve's lower end to the column socket (sleeve_take_up_design). Longest chord {max(c for _, c, _ in p.hose_chords()):.0f} mm; "
                      f"bows to {p.hose_bow_radius():.0f} mm radius at the closest pose; needs {p.hose_min_bend:g}. "
                      "Top end bonded into the take-up collar; a hose clamp at the column socket.")


def take_up_parts(p: Feeder) -> list[Part]:
    """The sleeve take-up sized by `Feeder.sleeve_take_up_design` (2026-11-10; it replaces the floating pulley, whose
    180 deg wrap sent balls uphill). A rigid tube hangs from the outlet socket; a printed collar bonded on the hose's top
    end slides in it, held up by a constant-force spring whose band runs down a slot in the tube's rear wall to a tab on
    the collar. Balls drop straight down the tube and into the collar's funnel. Shown at the 0 deg pose (collar highest).
    Not modelled: the spring's band, the adhesive joint."""
    t = p.sleeve_take_up_design()
    if t is None:
        return []
    bore, od = _sleeve_d(p)
    ox, oz = p.hopper_out_x, p.hopper_out_z
    top, bottom = oz - p.sleeve_top_mm, t["start_z"]
    L = top - bottom
    slot_w = 10.0
    # the collar's tab (12 mm tall, at its top) runs in a slot from the tube's top end to 10 mm under its lowest position
    slot_z0 = oz - t["collar_travel"][1] + p.collar_h_mm - 12.0 - 10.0
    tube = Cylinder(od / 2, L) - Cylinder(bore / 2, L + 2)
    tube = tube - Box(p.sleeve_wall_mm * 4, slot_w, top - slot_z0 + 1.0).moved(
        Location((-od / 2, 0, (top + 1.0 + slot_z0) / 2 - (top + bottom) / 2)))
    sleeve = Part("take_up_sleeve", "stock", "rigid tube", 1, tube, [Location((ox, 0, (top + bottom) / 2))],
                  spec=f"Rigid round tube, {bore:g} mm bore, about {od:g} mm OD, cut {L:.0f} mm; slot {slot_w:g} mm wide "
                       f"in the rear wall from the top end down {top - slot_z0:.0f} mm",
                  notes=f"Hangs from the outlet socket, open at the bottom. The hose's collar slides {t['stroke_mm']:.0f} mm in it "
                        f"(free hose {t['free_mm'][0]:.0f} to {t['free_mm'][1]:.0f} mm over the elevation and azimuth range). Deburr the bore.")
    cd = bore - 2.0
    tab = 12.0
    collar = Cylinder(cd / 2, p.collar_h_mm) + Box(tab + (od - cd) / 2 + 2.0, slot_w - 2.0, 12.0).moved(
        Location((-(cd / 2 + (tab + (od - cd) / 2 + 2.0) / 2 - 1.0), 0, p.collar_h_mm / 2 - 6.0)))
    sock = 25.0
    collar = collar - Cylinder((p.hose_od + 0.5) / 2, sock).moved(Location((0, 0, -p.collar_h_mm / 2 + sock / 2)))
    funnel_h = p.collar_h_mm - sock
    collar = collar - Cone(p.hose_id / 2, (cd - 6.0) / 2, funnel_h + 0.02).moved(
        Location((0, 0, p.collar_h_mm / 2 - funnel_h / 2 + 0.01)))
    z_collar = oz - t["collar_travel"][0] + p.collar_h_mm / 2
    col = Part("take_up_collar", "print", "PETG", 1, collar, [Location((ox, 0, z_collar))],
               notes=f"Bond the hose's top end {sock:g} mm into the socket. The funnel narrows {cd - 6:g} to {p.hose_id:g} mm so a ball "
                     f"dropping down the sleeve cannot catch the hose's rim. The tab through the sleeve's slot takes the spring's "
                     f"band and keeps the collar from turning. Print funnel up, 6 walls.")
    spring = Part("take_up_spring", "cots", "", 1, Cylinder(25.0, 30.0).moved(Location((0, 0, 0), ROT_Y_AXIS)),
                  [Location((ox - od / 2 - 45.0, 0, top - 35.0))],
                  spec=f"Constant-force spring, {t['spring_n']:g} N (assumed: holds the hose's top end against a {t['spring_n']:g} N "
                       f"hose pull), at least {t['stroke_mm'] + 20:.0f} mm of band, drum on a bracket behind the sleeve")
    return [sleeve, col, spring]


def envelopes(p: Feeder) -> list[Part]:
    out = []
    out.append(Part("hopper_tub", "cots", "", 1, Box(p.tub_l, p.tub_w, p.tub_h).moved(Location((0, 0, p.plate_t + p.tub_h / 2))),
                    [Location((p.shelf_origin[0], 0, p.shelf_origin[1]), (0, p.shelf_slope_deg, 0))],
                    spec=f"Storage tub about {p.tub_l:g} x {p.tub_w:g} x {p.tub_h:g} mm outside; cut a 75 mm hole at the low end "
                         f"over the outlet. Holds about {p.tub_capacity()} balls at {p.packing:g} packing."))
    g = p.head_gap_axis
    wheel = Cylinder(p.wheel_head_d / 2, p.wheel_head_w).moved(Location((0, 0, 0), ROT_Y_AXIS))
    out.append(Part("launcher_wheel", "cots", "", 2, wheel, [_head_loc(p, 0, 0, g), _head_loc(p, 0, 0, -g)],
                    spec=f"{p.wheel_head_d:g} x {p.wheel_head_w:g} mm polyurethane-tread wheel on an 8 mm shaft hub"))
    motor = Cylinder(p.motor_d / 2, p.motor_len).moved(Location((0, 0, 0), ROT_Y_AXIS))
    ym = p.plate_half_y + p.plate_t + p.motor_len / 2
    out.append(Part("launcher_motor", "cots", "", 2, motor, [_head_loc(p, 0, ym, g), _head_loc(p, 0, ym, -g)],
                    spec=f"BLDC outrunner, {p.motor_d:g} mm class, 8 mm shaft, 24 V, ~1 kW peak"))
    so = Cylinder(5.0, 2 * p.plate_half_y).moved(Location((0, 0, 0), ROT_Y_AXIS))
    out.append(Part("head_standoff", "cots", "", 4, so, [_head_loc(p, x, 0, z) for x, z in _standoffs(p)],
                    spec=f"M5 female-female standoff, {2 * p.plate_half_y:g} mm"))
    bearing = Cylinder(p.bearing_d / 2, p.bearing_h).moved(Location((p.head_x, 0, p.mast_top_z + p.plate_t + p.bearing_h / 2)))
    out.append(Part("turntable_bearing", "cots", "", 1, bearing, [Location((0, 0, 0))],
                    spec=f"Lazy-susan bearing, {p.bearing_d:g} mm, {p.bearing_h:g} mm tall, 4 x M5 on a 120 mm circle each ring"))
    sq = 42.3
    out.append(Part("az_stepper", "cots", "", 1, Box(sq, sq, p.stepper_body_mm).moved(Location((0, 0, -p.stepper_body_mm / 2))),
                    [Location((p.head_x, p.az_centre_dist, p.mast_top_z))],
                    spec=f"NEMA 17 stepper, {p.stepper_hold_nm:g} N m holding (17HS4401 class), 5 mm shaft at least 20 mm "
                         f"long, flange up under the mast plate"))
    pin_z0 = p.mast_top_z + p.plate_t + 0.5
    pin_h = p.az_gear_gap_mm + p.az_gear_face_mm + p.plate_t - 0.5
    out.append(Part("az_pinion", "cots", "", 1,
                    Cylinder(p.az_pinion_r - 1.25 * p.az_module, pin_h).moved(Location((0, 0, pin_h / 2))),
                    [Location((p.head_x, p.az_centre_dist, pin_z0))],
                    spec=f"Spur pinion, module {p.az_module:g}, {p.az_pinion_teeth} teeth, 20 deg, 5 mm bore, steel, set screw "
                         f"(drawn at its root circle so the mesh is not a clash)"))
    wheel_b = Cylinder(p.wheel_d / 2, p.wheel_w).moved(Location((0, 0, 0), ROT_Y_AXIS))
    wl = [Location((x, s * p.wheel_y, p.wheel_d / 2)) for x in p.wheel_x for s in (1, -1)]
    out.append(Part("wheel", "cots", "", 4, wheel_b, wl,
                    spec=f"{p.wheel_d:g} x {p.wheel_w:g} mm non-marking wheel, 6 mm D hub (drive) or 8 mm bore (idler)"))
    gm = Cylinder(p.gearmotor_d / 2, p.gearmotor_len).moved(Location((0, 0, 0), ROT_Y_AXIS))
    ygm = p.base_half_w - p.gearmotor_len / 2
    out.append(Part("gearmotor", "cots", "", 2, gm, [Location((p.wheel_x[0], s * ygm, p.wheel_d / 2)) for s in (1, -1)],
                    spec="37 mm gearmotor, 24 V, ~200 rpm, 6 mm D shaft, quadrature encoder"))
    foot = Cylinder(20, p.rail_z).moved(Location((0, 0, p.rail_z / 2)))
    out.append(Part("levelling_foot", "cots", "", 2, foot, [Location((-10, s * p.foot_half_y, 0)) for s in (1, -1)],
                    spec="M10 levelling foot with a 40 mm rubber pad, 155 mm of stud; T-nut in the beam"))
    bx, by, bz = 90.0, 200.0, 130.0
    out.append(Part("battery", "cots", "", 1, Box(bx, by, bz).moved(Location((0, 0, bz / 2))),
                    [Location((BATTERY_X, 0, p.rail_top + p.plate_t))],
                    spec=f"24 V (8S) LiFePO4 20 Ah with BMS, max {bx:g} x {by:g} x {bz:g} mm"))
    return out


def all_parts(p: Feeder) -> list[Part]:
    return [head_motor_plate(p), head_guard_plate(p), trunnion_cheek(p), trunnion_cheek_elev(p), mast_plate(p), turntable_plate(p),
            base_deck(p), wheel_bracket(p, True), wheel_bracket(p, False),
            cheek_foot(p), az_gear_sector(p), pole_foot(p), pole_elbow(p), camera_clamp(p),
            feed_floor(p), feed_roof_column(p), feed_shuttle(p), hopper_shelf(p), hopper_spigot(p), feed_hose(p),
            *take_up_parts(p), *extrusions(p), *poles(p), *envelopes(p), *elev_actuator_parts(p)]


# ---------------------------------------------------------------- elevation actuator

ELEV_ACT_PARTS = ("elev_actuator", "elev_actuator_rod")
ELEV_ROD_R = 5.0
ELEV_EYE_MM = 12.0   # anchor eye centre to the body's end, and rod end to the pin (clevis eyes, assumed)


def _y_cyl(r: float, y0: float, y1: float):
    return Cylinder(r, abs(y1 - y0)).moved(Location((0, (y0 + y1) / 2, 0), ROT_Y_AXIS))


def _seg(r: float, a: tuple[float, float], b: tuple[float, float], y: float):
    """Cylinder of radius r from world (x, z) a to b, in the plane at y."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    h = math.hypot(dx, dz)
    return Cylinder(r, h).moved(Location(((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2), (0, math.degrees(math.atan2(dx, dz)), 0)))


def elev_actuator_shapes(p: Feeder, elev_deg: float) -> list:
    """(body, rod) of the elevation actuator in world coordinates with the head at `elev_deg`. The body runs from its
    anchor eye for the retracted length less both eyes; the rod fills the rest up to the pin's eye."""
    ax, az = elev_anchor_world(p)
    px, pz = p.elev_pin_rel(elev_deg)
    px, pz = p.head_x + px, p.pivot_z + pz
    L = math.hypot(px - ax, pz - az)
    ux, uz = (px - ax) / L, (pz - az) / L
    at = lambda d: (ax + ux * d, az + uz * d)  # noqa: E731
    body_end = p.elev_act_closed - ELEV_EYE_MM
    return [_seg(p.elev_act_r, at(ELEV_EYE_MM), at(body_end), p.elev_act_y),
            _seg(ELEV_ROD_R, at(body_end), at(L - ELEV_EYE_MM), p.elev_act_y)]


def elev_actuator_parts(p: Feeder) -> list[Part]:
    body, rod = elev_actuator_shapes(p, 0.0)
    y_out = p.elev_act_y - 10.0
    y_guard = -(p.plate_half_y + p.plate_t)
    y_cheek = -(p.plate_half_y + p.plate_t + p.cheek_gap + p.plate_t)
    ax, az = elev_anchor_world(p)
    pin = _y_cyl(3.0, y_guard, y_out)
    bolt = _y_cyl(3.0, y_cheek, y_out)
    return [
        Part("elev_actuator", "cots", "", 1, body, [Location((0, 0, 0))],
             spec=f"Linear actuator, 12-24 V, {p.elev_act_stroke:g} mm stroke, {p.elev_act_force_n:g} N class, clevis "
                  f"eyes for M6, retracted {p.elev_act_closed:g} mm hole to hole (drawn at 0 deg; posed per pose in the sweeps)"),
        Part("elev_actuator_rod", "cots", "", 1, rod, [Location((0, 0, 0))], spec="The elev_actuator's own rod (not bought separately), drawn at 0 deg"),
        Part("elev_pin", "cots", "", 1, pin, [_head_loc(p, p.elev_pin_x, 0, p.elev_pin_z)],
             spec="M6 shoulder bolt, 40 mm shoulder, + nyloc: through the guard plate (nut inside), the actuator's rod eye"),
        Part("elev_anchor_bolt", "cots", "", 1, bolt, [Location((ax, 0, az))],
             spec="M6 shoulder bolt, 30 mm shoulder, + nyloc: through the guard-side cheek's tab, the actuator's anchor eye"),
    ]


# ---------------------------------------------------------------- elevation sweep

HEAD_PARTS = {"head_motor_plate", "head_guard_plate", "launcher_wheel", "launcher_motor", "head_standoff",
              "feed_floor", "feed_roof_column", "feed_shuttle", "elev_pin"}


def swept_solids(p: Feeder, elev_deg: float) -> list[tuple[str, object]]:
    """Every placed solid, with the head tilted to `elev_deg` (positive = nose up) about its pivot bolt."""
    axis = Axis((p.head_x, 0.0, p.pivot_z), (0, 1, 0))
    out = []
    posed = dict(zip(ELEV_ACT_PARTS, elev_actuator_shapes(p, elev_deg)))
    for part in all_parts(p):
        for i, s in enumerate(part.placed()):
            if part.name in HEAD_PARTS:
                s = s.rotate(axis, -elev_deg)
            elif part.name in posed:
                s = posed[part.name]
            out.append((f"{part.name}[{i}]", s))
    return out


TURNTABLE_PARTS = HEAD_PARTS | {"turntable_plate", "trunnion_cheek", "trunnion_cheek_elev", "cheek_foot", "az_gear_sector",
                                 "elev_anchor_bolt", *ELEV_ACT_PARTS}
HOSE_PARTS = {"feed_hose", "take_up_sleeve", "take_up_collar", "take_up_spring"}  # the hose bends; checked by the take-up model
COTS_MASS_KG = {"launcher_motor": 0.60, "launcher_wheel": 0.35, "head_standoff": 0.015,
                "elev_actuator": 0.60}  # assumptions: weigh yours


def turned_solids(p: Feeder, elev_deg: float, az_deg: float) -> tuple[list, list]:
    """(moving, fixed) named solids with the head tilted `elev_deg` and the turntable turned `az_deg` about its
    vertical axis. Hose parts are left out: the hose bends with the head, and the take-up model checks it."""
    axis = Axis((p.head_x, 0.0, 0.0), (0, 0, 1))
    moving, fixed = [], []
    for name, s in swept_solids(p, elev_deg):
        base = name.split("[")[0]
        if base in TURNTABLE_PARTS:
            moving.append((name, s.rotate(axis, az_deg)))
        elif base not in HOSE_PARTS:
            fixed.append((name, s))
    return moving, fixed


def turning_inertia(p: Feeder, elev_deg: float = 0.0) -> tuple[float, float]:
    """(inertia kg m^2 about the turntable axis, mass kg) of everything that turns, from the CAD solids. Made parts
    use the package's material densities; bought parts are uniform solids of `COTS_MASS_KG` (assumed masses)."""
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.gp import gp_Ax1, gp_Dir, gp_Pnt

    from .package import DENSITY
    ax = gp_Ax1(gp_Pnt(p.head_x, 0.0, 0.0), gp_Dir(0, 0, 1))
    mats = {part.name: part.material for part in all_parts(p)}
    j = m = 0.0
    for name, s in swept_solids(p, elev_deg):
        base = name.split("[")[0]
        if base not in TURNTABLE_PARTS:
            continue
        g = GProp_GProps()
        BRepGProp.VolumeProperties_s(s.wrapped, g)
        vol, i_unit = g.Mass(), g.MomentOfInertia(ax)      # mm^3, mm^5
        if base in COTS_MASS_KG:
            kg = COTS_MASS_KG[base]
        elif mats.get(base) in DENSITY:
            kg = DENSITY[mats[base]] * vol / 1e6
        else:
            continue
        m += kg
        j += kg / vol * i_unit * 1e-6
    return j, m


def head_moment(p: Feeder, elev_deg: float) -> tuple[float, float]:
    """(nose-up gravity moment N m about the pivot, mass kg) of everything that tilts, from the CAD solids at
    `elev_deg`; same densities and assumed bought-part masses as `turning_inertia`. Positive means the head's weight
    pulls its nose up (its centre of mass is behind the pivot). The actuator's own weight, about half on the pin, is
    left out (a few newtons)."""
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps

    from .package import DENSITY
    mats = {part.name: part.material for part in all_parts(p)}
    m = mx = 0.0
    for name, s in swept_solids(p, elev_deg):
        base = name.split("[")[0]
        if base not in HEAD_PARTS:
            continue
        g = GProp_GProps()
        BRepGProp.VolumeProperties_s(s.wrapped, g)
        vol = g.Mass()
        if base in COTS_MASS_KG:
            kg = COTS_MASS_KG[base]
        elif mats.get(base) in DENSITY:
            kg = DENSITY[mats[base]] * vol / 1e6
        else:
            continue
        m += kg
        mx += kg * (g.CentreOfMass().X() - p.head_x)
    return -mx / 1000 * 9.81, m


def gravity_table(p: Feeder, steps: int = 4) -> dict[float, float]:
    """Nose-up gravity moment (N m) at `steps` + 1 elevations across the range, measured from the CAD."""
    es = [p.elev_min + (p.elev_max - p.elev_min) * i / steps for i in range(steps + 1)]
    return {e: head_moment(p, e)[0] for e in es}


# ---------------------------------------------------------------- BOM extras and summary

def fasteners(p: Feeder) -> list[tuple[str, int, str]]:
    return [
        ("M8 x 110 bolt + nyloc nut + 4 washers", 1, "head pivot through the cheeks"),
        ("M5 female-female standoff, 80 mm", 4, "between the head plates"),
        ("M5 x 12 button head", 4 + 4 + 8 + 10 + 8, "standoffs, mast plate to posts, turntable, deck, brackets"),
        ("M5 T-nut (slot 6)", 10 + 8 + 4 + 4 + 2 + 2, "deck, brackets, feet and mast rails"),
        ("M5 x 16 button head", 8 + 4 + 4, "posts to rails, pole feet"),
        ("M4 x 12 socket cap screw", 4 + 4, "cheek feet to the turntable plate and the cheeks"),
        ("M4 heat-set insert, 5.7 mm long", 4 + 4, "cheek feet"),
        ("M4 x 12 socket cap screw (motors)", 8, "launcher motors to the motor plate"),
        ("M3 x 8 screw", 12, "gearmotor faces"),
        ("M3 x 10 screw", 4, "azimuth stepper to the mast plate (from above)"),
        ("M4 x 12 socket cap screw (azimuth)", 3, "turntable plate down into the gear sector"),
        ("M4 heat-set insert, 5.7 mm long (azimuth)", 3, "gear sector"),
        ("608 bearing, 8 x 22 x 7", 2, "idler wheels"),
        ("M8 x 60 bolt + nyloc nut", 2, "idler axles"),
        ("M10 T-nut (levelling foot)", 2, "beam ends"),
        ("M4 x 12 socket cap screw (feed)", 8, "feed floor and roof to the head plates (through the plates, into inserts)"),
        ("M4 heat-set insert, 5.7 mm long (feed)", 8 + 4, "feed floor, roof and sleeve socket"),
        ("M4 x 10 socket cap screw (spigot)", 4, "sleeve socket to the shelf"),
        ("M5 x 16 button head (hopper)", 4 + 4, "posts to the deck (from below) and to the shelf"),
        ("M5 T-nut or tapped end (hopper)", 8, "posts, deck and shelf"),
        ("2020 corner bracket with M5 screws and T-nuts", 6, "hopper braces, two per brace"),
        ("Hose clamp, 80-90 mm", 1, "hose at the column socket"),
        ("Flexible-PVC adhesive or epoxy", 1, "hose's top end into the take-up collar"),
        ("25 mm strap, 1 m", 2, "tub to the shelf"),
    ]


COTS_EXTRA = [
    ("Raspberry Pi 5 (4 GB)", 1, "vision + planning"),
    ("Global-shutter camera module + cable", 2, "stereo bar"),
    ("ESP32 dev board (ESP32-WROOM-32)", 1, "firmware/esp32, feeder role"),
    ("50 A+ BLDC ESC, servo-pulse input", 2, "launcher wheels"),
    ("Dual DC motor driver, 10 A/ch", 1, "base drive"),
    ("Linear actuator, 12-24 V, 100 mm stroke, 30 N+", 1, "feed shuttle (bracket not modelled yet; clevis pin in the shuttle's rear)"),
    ("Storage tub, about 440 x 340 x 250 mm", 1, "hopper; see the part notes for the cut"),
    ("Stepper driver, 2 A class (TMC2209 or A4988), 24 V", 1, "azimuth stepper"),
    ("TCRT5000 reflective sensor", 2, "wheel tachometers"),
    ("22 mm NC mushroom e-stop + 24 V contactor", 1, "hard power cut"),
    ("Wireless e-stop relay remote, latching", 1, "second cut-off"),
    ("5 V 5 A buck converter", 1, "Pi supply"),
    ("30 A blade fuse + holder", 1, "battery positive"),
    ("Knotless netting, 25-35 mm mesh", 1, "about 3.5 x 3 m"),
    ("Ballast (sand bags or water cells), see manifest", 1, "tip-over margin"),
]


def structure_kg(p: Feeder, mass_g: float) -> float:
    return mass_g / 1000


def hose_end_line(p: Feeder) -> str:
    """Hose check that honours the end directions (outlet straight down, socket along the tilted column)."""
    r = p.hose_pose_ranges()
    bad = [f"{e:+.0f} deg" for e, x in r if x is None]
    if bad:
        return (f"hose with end directions: NO curve at {', '.join(bad)} stays above {p.hose_min_bend:g} mm bend radius "
                f"and {p.feed_min_slope_deg:g} deg fall (known gap: the chord check above ignores this)")
    take = p.hose_take_up_mm()
    fit = "; ".join(f"{e:+.0f} deg {x[0]:.0f}-{x[1]:.0f} mm" for e, x in r)
    return (f"hose with end directions: fits {fit}; "
            + ("one cut length fits every pose" if take <= 0 else
               f"no one cut length fits every pose: needs {take:.0f} mm of take-up ({p.take_up_stroke_mm():.0f} mm of "
               f"travel on a floating pulley, which cannot carry balls: its 180 deg wrap climbs, a ball-carrying hose may wrap "
               f"{p.pulley_wrap_max_deg():.0f} deg at most; limiting nose-up to +30 deg would need "
               f"{dict(p.hose_take_up_by_elev_max())[30.0]:.0f} mm; see take_up_line for the sleeve that replaces it)"))


def take_up_line(p: Feeder) -> str:
    t = p.sleeve_take_up_design()
    if t is None:
        return ("take-up: NO sleeve fits (the outlet is too low for a vertical sleeve plus one falling curve at every pose; "
                "Feeder.lowest_sleeve_outlet finds the height that works)")
    ps = "; ".join(f"{e:+.0f}/{az:.0f} deg {a:.0f}-{b:.0f}" for e, az, a, b in t["poses"])
    return (f"take-up: sleeve {t['sleeve_id_mm']:g} mm bore, {t['tube_mm']:.0f} mm long, under the outlet; the hose's collar "
            f"slides {t['stroke_mm']:.0f} mm in it, so the free hose runs {t['free_mm'][0]:.0f} to {t['free_mm'][1]:.0f} mm "
            f"from {t['start_z']:.0f} mm up; slide allowed per pose (elevation/azimuth, -azimuth mirrors) {ps} mm; hose cut {t['hose_cut_mm']:g} mm; spring "
            f"{t['spring_n']:g} N (assumed); balls fall straight down the sleeve, then at least {p.feed_min_slope_deg:g} deg")


def azimuth_line(p: Feeder, inertia_kgm2: float, load_n: float) -> str:
    d = p.azimuth_drive(inertia_kgm2, load_n)
    return (f"azimuth: NEMA 17 through a {p.az_pinion_teeth}:{p.az_gear_teeth} m{p.az_module:g} mesh ({p.az_ratio:g}:1) to a "
            f"printed sector under the turntable; turning inertia {inertia_kgm2:.4f} kg m^2 from the CAD ({load_n / 9.81:.1f} kg "
            f"turning); {p.az_slew_deg:g} deg in {p.az_slew_s:g} s needs {d['torque_out_nm']:.2f} N m at the turntable "
            f"(inertia {d['torque_inertia_nm']:.2f}, bearing {d['torque_bearing_nm']:.2f}, hose {d['torque_hose_nm']:.2f}) and "
            f"{d['torque_motor_nm']:.3f} N m at {d['motor_rpm']:.0f} rpm at the motor, {d['torque_margin']:.1f}x under the assumed "
            f"{p.stepper_torque_nm:g} N m pull-out (fastest at {p.az_torque_factor:g}x: {d['fastest_slew_s']:.2f} s); "
            f"tooth root {d['tooth_stress_mpa']:.1f} MPa (PETG allowed {p.petg_bend_allow_mpa:g}); one full step "
            f"{d['step_deg']:.3f} deg = {d['step_miss_mm']:.0f} mm sideways at {p.aim_range_m:g} m, backlash "
            f"{d['backlash_deg']:.3f} deg = {d['backlash_miss_mm']:.0f} mm")


def elevation_line(p: Feeder, gravity: dict[float, float]) -> str:
    d = p.elevation_drive(gravity)
    g = [gravity[k] for k in sorted(gravity)]
    return (f"elevation: linear actuator outboard of the guard-side cheek pushes a pin on the guard plate; the head's weight "
            f"(from the CAD) pulls its nose up by {min(g):.2f} to {max(g):.2f} N m over {p.elev_min:+.0f} to {p.elev_max:+.0f} deg, "
            f"so the actuator pushes one way all the way ({d['push_min_n']:.0f} to {d['push_peak_n']:.0f} N, hose slack or "
            f"taut, lever arm at least {d['arm_min_mm']:.0f} mm), {d['force_margin']:.1f}x under the assumed "
            f"{p.elev_act_force_n:g} N rating; pin-to-anchor {d['len_min_mm']:.0f} to {d['len_max_mm']:.0f} mm "
            f"({d['travel_mm']:.0f} mm of travel), so any actuator retracted {d['closed_min_mm']:.1f} to {d['closed_max_mm']:.1f} mm (its own retract "
            f"limit then stops the head short of the turntable plate) and extended at "
            f"least {d['extended_min_mm']:.0f} mm hole to hole fits; at {p.elev_act_speed_mm_s:g} mm/s the head turns "
            f"{d['deg_per_s_min']:.1f} to {d['deg_per_s_max']:.1f} deg/s, the full range in {d['full_sweep_s']:.1f} s")


def summary(p: Feeder, mass_g: float, rules, clash, contacts, ground_ok, hopper_g: float = 0.0,
            turning: tuple[float, float] | None = None, gravity: dict[float, float] | None = None):
    ballast = p.ballast_kg(structure_kg(p, mass_g - hopper_g))
    width = 2 * (p.wheel_y + p.wheel_w / 2)
    chords = p.hose_chords()
    checks = [
        f"design rules: {'pass' if not rules else '; '.join(rules)}",
        f"collisions between parts, with the head at {p.elev_min:+.0f} to {p.elev_max:+.0f} deg elevation, and with it "
        f"turned +-{p.az_max:g} deg at both elevation ends: "
        f"{'none' if not clash else '; '.join(clash)}",
        f"ground contact (wheels and levelling feet at z=0): {'pass' if ground_ok else contacts}",
        f"launcher: wheel gap {p.wheel_gap:g} mm squeezes a {p.ball_d:g} mm ball by {p.ball_d - p.wheel_gap:.0f} mm; "
        f"ball path {p.launch_z:g} mm high; muzzle {p.head_x + p.head_x1:+.0f} mm from the net plane",
        f"feed: shuttle meters one ball ({p.shuttle_h:g} mm tall, {p.feed_stroke:g} mm stroke to the wheels at {p.nip_x:+.0f} mm); "
        f"tub holds about {p.tub_capacity()} balls",
        f"retainer: front narrowed to {p.retain_gap:.1f} mm by two {p.retain_t:g} mm arms; strain {p.retain_arm_strain:.1%}, "
        f"{p.retain_pass_n:.0f} N to pull a ball through against {p.retain_hold_n:.2f} N of ball weight at {p.elev_min:+.0f} deg "
        f"(wheels assumed to pull {p.wheel_pull_n:g} N)",
        f"hose: {p.hose_len:g} mm; chord {min(c for _, c, _ in chords):.0f} to {max(c for _, c, _ in chords):.0f} mm and "
        f"falls at least {min(s for _, _, s in chords):.0f} deg over the elevation range; "
        f"bows to a {p.hose_bow_radius():.0f} mm radius at its closest pose (hose allows {p.hose_min_bend:g})",
        hose_end_line(p),
        take_up_line(p),
        f"hopper frame: full tub {p.hopper_load_n:.0f} N; sway load {p.hopper_side_load_n:.0f} N; braces carry "
        f"{p.brace_force_n('x'):.0f} N (x) and {p.brace_force_n('y'):.0f} N (y) against buckling loads of "
        f"{p.brace_buckling_n('x'):.0f} and {p.brace_buckling_n('y'):.0f} N; a post alone buckles at {p.post_buckling_n():.0f} N "
        f"(pinned ends, 2040 weak axis; section figures are assumptions)",
        f"net: {p.net_w:g} wide x {p.net_top - p.rail_top - 30:g} mm tall between the poles",
        f"wind: {p.wind_force_n:.0f} N on the net at {p.design_wind:g} m/s (solidity {p.net_solidity:g}, Cd {p.drag_coeff:g}); "
        f"ballast needed over the made-part mass (hopper posts, shelf and spigot not credited): {ballast:.0f} kg",
        f"made-part mass (estimate, excludes bought-in parts): {mass_g / 1000:.1f} kg",
    ]
    if turning is not None:
        checks.insert(-3, azimuth_line(p, turning[0], turning[1] * 9.81))
    if gravity is not None:
        checks.insert(-3, elevation_line(p, gravity))
    derived = {"wheel_gap_mm": p.wheel_gap, "ball_squeeze_mm": round(p.ball_d - p.wheel_gap, 1),
               "base_width_mm": round(width), "net_w_mm": p.net_w, "wind_force_n": round(p.wind_force_n, 1),
               "ballast_kg": round(ballast, 1), "hose_len_mm": p.hose_len,
               "hose_bow_radius_mm": round(p.hose_bow_radius()), "hose_cut_mm": (p.sleeve_take_up_design() or {}).get("hose_cut_mm"), "hose_take_up_mm": None if p.hose_take_up_mm() is None else round(p.hose_take_up_mm()), "tub_capacity_balls": p.tub_capacity(), "hopper_load_n": round(p.hopper_load_n), "brace_x_n": round(p.brace_force_n("x")), "brace_y_n": round(p.brace_force_n("y")), "retain_pass_n": round(p.retain_pass_n, 1), "made_part_mass_kg": round(mass_g / 1000, 2)}
    if turning is not None:
        d = p.azimuth_drive(turning[0], turning[1] * 9.81)
        derived.update({"az_inertia_kgm2": round(turning[0], 4), "az_turning_kg": round(turning[1], 2),
                        "az_ratio": p.az_ratio, "az_motor_torque_nm": round(d["torque_motor_nm"], 3),
                        "az_torque_margin": round(d["torque_margin"], 2), "az_fastest_slew_s": round(d["fastest_slew_s"], 2),
                        "az_tooth_stress_mpa": round(d["tooth_stress_mpa"], 2), "az_step_miss_mm": round(d["step_miss_mm"]),
                        "az_hose_torque_nm": round(d["torque_hose_nm"], 3)})
    if gravity is not None:
        e = p.elevation_drive(gravity)
        derived.update({"elev_gravity_nm": {f"{k:+g}": round(v, 2) for k, v in sorted(gravity.items())},
                        "elev_push_peak_n": round(e["push_peak_n"], 1), "elev_force_margin": round(e["force_margin"], 2),
                        "elev_len_mm": [round(e["len_min_mm"], 1), round(e["len_max_mm"], 1)],
                        "elev_closed_max_mm": round(e["closed_max_mm"], 1),
                        "elev_closed_min_mm": round(e["closed_min_mm"], 1),
                        "elev_extended_min_mm": round(e["extended_min_mm"], 1),
                        "elev_full_sweep_s": round(e["full_sweep_s"], 2)})
    return checks, derived
