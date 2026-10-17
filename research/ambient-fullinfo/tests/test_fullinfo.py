import numpy as np

from ambient_fullinfo.core import PRIOR_W, World, fit_map, oracle_weights, run_fixed, run_logged, simulate


def test_full_fit_close_to_oracle_on_long_stream():
    w = World()
    d = simulate(w, 500, np.random.default_rng(0))
    full, _ = fit_map(d["X"], d["need"].astype(float), PRIOR_W, 1.0)
    wo = oracle_weights(w, np.random.default_rng(1), 1000)
    assert np.linalg.norm(full - wo) < 0.5


def test_run_logged_returns_three_fits_and_label_counts():
    w = World(); d = simulate(w, 20, np.random.default_rng(2))
    fits, nlab = run_logged(w, d, np.random.default_rng(3), eps=0.02, hours=(10, 20))
    assert set(fits) == {10, 20} and set(fits[20]) == {"biased", "ips", "full"}
    assert nlab[20] >= nlab[10] > 0
    assert all(np.all(np.isfinite(v)) for f in fits.values() for v in f.values())


def test_with_eps_one_all_windows_are_labelled_and_all_fits_agree():
    w = World(); d = simulate(w, 10, np.random.default_rng(4))
    fits, nlab = run_logged(w, d, np.random.default_rng(5), eps=1.0, hours=(10,))
    assert nlab[10] == len(d["need"])
    assert np.allclose(fits[10]["biased"], fits[10]["full"], atol=1e-8)
    assert np.allclose(fits[10]["ips"], fits[10]["full"], atol=1e-8)


def test_deterministic_given_seeds():
    w = World(); d = simulate(w, 10, np.random.default_rng(6))
    a, _ = run_logged(w, d, np.random.default_rng(7), hours=(10,))
    b, _ = run_logged(w, d, np.random.default_rng(7), hours=(10,))
    assert np.array_equal(a[10]["biased"], b[10]["biased"])
