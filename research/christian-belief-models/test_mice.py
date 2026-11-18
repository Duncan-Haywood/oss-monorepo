"""Checks of the MICE helpers on hand-built data (no GSS download needed)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

pytest.importorskip('sklearn')
HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m3_mice', HERE / 'experiments' / 'm3_mice' / 'run.py')
mice = importlib.util.module_from_spec(_sp); sys.modules['m3_mice'] = mice; _sp.loader.exec_module(mice)


def test_wmean_var_equal_weights():
    v = np.array([0., 1., 1., 0.])
    q, u = mice.wmean_var(v, np.ones(4))
    assert q == pytest.approx(0.5)
    assert u == pytest.approx(0.25 / 4)  # p(1-p)/n


def test_wmean_var_kish_neff():
    v, w = np.array([0., 1.]), np.array([1., 3.])
    q, u = mice.wmean_var(v, w)
    assert q == pytest.approx(0.75)
    neff = 16 / 10
    assert u == pytest.approx(0.75 * 0.25 / neff)


def test_rubin_total_variance():
    Q, se, sb = mice.rubin([0.4, 0.5, 0.6], [0.01, 0.01, 0.01])
    assert Q == pytest.approx(0.5)
    assert sb == pytest.approx(0.1)
    assert se ** 2 == pytest.approx(0.01 + (1 + 1 / 3) * 0.01)


def test_design_onehot_keeps_missing_and_target_last():
    df = pd.DataFrame({'race': [1, 2, 3, np.nan], 'age': [20., np.nan, 40., 50.], 'attend_weekly': [1., 0., np.nan, 1.]})
    X, y = mice.design(df, ['race', 'age'], 'attend_weekly')
    assert X.shape == (4, 3)  # race 2, race 3 (race 1 is the reference), age
    assert np.isnan(X[3, :2]).all() and not np.isnan(X[3, 2])
    assert np.isnan(X[1, 2])
    assert list(X[1, :2]) == [1., 0.]
    assert np.isnan(y[2]) and y[0] == 1
