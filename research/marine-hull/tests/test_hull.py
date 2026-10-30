import math
import pytest
from marine_hull.hull import (G, cf_ittc57, froude_length, power_total, range_km, resistance,
                              wave_resistance_fraction, wetted_area)


def test_ittc57_known_values():
    # 0.075/(7-2)^2 exactly; 0.075/(9-2)^2 exactly
    assert cf_ittc57(1e7) == pytest.approx(0.003, rel=1e-12)
    assert cf_ittc57(1e9) == pytest.approx(0.075 / 49, rel=1e-12)
    assert cf_ittc57(1e6) > cf_ittc57(1e7) > cf_ittc57(1e8)


def test_ittc57_rejects_nonpositive():
    with pytest.raises(ValueError):
        cf_ittc57(0)


def test_froude_number():
    assert froude_length(math.sqrt(G * 4.0), 4.0) == pytest.approx(1.0)


def test_wetted_area_scaling():
    assert wetted_area(0.2, 5.0, 3.0) == pytest.approx(3.0)
    assert wetted_area(0.8, 5.0, 3.0) == pytest.approx(2 * wetted_area(0.2, 5.0, 3.0))


def test_wave_fraction_monotone_and_small_at_low_fr():
    xs = [wave_resistance_fraction(f / 100) for f in range(0, 80)]
    assert xs == sorted(xs)
    assert wave_resistance_fraction(0.2) < 0.05 and wave_resistance_fraction(0) == 0


def test_two_identical_hulls_double_resistance():
    a = resistance(2.0, 3.0, 0.1, 3.0, 0.15)
    b = resistance(2.0, 3.0, 0.1, 3.0, 0.15, n_hulls=2)
    assert b == pytest.approx(2 * a)


def test_interference_raises_resistance():
    assert resistance(2, 3, 0.1, 3, 0.15, interference=0.1) > resistance(2, 3, 0.1, 3, 0.15)


def test_no_wave_term_resistance_matches_hand_calc():
    v, L, V, cs, k = 2.0, 4.0, 0.2, 3.0, 0.2
    s = cs * math.sqrt(V * L)
    re = v * L / 1.1892e-6
    want = 0.5 * 1025.0 * v * v * s * 1.2 * 0.075 / (math.log10(re) - 2) ** 2
    assert resistance(v, L, V, cs, k, wave_scale=0.0) == pytest.approx(want, rel=1e-12)


def test_power_and_range_consistent():
    p = power_total(2.0, 50.0, eta_prop=0.5, eta_motor=1.0, p_hotel=10.0)
    assert p == pytest.approx(210.0)
    assert range_km(1000.0, 2.0, 50.0, eta_prop=0.5, eta_motor=1.0, p_hotel=10.0) == \
        pytest.approx(1000 * 3600 / 210.0 * 2.0 / 1000.0)
