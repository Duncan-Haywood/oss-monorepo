"""Mower: every fabricated part, generated from `params.Mower`.

Three kinds of made part, chosen so a small shop or an online service can
make them with no drawings and no judgement calls:

* laser: flat 2-D profiles cut from sheet (aluminium 5052), exported as DXF
  in true millimetres. No bends, no tapped holes, no tolerance callouts.
* print: FDM parts in ASA (it takes sun and rain better than PETG), exported
  as STL, each sized to fit a 256 mm printer bed.
* stock: straight lengths cut from rod or tube (a cut list).

Bought-in parts are modelled as envelopes only, so the assembly can be
checked for collisions; they go in the BOM with what to buy. Rotating parts
(blade disc, blades, hub, blade motor can) are modelled as their swept
envelope plus a running clearance, so "no collision" means "nothing touches
anything that spins".
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
    Rectangle,
    RectangleRounded,
    SlotOverall,
    extrude,
)

from .params import Mower

ROT_Y_AXIS = (90, 0, 0)  # Cylinder along Z -> along y

ASA = "ASA"
AL = "aluminium 5052"


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
    spec: str = ""             # stock size, or what to buy
    notes: str = ""
    group: str = "fixed"       # fixed | rotating | shell (moves together on a bump)

    def placed(self):
        return [self.shape.moved(loc) for loc in self.placements]


def _holes(points, d):
    with Locations(*points):
        Circle(d / 2, mode=Mode.SUBTRACT)


def _square(cx, cy, half):
    return [(cx + dx, cy + dy) for dx in (-half, half) for dy in (-half, half)]


# ---------------------------------------------------------------- hole patterns (shared by mating parts)

def clamp_holes(p: Mower):
    y_mid = p.motor_face_y - p.clamp_len / 2
    return [(sx * 22, sy * y_mid) for sx in (-1, 1) for sy in (-1, 1)]


def post_holes(p: Mower):
    return [h for x, y in p.post_xy for h in _square(x, y, 14)]


def tray_corners(p: Mower):
    return [(x, y) for x in (p.tray_x0 + 8, p.tray_x1 - 8) for y in (-p.tray_half_w + 8, p.tray_half_w - 8)]


def guard_tab_holes(p: Mower):
    r = p.guard_r_in - p.guard_tab_depth / 2
    return [(p.blade_x + r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a in p.guard_tab_angles]


def contact_holes(p: Mower):
    return [(p.contact_x + dx, dy) for dx in (-10, 10) for dy in (-35, 35)]


def mast_holes(p: Mower):
    return _square(p.mast_x, p.mast_y, 13)


# ---------------------------------------------------------------- laser parts

def chassis_plate(p: Mower) -> Part:
    L = p.chassis_x1 - p.chassis_x0
    cx = (p.chassis_x0 + p.chassis_x1) / 2
    with BuildSketch() as s:
        with Locations((cx, 0)):
            RectangleRounded(L, 2 * p.chassis_half_w, p.corner_r)
        _holes(clamp_holes(p), 4.4)
        _holes(post_holes(p), 4.4)
        _holes(tray_corners(p), 3.4)
        _holes(guard_tab_holes(p), 4.4)
        _holes(contact_holes(p), 4.4)
        _holes(p.rod_points(), p.rod_d + 0.4)
        # Caster stems (M8, flanged bushing).
        _holes([(p.caster_x, sy * p.caster_y) for sy in (-1, 1)], 8.4)
        # Blade motor passes up through the plate.
        with Locations((p.blade_x, 0)):
            Circle(p.blade_motor_d / 2 + 7, mode=Mode.SUBTRACT)
        # Battery strap slots (25 mm strap).
        for x in (p.battery_x - p.battery[0] / 2 - 8, p.battery_x + p.battery[0] / 2 + 8):
            with Locations((x, 0)):
                SlotOverall(30, 6, rotation=90, mode=Mode.SUBTRACT)
        # Cable pass-throughs: drive motors, casters' side, blade motor phase leads.
        with Locations((-50, 0), (300, 0)):
            SlotOverall(50, 16, mode=Mode.SUBTRACT)
    face = s.sketch
    return Part("chassis_plate", "laser", AL, 1, extrude(face, p.plate_t), [Location((0, 0, p.chassis_z))],
                flat=face, thickness=p.plate_t, notes="All holes are clearance holes; no tapping.")


def height_plate(p: Mower, h: float) -> Part:
    """Blade motor mount: a disc with three lobes on the threaded rods. Its height sets the cut."""
    with BuildSketch() as s:
        Circle(p.height_plate_r)
        for x, y in p.rod_points():
            dx, dy = x - p.blade_x, y
            a = math.degrees(math.atan2(dy, dx))
            mid = (p.height_plate_r + p.rod_r) / 2 - 6
            with Locations(Location((mid * math.cos(math.radians(a)), mid * math.sin(math.radians(a)), 0), (0, 0, a))):
                Rectangle(p.rod_r - mid, 2 * p.lobe_r)
            with Locations((dx, dy)):
                Circle(p.lobe_r)
        _holes([(x - p.blade_x, y) for x, y in p.rod_points()], p.rod_d + 0.4)
        Circle(7.0, mode=Mode.SUBTRACT)  # shaft
        # Outrunner mount: M3 on a 30 mm square (check your motor's pattern), plus a vent ring.
        _holes(_square(0, 0, 15), 3.4)
        _holes([(45 * math.cos(math.radians(60 * i + 30)), 45 * math.sin(math.radians(60 * i + 30))) for i in range(6)], 8.0)
    face = s.sketch
    return Part("height_plate", "laser", AL, 1, extrude(face, p.height_plate_t),
                [Location((p.blade_x, 0, p.plate_z(h)))], flat=face, thickness=p.height_plate_t,
                notes=f"Two M6 nuts per rod set the cut height ({p.cut_min:g}-{p.cut_max:g} mm); "
                      "the printed height gauge sets all three rods equal.")


def blade_disc(p: Mower) -> Part:
    with BuildSketch() as s:
        Circle(p.disc_r)
        Circle(4.2, mode=Mode.SUBTRACT)  # hub centre spigot clearance
        _holes([(12 * math.cos(math.radians(120 * i)), 12 * math.sin(math.radians(120 * i))) for i in range(3)], 4.4)
        _holes([(p.blade_pivot_r * math.cos(math.radians(120 * i + 60)), p.blade_pivot_r * math.sin(math.radians(120 * i + 60)))
                 for i in range(p.n_blades)], 3.4)
        # Lightening holes between the blades.
        _holes([(55 * math.cos(math.radians(120 * i)), 55 * math.sin(math.radians(120 * i))) for i in range(3)], 34.0)
    face = s.sketch
    return Part("blade_disc", "laser", AL, 1, extrude(face, p.disc_t), [], flat=face, thickness=p.disc_t,
                notes="Balance it: spin on a pin and file the heavy side. M3 shoulder screws for the blades.",
                group="rotating")


def electronics_tray(p: Mower) -> Part:
    cx = (p.tray_x0 + p.tray_x1) / 2
    with BuildSketch() as s:
        with Locations((cx, 0)):
            RectangleRounded(p.tray_x1 - p.tray_x0, 2 * p.tray_half_w, 8)
        _holes(tray_corners(p), 3.4)
        _holes(mast_holes(p), 4.4)
        # Raspberry Pi 4/5: M2.5 on 58 x 49 mm.
        px, py = p.tray_x0 + 20, -p.tray_half_w + 25
        _holes([(px + dx, py + dy) for dx in (0, 58) for dy in (0, 49)], 2.7)
        # Universal M3 grid (10 mm pitch) for the ESP32 carrier, drivers, ESC, GNSS board, buck converters.
        grid = [(x, y) for x in range(int(p.tray_x0 + 95), int(p.tray_x1 - 60), 10)
                for y in range(int(-p.tray_half_w + 15), int(p.tray_half_w - 15), 10)]
        _holes(grid, 3.2)
    face = s.sketch
    return Part("electronics_tray", "laser", AL, 1, extrude(face, p.tray_t), [Location((0, 0, p.tray_z))],
                flat=face, thickness=p.tray_t, notes="Pi on M2.5 x 58x49; other boards on the 10 mm M3 grid.")


# ---------------------------------------------------------------- printed parts

def motor_clamp(p: Mower) -> list[Part]:
    """Pillow-block clamp for a drive gearmotor: cradle (bolted to the chassis) + cap."""
    w = 60.0
    bore = p.motor_d + 0.4
    z0, zc = p.chassis_top, p.axle_z
    top = zc + p.motor_d / 2 + p.clamp_wall
    cradle = Box(w, p.clamp_len, zc - z0).moved(Location((0, 0, (zc + z0) / 2)))
    cap = Box(w, p.clamp_len, top - zc).moved(Location((0, 0, (top + zc) / 2)))
    hole = Cylinder(bore / 2, p.clamp_len + 2).moved(Location((0, 0, zc), ROT_Y_AXIS))
    cradle, cap = cradle - hole, cap - hole
    for sx in (-1, 1):
        for sy in (-1, 1):
            b = Cylinder(2.2, 400).moved(Location((sx * 22, sy * 12, 0)))
            cradle, cap = cradle - b, cap - b
    for sx in (-1, 1):
        cradle = cradle - Cylinder(2.0, 12).moved(Location((sx * 22, 0, z0 + 6)))  # insert pilots
    y_mid = p.motor_face_y - p.clamp_len / 2
    locs = [Location((0, y_mid, 0)), Location((0, -y_mid, 0))]
    note = "ASA, 4 walls, 40% infill. M4 heat-set inserts in the cradle; M4x50 through the cap."
    return [Part("motor_clamp_cradle", "print", ASA, 2, cradle, locs, notes=note),
            Part("motor_clamp_cap", "print", ASA, 2, cap, locs, notes=note)]


def wheel_hub(p: Mower) -> Part:
    t = p.wheel_y - p.wheel_w / 2 - (p.motor_face_y + p.hub_gap)
    hub = Cylinder(p.hub_d / 2, t).moved(Location((0, 0, 0)))
    hub = hub - Cylinder(3.1, t + 2)
    for i in range(4):
        a = math.radians(90 * i + 45)
        hub = hub - Cylinder(2.2, t + 2).moved(Location((16 * math.cos(a), 16 * math.sin(a), 0)))
    y = p.motor_face_y + p.hub_gap + t / 2
    return Part("wheel_hub", "print", ASA, 2, hub,
                [Location((0, y, p.axle_z), (-90, 0, 0)), Location((0, -y, p.axle_z), (90, 0, 0))],
                notes="6 mm D bore with an M3 grub screw insert; four M4 to the wheel. Check your wheel's bolt circle.")


def caster_fork(p: Mower) -> Part:
    r = p.caster_wheel_d / 2
    top_z1 = p.chassis_z - p.caster_washer
    top_z0 = top_z1 - 10
    leg_in = p.caster_wheel_w / 2 + 3
    leg_t = 6.0
    half = leg_in + leg_t
    top = Box(40, 2 * half, 10).moved(Location((0, 0, (top_z0 + top_z1) / 2)))
    legs = []
    x0, x1 = -p.caster_trail - 12, 14
    z0 = r - 12
    for sy in (-1, 1):
        legs.append(Box(x1 - x0, leg_t, top_z1 - z0).moved(Location(((x0 + x1) / 2, sy * (leg_in + leg_t / 2), (z0 + top_z1) / 2))))
    fork = top + legs[0] + legs[1]
    fork = fork - Cylinder(4.2, 40).moved(Location((0, 0, top_z0)))                          # stem
    fork = fork - Cylinder(4.2, 2 * half + 2).moved(Location((-p.caster_trail, 0, r), ROT_Y_AXIS))  # axle
    return Part("caster_fork", "print", ASA, 2, fork, [Location((p.caster_x, sy * p.caster_y, 0)) for sy in (1, -1)],
                notes="M8 x 60 stem bolt with a flanged bushing in the chassis; M8 axle. 6 walls, 60% infill.")


def guard_segment(p: Mower) -> Part:
    """A quarter of the blade guard ring, with one bolting tab, in its own frame (centre at the origin)."""
    h = p.chassis_z - p.guard_bottom
    ring = Cylinder(p.guard_r_out, h) - Cylinder(p.guard_r_in, h + 2)
    quarter = Box(p.guard_r_out + 2, p.guard_r_out + 2, h + 2).moved(Location(((p.guard_r_out + 2) / 2, (p.guard_r_out + 2) / 2, 0)))
    seg = ring & quarter
    rt = p.guard_r_in - p.guard_tab_depth / 2
    a = math.radians(45)
    tab = Box(p.guard_tab_depth + 2, p.guard_tab_w, p.guard_tab_t).moved(
        Location((rt * math.cos(a), rt * math.sin(a), h / 2 - p.guard_tab_t / 2), (0, 0, 45)))
    seg = seg + tab
    seg = seg - Cylinder(2.0, 12).moved(Location((rt * math.cos(a), rt * math.sin(a), h / 2 - 6)))
    # Shift so z = 0 is the bottom edge.
    seg = seg.moved(Location((0, 0, h / 2)))
    locs = [Location((p.blade_x, 0, p.guard_bottom), (0, 0, ang - 45)) for ang in p.guard_tab_angles]
    return Part("guard_segment", "print", ASA, 4, seg, locs,
                notes="Four identical quarters. Bolt each tab up into the chassis (M4 into a heat-set insert). "
                      "The ring is the barrier between the blade and feet: never run without all four.")


def blade_hub(p: Mower) -> Part:
    hub = Cylinder(p.blade_hub_d / 2, p.blade_hub_h).moved(Location((0, 0, p.blade_hub_h / 2)))
    hub = hub - Cylinder(4.05, p.blade_hub_h + 2).moved(Location((0, 0, p.blade_hub_h / 2)))
    for i in range(3):
        a = math.radians(120 * i)
        hub = hub - Cylinder(2.0, 10).moved(Location((12 * math.cos(a), 12 * math.sin(a), 5)))
    return Part("blade_hub", "print", ASA, 1, hub, [],
                notes="8 mm bore on the outrunner shaft with two M4 grub screws on a flat; M4 into inserts from the disc.",
                group="rotating")


def shell_post(p: Mower) -> Part:
    ztop = p.shell_top - p.shell_wall - p.mount_h
    h = ztop - p.chassis_top
    post = Box(40, 40, 6).moved(Location((0, 0, 3))) + Cylinder(p.post_d / 2, h).moved(Location((0, 0, h / 2)))
    for x, y in _square(0, 0, 14):
        post = post - Cylinder(2.0, 12).moved(Location((x, y, 6)))
    post = post - Cylinder(3.0, 14).moved(Location((0, 0, h - 7)))                         # M6 insert for the mount
    post = post - Box(14, 6, 4).moved(Location((0, 9, h - 2)))                              # hall sensor pocket
    return Part("shell_post", "print", ASA, 4, post, [Location((x, y, p.chassis_top)) for x, y in p.post_xy],
                notes="3-axis hall sensor (TLV493D class) in the top pocket reads the shell magnet: up = lift, sideways = bump.")


def mast_socket(p: Mower) -> Part:
    h = 40.0
    blk = Box(36, 36, h).moved(Location((0, 0, h / 2)))
    blk = blk - Cylinder(p.mast_d / 2 + 0.2, h).moved(Location((0, 0, h / 2 + 5)))
    for x, y in _square(0, 0, 13):
        blk = blk - Cylinder(2.0, 12).moved(Location((x, y, 6)))
    return Part("mast_socket", "print", ASA, 1, blk, [Location((p.mast_x, p.mast_y, p.tray_z + p.tray_t))],
                notes="16 mm tube push fit, M4 grub screw.")


def contact_block(p: Mower) -> Part:
    h = 30.0
    blk = Box(30, 2 * p.contact_half_y + 30, h).moved(Location((0, 0, -h / 2)))
    for x, y in [(dx, dy) for dx in (-10, 10) for dy in (-35, 35)]:
        blk = blk - Cylinder(2.0, 12).moved(Location((x, y, -6)))
    for sy in (-1, 1):
        blk = blk - Box(12, 14, 12).moved(Location((9, sy * p.contact_half_y, -h + 6)))  # contact pocket
    return Part("contact_block", "print", ASA, 1, blk, [Location((p.contact_x, 0, p.chassis_z))],
                notes="Two spring contacts (pogo or leaf, 5 A) face forward; the dock's strips press on them.")


def _shell_solid(p: Mower):
    L, W = p.shell_x1 - p.shell_x0, 2 * p.shell_half_w
    H = p.shell_top - p.shell_z0
    cx = (p.shell_x0 + p.shell_x1) / 2
    with BuildSketch() as so:
        RectangleRounded(L, W, p.shell_corner_r)
    with BuildSketch() as si:
        RectangleRounded(L - 2 * p.shell_wall, W - 2 * p.shell_wall, p.shell_corner_r - p.shell_wall)
    outer = extrude(so.sketch, H)
    inner = extrude(si.sketch, H - p.shell_wall)
    shell = (outer - inner).moved(Location((cx, 0, p.shell_z0)))
    # Openings: mast, stop button, rain sensor leads.
    mx, my = p.mast_x, p.mast_y
    shell = shell - Cylinder(p.mast_d / 2 + p.shell_travel + 4, 30).moved(Location((mx, my, p.shell_top)))
    bx, by = p.stop_button_xy
    shell = shell - Cylinder(11.25, 30).moved(Location((bx, by, p.shell_top)))
    rx, ry = p.rain_xy
    shell = shell - Cylinder(4.0, 30).moved(Location((rx, ry, p.shell_top)))
    # Magnet bosses over the posts (8 x 3 mm magnet pocket).
    for x, y in p.post_xy:
        shell = shell - Cylinder(4.1, 3).moved(Location((x, y, p.shell_top - p.shell_wall + 1.5)))
    return shell


def shell_segments(p: Mower) -> list[Part]:
    """The shell cut into a grid of printable segments, each with a joining rib along its internal seams."""
    shell = _shell_solid(p)
    xs = [p.shell_x0 + (p.shell_x1 - p.shell_x0) * i / p.shell_cols for i in range(p.shell_cols + 1)]
    ys = [-p.shell_half_w + 2 * p.shell_half_w * j / p.shell_rows for j in range(p.shell_rows + 1)]
    H = p.shell_top - p.shell_z0
    zc = p.shell_z0 + H / 2
    rib_d, rib_t = 15.0, 3.0
    z_rib = p.shell_top - p.shell_wall - rib_d / 2
    parts = []
    for i in range(p.shell_cols):
        for j in range(p.shell_rows):
            x0, x1, y0, y1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
            cell = Box(x1 - x0, y1 - y0, H + 40).moved(Location(((x0 + x1) / 2, (y0 + y1) / 2, zc)))
            seg = shell & cell
            # Ribs on internal seams, inside the cell, under the top skin.
            inner_x = (p.shell_x0 + p.shell_wall + 2, p.shell_x1 - p.shell_wall - 2)
            inner_y = (-p.shell_half_w + p.shell_wall + 2, p.shell_half_w - p.shell_wall - 2)
            ribs = []
            for xe, side in ((x0, 1), (x1, -1)):
                if inner_x[0] < xe < inner_x[1]:
                    ya, yb = max(y0, inner_y[0] + 30), min(y1, inner_y[1] - 30)
                    ribs.append((Box(rib_t, yb - ya, rib_d).moved(Location((xe + side * rib_t / 2, (ya + yb) / 2, z_rib))),
                                 [(xe, y, z_rib) for y in _spaced(ya, yb, 70)], "x"))
            for ye, side in ((y0, 1), (y1, -1)):
                if inner_y[0] < ye < inner_y[1]:
                    xa, xb = max(x0, inner_x[0] + 30), min(x1, inner_x[1] - 30)
                    ribs.append((Box(xb - xa, rib_t, rib_d).moved(Location(((xa + xb) / 2, ye + side * rib_t / 2, z_rib))),
                                 [(x, ye, z_rib) for x in _spaced(xa, xb, 70)], "y"))
            for rib, bolts, axis in ribs:
                seg = seg + rib
                for bx, by, bz in bolts:
                    rot = (0, 90, 0) if axis == "x" else (90, 0, 0)
                    seg = seg - Cylinder(2.2, 20).moved(Location((bx, by, bz), rot))
            # Each segment's STL is in its own frame: origin at the segment's lower corner.
            origin = Location((x0, y0, p.shell_z0))
            local = seg.moved(origin.inverse())
            parts.append(Part(f"shell_r{j + 1}c{i + 1}", "print", ASA, 1, local, [origin],
                              notes="0.24 mm layers, 3 walls, 15% gyroid; print open side down. "
                                    "M4 x 12 + nut through the seam ribs, then solvent-weld the seam (acetone).",
                              group="shell"))
    return parts


def _spaced(a, b, pitch):
    n = max(1, int((b - a) // pitch))
    return [a + (b - a) * (k + 0.5) / n for k in range(n)]


def height_gauge(p: Mower) -> Part:
    """A stepped block: stand it on the chassis underside's reference to set the plate to each cut height."""
    steps = p.cut_steps
    g = None
    for k, hgt in enumerate(steps):
        b = Box(12, 20, p.chassis_z - p.plate_z(hgt) - p.height_plate_t).moved(
            Location((k * 12 + 6, 0, (p.chassis_z - p.plate_z(hgt) - p.height_plate_t) / 2)))
        g = b if g is None else g + b
    return Part("height_gauge", "print", ASA, 1, g, [],
                notes="Each step is the gap between the chassis underside and the height plate for one cut height "
                      f"({', '.join(f'{s:g}' for s in steps)} mm, left to right). Not part of the assembly.")


# ---------------------------------------------------------------- stock + bought-in

def rods(p: Mower) -> Part:
    top = p.chassis_top + 10
    L = top - p.rod_bottom
    rod = Cylinder(p.rod_d / 2, L).moved(Location((0, 0, L / 2)))
    return Part("height_rod", "stock", "steel threaded rod", 3, rod, [Location((x, y, p.rod_bottom)) for x, y in p.rod_points()],
                spec=f"M6 threaded rod, stainless A2, cut {L:g} mm", notes="Nut + washer on the chassis top; two nuts per rod at the plate.")


def mast(p: Mower) -> Part:
    z0 = p.tray_z + p.tray_t + 5
    L = p.mast_top - z0
    tube = Cylinder(p.mast_d / 2, L).moved(Location((0, 0, L / 2)))
    return Part("mast_tube", "stock", "aluminium tube", 1, tube, [Location((p.mast_x, p.mast_y, z0))],
                spec=f"{p.mast_d:g} mm OD x 1.5 mm wall aluminium tube, cut {L:g} mm")


def standoffs(p: Mower) -> Part:
    s = Cylinder(3.0, p.standoff_h).moved(Location((0, 0, p.standoff_h / 2)))
    return Part("standoff", "cots", "", 4, s, [Location((x, y, p.chassis_top)) for x, y in tray_corners(p)],
                spec=f"M3 x {p.standoff_h:g} mm female-female hex standoff")


def rotating(p: Mower, h: float) -> list[Part]:
    """Swept envelopes of everything that spins at cut height h, grown by the running clearance."""
    c = p.rotating_clearance
    z_blade = h
    z_disc = h + p.blade_t
    z_hub = z_disc + p.disc_t
    z_plate_top = p.plate_z(h) + p.height_plate_t
    out = []
    tips = Cylinder(p.blade_tip_r + c, p.blade_t + 2 * c).moved(Location((0, 0, p.blade_t / 2)))
    out.append(Part("blade_sweep", "cots", "", 1, tips, [Location((p.blade_x, 0, z_blade))],
                    spec="3 x pivoting robotic-mower razor blade, 30 x 18 x 1 mm, M3 hole (the common replaceable kind)",
                    group="rotating"))
    disc = blade_disc(p)
    disc.placements = [Location((p.blade_x, 0, z_disc))]
    out.append(disc)
    hub = blade_hub(p)
    hub.placements = [Location((p.blade_x, 0, z_hub))]
    out.append(hub)
    can = Cylinder(p.blade_motor_d / 2 + c, p.blade_motor_h).moved(Location((0, 0, p.blade_motor_h / 2)))
    out.append(Part("blade_motor", "cots", "", 1, can, [Location((p.blade_x, 0, z_plate_top))],
                    spec=f"Outrunner BLDC ~{p.blade_motor_d:g} x {p.blade_motor_h:g} mm, 24 V, ~140 kv, 8 mm shaft out of the mount side, "
                         "plus a 30 A ESC with braking", group="rotating"))
    return out


def envelopes(p: Mower) -> list[Part]:
    """Bought-in fixed parts as simple solids, for collision checks and the assembly view."""
    out = []
    motor = Cylinder(p.motor_d / 2, p.motor_len).moved(Location((0, 0, 0), ROT_Y_AXIS))
    y = p.motor_face_y - p.motor_len / 2
    out.append(Part("gearmotor", "cots", "", 2, motor, [Location((0, y, p.axle_z)), Location((0, -y, p.axle_z))],
                    spec="37 mm gearmotor, 24 V, ~90-110 rpm output, 6 mm D shaft, quadrature encoder"))
    wheel = Cylinder(p.wheel_d / 2, p.wheel_w).moved(Location((0, 0, 0), ROT_Y_AXIS))
    out.append(Part("wheel", "cots", "", 2, wheel, [Location((0, p.wheel_y, p.axle_z)), Location((0, -p.wheel_y, p.axle_z))],
                    spec=f"{p.wheel_d:g} x {p.wheel_w:g} mm lawn wheel with tread (or a printed rim + TPU tyre)"))
    cw = Cylinder(p.caster_wheel_d / 2, p.caster_wheel_w).moved(Location((0, 0, 0), ROT_Y_AXIS))
    out.append(Part("caster_wheel", "cots", "", 2, cw,
                    [Location((p.caster_x - p.caster_trail, sy * p.caster_y, p.caster_wheel_d / 2)) for sy in (1, -1)],
                    spec=f"{p.caster_wheel_d:g} x {p.caster_wheel_w:g} mm wheel with 8 mm bearings"))
    bx, by, bz = p.battery
    out.append(Part("battery", "cots", "", 1, Box(bx, by, bz).moved(Location((0, 0, bz / 2))),
                    [Location((p.battery_x, 0, p.chassis_top))],
                    spec=f"7S 25.2 V Li-ion pack, 5 Ah (7S2P 21700), with a BMS, max {bx:g} x {by:g} x {bz:g} mm"))
    ex, ey, ez = p.electronics
    out.append(Part("electronics", "cots", "", 1, Box(ex, ey, ez).moved(Location((0, 0, ez / 2))),
                    [Location((p.electronics_x, 0, p.tray_z + p.tray_t))],
                    spec="Envelope for Raspberry Pi, RTK GNSS board, ESP32, motor driver, ESC, relay, IMU, buck converters"))
    ad, ah = p.antenna
    out.append(Part("gnss_antenna", "cots", "", 1, Cylinder(ad / 2, ah).moved(Location((0, 0, ah / 2))),
                    [Location((p.mast_x, p.mast_y, p.mast_top))], spec="Multi-band GNSS antenna with ground plane"))
    mount = Cylinder(p.mount_d / 2, p.mount_h).moved(Location((0, 0, p.mount_h / 2)))
    out.append(Part("rubber_mount", "cots", "", 4, mount,
                    [Location((x, y, p.shell_top - p.shell_wall - p.mount_h)) for x, y in p.post_xy],
                    spec=f"Rubber anti-vibration mount, M6 male-male, {p.mount_d:g} x {p.mount_h:g} mm", group="flex"))
    bx, by = p.stop_button_xy
    head = Cylinder(20, 30).moved(Location((0, 0, 15)))
    body = Cylinder(11, 40).moved(Location((0, 0, -20)))
    out.append(Part("stop_button", "cots", "", 1, head + body, [Location((bx, by, p.shell_top))],
                    spec="40 mm red mushroom stop button, latching, 22 mm panel hole, 2 NC contacts", group="shell"))
    rx, ry = p.rain_xy
    out.append(Part("rain_sensor", "cots", "", 1, Box(40, 30, 4).moved(Location((0, 0, 2))),
                    [Location((rx, ry, p.shell_top))], spec="Resistive rain sensor board (glue to the shell)", group="shell"))
    return out


def all_parts(p: Mower, h: float | None = None) -> list[Part]:
    h = p.cut_nominal if h is None else h
    return [chassis_plate(p), height_plate(p, h), electronics_tray(p),
            *motor_clamp(p), wheel_hub(p), caster_fork(p), guard_segment(p), shell_post(p), mast_socket(p),
            contact_block(p), *shell_segments(p), rods(p), mast(p), standoffs(p), *envelopes(p), *rotating(p, h)]


def made_only(p: Mower) -> list[Part]:
    """Made parts that are not in the assembly (jigs and gauges)."""
    return [height_gauge(p)]


def fasteners(p: Mower) -> list[tuple[str, int, str]]:
    return [
        ("M4 x 50 socket cap screw", 8, "motor clamp caps"),
        ("M4 x 12 socket cap screw", 4 + 16 + 4 + 4 + 4, "clamp cradles, shell posts, guard tabs, contact block, mast socket"),
        ("M4 heat-set insert, 5.7 mm long", 8 + 16 + 4 + 4 + 4 + 3, "printed parts"),
        ("M4 x 12 button head + nut", 24, "shell seam ribs"),
        ("M3 grub screw insert + M3 grub screw", 2, "wheel hubs on the 6 mm D shafts"),
        ("M4 x 16 screw", 8, "wheel hubs to wheels"),
        ("M8 x 60 bolt + nyloc nut + flanged bushing", 2, "caster stems"),
        ("M8 x 50 bolt + nyloc nut", 2, "caster axles"),
        ("M8 thrust washer", 2, "between caster fork and chassis"),
        ("M6 nut + washer, stainless", 9, "height rods: one on the chassis, two at the plate, per rod"),
        ("M3 x 8 screw", 8, "tray standoffs"),
        ("M3 x 8 screw", 4, "blade motor to the height plate"),
        ("M4 x 10 screw", 3, "blade disc to hub"),
        ("M4 grub screw", 2, "blade hub on the motor shaft"),
        ("M3 shoulder screw, 4 mm shoulder + nyloc nut", 3, "razor blade pivots"),
        ("M2.5 x 6 screw + 6 mm standoff", 4, "Raspberry Pi"),
        ("8 x 3 mm neodymium magnet", 4, "shell bosses over the hall sensors"),
        ("M6 x 12 screw", 4, "rubber mounts into the shell bosses"),
    ]


COTS_EXTRA = [
    ("Raspberry Pi 5 (4 GB) or Pi 4", 1, "planning, RTK fusion"),
    ("RTK GNSS receiver, multi-band (u-blox ZED-F9P class) + antenna", 1, "rover; a second set for the base station"),
    ("ESP32 dev board (ESP32-WROOM-32)", 1, "firmware/esp32"),
    ("Dual DC motor driver, 10 A/ch, PWM+DIR", 1, "e.g. a Cytron MDD10A class driver"),
    ("3-pole relay, 24 V coil, 10 A (NO to the ESC, NC shorting the motor phases)", 1, "blade power + passive brake"),
    ("BNO085 (or similar) IMU", 1, "tilt and heading"),
    ("3-axis hall sensor breakout (TLV493D class)", 4, "shell lift and bump"),
    ("5 V 5 A buck converter", 1, "Pi supply"),
    ("25 mm hook-and-loop strap, 600 mm", 1, "battery"),
    ("20 A blade fuse + holder; 3 A fuse for the electronics", 1, "battery positive"),
    ("Main power switch, 20 A DC", 1, "on the shell rear"),
]
