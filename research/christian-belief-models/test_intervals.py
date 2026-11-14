"""Checks of the milestone-6 interval helpers on synthetic cases (no GSS download)."""
import importlib.util
import math
import sys
from pathlib import Path
import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_int', HERE / 'experiments' / 'm6_intervals' / 'run.py')
iv = importlib.util.module_from_spec(_sp); sys.modules['m6_int'] = iv; _sp.loader.exec_module(iv)


def test_cva_without_bias_is_the_normal_quantile():
    assert iv.cva(0.0) == pytest.approx(1.959964, abs=1e-4)


def test_cva_is_at_least_the_parametric_critical_value():
    # a normal bias distribution with E b^2 = m2 is one admissible distribution, and it needs
    # z sqrt(1 + m2); the worst case over all distributions needs at least that
    for m2 in (0.1, 0.5, 1.0, 4.0, 25.0):
        assert iv.cva(m2) >= iv.Z95 * math.sqrt(1 + m2) - 1e-3


def test_rho_bounds_any_two_point_bias_distribution():
    rng = np.random.default_rng(0)
    m2, chi = 0.7, iv.cva(0.7)
    assert iv.rho(m2, chi) == pytest.approx(0.05, abs=1e-6)
    for _ in range(200):
        t1, t2 = sorted(rng.uniform(0, 30, 2))
        if not t1 <= m2 <= t2 or t2 == t1:
            continue
        p = (t2 - m2) / (t2 - t1)          # mass at t1, so the mean is m2
        avg = p * iv.noncov(t1, chi) + (1 - p) * iv.noncov(t2, chi)
        assert avg <= 0.05 + 1e-6


def test_cover_matches_monte_carlo():
    rng = np.random.default_rng(1)
    e = 0.3 + 0.5 * rng.standard_normal(400_000)
    assert iv.cover(0.8, 0.3, 0.5) == pytest.approx((np.abs(e) <= 0.8).mean(), abs=3e-3)


def test_interval_stats_unbiased_group_and_known_limits():
    # no bias: the naive FH interval is the posterior interval and over-covers given b = 0
    st = iv.interval_stats(b=0.0, sd=0.45, n=50, tau2=0.004)
    assert st['cov_D'] == pytest.approx(0.95, abs=1e-6)
    assert st['cov_FH_naive'] > 0.95 and st['hw_FH_naive'] < st['hw_D']
    # a bias far beyond tau: the naive interval undercovers badly, the robust one less so
    st = iv.interval_stats(b=0.15, sd=0.45, n=50, tau2=0.002)
    assert st['cov_FH_naive'] < 0.5 and st['cov_FH_robust'] > st['cov_FH_naive']
    assert st['hw_FH_robust'] > st['hw_FH_naive']


def test_rmse_analytic_matches_formula():
    st = iv.interval_stats(b=0.05, sd=0.4, n=100, tau2=0.0025)
    v = 0.4 ** 2 / 100
    g = 0.0025 / (0.0025 + v)
    assert st['rmse_analytic'] == pytest.approx(math.sqrt(((1 - g) * 0.05) ** 2 + g ** 2 * v))


def test_tau2_table_excludes_the_item_itself():
    import pandas as pd
    cells = pd.DataFrame(dict(kind=['a', 'a', 'a', 'b'], item=['x', 'y', 'y', 'x'],
                              bias=[0.1, 0.2, 0.0, 0.3]))
    t = iv.tau2_table(cells)
    assert t[('a', 'x')] == pytest.approx((0.04 + 0.0) / 2)
    assert t[('a', 'y')] == pytest.approx(0.01)
