import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rb = _mod("rtk_baro_test", "rtk_baro.py")


def test_pick_rtk_takes_most_fixed():
    a = ("vehicle_gps_position", 0, {"fix_type": np.array([3, 3, 6])})
    b = ("sensor_gps", 1, {"fix_type": np.array([6, 6, 5])})
    c = ("sensor_gps", 0, {"fix_type": np.array([3, 4, 5])})
    assert rb.pick_rtk([a, b, c])[:2] == ("sensor_gps", 1)
    assert rb.pick_rtk([c]) is None


def test_rtk_ok_age_fix_and_accuracy():
    gt = np.array([0.0, 1.0, 2.0, 3.0])
    fix = np.array([6, 6, 5, 6])
    acc = np.array([0.02, 0.5, 0.02, 0.02])
    t = np.array([-0.1, 0.2, 0.7, 1.2, 2.2, 3.4, 3.6])
    assert rb.rtk_ok(t, gt, fix, acc).tolist() == [False, True, False, False, False, True, False]


def test_line_resid_removes_line():
    t = np.linspace(0, 100, 501)
    x = 3.0 + 0.02 * t + 0.1 * np.sin(t)
    r = rb.line_resid(t, x)
    assert abs(np.sqrt(np.mean(r ** 2)) - 0.1 / np.sqrt(2)) < 0.01


def test_highpass_keeps_fast_drops_slow():
    t = np.arange(0, 600, 0.1)
    fast = 0.2 * np.sin(2 * np.pi * t / 5.0)
    slow = 2.0 * np.sin(2 * np.pi * t / 600.0)
    r = rb.highpass_rms(t, fast + slow, 60.0)
    assert abs(r - 0.2 / np.sqrt(2)) < 0.03


def test_highpass_respects_gaps():
    t = np.r_[np.arange(0, 50, 0.1), np.arange(100, 150, 0.1)]
    x = np.r_[np.zeros(500), np.full(500, 10.0)]
    assert rb.highpass_rms(t, x, 300.0) < 1e-9


def test_speed_term_recovers_coefficient():
    rng = np.random.default_rng(1)
    t = np.arange(0, 300, 0.1)
    v = 6.0 + 5.0 * np.sin(t / 20.0)
    d = 1.0 + 0.001 * t - 0.004 * v ** 2 + 0.05 * rng.standard_normal(len(t))
    assert abs(rb.speed_term(t, d, v) + 0.004) < 2e-4
    assert np.isnan(rb.speed_term(t, d, np.full(len(t), 3.0)))


def test_usable_drops_duplicates():
    s = {"n": 10, "r_lin": 0.5}
    d = {"logs": [{"id": "a", "enroute": s}, {"id": "b", "enroute": dict(s)}, {"id": "c", "enroute": None}]}
    assert [f["id"] for f in rb.usable(d, "enroute")] == ["a"]
