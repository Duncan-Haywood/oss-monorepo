"""Natural frequency of a simple-span joist, added to the house-spans strength and deflection checks.

f1 = (pi / (2 L^2)) sqrt(E I g / w), the first mode of a simply supported Euler-Bernoulli beam
carrying a uniform weight w per unit length (derived in the tests against a mass-spring check).
Only the joist alone is modelled: subfloor composite action, which stiffens a real floor, and the
live-load mass of people and furniture, which lowers its frequency, are both left out. The frequency
limit is a policy knob, swept in the experiment; no code-book vibration criterion is copied.
"""
import math

from house_spans.model import CASES, Member, board_feet_per_sf, check, worst

G = 386.4  # in/s^2
E_PSI = {"SPF": 1.4e6, "DF-L": 1.6e6}


def frequency_hz(m, span_ft, weight_psf=10.0):
    """First natural frequency of the joist alone, mass from weight_psf (default: the floor's dead load)."""
    L = span_ft * 12.0 + m.bearing_in
    I = m.b * m.d ** 3 / 12.0
    w = weight_psf * m.spacing_in / 12.0 / 12.0  # lb per inch of span
    return math.pi / (2.0 * L * L) * math.sqrt(E_PSI[m.species] * I * G / w)


def passes(m, span_ft, f_min_hz, case=CASES["floor"]):
    return worst(check(m, span_ft, case))[1] <= 1.0 and frequency_hz(m, span_ft, case.dead_psf) >= f_min_hz


def max_span(m, f_min_hz, case=CASES["floor"], hi_ft=40.0):
    """Longest clear span (floored to 0.01 ft) passing strength, deflection and the frequency limit.

    Frequency falls with span as the other ratios rise, so bisection is exact.
    """
    if not passes(m, 1.0, f_min_hz, case):
        return 0.0
    lo, hi = 1.0, hi_ft
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if passes(m, mid, f_min_hz, case) else (lo, mid)
    return math.floor(lo * 100) / 100


def cheapest(span_ft, f_min_hz, sizes=("2x6", "2x8", "2x10", "2x12"), spacings=(12, 16, 19.2, 24)):
    """(board feet per sq ft, size, spacing) of the least-lumber joist that passes, or None."""
    opts = []
    for s in sizes:
        for sc in spacings:
            m = Member(s, spacing_in=sc)
            if passes(m, span_ft, f_min_hz):
                opts.append((board_feet_per_sf(m), s, sc))
    return min(opts) if opts else None
