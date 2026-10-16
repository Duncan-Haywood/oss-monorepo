from math import exp, lgamma, log
import numpy as np
from ambient_hlrtmis.stats import clopper_pearson
from ambient_hlrtmis.est import PRIOR, confusion, draw3_hard, bootstrap_p, NESTED_GRID


def test_clopper_pearson_known_values():
    lo, hi = clopper_pearson(7, 60)
    # defining property: P(X >= 7 | p = lo) = 0.025 and P(X <= 7 | p = hi) = 0.025, summed with lgamma
    pmf = lambda i, p: exp(lgamma(61) - lgamma(i + 1) - lgamma(61 - i) + i * log(p) + (60 - i) * log(1 - p))
    assert abs(sum(pmf(i, lo) for i in range(7, 61)) - 0.025) < 1e-6
    assert abs(sum(pmf(i, hi) for i in range(0, 8)) - 0.025) < 1e-6


def test_clopper_pearson_edges():
    assert clopper_pearson(0, 200)[0] == 0.0 and abs(clopper_pearson(0, 200)[1] - 0.01826) < 0.001
    assert clopper_pearson(10, 10)[1] == 1.0


def test_interval_contains_estimate_and_shrinks():
    a, b = clopper_pearson(10, 100), clopper_pearson(100, 1000)
    assert a[0] < 0.1 < a[1] and b[0] < 0.1 < b[1] and b[1] - b[0] < a[1] - a[0]


def test_bootstrap_p_valid_range():
    c = draw3_hard(confusion(0.7), 0.8, 0.0, 0.5, PRIOR, 100, np.random.default_rng(2))
    p, T = bootstrap_p(c, NESTED_GRID[:1], 3, np.random.default_rng(3), iters=100)
    assert 0.25 <= p <= 1.0 and T >= 0


def test_unequal_draw_marginals_and_equal_case():
    from ambient_hlrtmis.est import draw3_unequal
    c = draw3_unequal(confusion(0.7), (0.9, 0.8, 0.6), PRIOR, 20000, np.random.default_rng(5))
    assert c.sum() == 20000
    agree = lambda i, j: sum(np.einsum("abco->" + "abc"[i] + "abc"[j], c)[k, k] if i != j else 0 for k in range(3)) / 20000
    # P(agree) = sum_t prior * (a_i*a_j + (1-a_i)(1-a_j)/2); the 0.9/0.6 pair agrees less than 0.9/0.8
    assert agree(0, 1) > agree(0, 2)
    eq = draw3_unequal(confusion(0.7), (0.8, 0.8, 0.8), PRIOR, 50, np.random.default_rng(1))
    assert eq.sum() == 50
