import numpy as np
from ambient_hlrt.est import (PRIOR, confusion, draw3_hard, estimate_ds3_hard, fit_null, lrt_stat,
                              sample_null, bootstrap_p, NESTED_GRID)


def _counts(h, seed=1, n=500, ha=0.5):
    return draw3_hard(confusion(0.7), 0.8, h, ha, PRIOR, n, np.random.default_rng(seed))


def test_null_fit_equals_alternative_with_p_hard_zero():
    c = _counts(0.0)
    nf = fit_null(c, iters=300, init_acc=0.9)
    # the alternative started at P(hard)=0 never moves P(hard) off 0, so it is the null model
    alt = estimate_ds3_hard(c, iters=300, tol=1e-10, init=(0.9, 0.5, 0.0, 0.7))
    assert alt[4] == 0.0 and np.isclose(nf[3], alt[5], atol=1e-9)


def test_statistic_is_nonnegative_and_larger_when_hardness_is_strong():
    t0 = lrt_stat(_counts(0.0, 3), NESTED_GRID[:2], iters=400)[0]
    t1 = lrt_stat(_counts(0.3, 3, n=1000, ha=1 / 3), NESTED_GRID[:2], iters=400)[0]
    assert t0 >= 0 and t1 > t0 and t1 > 10


def test_sample_null_has_right_size_and_is_reproducible():
    nf = fit_null(_counts(0.0), iters=100)
    a, b = sample_null(nf, None, 300, np.random.default_rng(5)), sample_null(nf, None, 300, np.random.default_rng(5))
    assert a.sum() == 300 and a.shape == (3, 3, 3, 3) and np.array_equal(a, b)


def test_bootstrap_p_in_range_and_small_for_strong_hardness():
    p, T = bootstrap_p(_counts(0.3, 4, n=1000, ha=1 / 3), NESTED_GRID[:1], 9, np.random.default_rng(1), iters=300)
    assert 1 / 10 <= p <= 1 and T > 10 and p == 0.1
