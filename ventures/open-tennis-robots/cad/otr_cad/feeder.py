"""Feeder + catch net: every fabricated part, generated from `params.Feeder`.

Same three kinds of made part as the collector (laser sheet, printed PETG,
stock cut to length); bought-in parts are envelopes for the collision checks.
Frame: origin on the ground at the middle of the net plane, x to the player,
y along the net, z up. The base rolls along y.

Not modelled yet: the netting and its trough, the hopper and agitator, the
feed tube, the elevation actuator and its bracket, the azimuth drive, and the
cable runs. They are listed in `hardware/feeder-catcher.md`.
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
    return s.sketch


def _standoffs(p: Feeder):
    return [(sx * 95.0, sz * 150.0) for sx in (-1, 1) for sz in (-1, 1)]


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


def envelopes(p: Feeder) -> list[Part]:
    out = []
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
            *extrusions(p), *poles(p), *envelopes(p)]


# ---------------------------------------------------------------- elevation sweep

HEAD_PARTS = {"head_motor_plate", "head_guard_plate", "launcher_wheel", "launcher_motor", "head_standoff"}


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
    ]


COTS_EXTRA = [
    ("Raspberry Pi 5 (4 GB)", 1, "vision + planning"),
    ("Global-shutter camera module + cable", 2, "stereo bar"),
    ("ESP32 dev board (ESP32-WROOM-32)", 1, "firmware/esp32, feeder role"),
    ("50 A+ BLDC ESC, servo-pulse input", 2, "launcher wheels"),
    ("Dual DC motor driver, 10 A/ch", 1, "base drive"),
    ("High-torque servo or linear actuator", 1, "elevation (bracket not modelled yet)"),
    ("Stepper or geared motor for the turntable", 1, "azimuth (drive not modelled yet)"),
    ("Servo, metal gear", 1, "feed gate"),
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


def summary(p: Feeder, mass_g: float, rules, clash, contacts, ground_ok):
    ballast = p.ballast_kg(structure_kg(p, mass_g))
    width = 2 * (p.wheel_y + p.wheel_w / 2)
    checks = [
        f"design rules: {'pass' if not rules else '; '.join(rules)}",
        f"collisions between parts, and with the head at {p.elev_min:+.0f} to {p.elev_max:+.0f} deg elevation: "
        f"{'none' if not clash else '; '.join(clash)}",
        f"ground contact (wheels and levelling feet at z=0): {'pass' if ground_ok else contacts}",
        f"launcher: wheel gap {p.wheel_gap:g} mm squeezes a {p.ball_d:g} mm ball by {p.ball_d - p.wheel_gap:.0f} mm; "
        f"ball path {p.launch_z:g} mm high; muzzle {p.head_x + p.head_x1:+.0f} mm from the net plane",
        f"net: {p.net_w:g} wide x {p.net_top - p.rail_top - 30:g} mm tall between the poles",
        f"wind: {p.wind_force_n:.0f} N on the net at {p.design_wind:g} m/s (solidity {p.net_solidity:g}, Cd {p.drag_coeff:g}); "
        f"ballast needed over the made-part mass: {ballast:.0f} kg",
        f"made-part mass (estimate, excludes bought-in parts): {mass_g / 1000:.1f} kg",
    ]
    derived = {"wheel_gap_mm": p.wheel_gap, "ball_squeeze_mm": round(p.ball_d - p.wheel_gap, 1),
               "base_width_mm": round(width), "net_w_mm": p.net_w, "wind_force_n": round(p.wind_force_n, 1),
               "ballast_kg": round(ballast, 1), "made_part_mass_kg": round(mass_g / 1000, 2)}
    return checks, derived
