import numpy as np
from ambient_dshard.est import (PRIOR, confusion, easy_accuracy, joint_audit, joint_audit2, joint_audit2_hard,
                                draw_audit2_hard, estimate_ds, estimate_ds_hard)


def test_easy_accuracy_keeps_overall_accuracy():
    assert np.isclose(easy_accuracy(0.8, 0.3, 0.5), (0.8 - 0.15) / 0.7)
    assert np.isclose(easy_accuracy(0.8, 0.0, 0.5), 0.8)


def test_h_zero_or_equal_accuracy_is_independent():
    C, A = confusion(0.7), confusion(0.8)
    ind = joint_audit2(C, A, A, PRIOR)
    assert np.allclose(joint_audit2_hard(C, 0.8, 0.0, 0.5, PRIOR), ind)
    assert np.allclose(joint_audit2_hard(C, 0.8, 0.3, 0.8, PRIOR), ind)  # hard no harder than easy


def test_marginals_unchanged_and_normalised():
    C, A = confusion(0.7), confusion(0.8)
    J = joint_audit2_hard(C, 0.8, 0.3, 0.5, PRIOR)
    assert np.isclose(J.sum(), 1.0)
    assert np.allclose(J.sum(axis=1), joint_audit(C, A, PRIOR))
    assert np.allclose(J.sum(axis=0), joint_audit(C, A, PRIOR))


def test_auditors_agree_more_than_under_independence():
    C, A = confusion(0.7), confusion(0.8)
    agree = lambda J: np.einsum("aao->", J)
    assert agree(joint_audit2_hard(C, 0.8, 0.3, 0.5, PRIOR)) > agree(joint_audit2(C, A, A, PRIOR))


def test_sampler_matches_exact_joint():
    C = confusion(0.7)
    c = draw_audit2_hard(C, 0.8, 0.3, 0.5, PRIOR, 300000, np.random.default_rng(1))
    assert np.abs(c / c.sum() - joint_audit2_hard(C, 0.8, 0.3, 0.5, PRIOR)).max() < 3e-3


def test_plain_ds_is_biased_under_hardness():
    C = confusion(0.7)
    _, Ch, _, _ = estimate_ds(joint_audit2_hard(C, 0.8, 0.3, 0.5, PRIOR) * 1e9, iters=20000)
    assert np.abs(Ch - C).max() > 0.02


def test_hard_aware_ds_recovers_classifier_and_reproduces_joint_but_not_hardness():
    C = confusion(0.7)
    J = joint_audit2_hard(C, 0.8, 0.3, 0.5, PRIOR)
    fits = [estimate_ds_hard(J * 1e9, iters=20000, init=i) for i in ((0.9, 0.5, 0.3, 0.7), (0.95, 0.4, 0.2, 0.7))]
    for pr, Ch, Ae, Ah, ph in fits:
        assert np.abs(Ch - C).max() < 1e-3 and np.abs(pr - PRIOR).max() < 1e-3
        fit = (1 - ph) * np.einsum("t,ta,tb,to->abo", pr, Ae, Ae, Ch) + ph * np.einsum("t,ta,tb,to->abo", pr, Ah, Ah, Ch)
        assert np.abs(fit - J).max() < 1e-6
        assert np.isclose((1 - ph) * np.diag(Ae).mean() + ph * np.diag(Ah).mean(), 0.8, atol=1e-3)
    assert abs(fits[0][4] - fits[1][4]) > 0.02   # hardness share is not identified: the two starts disagree
