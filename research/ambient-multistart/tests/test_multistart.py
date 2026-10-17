import numpy as np
from ambient_multistart.est import (PRIOR, confusion, joint3_hard, draw3_hard, estimate_ds3_hard,
                                    estimate_ds3_hard_multistart, START_GRID)


def test_multistart_loglik_at_least_every_single_start():
    c = draw3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR, 1000, np.random.default_rng(1))
    best = estimate_ds3_hard_multistart(c, iters=500)[5]
    for s in START_GRID:
        assert best >= estimate_ds3_hard(c, iters=500, tol=1e-10, init=s)[5] - 1e-12


def test_multistart_includes_single_start_result_when_given_one_start():
    c = draw3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR, 500, np.random.default_rng(2))
    s = (0.9, 0.5, 0.3, 0.7)
    a = estimate_ds3_hard_multistart(c, starts=(s,), iters=300)
    b = estimate_ds3_hard(c, iters=300, tol=1e-10, init=s)
    assert np.isclose(a[4], b[4]) and a[6] == 0


def test_multistart_population_recovers_hard_share_and_beats_poor_start():
    J = joint3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR) * 1e9
    ms = estimate_ds3_hard_multistart(J, iters=20000)
    poor = estimate_ds3_hard(J, iters=20000, init=(0.8, 0.8, 0.5, 0.6))
    assert abs(ms[4] - 0.3) < 0.02
    assert ms[5] >= poor[5] - 1e-12
