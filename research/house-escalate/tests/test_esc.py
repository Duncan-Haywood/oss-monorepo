import pytest
import house_energy.model as M
from house_hvacnpc.breakeven import premium as base_premium
from house_energyprices.prices import prices_for
from house_escalate import esc as E

PR = prices_for("Illinois")
TAB = E.table("Chicago (5A)", PR)


def test_zero_growth_reproduces_hvacnpc():
    assert E.premium(TAB) == pytest.approx(base_premium("Chicago (5A)", PR)[0], abs=1e-6)


def test_annuity_zero_growth_matches_model():
    assert E.annuity(0.03) == pytest.approx(M.ANNUITY)


def test_growth_equal_to_rate_gives_years():
    assert E.annuity(0.03, 0.03, 30) == pytest.approx(30)


def test_gas_growth_raises_premium_and_elec_growth_lowers_it():
    assert E.premium(TAB, g_gas=0.02) > E.premium(TAB) > E.premium(TAB, g_elec=0.02)


def test_equal_growth_is_not_neutral_but_close_to_zero_effect_on_sign():
    # same growth on both fuels scales both bills alike, so it cannot move the premium much when bills are similar
    assert abs(E.premium(TAB, g_gas=0.02, g_elec=0.02) - E.premium(TAB)) < 5000


def test_breakeven_growth_solves_the_premium():
    g = E.breakeven_gas_growth(TAB, 0.0)
    assert g is not None
    assert E.premium(TAB, g_gas=g) == pytest.approx(0.0, abs=1e-3)


def test_unreachable_target_is_none():
    assert E.breakeven_gas_growth(TAB, 1e9) is None


def test_bill_split_adds_up():
    p = M.baseline()
    full = M.energy(p, "Chicago (5A)", "heat pump", PR)["annual_cost"]
    i = list(M.options()).index(p)
    _, gb, eb = TAB["heat pump"][i]
    assert gb == 0 and eb == pytest.approx(full)
