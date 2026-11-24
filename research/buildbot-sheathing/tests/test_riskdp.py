"""Milestone 75: exact radial-chain segment risk and the optimal risk-constrained schedule."""
import numpy as np
import pytest

stats = pytest.importorskip("scipy.stats")

from buildbot_sheathing import drift as D  # noqa: E402
from buildbot_sheathing import riskdp as Q  # noqa: E402


def _toy(sheets=6):
    a = np.array([0.02, 0.03, 0.015, 0.03] * sheets)
    t = np.full(len(a), 5.0)
    g = np.array(([20.0] + [0.0] * 3) * sheets)
    g[0] = 0.0
    return g, t, a


def test_radial_cdf_matches_noncentral_chi2():
    s, r, sd = np.array([0.5, 1.0, 2.0, 3.5]), 1.3, 0.7
    ref = stats.ncx2.cdf(s ** 2 / sd ** 2, 3, r ** 2 / sd ** 2)
    assert np.max(np.abs(Q.radial_cdf(s, r, sd) - ref)) < 1e-10


def test_grid_has_an_edge_at_every_allowance():
    e = Q.grid([0.03, 0.01, 0.03], 0.004)
    assert np.any(np.isclose(e, 0.01)) and np.isclose(e[-1], 0.03) and np.max(np.diff(e)) <= 0.004 + 1e-15


def test_single_press_segment_equals_chi_square_tail():
    _, sig = D.matched("RW", 0.1)
    LS = Q.segment_logsurv([0.0], [5.0], [0.01], 1, sig, 0.99)
    assert abs(1 - np.exp(LS[0][0]) - D.p_violate(5.0, 0.01, 0.0, sig)) < 1e-12


def test_chain_matches_monte_carlo_on_a_toy_wall():
    g, t, a = _toy()
    _, sig = D.matched("RW", 0.1)
    LS = Q.segment_logsurv(g, t, a, 4, sig, 0.5, dr_frac=1 / 6)
    st = [4, 8, 12, 16, 20]
    chain = 1 - np.exp(Q.wall_logsurv(LS, 4, len(a), st))
    mc = D.wall_fail(g, t, a, st, 0.0, sig, 40000, 7)
    assert abs(chain - mc) < 4 * np.sqrt(mc * (1 - mc) / 40000) + 0.001


def test_optimal_equals_brute_force():
    _, sig = D.matched("RW", 0.1)
    for sheets, alpha in ((4, 0.02), (5, 0.05), (6, 0.1)):
        g, t, a = _toy(sheets)
        LS = Q.segment_logsurv(g, t, a, 4, sig, alpha)
        k, st, lsv = Q.optimal(LS, 4, len(a), alpha)
        assert k == Q.brute_force(LS, 4, len(a), alpha) == len(st)
        assert lsv >= np.log1p(-alpha) and abs(Q.wall_logsurv(LS, 4, len(a), st) - lsv) < 1e-9
