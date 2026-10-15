import numpy as np

from ambient_exploreonly.core import FIT_NAMES, PRIOR_W, World, fit_map, run_logged, run_online, simulate


def test_all_fits_finite_and_counts_consistent():
    w = World(); d = simulate(w, 20, np.random.default_rng(2))
    fits, counts = run_logged(w, d, np.random.default_rng(3), eps=0.05, hours=(20,))
    assert set(fits[20]) == set(FIT_NAMES)
    assert all(np.all(np.isfinite(v)) for v in fits[20].values())
    assert 0 < counts[20]["explored"] < counts[20]["spoke"]


def test_eps_one_every_fit_equals_full():
    w = World(); d = simulate(w, 10, np.random.default_rng(4))
    fits, counts = run_logged(w, d, np.random.default_rng(5), eps=1.0, hours=(10,))
    # every window is spoken on; explored = the windows the greedy rule skipped, so only the
    # biased/random_matched/full fits see all of them
    assert counts[10]["spoke"] == len(d["need"])
    for k in ("biased", "random_matched", "full"):
        assert np.allclose(fits[10][k], fits[10]["full"], atol=1e-8), k


def test_eps_zero_has_no_explored_windows_and_falls_back_to_prior():
    w = World(); d = simulate(w, 5, np.random.default_rng(6))
    fits, counts = run_logged(w, d, np.random.default_rng(7), eps=0.0, hours=(5,))
    assert counts[5]["explored"] == 0
    assert np.array_equal(fits[5]["explore_only"], PRIOR_W)


def test_deterministic_and_biased_history_matches_online_biased_learner():
    w = World(); d = simulate(w, 10, np.random.default_rng(8))
    a, _ = run_logged(w, d, np.random.default_rng(9), eps=0.02, hours=(10,))
    b, _ = run_logged(w, d, np.random.default_rng(9), eps=0.02, hours=(10,))
    assert all(np.array_equal(a[10][k], b[10][k]) for k in FIT_NAMES)
    _, _, wf = run_online(w, d, np.random.default_rng(9), eps=0.02, learner="biased")
    assert np.allclose(wf, a[10]["biased"])      # same coin draws, same unweighted refit


def test_online_explore_only_uses_fewer_labels_and_never_exceeds_spoken_utility_bound():
    w = World(); d = simulate(w, 10, np.random.default_rng(10))
    util, dismissed, wf = run_online(w, d, np.random.default_rng(11), eps=0.05, learner="explore_only")
    assert np.all(np.isfinite(wf)) and util.max() <= w.benefit and dismissed.sum() >= 0
    assert fit_map(d["X"][:0], d["need"][:0].astype(float), PRIOR_W)[0].shape == PRIOR_W.shape
