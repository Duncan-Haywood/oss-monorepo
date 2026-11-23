"""Milestone 73: chance-constrained re-zeros for a random-walk bias."""
import numpy as np
import pytest

stats = pytest.importorskip("scipy.stats")

from buildbot_sheathing import drift as D  # noqa: E402
from buildbot_sheathing import rezero as R  # noqa: E402


def test_mean_norm_3d():
    assert abs(D.mean_norm(3) - 2 * np.sqrt(2 / np.pi)) < 1e-12


def test_matched_rw_gives_the_hour_reading():
    rho, sig = D.matched("RW", 0.1)
    rng = np.random.default_rng(0)
    z = rng.standard_normal((200000, 3)) * sig * np.sqrt(3600)
    assert rho == 0 and abs(np.linalg.norm(z, axis=1).mean() - 0.1) < 1e-3


def test_rw_deadline_closed_form_and_quadratic():
    _, sig = D.matched("RW", 0.1)
    T1, T2 = D.deadline(0.05, 0, sig, 1e-3), D.deadline(0.10, 0, sig, 1e-3)
    assert abs(T2 / T1 - 4) < 1e-9
    assert abs(D.p_violate(T1, 0.05, 0, sig) - 1e-3) < 1e-9


def test_mixed_deadline_hits_eps_and_is_shorter_than_either_part():
    rho, sig = D.matched("MIX", 0.1)
    T = D.deadline(0.08, rho, sig, 1e-3)
    assert abs(D.p_violate(T, 0.08, rho, sig) - 1e-3) < 1e-6
    assert T < D.deadline(0.08, 0, sig, 1e-3) and T < 0.08 / rho


def test_violation_probability_is_monotone():
    rho, sig = D.matched("MIX", 0.2)
    assert D.monotone_on_grid(0.05, rho, sig, 36000) <= 1e-12


def test_linear_wall_never_fails_on_its_own_schedule():
    g, t, a = [0, 1, 1, 1], [1, 1, 1, 1], np.full(4, 0.5)
    rho = 0.2                                     # deadline 2.5 s
    st = R.greedy(g, t, a / rho)
    assert D.wall_fail(g, t, a, st, rho, 0.0, 10, 1) == 0.0


def test_single_press_monte_carlo_matches_chi_square():
    sig = 0.01
    p = D.wall_fail([0], [100.0], [0.12], [], 0.0, sig, 40000, 3)
    exact = stats.chi2.sf(0.12 ** 2 / (sig ** 2 * 100), 3)
    assert abs(p - exact) < 0.01


def test_rezero_resets_the_walk():
    # two presses far apart in time; a re-zero before the second makes its drift independent of the first
    sig = 0.01
    p_cut = D.wall_fail([0, 1e4], [100.0, 100.0], [0.12, 0.12], [1], 0, sig, 40000, 4)
    q = stats.chi2.sf(0.12 ** 2 / (sig ** 2 * 100), 3)
    assert abs(p_cut - (1 - (1 - q) ** 2)) < 0.01
