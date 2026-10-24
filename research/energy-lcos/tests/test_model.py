import pytest
from energy_lcos import TECHS, Tech, crf, lcos, cycles_per_year, life_years, winner, crossover, capex

FLAT = Tech("flat", 100, 200, 1.0, 10, 1e9, 0.0, 0.0)


def test_crf_zero_rate_and_known_value():
    assert crf(0, 10) == pytest.approx(0.1)
    assert crf(0.07, 10) == pytest.approx(0.142378, abs=1e-5)


def test_cycles_cap_and_budget():
    assert cycles_per_year(2) == 365
    assert cycles_per_year(100) == pytest.approx(20)


def test_life_is_limited_by_cycles():
    t = Tech("x", 1, 1, 1, 20, 1000, 0, 0)
    assert life_years(t, 100) == 10
    assert life_years(t, 10) == 20


def test_lcos_analytic_undiscounted_no_losses():
    # 4 h, 365 cycles/yr, 10 yr, no fade/O&M/charging: capex / delivered MWh
    got = lcos(FLAT, 4, rate=0.0, charge_price=0.0)
    want = (200 + 100 * 4) / (365 * 4 * 10 / 1000.0)
    assert got == pytest.approx(want)


def test_charging_cost_scales_with_inverse_rte():
    a = lcos(FLAT, 4, rate=0.0, charge_price=50.0) - lcos(FLAT, 4, rate=0.0, charge_price=0.0)
    half = Tech("half", 100, 200, 0.5, 10, 1e9, 0.0, 0.0)
    b = lcos(half, 4, rate=0.0, charge_price=50.0) - lcos(half, 4, rate=0.0, charge_price=0.0)
    assert a == pytest.approx(50.0) and b == pytest.approx(100.0)


def test_fade_and_rate_raise_cost():
    base = lcos(FLAT, 4)
    assert lcos(Tech("f", 100, 200, 1.0, 10, 1e9, 0.02, 0.0), 4) > base
    assert lcos(FLAT, 4, rate=0.12) > base


def test_fractional_life_is_pro_rated():
    t = Tech("x", 100, 200, 1.0, 20, 365 * 7.5, 0.0, 0.0)
    assert life_years(t, 365) == pytest.approx(7.5)
    assert lcos(t, 4, rate=0.0, charge_price=0.0) == pytest.approx((200 + 400) / (365 * 4 * 7.5 / 1000.0))


def test_capex_and_winner_order():
    assert capex(FLAT, 3) == 500
    assert winner(1).name == "li-ion (LFP)"
    assert winner(500).name == "hydrogen (cavern)"


def test_crossover_between_li_ion_and_cavern_hydrogen():
    d = crossover(TECHS["li-ion (LFP)"], TECHS["hydrogen (cavern)"])
    assert d is not None and 8 < d < 14
    assert crossover(TECHS["li-ion (LFP)"], TECHS["vanadium flow"]) is None
