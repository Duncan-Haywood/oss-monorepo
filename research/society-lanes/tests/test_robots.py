"""Tests for robots.py (pure numpy) and one simulator smoke test that skips without jupedsim."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import robots as R  # noqa: E402


def test_lane_sides_follow_heading():
    d = np.array([1.0, -1.0])
    # heading +x the right is small y; heading -x it is large y
    assert list(R.lane_y(d, 4.0, +1)) == [1.0, 3.0]
    assert list(R.lane_y(d, 4.0, -1)) == [3.0, 1.0]


def test_crowd_and_opposite_targets_mirror():
    pos = np.array([[5.0, 2.0], [6.0, 2.0], [7.0, 1.0]])
    d = np.array([1.0, -1.0, 1.0])
    isr = np.array([True, True, False])
    g = np.full(3, np.nan)
    _, ty_c = R.robot_targets(pos, d, g, isr, "crowd", 4.0, 16.0, 0.25)
    _, ty_o = R.robot_targets(pos, d, g, isr, "opposite", 4.0, 16.0, 0.25)
    assert list(ty_c) == [1.0, 3.0] and list(ty_o) == [3.0, 1.0]


def test_adapt_follows_same_direction_people_in_range():
    pos = np.array([[5.0, 2.0], [6.0, 0.8], [7.0, 1.2], [6.0, 3.5], [12.0, 3.5]])
    d = np.array([1.0, 1.0, 1.0, -1.0, 1.0])  # walker 3 oncoming, walker 4 out of range
    isr = np.array([True, False, False, False, False])
    _, ty = R.robot_targets(pos, d, np.full(5, np.nan), isr, "adapt", 4.0, 16.0, 0.25)
    assert ty[0] == pytest.approx(1.0)
    alone = np.array([[5.0, 2.7]])
    _, ty1 = R.robot_targets(alone, np.array([1.0]), np.array([np.nan]), np.array([True]), "adapt", 4.0, 16.0, 0.25)
    assert ty1[0] == pytest.approx(2.7)


def test_goal_policy_heads_to_exit():
    pos = np.array([[2.0, 2.0]])
    _, ty = R.robot_targets(pos, np.array([1.0]), np.array([1.0]), np.array([True]), "goal", 4.0, 16.0, 0.25)
    assert 1.0 < ty[0] < 2.0


def test_bad_policy_raises():
    with pytest.raises(ValueError):
        R.robot_targets(np.zeros((1, 2)), np.ones(1), np.full(1, np.nan), np.ones(1, bool), "x", 4, 16, 0.25)


def test_pass_tracker_clearance_and_kinds():
    tr = R.PassTracker(0.0, 16.0, 0.25)
    ids = [1, 2, 3]
    d = np.array([1.0, -1.0, -1.0])
    isr = np.array([True, False, False])
    for t in range(21):
        x = -1.0 + 0.1 * t
        pos = np.array([[8.0 + x, 1.0], [8.0 - x, 1.8], [8.0 - x, 3.5]])
        tr.update(ids, pos, d, isr)
    s = tr.summary()
    assert s["rp_passes"] == 2 and s["pp_passes"] == 0
    # closest centre distances 0.8 and 2.5 m; less two radii: 0.3 (close) and 2.0
    assert sorted(round(g, 6) for g in tr.rp) == [0.3, 2.0]
    assert s["rp_close"] == 0.5


def test_person_person_passes_counted_when_no_robot():
    tr = R.PassTracker(0.0, 16.0, 0.25)
    for t in range(21):
        x = -1.0 + 0.1 * t
        tr.update([1, 2], np.array([[8.0 + x, 1.0], [8.0 - x, 2.0]]), np.array([1.0, -1.0]),
                  np.array([False, False]))
    assert tr.summary()["pp_passes"] == 1 and tr.summary()["rp_passes"] == 0


def test_simulate_with_robots_reports_passes():
    pytest.importorskip("jupedsim")
    import sftwin as S
    r = S.simulate(16, 3.6, 16.0, 0.9, 0.1, 3, duration=50.0, warmup=20.0, robots=2, policy="opposite")
    assert r["failed"] == 0 and r["rp_passes"] > 0
    assert 0.0 < r["robot_speed"] <= 1.25
