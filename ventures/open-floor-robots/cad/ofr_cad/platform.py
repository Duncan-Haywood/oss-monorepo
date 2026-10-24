"""Every fabricated part of the platform, generated from `params.Robot`.

Made parts, chosen so a small shop or an online service can make them
with no drawings and no judgement calls:

* laser: flat 2-D profiles (base in aluminium 5052, deck in cast acrylic),
  exported as DXF in true millimetres. No bends, no tapped holes.
* print: FDM parts (PETG), exported as STL, each fits a 220 x 220 mm bed.
* stock: straight lengths cut from rod (a cut list).

Bought-in parts are modelled as envelopes only, so the assembly can be
checked for collisions; they go in the BOM with what to buy.

Fasteners are M3 throughout: 3.4 mm clearance holes in the plates, 4.0 mm
pilot holes for heat-set inserts in printed parts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from build123d import (
    Box,
    BuildSketch,
    Circle,
    Cylinder,
    Location,
    Locations,
    Mode,
    Polygon,
    Rectangle,
    RectangleRounded,
    SlotOverall,
    extrude,
)

from .params import Robot

ROT_Y_AXIS = (90, 0, 0)  # Cylinder along Z -> along y
ROT_X_AXIS = (0, 90, 0)  # Cylinder along Z -> along x
CLEAR = 3.4 / 2           # M3 clearance radius in plates
PILOT = 2.0               # M3 heat-set insert pilot radius in prints


@dataclass
class Part:
    name: str
    kind: str                  # laser | print | stock | cots
    material: str
    qty: int
    shape: object              # one solid in its own frame (for STEP/STL)
    placements: list[Location] = field(default_factory=list)
    flat: object | None = None  # 2-D face for laser parts
    thickness: float | None = None
    spec: str = ""
    notes: str = ""
    lifts: bool = False        # moves with the mop lift

    def placed(self):
        return [self.shape.moved(loc) for loc in self.placements]


def _holes(points, d):
    with Locations(*points):
        Circle(d / 2, mode=Mode.SUBTRACT)


def _polar(r, deg):
    return (r * math.cos(math.radians(deg)), r * math.sin(math.radians(deg)))


def _pilots(solid, points, z0, depth):
    """Vertical insert pilots from z0 upward (depth > 0) or downward (depth < 0)."""
    for x, y in points:
        h = abs(depth)
        zc = z0 + depth / 2
        solid = solid - Cylinder(PILOT, h).moved(Location((x, y, zc)))
    return solid


# ---------------------------------------------------------------- shared geometry

def pod_bolts(p: Robot):
    return [(sx * (p.pod_w / 2 - 4.5), sy * p.pod_y) for sx in (-1, 1) for sy in (-1, 1)]


def caster_points(p: Robot):
    xs = [p.caster_x] + ([p.rear_caster_x] if p.has_rear_caster else [])
    return [(x, sy * 6) for x in xs for sy in (-1, 1)]


def cliff_bolts(p: Robot):
    return [(x + dx, y) for x, y in p.cliff_points() for dx in (-7.5, 7.5)]


def elec_holes(p: Robot):
    ex, ey = p.elec_xy
    w, d = p.elec[0] / 2 - 5, p.elec[1] / 2 - 5
    return [(ex + sx * w, ey + sy * d) for sx in (-1, 1) for sy in (-1, 1)]


def tab_points(p: Robot, tabs):
    return [_polar(144.0, a) for a in tabs]


def housing_bolts(p: Robot):
    x0, x1 = p.housing_x
    hy = p.housing_half_y - 6
    return [(x, sy * hy) for x in (x0 + 5, x1 - 5) for sy in (-1, 1)]


def side_brush_bolts(p: Robot):
    sx, sy = p.side_brush_xy
    return [(sx - 8, sy), (sx + 8, sy)]


def guide_bolts(p: Robot):
    return [(p.mop_cx + dx, sy * p.rod_y) for dx in (-7, 7) for sy in (-1, 1)]


def module_duct_y(p: Robot):
    b = p.bin_box()
    return (b[2] + 8, b[3] - 8)


# ---------------------------------------------------------------- laser parts

def base_plate(p: Robot) -> Part:
    with BuildSketch() as s:
        Circle(p.base_r)
        with Locations((0, p.wheel_y), (0, -p.wheel_y)):
            Rectangle(p.wheel_d + 8, p.wheel_w + 4, mode=Mode.SUBTRACT)
        _holes(pod_bolts(p), 2 * CLEAR)
        _holes(caster_points(p), 2 * CLEAR)
        for x, y in p.cliff_points():
            with Locations((x, y)):
                Rectangle(p.cliff_window, p.cliff_window, mode=Mode.SUBTRACT)
        _holes(cliff_bolts(p), 2 * CLEAR)
        _holes(elec_holes(p), 2 * CLEAR)
        _holes(list(p.posts_xy), 2 * CLEAR)
        _holes(tab_points(p, p.bumper_tabs_deg + tuple(-a for a in p.bumper_tabs_deg)), 2 * CLEAR)
        _holes(tab_points(p, p.skirt_tabs_deg + tuple(-a for a in p.skirt_tabs_deg)), 2 * CLEAR)
        # Battery strap slots and the cable pass-through.
        for y in (-p.battery[1] / 2 - 4, p.battery[1] / 2 + 4):
            with Locations((p.battery_x, y)):
                SlotOverall(30, 5, mode=Mode.SUBTRACT)
        with Locations((8, 0)):
            SlotOverall(24, 10, rotation=90, mode=Mode.SUBTRACT)
        if p.has_vacuum:
            x0, x1, hy = p.slot
            with Locations(((x0 + x1) / 2, 0)):
                Rectangle(x1 - x0, 2 * hy, mode=Mode.SUBTRACT)
            _holes(housing_bolts(p), 2 * CLEAR)
            _holes([p.side_brush_xy], 6.0)
            _holes(side_brush_bolts(p), 2 * CLEAR)
        if p.has_mop:
            _holes([(p.mop_cx, sy * p.rod_y) for sy in (-1, 1)], p.rod_d + 0.6)
            _holes(guide_bolts(p), 2 * CLEAR)
            # Water tube to the pad.
            _holes([(p.module_x1 + 6, (p.tank_box()[2] + p.tank_box()[3]) / 2)], 8.0)
    face = s.sketch
    return Part("base_plate", "laser", "aluminium 5052", 1, extrude(face, p.plate_t), [Location((0, 0, p.base_z))],
                flat=face, thickness=p.plate_t, notes="All holes are clearance holes; no tapping.")


def top_deck(p: Robot) -> Part:
    with BuildSketch() as s:
        Circle(p.deck_r)
        _holes(list(p.posts_xy), 2 * CLEAR)
        # Lidar: M2.5 on a 50 mm square, cable through the middle.
        _holes([(p.lidar_x + dx, dy) for dx in (-25, 25) for dy in (-25, 25)], 2.7)
        _holes([(p.lidar_x, 0)], 14.0)
        # Hatch over the bin / tank: lift the module out from the top.
        x0, x1 = p.module_x0 - 2, p.module_x1 + 2
        with Locations(((x0 + x1) / 2, 0)):
            RectangleRounded(x1 - x0, 2 * p.module_half_y + 4, 8, mode=Mode.SUBTRACT)
        # Stop button (16 mm panel) and status LED.
        _holes([(60, -80)], 16.2)
        _holes([(60, -105)], 5.0)
        # Vents over the electronics.
        for k in range(4):
            with Locations((50 + 12 * k, 75)):
                SlotOverall(30, 5, rotation=90, mode=Mode.SUBTRACT)
    face = s.sketch
    return Part("top_deck", "laser", "cast acrylic", 1, extrude(face, p.deck_t), [Location((0, 0, p.deck_z))],
                flat=face, thickness=p.deck_t, notes="Cast (not extruded) acrylic cuts clean; 3 mm aluminium also works.")


# ---------------------------------------------------------------- printed parts

def _arc_ring(p: Robot, a0, a1, z0, z1):
    R = 2 * p.shell_r
    pts = [(0, 0)] + [_polar(R, a0 + (a1 - a0) * k / 8) for k in range(9)]
    with BuildSketch() as s:
        Circle(p.shell_r)
        Circle(p.shell_r - p.shell_wall, mode=Mode.SUBTRACT)
        Polygon(*pts, mode=Mode.INTERSECT, align=None)
    return extrude(s.sketch, z1 - z0).moved(Location((0, 0, z0)))


def _tab(p: Robot, deg, slot: bool):
    r_mid = (p.tab_r0 + p.shell_r - p.shell_wall + 1) / 2
    length = p.shell_r - p.shell_wall + 1 - p.tab_r0
    z0 = p.base_top + p.tab_gap
    with BuildSketch() as s:
        with Locations(Location((*_polar(r_mid, deg), 0), (0, 0, deg))):
            Rectangle(length, p.tab_w)
        if slot:
            # Radial slot: the bumper slides in by bumper_travel when it hits something.
            with Locations(Location((*_polar(144.0 + p.bumper_travel / 2, deg), 0), (0, 0, deg))):
                SlotOverall(2 * CLEAR + p.bumper_travel, 2 * CLEAR, mode=Mode.SUBTRACT)
    tab = extrude(s.sketch, p.tab_t).moved(Location((0, 0, z0)))
    if not slot:
        tab = _pilots(tab, [_polar(144.0, deg)], z0, p.tab_t)
    return tab


def shell_quarter(p: Robot, name, a0, a1, tabs, slot) -> Part:
    solid = _arc_ring(p, a0, a1, p.shell_z0, p.shell_z1)
    for t in tabs:
        solid = solid + _tab(p, t, slot)
    note = ("Bumper: rides on M3 shoulder screws in radial slots, sprung outward; two microswitches behind it."
            if slot else "Fixed skirt: M3 into heat-set inserts in the tabs.")
    return Part(name, "print", "PETG", 1, solid, [Location((0, 0, 0))], notes=note)


def shells(p: Robot) -> list[Part]:
    b, k = p.bumper_tabs_deg, p.skirt_tabs_deg
    return [shell_quarter(p, "bumper_left", 1.0, 89.0, b, True),
            shell_quarter(p, "bumper_right", -89.0, -1.0, tuple(-a for a in b), True),
            shell_quarter(p, "skirt_left", 91.0, 179.0, k, False),
            shell_quarter(p, "skirt_right", -179.0, -91.0, tuple(-a for a in k), False)]


def wheel_pods(p: Robot) -> list[Part]:
    """Pillow-block clamp round the gearbox: cradle (on the base) + cap."""
    z0, zc = p.base_top, p.axle_z
    top = zc + p.motor_d / 2 + p.pod_wall
    bore = Cylinder(p.motor_d / 2 + 0.2, p.pod_len + 2).moved(Location((0, 0, zc), ROT_Y_AXIS))
    cradle = Box(p.pod_w, p.pod_len, zc - z0).moved(Location((0, 0, (zc + z0) / 2))) - bore
    cap = Box(p.pod_w, p.pod_len, top - zc).moved(Location((0, 0, (top + zc) / 2))) - bore
    bx = p.pod_w / 2 - 4.5
    cap_bolts = [(sx * bx, sy * 10) for sx in (-1, 1) for sy in (-1, 1)]
    for x, y in cap_bolts:
        cap = cap - Cylinder(CLEAR, 60).moved(Location((x, y, zc)))
    cradle = _pilots(cradle, cap_bolts, zc, -8)
    cradle = _pilots(cradle, [(sx * bx, 0) for sx in (-1, 1)], z0, 8)
    locs = [Location((0, p.pod_y, 0)), Location((0, -p.pod_y, 0))]
    note = "M3 heat-set inserts: two underneath (to the base), four on top (cap bolts)."
    return [Part("wheel_pod_cradle", "print", "PETG", 2, cradle, locs, notes=note),
            Part("wheel_pod_cap", "print", "PETG", 2, cap, locs, notes="M3 x 20 through the cap into the cradle.")]


def caster_spacers(p: Robot) -> Part:
    h = p.base_z - p.caster_height
    blk = Box(p.caster_pad, p.caster_pad, h).moved(Location((0, 0, h / 2)))
    blk = _pilots(blk, [(0, -6), (0, 6)], h, -h)
    xs = [p.caster_x] + ([p.rear_caster_x] if p.has_rear_caster else [])
    return Part("caster_spacer", "print", "PETG", len(xs), blk,
                [Location((x, 0, p.caster_height)) for x in xs],
                notes="Between base and ball caster; drill the caster's own pattern through if it differs.")


def cliff_mounts(p: Robot) -> Part:
    h = 10.0
    w = p.cliff_window - 1.6
    blk = Box(22, 12, h).moved(Location((0, 0, h / 2))) - Box(w, w, h).moved(Location((0, 0, h / 2)))
    blk = _pilots(blk, [(-7.5, 0), (7.5, 0)], 0, 8)
    pts = p.cliff_points()
    return Part("cliff_sensor_mount", "print", "PETG", len(pts), blk,
                [Location((x, y, p.base_top)) for x, y in pts],
                notes="Holds a downward IR module over the base window; black PETG cuts stray light.")


def deck_posts(p: Robot) -> Part:
    h = p.deck_z - p.base_top
    post = Cylinder(p.post_d / 2, h).moved(Location((0, 0, h / 2)))
    post = _pilots(post, [(0, 0)], 0, 8)
    post = _pilots(post, [(0, 0)], h, -8)
    return Part("deck_post", "print", "PETG", len(p.posts_xy), post,
                [Location((x, y, p.base_top)) for x, y in p.posts_xy], notes="Inserts at both ends.")


def nozzle_housing(p: Robot) -> Part:
    x0, x1 = p.housing_x
    z0, z1 = p.base_top, p.base_top + p.housing_h
    hy = p.housing_half_y
    blk = Box(x1 - x0, 2 * hy, z1 - z0).moved(Location(((x0 + x1) / 2, 0, (z0 + z1) / 2)))
    sx0, sx1, shy = p.slot
    cav_r = p.roller_d / 2 + p.nozzle_clear
    blk = blk - Cylinder(cav_r, 2 * shy).moved(Location((p.roller_x, 0, p.roller_z), ROT_Y_AXIS))
    blk = blk - Box(sx1 - sx0, 2 * shy, cav_r).moved(Location((p.roller_x, 0, z0 + cav_r / 2 - 0.01)))
    dy0, dy1 = module_duct_y(p)
    blk = blk - Box(p.roller_x - x0 + 1, dy1 - dy0, 20).moved(
        Location(((x0 - 1 + p.roller_x) / 2, (dy0 + dy1) / 2, z0 + 19)))
    blk = _pilots(blk, housing_bolts(p), z0, 8)
    return Part("nozzle_housing", "print", "PETG", 1, blk, [Location((0, 0, 0))],
                notes="Over the base slot; duct to the bin at the back. Foam gasket between duct and bin.")


def side_brush_mount(p: Robot) -> Part:
    h = 12.0
    blk = Cylinder(12, h).moved(Location((0, 0, h / 2))) - Cylinder(3.2, h).moved(Location((0, 0, h / 2)))
    blk = _pilots(blk, [(-8, 0), (8, 0)], 0, 8)
    sx, sy = p.side_brush_xy
    return Part("side_brush_mount", "print", "PETG", 1, blk, [Location((sx, sy, p.base_top))],
                notes="N20 gearmotor on top, shaft down through the base to the brush hub.")


def _open_box(x0, x1, y0, y1, z0, h, wall, closed=False):
    outer = Box(x1 - x0, y1 - y0, h).moved(Location(((x0 + x1) / 2, (y0 + y1) / 2, z0 + h / 2)))
    ih = h - wall if not closed else h - 2 * wall
    inner = Box(x1 - x0 - 2 * wall, y1 - y0 - 2 * wall, ih).moved(
        Location(((x0 + x1) / 2, (y0 + y1) / 2, z0 + wall + ih / 2 + (0.01 if not closed else 0))))
    return outer - inner


def dust_bin(p: Robot) -> list[Part]:
    x0, x1, y0, y1 = p.bin_box()
    z0 = p.base_top
    body_h = p.bin_h - 2.0
    body = _open_box(x0, x1, y0, y1, z0, body_h, p.module_wall)
    dy0, dy1 = module_duct_y(p)
    body = body - Box(4 * p.module_wall, dy1 - dy0, 20).moved(Location((x1, (dy0 + dy1) / 2, z0 + 19)))
    lid = Box(x1 - x0, y1 - y0, 2.0).moved(Location(((x0 + x1) / 2, (y0 + y1) / 2, z0 + body_h + 1)))
    lid = lid - Cylinder(p.fan_d / 2 - 6, 4).moved(Location(((x0 + x1) / 2, (y0 + y1) / 2, z0 + body_h + 1)))
    note = "Lifts out through the deck hatch with the fan; a magnet in the wall trips the bin reed switch."
    return [Part("dust_bin", "print", "PETG", 1, body, [Location((0, 0, 0))], notes=note),
            Part("bin_lid", "print", "PETG", 1, lid, [Location((0, 0, 0))],
                 notes="Filter pad sits under the lid; fan screws on top.")]


def water_tank(p: Robot) -> Part:
    x0, x1, y0, y1 = p.tank_box()
    z0 = p.base_top
    tank = _open_box(x0, x1, y0, y1, z0, p.tank_h, p.module_wall, closed=True)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    tank = tank - Cylinder(9, 4).moved(Location((cx, cy, z0 + p.tank_h - 1)))       # fill cap
    tank = tank - Cylinder(2.5, 4).moved(Location((x1, cy, z0 + 5), ROT_X_AXIS))    # outlet barb
    return Part("water_tank", "print", "PETG", 1, tank, [Location((0, 0, 0))],
                notes="Print with 4 walls and 100% top/bottom; check it holds water before fitting. Float switch inside.")


def mop_plate(p: Robot) -> Part:
    x0, x1, hy = p.mop_x0, p.mop_x1, p.mop_half_y
    z0 = p.plate_z
    blk = Box(x1 - x0, 2 * hy, p.plate_th).moved(Location(((x0 + x1) / 2, 0, z0 + p.plate_th / 2)))
    d, L = p.erm
    pocket = Box(d + 1, L + 2, p.plate_th - 1).moved(Location((p.mop_cx, 0, z0 + 1 + (p.plate_th - 1) / 2 + 0.01)))
    blk = blk - pocket
    for sy in (-1, 1):
        blk = blk - Cylinder(p.rod_d / 2, 6).moved(Location((p.mop_cx, sy * p.rod_y, p.plate_top - 3 + 0.01)))
    for y in (-40, 0, 40):
        blk = blk - Cylinder(1.0, p.plate_th + 2).moved(Location((x1 - 8, y, z0 + p.plate_th / 2)))
    return Part("mop_plate", "print", "PETG", 1, blk, [Location((0, 0, 0))], lifts=True,
                notes="Pad attaches with hook-and-loop; vibration motor glued in the pocket; three drip holes at the front.")


def guide_blocks(p: Robot) -> Part:
    h = 30.0
    blk = Box(20, 20, h).moved(Location((0, 0, h / 2))) - Cylinder(p.rod_d / 2 + 0.2, h).moved(Location((0, 0, h / 2)))
    blk = _pilots(blk, [(-7, 0), (7, 0)], 0, 8)
    return Part("lift_guide", "print", "PETG", 2, blk,
                [Location((p.mop_cx, sy * p.rod_y, p.base_top)) for sy in (-1, 1)],
                notes="Guide rod slides in the bore; the servo horn lifts a collar on the rod.")


# ---------------------------------------------------------------- stock

def guide_rods(p: Robot) -> Part:
    rod = Cylinder(p.rod_d / 2, p.rod_len).moved(Location((0, 0, p.rod_len / 2)))
    z0 = p.plate_top - 6
    return Part("guide_rod", "stock", "stainless rod", 2, rod,
                [Location((p.mop_cx, sy * p.rod_y, z0)) for sy in (-1, 1)], lifts=True,
                spec=f"{p.rod_d:g} mm stainless rod, cut {p.rod_len:g} mm", notes="Press into the pad plate.")


# ---------------------------------------------------------------- bought-in envelopes

def envelopes(p: Robot) -> list[Part]:
    out = []
    motor = Cylinder(p.motor_d / 2, p.motor_len).moved(Location((0, 0, 0), ROT_Y_AXIS))
    y = p.motor_face_y - p.motor_len / 2
    out.append(Part("gearmotor", "cots", "", 2, motor, [Location((0, y, p.axle_z)), Location((0, -y, p.axle_z))],
                    spec="25 mm gearmotor, 12 V, ~130 rpm, with Hall encoder (JGA25-370 class)"))
    wheel = Cylinder(p.wheel_d / 2, p.wheel_w).moved(Location((0, 0, 0), ROT_Y_AXIS))
    out.append(Part("wheel", "cots", "", 2, wheel,
                    [Location((0, p.wheel_y, p.axle_z)), Location((0, -p.wheel_y, p.axle_z))],
                    spec=f"{p.wheel_d:g} x {p.wheel_w:g} mm rubber-tyred wheel + 4 mm D hub"))
    caster = Cylinder(p.caster_r, p.caster_height).moved(Location((0, 0, p.caster_height / 2)))
    xs = [p.caster_x] + ([p.rear_caster_x] if p.has_rear_caster else [])
    out.append(Part("ball_caster", "cots", "", len(xs), caster, [Location((x, 0, 0)) for x in xs],
                    spec=f"ball caster, {p.caster_height:g} mm mounting height, two holes 12 mm apart"))
    bx, by, bz = p.battery
    out.append(Part("battery", "cots", "", 1, Box(bx, by, bz).moved(Location((0, 0, bz / 2))),
                    [Location((p.battery_x, 0, p.base_top))],
                    spec=f"4S2P 18650 Li-ion pack with 4S BMS and thermistor, max {bx:g} x {by:g} x {bz:g} mm"))
    ex, ey, ez = p.elec
    stand = 6.0
    out.append(Part("electronics_carrier", "cots", "", 1, Box(ex, ey, ez).moved(Location((0, 0, ez / 2))),
                    [Location((*p.elec_xy, p.base_top + stand))],
                    spec="perfboard carrier: Pi Zero 2 W, ESP32-S3, 2 x DRV8871, PCA9685, 5 V buck"))
    out.append(Part("standoff", "cots", "", 4, Cylinder(2.5, stand).moved(Location((0, 0, stand / 2))),
                    [Location((x, y, p.base_top)) for x, y in elec_holes(p)], spec="M3 x 6 mm nylon standoff"))
    sensor = Box(6, 6, 10).moved(Location((0, 0, 5)))
    out.append(Part("cliff_sensor", "cots", "", len(p.cliff_points()), sensor,
                    [Location((x, y, p.base_top)) for x, y in p.cliff_points()],
                    spec="TCRT5000-class IR reflective module with comparator (digital out)"))
    out.append(Part("lidar", "cots", "", 1, Cylinder(p.lidar_d / 2, p.lidar_h).moved(Location((0, 0, p.lidar_h / 2))),
                    [Location((p.lidar_x, 0, p.deck_top))],
                    spec="360-degree robot-vacuum lidar (LDS class, UART, ~5 V)"))
    if p.has_vacuum:
        out.append(Part("roller_brush", "cots", "", 1,
                        Cylinder(p.roller_d / 2, p.roller_len).moved(Location((0, 0, 0), ROT_Y_AXIS)),
                        [Location((p.roller_x, 0, p.roller_z))],
                        spec=f"{p.roller_d:g} mm x {p.roller_len:g} mm bristle/rubber roller, end bearings"))
        out.append(Part("brush_motor", "cots", "", 1,
                        Cylinder(12.5, 45).moved(Location((0, 0, 0), ROT_Y_AXIS)),
                        [Location((p.roller_x, -35, p.base_top + p.housing_h + 12.5))],
                        spec="25 mm 12 V DC motor + GT2 belt to the roller"))
        sx0, sx1, shy = p.slot
        lip_h = p.base_z - p.nozzle_lip_gap
        lip = Box(2, 2 * (shy - 3), lip_h).moved(Location((0, 0, lip_h / 2)))
        out.append(Part("nozzle_lip", "cots", "", 2, lip,
                        [Location((sx0 - 1, 0, p.nozzle_lip_gap)), Location((sx1 + 1, 0, p.nozzle_lip_gap))],
                        spec=f"silicone strip 2 x {lip_h:g} mm, cut {2 * (shy - 3):g} mm, glued to the slot edges"))
        sx, sy = p.side_brush_xy
        out.append(Part("side_brush_motor", "cots", "", 1, Cylinder(6, 30).moved(Location((0, 0, 15))),
                        [Location((sx, sy, p.base_top + 12))], spec="N20 gearmotor, 12 V, ~100 rpm"))
        out.append(Part("side_brush_hub", "cots", "", 1, Cylinder(10, 10).moved(Location((0, 0, 5))),
                        [Location((sx, sy, p.base_z - 10))], spec="robot-vacuum side brush hub"))
        out.append(Part("side_brush_sweep", "cots", "", 1,
                        Cylinder(p.side_brush_r, 3).moved(Location((0, 0, 1.5))),
                        [Location((sx, sy, 1))], spec=f"side brush, {2 * p.side_brush_r:g} mm sweep"))
        b = p.bin_box()
        out.append(Part("fan", "cots", "", 1, Cylinder(p.fan_d / 2, p.fan_h).moved(Location((0, 0, p.fan_h / 2))),
                        [Location(((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, p.base_top + p.bin_h))],
                        spec=f"{p.fan_d:g} mm brushless vacuum fan, 12-14 V, PWM speed input, ~2,500 Pa shut-off"))
    if p.has_mop:
        px, py, pz = p.pump
        pump_at = (p.roller_x, 35, p.base_top + p.housing_h) if p.variant == "combo" else (-50, 0, p.base_top)
        out.append(Part("pump", "cots", "", 1, Box(px, py, pz).moved(Location((0, 0, pz / 2))),
                        [Location(pump_at)], spec="12 V peristaltic pump, ~20 ml/min, 2 x 4 mm tube"))
        x0, x1, hy = p.mop_x0, p.mop_x1, p.mop_half_y
        out.append(Part("mop_pad", "cots", "", 1, Box(x1 - x0, 2 * hy, p.pad_t).moved(Location((0, 0, p.pad_t / 2))),
                        [Location(((x0 + x1) / 2, 0, 0))], lifts=True,
                        spec=f"microfibre pad {x1 - x0:g} x {2 * hy:g} mm with hook-and-loop backing (buy several)"))
        d, L = p.erm
        out.append(Part("vibration_motor", "cots", "", 1, Cylinder(d / 2, L).moved(Location((0, 0, 0), ROT_Y_AXIS)),
                        [Location((p.mop_cx, 0, p.plate_z + 1 + d / 2))], lifts=True,
                        spec=f"{d:g} x {L:g} mm eccentric-mass vibration motor, 3 V"))
        servo = Box(23, 12, 29).moved(Location((0, 0, 14.5)))
        out.append(Part("lift_servo", "cots", "", 2, servo,
                        [Location((p.mop_cx - 22, sy * p.rod_y, p.base_top)) for sy in (-1, 1)],
                        spec="9 g micro servo (SG90 class), metal gears preferred"))
    return out


def all_parts(p: Robot) -> list[Part]:
    parts = [base_plate(p), top_deck(p), *shells(p), *wheel_pods(p), caster_spacers(p), cliff_mounts(p),
             deck_posts(p)]
    if p.has_vacuum:
        parts += [nozzle_housing(p), side_brush_mount(p), *dust_bin(p)]
    if p.has_mop:
        parts += [water_tank(p), mop_plate(p), guide_blocks(p), guide_rods(p)]
    return parts + envelopes(p)
