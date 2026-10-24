import numpy as np
from sensing_baoutlier import contaminate, run_trial


def test_contaminate_fraction_and_visibility():
    rng = np.random.default_rng(0)
    vis = rng.random((8, 400)) < 0.6
    uvs = np.zeros((8, 400, 2))
    out, mask = contaminate(uvs, vis, 0.1, rng)
    assert not mask[~vis].any()
    assert abs(mask.sum() / vis.sum() - 0.1) < 0.03
    assert (out[~mask] == 0).all() and (out[mask] != 0).any()


def test_zero_contamination_changes_nothing():
    rng = np.random.default_rng(1)
    vis = np.ones((4, 20), bool)
    uvs = rng.random((4, 20, 2))
    out, mask = contaminate(uvs, vis, 0.0, rng)
    assert not mask.any() and np.array_equal(out, uvs)


def test_mismatches_break_plain_adjustment_and_ransac_init_helps():
    r = run_trial(frac=0.05, seed=0, n_feat=300)
    assert r["linear"] > 10 * r["clean_ba"]
    assert r["ri_init"] < 0.5 * r["tri"]


def test_clean_data_robust_loss_costs_little():
    r = run_trial(frac=0.0, seed=1, n_feat=150)
    assert r["huber"] < 1.5 * r["clean_ba"] and r["cauchy"] < 2 * r["clean_ba"]
    assert r["ri_linear"] < 1.5 * r["clean_ba"]


def test_deterministic():
    assert run_trial(seed=2, n_feat=80) == run_trial(seed=2, n_feat=80)
