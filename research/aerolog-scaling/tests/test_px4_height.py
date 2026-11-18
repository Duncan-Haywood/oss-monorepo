import importlib.util
import math
import os

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ph = _mod("px4_height_test", "px4_height.py")


def test_duration_parse():
    assert ph.duration_s("3m44s") == 224.0
    assert ph.duration_s("12s") == 12.0
    assert ph.duration_s("1h2m3s") == 3723.0
    assert math.isnan(ph.duration_s("N/A"))


def test_multirotor_filter():
    row = lambda t, hw="PX4_FMU_V6X", d=300.0: {"id": "x", "type": t, "hardware": hw, "duration_s": d}
    assert ph.keep(row("Quadrotor"))
    assert ph.keep(row("Hexarotor"))
    assert not ph.keep(row("Quad-rotor VTOL (Tailsitter)"))
    assert not ph.keep(row("Fixed Wing"))
    assert not ph.keep(row("Quadrotor", hw="PX4_SITL"))
    assert not ph.keep(row("Quadrotor", d=60.0))


def test_parse_row():
    r = [1, '<a href="plot_app?log=abc-123">2026-11-17</a>', "img", "Quadrotor", "Generic", "PX4_FMU_V6C",
         "v1.15.0", "3m50s", "x", "Position, Mission"]
    p = ph.parse_row(r)
    assert p["id"] == "abc-123" and p["date"] == "2026-11-17" and p["duration_s"] == 230.0


def test_settled():
    t = np.arange(0.0, 20.0, 1.0)
    bad = np.zeros(20, dtype=bool)
    bad[3] = True
    s = ph.settled(t, bad, settle=5.0)
    assert not s[3:8].any() and s[8:].all() and not s[:3].any()  # first 5 s from the start also settle


def test_masks_level_and_enroute():
    t = np.arange(0.0, 60.0, 0.1)
    n = len(t)
    zsp = np.where(t < 10, -t * 2.0, -20.0)          # climbing to 20 m, then level
    vzsp = np.where(t < 10, -2.0, 0.0)
    vx = np.where(t > 30, 5.0, 0.0)
    ones = np.ones(n, dtype=bool)
    level, enr = ph.masks(t, zsp + 0.1, zsp, vzsp, vx, np.zeros(n), ones, np.full(n, 3), ones)
    assert not level[t < 15].any() and level[t > 15.1].all()
    assert enr[t > 30.05].all() and not enr[t < 30].any()


def test_acf_time_ar1():
    rng = np.random.default_rng(0)
    dt, tau = 0.1, 3.0
    phi = math.exp(-dt / tau)
    x = np.zeros(20000)
    for i in range(1, len(x)):
        x[i] = phi * x[i - 1] + rng.normal()
    t = np.arange(len(x)) * dt
    est = ph.acf_time(t, x)
    assert abs(est - tau) < 0.6


def test_acf_time_white_short():
    t = np.arange(0.0, 10.0, 0.1)    # shorter than MIN_SEG_S
    assert math.isnan(ph.acf_time(t, np.sin(t)))


def test_summarise_rms_includes_bias():
    t = np.arange(0.0, 100.0, 0.1)
    e = 0.3 + 0.4 * np.sin(t)
    s = ph.summarise(t, e)
    assert abs(s["rms"] - math.sqrt(0.09 + 0.08)) < 0.01
    assert abs(s["mean"] - 0.3) < 0.01
    assert 95 <= len(s["e_1hz_cm"]) <= 100
