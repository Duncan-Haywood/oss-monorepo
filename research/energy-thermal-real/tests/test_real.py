import pytest

from energy_thermal_hourly import load_year
from energy_thermal_real import load_prices, load_capacity, pearson, negative_hours, break_even_price
from energy_thermal_real.prices import load_utc


def test_each_year_has_8760_hours_aligned_to_the_load_series():
    for y in (2015, 2016, 2017, 2018, 2019):
        assert len(load_prices(y)) == 8760
        assert load_utc(y)[0].startswith(f"{y}-01-01T00") and load_utc(y)[-1].startswith(f"{y}-12-31T23")


def test_annual_means_match_published_day_ahead_averages():
    # Published German day-ahead annual averages (EUR/MWh): 2015 31.6, 2016 29.0, 2017 34.2, 2018 44.5, 2019 37.7 (Fraunhofer ISE / EPEX)
    for y, ref in ((2015, 31.6), (2016, 29.0), (2017, 34.2), (2018, 44.5), (2019, 37.7)):
        p = load_prices(y)
        assert sum(p) / len(p) * 1000 == pytest.approx(ref, abs=1.0)


def test_capacity_grows_and_2019_is_near_published():
    assert load_capacity(2019)[0] == pytest.approx(49.0, rel=0.05)    # about 49 GW PV at end of 2019
    assert load_capacity(2015)[1] < load_capacity(2019)[1]


def test_pearson_and_negative_hours_and_bisection():
    assert pearson([1, 2, 3], [2, 4, 6]) == pytest.approx(1.0)
    assert pearson([1, 2, 3], [3, 2, 1]) == pytest.approx(-1.0)
    assert negative_hours([-1, 0, 2, -3]) == 2
    assert break_even_price(lambda p: 3 * p - 0.06) == pytest.approx(0.02)
