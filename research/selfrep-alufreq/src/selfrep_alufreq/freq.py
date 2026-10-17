"""Aluminium and hardwood rods sized to a natural-frequency target (selfrep-rodmodes) instead of a sag spec.

Reuses selfrep-alurod's closure bookkeeping (rod line replaced inside the selfrep-redesign substitutions).
ASSUMPTIONS (all inherited, stylised): material constants, 0.3 kg carriage, 12 mm holder limit, bar stock cut on
the router with an adequate surface. Target frequencies are swept, not derived. Nothing was measured.
"""
import pathlib
import sys

_R = pathlib.Path(__file__).resolve().parents[3]
for p in ("selfrep-alurod", "selfrep-rodmodes", "selfrep-rodbeam", "selfrep-redesign", "selfrep-closure"):
    sys.path.insert(0, str(_R / p / "src"))
from selfrep_alurod import alu  # noqa: E402
from selfrep_rodmodes import modes as m  # noqa: E402

L = m.L_LONG


def diameter(material, f_target, M=m.M_CARRIAGE):
    """Smallest diameter (m) of the longest rod reaching f_target."""
    return m.min_diameter(material, f_target, L, M)


def row(material, f_target, M=m.M_CARRIAGE):
    d = diameter(material, f_target, M)
    parts = alu.design_with(material, d)
    return {"d": d, "fits": alu.fits(d), "mass_closure": alu.closure(material, d),
            "stock_g": alu.imported_stock_g(parts), "vitamin_g": alu.vitamin_mass_g(parts)}


def max_frequency_within_holder(material, M=m.M_CARRIAGE):
    """Highest frequency reachable at the holder limit (Hz)."""
    return m.frequency(material, alu.b.D_MAX_STD, L, M)
