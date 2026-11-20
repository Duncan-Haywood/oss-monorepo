import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("few_start_test", os.path.join(HERE, "few_start.py"))
fs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fs)


def test_perturbed_order_is_a_permutation():
    rng = np.random.default_rng(1)
    b = np.array([1.0, -2.0, 1.0, 0.5, 0.5, 3.0])
    for _ in range(20):
        assert sorted(fs.perturbed_order(b, rng)) == list(range(len(b)))


def test_zero_jitter_is_an_offset_order():
    rng = np.random.default_rng(2)
    b = np.array([1.0, -2.0, 3.0, 0.5])
    o = fs.perturbed_order(b, rng, jitter=0.0)
    assert o in ([1, 3, 0, 2], [2, 0, 3, 1])


def test_greedy_orders_start_with_11as_orders():
    rng = np.random.default_rng(3)
    b = np.array([1.0, -2.0, 1.0, 0.5])
    deg = np.array([1.0, 5.0, 3.0, 2.0])
    out = fs.greedy_orders(b, deg, 5, rng)
    assert len(out) == 5
    assert out[0] == fs.gr.offset_order(b, deg)
    assert out[1] == fs.gr.offset_order(b, deg, descending=True)


def test_best_of_prefix_and_first_within():
    c = fs.best_of_prefix([3.0, 2.0, 2.5, 1.0, 4.0], (1, 2, 5))
    assert c == {1: 3.0, 2: 2.0, 5: 1.0}
    assert fs.first_within(c, 2.0) == 2
    assert fs.first_within(c, 0.5) is None
