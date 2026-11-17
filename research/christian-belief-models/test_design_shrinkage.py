"""Checks of the milestone-6 population-share scoring of the shrinkage estimator (no GSS download)."""
import importlib.util
import math
import sys
from pathlib import Path
import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_ds', HERE / 'experiments' / 'm6_design_shrinkage' / 'run.py')
ds = importlib.util.module_from_spec(_sp); sys.modules['m6_ds'] = ds; _sp.loader.exec_module(ds)


def test_no_phase1_error_reduces_to_sample_share():
    st = ds.row_stats(b=0.04, m=0.01, sd=0.45, n=100, tau2=0.003, Vy=0.0, Vf=0.0, C=0.0)
    assert st['mse_pop'] == pytest.approx(st['mse_samp'])
    assert st['mse_D_pop'] == pytest.approx(st['mse_D_samp'])
    assert st['cov_rob_pop'] == pytest.approx(st['cov_rob_samp'])
    assert st['mse_pop_des'] == pytest.approx(st['mse_pop'])


def test_population_error_matches_monte_carlo():
    """FH - theta simulated from correlated phase-1 errors and an independent phase-2 error."""
    b, m, sd, n, tau2 = 0.05, 0.0, 0.45, 50, 0.003
    Vy, Vf, rho = 4e-4, 2e-4, 0.6
    C = rho * math.sqrt(Vy * Vf)
    rng = np.random.default_rng(1)
    K = 400_000
    e = rng.multivariate_normal([0, 0], [[Vy, C], [C, Vf]], K)
    v = sd ** 2 / n
    delta = rng.normal(0, math.sqrt(v), K)
    g = tau2 / (tau2 + v)
    # E0 - theta = b + eps_f; D - theta = eps_y + delta
    fh = (1 - g) * (b - m + e[:, 1]) + g * (e[:, 0] + delta)
    mu, s, _, _ = ds.pop_error(b, m, sd, n, tau2, Vy, Vf, C)
    assert fh.mean() == pytest.approx(mu, abs=2e-4)
    assert fh.std() == pytest.approx(s, rel=5e-3)
    st = ds.row_stats(b, m, sd, n, tau2, Vy, Vf, C)
    h = st['hw_rob']
    assert (np.abs(fh) <= h).mean() == pytest.approx(st['cov_rob_pop'], abs=3e-3)
    assert st['mse_D_pop'] == pytest.approx(v + Vy)


def test_phase1_error_lowers_d_coverage_and_design_interval_restores_it():
    st = ds.row_stats(b=0.0, m=0.0, sd=0.5, n=400, tau2=0.002, Vy=3e-4, Vf=1e-4, C=1e-4)
    assert st['cov_D_pop'] < 0.95
    assert st['cov_D_des'] == pytest.approx(0.95, abs=1e-6)
    assert st['hw_rob_des'] > st['hw_rob']
