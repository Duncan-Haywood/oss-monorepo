"""Span and sizing checks for simple-span sawn-lumber members, NDS allowable-stress design.

Everything is derived from first principles: beam formulas plus base design values. No span table is
copied. Units: inches, pounds, psi; spans in feet at the interface.

Checks (all simple span, uniform load, laterally supported compression edge, dry service, normal
temperature, no incising):
  bending     fb = M/S           <= Fb' = Fb CD CF Cr          (NDS 3.3, 4.3)
  shear       fv = 1.5 V/A at d  <= Fv' = Fv CD                (NDS 3.4.3.1: V taken at d from the face)
  deflection  5 w L^4/(384 E I)  <= L/live_limit (live load alone) and L/total_limit (total load)
  bearing     R/(b lb)           <= Fc_perp'                   (NDS 3.10; no Cb credit, so conservative)
"""
import math
from dataclasses import dataclass, replace

T = 1.5  # actual thickness of any 2x member
DEPTH = {"2x4": 3.5, "2x6": 5.5, "2x8": 7.25, "2x10": 9.25, "2x12": 11.25}
CF_B = {"2x4": 1.5, "2x6": 1.3, "2x8": 1.2, "2x10": 1.1, "2x12": 1.0}  # size factor, bending (No. 2, 2 in thick)
CR = 1.15  # repetitive-member factor: three or more members at <= 24 in, load shared by sheathing

# Base design values, psi, No. 2 grade, 2 to 4 in thick, 5 in and wider (NDS Supplement Table 4A).
# SPF values as reprinted in the NELMA document cited in the README. The Douglas Fir-Larch values were
# not checked against a copy of the Supplement in this project: verify them before relying on them.
SPECIES = {
    "SPF": dict(Fb=875.0, Fv=135.0, Fc_perp=425.0, E=1.4e6),
    "DF-L": dict(Fb=900.0, Fv=180.0, Fc_perp=625.0, E=1.6e6),
}


@dataclass(frozen=True)
class Case:
    """A load case. Loads are psf on plan (horizontal projection); durations follow NDS Table 2.3.2."""
    name: str
    dead_psf: float
    live_psf: float
    CD: float  # load-duration factor of the shortest-duration load: 1.0 floor, 1.15 snow, 1.25 roof live
    live_limit: float  # live-load deflection limit as L/x
    total_limit: float  # total-load deflection limit as L/x


# Common cases. The loads are the usual minimums (ASCE 7 Table 4.3-1 residential floor 40 psf live,
# sleeping rooms 30; ceiling without storage 10 psf live); dead loads are typical assumptions.
CASES = {
    "floor": Case("floor", 10.0, 40.0, 1.0, 360, 240),
    "floor-sleeping": Case("floor-sleeping", 10.0, 30.0, 1.0, 360, 240),
    "ceiling": Case("ceiling", 5.0, 10.0, 1.0, 240, 240),  # ceiling joists with no attic storage
    "roof-snow30": Case("roof-snow30", 15.0, 30.0, 1.15, 180, 180),  # rafters with a ceiling not attached
    "roof-snow50": Case("roof-snow50", 15.0, 50.0, 1.15, 180, 180),
}


@dataclass(frozen=True)
class Member:
    size: str = "2x10"
    plies: int = 1  # 1 for a joist or rafter, 2 or 3 for a built-up header or beam
    species: str = "SPF"
    spacing_in: float = 16.0  # on-centre; for a beam this is the tributary width in inches
    repetitive: bool = True  # Cr applies only to single members at <= 24 in; forced off when plies > 1
    bearing_in: float = 1.5  # bearing length at each end
    pitch: float = 0.0  # roof rise per 12 of run; 0 for a flat member

    @property
    def b(self):
        return self.plies * T

    @property
    def d(self):
        return DEPTH[self.size]


def _loads(m, case):
    """Uniform loads in lb per inch of horizontal span: (dead, live)."""
    cos = 1.0 / math.sqrt(1.0 + (m.pitch / 12.0) ** 2)
    trib_ft = m.spacing_in / 12.0
    # a dead load stated on the slope becomes larger per unit of plan area
    return case.dead_psf / cos * trib_ft / 12.0, case.live_psf * trib_ft / 12.0


def check(m, span_ft, case, creep=False):
    """Ratios demand/capacity for one member at one clear span (1.0 = at capacity).

    The design span is the clear span plus the bearing length, as NDS 3.2.1 sets it for simple spans.
    creep=True multiplies the dead load by 1.5 in the total-load deflection check (NDS 3.5.2, seasoned).
    """
    sp = SPECIES[m.species]
    L = span_ft * 12.0 + m.bearing_in
    wD, wL = _loads(m, case)
    w = wD + wL
    b, d = m.b, m.d
    S, A, I = b * d * d / 6.0, b * d, b * d ** 3 / 12.0
    cos = 1.0 / math.sqrt(1.0 + (m.pitch / 12.0) ** 2)
    Cr = CR if (m.repetitive and m.plies == 1 and m.spacing_in <= 24.0) else 1.0
    Fb = sp["Fb"] * case.CD * CF_B[m.size] * Cr
    Fv = sp["Fv"] * case.CD
    M = w * L * L / 8.0  # exact for a pitched member under loads measured on plan
    V = w * (L / 2.0 - d) * cos
    R = w * L / 2.0
    wD_eff = 1.5 * wD if creep else wD
    # perpendicular deflection of a pitched member: 1/cos^2 times the flat value (see README)
    k = 5.0 * L ** 4 / (384.0 * sp["E"] * I * cos ** 2)
    return {
        "bending": (M / S) / Fb,
        "shear": (1.5 * V / A) / Fv,
        "deflection live": k * wL / (L / case.live_limit),
        "deflection total": k * (wD_eff + wL) / (L / case.total_limit),
        "bearing": (R / (b * m.bearing_in)) / sp["Fc_perp"],
    }


def worst(ratios):
    k = max(ratios, key=ratios.get)
    return k, ratios[k]


def max_span(m, case, creep=False, hi_ft=60.0):
    """Longest clear span in feet (to 1/100 ft) at which every check passes, and the check that governs.

    Every ratio grows with span, so bisection is exact. Returns (0.0, name) if the member fails at 1 ft.
    """
    lo, hi = 0.0, hi_ft
    if worst(check(m, 1.0, case, creep))[1] > 1.0:
        return 0.0, worst(check(m, 1.0, case, creep))[0]
    for _ in range(60):
        mid = (lo + hi) / 2
        if worst(check(m, mid, case, creep))[1] <= 1.0:
            lo = mid
        else:
            hi = mid
    return math.floor(lo * 100) / 100, worst(check(m, lo + 1e-6, case, creep))[0]


def lateral_note(m):
    """NDS 4.4.1 lateral support needed for the d/b ratio. The checks above assume it is provided."""
    r = m.d / m.b
    if r <= 2:
        return "none needed"
    if r <= 4:
        return "ends held in position (blocking or hangers at the ends)"
    if r <= 5:
        return "compression edge held in line (sheathing or purlins)"
    if r <= 6:
        return "bridging or cross-bracing at 8 ft or less"
    if r <= 7:
        return "both edges held in line"
    return "beyond NDS 4.4.1 limits for sawn lumber"


def size_member(span_ft, case, species="SPF", spacing_in=16.0, plies=1, sizes=("2x6", "2x8", "2x10", "2x12"),
                pitch=0.0, bearing_in=1.5, creep=False):
    """Smallest size that carries span_ft, or None. Also returns the governing check at that size."""
    for s in sizes:
        m = Member(s, plies, species, spacing_in, True, bearing_in, pitch)
        k, r = worst(check(m, span_ft, case, creep))
        if r <= 1.0:
            return s, k, r
    return None


def board_feet_per_sf(m):
    """Lumber in a joist or rafter layer per square foot of plan, nominal size (no waste)."""
    nominal = {"2x4": 4, "2x6": 6, "2x8": 8, "2x10": 10, "2x12": 12}[m.size]
    return m.plies * 2 * nominal / 12.0 / (m.spacing_in / 12.0)
