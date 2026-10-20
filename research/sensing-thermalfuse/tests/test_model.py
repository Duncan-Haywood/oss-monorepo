import os
import sys
from dataclasses import replace
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_thermalfuse import Setup, make_scene, render, fit_logistic, train_detectors, evaluate
from sensing_thermalfuse.model import _box, _shift_x, _upsample, _label_people

S = Setup()


def test_scene_and_render_shapes_and_determinism():
    a = make_scene(S, np.random.default_rng(1))
    b = make_scene(S, np.random.default_rng(1))
    assert all(np.array_equal(x, y) for x, y in zip(a, b))
    rgb, th = render(S, a[0], a[1], np.random.default_rng(2))
    assert rgb.shape == th.shape == (64, 64)


def test_n_people_zero_has_empty_mask():
    assert not make_scene(S, np.random.default_rng(3), n_people=0)[2].any()


def test_box_filter_matches_direct_mean():
    x = np.random.default_rng(0).standard_normal((20, 20))
    out = _box(x, 3)
    assert abs(out[10, 10] - x[9:12, 9:12].mean()) < 1e-12
    assert out.shape == x.shape


def test_shift_moves_content_right_and_zero_is_identity():
    x = np.zeros((4, 16)); x[:, 5] = 1.0
    assert np.array_equal(_shift_x(x, 0), x)
    assert np.argmax(_shift_x(x, 3)[0]) == 8
    assert abs(_shift_x(x, 0.5)[0, 5:7].sum() - 1.0) < 1e-12


def test_upsample_preserves_constant_and_shape():
    assert np.allclose(_upsample(np.full((16, 16), 7.0), 4), 7.0)
    assert _upsample(np.zeros((16, 16)), 4).shape == (64, 64)


def test_thermal_shift_moves_person_hot_spot():
    R, T, mask = make_scene(replace(S, max_decoys=0), np.random.default_rng(5), n_people=1)
    s = replace(S, netd=0.0, max_decoys=0)
    _, t0 = render(s, R, T, np.random.default_rng(0))
    _, t8 = render(replace(s, shift=8.0), R, T, np.random.default_rng(0))
    cx = lambda t: (np.clip(t - 285.5, 0, None).sum(0) * np.arange(64)).sum() / np.clip(t - 285.5, 0, None).sum()
    assert 6.0 < cx(t8) - cx(t0) < 9.0


def test_darkness_removes_rgb_contrast_not_thermal():
    R, T, mask = make_scene(S, np.random.default_rng(7), n_people=1)
    rb, tb = render(S, R, T, np.random.default_rng(0))
    rd, td = render(replace(S, light=0.001), R, T, np.random.default_rng(0))
    assert rb[mask].mean() != rd[mask].mean()
    assert abs(rd[mask].mean() - rd[~mask].mean()) < 0.01      # contrast gone in the dark
    assert td[mask].mean() - td[~mask].mean() > 1.0            # thermal contrast stays


def test_fit_logistic_separates_gaussians():
    rng = np.random.default_rng(0)
    X = np.vstack([rng.normal(0, 1, (500, 2)), rng.normal(3, 1, (500, 2))])
    y = np.r_[np.zeros(500), np.ones(500)]
    mu, sd, w = fit_logistic(X, y)
    z = np.hstack([(X - mu) / sd, np.ones((1000, 1))]) @ w
    assert ((z > 0) == (y > 0.5)).mean() > 0.95


def test_label_people_merges_touching_and_splits_far():
    m = np.zeros((32, 32), bool); m[5:8, 5:8] = True; m[8:10, 5:8] = True; m[25:28, 25:28] = True
    assert len(_label_people(m)) == 2


def test_fusion_beats_single_sensors_in_light_and_matches_thermal_in_dark():
    s = Setup()
    r = evaluate(train_detectors(s, 25, 1), s, 80, 2)
    assert r["late"] > r["thermal"] + 0.05 and r["late"] > r["rgb"] + 0.05
    d = replace(s, light=0.001)
    r = evaluate(train_detectors(d, 25, 1), d, 80, 2)
    assert r["rgb"] < 0.1 and r["thermal"] > 0.4 and abs(r["early"] - r["thermal"]) < 0.1
