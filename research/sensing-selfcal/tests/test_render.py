"""Milestone 6b: the renderer and the image statistics it is matched with."""
import os, sys
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from selfcal import board_points, project, detect, match_order  # noqa: E402
from render import undistort_norm, render_clean, degrade, edge_sigmas, noise_sigma, grey_levels  # noqa: E402

SIZE = (640, 480)
INTR = (540.0, 330.0, 240.0, -0.28, 0.08)
RV = np.array([0.15, -0.2, 0.05])
TV = np.array([-4.0, -2.5, 16.0])
LEVELS = (25.0, 235.0, 95.0)


def test_undistort_inverts_the_radial_model():
    rng = np.random.default_rng(0)
    xn = rng.uniform(-0.5, 0.5, (200, 2))
    r2 = (xn ** 2).sum(1, keepdims=True)
    xd = xn * (1 + INTR[3] * r2 + INTR[4] * r2 ** 2)
    assert np.abs(undistort_norm(xd, INTR[3], INTR[4]) - xn).max() < 1e-9


def _truth():
    return project(np.array(INTR), RV, TV, board_points(), 2)[0]


def test_render_puts_corners_at_the_projected_points():
    clean = render_clean(INTR, RV, TV, SIZE, LEVELS)
    img = degrade(clean, 0.8, 0.0, np.random.default_rng(0), jpeg=0)
    truth = _truth()
    c, _ = detect(img, method="sb")
    assert c is not None
    e = np.linalg.norm(match_order(truth, c) - truth, axis=1)
    assert np.sqrt((e ** 2).mean()) < 0.1


def test_statistics_recover_known_levels_blur_and_noise():
    clean = render_clean(INTR, RV, TV, SIZE, LEVELS)
    truth = _truth()
    dark, bright = grey_levels(clean, truth)
    assert abs(dark - LEVELS[0]) < 1 and abs(bright - LEVELS[1]) < 1
    img = cv2.GaussianBlur(clean, (0, 0), 1.2)
    s = np.median(edge_sigmas(img, truth))
    # area sampling adds a one-pixel box (sigma^2 = 1/12) to the Gaussian
    assert abs(s - np.sqrt(1.2 ** 2 + 1 / 12)) < 0.1
    noisy = clean + np.random.default_rng(1).normal(0, 3.0, clean.shape)
    assert abs(noise_sigma(noisy, truth) - 3.0) < 0.3


def test_half_width_end_squares():
    from render import board_intensity
    xb = np.array([-0.75, -0.25, 8.25, 8.75, 4.5])
    yb = np.full(5, 2.5)
    full = board_intensity(xb, yb, LEVELS, margin=0.5, xreach=1.0)
    half = board_intensity(xb, yb, LEVELS, margin=0.5, xreach=0.5)
    assert np.all(full[[0, 1]] == full[0]) and full[0] in (LEVELS[0], LEVELS[1])
    assert half[0] == LEVELS[1] and half[3] == LEVELS[1]       # beyond the half square: white margin
    assert half[1] == full[1] and half[2] == full[2] and half[4] == full[4]
