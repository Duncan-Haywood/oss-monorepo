"""Euler-Bernoulli model of a smooth rod carrying a mid-span load, used to replace the assumed 0.9 penalty
of the ``wood-smooth-rods`` substitution in selfrep-redesign with a computed deflection.

EVERY material property and load below is an ASSUMPTION (typical handbook magnitudes, not looked up
value-by-value); the model is a simply supported rod with one central point load and no bushing clearance.
"""
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-redesign" / "src"))
from selfrep_redesign import design as rd  # noqa: E402
from selfrep_closure.bom import Part  # noqa: E402,F401

# name: (Young's modulus Pa, density kg/m3, allowable bending stress Pa)
MATERIALS = {
    "steel":    (200e9, 7850.0, 250e6),
    "aluminium": (69e9, 2700.0, 200e6),
    "hardwood": (10e9, 700.0, 50e6),     # dowel, along the grain; allowable well below modulus of rupture
    "printed-PLA": (2.5e9, 1250.0, 25e6),  # FDM, along the filament; strongly print-dependent
}
RODS = ((0.350, 2), (0.405, 2), (0.420, 2))   # (length m, count) from the selfrep-closure bill of materials
D_STD = 0.008                                  # the printer's bearings and clamps are sized for 8 mm
D_MAX_STD = 0.012                              # assumption: up to 12 mm keeps standard-ish holders


def inertia(d):
    return math.pi * d ** 4 / 64


def deflection(material, d, length, load):
    """Mid-span deflection (m) of a simply supported rod under a central point load (N)."""
    E = MATERIALS[material][0]
    return load * length ** 3 / (48 * E * inertia(d))


def stress(d, length, load):
    return (load * length / 4) * (d / 2) / inertia(d)


def mass(material, d, length):
    return MATERIALS[material][1] * math.pi * d * d / 4 * length


def min_diameter(material, delta_max, length, load, E=None):
    """Smallest diameter meeting both the deflection spec and the stress allowable."""
    Em = E if E is not None else MATERIALS[material][0]
    d_def = (load * length ** 3 / (48 * Em * delta_max) * 64 / math.pi) ** 0.25
    d_str = (load * length / 4 * 32 / (math.pi * MATERIALS[material][2])) ** (1 / 3)
    return max(d_def, d_str)


def rod_set_mass_g(material, d):
    return 1000 * sum(n * mass(material, d, L) for L, n in RODS)


def wood_design_closure(d_wood, procs, metric="mass"):
    """Closure of the full redesign with wooden rods of diameter ``d_wood`` (m): the dowel line's mass is
    recomputed from geometry instead of the assumed 30 g per rod of selfrep-redesign."""
    chosen = tuple(range(len(rd.SUBS)))  # all seven substitutions, as in the published headline row
    base = rd.SUBS[4]
    per_rod_g = rod_set_mass_g("hardwood", d_wood) / 6
    new = rd.Sub(base.name, base.removes, (Part("dowel rod", 6, "rod", per_rod_g, 0.3, ("cnc",), "geometry", feedstock="wood dowel"),), base.penalty)
    rd.SUBS[4] = new
    try:
        return rd.closure_of(rd.design(chosen), procs, metric)
    finally:
        rd.SUBS[4] = base
