"""Milestone 7ah: the acceleration-step probe and the lag estimators. The area estimate is exact for a first-order lag; the
open-outer-loop probe is inert by default; the verdicts file is what the script prints from results.json."""
import os, subprocess, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m7ah_att_step")
sys.path.insert(0, os.path.join(HERE, "..", "src"))


def test_area_estimate_is_exact_for_first_order_lag():
    """integral_0^inf (1 - a/a_ss) dt = tau for a(t) = a_ss (1 - exp(-t/tau)); the probe's 2 s window and 2 ms step leave < 1 ms."""
    dt, tau = 0.002, 0.17
    t = (np.arange(1000) + 1) * dt
    frac = 1 - np.exp(-t / tau)
    assert abs(((1 - frac) * dt).sum() - tau) < 0.001


def test_acc_cmd_default_is_inert():
    from codesign_cant import aero as A, poshold as P
    sz = A.size(np.array([0.12]), np.array([0.127]), np.array([0.5]), actuator="hover")
    g = P.phys_gains(np.full((1, 9), 0.5))
    a = P.rollout(sz, g, 0.01, episodes=2, seed=1, steps=200)
    b = P.rollout(sz, g, 0.01, episodes=2, seed=1, steps=200, acc_cmd=None)
    assert np.array_equal(a["pos_ep"], b["pos_ep"])


def test_probe_reaches_the_request_at_small_signal():
    """From results.json: at the 1 m/s^2 request every design's steady acceleration is within 10% of it and no flight died."""
    import json
    p = os.path.join(D, "results.json")
    if not os.path.exists(p):
        return
    R = json.load(open(p))
    rs = [r for r in R["resp"] if r["amp"] == 1.0]
    assert len(rs) == 108 and sum(r["dead"] for r in rs) == 0
    assert all(abs(np.nanmedian(np.array(r["a_ss"], float)) - 1.0) < 0.1 for r in rs)


def test_verdicts_file_is_what_the_script_prints():
    if not os.path.exists(os.path.join(D, "results.json")):
        return
    before = open(os.path.join(D, "verdicts.txt")).read()
    subprocess.run([sys.executable, "verdicts.py"], cwd=D, check=True, capture_output=True)
    assert open(os.path.join(D, "verdicts.txt")).read() == before
    assert before.count("AH") >= 9 and "AH8 (" in before
