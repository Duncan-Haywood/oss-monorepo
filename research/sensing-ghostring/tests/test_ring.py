import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghostring import (make_canvas, render_frame, capture, object_mask, merge_refguided,
                               merge_aligned_pair, median_background, subject_mask, dilate, erode,
                               combine, merge_ring, masked_psnr)

S, READ = 75.0, 3.0


def burst(sd, n, v):
    canvas = make_canvas(48, seed=sd)
    rng = np.random.default_rng(sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    return canvas, clean, np.stack([capture(c, S, READ, rng) for c in clean])


def test_dilate_erode_roundtrip_on_block():
    m = np.zeros((9, 9), bool)
    m[3:6, 3:6] = True
    assert dilate(m, 1).sum() == 21
    assert erode(dilate(m, 1), 1).sum() == 9
    assert erode(m, 1).sum() == 1


def test_median_removes_a_fast_subject():
    canvas, clean, e = burst(1, 9, 4.0)          # 4 px per frame: a pixel is covered in at most 2 of 9 frames
    bg = median_background(e) / S
    truth_bg = render_frame(canvas, 0, 0.0) * 0 + np.median(np.stack(clean), axis=0)
    # the median frame is closer to the median of the clean frames than frame 0 is, where frame 0 has the disc
    obj = object_mask(canvas, 1, 0.0, grow=0)
    assert np.mean((bg - truth_bg)[obj] ** 2) < np.mean((e[0] / S - truth_bg)[obj] ** 2)


def test_subject_mask_finds_a_fast_disc_and_little_else():
    canvas, clean, e = burst(2, 9, 4.0)
    m = subject_mask(e, READ)
    obj = object_mask(canvas, 1, 0.0, grow=0)
    assert (m & obj).sum() > 0.6 * obj.sum()
    assert (m & ~dilate(obj, 2)).sum() < 0.03 * (~dilate(obj, 2)).sum()


def test_static_scene_has_empty_mask():
    canvas = make_canvas(48, seed=3)
    rng = np.random.default_rng(3)
    e = np.stack([capture(render_frame(canvas, 0, 0.0), S, READ, rng) for _ in range(8)])
    assert subject_mask(e, READ).mean() < 0.02


def test_combine_is_consistent_with_merge_ring_and_uses_each_part():
    canvas, clean, e = burst(4, 6, 2.0)
    al = merge_aligned_pair(e, S, READ, v_max=2.5)[1]
    rg = merge_refguided(e, S, READ)
    a = combine(e, S, READ, al, rg, mode="band")
    b = merge_ring(e, S, READ, mode="band", v_max=2.5)
    assert np.allclose(a, b)
    m = subject_mask(e, READ)
    assert np.allclose(a[erode(m, 1)], al[erode(m, 1)])
    assert np.allclose(a[~dilate(m, 1)], rg[~dilate(m, 1)])


def test_ring_modes_differ_only_in_the_ring():
    canvas, clean, e = burst(5, 6, 2.0)
    al = merge_aligned_pair(e, S, READ, v_max=2.5)[1]
    rg = merge_refguided(e, S, READ)
    m = subject_mask(e, READ)
    ring = ~erode(m, 1) & dilate(m, 1)
    x = combine(e, S, READ, al, rg, mode="band")
    y = combine(e, S, READ, al, rg, mode="median")
    assert np.allclose(x[~ring], y[~ring])
