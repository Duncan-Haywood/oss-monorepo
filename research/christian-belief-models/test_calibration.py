"""Checks of the milestone-6 calibration-subsample estimators on synthetic data (no GSS download)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_cal', HERE / 'experiments' / 'm6_calibration' / 'run.py')
cal = importlib.util.module_from_spec(_sp); sys.modules['m6_cal'] = cal; _sp.loader.exec_module(cal)


def _population(N=4000, shift=0.8, seed=0):
    """Target where the transferred model ranks well but is off by a logit shift (concept shift)."""
    rng = np.random.default_rng(seed)
    z = rng.normal(0, 1.5, N)
    y = (rng.random(N) < cal.sb.sigmoid(z + shift)).astype(float)
    f = cal.sb.sigmoid(z)
    return y, f, np.ones(N)


def test_logit_shift_rows_hits_targets():
    rng = np.random.default_rng(1)
    z, w = rng.normal(size=(3, 200)), rng.uniform(0.5, 2, (3, 200))
    t = np.array([0.2, 0.5, 0.9])
    d = cal.logit_shift_rows(z, w, t)
    got = (w * cal.sb.sigmoid(z + d[:, None])).sum(1) / w.sum(1)
    assert got == pytest.approx(t, abs=1e-6)


def test_wvar_mean_rows_matches_srs_formula_unweighted():
    x = np.array([[0.0, 1.0, 1.0, 0.0, 1.0]])
    v = cal.wvar_mean_rows(x, np.ones_like(x))
    assert v[0] == pytest.approx(x.var(ddof=1) / 5)


def test_ppi_lambda_is_one_for_calibrated_slope():
    f = np.tile(np.linspace(0.1, 0.9, 50), (2, 1))
    assert cal.ppi_lambda(f.copy(), f, np.ones_like(f), 50, 1e9) == pytest.approx([1.0, 1.0])


def test_difference_estimator_unbiased_and_beats_mean():
    y, f, w = _population()
    theta = y.mean()
    r = cal.simulate(y, f, w, 100, 2000, np.random.default_rng(2))
    assert abs(r['D'].mean() - theta) < 0.004            # design-unbiased despite a biased model
    assert abs(r['M'].mean() - theta) < 0.004
    assert r['D'].std() < r['M'].std()                     # predictive model shrinks the variance
    # sd of D matches the analytic sqrt(var(y - f) / n * fpc) within 10%
    assert r['D'].std() == pytest.approx(np.sqrt((y - f).var() / 100 * (1 - 100 / len(y))), rel=0.1)


def test_wald_interval_covers_near_nominal():
    y, f, w = _population(seed=3)
    r = cal.simulate(y, f, w, 200, 2000, np.random.default_rng(4))
    for e in ('M', 'D'):
        cover = np.mean(np.abs(r[e] - y.mean()) <= r[f'h{e}'])
        assert 0.93 <= cover <= 0.97
