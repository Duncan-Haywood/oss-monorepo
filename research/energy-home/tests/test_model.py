import pytest
from energy_home import (Home, Tariff, Costs, year_weather, year_load, simulate, annual_cost,
                         capital_recovery, breakeven_battery_price, clear_sky_ghi)

GHI = year_weather(1)
LOAD = year_load(8000, 1)


def test_load_scaled_exactly():
    assert sum(LOAD) == pytest.approx(8000, rel=1e-9)


def test_night_has_no_sun_and_noon_summer_is_bright():
    assert clear_sky_ghi(40, 172, 0) == 0.0
    assert 850 < clear_sky_ghi(40, 172, 12) < 1100
    assert clear_sky_ghi(40, 355, 12) < clear_sky_ghi(40, 172, 12)


def test_weather_is_seeded():
    assert year_weather(3) == year_weather(3)
    assert year_weather(3) != year_weather(4)


def test_energy_balance_with_battery():
    h = Home(6.0, batt_kwh=10.0)
    t = simulate(h, GHI, LOAD)
    # supply = demand: direct + discharge + import == load
    assert t["direct"] + t["discharge_out"] + t["imp"] == pytest.approx(t["load"], rel=1e-9)
    # pv = direct + charge + export
    assert t["direct"] + t["charge_in"] + t["exp"] == pytest.approx(t["pv"], rel=1e-9)
    # battery: stored energy in minus out/eta - left over == 0; losses are non-negative
    eta = h.rt_eff ** 0.5
    assert t["charge_in"] * eta - t["discharge_out"] / eta == pytest.approx(t["soc_end"], abs=1e-6)
    assert t["charge_in"] >= t["discharge_out"]


def test_no_battery_no_pv_means_all_import():
    t = simulate(Home(0.0), GHI, LOAD)
    assert t["imp"] == pytest.approx(8000, rel=1e-9) and t["exp"] == 0 and t["self_sufficiency"] == pytest.approx(0)


def test_battery_never_hurts_self_sufficiency_and_has_diminishing_returns():
    ss = [simulate(Home(6.0, batt_kwh=b), GHI, LOAD)["self_sufficiency"] for b in (0, 5, 10, 20, 40)]
    assert ss == sorted(ss)
    gains = [b - a for a, b in zip(ss, ss[1:])]
    assert gains[0] / 5 > gains[-1] / 20


def test_more_pv_lowers_self_consumption():
    sc = [simulate(Home(k), GHI, LOAD)["self_consumption"] for k in (1, 3, 6, 12)]
    assert sc == sorted(sc, reverse=True)


def test_net_metering_makes_battery_worthless():
    h = Home(6.0, batt_kwh=10.0)
    flat = Tariff(0.30, 0.30)
    # with export priced at import, the 10% round-trip loss makes the battery lose money
    assert breakeven_battery_price(h, GHI, LOAD, flat, Costs()) < 0


def test_capital_recovery():
    assert capital_recovery(0.06, 1) == pytest.approx(1.06)
    assert capital_recovery(0.06, 25) == pytest.approx(0.0782, abs=1e-4)


def test_cost_adds_up():
    h = Home(2.0, batt_kwh=0.0)
    t = simulate(h, GHI, LOAD)
    c = Costs()
    expect = 2 * 2800 * capital_recovery(0.06, 25) + t["imp"] * 0.30 - t["exp"] * 0.05
    assert annual_cost(h, t, Tariff(), c) == pytest.approx(expect)
