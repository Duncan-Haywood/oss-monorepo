import numpy as np

from ambient_labelmatch.core import FIT_NAMES, World, run_logged, simulate


def test_all_fits_returned_and_finite():
    w = World(); d = simulate(w, 20, np.random.default_rng(2))
    fits, nlab = run_logged(w, d, np.random.default_rng(3), eps=0.02, hours=(20,))
    assert set(fits[20]) == set(FIT_NAMES) and nlab[20] > 0
    assert all(np.all(np.isfinite(v)) for v in fits[20].values())


def test_eps_one_everything_agrees_except_normalised_weights_are_identical_too():
    w = World(); d = simulate(w, 10, np.random.default_rng(4))
    fits, nlab = run_logged(w, d, np.random.default_rng(5), eps=1.0, hours=(10,))
    assert nlab[10] == len(d["need"])
    for k in FIT_NAMES:                      # every window labelled, all weights 1, random subset = all
        assert np.allclose(fits[10][k], fits[10]["full"], atol=1e-8), k


def test_clip_with_huge_cap_equals_ips_and_cap_one_equals_biased():
    from ambient_labelmatch.core import PRIOR_W, fit_map
    w = World(); d = simulate(w, 5, np.random.default_rng(6))
    X, y = d["X"], d["need"].astype(float)
    iw = np.full(len(y), 7.0)
    a, _ = fit_map(X, y, PRIOR_W, 1.0, np.minimum(iw, 1e9)); b, _ = fit_map(X, y, PRIOR_W, 1.0, iw)
    assert np.array_equal(a, b)
    c, _ = fit_map(X, y, PRIOR_W, 1.0, np.minimum(iw, 1)); u, _ = fit_map(X, y, PRIOR_W, 1.0)
    assert np.allclose(c, u)


def test_random_matched_has_same_label_count_and_is_deterministic():
    w = World(); d = simulate(w, 10, np.random.default_rng(7))
    a, na = run_logged(w, d, np.random.default_rng(8), hours=(10,))
    b, nb = run_logged(w, d, np.random.default_rng(8), hours=(10,))
    assert na == nb and np.array_equal(a[10]["random_matched"], b[10]["random_matched"])
