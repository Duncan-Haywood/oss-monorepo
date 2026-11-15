import pytest

from energy_store_flip import (diff, diff_real, deflator, flip_multiplier, joint_flip, scaled, win_share, variance_split,
                              CASES, YEARS)

WEEKLY = CASES[1]


def test_base_reproduces_energy_thermal_real_weekly_house():
    # energy-thermal-real: house weekly diff -0.004, -0.005, -0.005, +0.011, -0.000 (2015 to 2019)
    got = [diff(y, "house", WEEKLY) for y in YEARS]
    for g, w in zip(got, (-0.004, -0.005, -0.005, 0.011, -0.000)):
        assert g == pytest.approx(w, abs=0.0006)


def test_scaled_scales_only_named_rows():
    td, base = scaled(2.0, 3.0), scaled()
    assert td["Sand-store"]["investment"] == pytest.approx(2 * base["Sand-store"]["investment"])
    assert td["Sand-charger"]["investment"] == pytest.approx(2 * base["Sand-charger"]["investment"])
    assert td["decentral air-sourced heat pump"]["investment"] == pytest.approx(3 * base["decentral air-sourced heat pump"]["investment"])
    assert td["decentral resistive heater"] == base["decentral resistive heater"]


def test_diff_rises_with_store_capex_and_falls_with_heat_pump_capex():
    assert diff(2015, "house", WEEKLY, m_store=1.5) > diff(2015, "house", WEEKLY)
    assert diff(2015, "house", WEEKLY, m_hp=1.5) < diff(2015, "house", WEEKLY)


def test_flip_multiplier_is_a_zero_of_diff():
    for which, kw in (("store", "m_store"), ("hp", "m_hp")):
        m = flip_multiplier(2018, "house", WEEKLY, which)
        assert diff(2018, "house", WEEKLY, **{kw: m}) == pytest.approx(0.0, abs=1e-9)


def test_no_flip_for_seasonal_store_cost():
    assert flip_multiplier(2015, "house", CASES[3], "store") is None


def test_win_share_endpoints_and_variance_split():
    assert win_share(2015, "house", WEEKLY, 0.0, n=3) == 1.0
    assert win_share(2018, "house", WEEKLY, 0.0, n=3) == 0.0
    b, w, g = variance_split("house", WEEKLY, 0.25, n=50)
    assert b > 0 and w > 0


def test_vintage_step_moves_both_costs():
    # README claim (corrected 2026-11-15): the older table flips the store years through the heat pump, the newer one flips none
    older = [diff(y, "house", WEEKLY, m_store=1 / 1.257, m_hp=1 / 1.262) for y in YEARS]
    newer = [diff(y, "house", WEEKLY, m_store=1.257, m_hp=1.262) for y in YEARS]
    assert all(d > 0 for d in older)
    assert [d < 0 for d in newer] == [d < 0 for d in (diff(y, "house", WEEKLY) for y in YEARS)]


def test_deflator_matches_eurostat_hicp_by_hand():
    # Eurostat prc_hicp_aind, DE, CP00, annual average 2015=100: 2017 102.1, 2025 131.9; EA20 2019 104.79, 2025 128.76
    assert deflator(2017) == pytest.approx(102.1 / 131.9, rel=1e-9)
    assert deflator(2019, "EA20") == pytest.approx(104.79 / 128.76, rel=1e-9)
    assert deflator(2025) == 1.0


def test_diff_real_deflates_every_capex_row_by_the_same_factor():
    d = deflator(2016)
    assert diff_real(2016, "house", WEEKLY) == pytest.approx(diff(2016, "house", WEEKLY, d, d), abs=1e-12)


def test_one_currency_basis_gives_weekly_house_to_the_heat_pump_every_year():
    # Section E: with 2025-euro capex deflated to the price year, the store loses weekly house cycling in all five years,
    # holds daily house cycling in all five, and holds weekly district cycling in four (all but 2018).
    assert all(diff_real(y, "house", WEEKLY) > 0 for y in YEARS)
    assert all(diff_real(y, "house", CASES[0]) < 0 for y in YEARS)
    assert [diff_real(y, "district", WEEKLY) < 0 for y in YEARS] == [True, True, True, False, True]
    # the joint flip sits above every deflator for house weekly (lower capex favours the pump)
    assert all(joint_flip(y, "house", WEEKLY) > deflator(y) for y in YEARS)


def test_variance_split_with_no_cost_spread_is_the_population_variance_of_the_base_diffs():
    base = [diff(y, "house", WEEKLY) for y in YEARS]
    mean = sum(base) / len(base)
    b, w, g = variance_split("house", WEEKLY, 0.0, n=3)
    assert g == pytest.approx(mean, abs=1e-12)
    assert b == pytest.approx(sum((x - mean) ** 2 for x in base) / len(base), rel=1e-9)
    assert w == pytest.approx(0.0, abs=1e-15)
