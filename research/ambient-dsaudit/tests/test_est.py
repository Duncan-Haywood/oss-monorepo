import numpy as np
from ambient_dsaudit.sim import Params, contexts
from ambient_dsaudit.est import (PRIOR, confusion, joint_audit, joint_audit2, draw_audit2,
                                 estimate_naive, estimate_em, estimate_ds, u_table, policies)

P = Params()


def test_joint2_sums_to_one_and_marginalises_to_single_auditor():
    C, A1, A2 = confusion(0.7), confusion(0.8), confusion(0.9)
    J = joint_audit2(C, A1, A2, PRIOR)
    assert np.isclose(J.sum(), 1.0)
    assert np.allclose(J.sum(axis=1), joint_audit(C, A1, PRIOR))


def test_ds_recovers_truth_from_population_counts():
    C, A1, A2 = confusion(0.7), confusion(0.8), confusion(0.9)
    pr, Ch, a1, a2 = estimate_ds(joint_audit2(C, A1, A2, PRIOR) * 1e9, iters=20000)
    assert np.abs(pr - PRIOR).max() < 2e-3
    assert np.abs(Ch - C).max() < 2e-3 and np.abs(a1 - A1).max() < 2e-3 and np.abs(a2 - A2).max() < 2e-3


def test_ds_recovers_unequal_unknown_auditors():
    C, A1, A2 = confusion(0.9), confusion(0.7), confusion(0.85)
    pr, Ch, _, _ = estimate_ds(joint_audit2(C, A1, A2, PRIOR) * 1e9, iters=20000)
    assert np.abs(Ch - C).max() < 2e-3


def test_em_with_wrong_assumed_accuracy_is_biased():
    C, A = confusion(0.7), confusion(0.7)
    counts = joint_audit(C, A, PRIOR) * 1e9
    _, Ch = estimate_em(counts, confusion(1.0), iters=3000)   # assumes a perfect auditor = naive
    assert np.diag(Ch).mean() < 0.65


def test_draw_audit2_total_and_shape():
    c = draw_audit2(confusion(0.7), confusion(0.8), confusion(0.8), PRIOR, 250, np.random.default_rng(0))
    assert c.shape == (3, 3, 3) and c.sum() == 250


def test_no_estimate_beats_true_parameter_bayes():
    C, A1, A2 = confusion(0.7), confusion(0.8), confusion(0.8)
    counts = draw_audit2(C, A1, A2, PRIOR, 200, np.random.default_rng(3))
    pd, Cd, _, _ = estimate_ds(counts)
    pn, Cn = estimate_naive(counts.sum(axis=1), 1.0)
    for c in contexts()[:12]:
        r = policies(u_table(P, c), C, PRIOR, pn, Cn, pd, Cd)
        assert r["bayes_em"] <= r["bayes_true"] + 1e-12 and r["bayes_naive"] <= r["bayes_true"] + 1e-12
