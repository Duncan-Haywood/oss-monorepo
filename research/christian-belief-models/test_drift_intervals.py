"""Checks of the drift-aware conformal helpers on hand-built data (no GSS download needed)."""
import importlib.util
import math
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m3_drift', HERE / 'experiments' / 'm3_drift_intervals' / 'run.py')
di = importlib.util.module_from_spec(_sp); sys.modules['m3_drift'] = di; _sp.loader.exec_module(di)


def test_drift_interior_uses_both_neighbours():
    # neighbours 2000 (0.5) and 2010 (0.3): rate 0.02/yr, nearest is 2 years away
    assert di.drift_scale([1990, 2000, 2010], [0.9, 0.5, 0.3], 2002) == pytest.approx(0.04)


def test_drift_end_of_run_uses_two_nearest_same_side():
    # last year 2020; the two nearest earlier asked years are 2010 (0.3) and 2000 (0.5)
    assert di.drift_scale([1990, 2000, 2010], [0.9, 0.5, 0.3], 2020) == pytest.approx(0.2)


def test_drift_single_neighbour_is_zero():
    assert di.drift_scale([2000], [0.5], 2010) == 0.0


def test_conformal_quantile_rank():
    cal = np.arange(1, 20)  # N = 19, ceil(20 * 0.95) = 19 -> the largest score
    assert di.conformal_q(cal, 0.05) == 19
    assert di.conformal_q(np.arange(1, 10), 0.05) == math.inf  # N = 9: ceil(9.5) = 10 > 9
    assert di.conformal_q(np.arange(1, 11), 0.5) == 6  # ceil(11 * 0.5) = 6


def test_interval_score():
    assert di.winkler(0.4, 0.6, 0.5, 0.05) == pytest.approx(0.2)
    assert di.winkler(0.4, 0.6, 0.7, 0.05) == pytest.approx(0.2 + 40 * 0.1)


def test_leave_one_item_out_never_uses_own_scores():
    # item 'b' has huge errors; its width must come from item 'a' alone, so it under-covers
    rows = [dict(target='a', year=2000 + i, n=1000, observed=0.5, s=0.0, d=0.0) for i in range(30)]
    rows += [dict(target='b', year=2000 + i, n=1000, observed=0.5, s=0.0, d=0.0) for i in range(5)]
    d = pd.DataFrame(rows)
    for m in di.METHODS:
        d[m] = 0.5 + np.where(d.target == 'a', 0.01, 0.3)
    for sc in di.SCORES:
        d['scale_' + sc] = 1.0
    e = di.intervals(d)
    assert e.loc[e.target == 'b', 'hgb_shift_const_covers'].sum() == 0
    assert e.loc[e.target == 'a', 'hgb_shift_const_covers'].all()
