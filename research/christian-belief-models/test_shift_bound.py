"""Checks of the milestone-6 decomposition helpers on hand-built data (no GSS download needed)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_shift', HERE / 'experiments' / 'm6_shift_bound' / 'run.py')
sb = importlib.util.module_from_spec(_sp); sys.modules['m6_shift'] = sb; _sp.loader.exec_module(sb)


def test_intercept_shift_hits_target_share():
    rng = np.random.default_rng(0)
    p, w = rng.uniform(0.1, 0.9, 500), rng.uniform(0.5, 2, 500)
    d = sb.intercept_shift(p, w, 0.7)
    assert np.average(sb.sigmoid(sb.logit(p) + d), weights=w) == pytest.approx(0.7, abs=1e-6)


def test_intercept_shift_zero_when_calibrated():
    p, w = np.full(10, 0.3), np.ones(10)
    assert sb.intercept_shift(p, w, 0.3) == pytest.approx(0.0, abs=1e-6)


def test_signed_offset_flips_negatively_related_items():
    # item 1 shifted +1 and positively related; item 2 shifted -1 and negatively related: both say +1
    assert sb.signed_offset([1.0, -1.0], [0.5, -0.5]) == pytest.approx(1.0)
    assert sb.signed_offset([1.0], [0.0]) == 0.0


def test_wcorr_sign_and_scale():
    a = np.arange(10.0)
    assert sb.wcorr(a, 2 * a + 1, np.ones(10)) == pytest.approx(1.0)
    assert sb.wcorr(a, -a, np.ones(10)) == pytest.approx(-1.0)


def test_iw_residual_recovers_covariate_shift_misfit():
    # Source x ~ U{0,1}; model predicts 0.5 everywhere but p(y|x) = x. Target has x = 1 in 90%.
    # Then A = E_T[f - p_S] = 0.5 - 0.9 = -0.4, and E_S[r (f - y)] with r = dT/dS recovers it.
    x = np.r_[np.zeros(5000), np.ones(5000)]
    y = x.copy()
    f = np.full_like(x, 0.5)
    r = np.where(x == 1, 0.9 / 0.5, 0.1 / 0.5)
    assert sb.iw_residual(f, y, np.ones_like(x), r) == pytest.approx(-0.4)


def test_density_ratio_from_balanced_classifier():
    # P(T|x) = 0.75 under equal group totals means dT/dS = 3; the clip keeps the largest finite
    r = sb.density_ratio(np.array([0.75, 0.5, 0.25]), 1.0, 1.0, clip_q=1.0)
    assert r == pytest.approx([3.0, 1.0, 1 / 3])
