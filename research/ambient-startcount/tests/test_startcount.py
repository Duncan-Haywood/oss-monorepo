import numpy as np
from ambient_startcount.est import (PRIOR, confusion, draw3_hard, estimate_ds3_hard, NESTED_GRID, KS,
                                    random_starts, fit_all, best_of_first)
from ambient_startcount.est import START_GRID


def _counts(seed=1, n=500):
    return draw3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR, n, np.random.default_rng(seed))


def test_nested_grid_has_16_distinct_starts_and_first_8_are_start_grid():
    assert len(NESTED_GRID) == 16 and len(set(NESTED_GRID)) == 16
    assert set(NESTED_GRID[:8]) == set(START_GRID)
    assert KS == (1, 2, 4, 8, 16)


def test_random_starts_in_range_and_reproducible():
    a, b = random_starts(np.random.default_rng(3), 16), random_starts(np.random.default_rng(3), 16)
    assert a == b and len(a) == 16
    for e, h, p, c in a:
        assert 0.7 <= e <= 1 and 0.3 <= h <= 0.7 and 0.05 <= p <= 0.5 and c == 0.7


def test_best_of_first_is_monotone_in_k_and_k1_is_first_fit():
    fits = fit_all(_counts(), NESTED_GRID[:6], iters=200)
    lls = [best_of_first(fits, k)[5] for k in range(1, 7)]
    assert all(b >= a - 1e-15 for a, b in zip(lls, lls[1:]))
    assert best_of_first(fits, 1) is fits[0]


def test_fit_all_matches_single_fit():
    c = _counts(2)
    f = fit_all(c, NESTED_GRID[:2], iters=150)[1]
    g = estimate_ds3_hard(c, iters=150, tol=1e-10, init=NESTED_GRID[1])
    assert np.isclose(f[4], g[4]) and np.isclose(f[5], g[5])


def test_ties_go_to_earlier_start():
    f = (PRIOR, None, None, None, 0.1, -3.0)
    g = (PRIOR, None, None, None, 0.2, -3.0)
    assert best_of_first([f, g], 2) is f
