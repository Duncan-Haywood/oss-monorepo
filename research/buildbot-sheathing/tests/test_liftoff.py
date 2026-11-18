"""Milestone 40: the re-press sets loose joints; the recoil bracket from published figures."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import liftoff as LO  # noqa: E402
from buildbot_sheathing.pose_range import held_bias  # noqa: E402

TF = 0.2


def test_nail_mass_and_bracket():
    # 8d common shank: pi (1.6637 mm)^2 * 63.5 mm * 7.85 g/cm^3 = 4.33 g
    assert abs(1e3 * LO.nail_mass() - 4.335) < 0.01
    lo, hi, parts = LO.recoil_bracket()
    assert math.isclose(parts["nail_chrono"][0], LO.nail_mass() * 97.7 * 0.3048)
    assert math.isclose(lo, LO.nail_mass() * 20.0)        # Peterson and Dixon's 20 m/s is the lowest velocity
    assert math.isclose(hi, 10.0 * 0.87)                  # (42.2 - 32.2) N over 0.87 s
    assert lo < 0.25 and hi > 1.0


def test_set_sign_last_crossing_wins():
    # three joints, window below tau_f for all; rise passes +tau_f then -tau_f (joint 0), only + (1), never (2)
    path = [np.array([0.5, 0.3, 0.1]), np.array([-0.3, 0.1, 0.05]), np.array([0.1, 0.1, 0.0])]
    lo, hi = np.array([0.05, 0.05, 0.05]), np.array([0.1, 0.1, 0.1])
    s = LO.set_sign(path, lo, hi, TF)
    assert list(s) == [-1.0, 1.0, 0.0]
    b = LO.lift_bias(path, lo, hi, TF, np.array([2.0, 2.0, 2.0]))
    assert list(b) == [1.0, -1.0, 0.0]


def test_window_held_or_partial_joints_are_not_set():
    path = [np.array([0.5, 0.5])]
    lo, hi = np.array([0.3, 0.1]), np.array([0.4, 0.25])   # joint 0 held; joint 1 reaches tau_f in the window
    assert list(LO.set_sign(path, lo, hi, TF)) == [0.0, 0.0]
    held = np.array([True, False])
    assert list(LO.still_loose(path, lo, hi, TF, held)) == [False, True]


def test_bias_convention_matches_held_bias():
    # a joint set positive carries the same bias a joint held positive does
    gap = 1e-3
    b_set = LO.lift_bias([np.array([0.5])], np.array([0.0]), np.array([0.1]), TF, gap)
    b_held = held_bias(np.array([0.5]), np.array([0.5]), TF, gap)
    assert np.allclose(b_set, b_held)


def test_entry_set_only_one_signed_joints_entering_above_tau_f():
    lo = np.array([0.3, 0.1, 0.3, -0.3, 0.5])
    hi = np.array([0.1, 0.3, -0.1, -0.05, 0.6])
    # 0: enters above, falls below -> +1; 1: rises through tau_f in the window -> 0; 2: changes sign -> 0;
    # 3: enters at -0.3, one-signed -> -1; 4: held over the window -> 0
    assert list(LO.entry_set(lo, hi, TF)) == [1.0, 0.0, 0.0, -1.0, 0.0]
