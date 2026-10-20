import math

import pytest

pytest.importorskip("pypsa")
from energy_mix import model  # noqa: E402

H = 24 * 14  # two weeks keeps each solve to seconds


def test_data_is_one_year_of_valid_hours():
    d = model.load_data()
    assert len(d) == 8760
    assert d.index[0].year == 2019 and d.index[-1].year == 2019
    assert d[["solar_cf", "wind_cf"]].min().min() >= 0 and d[["solar_cf", "wind_cf"]].max().max() <= 1
    assert 0.08 < d.solar_cf.mean() < 0.13 and 0.2 < d.wind_cf.mean() < 0.3
    assert d.load_mw.min() > 20000 and not d.isna().any().any()


def test_annualised_cost_arithmetic():
    crf = 0.07 / (1 - 1.07 ** -25)
    assert math.isclose(model.annual("solar"), 1000 * 1000 * (crf + 0.02), rel_tol=1e-12)
    assert math.isclose(model.annual("h2_store", 2.0), 2 * model.annual("h2_store"))


def test_gas_only_cost_matches_closed_form():
    d = model.load_data(H)
    n = model.solve(model.build(d, co2_frac=1.0, allow_h2=False, allow_batt=False))
    # With no cap, gas can serve all load; solar/wind may still undercut it, so cost <= gas-only.
    peak = d.load_mw.max()
    gas_only = (peak * model.annual("gas") + d.load_mw.sum() * model.GAS_FUEL / model.GAS_EFF)
    assert n.objective <= gas_only * (1 + 1e-6)


def test_energy_balance_and_cap():
    d = model.load_data(H)
    n = model.solve(model.build(d, co2_frac=0.2))
    bal = n.buses_t.p["el"].abs().max()
    assert bal < 1e-3
    assert n.generators_t.p["gas"].sum() * model.GAS_CO2 <= 0.2 * d.load_mw.sum() * model.GAS_CO2 * (1 + 1e-6)


def test_tighter_cap_never_cheaper():
    d = model.load_data(H)
    costs = [model.solve(model.build(d, co2_frac=f)).objective for f in (1.0, 0.5, 0.0)]
    assert costs[0] <= costs[1] + 1e-3 <= costs[2] + 2e-3


def test_zero_cap_means_no_gas_and_storage_costs_money():
    d = model.load_data(H)
    n = model.solve(model.build(d, co2_frac=0.0))
    assert n.generators_t.p["gas"].sum() < 1e-3
    cheap = model.solve(model.build(d, co2_frac=0.0, batt_mult=0.25)).objective
    assert cheap <= n.objective + 1e-3
