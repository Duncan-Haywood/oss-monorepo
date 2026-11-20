"""Milestone 3v: stale-calibration detection with the floored pool (experiments/m3v_stale)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3v_an", os.path.join(HERE, "..", "experiments", "m3v_stale", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def _row(rank, f, model="est", sd_rel=0.005):
    return {"rank": rank, model: {"f": f, "sd_rel": sd_rel}}


def test_own_floor_ignores_windows_without_the_models_estimate():
    hist = [_row(i, 500.0 + d, "est") for i, d in enumerate([-10, -5, 0, 5, 10])]
    assert an.tau2_own(hist, "est_c") is None
    assert an.tau2_own(hist, "est") is not None
    hist += [_row(10 + i, 500.0, "est_c") for i in range(5)]
    assert an.tau2_own(hist, "est_c") == 0.0          # five identical own values: no scatter


def _bl(x, sd, ref=500.0):
    return [{"ref": {"board": ref}, "tf": (xi, si)} for xi, si in zip(x, sd)]


def test_gate_power_false_alarm_and_decision_error():
    bl = _bl([500.0] * 10, [5.0] * 10)               # perfect pools, sd 1% of f
    g = an.gate(bl, "tf")
    assert g["false_alarm"] == 0.0
    assert g["curve"]["1.0"]["power"] == 0.0 and g["curve"]["3.0"]["power"] == 1.0
    assert g["mds"] == 2.5                            # 2 sd = 2%, strict inequality
    assert g["curve"]["1.0"]["med_e"] == 1.0          # kept the 1% stale value
    assert g["curve"]["3.0"]["med_e"] == 0.0          # adopted the perfect pool
    assert abs(g["worst_med_e"] - 2.0) < 1e-12


def test_gate_power_is_symmetric_average():
    bl = _bl([510.0] * 4, [5.0] * 4)                  # pools 2% high
    c = an.gate(bl, "tf")["curve"]["2.0"]
    assert c["power"] == 0.5                          # +2% held agrees, -2% held is 4% off
