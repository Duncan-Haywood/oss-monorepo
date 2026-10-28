import math
import pytest
from marine_hull.solar import deck_area, harvest_power, net_power, range_km_solar


def test_deck_area_four_metres():
    assert deck_area(4.0) == pytest.approx(0.6 * 4 * 0.48)


def test_harvest_is_product():
    assert harvest_power(1.0, 0.2, 0.85, 200.0) == pytest.approx(34.0)


def test_neutral_gives_infinite_range():
    assert math.isinf(range_km_solar(1000.0, 1.0, 40.0, 40.0))
    assert math.isinf(range_km_solar(1000.0, 1.0, 40.0, 50.0))


def test_reduces_to_plain_range_without_sun():
    # 1000 Wh at 50 W is 20 h; at 1 m/s that is 72 km
    assert range_km_solar(1000.0, 1.0, 50.0, 0.0) == pytest.approx(72.0)


def test_net_power_sign():
    assert net_power(45.0, 40.0) == 5.0


def test_panels_displace_battery():
    from marine_hull.solar import battery_after_panels
    # 1 m2 at 5 kg/m2 of a 10,000 Wh pack at 200 Wh/kg removes 1,000 Wh
    assert battery_after_panels(10000.0, 1.0, 5.0, 200.0) == pytest.approx(9000.0)
    assert battery_after_panels(100.0, 1.0, 5.0, 200.0) == 0.0
    assert battery_after_panels(100.0, 0.0, 5.0, 200.0) == 100.0
