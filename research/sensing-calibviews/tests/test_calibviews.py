import numpy as np
import cv2
from calibviews import find_corners, calibrate, synthetic_study, heldout_error
from calibviews.calib import object_points


def test_finds_boards_in_real_images():
    names, corners, size = find_corners()
    assert len(corners) >= 10 and size == (640, 480)
    assert all(c.shape == (54, 1, 2) for c in corners)


def test_full_fit_matches_published_opencv_sample_scale():
    # OpenCV's calibration tutorial reports a ~530 px focal length for this image set
    _, corners, size = find_corners()
    cal = calibrate(corners, size, "full")
    assert 500 < cal["fx"] < 560 and cal["rms"] < 0.6


def test_noise_free_synthetic_recovers_truth():
    K = np.array([[600.0, 0, 320], [0, 600.0, 240], [0, 0, 1]])
    obj = object_points()
    rng = np.random.default_rng(0)
    views = []
    for _ in range(8):
        rv = rng.normal(0, 0.3, 3)
        tv = np.array([-4, -2.5, 20.0]) + rng.normal(0, 1, 3)
        p, _ = cv2.projectPoints(obj, rv, tv, K, np.zeros(5))
        views.append(p.astype(np.float32))
    cal = calibrate(views, (640, 480), "lean")
    assert abs(cal["fx"] / 600 - 1) < 1e-3
    assert heldout_error(cal, views) < 0.01


def test_synthetic_spread_shrinks_with_more_views():
    _, corners, size = find_corners()
    full = calibrate(corners, size, "lean")
    sy = synthetic_study(full, size, "lean", [3, 12], 40, full["rms"], seed=0)
    assert np.std(sy[12]) < np.std(sy[3])
