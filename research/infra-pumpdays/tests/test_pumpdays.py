import sys
from pathlib import Path

import numpy as np
import pytest

from infra_pumpdays.net import build, feasible, simulate, total_kw, window
from infra_pumpdays.tariff import DAYS_PER_MONTH, SEASONS, month_bill

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from run_month import bill, month  # noqa: E402


def test_demand_multiplier_scales_every_base_demand():
    a, b = build(window(1, 14), 1.0), build(window(1, 14), 1.5)
    for n in a.junction_name_list:
        assert b.get_node(n).demand_timeseries_list[0].base_value == pytest.approx(1.5 * a.get_node(n).demand_timeseries_list[0].base_value)


def test_one_repeated_day_month_matches_the_infra_pumpdemand_bill():
    kw = np.full(96, 100.0)
    kw[4 * 17] = 250.0
    e, d = month_bill(kw, "summer")
    assert month(np.array([kw] * 30), "summer") == pytest.approx(e + d)


def test_one_hot_day_sets_the_whole_months_demand_charge():
    quiet, hot = np.full(96, 50.0), np.full(96, 50.0)
    hot[4 * 3] = 300.0  # one off-peak quarter-hour on one day
    d = SEASONS["winter"]["demand"]
    # same energy as 29 quiet days + the hot day; demand: any-time on 300 kW, peak-period on 50 kW
    price = np.repeat([SEASONS["winter"]["energy"][x] for x in SEASONS["winter"]["periods"]], 4)
    e = DAYS_PER_MONTH * ((29 * quiet + hot) * 0.25 * price).sum() / 30
    assert bill(quiet, hot, 1, "winter") == pytest.approx(e + d["ANY"] * 300 + d["P"] * 50)


def test_shipped_schedule_at_the_base_demand_matches_infra_pumpdemand():
    r = simulate(window(1, 14), 1.0)
    assert r["kw"]["10"].sum() * 0.25 == pytest.approx(869, rel=0.01)
    assert r["kw"]["335"].sum() * 0.25 == pytest.approx(1703, rel=0.01)


def test_a_hotter_day_draws_more_energy_and_the_booster_peak_returns():
    base = simulate(window(0, 23), 1.0)
    hot = simulate(window(0, 23), 1.2)
    assert total_kw(base).max() < 100 and feasible(base, 0.001)
    assert total_kw(hot).max() > 300  # the 310 kW booster
    assert total_kw(hot).sum() > total_kw(base).sum()
    assert hot["demand_m3"] == pytest.approx(1.2 * base["demand_m3"], rel=1e-3)
