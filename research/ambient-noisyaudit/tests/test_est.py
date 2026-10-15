import numpy as np
from ambient_noisyaudit.sim import Params, contexts
from ambient_noisyaudit.est import (PRIOR, confusion, joint_audit, draw_audit, estimate_naive,
                                    estimate_em, u_table, policies)

P = Params()
CTX = contexts()


def test_joint_sums_to_one_and_marginals():
    C, A = confusion(0.7), confusion(0.8)
    J = joint_audit(C, A, PRIOR)
    assert np.isclose(J.sum(), 1.0)
    assert np.allclose(J.sum(axis=1), PRIOR @ A)


def test_perfect_auditor_naive_equals_truth_in_population():
    C = confusion(0.7)
    pr, Ch = estimate_naive(joint_audit(C, np.eye(3), PRIOR))
    assert np.allclose(pr, PRIOR) and np.allclose(Ch, C)


def test_noisy_auditor_biases_naive_confusion_toward_uniform():
    C, A = confusion(0.7), confusion(0.7)
    _, Ch = estimate_naive(joint_audit(C, A, PRIOR))
    assert np.diag(Ch).mean() < np.diag(C).mean() - 0.05


def test_em_recovers_truth_from_population_counts():
    C, A = confusion(0.7), confusion(0.8)
    counts = joint_audit(C, A, PRIOR) * 1e9
    pr, Ch = estimate_em(counts, A, iters=3000)
    assert np.abs(pr - PRIOR).max() < 1e-3 and np.abs(Ch - C).max() < 1e-3


def test_em_with_perfect_auditor_matches_naive():
    C = confusion(0.7)
    counts = draw_audit(C, np.eye(3), PRIOR, 500, np.random.default_rng(1))
    pn, Cn = estimate_naive(counts, 0.5)
    pe, Ce = estimate_em(counts, np.eye(3))
    p0, C0 = estimate_naive(counts, 0.0)
    assert np.abs(pe - p0).max() < 1e-6 and np.abs(Ce - C0).max() < 1e-6


def test_draw_audit_counts_total():
    c = draw_audit(confusion(0.7), confusion(0.9), PRIOR, 321, np.random.default_rng(0))
    assert c.sum() == 321


def test_no_policy_beats_true_parameter_bayes():
    C, A = confusion(0.7), confusion(0.8)
    counts = draw_audit(C, A, PRIOR, 100, np.random.default_rng(3))
    pn, Cn = estimate_naive(counts, 1.0)
    pe, Ce = estimate_em(counts, A)
    for c in CTX[:12]:
        r = policies(u_table(P, c), C, PRIOR, pn, Cn, pe, Ce)
        assert r["bayes_naive"] <= r["bayes_true"] + 1e-12 and r["bayes_em"] <= r["bayes_true"] + 1e-12
