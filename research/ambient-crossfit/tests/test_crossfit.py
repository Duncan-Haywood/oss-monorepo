import numpy as np

from ambient_crossfit.core import FIT_NAMES, PRIOR_W, World, crossfit_outcome, dr_from_m, dr_labels, run_logged, simulate, sigmoid


def test_all_fits_returned_and_finite():
    w = World(); d = simulate(w, 20, np.random.default_rng(2))
    fits, nlab = run_logged(w, d, np.random.default_rng(3), eps=0.02, hours=(20,))
    assert set(fits[20]) == set(FIT_NAMES) and nlab[20] > 0
    assert all(np.all(np.isfinite(v)) for v in fits[20].values())


def test_dr_from_m_matches_dr_labels():
    X = np.array([[1.0, 0, 0, 1], [0.0, 1, 0, 1], [2.0, 0, 1, 1]]); y = np.array([1.0, 0.0, 1.0]); w = np.array([0.5, 0.2, 0, -0.3])
    spoke = np.array([True, False, True]); prop = np.array([0.05, 1.0, 1.0])
    for cap in (1, 5, np.inf):
        assert np.allclose(dr_from_m(sigmoid(X @ w), y, spoke, prop, cap), dr_labels(X, y, spoke, prop, w, cap))


def test_crossfit_prediction_never_uses_own_fold():
    # Labels only in fold 0 (even indices). Fold-0 windows are predicted by a model trained on fold 1 (no labels) -> prior only.
    w = World(); d = simulate(w, 5, np.random.default_rng(9))
    X, y = d["X"], d["need"].astype(float); n = len(y)
    spoke = np.arange(n) % 2 == 0; prop = np.ones(n)
    m = crossfit_outcome(X, y, spoke, prop, PRIOR_W, 1.0)
    assert np.allclose(m[spoke], sigmoid(X[spoke] @ PRIOR_W))        # own fold excluded: prior only
    assert not np.allclose(m[~spoke], sigmoid(X[~spoke] @ PRIOR_W))   # other fold's labels were used


def test_eps_one_everything_agrees_with_full():
    w = World(); d = simulate(w, 10, np.random.default_rng(4))
    fits, nlab = run_logged(w, d, np.random.default_rng(5), eps=1.0, hours=(10,))
    assert nlab[10] == len(d["need"])
    # with all propensities 1 the DR pseudo-label is y whatever m is, so cross and plug coincide with full
    for k in FIT_NAMES:
        assert np.allclose(fits[10][k], fits[10]["full"], atol=1e-8), k


def test_deterministic():
    w = World(); d = simulate(w, 10, np.random.default_rng(7))
    a, _ = run_logged(w, d, np.random.default_rng(8), hours=(10,))
    b, _ = run_logged(w, d, np.random.default_rng(8), hours=(10,))
    assert all(np.array_equal(a[10][k], b[10][k]) for k in FIT_NAMES)
