"""Milestone 3za: joint against focal-only updates, scored by where rays land (experiments/m3za_joint)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3za_an", os.path.join(HERE, "..", "experiments", "m3za_joint", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)
PIN = {"f": 500.0, "k1": 0.0, "k2": 0.0, "k3": 0.0}


def test_rules_take_what_they_say():
    pool = {"f": 510.0, "sd": 4.0, "k1": 0.1, "k2": -0.2}
    held = {"f": 500.0, "k1": 0.2, "k2": -0.5, "k3": 0.3}
    assert an.updated("never", pool, held) == held
    assert an.updated("f_always", pool, held) == {"f": 510.0, "k1": 0.2, "k2": -0.5, "k3": 0.3}
    assert an.updated("joint_always", pool, held) == {"f": 510.0, "k1": 0.1, "k2": -0.2, "k3": 0.0}
    # the gate fires at |510 - 500| = 10 > 0.5 * 4, and not when the pool is within half an sd
    assert an.updated("joint_gate0.5", pool, held)["k1"] == 0.1
    near = dict(pool, f=501.0)
    assert an.updated("f_gate0.5", near, held) == held and an.updated("joint_gate0.5", near, held) == held


def test_rms_p_is_zero_on_the_reference_and_delta_r_for_a_long_f():
    x = an.rays(PIN, an.BAND)
    assert an.rms_p(PIN, x, an.BAND) < 1e-9
    m = dict(PIN, f=505.0)                     # 1% long: P(r) = 0.01 r
    want = np.sqrt(np.mean((0.01 * np.array(an.BAND, float)) ** 2))
    assert abs(an.rms_p(m, x, an.BAND) - want) < 1e-9


def test_score_regret_and_breakeven_on_a_hand_case():
    # one block whose pool is exactly the reference: joint always is perfect at every delta,
    # never costs delta * r, so the break-even is 0 and joint always has no regret
    bl = [{"seq": "s", "unit": "u", "f": 500.0, "sd": 1.0, "k1": 0.0, "k2": 0.0}]
    sc = an.score(bl, {"u": PIN})
    assert sc["breakeven_delta"] == 0.0
    assert sc["rules"]["joint_always"]["worst_regret"] < 1e-9
    assert sc["rules"]["f_always"]["worst_regret"] < 1e-9     # the held distortion is the reference's here
    assert abs(sc["rules"]["never"]["med"][2] - an.rms_p(dict(PIN, f=505.0), an.rays(PIN, an.BAND), an.BAND)) < 1e-9
