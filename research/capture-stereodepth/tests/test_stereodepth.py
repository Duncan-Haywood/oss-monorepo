import numpy as np
from capture_stereodepth.scene import render, stereo_pair, W, H, F
from capture_stereodepth.stereo import match, depth_errors, cost_volume


def test_stereo_pair_left_view_is_the_ring_camera():
    lc, lz, rc, rz = stereo_pair(20, 0.2)
    c, z = render(20)
    assert np.array_equal(lc, c) and np.array_equal(lz, z)
    assert rc.shape == (H, W, 3) and not np.array_equal(rc, lc)


def test_noise_is_seeded_and_changes_the_image():
    a, _ = render(20, noise=0.02, seed=3)
    b, _ = render(20, noise=0.02, seed=3)
    c, _ = render(20)
    assert np.array_equal(a, b) and not np.array_equal(a, c)


def test_disparity_matches_f_b_over_z_on_clean_images():
    lc, lz, rc, _ = stereo_pair(20, 0.2)
    z, disp, ok = match(lc, rc, 0.2)
    e, cov = depth_errors(z, lz)
    assert cov > 0.8 and np.median(e) < 0.03


def test_longer_baseline_lowers_median_error_until_occlusion():
    med = []
    for b in (0.03, 0.2):
        lc, lz, rc, _ = stereo_pair(20, b, noise=0.01)
        e, _ = depth_errors(match(lc, rc, b)[0], lz)
        med.append(np.median(e))
    assert med[1] < med[0]


def test_flat_image_gives_no_depth():
    img = np.full((H, W, 3), 0.5)
    z, _, ok = match(img, img, 0.2)
    assert not ok.any() and np.isinf(z).all()


def test_cost_volume_zero_for_identical_shifted_images():
    rng = np.random.default_rng(0)
    r = rng.random((H, W, 3))
    l = np.zeros_like(r)
    l[:, 5:] = r[:, :-5]   # left(x) = right(x - 5)
    cost = cost_volume(l, r, 10, 1)
    assert cost[5, 10:-10, 20:-5].max() < 1e-9
    assert cost.argmin(0)[10:-10, 20:-5].min() == 5


def test_depth_errors_ignore_sky_and_missing():
    zt = np.array([[2.0, np.inf], [4.0, 5.0]])
    ze = np.array([[2.2, 3.0], [np.inf, 5.0]])
    e, cov = depth_errors(ze, zt)
    assert np.allclose(e, [0.1, 0.0]) and abs(cov - 2 / 3) < 1e-9
