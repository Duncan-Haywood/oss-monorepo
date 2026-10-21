import math
import numpy as np
import pytest
from energy_home import Home, year_weather, year_load
from energy_tou import FLAT, TOU, simulate_tou
from energy_tou_lp.model import lp_dispatch, rolling_dispatch, rule_run, no_battery_bill, year_prices, _net

GHI, LOAD = year_weather(1), year_load(8000, 1)
H = Home(6.0, batt_kwh=10.0)
N = 24 * 30   # one month keeps the tests fast


def month(home, tou):
    sur, need = _net(home, GHI[:N], LOAD[:N])
    return sur, need, year_prices(tou, N)


def test_no_battery_lp_equals_bill():
    h = Home(6.0)
    sur, need, pr = month(h, TOU)
    r = lp_dispatch(h, sur, need, pr, 0.05)
    assert r["cost"] == pytest.approx(no_battery_bill(h, GHI[:N], LOAD[:N], TOU))


def test_lp_never_worse_than_rule():
    sur, need, pr = month(H, TOU)
    lp = lp_dispatch(H, sur, need, pr, 0.05)["cost"]
    for pol, gc in (("greedy", 0.0), ("peak", 0.0), ("peak", 0.5), ("peak", 1.0)):
        assert lp <= simulate_tou(H, GHI[:N], LOAD[:N], TOU, pol, gc)["cost"] + 1e-6


def test_energy_balance_and_limits():
    sur, need, pr = month(H, TOU)
    r = lp_dispatch(H, sur, need, pr, 0.05)
    eta = math.sqrt(H.rt_eff)
    c = r["charge_pv"] + r["charge_grid"]
    soc = np.cumsum(eta * c - r["discharge"] / eta)
    assert soc.min() >= -1e-6 and soc.max() <= H.batt_kwh * H.usable + 1e-6
    assert c.max() <= H.batt_kwh * H.c_rate + 1e-6 and r["discharge"].max() <= H.batt_kwh * H.c_rate + 1e-6
    assert np.all(r["charge_pv"] <= sur + 1e-9) and np.all(r["discharge"] <= need + 1e-9)


def test_flat_tariff_without_pv_earns_nothing():
    h = Home(0.0, batt_kwh=10.0)
    sur, need, pr = month(h, FLAT)
    r = lp_dispatch(h, sur, need, pr, 0.05)
    assert r["cost"] == pytest.approx(float(np.sum(need * pr)), rel=1e-9)
    assert r["discharge"].sum() < 1e-6   # round-trip losses make any cycling a loss


def test_huge_wear_stops_cycling():
    sur, need, pr = month(H, TOU)
    r = lp_dispatch(H, sur, need, pr, 0.05, wear=5.0)
    assert r["discharge"].sum() < 1e-6


def test_wear_reduces_throughput():
    sur, need, pr = month(H, TOU)
    t0 = lp_dispatch(H, sur, need, pr, 0.05, wear=0.0)["discharge"].sum()
    t1 = lp_dispatch(H, sur, need, pr, 0.05, wear=0.20)["discharge"].sum()
    assert t1 < t0


def test_rolling_between_year_lp_and_rule():
    sur, need, pr = month(H, TOU)
    lp = lp_dispatch(H, sur, need, pr, 0.05)["cost"]
    roll = rolling_dispatch(H, sur, need, pr, 0.05)["cost"]
    rule = min(simulate_tou(H, GHI[:N], LOAD[:N], TOU, "peak", g)["cost"] for g in (0.5, 1.0))
    assert lp - 1e-6 <= roll <= rule + 1e-6


def test_rule_run_matches_simulate_and_throughput_positive():
    r = rule_run(H, GHI, LOAD, TOU, "peak", 1.0)
    assert r["cost"] == pytest.approx(simulate_tou(H, GHI, LOAD, TOU, "peak", 1.0)["cost"])
    assert 0 < r["throughput"] < 365 * H.batt_kwh * H.c_rate * 24
