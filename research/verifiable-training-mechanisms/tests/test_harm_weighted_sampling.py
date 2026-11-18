"""Milestone 82's game solvers (experiments/harm_weighted_sampling/analyze.py) against hand-checked cases."""
import importlib.util
import os

import pytest

np = pytest.importorskip("numpy")
_spec = importlib.util.spec_from_file_location(
    "hws_analyze", os.path.join(os.path.dirname(__file__), "..", "experiments", "harm_weighted_sampling", "analyze.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


def test_waterfill_equalises_and_spends_budget():
    h, d = np.array([4.0, 2.0, 1.0, 0.5]), np.ones(4)
    c = A.waterfill(h, d, 1.0)
    assert c.sum() == pytest.approx(1.0)
    # level v solves (1 - v/4) + (1 - v/2) = 1 -> v = 4/3; segments below v get nothing
    assert A.worst(h, d, c)[0] == pytest.approx(4 / 3, rel=1e-6)
    assert c[2] == 0 and c[3] == 0


def test_waterfill_flat_profile_is_uniform():
    h, d = np.full(10, 3.0), np.ones(10)
    assert np.allclose(A.waterfill(h, d, 2.0), 0.2)


def test_waterfill_beats_or_ties_uniform():
    rng = np.random.default_rng(1)
    for _ in range(50):
        h, d = rng.random(20), np.ones(20)
        k = float(rng.integers(1, 10))
        assert A.worst(h, d, A.waterfill(h, d, k))[0] <= A.worst(h, d, np.full(20, k / 20))[0] + 1e-12


def test_knapsack_deters_top_segments():
    h, d = np.array([1.0, 5.0, 3.0, 2.0]), np.ones(4)
    c = A.knapsack(h, d, 1.0, 0.4)  # two blocks of 0.4 on segments 1 and 2, remainder 0.2 on segment 3
    assert np.allclose(c, [0.0, 0.4, 0.4, 0.2])
    harm, stalls = A.game_b_harm(h, d, c, 0.4)
    assert stalls == 2 and harm == pytest.approx(1.0 + 2.0 * 0.8)


def test_uniform_deters_at_threshold():
    h, d = np.ones(5), np.ones(5)
    assert A.game_b_harm(h, d, np.full(5, 0.2), 0.2) == (0.0, 0)
    assert A.game_b_harm(h, d, np.full(5, 0.1), 0.2)[1] == 5
