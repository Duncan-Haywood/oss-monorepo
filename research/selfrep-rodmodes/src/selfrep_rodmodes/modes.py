"""First natural frequency of a carriage riding on a simply supported smooth rod (selfrep-rodbeam's beam model),
used to derive the rod's stiffness spec from a vibration target instead of assuming a sag limit.

Model: carriage point mass M at mid-span of a uniform simply supported rod of mass m. Rayleigh's single-mode
estimate with the beam's effective mass 17/35 m (textbook result, e.g. Roark; Blevins, *Formulas for Natural
Frequency and Mode Shape*) gives f = (1/2pi) sqrt(k / (M + 17/35 m)), k = 48 E I / L^3.
EVERY number (carriage mass, target frequency, materials) is an ASSUMPTION; see selfrep-rodbeam.
"""
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-rodbeam" / "src"))
from selfrep_rodbeam import beam as rb  # noqa: E402

MATERIALS = rb.MATERIALS
RODS = rb.RODS
RAYLEIGH = 17 / 35
M_CARRIAGE = 0.30     # kg, assumed carriage + hotend/extruder mass per rod
L_LONG = 0.420


def stiffness(material, d, length, E=None):
    E = MATERIALS[material][0] if E is None else E
    return 48 * E * rb.inertia(d) / length ** 3


def frequency(material, d, length, M=M_CARRIAGE, E=None):
    """First natural frequency (Hz) of mass M on the rod."""
    m = rb.mass(material, d, length)
    return math.sqrt(stiffness(material, d, length, E) / (M + RAYLEIGH * m)) / (2 * math.pi)


def min_diameter(material, f_target, length, M=M_CARRIAGE, E=None, hi=0.2):
    """Smallest diameter (m) with frequency >= f_target (bisection; frequency rises with d), or None if even
    ``hi`` fails (it cannot: f -> d/L^2 sqrt(E/rho) grows without bound)."""
    if frequency(material, hi, length, M, E) < f_target:
        return None
    lo = 1e-4
    for _ in range(200):
        mid = (lo + hi) / 2
        if frequency(material, mid, length, M, E) >= f_target:
            hi = mid
        else:
            lo = mid
    return hi


def rod_only_frequency(material, d, length):
    """Limit M -> 0: the rod's own first mode (simply supported uniform beam is pi/2 sqrt(EI/(rho A L^4)))
    for reference, from the Rayleigh formula with the 17/35 correction (it overestimates by a few percent)."""
    return frequency(material, d, length, M=0.0)
