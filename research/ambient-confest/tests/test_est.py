import numpy as np
from ambient_confest.sim import Params, contexts
from ambient_confest.est import (PRIOR, confusion, audit, estimate, posterior, u_table,
                                 modes_from_estimate, value, policies)

P = Params()
CTX = contexts()


def test_estimate_recovers_truth_with_many_samples():
    rng = np.random.default_rng(0)
    C = confusion(0.7)
    ph, Ch = estimate(audit(C, PRIOR, 200000, rng))
    assert np.abs(ph - PRIOR).max() < 0.01 and np.abs(Ch - C).max() < 0.02


def test_unseen_class_row_is_uniform_without_smoothing():
    counts = np.array([[5., 0, 0], [0, 0, 0], [0, 0, 3.]])
    _, Ch = estimate(counts)
    assert np.allclose(Ch[1], 1 / 3) and np.allclose(Ch.sum(axis=1), 1.0)


def test_smoothing_keeps_distributions():
    ph, Ch = estimate(np.zeros((3, 3)), alpha=1.0)
    assert np.isclose(ph.sum(), 1.0) and np.allclose(Ch.sum(axis=1), 1.0)


def test_posterior_rows_sum_to_one():
    assert np.allclose(posterior(confusion(0.7), PRIOR).sum(axis=1), 1.0)


def test_true_parameters_give_bayes_true():
    U = u_table(P, CTX[5])
    C = confusion(0.7)
    m = modes_from_estimate(U, PRIOR, C)
    pol = policies(U, C, PRIOR, C * PRIOR[:, None] * 1e9, 0.0)
    assert abs(value(U, m, C, PRIOR) - pol["bayes_true"]) < 1e-12
    assert abs(pol["bayes_hat"] - pol["bayes_true"]) < 1e-9


def test_ordering_no_estimate_beats_bayes_true():
    rng = np.random.default_rng(1)
    C = confusion(0.7)
    for ctx in CTX[::7]:
        U = u_table(P, ctx)
        pol = policies(U, C, PRIOR, audit(C, PRIOR, 20, rng), 0.5)
        assert pol["bayes_hat"] <= pol["bayes_true"] + 1e-12 <= pol["oracle"] + 1e-12
