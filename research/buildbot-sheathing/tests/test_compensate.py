"""Milestone 33: model-based backlash compensation (predicted sides, misprediction classes, residual)."""
import numpy as np

from buildbot_sheathing import compensate as C
from buildbot_sheathing.pose_range import held_bias, nose_bias

GAP = 1e-3


def _rows(seed):
    rng = np.random.default_rng(seed)
    return rng.normal(size=(3, 4)), rng.normal(size=(3, 4))


def test_a_perfect_model_leaves_nothing():
    lo, hi = np.array([1.0, -2.0, 0.1, 3.0]), np.array([1.5, -2.5, 0.05, 2.0])
    d = held_bias(lo, hi, 0.2, GAP)
    dh = C.predicted_bias(lo, hi, 0.2, GAP)
    mu = C.compensated(_rows(0), _rows(1), d - dh, d - dh, 0.3)
    assert all(abs(v) < 1e-15 for k in mu for v in mu[k])


def test_classes_of_misprediction():
    d = np.array([+1, -1, 0, +1, 0]) * GAP / 2
    dh = np.array([-1, -1, +1, 0, 0]) * GAP / 2
    assert C.classify(d, dh, [1, 1, 1, 1, 1]) == (1, 1, 1)
    assert C.classify(d, dh, [0, 1, 1, 1, 1]) == (0, 1, 1)      # joints that do not move the nose ignored


def test_guard_band_drops_small_torques_only():
    lo, hi = np.array([0.5, -3.0]), np.array([0.6, -2.0])
    dh = C.predicted_bias(lo, hi, 0.2, GAP, tau_g=1.0)
    assert dh[0] == 0 and dh[1] == GAP / 2


def test_no_compensation_is_milestone_31s_one_calibration():
    """With delta_hat = 0 the compensated residual is pose_range.residual of the raw biases."""
    rp, rr = _rows(2), _rows(3)
    dp, dr = np.array([1, -1, 1, 0]) * GAP / 2, np.array([-1, -1, 1, 1]) * GAP / 2
    mu = C.compensated(rp, rr, dp, dr, 0.3)
    bp, br = nose_bias(*rp, dp, 0.3), nose_bias(*rr, dr, 0.3)
    assert np.isclose(mu["y"][0], bp["y"][0] - br["y"][0]) and np.isclose(mu["z"][1], bp["z"][1] - br["z"][1])
