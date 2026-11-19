"""Milestone 7ag: the point-mass rise model and its out-of-sample check. The model's closed-form limits are exact; the verdicts
file is what the script prints from results.json."""
import json, os, subprocess, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m7ag_cruise")
sys.path.insert(0, D)
from cruise_model import rise_point_mass, overshoot_point_mass, cruise_line  # noqa: E402


def test_saturated_cruise_speed():
    """Inside the cap with no integrator the model is v' = A_P - kd v from rest, so x travelled = v_inf (t - (1 - exp(-kd t))/kd)
    with v_inf = A_P / kd; a 20 m step reaches 90% (18 m, all inside the cap) at 0.9 S kd / A_P + 1/kd once exp(-kd t) is gone."""
    kp, kd, a_p, S = 15.0, 5.0, 3.5, 20.0
    r = float(rise_point_mass(kp, kd, 0.0, a_p, S, band=None, t_end=40.0)[0])
    assert abs(r - (0.9 * S * kd / a_p + 1.0 / kd)) < 0.01


def test_linear_regime_matches_second_order():
    """With the cap never active, the model is x'' = -kp x - kd x'; critically damped kp = kd^2/4 reaches 10% at the root of
    (1 + w t) exp(-w t) = 0.1, w t = 3.8897."""
    kd = 8.0; kp = kd * kd / 4
    r = float(rise_point_mass(kp, kd, 0.0, 1e6, 1.0, band=None)[0])
    assert abs(r - 3.8897 / (kd / 2)) < 0.004
    assert float(overshoot_point_mass(kp, kd, 0.0, 1e6, 1.0, band=None)[0]) < 1e-9


def test_line_is_7af():
    assert abs(float(cruise_line(6.0, 3.5)) - (0.9 * 0.9 * 6.0 / 3.5 + 0.33)) < 1e-12


def test_verdicts_file_is_what_the_script_prints():
    if not os.path.exists(os.path.join(D, "results.json")):
        return
    before = open(os.path.join(D, "verdicts.txt")).read()
    subprocess.run([sys.executable, "verdicts.py"], cwd=D, check=True, capture_output=True)
    assert open(os.path.join(D, "verdicts.txt")).read() == before
    assert "AG0: held" in before and before.count("AG") >= 10
    r = json.load(open(os.path.join(D, "results.json")))
    assert len(r["gains"]) == 36 and len(r["resp"]) == 36 * 3 * 7
