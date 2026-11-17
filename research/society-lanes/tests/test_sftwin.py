"""Tests for the pure parts of sftwin.py (no simulator needed except the last, which skips)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sftwin as S  # noqa: E402


def test_right_offset_sign():
    # heading +x, the right is small y; heading -x, the right is large y
    assert S.right_offset(0.5, 1, 4.0) > 0
    assert S.right_offset(3.5, 1, 4.0) < 0
    assert S.right_offset(3.5, -1, 4.0) > 0
    assert S.right_offset(2.0, 1, 4.0) == 0


def test_no_bias_steers_straight():
    pos = np.array([[5.0, 2.0], [6.0, 2.1]])
    tx, ty = S.steer_targets(pos, np.array([1.0, -1.0]), np.array([np.nan, np.nan]), 0.0, 4.0, 16.0)
    assert list(ty) == [2.0, 2.1]
    assert tx[0] > 5.0 and tx[1] < 6.0


def test_bias_turns_both_to_own_right_when_oncoming():
    pos = np.array([[5.0, 2.0], [6.0, 2.1]])
    _, ty = S.steer_targets(pos, np.array([1.0, -1.0]), np.array([np.nan, np.nan]), 0.2, 4.0, 16.0)
    assert ty[0] < 2.0       # +x walker moves to small y (its right)
    assert ty[1] > 2.1       # -x walker moves to large y (its right)


def test_bias_ignores_walkers_behind_or_same_direction():
    pos = np.array([[5.0, 2.0], [4.0, 2.0], [6.0, 2.0]])
    d = np.array([1.0, -1.0, 1.0])  # the oncoming one is behind walker 0; walker 2 goes the same way
    _, ty = S.steer_targets(pos, d, np.full(3, np.nan), 0.5, 4.0, 16.0)
    assert ty[0] == 2.0


def test_lateral_goal_pulls_toward_exit_side():
    pos = np.array([[2.0, 2.0]])
    _, ty = S.steer_targets(pos, np.array([1.0]), np.array([3.0]), 0.0, 4.0, 16.0)
    assert 2.0 < ty[0] < 3.0


def test_measure_counts_side_and_lane():
    # two +x walkers on their right (small y), two -x on theirs (large y): share 1, lanes pure
    samples, dirs = {}, {}
    for a, (d, y) in enumerate([(1, 0.5), (1, 0.9), (-1, 3.1), (-1, 3.5)] * 2):
        xs = [4 + 0.13 * k if d > 0 else 12 - 0.13 * k for k in range(60)]
        samples[a] = [(k, x, y) for k, x in enumerate(xs)]
        dirs[a] = d
    m = S.measure(samples, dirs, 4.0, 0.1)
    assert m["share"] == 1.0
    assert m["lane"] == pytest.approx(1.0)
    assert m["speed"] == pytest.approx(1.3, abs=1e-6)


def test_simulate_runs_when_jupedsim_present():
    pytest.importorskip("jupedsim")
    r = S.simulate(20, 3.6, 16.0, 1.0, 0.35, 1, duration=40, warmup=15)
    assert r["failed"] == 0 and r["walkers"] > 0
    assert 0.5 < r["speed"] < 2.0


def test_radius_sets_lateral_clip():
    pos = np.array([[5.0, 0.1]])
    _, ty = S.steer_targets(pos, np.array([1.0]), np.array([np.nan]), 0.0, 4.0, 16.0, radius=0.2)
    assert ty[0] == pytest.approx(0.25)
    _, ty = S.steer_targets(pos, np.array([1.0]), np.array([np.nan]), 0.0, 4.0, 16.0)
    assert ty[0] == pytest.approx(S.RADIUS + 0.05)


def test_unknown_model_rejected():
    pytest.importorskip("jupedsim")
    with pytest.raises(ValueError):
        S.simulate(10, 3.6, 16.0, 1.2, 0.0, 1, model="orca", duration=1.0, warmup=0.0)


def test_avm_runs_with_and_without_exit_goals():
    pytest.importorskip("jupedsim")
    for goals, e in ((False, 0.25), (True, 0.1), (True, 0.4)):
        r = S.simulate(30, 3.6, 16.0, 1.2, 0.1, 3, goals=goals, exit_frac=e, model="avm",
                       duration=40.0, warmup=10.0)
        assert r["failed"] == 0 and r["walkers"] > 0
        assert 0.0 <= r["share"] <= 1.0 and len(r["flags"]) == r["walkers"]


def test_bias_weight_rules():
    # width 4: +x walker's right is small y. Goals at y=1 (its right) and y=3 (its left)
    d = np.array([1.0, 1.0, 1.0, -1.0])
    g = np.array([1.0, 3.0, np.nan, 1.0])   # last: -x walker, y=1 is on its left
    assert list(S.bias_weight(d, g, 4.0, "always")) == [1, 1, 1, 1]
    assert list(S.bias_weight(d, g, 4.0, "yield")) == [1, 0, 1, 0]
    assert S.bias_weight(d, g, 4.0, "scaled") == pytest.approx([0.75, 0.25, 1.0, 0.25])
    with pytest.raises(ValueError):
        S.bias_weight(d, g, 4.0, "bogus")


def test_yield_rule_drops_bias_toward_wrong_side_only():
    pos = np.array([[5.0, 2.0], [6.0, 2.1]])
    d = np.array([1.0, -1.0])
    nogoal = np.full(2, np.nan)
    _, a = S.steer_targets(pos, d, nogoal, 0.3, 4.0, 16.0, rule="always")
    _, b = S.steer_targets(pos, d, nogoal, 0.3, 4.0, 16.0, rule="yield")
    assert list(a) == list(b)          # free runs are unchanged by the rule
    goal = np.array([3.0, 3.0])        # +x walker: goal on its left; -x walker: goal on its right
    _, c = S.steer_targets(pos, d, goal, 0.3, 4.0, 16.0, rule="yield")
    _, c0 = S.steer_targets(pos, d, goal, 0.0, 4.0, 16.0)
    assert c[0] == pytest.approx(c0[0])  # bias off for the walker heading left of its goal
    assert c[1] > c0[1]                  # bias kept for the other


def test_cfsm_runs():
    pytest.importorskip("jupedsim")
    r = S.simulate(30, 3.6, 16.0, 1.2, 0.1, 2, goals=True, model="cfsm", rule="yield",
                   duration=40.0, warmup=10.0)
    assert r["failed"] == 0 and r["walkers"] > 0
