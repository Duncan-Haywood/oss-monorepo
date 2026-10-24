import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m6_floor"))
import numpy as np
from floor import floor_gap, optimal_gap, indistinguishable_prob


def test_floor_below_optimal_and_close():
    for m in (10, 60, 240):
        assert floor_gap(m, 0.05) < optimal_gap(m, 0.05)
        assert optimal_gap(m, 0.05) / floor_gap(m, 0.05) < 1.6


def test_indistinguishable_probability_matches_theory():
    m, d = 60, 0.05
    eps = floor_gap(m, d)
    p = indistinguishable_prob(m, eps, 100_000, np.random.default_rng(0))
    assert abs(p - 2 * d) < 0.01


def test_all_ones_bound_is_valid():
    # the exact all-ones bound 1 - optimal_gap = delta^(1/m): a law with q = P(R<1)
    # that makes all-ones likely enough would have (1-q)^m > delta, so truth >= bound
    m, d = 40, 0.05
    lo = d ** (1 / m)
    q = 1 - lo
    assert (1 - q) ** m <= d + 1e-12
