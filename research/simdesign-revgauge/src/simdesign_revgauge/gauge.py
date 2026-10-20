"""Minimum plate mass that clears the reversed-load buckling floor, per sheet gauge.

Reuses `simdesign-revwidth` (width root-finding, plan area, factor at any gauge), which in turn
reuses the 3D eigenbuckling model of `simdesign-lbuckle`. Factors are critical load / 100 N.
"""
import os, sys
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "..", "simdesign-revwidth", "src"))
from simdesign_revwidth import sweep as sw  # noqa: E402

area = sw.area
find_width = sw.find_width


def mass_g(w, b):
    return sw.mass_g(w, b)


def factor(w, b, mesh=(2, 18, 14, 1)):
    return sw.factor(w, b=b, sign=-1, mesh=mesh)


def min_mass_row(b, f, lo, hi, tol=0.05):
    """Smallest width with f(w) >= 3 at gauge b, and its mass. f is a callable of w.
    If the floor is already met at lo, the root is lo (a lower bound: widths below lo are not tried)."""
    w, hist = find_width(3.0, lo, hi, f, tol=tol)
    return w, mass_g(w, b), hist
