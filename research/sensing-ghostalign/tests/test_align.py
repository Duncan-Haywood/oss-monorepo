import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghostalign import (make_canvas, render_frame, capture, object_mask, merge_mean, merge_refguided,
                                align_frame, merge_aligned, merge_aligned_pair, masked_psnr)

S, READ = 75.0, 3.0


def burst(sd, n, v):
    canvas = make_canvas(48, seed=sd)
    rng = np.random.default_rng(sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    return canvas, clean, np.stack([capture(c, S, READ, rng) for c in clean])


def test_align_recovers_integer_shift():
    rng = np.random.default_rng(0)
    base = 100 + 30 * np.sin(np.arange(40)[None, :] * 0.5) * np.cos(np.arange(40)[:, None] * 0.4)
    ref = base + rng.normal(0, 3, base.shape)
    frame = np.roll(base, -3, axis=1) + rng.normal(0, 3, base.shape)   # content moved 3 px left
    a, moved = align_frame(ref, frame, READ, max_dx=5.0)
    inner = (slice(8, -8), slice(8, -8))
    assert np.mean((a[inner] - base[inner]) ** 2) < 0.6 * np.mean((frame[inner] - base[inner]) ** 2)
    assert moved > 0.5


def test_larger_margin_moves_fewer_static_pixels():
    _, clean, e = burst(1, 2, 0.0)
    _, m0 = align_frame(e[0], e[1], READ, max_dx=3.0, margin=0.0)
    _, m40 = align_frame(e[0], e[1], READ, max_dx=3.0, margin=40.0)
    _, m160 = align_frame(e[0], e[1], READ, max_dx=3.0, margin=160.0)
    assert m0 > m40 > m160
    assert m40 < 0.4          # noise alone still moves a share of pixels at the default margin
    assert m160 < 0.05


def test_static_cost_vs_mean_is_small():
    _, clean, e = burst(2, 8, 0.0)
    core = np.zeros((48, 48), bool); core[6:-6, 6:-6] = True
    m = masked_psnr(merge_mean(e, S, READ), clean[0], core)
    a = masked_psnr(merge_aligned(e, S, READ, v_max=0.5), clean[0], core)
    assert a > m - 0.8


def test_alignment_beats_plain_mean_on_moving_subject():
    canvas, clean, e = burst(3, 8, 1.0)
    core = np.zeros((48, 48), bool); core[6:-6, 6:-6] = True
    trail = object_mask(canvas, 8, 1.0) & core
    m = masked_psnr(merge_mean(e, S, READ), clean[0], trail)
    a = masked_psnr(merge_aligned(e, S, READ, v_max=1.0, reject=False), clean[0], trail)
    assert a > m + 4


def test_pair_matches_merge_aligned():
    _, clean, e = burst(4, 4, 1.0)
    plain, rej = merge_aligned_pair(e, S, READ, v_max=1.0)
    assert np.allclose(plain, merge_aligned(e, S, READ, v_max=1.0, reject=False))
    assert np.allclose(rej, merge_aligned(e, S, READ, v_max=1.0, reject=True))


def test_single_frame_is_reference():
    _, clean, e = burst(5, 1, 0.0)
    assert np.allclose(merge_aligned(e, S, READ), e[0] / S)
    assert np.allclose(merge_refguided(e, S, READ), e[0] / S)


def test_box_window_sum():
    from sensing_ghostalign.align import _box
    a = np.arange(36, dtype=float).reshape(6, 6)
    assert np.isclose(_box(a, 1)[2, 3], a[1:4, 2:5].sum())
