"""Reversed-load buckling factor of the whole L-bracket with several element layers through the
thickness, and the width that reaches the floor of 3 at each layer count.

Reuses the width bisection and plate mass of `simdesign-revwidth` and the 3D eigenbuckling model of
`simdesign-lbuckle` (through `simdesign-revgauge`, whose roots at one layer are the baseline).
Factors are critical load / 100 N.
"""
import os, sys
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "..", "simdesign-revwidth", "src"))
from simdesign_revwidth import sweep as sw  # noqa: E402

mass_g = sw.mass_g
find_width = sw.find_width

# revgauge's one-layer roots on the coarse mesh (simdesign-revgauge/experiments/sweep.txt)
ONE_LAYER_ROOT = {1.5: 22.5, 2.0: 11.84, 2.5: 6.81, 3.0: 4.31}


def factor(w, b, nz, base=(2, 18, 14)):
    return sw.factor(w, b=b, sign=-1, mesh=(*base, nz))


def root(b, nz, lo, hi, tol=0.1, base=(2, 18, 14), on_eval=None):
    """Smallest width in [lo, hi] with factor >= 3 for nz layers; returns (w, mass, history)."""
    def f(w):
        v = factor(w, b, nz, base)
        if on_eval:
            on_eval(w, v)
        return v
    w, hist = find_width(3.0, lo, hi, f, tol=tol)
    return w, mass_g(w, b), hist
