"""Tests for experiments/m5_local_llm (pure helpers; no model or GSS file needed)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'experiments' / 'm5_local_llm'))
import sample  # noqa: E402


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'experiments' / 'm5_local_llm' / f'{name}.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_cell_metrics_constant_and_perfect():
    a = _load('analyse')
    y = np.array([0., 1, 1, 0, 1])
    w = np.ones(5)
    r = a.cell_metrics(y, 0.6, w)
    assert np.isnan(r['auc']) and abs(r['err']) < 1e-12 and abs(r['var_ratio'] - 1) < 1e-12
    r = a.cell_metrics(y, y, w)
    assert r['auc'] == 1 and r['var_ratio'] == 0


def test_platt_recovers_shift():
    a = _load('analyse')
    rng = np.random.default_rng(1)
    z = rng.normal(size=20000)
    p_true = 1 / (1 + np.exp(-(0.5 + 2 * z)))
    y = (rng.random(20000) < p_true).astype(float)
    f = a.platt(1 / (1 + np.exp(-z)), y, np.ones_like(y))
    assert abs(f(np.array([0.5]))[0] - 1 / (1 + np.exp(-0.5))) < 0.03


def test_boot_median_paired():
    a = _load('analyse')
    m, lo, hi, n = a.boot_median([1, 2, 3, np.nan], 200, np.random.default_rng(0), paired=[0, 0, 0, 0])
    assert m == 2 and n == 3 and lo <= m <= hi


def test_draw_is_a_simple_random_sample_per_group():
    n = 5000
    rng = np.random.default_rng(2)
    d = pd.DataFrame(dict(tradition=rng.choice(sample.TRADS + ['Other'], n), generation=rng.choice([1, 2, 3], n),
                          hispanic_any=rng.choice([0., 1.], n), year=rng.choice([2000, 2018], n)))
    p = sample.draw(d, per_group=50)
    assert (p.filter(like='in:').sum() == 50).all()
    assert (p.tradition != 'Other').all()
    cat = p[p['in:Catholic gen1']]
    assert (cat.tradition == 'Catholic').all() and (cat.generation == 1).all()


def test_profile_has_no_item_answers():
    llm = _load('llm')
    r = pd.Series(dict(year=2018, age=40, female=1, race=1, hispanic_any=0, generation=3, region=3, educ=16,
                       marital=1, childs=2, realinc=40000, polviews=4, partyid=3, tradition='Catholic',
                       reliten=1, raised_catholic=1, attend=8, premarsx=1))
    t = llm.profile(r)
    assert 'Catholic' in t and '2018' in t and 'attend' not in t.lower() and 'wrong' not in t.lower()


def test_scale_slope_and_loglinear():
    s = _load('scale')
    t = np.linspace(-0.3, 0.3, 40)
    assert abs(s.slope(t, 0.25 * t + 0.01) - 0.25) < 1e-12
    lo_hi = s.boot_slope(t, 0.25 * t, 200, np.random.default_rng(0))
    assert abs(lo_hi[0] - 0.25) < 1e-12 and abs(lo_hi[1] - 0.25) < 1e-9 and abs(lo_hi[2] - 0.25) < 1e-9
    a, b, n1 = s.loglinear([1.0, 2.0, 4.0], [0.1, 0.2, 0.3])
    assert abs(b - 0.1) < 1e-12 and abs(a - 0.1) < 1e-12 and abs(n1 - 2 ** 9) < 1e-6
    assert s.loglinear([1.0, 2.0], [0.3, 0.2])[2] == float('inf')
