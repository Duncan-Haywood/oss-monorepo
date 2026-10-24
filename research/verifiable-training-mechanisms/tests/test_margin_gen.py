import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from vtm import margin, margin_gen  # noqa: E402


def test_matches_margin_module_on_the_digits_mlp():
    data = margin.load_digits_split()
    sizes = (64, 64, 10)
    w0, _ = margin.train(data, 3, steps=30)
    w1, _ = margin_gen.train(data, sizes, 3, steps=30)
    assert np.allclose(w0, w1, atol=1e-5)


def test_gradient_matches_finite_differences_on_a_deep_net():
    sizes = (5, 7, 6, 3)
    rng = np.random.default_rng(0)
    w = margin_gen.init(rng, sizes).astype(np.float64).astype(np.float32)
    w += rng.standard_normal(w.shape).astype(np.float32) * 0.1
    x = rng.standard_normal((16, 5)).astype(np.float32)
    y = rng.integers(0, 3, 16)
    g = margin_gen.grad(w, sizes, x, y)
    for i in rng.choice(len(w), 12, replace=False):
        e = np.zeros_like(w)
        e[i] = 1e-3
        fd = (margin_gen.loss(w + e, sizes, x, y) - margin_gen.loss(w - e, sizes, x, y)) / 2e-3
        assert abs(fd - g[i]) < 2e-3


def test_zero_tolerance_skipper_is_honest():
    data = margin_gen.load("breast_cancer")
    a, _ = margin_gen.train(data, (30, 8, 2), 1, steps=40)
    b, _ = margin_gen.train(data, (30, 8, 2), 1, steps=40, strategy="skip", tau=0.0)
    assert np.allclose(a, b)
