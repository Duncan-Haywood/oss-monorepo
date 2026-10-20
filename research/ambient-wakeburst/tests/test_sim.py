import numpy as np
from ambient_wakeburst import ar1, wake_positions, lockout, window_counts, fano, simulate_counts


def test_ar1_moments_and_autocorrelation():
    s = ar1(0.9, 600_000, np.random.default_rng(1))
    assert abs(s.mean()) < 0.06 and abs(s.std() - 1) < 0.03
    assert abs(np.corrcoef(s[:-1], s[1:])[0, 1] - 0.9) < 0.01
    assert abs(np.corrcoef(s[:-10], s[10:])[0, 1] - 0.9 ** 10) < 0.02


def test_ar1_small_phi_does_not_overflow():
    for phi in (0.1, 0.5):
        s = ar1(phi, 300_000, np.random.default_rng(4))
        assert np.isfinite(s).all() and abs(s.std() - 1) < 0.03
        assert abs(np.corrcoef(s[:-1], s[1:])[0, 1] - phi) < 0.01


def test_ar1_length_not_multiple_of_chunk():
    assert len(ar1(0.8, 1500, np.random.default_rng(0))) == 1500


def test_wake_positions_counts_each_run_once_when_it_reaches_m():
    s = np.array([0, 5, 5, 5, 5, 0, 5, 0, 5, 5, 5, 0.0])
    assert list(wake_positions(s, 1.0, 3)) == [3, 10]
    assert list(wake_positions(s, 1.0, 1)) == [1, 6, 8]


def test_lockout_drops_close_wakes():
    pos = np.array([10, 15, 40, 41, 100])
    assert list(lockout(pos, 20)) == [10, 40, 100]
    assert list(lockout(pos, 0)) == list(pos)


def test_window_counts():
    assert list(window_counts(np.array([1, 2, 11, 25]), 10, 4)) == [2, 1, 1, 0]


def test_independent_scores_give_poisson_fano():
    c = simulate_counts(2.5, 0.0, 1, 50_000, 400, seed=1)
    assert 0.85 < fano(c) < 1.2


def test_scale_drift_inflates_fano():
    base = simulate_counts(3.0, 0.9, 1, 50_000, 400, seed=2)
    drift = simulate_counts(3.0, 0.9, 1, 50_000, 400, seed=2, scale_sigma=0.1)
    assert fano(drift) > 2 * fano(base)


def test_lockout_cuts_the_mean():
    a = simulate_counts(2.0, 0.9, 3, 50_000, 40, seed=3)
    b = simulate_counts(2.0, 0.9, 3, 50_000, 40, seed=3, L=200)
    assert b.mean() < a.mean()
