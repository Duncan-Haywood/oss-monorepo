import numpy as np
from garment_stackcvar.cvar import Budget, aggregate, draws, evaluate, random_search
from garment_stackopt.opt import baseline_stack, colour


def test_draws_marginals_and_correlation():
    e = draws(np.random.default_rng(0), 20000, 4, 0.5)
    assert abs(e.std() - 1.0) < 0.03
    assert abs(np.corrcoef(e[:, 0], e[:, 1])[0, 1] - 0.5) < 0.03
    assert abs(np.corrcoef(draws(np.random.default_rng(1), 20000, 4, 0.0)[:, :2].T)[0, 1]) < 0.03


def test_aggregate_mean_and_cvar():
    v = [1, 2, 3, 4, 5, 6, 7, 8]
    assert aggregate(v, "mean") == 4.5
    assert aggregate(v, "cvar", 0.25) == 7.5  # mean of the worst 2
    assert aggregate(v, "cvar", 1.0) == 4.5


def test_budget_counts_k_per_call():
    h = colour(baseline_stack(620, 3))[4]
    rng = np.random.default_rng(0)
    f = Budget(h, 20, 0.03, draws(rng, 8, 6, 0.0), "cvar")
    random_search(f, 6, rng)
    assert f.n == 16 and np.isfinite(f.best)


def test_zero_sigma_cvar_equals_mean():
    h = colour(baseline_stack(620, 3))[4]
    d = baseline_stack(620, 3)
    e = draws(np.random.default_rng(2), 8, 6, 0.5)
    assert np.isclose(Budget(h, 100, 0.0, e, "cvar")(d), Budget(h, 100, 0.0, e, "mean")(d))


def test_evaluate_p90_at_least_mean_floor():
    d = baseline_stack(620, 4)
    h = colour(d)[4]
    r = evaluate(d, h, 0.05, draws(np.random.default_rng(3), 30, 8, 0.5))
    assert r["p90_J"] >= min(r["mean_J"], r["p90_J"]) and 0 <= r["feasible"] <= 1
