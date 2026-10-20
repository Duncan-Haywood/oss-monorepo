import math

import pytest

from house_spans.model import Member
from house_vibration.model import E_PSI, frequency_hz as bare_f
from house_composite.model import ei_effective, frequency_hz, max_span, cheapest


def transformed_t_ei(m, t, ef):
    """Independent rigid T-beam: transform the panel to joist material, find the centroid, sum I about it."""
    ew = E_PSI[m.species]
    n = ef / ew
    aw, af = m.b * m.d, m.spacing_in * t * n
    yw, yf = m.d / 2, m.d + t / 2
    yc = (aw * yw + af * yf) / (aw + af)
    iw = m.b * m.d ** 3 / 12 + aw * (yw - yc) ** 2
    if_ = m.spacing_in * t ** 3 / 12 * n + af * (yf - yc) ** 2
    return ew * (iw + if_)


def test_gamma_one_equals_transformed_section():
    for size in ("2x8", "2x10", "2x12"):
        m = Member(size)
        assert ei_effective(m, 23 / 32, 0.5e6, 1.0) == pytest.approx(transformed_t_ei(m, 23 / 32, 0.5e6), rel=1e-12)


def test_gamma_zero_is_sum_of_separate_stiffnesses():
    m = Member("2x10")
    t, ef = 23 / 32, 0.5e6
    want = E_PSI["SPF"] * m.b * m.d ** 3 / 12 + ef * m.spacing_in * t ** 3 / 12
    assert ei_effective(m, t, ef, 0.0) == pytest.approx(want, rel=1e-12)
    assert frequency_hz(m, 15, gamma=0) == pytest.approx(bare_f(m, 15), rel=0.01)  # the loose panel adds under 1%


def test_stiffness_and_frequency_rise_with_gamma_and_panel_modulus():
    m = Member("2x10")
    prev = 0
    for g in (0, 0.25, 0.5, 0.75, 1.0):
        e = ei_effective(m, 23 / 32, 0.5e6, g)
        assert e > prev
        prev = e
    assert ei_effective(m, 23 / 32, 1.0e6, 0.5) > ei_effective(m, 23 / 32, 0.5e6, 0.5)


def test_narrow_flange_gives_less_stiffness():
    m = Member("2x10", spacing_in=24)
    assert ei_effective(m, 23 / 32, 0.5e6, 1.0, effective_in=12) < ei_effective(m, 23 / 32, 0.5e6, 1.0)


def test_max_span_matches_house_vibration_without_composite_and_grows_with_it():
    from house_vibration.model import max_span as bare
    m = Member("2x10")
    assert max_span(m, 12, gamma=0, panel_e_psi=1.0) == pytest.approx(bare(m, 12), abs=0.15)
    assert max_span(m, 12, gamma=1.0) > bare(m, 12)
    assert max_span(m, 0, gamma=1.0) == max_span(m, 0, gamma=0)  # no limit: strength/deflection govern


def test_cheapest_never_costs_more_with_composite_action():
    from house_vibration.model import cheapest as bare
    for span in (10, 12, 14):
        b, c = bare(span, 15), cheapest(span, 15, gamma=1.0)
        assert c is not None and (b is None or c[0] <= b[0] + 1e-12)
