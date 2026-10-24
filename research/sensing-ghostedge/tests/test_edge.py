import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghostedge import (make_canvas, render_frame, capture, merge_aligned_pair, merge_edge,
                               coverage, solve_background, layered_estimate, subject_mask, masked_psnr)

S, READ = 75.0, 3.0


def test_coverage_area_and_range():
    a = coverage((32, 32), 16.0, 16.0, 5.0)
    assert 0 <= a.min() and a.max() <= 1
    assert abs(a.sum() - np.pi * 25) < 1.0
    assert a[16, 16] == 1.0 and a[0, 0] == 0.0


def test_background_recovered_exactly_without_noise():
    rng = np.random.default_rng(0)
    bg = rng.uniform(0.1, 0.8, (24, 24))
    a = np.stack([coverage((24, 24), 12.0, 4.0 + 2 * i, 3.0) for i in range(6)])
    y = a * 0.9 + (1 - a) * bg
    est, rss = layered_estimate(y, a, 0.9, np.zeros_like(bg))
    seen = ((1 - a) ** 2).sum(axis=0) >= 1.0
    assert np.allclose(est[seen], (a[0] * 0.9 + (1 - a[0]) * bg)[seen])
    assert rss.max() < 1e-12


def test_unobserved_background_uses_fallback():
    a = np.ones((3, 4, 4))
    est, _ = layered_estimate(np.full((3, 4, 4), 0.9), a, 0.9, np.full((4, 4), -1.0))
    assert np.all(est == -1.0)


def _scene(sd, v, n=8):
    canvas = make_canvas(48, seed=sd)
    rng = np.random.default_rng(7000 + sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    e = np.stack([capture(c, S, READ, rng) for c in clean])
    return e, clean[0]


def test_oracle_layered_beats_aligned_in_the_ring():
    e, truth = _scene(1, 2.0)
    al = merge_aligned_pair(e, S, READ, v_max=2.5)[1]
    est, _ = merge_edge(e, S, READ, al, 2.0, geom=(24.0, 8.0, 4.0))
    ring = coverage(truth.shape, 24.0, 8.0, 4.0) > 0
    ring &= coverage(truth.shape, 24.0, 8.0, 4.0) < 1
    assert masked_psnr(est, truth, ring) > masked_psnr(al, truth, ring) + 1.0


def test_fit_finds_the_disc():
    e, _ = _scene(2, 2.0)
    al = merge_aligned_pair(e, S, READ, v_max=2.5)[1]
    _, g = merge_edge(e, S, READ, al, 2.0)
    assert g is not None
    assert np.hypot(g[0] - 24.0, g[1] - 8.0) < 0.6 and abs(g[2] - 4.0) < 0.5


def test_estimate_unchanged_far_from_the_disc():
    e, _ = _scene(3, 2.0)
    al = merge_aligned_pair(e, S, READ, v_max=2.5)[1]
    est, _ = merge_edge(e, S, READ, al, 2.0, geom=(24.0, 8.0, 4.0))
    assert np.array_equal(est[:, 30:], al[:, 30:])
