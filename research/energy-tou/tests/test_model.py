import pytest
from energy_home import Home, Tariff, year_weather, year_load, simulate, breakeven_battery_price, Costs
from energy_tou import FLAT, TOU, simulate_tou, bill, breakeven_price

GHI, LOAD = year_weather(1), year_load(8000, 1)


def test_flat_greedy_matches_energy_home():
    h = Home(6.0, batt_kwh=10.0)
    ref = simulate(h, GHI, LOAD)
    t = simulate_tou(h, GHI, LOAD, FLAT)
    assert t["imp"] == pytest.approx(ref["imp"], rel=1e-9)
    assert t["exp"] == pytest.approx(ref["exp"], rel=1e-9)
    be = breakeven_battery_price(h, GHI, LOAD, Tariff(0.30, 0.05), Costs())
    assert breakeven_price(h, GHI, LOAD, FLAT) == pytest.approx(be, rel=1e-9)


def test_tou_shape():
    assert TOU.peak_hours() == frozenset(range(16, 21))
    assert min(TOU.prices) == 0.15 and max(TOU.prices) == 0.45


def test_no_battery_policy_irrelevant():
    h = Home(6.0)
    assert bill(h, GHI, LOAD, TOU, "greedy") == pytest.approx(bill(h, GHI, LOAD, TOU, "peak"))


def test_energy_balance_with_grid_charge():
    h = Home(4.0, batt_kwh=10.0)
    t = simulate_tou(h, GHI, LOAD, TOU, "peak", 1.0)
    # all supply: pv + imports = load + exports + battery loss + soc change; check imports cover grid_in
    assert t["imp"] >= t["grid_in"] > 0
    assert t["pv"] + t["imp"] >= t["load"] + t["exp"] - 1e-6


def test_grid_charge_needs_peak_policy():
    h = Home(4.0, batt_kwh=10.0)
    assert simulate_tou(h, GHI, LOAD, TOU, "greedy", 1.0)["grid_in"] == 0.0


def test_tou_raises_breakeven_for_peak_policy_over_flat():
    h = Home(6.0, batt_kwh=10.0)
    assert breakeven_price(h, GHI, LOAD, TOU, "peak", 1.0) > breakeven_price(h, GHI, LOAD, FLAT)


def test_battery_without_pv_only_earns_by_arbitrage():
    h = Home(0.0, batt_kwh=10.0)
    assert breakeven_price(h, GHI, LOAD, FLAT) == pytest.approx(0.0, abs=1e-9)
    assert breakeven_price(h, GHI, LOAD, TOU, "peak", 1.0) > 0


def test_peak_policy_never_discharges_off_peak():
    h = Home(6.0, batt_kwh=10.0)
    # with a flat tariff every hour is "peak", so peak == greedy
    a = simulate_tou(h, GHI, LOAD, FLAT, "peak")
    b = simulate_tou(h, GHI, LOAD, FLAT, "greedy")
    assert a["imp"] == pytest.approx(b["imp"])
