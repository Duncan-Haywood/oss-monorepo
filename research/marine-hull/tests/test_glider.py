import math
import pytest
from marine_hull.glider import (best_glide, glide_state, glider_energy_per_m, auv_energy_per_m,
                                interp_log)


def test_best_glide_ratio_closed_form():
    cd0, k, a = 0.1, 0.25, 3.5
    al = best_glide(cd0, k)
    ld = a * al / (cd0 + k * al * al)
    assert ld == pytest.approx(a / (2 * math.sqrt(cd0 * k)))


def test_force_balance_closes():
    b, aw, a, cd0, k = 2.0, 0.1, 3.5, 0.1, 0.25
    u, g, uh = glide_state(b, aw, a, cd0, k)
    al = best_glide(cd0, k)
    f = 0.5 * 1025.0 * u * u * aw * math.hypot(a * al, cd0 + k * al * al)
    assert f == pytest.approx(b)
    assert uh == pytest.approx(u * math.cos(g))


def test_speed_grows_with_buoyancy_as_sqrt():
    u1 = glide_state(1.0, 0.1, 3.5, 0.1, 0.25)[0]
    u4 = glide_state(4.0, 0.1, 3.5, 0.1, 0.25)[0]
    assert u4 == pytest.approx(2 * u1)


def test_energy_hotel_only_limit():
    e = glider_energy_per_m(1.0, 0.25, 0.3, 2.0, 0.5, 0.0, 500.0) - math.tan(0.3) / 1.0
    assert e == pytest.approx(2.0 / 0.25)


def test_depth_cancels_in_pump_term():
    a = glider_energy_per_m(1.0, 0.25, 0.3, 0.0, 0.5, 0.0, 200.0)
    b = glider_energy_per_m(1.0, 0.25, 0.3, 0.0, 0.5, 0.0, 1000.0)
    assert a == pytest.approx(b)


def test_auv_hotel_dominates_slow_drag_fast():
    lo = auv_energy_per_m(0.1, 2.0, 0.05, 3.0, 0.2, 5.0)
    assert lo == pytest.approx(5.0 / 0.1, rel=0.01)
    assert auv_energy_per_m(2.0, 2.0, 0.05, 3.0, 0.2, 0.0) > 10 * auv_energy_per_m(0.5, 2.0, 0.05, 3.0, 0.2, 0.0)


def test_interp_bounds():
    assert interp_log([0, 1], [0, 10], 0.5) == pytest.approx(5)
    assert interp_log([0, 1], [0, 10], 2) is None
