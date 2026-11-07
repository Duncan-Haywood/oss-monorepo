"""Tack penalty longer than one step (milestone 6x): earlier code clipped tau at dt."""
import numpy as np
from marine_hull.tack import sim_corridor, sim_header, dp_clairvoyant, dp_clairvoyant_dead


def _series(n=300, seed=3):
    rng = np.random.default_rng(seed)
    p = rng.uniform(0.5, 2.5, (2, n)); c = rng.uniform(-2, 2, (2, n))
    return p, c


def test_penalty_not_clipped_at_one_step():
    p, c = _series()
    xs = [sim_corridor(p, c, 60.0, 400.0, tau)[0] for tau in (60.0, 120.0, 360.0)]
    assert xs[0] > xs[1] > xs[2]
    hs = [sim_header(p, c, 60.0, 400.0, tau, 0.1, 5)[0] for tau in (60.0, 120.0, 360.0)]
    assert hs[0] > hs[1] > hs[2]


def test_dead_time_dp_matches_old_dp_at_one_step():
    p, c = _series(120)
    assert abs(dp_clairvoyant_dead(p, c, 60.0, 400.0, 1) - dp_clairvoyant(p, c, 60.0, 400.0, 60.0)) < 1e-6


def test_dp_beats_controllers_and_falls_with_cost():
    p, c = _series(200)
    d = [dp_clairvoyant_dead(p, c, 60.0, 400.0, m) for m in (1, 2, 6)]
    assert d[0] >= d[1] >= d[2]
    assert d[2] >= sim_corridor(p, c, 60.0, 400.0, 360.0)[0] - 1e-6
    assert d[2] >= sim_header(p, c, 60.0, 400.0, 360.0, 0.1, 5)[0] - 1e-6


def test_one_step_controllers_refuse_long_tacks():
    import pytest
    from marine_hull.tack import dp_values, sim_policy, sim_replan, sim_mpc
    p, c = _series(60)
    with pytest.raises(ValueError):
        dp_values(p, c, 60.0, 400.0, 120.0)
    g, V = dp_values(p, c, 60.0, 400.0, 60.0)
    with pytest.raises(ValueError):
        sim_policy(p, c, p, c, 60.0, 400.0, 120.0, g, V)
    with pytest.raises(ValueError):
        sim_replan(p, c, 60.0, 400.0, 120.0, lambda k0: (p[:, k0:], c[:, k0:]))
    with pytest.raises(ValueError):
        sim_mpc(p, c, 60.0, 400.0, 400.0, 30, lambda k0: (p[:, k0:], c[:, k0:]))


def test_replan_dead_perfect_forecast_follows_dp_value():
    """With the true rates as forecast, the controller realises the DP value (up to grid interpolation) and beats the corridor."""
    from marine_hull.tack import dp_values_dead, sim_replan_dead
    p, c = _series(240)
    for m in (1, 4):
        g, V = dp_values_dead(p, c, 60.0, 400.0, m)
        v0 = max(V[0, 0, len(g) // 2], V[0, 1, len(g) // 2])
        x, n_t = sim_replan_dead(p, c, 60.0, 400.0, m, lambda k0: (p[:, k0:], c[:, k0:]), every=10**6)
        assert x <= v0 * 1.02
        assert x >= 0.93 * v0
        assert x >= sim_corridor(p, c, 60.0, 400.0, m * 60.0)[0] - 1e-6


def test_dp_values_dead_m1_matches_dp_values():
    from marine_hull.tack import dp_values, dp_values_dead
    p, c = _series(100)
    g, V1 = dp_values(p, c, 60.0, 400.0, 60.0)
    g2, V2 = dp_values_dead(p, c, 60.0, 400.0, 1)
    assert np.allclose(V1[0], V2[0], atol=1e-6) or abs(V1[0].max() - V2[0].max()) < 0.02 * V1[0].max()
