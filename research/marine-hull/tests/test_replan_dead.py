"""Dead-time receding-horizon planner (milestone 6z)."""
import numpy as np
from marine_hull.tack import dp_values_dead, dp_clairvoyant_dead, sim_replan_dead, sim_corridor


def _series(n=120, seed=5):
    rng = np.random.default_rng(seed)
    return rng.uniform(0.5, 2.5, (2, n)), rng.uniform(-2, 2, (2, n))


def test_value_matches_clairvoyant_dead_without_edge_hits():
    p, c = _series()
    for m in (1, 3, 6):
        g, V = dp_values_dead(p, c, 60.0, 1e7, m, dy=1e6)   # corridor so wide no edge is reached
        ref = dp_clairvoyant_dead(p, c, 60.0, 1e7, m, dy=1e6)
        assert abs(max(V[0, 0, len(g) // 2], V[0, 1, len(g) // 2]) - ref) < 1e-6


def test_perfect_forecast_one_plan_reaches_dp_value_and_beats_corridor():
    p, c = _series(200)
    corr = 1e7
    for m in (2, 4):
        x, n_t = sim_replan_dead(p, c, 60.0, corr, m, lambda k0: (p[:, k0:], c[:, k0:]), every=200)
        # a wide corridor: the policy is the clairvoyant optimum, started on tack 0 (DP may start on either)
        assert x <= dp_clairvoyant_dead(p, c, 60.0, corr, m, dy=corr) + 1e-6
        assert x >= sim_corridor(p, c, 60.0, corr, m * 60.0)[0] - 1e-6
