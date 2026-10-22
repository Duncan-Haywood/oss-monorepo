import pytest

from energy_thermal_hourly import cheapest_mean, gas_marginal_cost, heating_season_mean, load_year, residual_price_series


def test_gas_marginal_cost_by_hand():
    # (28.4158 EUR/MWh_th fuel) / 0.58 + 5.6104 VOM
    assert gas_marginal_cost() == pytest.approx(28.4158 / 0.58 + 5.6104)
    assert gas_marginal_cost(co2_price=100) == pytest.approx((28.4158 + 19.8) / 0.58 + 5.6104)


def test_data_has_8760_hours_and_2019_load_matches_published_total():
    rows = load_year(2019)
    assert len(rows) == 8760
    assert sum(r[1] for r in rows) / 1e6 == pytest.approx(500.0, rel=0.03)   # ENTSO-E Germany 2019 load, about 500 TWh


def test_price_is_floor_with_huge_fleet_and_gas_with_none():
    rows = load_year(2019)
    assert set(residual_price_series(rows, 0, 0, 50.0)) == {0.05}
    huge = residual_price_series(rows, 1e5, 1e5, 50.0)
    assert sum(huge) / len(huge) < 0.001


def test_cheapest_mean_bounds():
    p = [3.0, 1.0, 2.0, 4.0] * 6                       # four-hour days, six of them
    assert cheapest_mean(p, 6, 0.25) == pytest.approx(1.0)
    assert cheapest_mean(p, 6, 1.0) == pytest.approx(sum(p) / len(p))
    assert cheapest_mean(p, 1, 0.5) == pytest.approx(1.5)  # cheapest 12 of 24: six 1s and six 2s
