import json
from pathlib import Path

import pytest

from energy_lcos_realised.realised import run
from energy_lcos_sourced import lcos_at, load

HERE = Path(__file__).resolve().parents[1]
td, _ = load()


@pytest.fixture(scope="module")
def short():
    return run(hours=24 * 21, co2_frac=0.2)


def test_short_run_reports_battery_with_consistent_units(short):
    b = short["batt"]
    assert b["duration_h"] == pytest.approx(b["e_nom_gwh"] / b["p_out_gw"])
    assert b["cycles_per_year"] > 0
    # discharge hours = cycles x duration (store-side throughput over discharge power)
    assert b["discharge_hours"] == pytest.approx(b["cycles_per_year"] * b["duration_h"])


def test_delivered_energy_is_below_store_throughput(short):
    b = short["batt"]
    assert b["delivered_gwh"] < b["cycles_per_year"] * b["e_nom_gwh"]


def test_stored_results_have_battery_near_two_thousand_hours_and_h2_far_below():
    res = {n: r for n, _, r in json.load(open(HERE / "experiments" / "results.json"))}
    assert 1500 < res["cavern_cap0.1"]["batt"]["discharge_hours"] < 2100
    assert res["cavern_cap0.0"]["h2"]["discharge_hours"] < 1000


def test_lower_use_raises_lcos():
    a = lcos_at("hydrogen (cavern)", td, 280, hours_budget=2000.0, charge_price=30.0)
    b = lcos_at("hydrogen (cavern)", td, 280, hours_budget=719.0, charge_price=30.0)
    assert b > 2 * a
