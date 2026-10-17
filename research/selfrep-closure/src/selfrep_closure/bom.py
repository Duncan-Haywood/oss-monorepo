"""Bill of materials for the RepRap Prusa Mendel (iteration 2).

Part names and quantities come from the RepRap wiki page "Prusa Mendel (iteration 2)",
oldid=181926 (last edited 9 April 2018, retrieved 2026-10-13):
https://reprap.org/wiki/Prusa_Mendel_(iteration_2)   (content under the GNU FDL).

The wiki gives NO masses and NO prices. ``mass_g`` and ``cost`` below are ASSUMED
order-of-magnitude placeholders written for this project, not sourced figures; the
experiments only use them inside wide sensitivity ranges. ``makers`` is also an
assumption of this project (which shop processes could plausibly make the part from
raw feedstock); the reason is in ``why``.

Fastener lines are the box sizes the wiki lists (100 nuts), not the number used in one
printer. Unit closure is therefore reported only as a secondary figure.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Part:
    name: str
    qty: int
    kind: str          # printed | fastener | bearing | rod | belt | motion | electronics | other
    mass_g: float      # ASSUMED, per unit
    cost: float        # ASSUMED, per unit, arbitrary currency units
    makers: tuple = ()  # processes (any one suffices) that can make it; () = vitamin
    why: str = ""
    variant: str = "all"  # "all", "lm8uu" or "brass"
    feedstock: str = ""   # imported raw material the maker consumes


def _p(name, qty):
    return Part(name, qty, "printed", 25.0, 0.5, ("fdm",), "printed part listed on the wiki page", feedstock="filament")


PRINTED = [("bar-clamp", 8), ("bearing-guide", 3), ("belt-clamp", 4), ("belt-clamp-nut-holder", 4),
           ("coupling", 2), ("endstop-holder", 3), ("frame-vertex", 2), ("frame-vertex-foot", 4),
           ("rod-clamp", 2), ("x-carriage", 1), ("x-end-idler", 1), ("x-end-motor", 1),
           ("ybrac-t", 1), ("y-bushing", 3), ("z-motor-mount", 2),
           ("wade", 1), ("wade-big", 1), ("wade-small", 1)]

PARTS = [_p(n, q) for n, q in PRINTED] + [
    Part("M8 nut", 100, "fastener", 2.0, 0.03), Part("M8 washer", 100, "fastener", 1.5, 0.02, ("cnc",),
         "cut from imported sheet on a router (assumption: router can cut thin aluminium)", feedstock="aluminium sheet"),
    Part("M3x20 bolt", 50, "fastener", 3.0, 0.05), Part("M3 nut", 50, "fastener", 0.3, 0.02),
    Part("M3 washer", 50, "fastener", 0.1, 0.01, ("cnc",), "as M8 washer", feedstock="aluminium sheet"),
    Part("M3x10 bolt", 6, "fastener", 1.5, 0.05), Part("M3x8 grub screw", 2, "fastener", 0.8, 0.05),
    Part("M8x50 grub screw / rod", 1, "fastener", 15.0, 0.3),
    Part("M3x10 bolt (extruder)", 3, "fastener", 1.5, 0.05), Part("M3x40 bolt (extruder)", 3, "fastener", 4.0, 0.08),
    Part("M3x8 grub screw (extruder)", 1, "fastener", 0.8, 0.05), Part("M8x20 grub screw / rod (extruder)", 1, "fastener", 6.0, 0.2),
    Part("M8x50 hobbed bolt", 1, "fastener", 20.0, 3.0),
    Part("LM8UU linear bearing", 10, "bearing", 8.0, 1.0, variant="lm8uu"),
    Part("8x25 mm brass bushing", 10, "bearing", 12.0, 1.0, ("cast", "cnc"),
         "wiki lists brass bushings as the alternative to LM8UU; casting a blank and boring it on the router is an assumption",
         variant="brass", feedstock="brass/bronze ingot"),
    Part("608 bearing", 3 + 3, "bearing", 12.0, 0.5),
    Part("370 mm M8 threaded rod", 6, "rod", 110.0, 0.8), Part("294 mm M8 threaded rod", 4, "rod", 90.0, 0.7),
    Part("440 mm M8 threaded rod", 3, "rod", 130.0, 1.0), Part("210 mm M8 threaded rod", 2, "rod", 65.0, 0.5),
    Part("350 mm 8 mm smooth rod", 2, "rod", 140.0, 1.5), Part("405 mm 8 mm smooth rod", 2, "rod", 160.0, 1.7),
    Part("420 mm 8 mm smooth rod", 2, "rod", 165.0, 1.8),
    Part("840 mm GT2 belt", 1, "belt", 5.0, 2.0), Part("900 mm GT2 belt", 1, "belt", 5.0, 2.0),
    Part("16-tooth GT2 pulley", 2, "motion", 10.0, 2.0, ("cnc",),
         "wiki recommends machined pulleys; cutting GT2 teeth on a router is an optimistic assumption", feedstock="aluminium bar"),
    Part("vinyl tubing 1.5 cm", 2, "other", 2.0, 0.2),
    Part("MDF print-bed plate", 1, "other", 150.0, 2.0, ("cnc", "laser"), "flat sheet cut to size", feedstock="MDF sheet"),
    Part("glass / mirror bed", 1, "other", 300.0, 4.0),
    Part("NEMA17 stepper motor", 5, "electronics", 280.0, 10.0), Part("controller electronics", 1, "electronics", 80.0, 30.0),
    Part("hot end (e.g. J-head)", 1, "electronics", 60.0, 20.0), Part("thermistor + heater", 1, "electronics", 10.0, 5.0),
    Part("end-stop switch (inferred from 3 holders)", 3, "electronics", 5.0, 1.0),
]

# Seed shops: the processes available. Machines other than the printer have no BOM here.
SHOPS = {"printer": {"fdm"}, "printer+cnc+laser": {"fdm", "cnc", "laser"},
         "printer+cnc+laser+casting": {"fdm", "cnc", "laser", "cast"}}
