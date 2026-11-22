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


# Added by quality round 94 (2026-11-22): checks against definitions the code must satisfy, so seeded
# mutants in the decision rule, the prior gradient and the full-information fit no longer pass.
from ambient_fullinfo.core import cost, decide, sigmoid


def test_decide_is_the_expected_utility_threshold():
    # speak iff p*benefit > (1-p)*cost, i.e. p > c/(b+c): 1/4 alone, 2/5 with others present (b=3, c=1 or 2)
    w = World()
    p = np.array([0.24, 0.26, 0.39, 0.41])
    others = np.array([False, False, True, True])
    X = np.column_stack([np.log(p / (1 - p)), np.zeros(4), np.zeros(4), np.zeros(4)])
    got = decide(w, np.array([1.0, 0, 0, 0]), X, others)
    assert got.tolist() == [False, True, False, True]
    assert cost(w, others).tolist() == [1.0, 1.0, 2.0, 2.0]


def test_fit_map_is_stationary_for_the_map_objective():
    # gradient of sum(nll) + prec/2 * ||w - w0||^2 vanishes at the returned weights (non-zero prior mean)
    w = World(); d = simulate(w, 5, np.random.default_rng(8))
    X, y = d["X"], d["need"].astype(float)
    wh, _ = fit_map(X, y, PRIOR_W, 1.0)
    g = X.T @ (sigmoid(X @ wh) - y) + 1.0 * (wh - PRIOR_W)
    assert np.max(np.abs(g)) < 1e-6


def test_full_fit_uses_every_window_not_only_labelled_ones():
    w = World(); d = simulate(w, 10, np.random.default_rng(9))
    fits, nlab = run_logged(w, d, np.random.default_rng(10), eps=0.005, hours=(10,))
    assert nlab[10] < len(d["need"])
    ref, _ = fit_map(d["X"], d["need"].astype(float), PRIOR_W, 1.0)
    assert np.allclose(fits[10]["full"], ref, atol=1e-10)


def test_fit_map_reaches_the_minimum_from_a_poor_start():
    # Quality round 94: undamped Newton from the uninformed prior diverged on the deployed
    # learner's history (objective up to 360,000x the minimum). Capture the hour-20 biased
    # fit's inputs and check the returned weights are a stationary point that beats w0.
    import ambient_fullinfo.core as C
    wd = World(); d = simulate(wd, 20, np.random.default_rng(1000))
    calls = []; orig = C.fit_map
    def wrap(X, y, w0, prior_prec=1.0, sample_weight=None, iters=40):
        calls.append((X, y, w0, prior_prec, sample_weight)); return orig(X, y, w0, prior_prec, sample_weight, iters)
    C.fit_map = wrap
    try:
        run_logged(wd, d, np.random.default_rng(0), eps=0.002, prior_w=PRIOR_W, hours=(20,))
    finally:
        C.fit_map = orig
    for X, y, w0, prec, sw in calls[-3:-1]:          # biased and ips fits
        sw = np.ones(len(y)) if sw is None else sw
        w, _ = fit_map(X, y, w0, prec, sw)
        z = X @ w
        J = lambda v: np.sum(sw * (np.logaddexp(0, X @ v) - y * (X @ v))) + prec / 2 * np.sum((v - w0) ** 2)
        g = X.T @ (sw * (sigmoid(z) - y)) + prec * (w - w0)
        assert J(w) <= J(w0)
        assert np.linalg.norm(g) < 1e-4 * max(1.0, float(np.sum(sw)))
