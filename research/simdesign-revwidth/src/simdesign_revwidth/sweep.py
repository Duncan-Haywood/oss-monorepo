"""Width needed for the reversed-load buckling factor of the whole-L bracket to reach a floor.

Reuses the 3D hexahedral eigenbuckling model of `simdesign-lbuckle` (imported from its src/).
Factors are critical load / 100 N for b = 1.5 mm; mass is proportional to the L's plan area.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "simdesign-lbuckle", "src"))
from simdesign_lbuckle import lbracket as lb  # noqa: E402

F_REF = 100.0
RHO = 7.85e-6  # kg/mm^3, steel


def area(w, L=80.0, H=80.0):
    """Plan area of the L: vertical arm w x H plus horizontal arm (L - w) x w."""
    return w * H + (L - w) * w


def mass_g(w, b=1.5):
    return area(w) * b * RHO * 1000.0


def factor(w, b=1.5, sign=-1, mesh=(2, 18, 14, 1)):
    nw, nh, nl, nz = mesh
    return float(lb.critical_factors(w, b, k=1, sign=sign, nw=nw, nh=nh, nl=nl, nz=nz)[0] / F_REF)


def find_width(target, lo, hi, f, tol=0.02, maxit=30):
    """Smallest w in [lo, hi] with f(w) >= target, by bisection (f assumed increasing in w).
    Returns (w, history)."""
    hist = []
    flo, fhi = f(lo), f(hi)
    hist += [(lo, flo), (hi, fhi)]
    if flo >= target:
        return lo, hist
    if fhi < target:
        raise ValueError("target not bracketed")
    for _ in range(maxit):
        if hi - lo < tol:
            break
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        hist.append((mid, fm))
        if fm >= target:
            hi = mid
        else:
            lo = mid
    return hi, hist
