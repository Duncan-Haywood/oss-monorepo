"""Steady-state flow sharing of simultaneous actuators on an open-centre parallel valve.

Each section is an orifice, q = A sqrt(p_s - p_i) (flows L/min, pressures bar, A absorbs the
discharge coefficient); the centre bypass is one more orifice, q_b = A_b sqrt(p_s), whose area closes as
sections open. The area of section i is sized so that, alone, it passes its demanded flow q_i at its
own load pressure; with several open, p_s settles where the fixed pump flow is used up, and the
low-pressure actuator takes more than it was sized for. No operator feathering is modelled, so
this is the slowdown the circuit imposes before a person corrects it. A load-sensing circuit with
pressure compensators holds the demanded flows while the pump can supply them (ratio 1).
"""
from math import sqrt


def _bisect(f, lo, hi, n=80):
    flo = f(lo)
    for _ in range(n):
        mid = 0.5 * (lo + hi)
        if (f(mid) > 0) == (flo > 0):
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def bypass_area(q_pump, p_n):
    """Centre-bypass orifice area giving neutral drop p_n at full pump flow."""
    return q_pump / sqrt(p_n)


def section_area(q_i, p_i, q_pump, a_b0, k=1.0, p_max=250.0):
    """Area that passes q_i alone at load pressure p_i with the bypass closed down to a_b0 - k A_i (k = 1: the bypass area shrinks one-for-one with the section
    opening; k > 1 closes faster, k < 1 slower)."""
    def resid(ps):
        a = q_i / sqrt(ps - p_i)
        return (a_b0 - k * a) * sqrt(ps) - (q_pump - q_i)
    # resid falls from +inf-ish near p_i; root exists when q_i < q_pump
    hi = p_i + 400.0
    while resid(hi) < 0:  # a fast-closing bypass (large k) puts the sizing root far above 400 bar
        hi = p_i + 2.0 * (hi - p_i)
    ps = min(_bisect(resid, p_i + 1e-6, hi), p_max)  # a sizing pressure above relief cannot occur: size at relief
    return q_i / sqrt(ps - p_i)


def shared_flows(demands, q_pump, p_n, p_relief=250.0, k=1.0):
    """demands: [(p_i, q_i)]. Returns flows each actuator gets with all sections open, L/min."""
    a_b0 = bypass_area(q_pump, p_n)
    areas = [section_area(q, p, q_pump, a_b0, k) for p, q in demands]
    a_b = max(a_b0 - k * sum(areas), 0.0)

    def resid(ps):
        return sum(a * sqrt(max(ps - p, 0.0)) for a, (p, _) in zip(areas, demands)) + a_b * sqrt(ps) - q_pump
    ps = _bisect(resid, 1e-6, p_relief)
    return [a * sqrt(max(ps - p, 0.0)) for a, (p, _) in zip(areas, demands)]


def phase_slowdown(demands, q_pump, p_n, k=1.0):
    """Factor by which the phase lasts longer: the slowest actuator sets it, capped at the number of
    actuators (the bound where they move one after the other, which also covers a stalled one)."""
    if len(demands) < 2:
        return 1.0
    got = shared_flows(demands, q_pump, p_n, k=k)
    return min(float(len(demands)), max(1.0, max(q / max(g, 1e-9) for (_, q), g in zip(demands, got))))
