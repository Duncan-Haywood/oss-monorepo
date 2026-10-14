import math
import pytest
from garment_nesting.raster import Piece, polygon_area
from garment_teardown.model import TRENCH
from garment_markercost import *


SQ = Piece("sq", ((0, 0), (10, 0), (10, 10), (0, 10)))


def test_offset_square_is_exact_mitre():
    o = offset_polygon(SQ.poly, 1.0, miter_limit=2.0)
    # mitre of a right angle is d*sqrt(2) < 2d, so a 12x12 square results
    assert polygon_area(o) == pytest.approx(144.0)


def test_offset_orientation_independent():
    cw = tuple(reversed(SQ.poly))
    assert polygon_area(offset_polygon(cw, 1.0)) == pytest.approx(144.0)


def test_offset_area_close_to_perimeter_rule_on_shirt():
    for p in shirt():
        a0 = polygon_area(p.poly)
        per = sum(math.dist(p.poly[i], p.poly[(i + 1) % len(p.poly)]) for i in range(len(p.poly)))
        a1 = polygon_area(offset_polygon(p.poly, 1.0))
        assert a1 > a0
        assert a1 - a0 == pytest.approx(per * 1.0, rel=0.1)  # Steiner-style: P*d + O(d^2)


def test_scaled_area_quadratic():
    assert pattern_area_m2(scaled(shirt(), 1.1)) == pytest.approx(pattern_area_m2(shirt()) * 1.21)


def test_efficiency_bounded_and_allowance_lowers_it():
    W = 140
    pat = shirt()
    L0 = marker(pat, W, evals=15, seeds=(0,))
    L1 = marker(with_allowance(pat, 1.5), W, evals=15, seeds=(0,))
    e0, e1 = efficiency(pat, L0, W), efficiency(pat, L1, W)
    assert 0 < e1 <= e0 <= 1
    assert L1 >= L0


def test_fabric_cost_inverse_in_efficiency():
    a = fabric_cost_per_garment(TRENCH, 0.8)
    b = fabric_cost_per_garment(TRENCH, 0.6)
    assert b == pytest.approx(a * 0.8 / 0.6)
