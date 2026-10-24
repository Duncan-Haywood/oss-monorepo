import numpy as np
import pytest

from infra_pumpdemand.masks import runs_masks
from infra_pumpdemand.net import feasible, simulate, total_kw, window
from infra_pumpdemand.tariff import DAYS_PER_MONTH, SEASONS, month_bill


@pytest.fixture(scope="module")
def shipped():
    return simulate(window(1, 14))


def test_constant_load_summer_bill_by_hand():
    e, d = month_bill(np.full(96, 100.0), "summer")
    per_day = 100 * (5 * 0.18648 + 4 * 0.14775 + 15 * 0.12037)
    assert e == pytest.approx(per_day * 365 / 12)
    assert d == pytest.approx(100 * (46.16 + 10.52 + 37.37))


def test_winter_has_no_part_peak_and_spring_has_super_off_peak():
    assert "PP" not in SEASONS["winter"]["periods"] and "S" not in SEASONS["winter"]["periods"]
    assert SEASONS["spring"]["periods"][9:14] == ["S"] * 5
    e_w, _ = month_bill(np.full(96, 100.0), "winter")
    e_s, _ = month_bill(np.full(96, 100.0), "spring")
    assert e_s < e_w
    assert e_w == pytest.approx(100 * (5 * 0.16188 + 19 * 0.12026) * DAYS_PER_MONTH)


def test_demand_charge_reads_the_highest_quarter_hour_in_each_period():
    kw = np.full(96, 10.0)
    kw[4 * 17 + 1] = 200.0  # one 15-minute spike inside the peak period
    _, d = month_bill(kw, "summer")
    assert d == pytest.approx(200 * 46.16 + 10 * 10.52 + 200 * 37.37)
    kw = np.full(96, 10.0)
    kw[4 * 3] = 200.0  # a spike off-peak is only charged at the any-time rate
    _, d = month_bill(kw, "summer")
    assert d == pytest.approx(10 * 46.16 + 10 * 10.52 + 200 * 37.37)


def test_shipped_window_at_900s_matches_the_step_check_in_infra_pumpsched(shipped):
    # infra-pumpsched/results_step.txt: 2,573 kWh a day at 900 s, pump 335 1,703 kWh; pump 10 is 869 kWh
    assert shipped["kw"]["10"].sum() * 0.25 == pytest.approx(869, rel=0.01)
    assert shipped["kw"]["335"].sum() * 0.25 == pytest.approx(1703, rel=0.01)
    assert total_kw(shipped).shape == (96,)


def test_pump10_power_is_idle_outside_its_window(shipped):
    k = shipped["kw"]["10"]
    assert (k[4 * 1:4 * 15] > 1).all() and k[4 * 15:].max() < 1e-6


def test_shipped_is_feasible_and_a_24_hour_pump_has_lower_energy(shipped):
    assert feasible(shipped, 0.01)
    r = simulate(window(1, 21))
    assert total_kw(r).sum() < 0.6 * total_kw(shipped).sum()


def test_mask_count():
    assert len(runs_masks()) == 21806
