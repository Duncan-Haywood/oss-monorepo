"""A sourced variant of the ``selfrep-closure`` part list: printed-part masses from the STL files
and fastener counts for one printer instead of box sizes.

Two defects of the placeholder list (quality audit 2026-11-08, portfolio/quality/audits/
2026-11-08-selfrep-materials.json) are fixed here, inside this project, so the sibling projects
that read ``selfrep_closure.bom`` keep their numbers:

* **Printed parts.** The placeholder gives every printed part 25 g (44 parts, 1.10 kg). Here each
  part's mass is its STL's solid volume (``data/stl_volumes.json``, computed by
  ``experiments/stl_volumes.py`` from the files the RepRap wiki links) times a plastic density
  times a fill fraction. Density: PLA 1.24 g/cm3 (NatureWorks Ingeo 4043D technical data sheet,
  specific gravity 1.24); ABS is about 1.04 to 1.05. Fill fraction (share of the solid volume a
  print actually deposits: perimeters plus infill) is the one ASSUMED input left; the base case is
  1.0, a solid print, which is the upper bound on printed mass.
* **Fasteners.** The wiki's bill of materials lists box sizes ("Easier to buy a box of 100").
  The counts below are what one printer uses, summed from the "Parts Required" lists of the
  RepRap wiki page "Prusa Mendel Assembly (iteration 2)", oldid=191295 (2025-09-01), plus the
  Wade's-extruder table of "Prusa Mendel (iteration 2)", oldid=181926, which the wiki says is
  "included in count above" for M8 nuts and washers and M3 nuts.

Per-unit fastener and vitamin masses are still the placeholders of ``selfrep_closure.bom``.
"""
import json
import os
from dataclasses import replace

from selfrep_closure.bom import Part
from selfrep_closure.closure import parts_for as _placeholder_parts

_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "stl_volumes.json")
STL = json.load(open(_DATA))["parts"]

PLA_DENSITY = 1.24   # g/cm3, NatureWorks Ingeo 4043D data sheet (specific gravity 1.24)
ABS_DENSITY = 1.04   # g/cm3, low end of typical ABS grades

# Assembly-page sections (oldid=191295) -> count per printer. Frame triangles are listed "per
# triangle" and there are two. Front rods use the unmodified counts (18 nuts, 19 washers).
FASTENER_DERIVATION = {
    "M8 nut": {"x-axis": 2, "frame triangles (2 x 14)": 28, "front rods": 18, "rear rods": 14,
               "top rods": 12, "tightening the frame": 4, "z-axis": 2, "Wade's extruder": 2},
    "M8 washer": {"x-axis": 3, "frame triangles (2 x 14)": 28, "front rods": 19, "rear rods": 14,
                  "top rods": 16, "tightening the frame": 4, "Wade's extruder": 4},
    # The bill of materials has no M3x25 line; the assembly's 11 M3x25 go on the M3x20 line.
    "M3x20 bolt": {"z-axis M3x20": 12, "y-axis M3x25": 4, "x-carriage M3x25": 4, "endstops M3x25": 3},
    "M3 nut": {"y-axis": 4, "z-axis": 12, "x-carriage": 5, "print bed": 8, "endstops": 3, "Wade's extruder": 6},
    "M3 washer": {"y-axis": 8, "z-axis": 24, "x-carriage": 8, "print bed": 16, "endstops": 6},
    "M3x10 bolt": {"x-axis": 3, "y-axis": 3, "z-axis": 8, "x-carriage": 4},
}
FASTENERS_PER_PRINTER = {k: sum(v.values()) for k, v in FASTENER_DERIVATION.items()}

# Lines the assembly page needs that the wiki's bill of materials omits. Masses ASSUMED, same
# order as the placeholder list's other small fasteners.
EXTRA = [
    Part("M3x40 bolt (print bed)", 4, "fastener", 4.0, 0.08),
    Part("M4x20 bolt (x-carriage)", 2, "fastener", 2.5, 0.05),
    Part("M4 nut (x-carriage)", 2, "fastener", 0.8, 0.02),
    Part("M4 washer (x-carriage)", 2, "fastener", 0.3, 0.01, ("cnc",), "as M8 washer", feedstock="aluminium sheet"),
]


def printed_mass_g(name, density=PLA_DENSITY, fill=1.0):
    return STL[name]["volume_cm3"] * density * fill


def parts_for(variant, density=PLA_DENSITY, fill=1.0):
    """The placeholder part list with sourced printed masses, per-printer fastener counts and the extra lines."""
    if not 0.0 < fill <= 1.0:
        raise ValueError("fill must be in (0, 1]")
    out = []
    for p in _placeholder_parts(variant):
        if p.kind == "printed":
            p = replace(p, mass_g=printed_mass_g(p.name, density, fill))
        elif p.name in FASTENERS_PER_PRINTER:
            p = replace(p, qty=FASTENERS_PER_PRINTER[p.name])
        out.append(p)
    return out + [p for p in EXTRA if p.variant in ("all", variant)]
