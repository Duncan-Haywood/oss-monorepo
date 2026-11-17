import importlib.util
import os

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


es = _load("exact_scale_test", "exact_scale.py")
kw = _load("split_kway_test_11ae", "split_kway.py")


def test_cross_pairs_symmetrises_and_drops_diagonal():
    W = np.array([[5.0, 1.0, 2.0], [3.0, 7.0, 0.0], [4.0, 6.0, 9.0]])
    assert list(es.cross_pairs(W)) == [4.0, 6.0, 6.0]
    assert es.enroute_total(W) == 37.0


def test_pearson_matches_numpy_and_is_scale_free():
    rng = np.random.default_rng(1)
    a = rng.random(40)
    b = 0.5 * a + rng.random(40)
    assert abs(es.pearson(a, b) - np.corrcoef(a, b)[0, 1]) < 1e-12
    assert abs(es.pearson(a, 3.0 * a + 2.0) - 1.0) < 1e-12


def test_loss_is_one_for_own_best_and_at_least_one_otherwise():
    rng = np.random.default_rng(2)
    W = rng.random((7, 7))
    arg, _ = kw.exhaustive(W[None], 2)
    best = arg[0]
    assert es.loss(W, best, best, kw.score) == 1.0
    for lab in [(0, 1, 0, 1, 0, 1, 0), (0, 0, 0, 1, 1, 1, 1), (0,) * 7]:
        assert es.loss(W, lab, best, kw.score) >= 1.0 - 1e-12


def test_pooled_ratio_is_sum_over_sum():
    assert es.pooled_ratio([1.0, 3.0], [2.0, 2.0]) == 1.0
    assert es.LAYOUTS[12] == list(range(1200, 1208)) and es.LAYOUTS[16] == list(range(1600, 1604))
