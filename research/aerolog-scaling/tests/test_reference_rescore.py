import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_reference_rescore", _d / "reference_rescore.py")
rr = importlib.util.module_from_spec(_s)
_s.loader.exec_module(rr)

A = (0, 0, 1, 0, 0, 0, 0, 0)  # keeps (0, 1) together: scores x01
B = (0, 1, 0, 0, 0, 0, 0, 0)  # keeps (0, 2) together: scores x02


def _w(x01, x02):
    return {(0, 1, "enr"): x01, (0, 2, "enr"): x02}


def test_interval_pooled_ratio_and_zero_width_when_constant():
    pooled, hw = rr.interval([_w(10, 20)] * 5, B, A)
    assert pooled == 2.0 and hw == 0.0


def test_interval_t_halfwidth_five_runs():
    runs = [_w(10, x) for x in (8, 9, 10, 11, 12)]
    pooled, hw = rr.interval(runs, B, A)
    assert pooled == 1.0
    sd = math.sqrt(sum((x / 10 - 1) ** 2 for x in (8, 9, 10, 11, 12)) / 4)
    assert abs(hw - 2.776 * sd / math.sqrt(5)) < 1e-12


def test_interval_three_runs_uses_two_df():
    runs = [_w(10, x) for x in (9, 10, 11)]
    _, hw = rr.interval(runs, B, A)
    assert abs(hw - 4.303 * 0.1 / math.sqrt(3)) < 1e-12
