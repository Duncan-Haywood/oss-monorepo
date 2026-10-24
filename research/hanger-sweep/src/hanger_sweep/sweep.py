"""Sweep the fabric constants that `hanger_fit` assumes and re-score its width finding.

`hanger_fit.model` fixes bending rigidity B, stretch stiffness EA, garment weight and the strip
depth DEPTH as round numbers. Here each is varied over a range and the same drape is re-solved,
so a finding can be called robust (it holds across the range) or fragile (it moves with one
constant). Nothing in `hanger_fit` is edited: a garment is a `dataclasses.replace` of one of its
own, and DEPTH is set on the module before each solve.
"""
import dataclasses
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "hanger-fit" / "src"))
from hanger_fit import model as hf  # noqa: E402

OFFSETS = [-2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0]    # cm added to the half shoulder for the arm width
SHAPE = hf.STOCK["wood-shaped"]


def make_garment(size, base_fabric, B, mass, EA):
    """`hanger_fit` garment with B (gf cm2/cm), EA (N/m) replaced and every weight scaled by `mass`."""
    g = hf.garment(size, base_fabric)
    return dataclasses.replace(g, B=B, EA=EA, body=g.body * mass, sleeve=g.sleeve * mass, lump=g.lump * mass)


def width_curve(g, depth, shape=SHAPE, offsets=OFFSETS):
    """Shape error (cm RMS, no crease charge) of `shape` with half width = half shoulder + offset."""
    hf.DEPTH = depth
    return [hf.score(dataclasses.replace(shape, w=g.half_shoulder + o), g)["err"] for o in offsets]


def summarise(errs, offsets=OFFSETS):
    """Best offset, its error, and the error at the +1 cm offset `hanger-fit` found."""
    i = min(range(len(errs)), key=errs.__getitem__)
    return dict(best_offset=offsets[i], best_err=errs[i], err_at_1=errs[offsets.index(1.0)])
