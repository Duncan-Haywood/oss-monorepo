import csv
import math

from house_energy import Prices
from house_energyprices import prices as P


def test_every_climate_state_has_data():
    from house_energy import CLIMATES
    t = P.table()
    for c, st in P.STATE.items():
        assert c in CLIMATES and st in t


def test_conversion():
    p = P.prices_for("Illinois")
    assert math.isclose(p.gas_per_therm, 11.25 / 10.37)
    assert math.isclose(p.elec_per_kwh, 0.1922)
    assert p.cost_mult == 1.0 and p.energy_mult == 1.0


def test_prices_plausible():
    for r in csv.DictReader(open(P.DATA)):
        assert 5 < float(r["gas_usd_per_mcf_2025"]) < 40
        assert 10 < float(r["elec_cents_per_kwh_ytd_jan_jul_2026"]) < 35


def test_default_prices_unchanged_in_house_energy():
    assert Prices().gas_per_therm == 1.30 and Prices().elec_per_kwh == 0.16


def test_cheaper_gas_helps_gas_system_only():
    from house_energy import optimise
    lo = Prices(gas_per_therm=0.8)
    hi = Prices(gas_per_therm=2.0)
    assert optimise("Chicago (5A)", "gas furnace + AC", lo)[1]["annual_cost"] < optimise("Chicago (5A)", "gas furnace + AC", hi)[1]["annual_cost"]
    assert optimise("Chicago (5A)", "heat pump", lo)[1]["annual_cost"] == optimise("Chicago (5A)", "heat pump", hi)[1]["annual_cost"]
