"""Four fabrics with measured KES-FB bending rigidity and weight, scored on `hanger_fit`'s drape.

Source: Ramaiah, Radhalakshmi and Nachane, "Comparative Analysis of Low-Stress Mechanical
Properties of Woven and Knitted Apparel Fabrics" (fibre2fashion.com article PDF, Table 3; mean of
10 tests on 5 specimens, dyed, unfinished fabrics). B in gf cm2/cm, W in mg/cm2.
Stretch stiffness EA is not in that table (it lists LT, WT and RT) so it is swept, not taken.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "hanger-sweep" / "src"), str(ROOT / "hanger-fit" / "src")]
from hanger_sweep.sweep import OFFSETS, SHAPE, make_garment, summarise, width_curve  # noqa: E402,F401

# code: (description, B, W)
KES = {
    "A": ("single jersey, 100% cotton (tee-like)", 0.0066, 12.55),
    "B": ("single jersey, 95% cotton / 5% polyurethane", 0.0162, 15.86),
    "C": ("plain woven shirting, 100% cotton", 0.0270, 12.52),
    "D": ("plain woven suiting/bottom-weight, 100% cotton", 0.1249, 24.60),
}
REF = "A"                  # the tee-like jersey carries hanger-fit's tee mass (x1)
EAS = (40.0, 150.0, 800.0)
DEPTH = 0.20


def kes_garment(code, EA, size="M"):
    """A size M tee-shaped garment cut from fabric `code`: mass scaled by W / W(A), B as measured."""
    _, B, W = KES[code]
    return make_garment(size, "tee", B, W / KES[REF][2], EA)


def best_offsets(code, EA, size="M"):
    g = kes_garment(code, EA, size)
    errs = width_curve(g, DEPTH)
    return summarise(errs), errs
