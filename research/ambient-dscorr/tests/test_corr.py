import numpy as np
from ambient_dscorr.est import (PRIOR, confusion, joint_audit2, joint_audit2_corr, joint_audit, draw_audit2_corr,
                                estimate_ds)


def test_rho_zero_is_independent_and_sums_to_one():
    C, A1, A2 = confusion(0.7), confusion(0.8), confusion(0.8)
    assert np.allclose(joint_audit2_corr(C, A1, A2, PRIOR, 0.0), joint_audit2(C, A1, A2, PRIOR))
    assert np.isclose(joint_audit2_corr(C, A1, A2, PRIOR, 0.4).sum(), 1.0)


def test_marginals_unchanged_by_correlation():
    C, A1, A2 = confusion(0.7), confusion(0.8), confusion(0.8)
    J = joint_audit2_corr(C, A1, A2, PRIOR, 0.6)
    assert np.allclose(J.sum(axis=1), joint_audit(C, A1, PRIOR))      # auditor 1 + classifier
    assert np.allclose(J.sum(axis=0), joint_audit(C, A2, PRIOR))      # auditor 2 + classifier (A2 == A1 here)


def test_sampler_matches_exact_joint():
    C, A1, A2 = confusion(0.7), confusion(0.8), confusion(0.8)
    c = draw_audit2_corr(C, A1, A2, PRIOR, 0.5, 200000, np.random.default_rng(1))
    assert np.abs(c / c.sum() - joint_audit2_corr(C, A1, A2, PRIOR, 0.5)).max() < 3e-3


def test_ds_is_biased_under_correlation():
    C, A1, A2 = confusion(0.7), confusion(0.8), confusion(0.8)
    _, Ch0, _, _ = estimate_ds(joint_audit2_corr(C, A1, A2, PRIOR, 0.0) * 1e9, iters=20000)
    _, Ch, _, _ = estimate_ds(joint_audit2_corr(C, A1, A2, PRIOR, 0.6) * 1e9, iters=20000)
    assert np.abs(Ch0 - C).max() < 2e-3
    assert np.abs(Ch - C).max() > 0.02
