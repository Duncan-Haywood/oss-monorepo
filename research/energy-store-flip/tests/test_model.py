import pytest

from energy_store_flip import diff, flip_multiplier, scaled, win_share, variance_split, CASES, YEARS

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
