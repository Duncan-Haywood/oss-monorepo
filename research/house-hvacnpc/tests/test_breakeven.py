import math

import house_energy.model as M
from house_energy import Prices
from house_hvacnpc import breakeven as B


def test_annuity_matches_model():
    assert math.isclose(B.annuity(M.DISCOUNT), M.ANNUITY)


def test_zero_rate_is_years():
    assert math.isclose(B.annuity(0.0, 30), 30.0)


def test_premium_sign_follows_prices():
    cheap_elec = Prices(gas_per_therm=2.5, elec_per_kwh=0.10)
    dear_elec = Prices(gas_per_therm=0.8, elec_per_kwh=0.25)
    assert B.premium("Chicago (5A)", cheap_elec)[0] > 0
    assert B.premium("Chicago (5A)", dear_elec)[0] < 0


def test_premium_is_the_npc_gap():
    pr = Prices()
    prem, ga, ha = B.premium("Houston (2A)", pr)
    assert ga > 0 and ha > 0
    # equal fuel economics: identical COP-independent cooling means premium is bounded by heating cost difference
    assert abs(prem) < 30 * max(ga, ha)


def test_higher_rate_shrinks_the_gap():
    pr = Prices(gas_per_therm=1.9, elec_per_kwh=0.153)
    a = abs(B.premium("Atlanta (3A)", pr, rate=0.01)[0])
    b = abs(B.premium("Atlanta (3A)", pr, rate=0.07)[0])
    assert b < a
