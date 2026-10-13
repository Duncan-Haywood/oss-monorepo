import numpy as np
from garment_stackopt.opt import baseline_stack, colour, objective
from garment_stackrobust.rob import CostBudget, evaluate, nelder_mead_restarts, perturb, random_search


def test_perturb_zero_sigma_is_identity():
    d = np.array([50.0, 80.0, 60.0])
    assert np.allclose(perturb(d, np.ones(3), 0.0), d)


def test_nominal_cost_counts_one_per_call_and_robust_counts_k():
    h = colour(baseline_stack(620, 3))[4]
    rng = np.random.default_rng(0)
    f = CostBudget(h, 10)
    random_search(f, 6, rng)
    assert f.n == 10
    draws = rng.standard_normal((4, 6))
    g = CostBudget(h, 10, sigma=0.03, draws=draws)
    random_search(g, 6, rng)
    assert g.n == 8  # two calls of cost 4; a third would exceed 10


def test_robust_objective_equals_nominal_at_zero_sigma():
    h = colour(baseline_stack(620, 3))[4]
    d = baseline_stack(620, 3)
    draws = np.random.default_rng(1).standard_normal((3, 6))
    g = CostBudget(h, 100, sigma=0.0, draws=draws)
    assert np.isclose(g(d), objective(np.clip(d, 20, 250), h)[0])


def test_evaluate_zero_sigma_has_no_drift_and_matches_nominal():
    d = baseline_stack(620, 4)
    h = colour(d)[4]
    r = evaluate(d, h, 0.0, np.random.default_rng(2).standard_normal((5, 8)))
    assert r["drift"] < 1e-9 and np.isclose(r["mean_J"], r["nominal_J"])


def test_nelder_mead_respects_cost():
    h = colour(baseline_stack(620, 3))[4]
    f = CostBudget(h, 60)
    nelder_mead_restarts(f, 6, np.random.default_rng(3))
    assert f.n <= 60 and np.isfinite(f.best)
