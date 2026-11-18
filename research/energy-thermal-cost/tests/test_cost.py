import pytest

from energy_thermal_cost import annuity, breakeven_hp_price, hp_lcoh, load, resistive_lcoh, store_lcoh, units
from energy_thermal_cost.cost import INSULATION, SAND, cycle_steady

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
    r = store_lcoh(td, "sand", "house", 10000.0, 1, 120, 0.05, accounting="first-charge")
    assert r["volume_m3"] == pytest.approx(222.0, abs=1.0)           # energy-thermal README: 222 m3
    assert r["delivered_per_in"] == pytest.approx(0.26, abs=0.01)    # and 26% of the heat put in comes back


def test_thick_insulation_approaches_the_no_leak_bound_from_below():
    # no heat lost at all would return the usable share of the heat put in; thick wool also soaks up some, so a bit less
    share = (500 - 100) / (500 - 10)
    r = store_lcoh(td, "sand", "house", 10000.0, 52, 0.5, 0.05, ins_t=3.0, accounting="first-charge")
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


# Added 2026-11-18 (quality audit 2026-11-17, high defect 0): a cycling store is recharged from its cut-off
# temperature, not from ambient. Each test below fails on the earlier first-charge-every-cycle rule.

def test_a_store_that_loses_nothing_is_billed_only_its_usable_heat_after_the_first_cycle():
    # no standby, no idle gap: at steady state the heat put in equals the heat taken out, rho c V (hot - cut)
    v = 1.0
    heat_in, out, n = cycle_steady(SAND, v, 0.0, 0.0, 500.0, 100.0, 0.5, INSULATION)
    exact = 1600 * 800 * 400 * v / 3.6e6
    assert out == pytest.approx(exact, rel=1e-9)
    assert heat_in == pytest.approx(exact, rel=1e-9)
    assert n >= 2                                                     # the cold first cycle is not the answer


def test_steady_state_heat_in_lies_between_the_lossless_bound_and_the_cold_start():
    # house daily: 1 day standby, 300 cycles a year. The first charge lifts the sand from 10 C (490 K); a cycle
    # at steady state lifts it from 100 C (400 K) plus what it lost, so out/in sits between 400/490 and 1.
    r = store_lcoh(td, "sand", "house", 1e4, 300, 1, 0.05)
    cold = store_lcoh(td, "sand", "house", 1e4, 300, 1, 0.05, accounting="first-charge")
    assert cold["delivered_per_in"] < r["delivered_per_in"] < 1.0
    assert r["delivered_per_in"] == pytest.approx(0.815, abs=0.005)   # audit's independent 40-cycle run: 0.82
    assert r["volume_m3"] <= cold["volume_m3"]                         # warm insulation: never a bigger store


def test_store_capital_and_energy_by_hand():
    # at zero rate and no standby every part of the store's cost follows from the table and the billed heat
    r = store_lcoh(td, "sand", "house", 1e4, 52, 0.0, 0.10, rate=0.0, ins_t=0.5)
    st, ch = td["Sand-store"], td["Sand-charger"]
    v = r["volume_m3"]
    usable = 1600 * 800 * 400 * v / 3.6e6
    assert usable == pytest.approx(1e4 / 52, rel=1e-5)                 # sized to deliver one cycle's heat
    assert r["store_cap"] == pytest.approx(usable * st["investment"] / 1000 * (1 / st["lifetime"] + st["FOM"] / 100) / 1e4)
    kw = r["heat_in_kwh"] / (0.25 * 365 * 24 / 52)
    assert r["charger_cap"] == pytest.approx(kw * ch["investment"] / 1000 * (1 / ch["lifetime"] + ch["FOM"] / 100) / 1e4)
    assert r["energy"] == pytest.approx(52 * r["heat_in_kwh"] / ch["efficiency"] * 0.10 / 1e4)
    assert usable < r["heat_in_kwh"] < 1600 * 800 * 490 * v / 3.6e6  # idle-week losses, but less than a cold start


def test_unknown_kind_or_accounting_is_refused():
    with pytest.raises(ValueError):
        store_lcoh(td, "salt", "house", 1e4, 52, 7, 0.05)
    with pytest.raises(ValueError):
        store_lcoh(td, "sand", "house", 1e4, 52, 7, 0.05, accounting="cold")
