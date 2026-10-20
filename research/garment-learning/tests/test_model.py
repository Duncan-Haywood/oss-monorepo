import pytest
from garment_learning import *


def test_doubling_cuts_by_rate():
    assert unit_minutes(2, 100, 0.8) == pytest.approx(80.0)
    assert unit_minutes(4, 100, 0.8) == pytest.approx(64.0)


def test_first_unit_and_floor():
    assert unit_minutes(1, 300, 0.85) == 300
    assert unit_minutes(10**6, 300, 0.85, floor=51) == 51


def test_cumulative_sum():
    assert cumulative_minutes(2, 100, 0.8) == pytest.approx(180.0)


def test_units_to_reach_is_smallest():
    n = units_to_reach(120, 300, 0.85, floor=51)
    assert unit_minutes(n, 300, 0.85, 51) <= 120 < unit_minutes(n - 1, 300, 0.85, 51)


def test_target_below_floor_unreachable():
    assert units_to_reach(40, 300, 0.85, floor=51) is None


def test_already_there():
    assert units_to_reach(500, 300, 0.85) == 1


def test_cost_scales_with_wage_and_efficiency():
    a = labour_cost_per_unit(1, 60, 0.9, 12.0)
    assert a == pytest.approx(12.0)
    assert labour_cost_per_unit(1, 60, 0.9, 12.0, efficiency=0.5) == pytest.approx(24.0)


def test_average_above_unit_cost_while_learning():
    assert average_cost_over(10, 300, 0.85, 10) > labour_cost_per_unit(10, 300, 0.85, 10)


def test_bad_rate():
    with pytest.raises(ValueError):
        unit_minutes(1, 10, 1.0)
