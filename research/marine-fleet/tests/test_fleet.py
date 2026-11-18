import math
import pytest
from marine_fleet.fleet import affordable, boat_cost, boat_power, survey_time


def test_cost_identity():
    assert boat_cost(200, 200, 0.3, 0.8) == pytest.approx(1.0)
    assert affordable(200, 200, 0.3, 0.8) == 1


def test_no_payload_linear_cost_gives_n_boats():
    # beta=1, no fixed payload: half-mass boats, exactly 2 for the same money
    assert affordable(100, 200, 0.0, 1.0) == 2
    assert affordable(50, 200, 0.0, 1.0) == 4


def test_payload_cost_cuts_fleet():
    assert affordable(100, 200, 0.3, 1.0) == 1  # 0.3 + 0.7*0.5 = 0.65


def test_power_matches_reference_boat():
    from marine_hull.hull import RHO_SEA, power_total, resistance
    r = resistance(1.0, 4.0, 200 / RHO_SEA, 3.0, 0.25)
    assert boat_power(200, 1.0, 0.5) == pytest.approx(power_total(1.0, r, p_hotel=30.0))


def test_time_scales_inversely_with_fleet_when_no_swaps():
    # huge battery relative to the job: no swap, time = km / (n v)
    t1 = survey_time(10, 1, 200, 1.0, 0.5, 1.0, 0.0)[0]
    t2 = survey_time(10, 2, 200, 1.0, 0.5, 1.0, 0.0)[0]
    assert t1 == pytest.approx(10000 / 3600.0)
    assert t2 == pytest.approx(t1 / 2)


def test_swap_time_added_per_extra_sortie():
    # force 2 sorties: usable km per sortie ~ battery range; ask for 1.5x of it
    from marine_fleet.fleet import BATT_FRAC
    p = boat_power(200, 1.0, 0.5)
    rng_km = 200 * BATT_FRAC * 200 / p * 3.6
    t = survey_time(1.5 * rng_km, 1, 200, 1.0, 0.5, 2.0, 0.0)[0]
    assert t == pytest.approx(1.5 * rng_km * 1000 / 3600 + 2.0)


def test_unreachable_base_returns_none():
    assert survey_time(10, 1, 200, 1.0, 0.5, 1.0, 1e6) is None
