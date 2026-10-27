import math
import pytest
from marine_hull import remus


def test_total_power_from_endurance():
    assert remus.total_power(endurance_h=10.0) == pytest.approx(150.0)


def test_total_power_from_range():
    # 67 km at 1.5 m/s is 12.41 h
    assert remus.total_power(range_m=67e3) == pytest.approx(1500.0 / (67e3 / 1.5 / 3600.0))


def test_exactly_one_figure():
    with pytest.raises(ValueError):
        remus.total_power()
    with pytest.raises(ValueError):
        remus.total_power(endurance_h=1.0, range_m=1.0)


def test_cylinder_area():
    assert remus.cylinder_c_s() * math.sqrt(remus.MASS / 1025.0 * remus.LENGTH) == pytest.approx(
        math.pi * 0.19 * 1.85)
