import math

import house_energy.model as M
from house_energy import Prices
from house_hvacnpc.breakeven import premium
from house_coldcop import cold as C


def test_fit_reproduces_degree_days():
    for name, (hdd, cdd) in M.CLIMATES.items():
        mu, sd = C.fit_normal(hdd, cdd)
        assert math.isclose(C.expected_hdd(mu, sd), hdd, rel_tol=1e-6)
        assert math.isclose(mu - 0, 65 - (hdd - cdd) / 365)


def test_flat_curve_gives_constant_cop():
    assert math.isclose(C.seasonal_cop("Chicago (5A)", 2.5, 0.0), 2.5, rel_tol=1e-9)


def test_colder_climate_lower_seasonal_cop():
    a = C.seasonal_cop("Atlanta (3A)", 3.5, 0.045)
    d = C.seasonal_cop("Duluth (7)", 3.5, 0.045)
    assert d < a


def test_floor_at_resistance():
    assert C.cop(-40, 3.5, 0.045) == 1.0


def test_context_restores_model():
    before = M.SYSTEMS["heat pump"]["heat_eff"]
    with C.heat_pump_cop(1.7):
        assert M.SYSTEMS["heat pump"]["heat_eff"] == 1.7
    assert M.SYSTEMS["heat pump"]["heat_eff"] == before


def test_flat_curve_matches_hvacnpc_premium():
    pr = Prices()
    p, eta = C.premium_with_curve("Chicago (5A)", pr, 2.5, 0.0)
    assert math.isclose(p, premium("Chicago (5A)", pr)[0])


def test_worse_cop_lowers_premium():
    pr = Prices()
    hi = C.premium_with_curve("Minneapolis (6A)", pr, 3.5, 0.02)[0]
    lo = C.premium_with_curve("Minneapolis (6A)", pr, 3.5, 0.08)[0]
    assert lo < hi
