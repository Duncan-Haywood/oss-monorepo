import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_superres import (make_canvas, lr_frame, hr_truth, capture, estimate_shift, forward, adjoint,
                              solve_ls, bilinear_up, merge_register, psnr, nyquist_energy, blockmean)

U, F, SIZE = 12, 2, 32


def test_adjoint_pairing():
    rng = np.random.default_rng(0)
    h = rng.standard_normal((64, 64))
    y = rng.standard_normal((32, 32))
    off = (3, 1)
    assert abs(np.sum(forward(h, off, F) * y) - np.sum(h * adjoint(y, off, F, ))) < 1e-9


def test_forward_matches_frame_at_hr_pixel_shifts():
    c = make_canvas(SIZE, U, seed=2)
    H = hr_truth(c, U, F, SIZE)
    # shift of 1 HR px = U // F canvas px
    y = lr_frame(c, (U // F, 3 * U // F), U, SIZE)
    assert np.abs(forward(H, (1, 3), F) - y).max() < 1e-12


def test_noise_free_four_phases_recovers_truth():
    c = make_canvas(SIZE, U, seed=3)
    H = hr_truth(c, U, F, SIZE)
    offs = [(0, 0), (0, 1), (1, 0), (1, 1), (2, 3), (3, 2)]
    fr = [forward(H, o, F) for o in offs]
    h = solve_ls(fr, offs, F, 1e-9, bilinear_up(fr[0], F), iters=400)
    assert psnr(h, H) > 40


def test_one_frame_cannot_recover_detail():
    c = make_canvas(SIZE, U, seed=3)
    H = hr_truth(c, U, F, SIZE)
    y = forward(H, (0, 0), F)
    assert psnr(bilinear_up(y, F), H) < 35  # aliasing and box blur lose detail


def test_bilinear_preserves_constants_and_shape():
    a = np.full((8, 8), 0.4)
    b = bilinear_up(a, 3)
    assert b.shape == (24, 24) and np.allclose(b, 0.4)


def test_estimate_shift_sign_and_size():
    c = make_canvas(SIZE, U, seed=1)
    y0 = lr_frame(c, (0, 0), U, SIZE)
    y1 = lr_frame(c, (6, 12), U, SIZE)  # 0.5 and 1.0 LR px
    dy, dx = estimate_shift(y0, y1)
    assert abs(dy - 0.5) < 0.1 and abs(dx - 1.0) < 0.1


def test_capture_is_unbiased_in_radiance():
    rng = np.random.default_rng(1)
    r = np.full((200, 200), 0.3)
    assert abs(capture(r, 100.0, 3.0, rng).mean() - 0.3) < 0.005


def test_merge_register_identity_for_zero_shift():
    y = np.random.default_rng(0).random((16, 16))
    assert np.allclose(merge_register([y, y], [(0, 0), (0, 0)]), y)


def test_nyquist_energy_orders_smooth_below_sharp():
    x = np.arange(64)
    smooth = np.tile(np.sin(2 * np.pi * x / 32), (64, 1))
    sharp = np.tile(np.sin(2 * np.pi * x / 3), (64, 1))
    assert nyquist_energy(smooth, 2) < 0.01 < 0.9 < nyquist_energy(sharp, 2)


def test_blockmean_shape():
    assert blockmean(np.ones((8, 8)), 4).shape == (2, 2)
