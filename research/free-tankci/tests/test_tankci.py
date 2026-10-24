import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tankci import *  # noqa

SRC = os.path.join(os.path.dirname(__file__), "..", "..", "free-tanktwin", "experiments", "test_pred.npy")


def test_committed_predictions_reproduce_published_rmse():
    y, P = load(SRC)
    assert abs(rmse(P["twin (overflow)"], y) - 0.528) < 5e-4
    assert abs(rmse(P["linear ARX 4/4"], y) - 0.655) < 5e-4


def test_block_indices_are_contiguous_runs_of_right_length():
    ix = block_indices(100, 10, np.random.default_rng(1))
    assert len(ix) == 100 and ((np.diff(ix[:10]) % 100) == 1).all()


def test_identical_models_have_zero_gap():
    y = np.random.default_rng(0).normal(size=300)
    p = y + 0.3
    r = paired_gap(y, p, p, 10, n_boot=200)
    assert r["gap"] == 0 and r["lo"] == 0 and r["hi"] == 0


def test_interval_covers_most_true_gaps_for_iid_errors():
    hits = 0
    for seed in range(40):
        rng = np.random.default_rng(seed)
        y = np.zeros(600)
        r = paired_gap(y, rng.normal(0, 1.0, 600), rng.normal(0, 1.5, 600), 1, n_boot=300, seed=seed)
        hits += r["lo"] < 0.5 < r["hi"]  # true RMSE gap is 0.5
    assert hits >= 34  # nominal 95% of 40 is 38


def test_autocorr_time_of_white_noise_near_one_and_ar1_larger():
    rng = np.random.default_rng(0)
    w = rng.normal(size=4000)
    x = np.zeros(4000)
    for i in range(1, 4000):
        x[i] = 0.9 * x[i - 1] + w[i]
    assert error_autocorr_time(w) < 2.0
    assert 10 < error_autocorr_time(x) < 30  # theory (1+.9)/(1-.9)=19
