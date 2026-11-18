import numpy as np
from marine_hull.tack import sim_mpc, sim_corridor


def const(n, p0, c0):
    p = np.tile(np.array([[p0], [p0]]), (1, n)); c = np.tile(np.array([[c0], [-c0]]), (1, n))
    return p, c


def test_constant_wind_matches_corridor_edge_tacking():
    # symmetric tacks, nothing to gain by tacking early: the planner only tacks when forced at the corridor edge
    p, c = const(600, 1.0, 0.5)
    x, n = sim_mpc(p, c, 60.0, 1500.0, 30.0, 60, lambda k: (p[:, k:k + 60], c[:, k:k + 60]), margin=0.1)
    xa, na = sim_corridor(p, c, 60.0, 1500.0, 30.0)
    assert abs(x - xa) / xa < 0.01 and abs(n - na) <= 1


def test_forecast_of_a_header_makes_it_tack_early():
    # tack 0 is good for 100 min then collapses, tack 1 the reverse; a forecast sees it, the corridor rule does not
    n = 200
    p = np.zeros((2, n)); c = np.zeros((2, n))
    p[0, :100] = 1.0; p[0, 100:] = 0.2; p[1, :100] = 0.2; p[1, 100:] = 1.0
    c[0] = 0.1; c[1] = -0.1
    x, nt = sim_mpc(p, c, 60.0, 1500.0, 30.0, 120, lambda k: (p[:, k:k + 120], c[:, k:k + 120]))
    xa, _ = sim_corridor(p, c, 60.0, 1500.0, 30.0)
    assert x > xa * 1.2 and nt >= 1


def test_no_tack_when_calm_forecast_is_empty():
    p, c = np.zeros((2, 50)), np.zeros((2, 50))
    assert sim_mpc(p, c, 60.0, 1500.0, 30.0, 30, lambda k: (p[:, k:k + 30], c[:, k:k + 30]))[0] == 0.0
