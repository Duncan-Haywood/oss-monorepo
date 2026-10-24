"""Charging dock: a base plate pegged to the lawn, two wheel guides and a contact tower.

The mower drives in forwards along the dock's x axis. The guides centre
its rear wheels, and two spring-steel strips on the tower face press on
the mower's contact block. The strips are live only when the charger sees
the mower (see hardware/dock.md): an open dock carries no voltage.
"""

from __future__ import annotations

from build123d import Box, BuildSketch, Circle, Cylinder, Location, Locations, Mode, RectangleRounded, extrude

from . import mower as M
from .mower import ASA, AL, Part, _holes
from .params import Dock, Mower


def peg_holes(p: Dock):
    xs = [40 + (p.plate_len - 80) * i / (p.peg_holes // 2 - 1) for i in range(p.peg_holes // 2)]
    return [(x, sy * (p.plate_half_w - 25)) for x in xs for sy in (-1, 1)]


def tower_holes(p: Dock):
    x = p.tower_x + p.tower_depth / 2
    return [(x + dx, dy) for dx in (-25, 25) for dy in (-60, 60)]


def guide_holes(p: Dock):
    x0 = 30.0
    return [(x0 + dx, sy * p.guide_y) for dx in (30, p.guide_len - 30) for sy in (-1, 1)]


def base_plate(p: Dock) -> Part:
    with BuildSketch() as s:
        with Locations((p.plate_len / 2, 0)):
            RectangleRounded(p.plate_len, 2 * p.plate_half_w, 20)
        _holes(peg_holes(p), 8.5)
        _holes(tower_holes(p), 4.4)
        _holes(guide_holes(p), 4.4)
        with Locations((p.tower_x + p.tower_depth / 2, 0)):
            Circle(10, mode=Mode.SUBTRACT)  # charger cable
    face = s.sketch
    return Part("base_plate", "laser", AL, 1, extrude(face, p.plate_t), [Location((0, 0, 0))], flat=face,
                thickness=p.plate_t, notes="Peg to the lawn through the six holes (steel tent pegs).")


def tower(p: Dock) -> Part:
    w, d, h = p.tower_w, p.tower_depth, p.tower_h
    t = Box(d, w, h).moved(Location((d / 2, 0, h / 2)))
    t = t - Box(d - 8, w - 8, h - 4).moved(Location((d / 2 + 4, 0, (h - 4) / 2)))  # hollow, open at the back
    for sy in (-1, 1):
        # Slot the contact strip's foot passes through, near the tower face.
        t = t - Box(p.contact_strip[0] + 0.6, p.contact_strip[1] + 0.6, 20).moved(
            Location((p.contact_strip[0] / 2 + 6, sy * p.contact_half_y, h - 8)))
    for dx in (-25, 25):
        for dy in (-60, 60):
            t = t - Cylinder(2.0, 12).moved(Location((d / 2 + dx, dy, 6)))
    # A floor ring inside for the pilots.
    floor = Box(d - 8, w - 8, 6).moved(Location((d / 2 + 4, 0, 3)))
    for dx in (-25, 25):
        for dy in (-60, 60):
            floor = floor - Cylinder(2.0, 12).moved(Location((d / 2 + dx, dy, 6)))
    t = t + floor
    return Part("contact_tower", "print", ASA, 1, t, [Location((p.tower_x, 0, p.plate_t))],
                notes="Hollow, open at the back for the charger lead. M4 into heat-set inserts from under the plate.")


def guide(p: Dock) -> Part:
    g = Box(p.guide_len, p.guide_w, p.guide_h).moved(Location((p.guide_len / 2, 0, p.guide_h / 2)))
    # Chamfered lead-in at the entry end is approximated by a lower first step.
    g = g - Box(40, p.guide_w + 2, p.guide_h / 2).moved(Location((20, 0, p.guide_h * 0.75)))
    for dx in (30, p.guide_len - 30):
        g = g - Cylinder(2.0, 12).moved(Location((dx, 0, 6)))
    return Part("wheel_guide", "print", ASA, 2, g,
                [Location((30, sy * p.guide_y, p.plate_t)) for sy in (1, -1)],
                notes="Rails the rear wheels run between; they centre the mower on the contacts.")


def strips(p: Dock) -> Part:
    sx, sy, sz = p.contact_strip
    s = Box(sx, sy, sz).moved(Location((0, 0, 0)))
    return Part("contact_strip", "cots", "", 2, s,
                [Location((p.tower_x - sx / 2, side * p.contact_half_y, p.plate_t + p.contact_z)) for side in (1, -1)],
                spec=f"Spring stainless strip {sx:g} x {sy:g} mm, bent to a {sz:g} mm leaf (cut and bend from 0.3 mm stock)")


def charger(p: Dock) -> Part:
    c = Box(60, 120, 40).moved(Location((0, 0, 20)))
    return Part("charger", "cots", "", 1, c, [Location((p.tower_x + p.tower_depth / 2 + 4, 0, p.plate_t + 6))],
                spec="29.4 V 2 A Li-ion charger (7S), outdoor-rated or in a sealed box; its mains side stays indoors or in an IP-rated enclosure")


def docked_offset(p: Dock, m: Mower) -> float:
    """Mower x in the dock frame when its contact block's face touches the strips."""
    return p.tower_x - p.contact_strip[0] - (m.contact_x + 15.0)


def docked_mower(p: Dock, m: Mower = Mower()) -> list[tuple[str, object]]:
    """The mower's outer parts, placed where they sit when docked, for the fit check."""
    keep = ("wheel", "caster_wheel", "caster_fork", "guard_segment", "contact_block")
    loc = Location((docked_offset(p, m), 0, p.plate_t))
    return [(f"mower {part.name}[{i}]", s.moved(loc)) for part in M.all_parts(m)
            if part.name in keep or part.group == "shell" for i, s in enumerate(part.placed())]


def contact_overlap(p: Dock, m: Mower = Mower()) -> float:
    """Vertical overlap (mm) between each strip and the mower's contact pocket when docked."""
    pocket = (p.plate_t + m.chassis_z - 30.0, p.plate_t + m.chassis_z - 18.0)
    strip = (p.plate_t + p.contact_z - p.contact_strip[2] / 2, p.plate_t + p.contact_z + p.contact_strip[2] / 2)
    return min(pocket[1], strip[1]) - max(pocket[0], strip[0])


def all_parts(p: Dock) -> list[Part]:
    return [base_plate(p), tower(p), guide(p), strips(p), charger(p)]


def fasteners(p: Dock) -> list[tuple[str, int, str]]:
    return [
        ("M4 x 12 screw + heat-set insert", 8, "tower and guides, from under the plate"),
        ("Steel tent peg, 8 mm, 200 mm", p.peg_holes, "through the base plate into the lawn"),
        ("Ring terminal + 1.5 mm^2 wire, 1 m", 2, "strips to the charge-enable relay"),
    ]


COTS_EXTRA = [
    ("Charge-enable relay or MOSFET + mower-present sense (see hardware/dock.md)", 1, "keeps the strips dead until a mower is docked"),
    ("Cable gland, IP68, M16", 1, "charger lead into the tower"),
]
