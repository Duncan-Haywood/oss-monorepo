import numpy as np

from ambient_cluster.sim import World, metrics, run_policy, simulate, tune_tau


def test_prevalence_preserved_across_clustering():
    for pe in (0.03, 0.15, 0.25):
        d = simulate(World(p_need_episode=pe), 400, np.random.default_rng(1))
        assert abs(d["need"].mean() - 0.03) < 0.004


def test_clustering_raises_pair_rate():
    def pair(pe):
        d = simulate(World(p_need_episode=pe), 400, np.random.default_rng(2))
        n = d["need"]
        return (n[1:] & n[:-1]).sum() / max(n[:-1].sum(), 1)
    assert pair(0.25) > 2 * pair(0.03)


def test_quiet_rate_formula():
    w = World(p_need_episode=0.15)
    assert abs(w.pi_episode * 0.15 + (1 - w.pi_episode) * w.p_need_quiet - w.prevalence) < 1e-12


def test_cooldown_never_adds_speech():
    d = simulate(World(), 50, np.random.default_rng(3))
    a = run_policy(d, 1.5, "plain"); b = run_policy(d, 1.5, "cooldown", 6)
    assert b.sum() <= a.sum() and not np.any(b & ~a)


def test_boost_and_backoff_directions():
    d = simulate(World(), 50, np.random.default_rng(4))
    p = run_policy(d, 1.5, "plain").sum()
    assert run_policy(d, 1.5, "boost", 6, 1.0).sum() >= p
    assert run_policy(d, 1.5, "backoff", 6, 1.0).sum() <= p


def test_tuning_meets_budget():
    d = simulate(World(), 40, np.random.default_rng(5))
    tau = tune_tau(d, 2.0, "plain", 0, 0.0)
    assert metrics(d, run_policy(d, tau, "plain"))["fp_per_hour"] <= 2.0 + 1e-9


def test_zero_effect_params_equal_plain():
    d = simulate(World(), 30, np.random.default_rng(6))
    a = run_policy(d, 1.2, "plain")
    assert np.array_equal(a, run_policy(d, 1.2, "cooldown", 0))
    assert np.array_equal(a, run_policy(d, 1.2, "boost", 5, 0.0))
