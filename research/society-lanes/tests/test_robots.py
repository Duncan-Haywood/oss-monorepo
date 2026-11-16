"""Tests for the milestone 5 robot additions to sftwin.py."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sftwin as S  # noqa: E402


def test_lane_y_sides():
    # heading +x the right is small y; heading -x the right is large y
    assert S.lane_y(1, 1, 4.0) == 1.0 and S.lane_y(1, -1, 4.0) == 3.0
    assert S.lane_y(-1, 1, 4.0) == 3.0 and S.lane_y(-1, -1, 4.0) == 1.0


def test_robots_never_take_the_bias():
    pos = np.array([[5.0, 2.0], [6.0, 2.1]])
    d = np.array([1.0, -1.0])
    g = np.full(2, np.nan)
    _, ty = S.steer_targets(pos, d, g, 0.5, 4.0, 16.0, robot=np.array([True, False]))
    assert ty[0] == 2.0       # the robot is not pushed to its right
    assert ty[1] > 2.1        # the human still is


def test_adapt_follows_same_direction_majority():
    # robot 0 heads +x; two +x humans nearby on its left (large y), one on its right
    pos = np.array([[5.0, 2.0], [6.0, 3.5], [4.0, 3.2], [5.5, 0.5], [6.0, 0.5], [6.5, 0.6]])
    d = np.array([1.0, 1.0, 1.0, 1.0, -1.0, -1.0])
    robot = np.array([True, False, False, False, False, False])
    side = S.adapt_sides(pos, d, robot, 4.0, np.ones(6))
    assert side[0] == -1      # oncoming walkers do not vote; two of three own-direction are on its left
    far = pos.copy()
    far[1:, 0] += 20.0        # nobody within range: keep the current side
    assert S.adapt_sides(far, d, robot, 4.0, np.ones(6))[0] == 1


def test_robot_targets_merge_faster_than_goal_walkers():
    pos = np.array([[1.0, 2.0]])
    d = np.array([1.0])
    ty = S.robot_targets(pos, d, np.array([1.0]), 16.0)
    assert ty[0] == pytest.approx(2.0 - 1.0 * S.TARGET_AHEAD / S.ROBOT_MERGE)


def test_zero_robots_is_draw_for_draw_unchanged():
    pytest.importorskip("jupedsim")
    a = S.simulate(30, 3.6, 16.0, 1.2, 0.2, 5, model="cfsm", duration=40.0, warmup=10.0)
    b = S.simulate(30, 3.6, 16.0, 1.2, 0.2, 5, model="cfsm", duration=40.0, warmup=10.0,
                   robot_n=0, robot_policy="opposite", track_close=True)
    for k in ("walkers", "share", "lane", "speed", "density"):
        assert a[k] == b[k] or (a[k] != a[k] and b[k] != b[k])


def test_robots_run_and_are_counted_apart():
    pytest.importorskip("jupedsim")
    r = S.simulate(30, 3.6, 16.0, 1.2, 0.2, 3, model="cfsm", duration=60.0, warmup=20.0,
                   robot_n=3, robot_policy="adapt", robot_speed=0.9)
    assert r["failed"] == 0 and r["robot_passes"] > 0 and r["walkers"] > 0
    assert r["near_passes"] >= r["close_passes"] >= 0
    assert r["robot_vbar"] < 1.0      # desired speed 0.9 m/s
    with pytest.raises(ValueError):
        S.simulate(10, 3.6, 16.0, 1.2, 0.2, 3, robot_n=1, robot_policy="bogus")
