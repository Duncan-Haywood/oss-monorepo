"""Tests for milestone 6f's factorial arms, seeds and effect arithmetic (experiments/m6f_factorial.py)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import m6f_factorial as M  # noqa: E402
import m5_robots as M5  # noqa: E402
import robots as R  # noqa: E402


def test_job_count_is_the_registered_1920_at_40_seeds():
    assert len(list(M.cells())) == 48
    assert len(M.jobs()) == 48 * M.SEEDS


def test_robot_arms_share_bodies_and_differ_only_in_steering_and_speed():
    by = {}
    for j in M.jobs():
        fam, m, run, n, c, s = j[0].split("|")
        by[(fam, m, run, s, c)] = j
    for (fam, m, run, s, c), j in by.items():
        if c not in M.ARMS:
            continue
        assert (j[6], j[7]) == M.ARMS[c]
        ctl, none = by[(fam, m, run, s, "control")], by[(fam, m, run, s, "none")]
        assert j[3] == none[3] and ctl[3] == j[3] - j[5] and ctl[5] == 0 and j[5] > 0
    assert M.ARMS["lc"] == ("crowd", M5.SPEED) and M.ARMS["hp"] == (R.HUMAN, R.PEOPLE_SPEED)


def test_fresh_seeds_disjoint_from_earlier_milestones():
    import m6e_orca_speed as M6E
    import m6d_lane_test as M6D
    new = {j[-1] for j in M.jobs()}
    old = set()
    for mod in (M6E, M6D):
        old |= set(range(mod.SEED0, mod.SEED0 + mod.FULL_SEEDS))
    old |= set(range(M6E.CALIB_SEED0, M6E.CALIB_SEED0 + M6E.CALIB_SEEDS))
    old |= set(range(M5.SEED0, M5.SEED0 + M5.SEEDS))
    assert not new & old and len(new) == M.SEEDS


def test_factorial_effects_decompose():
    vals = dict(none=10.0, control=9.0, hp=10.1, hc=10.4, lp=10.9, lc=11.6)
    pt = {("cfsm", 0.5, c): dict(transit=v, lane=0.9, share=0.9) for c, v in vals.items()}
    e = M.effects(pt, "cfsm", 0.5)
    assert e[("robot", "transit")] == pytest.approx(e[("steer", "transit")] + e[("cap", "transit")])
    assert e[("steer", "transit")] == pytest.approx((0.8 + 1.2) / 2)
    assert e[("cap", "transit")] == pytest.approx((0.3 + 0.7) / 2)
    assert e[("inter", "transit")] == pytest.approx(0.7 - 0.3)
    assert e[("seed", "transit")] == pytest.approx(2.6)
    assert e[("check", "transit")] == pytest.approx(0.1)


def test_orca_accepts_human_steering_and_people_speed_robots():
    pytest.importorskip("numba")
    import orca
    kw = dict(duration=45.0, warmup=40.0, robots=4, passes=True)
    a = orca.simulate(20, 3.6, 16.0, 0.9, 1.0, 7, policy=R.HUMAN, robot_speed=R.PEOPLE_SPEED, **kw)
    b = orca.simulate(20, 3.6, 16.0, 0.9, 1.0, 7, policy=R.HUMAN, robot_speed=1.2, **kw)
    c = orca.simulate(20, 3.6, 16.0, 0.9, 1.0, 7, policy="crowd", robot_speed=None, **kw)
    d = orca.simulate(20, 3.6, 16.0, 0.9, 1.0, 7, policy="crowd", robot_speed=1.2, **kw)
    assert a["failed"] == b["failed"] == 0
    assert repr(c) == repr(d)  # the default speed is the 1.2 m/s cap, unchanged (repr: nan != nan)
    assert repr(a) != repr(b) and repr(b) != repr(c)
