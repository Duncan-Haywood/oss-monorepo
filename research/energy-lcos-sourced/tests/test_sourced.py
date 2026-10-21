import random

import pytest

from energy_lcos_sourced import EUR_USD, SPECS, alternatives, build, lcos_at, load, win_shares, winner_at
from energy_lcos_sourced.sourced import _fit_battery

td, atb = load()


def test_pumped_hydro_blocks_are_the_table_rows_in_usd():
    t = build("pumped hydro", td)(8)
    assert t.power_cost == pytest.approx(1756.6579565 * EUR_USD)      # EUR 1,756,658/MW
    assert t.energy_cost == pytest.approx(71.7611936 * EUR_USD)       # EUR 71,761/MWh
    assert t.rte == pytest.approx(0.8944 ** 2)                        # the table's efficiency is one way


def test_hydrogen_chain_efficiency_and_storage_per_kwh_of_electricity():
    t = build("hydrogen (cavern)", td)(24)
    assert t.rte == pytest.approx(0.6217 * 0.5)
    assert t.energy_cost == pytest.approx(2.6741 / 0.5 * EUR_USD)     # storage is per kWh of H2, delivered at 50%
    assert t.power_cost == pytest.approx((1886.0019 + 1469.3834) * EUR_USD)


def test_fixed_om_and_life_follow_the_capital_split():
    f = build("li-ion (LFP)", td)
    assert f(1).life < f(100).life < 25.0 + 1e-9                      # more energy capital, longer-lived block
    assert f(100).fom == pytest.approx(f(1).fom)                      # the table has no storage-block FOM, only the inverter's
    assert build("pumped hydro", td)(100).fom > build("pumped hydro", td)(1).fom


def test_li_ion_cost_lies_between_atb_advanced_and_conservative():
    for d in (2, 4, 8):
        t = build("li-ion (LFP)", td)(d)
        cost = t.power_cost + t.energy_cost * d
        lo = sum(_fit_battery(atb, "Advanced", 2030)[i] * (1, d)[i] for i in (0, 1))
        hi = sum(_fit_battery(atb, "Conservative", 2030)[i] * (1, d)[i] for i in (0, 1))
        assert lo < cost < hi


def test_atb_fit_recovers_a_published_point():
    p, e = _fit_battery(atb, "Moderate", 2030)
    assert p + 4 * e == pytest.approx(1300, rel=0.02)                 # ATB Moderate 2030, 4 h: $1,300/kW


def test_alternatives_bracket_the_base_value():
    for a in alternatives(td, atb).values():
        for lo, hi in a.values():
            assert lo <= 1.0 <= hi


def test_shares_sum_to_one_and_are_deterministic():
    alts = alternatives(td, atb)
    a = win_shares(td, alts, [4, 100], n=40, seed=1)
    assert a == win_shares(td, alts, [4, 100], n=40, seed=1)
    for d in a:
        assert sum(a[d].values()) == pytest.approx(1.0)


def test_degenerate_spread_reproduces_point_winner():
    alts = {k: {"p": (1.0, 1.0), "e": (1.0, 1.0)} for k in SPECS}
    s = win_shares(td, alts, [2, 24], n=5, seed=0, rate=0.07, charge=30.0)
    assert s[2][winner_at(td, 2)] == 1.0 and s[24][winner_at(td, 24)] == 1.0


def test_short_and_long_durations_are_stable():
    s = win_shares(td, alternatives(td, atb), [1, 500], n=200, seed=2)
    assert s[1]["li-ion (LFP)"] > 0.9 and s[500]["compressed air (cavern)"] > 0.9
