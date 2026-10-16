import numpy as np
from ambient_multistart.est import (PRIOR, confusion, joint3_hard, draw3_hard, estimate_ds3, estimate_ds3_hard)


def test_joint_normalised_and_h0_independent():
    C, A = confusion(0.7), confusion(0.8)
    J = joint3_hard(C, 0.8, 0.3, 0.5, PRIOR)
    assert np.isclose(J.sum(), 1.0)
    ind = np.einsum("t,ta,tb,tc,to->abco", PRIOR, A, A, A, C)
    assert np.allclose(joint3_hard(C, 0.8, 0.0, 0.5, PRIOR), ind)


def test_auditor_marginal_accuracy_is_exact():
    C = confusion(0.7)
    J = joint3_hard(C, 0.8, 0.3, 0.5, PRIOR)
    m = J.sum(axis=(1, 2, 3))
    pa = np.einsum("t,ta->a", PRIOR, confusion(0.8))
    assert np.allclose(m, pa)


def test_draw_matches_joint():
    rng = np.random.default_rng(0)
    c = draw3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR, 200000, rng)
    assert np.abs(c / c.sum() - joint3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR)).max() < 3e-3


def test_hard_ds_recovers_classifier_and_hard_share_from_three_starts():
    J = joint3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR) * 1e9
    phs = []
    for init in ((0.9, 0.5, 0.3, 0.7), (0.95, 0.4, 0.2, 0.7), (0.85, 0.6, 0.4, 0.7)):
        pr, C, Ae, Ah, ph, ll = estimate_ds3_hard(J, iters=20000, init=init)
        assert abs(np.diag(C).mean() - 0.7) < 5e-3
        phs.append(ph)
    assert max(phs) - min(phs) < 0.02, phs   # identified with three auditors


def test_plain_ds3_runs_and_returns_stochastic_matrices():
    J = joint3_hard(confusion(0.7), 0.8, 0.3, 0.5, PRIOR) * 1e6
    pr, C, As = estimate_ds3(J, iters=500)
    assert np.allclose(C.sum(axis=1), 1) and all(np.allclose(A.sum(axis=1), 1) for A in As)
