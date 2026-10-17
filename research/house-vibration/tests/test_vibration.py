import math

import pytest

from house_spans.model import CASES, Member, board_feet_per_sf
from house_vibration.model import G, cheapest, frequency_hz, max_span, passes


def test_frequency_matches_hand_calculation():
    # 2x10 SPF at 16 in, 15 ft clear, 10 psf dead: L = 181.5 in, I = 98.93 in4, w = 0.9259 lb/in
    m = Member("2x10")
    L, I, w = 15 * 12 + 1.5, 1.5 * 9.25 ** 3 / 12, 10 * 16 / 144
    f = math.pi / (2 * L * L) * math.sqrt(1.4e6 * I * G / w)
    assert frequency_hz(m, 15) == pytest.approx(f, rel=1e-12)
    assert 10.0 < f < 12.5  # worked value is about 11.4 Hz


def test_frequency_equals_static_deflection_form():
    # f1 = (pi/2) sqrt(5 g / (384 delta)) (about 3.52/sqrt(delta in) Hz), delta the static midspan deflection under the same weight
    m = Member("2x8", spacing_in=24)
    L, I, w = 10 * 12 + 1.5, 1.5 * 7.25 ** 3 / 12, 10 * 24 / 144
    delta = 5 * w * L ** 4 / (384 * 1.4e6 * I)
    assert frequency_hz(m, 10) == pytest.approx(math.pi / 2 * math.sqrt(5 * G / (384 * delta)), rel=1e-12)


def test_frequency_scaling():
    m = Member("2x10")
    assert frequency_hz(m, 10) / frequency_hz(m, 20) == pytest.approx(((20 * 12 + 1.5) / (10 * 12 + 1.5)) ** 2)
    # a joist at half the spacing carries half the weight on the same stiffness: f scales as 1/sqrt(spacing)
    assert frequency_hz(Member("2x10", spacing_in=12), 12) / frequency_hz(Member("2x10", spacing_in=24), 12) == pytest.approx(math.sqrt(2))


def test_limit_zero_changes_nothing_and_higher_limits_never_lengthen():
    from house_spans.model import max_span as base
    m = Member("2x10")
    assert max_span(m, 0.0) == pytest.approx(base(m, CASES["floor"])[0], abs=0.011)
    prev = 99.0
    for f in (0, 6, 8, 10, 12, 15, 20):
        s = max_span(m, f)
        assert s <= prev + 1e-9
        prev = s


def test_max_span_is_boundary():
    m = Member("2x10")
    s = max_span(m, 14.0)
    assert passes(m, s, 14.0) and not passes(m, s + 0.02, 14.0)


def test_cheapest_never_cheaper_with_a_limit():
    for span in (8, 10, 12, 14):
        a, b = cheapest(span, 0.0), cheapest(span, 12.0)
        assert b is None or b[0] >= a[0] - 1e-12
