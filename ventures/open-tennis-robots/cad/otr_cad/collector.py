"""Collector rover: every fabricated part, generated from `params.Collector`.

Three kinds of made part, chosen so a small shop or an online service can
make them with no drawings and no judgement calls:

* laser: flat 2-D profiles cut from sheet (aluminium 5052), exported as DXF
  in true millimetres. No bends, no tapped holes, no tolerance callouts.
* print: FDM parts (PETG), exported as STL, sized for 0.4 mm nozzles.
* stock: straight lengths cut from bar, wire or tube (a cut list).

Bought-in parts are modelled as envelopes only, so the assembly can be
checked for collisions; they go in the BOM with what to buy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from build123d import (
    Axis,
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
    make_hull,
)

from .params import Collector

ROT_XZ = (90, 0, 0)    # sketch X -> robot x, sketch Y -> robot z, thickness -> robot -y
ROT_Y_AXIS = (90, 0, 0)  # Cylinder along Z -> along y


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

    def placed(self):
        return [self.shape.moved(loc) for loc in self.placements]


def _holes(points, d):
    with Locations(*points):
        Circle(d / 2, mode=Mode.SUBTRACT)


def _insert_pocket(p: Collector, x: float, y: float, z: float, up: bool = True, pilot: float = 12.0):
    """A heat-set insert pocket opening at height z (into the part going up, or down when up=False), with an
    M4 clearance pilot past it for the screw's tip."""
    s = 1 if up else -1
    pocket = Cylinder(p.insert_hole_d / 2, p.insert_depth).moved(Location((x, y, z + s * p.insert_depth / 2)))
    tip = Cylinder(2.2, pilot).moved(Location((x, y, z + s * pilot / 2)))
    return pocket + tip


def pivot_y(p: Collector) -> float:
    """Pivot block centre |y|: the block runs from the arm's inner face inward by pivot_depth."""
    return p.arm_inner_y - p.pivot_depth / 2


# ---------------------------------------------------------------- laser parts

def base_plate(p: Collector) -> Part:
    L = p.base_x1 - p.base_x0
    W = 2 * p.base_half_w
    cx = (p.base_x0 + p.base_x1) / 2
    with BuildSketch() as s:
        with Locations((cx, 0)):
            RectangleRounded(L, W, p.corner_r)
        # Motor clamp bolts (M4 from below into heat-set inserts).
        y_mid = p.motor_face_y - p.clamp_len / 2
        _holes([(sx * 22, sy * y_mid) for sx in (-1, 1) for sy in (-1, 1)], 4.4)
        # Pivot blocks (M4 x2 each).
        yb = pivot_y(p)
        _holes([(p.pivot_x + dx, sy * yb) for dx in (-12, 12) for sy in (-1, 1)], 4.4)
        # Yoke-lift switch towers (M4 x2 each, from below): slots along x to set where the switch clicks.
        with Locations(*_bump_tower_bolts(p)):
            SlotOverall(4.4 + 2 * p.bump_slot_mm, 4.4, mode=Mode.SUBTRACT)
        # Caster adapter below and mast socket above share these: M4 on a 40 mm square, from below.
        _holes(_caster_bolts(p), 4.4)
        # Standoffs for the electronics tray (M3).
        _holes(_tray_corners(p), 3.4)
        # Battery strap slots (25 mm strap).
        bx0 = p.battery_x - p.battery[0] / 2
        bx1 = p.battery_x + p.battery[0] / 2
        with Locations((bx0 - 8, 0), (bx1 + 8, 0)):
            SlotOverall(30, 6, rotation=90, mode=Mode.SUBTRACT)
        # Cable pass-through to the tray.
        with Locations((-60, 0)):
            SlotOverall(60, 20, mode=Mode.SUBTRACT)
    face = s.sketch
    solid = extrude(face, p.plate_t)
    return Part("base_plate", "laser", "aluminium 5052", 1, solid, [Location((0, 0, p.base_z))],
                flat=face, thickness=p.plate_t, notes="All holes are clearance holes; no tapping.")


BUMP_BOLT_DX = 6.0   # the tower's two M4 inserts sit this far either side of its centre along x


def _bump_tower_y(p: Collector) -> float:
    """|y| of the tower's centre: inboard of the switch body, which sits in the arm's plane."""
    return p.bump_switch_design()["y_tower_face"] - p.bump_tower_t / 2


def _bump_tower_bolts(p: Collector):
    x = p.bump_switch_design()["x_body"]
    yt = _bump_tower_y(p)
    return [(x + dx, sy * yt) for dx in (-BUMP_BOLT_DX, BUMP_BOLT_DX) for sy in (-1, 1)]


def _caster_bolts(p: Collector):
    return [(p.caster_x + dx, dy) for dx in (-20, 20) for dy in (-20, 20)]


def _tray_corners(p: Collector):
    return [(x, y) for x in (p.tray_x0 + 8, p.tray_x1 - 8) for y in (-p.tray_half_w + 8, p.tray_half_w - 8)]


def electronics_tray(p: Collector) -> Part:
    cx = (p.tray_x0 + p.tray_x1) / 2
    with BuildSketch() as s:
        with Locations((cx, 0)):
            RectangleRounded(p.tray_x1 - p.tray_x0, 2 * p.tray_half_w, 6)
        _holes(_tray_corners(p), 3.4)
        # Raspberry Pi 4/5: M2.5 on 58 x 49 mm.
        px, py = p.tray_x0 + 45, -p.tray_half_w + 40
        _holes([(px + dx, py + dy) for dx in (0, 49) for dy in (0, 58)], 2.7)
        # E-stop: 22 mm panel button.
        with Locations((p.tray_x1 - 25, p.tray_half_w - 30)):
            Circle(22.5 / 2, mode=Mode.SUBTRACT)
        # Universal M3 grid (10 mm pitch) for the ESP32 carrier, motor driver, buck converter.
        grid = [(x, y) for x in range(int(p.tray_x0 + 20), int(p.tray_x1 - 15), 10)
                for y in range(5, int(p.tray_half_w - 50), 10)]
        _holes(grid, 3.2)
    face = s.sketch
    z = p.base_top + p.standoff_h
    return Part("electronics_tray", "laser", "aluminium 5052", 1, extrude(face, p.tray_t), [Location((0, 0, z))],
                flat=face, thickness=p.tray_t,
                notes="Pi 5 on M2.5 x 58x49; other boards on the 10 mm M3 grid.")


def drum_disc(p: Collector) -> Part:
    n = p.n_rods
    with BuildSketch() as s:
        Circle(p.disc_r)
        Circle(p.ring_inner_r, mode=Mode.SUBTRACT)
        Circle(p.hub_r)
        for k in range(3):
            a = 90 + 120 * k
            rm = (p.hub_r + p.ring_inner_r) / 2
            with Locations(Location((rm * math.cos(math.radians(a)), rm * math.sin(math.radians(a)), 0), (0, 0, a))):
                Rectangle(p.ring_inner_r - p.hub_r + 10, p.spoke_w)
        Circle(p.bearing_od / 2, mode=Mode.SUBTRACT)
        rods = [(p.rod_circle_r * math.cos(2 * math.pi * i / n), p.rod_circle_r * math.sin(2 * math.pi * i / n))
                for i in range(n)]
        _holes(rods, p.rod_d + 0.2)
        _holes(_clamp_bolts(p), 4.4)
        _holes(_cover_bolts(p), p.rivet_nut_hole_d)
    face = s.sketch
    solid = extrude(face, p.plate_t)
    locs = [Location((p.drum_x, sy * (p.disc_inner_y + p.plate_t) if sy > 0 else -p.disc_inner_y, p.drum_z), ROT_XZ)
            for sy in (1, -1)]
    return Part("drum_disc", "laser", "aluminium 5052", 2, solid, locs, flat=face, thickness=p.plate_t,
                notes=f"{n} rod holes on R{p.rod_circle_r:g}; 22 mm bore takes a 608 bearing flush with the outer face "
                      f"(press or retaining compound); {p.rivet_nut_hole_d:g} mm holes take M5 rivet nuts.")


def _clamp_bolts(p: Collector):
    n = p.n_rods
    r = (p.rod_circle_r + p.disc_r) / 2 + 2
    k = max(1, n // 6)
    return [(r * math.cos(2 * math.pi * (i + 0.5) / n), r * math.sin(2 * math.pi * (i + 0.5) / n))
            for i in range(0, n, k)][:6]


def _cover_bolts(p: Collector):
    r = (p.ring_inner_r + p.cover_r) / 2
    return [(r * math.cos(math.radians(30 + 60 * i)), r * math.sin(math.radians(30 + 60 * i))) for i in range(6)]


def clamp_ring(p: Collector) -> Part:
    with BuildSketch() as s:
        Circle(p.disc_r)
        Circle(p.cover_r + 2, mode=Mode.SUBTRACT)
        _holes(_clamp_bolts(p), 4.4)
    face = s.sketch
    y0 = p.disc_inner_y + p.plate_t
    locs = [Location((p.drum_x, y0 + p.clamp_ring_t, p.drum_z), ROT_XZ),
            Location((p.drum_x, -y0, p.drum_z), ROT_XZ)]
    return Part("rod_clamp_ring", "laser", "aluminium 5052", 2, extrude(face, p.clamp_ring_t), locs,
                flat=face, thickness=p.clamp_ring_t, notes="Holds the rod ends in the disc.")


def _cover_face(p: Collector, hatch: bool):
    with BuildSketch() as s:
        Circle(p.cover_r)
        Circle(7, mode=Mode.SUBTRACT)  # axle spacer clearance
        if hatch:
            # Keyhole slot from the axle to the rim, between two thumb screws: the hatch lifts 3 mm off its seat
            # (inside the rod clamp ring) and slides off past the axle spacer with the drum still hung.
            with Locations((p.cover_r / 2, 0)):
                Rectangle(p.cover_r, 14, mode=Mode.SUBTRACT)
        _holes(_cover_bolts(p), 5.5)
    return s.sketch


def drum_cover(p: Collector) -> list[Part]:
    y0 = p.disc_inner_y + p.plate_t
    fixed, hatch = _cover_face(p, False), _cover_face(p, True)
    return [Part("drum_cover", "laser", "aluminium 5052", 1, extrude(fixed, p.cover_t),
                 [Location((p.drum_x, -y0, p.drum_z), ROT_XZ)], flat=fixed, thickness=p.cover_t,
                 notes="Fixed end cover, M5 button heads into the disc's rivet nuts."),
            Part("drum_hatch", "laser", "aluminium 5052", 1, extrude(hatch, p.cover_t),
                 [Location((p.drum_x, y0 + p.cover_t, p.drum_z), ROT_XZ)], flat=hatch, thickness=p.cover_t,
                 notes="Emptying hatch on M5 thumb screws; its slot lets it off past the axle spacer.")]


def hatch_off_path(p: Collector, steps: int = 6):
    """The hatch's way off the hung drum: out along the axle by cover_t (clear of the rod clamp ring), then up
    along its slot (the drum turned slot-down, so the cover rises past the spacer) until it clears everything."""
    lift = p.cover_t + 0.3                      # clear of the clamp ring, with a little air
    out = [(0.0, lift * k / 3, 0.0) for k in range(1, 4)]
    rise = p.cover_r + p.disc_r + 10
    out += [(0.0, lift, rise * k / steps) for k in range(1, steps + 1)]
    return out


def yoke_arm(p: Collector) -> Part:
    with BuildSketch() as s:
        with Locations((p.pivot_x, p.pivot_z), (p.drum_x, p.drum_z)):
            Circle(p.arm_end_r)
        make_hull()
        with Locations((p.pivot_x, p.pivot_z), (p.drum_x, p.drum_z)):
            Circle(8.4 / 2, mode=Mode.SUBTRACT)
        # Lightening slot.
        mx, mz = (p.pivot_x + p.drum_x) / 2, (p.pivot_z + p.drum_z) / 2
        ang = math.degrees(math.atan2(p.drum_z - p.pivot_z, p.drum_x - p.pivot_x))
        span = math.hypot(p.drum_x - p.pivot_x, p.drum_z - p.pivot_z) - 2 * p.arm_end_r - 30
        if span > 30:
            with Locations(Location((mx, mz, 0), (0, 0, ang))):
                SlotOverall(span, 12, mode=Mode.SUBTRACT)
        Polygon(*bump_cam_points(p), align=None)   # the yoke-lift switch's lobe, behind the pivot (2026-11-21)
        with Locations((p.pivot_x, p.pivot_z)):
            Circle(8.4 / 2, mode=Mode.SUBTRACT)
    face = s.sketch
    y_in = p.arm_inner_y
    locs = [Location((0, y_in + p.arm_t, 0), ROT_XZ), Location((0, -y_in, 0), ROT_XZ)]
    return Part("yoke_arm", "laser", "aluminium 5052", 2, extrude(face, p.arm_t), locs, flat=face,
                thickness=p.arm_t, notes="Swings on an 8 mm shoulder bolt at the pivot; the drum's M8 axle bolt clamps "
                                         "the 608's inner race; drum hangs on its own weight. The lobe behind the "
                                         "pivot presses the yoke-lift switch once the drum rises "
                                         f"{p.bump_lift_mm:g} mm: deburr its ramp, the roller runs on it.")


def bump_cam_points(p: Collector) -> list[tuple[float, float]]:
    """The arm's cam lobe in the arm's sketch plane (x, z at rest), from `Collector.bump_cam_profile`: rest angle
    w = 180 - lift, since the arm's material `lift` degrees above the line behind the pivot comes down onto the
    roller."""
    out = []
    for r, lift in p.bump_cam_profile():
        w = math.radians(180.0 - lift)
        out.append((p.pivot_x + r * math.cos(w), p.pivot_z + r * math.sin(w)))
    return out


# ---------------------------------------------------------------- printed parts

def motor_clamp(p: Collector) -> list[Part]:
    """Pillow-block style clamp: cradle (bolted to the base) + cap."""
    w = p.clamp_w
    bore = p.motor_d + 0.4
    z0 = p.base_top
    zc = p.axle_z
    top = zc + p.motor_d / 2 + p.clamp_wall
    cradle = Box(w, p.clamp_len, zc - z0).moved(Location((0, 0, (zc + z0) / 2)))
    cap = Box(w, p.clamp_len, top - zc).moved(Location((0, 0, (top + zc) / 2)))
    hole = Cylinder(bore / 2, p.clamp_len + 2).moved(Location((0, 0, zc), ROT_Y_AXIS))
    cap_bolts = [(sx * p.clamp_bolt_x, sy * 12) for sx in (-1, 1) for sy in (-1, 1)]
    cradle = cradle - hole
    cap = cap - hole
    for x, y in cap_bolts:
        cap = cap - Cylinder(2.2, 200).moved(Location((x, y, 0)))
        cradle = cradle - _insert_pocket(p, x, y, zc, up=False, pilot=zc - z0 - 6)  # insert at the split face
    for sx in (-1, 1):
        cradle = cradle - _insert_pocket(p, sx * 22, 0, z0)                         # from the base plate
    y_mid = p.motor_face_y - p.clamp_len / 2
    locs = [Location((0, y_mid, 0)), Location((0, -y_mid, 0))]
    note = ("PETG, 4 walls, 40% infill. M4 heat-set inserts in the cradle (top and bottom); "
            "M4x50 through the cap.")
    return [Part("motor_clamp_cradle", "print", "PETG", 2, cradle, locs, notes=note),
            Part("motor_clamp_cap", "print", "PETG", 2, cap, locs, notes=note)]


def pivot_block(p: Collector) -> Part:
    yb = pivot_y(p)
    depth = p.pivot_depth
    h = p.pivot_z + 15 - p.base_top
    blk = Box(44, depth, h).moved(Location((0, 0, p.base_top + h / 2)))
    blk = blk - Cylinder(4.2, depth + 2).moved(Location((0, 0, p.pivot_z), ROT_Y_AXIS))
    for dx in (-12, 12):
        blk = blk - _insert_pocket(p, dx, 0, p.base_top)
    locs = [Location((p.pivot_x, yb, 0)), Location((p.pivot_x, -yb, 0))]
    return Part("pivot_block", "print", "PETG", 2, blk, locs,
                notes=f"M4 heat-set inserts underneath; {p.pivot_shoulder:g} mm shoulder bolt through.")


BUMP_PILOT_R = 0.8     # M2 self-tapping pilot in PETG (1.6 mm)
BUMP_PILOT_DEPTH = 8.0


def bump_switch_tower(p: Collector) -> Part:
    """Printed tower beside each yoke pivot, behind it: the yoke-lift switch screws to its outboard face with two M2
    self-tappers, its lever in the arm's plane; two M4 inserts underneath take screws up through slots in the base
    plate, so the tower slides along x to set the click (`bump_slot_mm` either way). Drawn centred, pilots on +y."""
    h = p.bump_switch_design()
    tw, _, _ = p.bump_sw_body
    t, L = p.bump_tower_t, p.bump_tower_len
    top = p.pivot_z + tw / 2 + 3.0
    hgt = top - p.base_top
    blk = Box(L, t, hgt).moved(Location((0, 0, p.base_top + hgt / 2)))
    for dx in (-BUMP_BOLT_DX, BUMP_BOLT_DX):
        blk = blk - _insert_pocket(p, dx, 0, p.base_top)
    for dz in (-p.bump_sw_hole_pitch / 2, p.bump_sw_hole_pitch / 2):
        blk = blk - Cylinder(BUMP_PILOT_R, BUMP_PILOT_DEPTH).moved(
            Location((0, t / 2 - BUMP_PILOT_DEPTH / 2, p.pivot_z + dz), ROT_Y_AXIS))
    yt = _bump_tower_y(p)
    locs = [Location((h["x_body"], yt, 0)), Location((h["x_body"], -yt, 0), (0, 0, 180))]
    return Part("bump_switch_tower", "print", "PETG", 2, blk, locs,
                notes=f"Yoke-lift switch tower, one behind each pivot block. M4 heat-set inserts underneath; M4 x 12 up "
                      f"through the base plate's slots ({p.bump_slot_mm:g} mm either way). M2 pilots "
                      f"{p.bump_sw_hole_pitch:g} mm apart on the outboard face for the switch: check against yours. "
                      f"100% infill.")


def bump_switch_parts(p: Collector) -> list[Part]:
    """The yoke-lift switch bodies and their roller levers, at the roller's free position (bought-in envelopes)."""
    h = p.bump_switch_design()
    tw, rw, hz = p.bump_sw_body
    rho = p.bump_sw_roller_r
    body = Box(rw, hz, tw)
    arm_l = p.bump_sw_lever_mm - rho                     # body face to the roller's axis
    lever = (Box(arm_l, p.bump_sw_roller_w, 1.0).moved(Location((arm_l / 2, 0, 0)))      # toward the pivot (+x)
             + Cylinder(rho, p.bump_sw_roller_w).moved(Location((arm_l, 0, 0), ROT_Y_AXIS)))
    y = h["y_mid"]
    x_face = p.pivot_x - h["r_body_in"]                   # the body's face toward the pivot
    return [
        Part("bump_switch", "cots", "", 2, body,
             [Location((h["x_body"], sy * y, p.pivot_z)) for sy in (1, -1)],
             spec=f"Subminiature roller-lever microswitch (D2F-01L3 class), about {tw:g} x {hz:g} x {rw:g} mm; "
                  f"normally-open contact to GPIO 13 (left) / 14 (right) and GND: it closes when the drum rises "
                  f"{p.bump_lift_mm:g} mm"),
        Part("bump_switch_lever", "cots", "", 2, lever,
             [Location((x_face, sy * y, p.pivot_z)) for sy in (1, -1)],
             spec="the switch's roller lever (free position), part of bump_switch"),
    ]


LIFTED = ("yoke_arm", "drum_disc", "rod_clamp_ring", "drum_cover", "drum_hatch", "drum_rod", "drum_bearing",
          "axle_spacer")


def lifted_solids(p: Collector, parts: list[Part], lift_deg: float):
    """(moving, fixed) named solids with the yoke turned up `lift_deg` about the pivot axis (the drum rises)."""
    axis = Axis((p.pivot_x, 0, p.pivot_z), (0, -1, 0))   # positive turns the +x end up
    moving, fixed = [], []
    for part in parts:
        for i, sh in enumerate(part.placed()):
            name = f"{part.name}[{i}]"
            if part.name in LIFTED:
                moving.append((name, sh.rotate(axis, lift_deg) if lift_deg else sh))
            else:
                fixed.append((name, sh))
    return moving, fixed


def bump_push_mm(p: Collector, arm: Part, lift_deg: float, tol: float = 0.005) -> float:
    """How far the lobe pushes the roller out along its travel at `lift_deg`, measured on the CAD: the smallest shift
    away from the pivot (-x) that leaves the roller clear of the turned arm (bisection on the intersection)."""
    rho = p.bump_sw_roller_r
    h = p.bump_switch_design()
    axis = Axis((p.pivot_x, 0, p.pivot_z), (0, -1, 0))
    a = arm.placed()[0].rotate(axis, lift_deg) if lift_deg else arm.placed()[0]
    y = h["y_mid"]
    x0 = p.pivot_x - h["r_roller"] - rho

    def hits(d):
        r = Cylinder(rho, p.bump_sw_roller_w).moved(Location((x0 - d, y, p.pivot_z), ROT_Y_AXIS))
        x = a & r
        return bool(x) and x.volume > 1e-6

    if not hits(0.0):
        return 0.0
    lo, hi = 0.0, 2 * (h["r_lobe"] - h["r_roller"]) + 1.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if hits(mid) else (lo, mid)
    return hi


def bump_click_deg(p: Collector, arm: Part, tol: float = 0.01) -> float:
    """Arm lift at which the CAD lobe has pushed the roller its pretravel (the click), by bisection."""
    h = p.bump_switch_design()
    lo, hi = 0.0, h["ramp1_deg"] + 1.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if bump_push_mm(p, arm, mid) < p.bump_sw_pretravel_mm else (lo, mid)
    return (lo + hi) / 2


def bump_sweep(p: Collector, parts: list[Part]) -> tuple[list[str], dict]:
    """The yoke turned up from rest to its stop: clashes between what lifts and what stays (the lobe on the switch's
    roller is the one contact meant), the roller's push measured at each pose, and the click found on the CAD."""
    h = p.bump_switch_design()
    arm = next(x for x in parts if x.name == "yoke_arm")
    stop = p.arm_stop_deg()
    lifts = [0.0, h["contact_deg"] - 0.2, h["trip_deg"], h["ramp1_deg"] + 1.0, (h["ramp1_deg"] + stop) / 2, stop - 0.5]
    out, pushes = [], {}
    for lift in lifts:
        moving, fixed = lifted_solids(p, parts, lift)
        for c in cross_clashes_named(moving, fixed):
            if not (c[0].startswith("yoke_arm[") and c[1].startswith("bump_switch_lever[")):
                out.append(f"yoke up {lift:.1f} deg: {c[0]} x {c[1]}: {c[2]:.0f} mm^3")
        pushes[round(lift, 2)] = round(bump_push_mm(p, arm, lift), 3)
    lo, hi = h["travel_window_mm"]
    for lift, push in pushes.items():
        if lift < h["contact_deg"] - 0.1 and push > 0:
            out.append(f"yoke up {lift:.1f} deg: the lobe already pushes the roller {push:.2f} mm")
        if lift >= h["ramp1_deg"] and not lo <= push <= hi:
            out.append(f"yoke up {lift:.1f} deg: the lobe pushes the roller {push:.2f} mm, outside its travel "
                       f"{lo:.2f}-{hi:.2f} mm")
    click = bump_click_deg(p, arm)
    return out, {"pushes": pushes, "click_deg": click, "click_rise_mm": p.drum_rise_mm(click), "stop_deg": stop,
                 "stop_rise_mm": p.drum_rise_mm(stop)}


def cross_clashes_named(first, second, tol_mm3: float = 1.0):
    """(name, name, volume) for each overlapping pair with one solid from each list."""
    out = []
    for na, a in first:
        ba = a.bounding_box()
        for nb, b in second:
            bb = b.bounding_box()
            if (ba.max.X <= bb.min.X or bb.max.X <= ba.min.X or ba.max.Y <= bb.min.Y or bb.max.Y <= ba.min.Y
                    or ba.max.Z <= bb.min.Z or bb.max.Z <= ba.min.Z):
                continue
            v = (a & b).volume
            if v > tol_mm3:
                out.append((na, nb, v))
    return out


def caster_adapter(p: Collector) -> Part:
    h = p.base_z - p.caster_height
    blk = Box(56, 56, h).moved(Location((0, 0, h / 2)))
    for dx in (-20, 20):
        for dy in (-20, 20):
            blk = blk - Cylinder(2.2, h + 2).moved(Location((dx, dy, h / 2)))
            blk = blk - Cylinder(4.0, CASTER_CBORE).moved(Location((dx, dy, CASTER_CBORE / 2)))  # head below
    return Part("caster_adapter", "print", "PETG", 1, blk, [Location((p.caster_x, 0, p.caster_height))],
                notes="Spacer between base and a ball caster. Its four M4s go up through the plate into the mast "
                      "socket; fit them before the caster. Drill the caster's own pattern clear of their heads.")


CASTER_CBORE = 4.5   # an M4 socket head is 4 mm tall


def mast_socket(p: Collector) -> Part:
    h, flange = 50.0, MAST_FLANGE_H
    blk = Box(52, 52, flange).moved(Location((0, 0, flange / 2))) + Box(30, 30, h).moved(Location((0, 0, h / 2)))
    blk = blk - Cylinder(p.mast_d / 2 + 0.2, h).moved(Location((0, 0, h / 2 + 5)))
    for dx in (-20, 20):
        for dy in (-20, 20):
            blk = blk - _insert_pocket(p, dx, dy, 0, pilot=flange - 1.5)
    return Part("mast_socket", "print", "PETG", 1, blk, [Location((p.mast_x, 0, p.base_top))],
                notes="20 mm tube push fit; add an M4 grub screw if it rattles. Held by the caster adapter's M4s.")


MAST_FLANGE_H = 12.0


# ---------------------------------------------------------------- stock + bought-in

def rods(p: Collector) -> Part:
    n = p.n_rods
    rod = Cylinder(p.rod_d / 2, p.rod_len).moved(Location((0, 0, 0), ROT_Y_AXIS))
    y_c = 0.0
    locs = []
    for i in range(n):
        a = 2 * math.pi * i / n
        locs.append(Location((p.drum_x + p.rod_circle_r * math.cos(a), y_c, p.drum_z + p.rod_circle_r * math.sin(a))))
    return Part("drum_rod", "stock", "spring-steel (music) wire", n, rod, locs,
                spec=f"{p.rod_d:g} mm music wire, cut {p.rod_len:g} mm", notes="Deburr ends.")


def mast(p: Collector) -> Part:
    tube = Cylinder(p.mast_d / 2, p.mast_len).moved(Location((0, 0, p.mast_len / 2)))
    return Part("mast_tube", "stock", "aluminium tube", 1, tube, [Location((p.mast_x, 0, p.base_top + 5))],
                spec=f"{p.mast_d:g} mm OD x 1.5 mm wall aluminium tube, cut {p.mast_len:g} mm")


def standoffs(p: Collector) -> Part:
    s = Cylinder(3.0, p.standoff_h).moved(Location((0, 0, p.standoff_h / 2)))
    locs = [Location((x, y, p.base_top)) for x, y in _tray_corners(p)]
    return Part("standoff", "cots", "", 4, s, locs, spec=f"M3 x {p.standoff_h:g} mm female-female hex standoff")


def envelopes(p: Collector) -> list[Part]:
    """Bought-in parts as simple solids, for collision checks and the assembly view."""
    out = []
    motor = Cylinder(p.motor_d / 2, p.motor_len).moved(Location((0, 0, 0), ROT_Y_AXIS))
    y = p.motor_face_y - p.motor_len / 2
    out.append(Part("gearmotor", "cots", "", 2, motor, [Location((0, y, p.axle_z)), Location((0, -y, p.axle_z))],
                    spec="37 mm gearmotor, 24 V, ~150-200 rpm, 6 mm D shaft, quadrature encoder"))
    wheel = Cylinder(p.wheel_d / 2, p.wheel_w).moved(Location((0, 0, 0), ROT_Y_AXIS))
    out.append(Part("wheel", "cots", "", 2, wheel, [Location((0, p.wheel_y, p.axle_z)), Location((0, -p.wheel_y, p.axle_z))],
                    spec=f"{p.wheel_d:g} x {p.wheel_w:g} mm non-marking wheel + 6 mm D-shaft hub"))
    caster = Cylinder(15, p.caster_height).moved(Location((0, 0, p.caster_height / 2)))
    out.append(Part("ball_caster", "cots", "", 1, caster, [Location((p.caster_x, 0, 0))],
                    spec=f"ball caster, {p.caster_height:g} mm mounting height (e.g. 3/4-1 in ball)"))
    bearing = (Cylinder(11, 7) - Cylinder(4, 7)).moved(Location((0, 0, 0), ROT_Y_AXIS))
    yo = p.disc_inner_y + p.plate_t              # bearing flush with the disc's outer face, 2 mm proud inside
    out.append(Part("drum_bearing", "cots", "", 2, bearing,
                    [Location((p.drum_x, yo - 3.5, p.drum_z)), Location((p.drum_x, -(yo - 3.5), p.drum_z))],
                    spec="608 (or F608) bearing, 8 x 22 x 7"))
    spacer_len = p.arm_inner_y - yo
    spacer = (Cylinder(p.axle_spacer_od / 2, spacer_len) - Cylinder(4.1, spacer_len)).moved(Location((0, 0, 0), ROT_Y_AXIS))
    yc = yo + spacer_len / 2
    out.append(Part("axle_spacer", "cots", "", 2, spacer,
                    [Location((p.drum_x, yc, p.drum_z)), Location((p.drum_x, -yc, p.drum_z))],
                    spec=f"spacer 8.1 mm ID x {p.axle_spacer_od:g} mm OD x {spacer_len:g} mm, aluminium or steel "
                         f"(through the cover's 14 mm hole, onto the 608's inner race only)"))
    bx, by, bz = p.battery
    bat = Box(bx, by, bz).moved(Location((0, 0, bz / 2)))
    out.append(Part("battery", "cots", "", 1, bat, [Location((p.battery_x, 0, p.base_top))],
                    spec=f"24 V LiFePO4 10 Ah with BMS, max {bx:g} x {by:g} x {bz:g} mm"))
    return out


def all_parts(p: Collector) -> list[Part]:
    return [base_plate(p), electronics_tray(p), drum_disc(p), clamp_ring(p), *drum_cover(p), yoke_arm(p),
            *motor_clamp(p), pivot_block(p), bump_switch_tower(p), caster_adapter(p), mast_socket(p),
            rods(p), mast(p), standoffs(p), *envelopes(p), *bump_switch_parts(p)]
