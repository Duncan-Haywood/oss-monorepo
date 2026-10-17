import numpy as np

from ambient_ips.ips import (INFORMED_W, PRIOR_W, World, fit_map, oracle_weights, run_fixed,
                             run_online, sigmoid, simulate)


def test_weighted_fit_matches_replication():
    # integer weights are the same as repeating rows
    rng = np.random.default_rng(0)
    X = np.column_stack([rng.normal(size=300), np.ones(300)])
    y = (rng.random(300) < sigmoid(X @ np.array([1.0, -0.5]))).astype(float)
    sw = rng.integers(1, 4, 300).astype(float)
    w1, _ = fit_map(X, y, np.zeros(2), 1e-6, sw)
    rep = np.repeat(np.arange(300), sw.astype(int))
    w2, _ = fit_map(X[rep], y[rep], np.zeros(2), 1e-6)
    assert np.allclose(w1, w2, atol=1e-5)


def test_ips_removes_selection_bias_in_a_toy_sample():
    # select rows with probability depending on x; unweighted fit is biased, IPS fit is not
    rng = np.random.default_rng(1)
    n = 200000
    x = rng.normal(size=n)
    X = np.column_stack([x, np.ones(n)])
    y = (rng.random(n) < sigmoid(X @ np.array([1.0, -2.0]))).astype(float)
    # selection depends on the label's neighbourhood via x only, with known propensity
    pi = np.where(x > 0.5, 1.0, 0.05)
    keep = rng.random(n) < pi
    # misspecified model (intercept only) makes selection matter
    Xm = X[:, 1:]
    w_plain, _ = fit_map(Xm[keep], y[keep], np.zeros(1), 1e-6)
    w_ips, _ = fit_map(Xm[keep], y[keep], np.zeros(1), 1e-6, 1 / pi[keep])
    w_full, _ = fit_map(Xm, y, np.zeros(1), 1e-6)
    assert abs(w_ips[0] - w_full[0]) < 0.1
    assert abs(w_plain[0] - w_full[0]) > 0.3


def test_wake_always_answered_and_deterministic():
    wd = World()
    d = simulate(wd, 20, np.random.default_rng(2))
    a = run_online(wd, d, np.random.default_rng(3))
    b = run_online(wd, d, np.random.default_rng(3))
    assert a[2][d["wake"]].all()
    assert np.array_equal(a[0], b[0])


def test_eps_zero_speaks_only_on_model_or_wake_and_ips_equals_plain():
    wd = World()
    d = simulate(wd, 10, np.random.default_rng(4))
    a = run_online(wd, d, np.random.default_rng(5), eps=0.0, weighting="ips")[0]
    b = run_online(wd, d, np.random.default_rng(5), eps=0.0, weighting="none")[0]
    assert np.array_equal(a, b)


def test_informed_ips_learns_most_of_oracle():
    wd = World()
    wo = oracle_weights(wd, np.random.default_rng(6), 500)
    d = simulate(wd, 60, np.random.default_rng(7))
    _, _, _, snap = run_online(wd, d, np.random.default_rng(8), eps=0.02, prior_w=INFORMED_W)
    held = simulate(wd, 100, np.random.default_rng(9))
    assert run_fixed(wd, held, snap[60]).sum() > 0.7 * run_fixed(wd, held, wo).sum()
