"""Aluminium smooth rods as a substitution in selfrep-redesign, sized with the selfrep-rodbeam beam model.

Compares hardwood and aluminium rods that hold the same mid-span deflection spec: does the rod fit the 12 mm
holder limit, and what happens to mass closure and to the mass of stock the shop must import?

ASSUMPTIONS (inherited from selfrep-rodbeam, all stylised): material properties, the 5 N load, the 12 mm limit.
New here: aluminium bar is imported stock cut to length on the router (the same assumption selfrep-closure
makes for washers); its surface is taken as adequate for the printed/brass bushings. Nothing was measured.
"""
import pathlib
import sys

_R = pathlib.Path(__file__).resolve().parents[3]
for p in ("selfrep-rodbeam", "selfrep-redesign", "selfrep-closure"):
    sys.path.insert(0, str(_R / p / "src"))
from selfrep_rodbeam import beam as b  # noqa: E402
from selfrep_redesign import design as rd  # noqa: E402
from selfrep_closure.bom import Part  # noqa: E402

PROCS = {"fdm", "cnc", "laser"}
FEEDSTOCK = {"hardwood": "wood dowel", "aluminium": "aluminium bar"}


def rod_part(material, d):
    """Six-rod replacement line with per-rod mass from geometry."""
    g = b.rod_set_mass_g(material, d) / 6
    return Part(f"{material} rod", 6, "rod", g, 0.3, ("cnc",), "stock cut to length on the router (assumption)",
                feedstock=FEEDSTOCK[material])


def design_with(material, d):
    """All seven redesign substitutions, with the rod line replaced by ``material`` rods of diameter d (m)."""
    base = rd.SUBS[4]
    rd.SUBS[4] = rd.Sub(base.name, base.removes, (rod_part(material, d),), base.penalty)
    try:
        return rd.design(tuple(range(len(rd.SUBS))))
    finally:
        rd.SUBS[4] = base


def closure(material, d, metric="mass"):
    return rd.closure_of(design_with(material, d), PROCS, metric)


def imported_stock_g(parts):
    """Mass (g) of all raw stock the makeable lines consume, i.e. what the shop still has to import for them."""
    return sum(p.qty * p.mass_g for p in parts if p.feedstock and p.makers)


def vitamin_mass_g(parts):
    return sum(p.qty * p.mass_g for p in parts if not rd.makeable(p, PROCS))


def fits(d):
    return d <= b.D_MAX_STD + 1e-12
