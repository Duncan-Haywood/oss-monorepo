import numpy as np
from marine_hull.tack import dp_values, sim_policy, dp_clairvoyant, smooth, sim_corridor


def synth(n=240, seed=1):
    r = np.random.default_rng(seed)
    eps = np.cumsum(r.normal(0, 2, n)); eps -= eps.mean()
    ang = np.radians(np.array([eps + 40, eps - 40]))
    v = 2.0
    return np.maximum(v * np.cos(ang), 0), v * np.sin(ang)


def test_unsmoothed_policy_matches_clairvoyant_dp():
    p, c = synth()
    best = dp_clairvoyant(p, c, 60.0, 1500.0, 30.0)
    grid, V = dp_values(p, c, 60.0, 1500.0, 30.0, edge_tack=False)
    m = len(grid) // 2
    assert abs(max(V[0, 0, m], V[0, 1, m]) - best) < 1e-6


def test_edge_rule_lowers_the_bound_and_policy_attains_it():
    p, c = synth()
    g0, V0 = dp_values(p, c, 60.0, 1500.0, 30.0, edge_tack=False)
    g1, V1 = dp_values(p, c, 60.0, 1500.0, 30.0, edge_tack=True)
    m = len(g1) // 2
    v0, v1 = max(V0[0, :, m]), max(V1[0, :, m])
    assert v1 <= v0 + 1e-9
    x, _ = sim_policy(p, c, p, c, 60.0, 1500.0, 30.0, g1, V1)
    assert 0.9 * v1 <= x <= 1.01 * v1  # interpolation on the 25 m grid lets the policy exceed V slightly


def test_smooth_preserves_constant_and_shape():
    a = np.ones((2, 50)) * 3.0
    assert np.allclose(smooth(a, 9), 3.0)
    assert smooth(a, 1) is a


def test_policy_beats_edge_tacking_on_synthetic_shifts():
    p, c = synth(480, 3)
    grid, V = dp_values(p, c, 60.0, 1500.0, 30.0)
    assert sim_policy(p, c, p, c, 60.0, 1500.0, 30.0, grid, V)[0] >= sim_corridor(p, c, 60.0, 1500.0, 30.0)[0]


def test_replan_perfect_forecast_close_to_policy_and_persistence_runs():
    from marine_hull.tack import sim_replan, lead_forecast
    p, c = synth(480, 5)
    g, V = dp_values(p, c, 60.0, 1500.0, 30.0)
    x_full, _ = sim_policy(p, c, p, c, 60.0, 1500.0, 30.0, g, V)
    x_inf, _ = sim_replan(p, c, 60.0, 1500.0, 30.0, lambda k0: lead_forecast(p, c, k0, float("inf"), smooth_min=1), every=120)
    assert abs(x_inf - x_full) < 0.03 * x_full  # same model every replan; state carries over
    x_0, _ = sim_replan(p, c, 60.0, 1500.0, 30.0, lambda k0: lead_forecast(p, c, k0, 0.0), every=120)
    assert x_0 > 0
