"""Feeder + catch net: every fabricated part, generated from `params.Feeder`.

Same three kinds of made part as the collector (laser sheet, printed PETG,
stock cut to length); bought-in parts are envelopes for the collision checks.
Frame: origin on the ground at the middle of the net plane, x to the player,
y along the net, z up. The base rolls along y.

Feed: a column of balls drops into the pocket of a printed shuttle that slides
between the head plates and carries one ball forward to the wheels (its solid
rear shuts the column meanwhile); a hose runs up to a tub on a sloped shelf.

Not modelled yet: the netting and its trough, the hopper agitator, the shuttle
actuator and its bracket, the elevation actuator and its bracket, the azimuth
drive, and the cable runs. They are listed in `hardware/feeder-catcher.md`.
"""

from __future__ import annotations

import math

from build123d import (
    Axis,
    Box,
    BuildSketch,
    Circle,
    Cylinder,
    Location,
    Locations,
    Mode,
    RectangleRounded,
    SlotOverall,
    extrude,
)

from .collector import ROT_XZ, ROT_Y_AXIS, Part, _holes
from .params import Feeder

BATTERY_X = -450.0  # battery centre on the deck


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
        _holes([(-100.0, p.pivot_z_rel)], 8.4)  # elevation link
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


def trunnion_cheek(p: Feeder) -> Part:
    z0 = p.turntable_top
    z1 = p.pivot_z + 25.0
    with BuildSketch() as s:
        with Locations((p.head_x, (z0 + z1) / 2)):
            RectangleRounded(2 * p.cheek_x_half, z1 - z0, 8)
        _holes([(p.head_x, p.pivot_z)], 8.4)
        _holes([(p.head_x + sx * 35.0, z0 + 30.0) for sx in (-1, 1)], 4.4)
    face = s.sketch
    y_in = p.plate_half_y + p.plate_t + p.cheek_gap
    return Part("trunnion_cheek", "laser", "aluminium 5052", 2, extrude(face, p.plate_t),
                [Location((0, y_in + p.plate_t, 0), ROT_XZ), Location((0, -y_in, 0), ROT_XZ)],
                flat=face, thickness=p.plate_t,
                notes="Holds the head's M8 pivot bolt; a printed foot on each cheek bolts it to the turntable plate.")


def mast_plate(p: Feeder) -> Part:
    with BuildSketch() as s:
        with Locations((p.head_x, 0)):
            RectangleRounded(2 * p.post_dx + 60, 2 * p.post_half_y + 80, 10)
        _holes([(x, y) for x, y in _post_xy(p)], 5.5)
        _holes([(p.head_x + x, y) for x, y in _ring(60, 4)], 5.5)
        with Locations((p.head_x, 0)):
            Circle(20, mode=Mode.SUBTRACT)  # cables to the turntable
    face = s.sketch
    return Part("mast_plate", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((0, 0, p.mast_top_z))], flat=face, thickness=p.plate_t,
                notes="Bolts to the end-tapped posts (M5) and to the fixed ring of the turntable bearing.")


def turntable_plate(p: Feeder) -> Part:
    with BuildSketch() as s:
        with Locations((p.head_x, 0)):
            RectangleRounded(2 * p.cheek_x_half + 80, 2 * (p.plate_half_y + p.plate_t + p.cheek_gap + 2 * p.plate_t + 30), 10)
        _holes([(p.head_x + x, y) for x, y in _ring(60, 4, 45)], 5.5)
        _holes([(x, sy * yy) for x, yy in _foot_xy(p) for sy in (-1, 1)], 4.4)
        with Locations((p.head_x, 0)):
            Circle(20, mode=Mode.SUBTRACT)
    face = s.sketch
    z = p.mast_top_z + p.plate_t + p.bearing_h
    return Part("turntable_plate", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((0, 0, z))], flat=face, thickness=p.plate_t,
                notes="Bolts to the rotating ring of the bearing; a servo or stepper drives it (not modelled).")


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
        _holes([(a_o + x, y) for x, y in _ring(48.0, 4, 45)], 4.4)
        with Locations((0, p.tub_w / 2 + 12), (0, -p.tub_w / 2 - 12)):
            SlotOverall(60, 6, mode=Mode.SUBTRACT)  # a 25 mm strap over the tub each side
    face = sk.sketch
    ox, oz = p.shelf_origin
    return Part("hopper_shelf", "laser", "aluminium 5052", 1, extrude(face, p.plate_t),
                [Location((ox, 0, oz), (0, p.shelf_slope_deg, 0))], flat=face, thickness=p.plate_t,
                notes=f"Tub shelf, falls {p.shelf_slope_deg:g} deg toward the net so balls roll to the outlet. "
                      "Posts bolt up through it (M5, end-tapped), the outlet spigot under the outlet hole.")


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


def hopper_spigot(p: Feeder) -> Part:
    flange = Cylinder(55.0, 5.0).moved(Location((0, 0, -2.5)))
    tube = Cylinder((p.hose_od + 8.0) / 2, 45.0).moved(Location((0, 0, -27.5)))
    blk = flange + tube
    blk = blk - Cylinder(80.0 / 2, 60.0).moved(Location((0, 0, -5.0)))
    blk = blk - Cylinder((p.hose_od + 0.5) / 2, 40.0).moved(Location((0, 0, -30.0)))
    for x, y in _ring(48.0, 4, 45):
        blk = blk - Cylinder(2.0, 14).moved(Location((x, y, -4.0)))
    ox, oz = p.hopper_out_x, p.hopper_out_z
    return Part("hopper_spigot", "print", "PETG", 1, blk, [Location((ox, 0, oz), (0, p.shelf_slope_deg, 0))],
                notes="Hose socket under the shelf's outlet hole: M4 heat-set inserts, flange against the shelf. 6 walls.")


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
                              "Brace the four posts before filling the tub (not modelled)."))
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
    return Part("feed_hose", "stock", "flexible hose", 1, Cylinder(p.hose_od / 2, p.hose_len),
                [],  # a hose's pose changes with the head; checked by chord and bow in params, not as a solid
                spec=f"{p.hose_id:g} mm ID smooth-bore flexible hose ({p.hose_od:g} mm OD), cut {p.hose_len:g} mm",
                notes=f"Hopper outlet to the column socket. Longest chord {max(c for _, c, _ in p.hose_chords()):.0f} mm; "
                      f"bows to {p.hose_bow_radius():.0f} mm radius at the closest pose; needs {p.hose_min_bend:g}. "
                      "Hose clips at both sockets (hose clamps, 80-90 mm).")


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
    return [head_motor_plate(p), head_guard_plate(p), trunnion_cheek(p), mast_plate(p), turntable_plate(p),
            base_deck(p), wheel_bracket(p, True), wheel_bracket(p, False),
            cheek_foot(p), pole_foot(p), pole_elbow(p), camera_clamp(p),
            feed_floor(p), feed_roof_column(p), feed_shuttle(p), hopper_shelf(p), hopper_spigot(p), feed_hose(p),
            *extrusions(p), *poles(p), *envelopes(p)]


# ---------------------------------------------------------------- elevation sweep

HEAD_PARTS = {"head_motor_plate", "head_guard_plate", "launcher_wheel", "launcher_motor", "head_standoff",
              "feed_floor", "feed_roof_column", "feed_shuttle"}


def swept_solids(p: Feeder, elev_deg: float) -> list[tuple[str, object]]:
    """Every placed solid, with the head tilted to `elev_deg` (positive = nose up) about its pivot bolt."""
    axis = Axis((p.head_x, 0.0, p.pivot_z), (0, 1, 0))
    out = []
    for part in all_parts(p):
        for i, s in enumerate(part.placed()):
            if part.name in HEAD_PARTS:
                s = s.rotate(axis, -elev_deg)
            out.append((f"{part.name}[{i}]", s))
    return out


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
        ("608 bearing, 8 x 22 x 7", 2, "idler wheels"),
        ("M8 x 60 bolt + nyloc nut", 2, "idler axles"),
        ("M10 T-nut (levelling foot)", 2, "beam ends"),
        ("M4 x 12 socket cap screw (feed)", 8, "feed floor and roof to the head plates (through the plates, into inserts)"),
        ("M4 heat-set insert, 5.7 mm long (feed)", 8 + 4, "feed floor, roof and hopper spigot"),
        ("M4 x 10 socket cap screw (spigot)", 4, "hopper spigot to the shelf"),
        ("M5 x 16 button head (hopper)", 4 + 4, "posts to the deck (from below) and to the shelf"),
        ("M5 T-nut or tapped end (hopper)", 8, "posts, deck and shelf"),
        ("Hose clamp, 80-90 mm", 2, "hose at the spigot and the column socket"),
        ("25 mm strap, 1 m", 2, "tub to the shelf"),
    ]


COTS_EXTRA = [
    ("Raspberry Pi 5 (4 GB)", 1, "vision + planning"),
    ("Global-shutter camera module + cable", 2, "stereo bar"),
    ("ESP32 dev board (ESP32-WROOM-32)", 1, "firmware/esp32, feeder role"),
    ("50 A+ BLDC ESC, servo-pulse input", 2, "launcher wheels"),
    ("Dual DC motor driver, 10 A/ch", 1, "base drive"),
    ("High-torque servo or linear actuator", 1, "elevation (bracket not modelled yet)"),
    ("Linear actuator, 12-24 V, 100 mm stroke, 30 N+", 1, "feed shuttle (bracket not modelled yet; clevis pin in the shuttle's rear)"),
    ("Storage tub, about 440 x 340 x 250 mm", 1, "hopper; see the part notes for the cut"),
    ("Stepper or geared motor for the turntable", 1, "azimuth (drive not modelled yet)"),
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


def summary(p: Feeder, mass_g: float, rules, clash, contacts, ground_ok, hopper_g: float = 0.0):
    ballast = p.ballast_kg(structure_kg(p, mass_g - hopper_g))
    width = 2 * (p.wheel_y + p.wheel_w / 2)
    chords = p.hose_chords()
    checks = [
        f"design rules: {'pass' if not rules else '; '.join(rules)}",
        f"collisions between parts, and with the head at {p.elev_min:+.0f} to {p.elev_max:+.0f} deg elevation: "
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
        f"net: {p.net_w:g} wide x {p.net_top - p.rail_top - 30:g} mm tall between the poles",
        f"wind: {p.wind_force_n:.0f} N on the net at {p.design_wind:g} m/s (solidity {p.net_solidity:g}, Cd {p.drag_coeff:g}); "
        f"ballast needed over the made-part mass (hopper posts, shelf and spigot not credited): {ballast:.0f} kg",
        f"made-part mass (estimate, excludes bought-in parts): {mass_g / 1000:.1f} kg",
    ]
    derived = {"wheel_gap_mm": p.wheel_gap, "ball_squeeze_mm": round(p.ball_d - p.wheel_gap, 1),
               "base_width_mm": round(width), "net_w_mm": p.net_w, "wind_force_n": round(p.wind_force_n, 1),
               "ballast_kg": round(ballast, 1), "hose_len_mm": p.hose_len,
               "hose_bow_radius_mm": round(p.hose_bow_radius()), "tub_capacity_balls": p.tub_capacity(), "retain_pass_n": round(p.retain_pass_n, 1), "made_part_mass_kg": round(mass_g / 1000, 2)}
    return checks, derived
