"""Milestone 4l: the predicted-power computation, the AUC and the quartile gate on cases with known answers."""
import importlib.util, os
import numpy as np
import pytest
from scipy.stats import norm

EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "m4l_predict")


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


an = _load("m4l_analyse", "analyse.py")
sc = _load("m4l_score", "score.py")


def test_auc_known_cases():
    assert sc.auc([1, 2, 3, 4], [0, 0, 1, 1]) == 1.0
    assert sc.auc([4, 3, 2, 1], [0, 0, 1, 1]) == 0.0
    assert sc.auc([1, 1, 1, 1], [0, 1, 0, 1]) == 0.5
    assert np.isnan(sc.auc([1, 2], [0, 0]))


def test_top_quartile_takes_a_quarter_of_the_highest():
    pi = np.array([0.1, 0.9, 0.5, 0.7, 0.2, 0.3, 0.8, 0.4])
    tq = sc.top_quartile(pi)
    assert tq.sum() == 2 and set(np.flatnonzero(tq)) == {1, 6}


def test_sigma_hat_degrees_of_freedom():
    tw = dict(poses=np.zeros((13, 6)), rms=0.1)
    s, N, p = an.sigma_hat(tw, 54)
    assert N == 1404 and p == 4 + 72 + 161
    assert s == pytest.approx(0.1 * np.sqrt(1404 / 1167))


def test_predicted_power_matches_the_normal_case():
    """f_old and f_new Gaussian with known sd and R fixed at the true variance: the threshold is
    chi^2_1's 99th percentile and the power at a shift delta is the normal formula."""
    rng = np.random.default_rng(0)
    M, sd, f13 = 200_000, 1.0, 100.0
    F = rng.standard_normal((2, M)) * sd
    R = np.full((2, M), sd * sd)
    TW = (F.astype(np.float32), None, R.astype(np.float32))
    idx = {1: 0, 2: 1}
    out = an.predict(TW, TW, idx, idx, np.array([1]), np.array([2]), sig=1.0, f13=f13)
    assert out["qR"][0] == pytest.approx(6.635, rel=0.03)
    for s in (0.98, 1.02, 0.96):
        delta = abs(s - 1) * f13 / np.sqrt(2 * sd * sd)             # shift in sd of f_new - f_old
        var_ratio = np.sqrt((1 + s * s) / 2)                          # the test's variance includes s^2 R_new
        c = np.sqrt(out["qR"][0]) * var_ratio
        expect = norm.sf(c - delta) + norm.cdf(-c - delta)
        assert out[f"pi_{s}"][0] == pytest.approx(expect, abs=0.01)
    assert out["sd"][0] == pytest.approx(np.sqrt(2) / f13, rel=0.01)
