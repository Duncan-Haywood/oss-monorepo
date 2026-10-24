import numpy as np
import pytest

from buildbot_mjsheet import mjplant as P
from buildbot_skills import model as M

POL = dict(K=1000.0, B=150.0, Ki=0.0)


def world(**kw):
    w = M.nominal_world(1, kind="B")
    for k, v in kw.items():
        w[k] = np.full(1, v, float)
    return w


def test_matches_numpy_plant_b_nominal():
    w = world()
    a = M.simulate(w, POL, "B")
    c = P.episode(w, POL, 0)
    assert c["peak_tilt_deg"] == pytest.approx(a["peak_tilt_deg"][0], rel=0.01)
    assert c["person_kg_peak"] == pytest.approx(a["person_kg_peak"][0], rel=0.05)


def test_stiff_board_instant_actuator_reproduces_cohold_figures():
    # buildbot-cohold published 2.2422 deg / 11.4222 kg for 22 kg, T=2 s, K=1000, B=150, lag 0.2 s (rigid rod)
    c = P.episode(world(kflex=1e5, delay=0.0, tau_a=1e-3), POL, 0)
    assert c["peak_tilt_deg"] == pytest.approx(2.2422, abs=0.03)
    assert c["person_kg_peak"] == pytest.approx(11.4222, rel=0.04)


def test_static_hold_splits_weight_evenly():
    # a sheet that is not lifted (T huge so the path barely moves in the window) with exact feed-forward: person carries ~half
    c = P.episode(world(T=1000.0, lag=0.0), dict(K=1000.0, B=150.0, Ki=0.0), 0)
    assert c["person_kg_peak"] == pytest.approx(11.0, abs=0.3)   # 22 kg / 2


def test_unstable_gains_are_flagged():
    c = P.episode(world(delay=0.03, tau_a=0.05), dict(K=28900.0, B=20.0, Ki=0.0), 0)
    assert not c["ok"]
