"""Milestone 3h: the pinned-intrinsics bundle adjustment (experiments/m3h_linear/pinned.py)."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3h_linear"))
sys.path.insert(0, HERE)
import pinned  # noqa: E402
import nfba  # noqa: E402
from test_m3b import scene, INTR  # noqa: E402


def setup(seed=1, nv=8, npt=300):
    vi, pi, uv, rv, tv, X = scene(seed, nv=nv, npt=npt)
    used = np.unique(pi)
    remap = -np.ones(X.shape[0], int); remap[used] = np.arange(len(used))
    pi, X = remap[pi], X[used]
    prob = nfba.Problem(vi, pi, uv, len(rv), len(X), tv)
    rng = np.random.default_rng(2)
    return prob, rv + rng.normal(0, 0.01, rv.shape), tv * 1.0, X + rng.normal(0, 0.02, X.shape)


def test_no_pins_reproduces_nfba_bundle():
    prob, rv, tv, X = setup()
    start = np.array([INTR[0] * 1.08, 320.0, 240.0, 0.0, 0.0])
    _, (a, *_), qa = nfba.bundle(prob, start, rv, tv, X)
    _, (b, *_), qb = pinned.bundle_pinned(prob, start, rv, tv, X, pinned=())
    assert np.allclose(qa, qb, rtol=1e-7, atol=1e-8)   # same steps; float order differs
    cov, *_ = nfba.intr_cov(prob, qa)
    covp, free, _ = pinned.intr_cov_pinned(prob, qb, pinned=())
    assert free == [0, 1, 2, 3, 4]
    assert np.allclose(cov, covp, rtol=1e-5, atol=1e-9)


def test_pinned_values_stay_and_true_k_recovers_f():
    prob, rv, tv, X = setup()
    start = np.array([INTR[0] * 1.08, 320.0, 240.0, INTR[3], INTR[4]])
    info, (intr, *_), q = pinned.bundle_pinned(prob, start, rv, tv, X, pinned=(3, 4))
    assert info["status"] > 0
    assert intr[3] == INTR[3] and intr[4] == INTR[4]
    cov, free, sig = pinned.intr_cov_pinned(prob, q, pinned=(3, 4))
    assert free == [0, 1, 2] and cov.shape == (3, 3)
    assert abs(sig - 0.5) < 0.1
    assert abs(intr[0] - INTR[0]) < 4 * np.sqrt(cov[0, 0])


def test_small_step_first_order_matches_resolve():
    """For a tiny pin away from the free solution the re-solve must move f as the conditioning says,
    and the pinned sd must match the conditional sd (same Gauss-Newton matrix, Schur complement)."""
    prob, rv, tv, X = setup()
    start = np.array([INTR[0] * 1.08, 320.0, 240.0, 0.0, 0.0])
    _, (intr, rv1, tv1, X1), q = nfba.bundle(prob, start, rv, tv, X)
    cov, *_ = nfba.intr_cov(prob, q)
    kt = intr[3:5] + np.sqrt(np.diag(cov))[3:5] * np.array([0.5, -0.3])
    fc, ratio = pinned.condition(intr, cov, (3, 4), kt)
    i0 = intr.copy(); i0[3:5] = kt
    _, (ip, *_), qp = pinned.bundle_pinned(prob, i0, rv1, tv1, X1, pinned=(3, 4))
    dc, dp = fc - intr[0], ip[0] - intr[0]
    assert abs(dc) > 1e-3
    assert abs(dp - dc) < 0.05 * abs(dc)
    covp, _, _ = pinned.intr_cov_pinned(prob, qp, pinned=(3, 4))
    sd_m = np.sqrt(cov[0, 0])
    # the pinned sigma differs from the free one only by the dof change; the shape must agree
    assert abs(np.sqrt(covp[0, 0]) / sd_m - ratio) < 0.03 * ratio


def test_condition_one_term_is_bivariate_formula():
    cov = np.array([[4.0, 0, 0, 1.2, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [1.2, 0, 0, 0.9, 0], [0, 0, 0, 0, 1]])
    intr = np.array([500.0, 320, 240, 0.1, 0.0])
    fc, r = pinned.condition(intr, cov, (3,), (0.4,))
    assert np.isclose(fc, 500 + 1.2 / 0.9 * 0.3)
    assert np.isclose(r, np.sqrt(1 - 1.2 ** 2 / (4 * 0.9)))
