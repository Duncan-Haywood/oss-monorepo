"""Floor-joist natural frequency with the subfloor acting as a partial T-beam flange.

Effective bending stiffness of a two-part section (flange = subfloor panel, web = joist) by the
gamma method for mechanically jointed beams (Moehler; the form used in Eurocode 5, EN 1995-1-1
Annex B), written here from the parallel-axis theorem rather than copied:

    EI = E_w I_w + E_f I_f + E_w A_w a_w^2 + gamma E_f A_f a_f^2

gamma = 0 is a joist and a loose panel (no composite action), gamma = 1 a rigid glued T-beam.
The neutral axis puts a_w and a_f at distances that balance the two axial stiffnesses,
gamma E_f A_f a_f = E_w A_w a_w, with a_f + a_w = (h_f + h_w) / 2.
Frequency then follows house-vibration: f1 = pi / (2 L^2) sqrt(EI g / w).
Strength and deflection checks stay joist-alone (conservative); only frequency sees the flange.
Panel modulus, flange width and gamma are sweep parameters, not sourced material values.
"""
import math

from house_spans.model import Member
from house_vibration.model import E_PSI, G


def flange_width(m, effective_in=None):
    """Panel width acting with one joist: its tributary spacing unless a narrower width is given."""
    return m.spacing_in if effective_in is None else min(effective_in, m.spacing_in)


def ei_effective(m, panel_t_in, panel_e_psi, gamma, effective_in=None):
    """Effective EI (lb in^2) of one joist plus its tributary strip of subfloor."""
    ew, ef = E_PSI[m.species], panel_e_psi
    aw_, hw = m.b * m.d, m.d
    bf = flange_width(m, effective_in)
    af, hf = bf * panel_t_in, panel_t_in
    iw, if_ = m.b * hw ** 3 / 12.0, bf * hf ** 3 / 12.0
    s = (hw + hf) / 2.0  # centroid-to-centroid distance
    num = gamma * ef * af
    a_w = num * s / (num + ew * aw_) if num > 0 else 0.0
    a_f = s - a_w
    return ew * iw + ef * if_ + ew * aw_ * a_w ** 2 + gamma * ef * af * a_f ** 2


def frequency_hz(m, span_ft, panel_t_in=23 / 32, panel_e_psi=0.5e6, gamma=0.5, effective_in=None, weight_psf=10.0):
    L = span_ft * 12.0 + m.bearing_in
    w = weight_psf * m.spacing_in / 12.0 / 12.0
    return math.pi / (2.0 * L * L) * math.sqrt(ei_effective(m, panel_t_in, panel_e_psi, gamma, effective_in) * G / w)


def max_span(m, f_min_hz, case=None, hi_ft=40.0, **kw):
    """Longest clear span (floored to 0.01 ft) passing joist-alone strength and deflection and the composite frequency limit."""
    from house_spans.model import CASES, check, worst
    case = case or CASES["floor"]

    def ok(s):
        return worst(check(m, s, case))[1] <= 1.0 and frequency_hz(m, s, weight_psf=case.dead_psf, **kw) >= f_min_hz

    if not ok(1.0):
        return 0.0
    lo, hi = 1.0, hi_ft
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    return math.floor(lo * 100) / 100


def cheapest(span_ft, f_min_hz, sizes=("2x6", "2x8", "2x10", "2x12"), spacings=(12, 16, 19.2, 24), **kw):
    """(board feet per sq ft, size, spacing) of the least-lumber joist passing at span_ft, or None."""
    from house_spans.model import board_feet_per_sf
    opts = []
    for s in sizes:
        for sc in spacings:
            m = Member(s, spacing_in=sc)
            if max_span(m, f_min_hz, **kw) >= span_ft:
                opts.append((board_feet_per_sf(m), s, sc))
    return min(opts) if opts else None
