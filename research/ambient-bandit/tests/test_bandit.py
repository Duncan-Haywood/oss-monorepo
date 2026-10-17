import numpy as np

from ambient_bandit.bandit import (BATCH, World, decide, fit_map, oracle_weights, run_fixed,
                                   run_online, sigmoid, simulate, PRIOR_W)


def test_stream_shapes_and_prevalence():
    d = simulate(World(), 200, np.random.default_rng(0))
    assert d["X"].shape == (200 * 360, 4)
    assert abs(d["need"].mean() - 0.03) < 0.004


def test_fit_map_recovers_weights():
    rng = np.random.default_rng(1)
    X = np.column_stack([rng.normal(size=20000), np.ones(20000)])
    w_true = np.array([1.5, -1.0])
    y = (rng.random(20000) < sigmoid(X @ w_true)).astype(float)
    w, cov = fit_map(X, y, np.zeros(2), prior_prec=1e-3)
    assert np.allclose(w, w_true, atol=0.1)
    assert np.all(np.diag(cov) > 0)


def test_decision_rule_is_expected_utility():
    wd = World()
    w = np.array([0, 0, 0, np.log(0.3 / 0.7)])    # p = 0.3 everywhere
    X = np.zeros((2, 4)); X[:, 3] = 1
    sp = decide(wd, w, X, np.array([False, True]))
    assert sp[0] and not sp[1]   # 0.3*3=0.9 > 0.7*1, but 0.9 < 0.7*2 when others talk


def test_oracle_beats_wake_only_and_online_approaches_it():
    wd = World()
    wo = oracle_weights(wd, np.random.default_rng(5), hours=500)
    d = simulate(wd, 60, np.random.default_rng(6))
    u_or = run_fixed(wd, d, wo).sum()
    u_wake = np.where(d["wake"] & d["need"], wd.benefit, 0.0).sum() - np.where(d["wake"] & ~d["need"], 1.0, 0.0).sum()
    u_on, dis, sp = run_online(wd, d, "thompson", np.random.default_rng(7),
                                prior_w=np.array([1.0, 0.0, 0.0, -3.5]))
    assert u_or > u_wake
    assert u_on.sum() > 0.5 * u_or      # informed prior: learns most of it within 60 h (loose bound)


def test_silent_policy_gets_no_labels_and_wake_always_answered():
    wd = World()
    d = simulate(wd, 20, np.random.default_rng(8))
    _, _, sp = run_online(wd, d, "greedy", np.random.default_rng(9))
    assert sp[d["wake"]].all()
    assert sp.sum() >= d["wake"].sum()


def test_deterministic_given_seed():
    wd = World()
    d = simulate(wd, 10, np.random.default_rng(3))
    a = run_online(wd, d, "eps", np.random.default_rng(4))[0]
    b = run_online(wd, d, "eps", np.random.default_rng(4))[0]
    assert np.array_equal(a, b)
