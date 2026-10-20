import numpy as np
from ambient_goldaudit.est import (PRIOR, confusion, draw_audits, estimate_goldonly, estimate_joint,
                                   estimate_pooled_naive, modes_from_estimate, value, u_table)
from ambient_goldaudit.sim import Params, contexts


def test_confusion_rows_sum_to_one():
    assert np.allclose(confusion(0.7).sum(axis=1), 1.0)


def test_draw_audits_counts():
    g, n = draw_audits(confusion(0.7), confusion(0.8), PRIOR, 40, 60, np.random.default_rng(0))
    assert g.sum() == 40 and n.sum() == 60


def test_goldonly_converges_to_truth():
    g, _ = draw_audits(confusion(0.7), confusion(0.8), PRIOR, 200000, 0, np.random.default_rng(1))
    p, C = estimate_goldonly(g)
    assert np.allclose(p, PRIOR, atol=0.01) and np.allclose(C, confusion(0.7), atol=0.01)


def test_pooled_naive_is_biased_with_noisy_rows():
    g, n = draw_audits(confusion(0.9), confusion(0.7), PRIOR, 0, 200000, np.random.default_rng(2))
    _, C = estimate_pooled_naive(g, n)
    assert np.diag(C).mean() < 0.8      # the auditor's errors look like the classifier's


def test_joint_em_recovers_label_and_auditor_matrices():
    g, n = draw_audits(confusion(0.7), confusion(0.8), PRIOR, 20000, 200000, np.random.default_rng(3))
    p, C, A = estimate_joint(g, n)
    assert np.allclose(C, confusion(0.7), atol=0.02)
    assert np.allclose(A, confusion(0.8), atol=0.02)
    assert np.allclose(p, PRIOR, atol=0.02)


def test_joint_em_with_no_noisy_rows_equals_goldonly_up_to_smoothing():
    g, n = draw_audits(confusion(0.7), confusion(0.8), PRIOR, 500, 0, np.random.default_rng(4))
    p, C, _ = estimate_joint(g, n, alpha=1.0)
    p0, C0 = estimate_goldonly(g, alpha=1.0)
    assert np.allclose(p, p0) and np.allclose(C, C0)


def test_true_parameters_beat_blind_value():
    P = Params(); u = u_table(P, contexts()[0]); C = confusion(0.9)
    m = modes_from_estimate(u, PRIOR, C)
    assert value(u, m, C, PRIOR) >= float(PRIOR @ u[:, int(np.argmax(PRIOR @ u))]) - 1e-12
