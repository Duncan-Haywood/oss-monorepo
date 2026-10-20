import numpy as np
from sensing_ghost import (make_canvas, render_frame, capture, object_mask, merge_mean, merge_median,
                           merge_sigclip, merge_refguided, masked_psnr)


def test_mean_is_sum_over_n_s():
    e = np.arange(24.0).reshape(3, 2, 4)
    assert np.allclose(merge_mean(e, 2.0, 1.0), e.sum(0) / (3 * 2.0))


def test_all_merges_agree_on_identical_frames():
    f = np.random.default_rng(0).uniform(10, 50, (6, 6))
    e = np.stack([f] * 5)
    for m in (merge_mean, merge_median, merge_sigclip, merge_refguided):
        assert np.allclose(m(e, 1.0, 3.0), f)


def test_static_noise_efficiency_order():
    # Gaussian-ish stack: median MSE is about pi/2 of the mean's; sigma-clip stays within 10% of the mean
    rng = np.random.default_rng(1)
    s, read, n = 50.0, 3.0, 31
    truth = np.full((64, 64), 0.4)
    e = np.stack([capture(truth, s, read, rng) for _ in range(n)])
    mse = lambda r: float(np.mean((r - 0.4) ** 2))
    assert 1.35 < mse(merge_median(e, s, read)) / mse(merge_mean(e, s, read)) < 1.75
    assert mse(merge_sigclip(e, s, read)) / mse(merge_mean(e, s, read)) < 1.1
    assert mse(merge_refguided(e, s, read)) / mse(merge_mean(e, s, read)) < 1.1


def test_moving_object_ghosts_the_mean_but_not_the_guided_merge():
    c = make_canvas(seed=2)
    rng = np.random.default_rng(3)
    n, v, s, read = 16, 1.0, 300.0, 1.0
    clean = [render_frame(c, i, v) for i in range(n)]
    e = np.stack([capture(f, s, read, rng) for f in clean])
    trail = object_mask(c, n, v)
    trail[:6] = trail[-6:] = False
    trail[:, :6] = trail[:, -6:] = False
    pm = masked_psnr(merge_mean(e, s, read), clean[0], trail)
    pg = masked_psnr(merge_refguided(e, s, read), clean[0], trail)
    assert pg > pm + 5


def test_guided_returns_reference_when_every_other_frame_differs():
    e = np.zeros((3, 8, 8))
    e[1], e[2] = 1000.0, -1000.0
    assert np.allclose(merge_refguided(e, 1.0, 1.0), 0.0)


def test_masks_and_motion_geometry():
    c = make_canvas(seed=0)
    still = object_mask(c, 4, 0.0, grow=0)
    moving = object_mask(c, 4, 2.0, grow=0)
    assert still.sum() > 30 and moving.sum() > still.sum()
    assert (moving & still).sum() == still.sum()
    f0, f1 = render_frame(c, 0, 2.0), render_frame(c, 1, 2.0)
    assert not np.allclose(f0, f1)
    assert np.allclose(render_frame(c, 0, 0.0, radius=0.0), render_frame(c, 3, 0.0, radius=0.0))


def test_psnr_masked_and_perfect():
    a = np.random.default_rng(0).uniform(0.1, 0.9, (8, 8))
    m = np.zeros((8, 8), bool)
    m[2:5, 2:5] = True
    assert masked_psnr(a, a, m) == 99.0
    b = a.copy()
    b[0, 0] += 0.3
    assert masked_psnr(b, a, m) == 99.0 and masked_psnr(b, a, ~m) < 99.0
