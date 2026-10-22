import pytest

from energy_thermal_cost import annuity, breakeven_hp_price, hp_lcoh, load, resistive_lcoh, store_lcoh, units

td = load("head_2030")


def test_annuity_matches_the_textbook_value_and_the_zero_rate_limit():
    assert annuity(0.07, 25) == pytest.approx(0.0858105, abs=1e-6)   # standard annuity factor, 7% over 25 years
    assert annuity(0.0, 20) == pytest.approx(0.05)
    assert annuity(0.04, 1) == pytest.approx(1.04)                   # one year: principal plus interest


def test_rows_are_read_from_the_committed_table():
    assert td["Sand-store"]["investment"] == pytest.approx(8425.2126)
    assert units()["Sand-store"] == "EUR/MWh"
    assert td["decentral air-sourced heat pump"]["efficiency"] == pytest.approx(3.6)
    assert load("v092_2030")["Sand-store"]["investment"] == pytest.approx(6700.8517)


def test_heat_pump_cost_by_hand():
    cap, en = hp_lcoh(td, "house", 10000.0, 0.20, rate=0.0, flh=2000.0)
    t = td["decentral air-sourced heat pump"]
    kw = 10000.0 / 2000.0
    assert cap == pytest.approx(kw * t["investment"] * (1 / t["lifetime"] + t["FOM"] / 100) / 10000.0)
    assert en == pytest.approx(0.20 / 3.6)


def test_resistive_heater_energy_is_price_over_efficiency():
    _, en = resistive_lcoh(td, "house", 1000.0, 0.18)
    assert en == pytest.approx(0.18 / 0.9)


def test_sand_store_holds_142_kwh_per_cubic_metre_as_in_the_thermal_project():
    r = store_lcoh(td, "sand", "house", 1000.0, 52, 7, 0.05)
    assert r["usable_full_kwh"] / r["volume_m3"] == pytest.approx(1600 * 800 * 400 / 3.6e6, rel=1e-9)


def test_thermal_project_anchor_222_m3_for_10_mwh_after_120_days():
    r = store_lcoh(td, "sand", "house", 10000.0, 1, 120, 0.05)
    assert r["volume_m3"] == pytest.approx(222.0, abs=1.0)           # energy-thermal README: 222 m3
    assert r["delivered_per_in"] == pytest.approx(0.26, abs=0.01)    # and 26% of the heat put in comes back


def test_thick_insulation_approaches_the_no_leak_bound_from_below():
    # no heat lost at all would return the usable share of the heat put in; thick wool also soaks up some, so a bit less
    share = (500 - 100) / (500 - 10)
    r = store_lcoh(td, "sand", "house", 10000.0, 52, 0.5, 0.05, ins_t=3.0)
    assert 0.9 * share < r["delivered_per_in"] < share


def test_total_is_the_sum_of_parts_and_longer_standby_costs_more():
    a = store_lcoh(td, "sand", "district", 5e6, 12, 30, 0.05)
    b = store_lcoh(td, "sand", "district", 5e6, 3, 120, 0.05)
    assert a["total"] == pytest.approx(a["store_cap"] + a["charger_cap"] + a["energy"])
    assert b["total"] > a["total"]


def test_cost_scale_only_moves_the_store_capital():
    a = store_lcoh(td, "sand", "house", 1e4, 52, 7, 0.05)
    b = store_lcoh(td, "sand", "house", 1e4, 52, 7, 0.05, cost_scale=3.0)
    assert b["store_cap"] == pytest.approx(3 * a["store_cap"])
    assert b["energy"] == pytest.approx(a["energy"]) and b["charger_cap"] == pytest.approx(a["charger_cap"])


def test_breakeven_price_makes_the_two_costs_equal():
    s = store_lcoh(td, "sand", "house", 1e4, 52, 7, 0.05)["total"]
    cap, _ = hp_lcoh(td, "house", 1e4, 0.05)
    p = breakeven_hp_price(s, cap, 3.6)
    assert cap + p / 3.6 == pytest.approx(s)
