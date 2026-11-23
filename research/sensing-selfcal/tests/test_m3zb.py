"""Milestone 3zb: a held distortion that is itself wrong (experiments/m3zb_staledist)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3zb_an", os.path.join(HERE, "..", "experiments", "m3zb_staledist", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def test_two_gates_fire_independently():
    held = {"f": 500.0, "k1": 0.2, "k2": -0.5, "k3": 0.3}
    hd = an.d200(held)
    # f within half an sd, distortion far: only the distortion is adopted, k3 dropped
    pool = {"f": 501.0, "sd": 4.0, "k1": 0.0, "k2": 0.0, "D": hd - 5.0, "sdD": 1.0}
    u = an.updated("two_gates", pool, held)
    assert u == {"f": 500.0, "k1": 0.0, "k2": 0.0, "k3": 0.0}
    # f far, distortion within half an sd: only f
    pool = {"f": 520.0, "sd": 4.0, "k1": 0.0, "k2": 0.0, "D": hd + 0.2, "sdD": 1.0}
    assert an.updated("two_gates", pool, held) == {"f": 520.0, "k1": 0.2, "k2": -0.5, "k3": 0.3}
    # no distortion bar: the distortion is never adopted
    pool = {"f": 520.0, "sd": 4.0, "k1": 0.0, "k2": 0.0, "D": None, "sdD": None}
    assert an.updated("two_gates", pool, held)["k1"] == 0.2
    # the other five rules are 3za's
    pool = {"f": 520.0, "sd": 4.0, "k1": 0.1, "k2": -0.2, "D": 0.0, "sdD": 1.0}
    assert an.updated("joint_always", pool, held) == {"f": 520.0, "k1": 0.1, "k2": -0.2, "k3": 0.0}


def test_wrong_held_distortion_costs_never_and_joint_repairs_it():
    T = {"u": {"f": 500.0, "k1": 0.1, "k2": 0.0, "k3": 0.0}}
    H = {"u": {"k1": 0.0, "k2": 0.0, "k3": 0.0}}
    # a perfect pool (the truth, tiny sd): joint always is exact; never carries the held distortion's error
    b = [{"unit": "u", "seq": "s", "f": 500.0, "sd": 1e-6, "k1": 0.1, "k2": 0.0, "D": an.d200(T["u"]), "sdD": 1e-6}]
    sc = an.score(b, T, H)
    r = sc["rules"]
    assert r["joint_always"]["med"][0] < 1e-9
    assert r["never"]["med"][0] > 0.5          # k1 = 0.1 at x ~ 0.5 is several px
    assert r["f_gate0.5"]["med"][0] > 0.5      # f is right, so f-only cannot repair the distortion
    assert r["two_gates"]["med"][0] < 1e-9     # the distortion gate fires
    assert sc["two_gate_fires_d0"] == {"f": 0, "D": 1, "n": 1}


def test_scaled_sweep_and_breakeven():
    ref = {"u": {"f": 500.0, "k1": 0.2, "k2": -0.4, "k3": 0.0}}
    s = an.scaled(ref, -50)
    assert np.isclose(s["u"]["k1"], 0.1) and np.isclose(s["u"]["k2"], -0.2)
    mk = lambda j, f: {"rules": {"joint_gate0.5": {"worst_regret": j}, "f_gate0.5": {"worst_regret": f}}}
    sweep = {-10: mk(1, 0), -5: mk(1, 0), 5: mk(1, 0), 10: mk(0.5, 1.0), 15: mk(0.1, 1.0)}
    assert an.breakeven(sweep, 1) == 10 and an.breakeven(sweep, -1) is None
