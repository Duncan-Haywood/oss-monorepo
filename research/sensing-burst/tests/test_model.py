import numpy as np
from sensing_burst import (make_canvas, render, capture, estimate_shift, fourier_shift, merge, display_psnr,
                           breakeven_frames, var_large, var_burst, var_burst_fixed_time)


def test_breakeven_shot_noise_limit_is_area_ratio():
    assert abs(breakeven_frames(0.5, 1e6, 4, 0.0) - 4) < 1e-9


def test_breakeven_read_noise_limit_is_area_ratio_squared():
    assert abs(breakeven_frames(1e-9, 1.0, 4, 10.0) - 16) < 1e-6


def test_breakeven_equalises_variances():
    x, s, A, r = 0.3, 40.0, 4, 3.0
    n = breakeven_frames(x, s, A, r)
    assert abs(var_burst(x, s, n, r) - var_large(x, s, A, r)) < 1e-12


def test_fixed_time_burst_never_beats_large_frame():
    for N in (1, 2, 8, 32):
        assert var_burst_fixed_time(0.4, 50.0, N, 3.0) > var_large(0.4, 50.0, 4, 3.0)


def test_variance_formulas_match_monte_carlo():
    rng = np.random.default_rng(0)
    x, s, N, r = 0.4, 50.0, 4, 3.0
    mc = np.var((rng.poisson(s * x, (20000, N)) + r * rng.standard_normal((20000, N))).sum(1) / (N * s))
    assert abs(mc / var_burst(x, s, N, r) - 1) < 0.05


def test_render_shift_is_one_hr_unit():
    c = make_canvas(seed=3)
    a, b = render(c, (0, 0)), render(c, (4, 0))
    assert np.allclose(b[:-1], a[1:], atol=1e-12)  # a 4-unit shift at 4x is one low-res pixel


def test_capture_clips_at_full_well():
    e = capture(np.full((8, 8), 100.0), 10.0, 50.0, 0.0, np.random.default_rng(0))
    assert e.max() <= 50.0


def test_fourier_shift_roundtrip():
    y, x = np.mgrid[0:16, 0:16]
    img = np.sin(2 * np.pi * x / 16) + np.cos(2 * np.pi * 2 * y / 16)  # band-limited, no Nyquist bin
    assert np.allclose(fourier_shift(fourier_shift(img, 1.3, -2.1), -1.3, 2.1), img, atol=1e-9)


def test_estimate_shift_recovers_known_shift():
    c = make_canvas(seed=1)
    ref, im = render(c, (0, 0)), render(c, (-3, 5))
    dy, dx = estimate_shift(ref, im)
    assert abs(dy + 0.75) < 0.2 and abs(dx - 1.25) < 0.2


def test_merge_equals_mean_when_unclipped():
    rng = np.random.default_rng(2)
    truth = np.full((16, 16), 0.5)
    fr = [capture(truth, 100.0, 1e9, 0.0, rng) for _ in range(5)]
    est = merge(fr, [1.0] * 5, 100.0, 1e9, [(0.0, 0.0)] * 5)
    assert np.allclose(est, np.mean(fr, axis=0) / 100.0, atol=1e-9)


def test_merge_bracket_recovers_clipped_highlight():
    rng = np.random.default_rng(3)
    truth = np.full((16, 16), 6.0)
    ts = [1.0, 0.5, 0.25, 0.125]
    fr = [capture(truth, 100.0 * t, 300.0, 0.0, rng) for t in ts]
    est = merge(fr, ts, 100.0, 300.0, [(0.0, 0.0)] * 4)
    assert abs(est.mean() - 6.0) < 0.3
    one = merge(fr[:1], ts[:1], 100.0, 300.0, [(0.0, 0.0)])
    assert one.mean() < 3.2  # a single clipped frame cannot see it


def test_display_psnr_perfect_and_worse_with_noise():
    t = make_canvas(seed=0)[:32, :32] * 0.5
    t[0, 0] = 1.0
    assert display_psnr(t, t, crop=0) == 99.0
    assert display_psnr(t - 0.1, t, crop=0) < 40
