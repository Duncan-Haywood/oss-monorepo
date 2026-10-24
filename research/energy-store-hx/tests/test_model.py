import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from energy_store_hx import hx_cost, diff_hx, breakeven_hx, flip_multiplier_hx  # noqa: E402
from energy_store_hx.model import CASES, SD  # noqa: E402
from energy_store_cop import diff as cop_diff, flip_multiplier as cop_flip  # noqa: E402

WEEKLY = [c for c in CASES if c[3] == "weekly"][0]


def test_zero_price_reproduces_energy_store_cop():
    assert diff_hx(2015, "house", WEEKLY, 0.0, mode="cop_hdd") == cop_diff(2015, "house", WEEKLY, mode="cop_hdd")
    a = flip_multiplier_hx(2016, "house", WEEKLY, 0.0, mode="cop_hdd", t_sink=45.0)
    b = cop_flip(2016, "house", WEEKLY, mode="cop_hdd", t_sink=45.0)
    assert abs(a - b) < 1e-6


def test_hx_cost_is_hand_checkable():
    # 100 EUR/kW x 5 kW = 500 EUR; annuity(4%, 35 y) = 0.0527 plus FOM 1.075 % -> about 0.0634/y; over 10,000 kWh
    ann = 0.04 / (1 - 1.04 ** -35) + SD["FOM"] / 100
    assert abs(hx_cost(100.0) - 500 * ann / 1e4) < 1e-9
    assert 0.003 < hx_cost(100.0) < 0.0035


def test_hx_cost_is_linear_and_scales_with_peak():
    assert abs(hx_cost(200.0) - 2 * hx_cost(100.0)) < 1e-12
    assert abs(hx_cost(100.0, flh=1000.0) - 2 * hx_cost(100.0)) < 1e-12


def test_breakeven_is_a_zero_of_the_diff():
    for y in (2015, 2018):
        be = breakeven_hx(y, "house", WEEKLY, mode="cop_hdd", t_sink=45.0)
        assert abs(diff_hx(y, "house", WEEKLY, be, mode="cop_hdd", t_sink=45.0)) < 1e-9


def test_dearer_exchanger_lowers_the_flip_multiplier():
    a = flip_multiplier_hx(2015, "house", WEEKLY, 50.0, mode="cop_hdd", t_sink=45.0)
    b = flip_multiplier_hx(2015, "house", WEEKLY, 200.0, mode="cop_hdd", t_sink=45.0)
    assert b < a


def test_2018_weekly_is_negative_even_for_a_free_exchanger():
    assert breakeven_hx(2018, "house", WEEKLY, mode="cop_hdd", t_sink=45.0) < 0
