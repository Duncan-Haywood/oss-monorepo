"""Two-span joists with unequal spans (a beam or bearing wall off the middle), NDS checks as in house-continuous.

`house_continuous.model.Beam` already solves unequal spans; this module adds the checks that
`house_continuous.model.check` makes for equal spans only. Each span's design length is its clear span
plus the bearing length; live load acts on every subset of spans; deflection is checked span by span
against that span's own length divided by the limit.
"""
import itertools
import math

from house_continuous.model import NEL, Beam
from house_spans.model import CF_B, CR, SPECIES, _loads


def check(m, clear_ft, case, interior_bearing_in=3.5):
    """Demand/capacity ratios for a continuous member whose spans have the clear lengths clear_ft (feet)."""
    sp = SPECIES[m.species]
    spans = [c * 12.0 + m.bearing_in for c in clear_ft]
    n = len(spans)
    wD, wL = _loads(m, case)
    b, d = m.b, m.d
    S, A, I = b * d * d / 6.0, b * d, b * d ** 3 / 12.0
    cos = 1.0 / math.sqrt(1.0 + (m.pitch / 12.0) ** 2)
    Cr = CR if (m.repetitive and m.plies == 1 and m.spacing_in <= 24.0) else 1.0
    Fb = sp["Fb"] * case.CD * CF_B[m.size] * Cr
    Fv = sp["Fv"] * case.CD
    EI = sp["E"] * I
    patterns = list(itertools.product((False, True), repeat=n))
    Mmax = Vmax = Rend = Rint = 0.0
    dl = dt = 0.0
    for on in patterns:
        bm = Beam(spans, EI, [wD + (wL if o else 0.0) for o in on])
        Mmax = max(Mmax, max(abs(bm.moment(x)) for x in bm.x))
        for i, nn in enumerate(bm.support_nodes):
            xs = bm.x[nn]
            for off, side in ((d, 1), (-d, -1)):
                if 0 <= xs + off <= bm.x[-1]:
                    Vmax = max(Vmax, abs(bm.shear(xs + off, side)) * cos)
            if i in (0, n):
                Rend = max(Rend, bm.R[i])
            else:
                Rint = max(Rint, bm.R[i])
        dt = max(dt, _span_defl(bm, spans, case.total_limit))
        if any(on):
            live = Beam(spans, EI, [wL if o else 0.0 for o in on])
            dl = max(dl, _span_defl(live, spans, case.live_limit))
    k = 1.0 / cos ** 2
    return {
        "bending": (Mmax / S) / Fb,
        "shear": (1.5 * Vmax / A) / Fv,
        "deflection live": k * dl,
        "deflection total": k * dt,
        "bearing": max(Rend / (b * m.bearing_in), Rint / (b * interior_bearing_in)) / sp["Fc_perp"],
    }


def _span_defl(bm, spans, limit):
    """Largest over spans of (peak deflection in the span) / (span length / limit)."""
    return max(max(abs(bm.v[i]) for i in range(NEL * s, NEL * (s + 1) + 1)) / (L / limit)
               for s, L in enumerate(spans))


def worst(r):
    k = max(r, key=r.get)
    return k, r[k]


def max_total(m, case, ratio, interior_bearing_in=3.5, hi_ft=40.0):
    """Largest total clear width L1 + L2 (feet, to 0.01) with L2 = ratio * L1, ratio <= 1, and what governs.

    Every ratio grows with the longer span, so bisection on L1 is exact to the resolution.
    """
    def ok(l1):
        return worst(check(m, [l1, ratio * l1], case, interior_bearing_in))[1] <= 1.0
    lo, hi = 1.0, hi_ft
    if not ok(lo):
        return 0.0, worst(check(m, [lo, ratio * lo], case, interior_bearing_in))[0]
    for _ in range(14):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    tot = math.floor(lo * (1 + ratio) * 100) / 100
    return tot, worst(check(m, [lo + 0.01, ratio * (lo + 0.01)], case, interior_bearing_in))[0]


def end_reaction_min_lb(m, clear_ft, case):
    """Smallest end reaction (lb per joist; negative = the end lifts off its support) over the live-load patterns.

    Dead load acts on both spans, live load on neither, either or both. Dead load is at its full value (no 0.6 factor),
    so real uplift is worse. The connection of the end is not modelled.
    """
    sp = SPECIES[m.species]
    spans = [c * 12.0 + m.bearing_in for c in clear_ft]
    wD, wL = _loads(m, case)
    EI = sp["E"] * m.b * m.d ** 3 / 12.0
    low = float("inf")
    for live_on in itertools.product((False, True), repeat=2):
        bm = Beam(spans, EI, [wD + (wL if on else 0.0) for on in live_on])
        low = min(low, bm.R[0], bm.R[2])
    return low
