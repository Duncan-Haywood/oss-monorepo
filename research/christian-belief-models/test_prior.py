"""Checks of the milestone-6 prior helpers on synthetic matrices (no GSS download)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_prior', HERE / 'experiments' / 'm6_prior' / 'run.py')
pr = importlib.util.module_from_spec(_sp); sys.modules['m6_prior'] = pr; _sp.loader.exec_module(pr)


def _matrix(rng, n=6, k=5, noise=0.0):
    r, c = rng.normal(0, .05, n), rng.normal(0, .05, k)
    M = 0.01 + r[:, None] + c[None, :] + noise * rng.standard_normal((n, k))
    B = pd.DataFrame(M, index=[f'p{i}' for i in range(n)], columns=[f'i{j}' for j in range(k)])
    return B, {p: 'a' for p in B.index}


def test_additive_fit_recovers_a_held_out_cell_of_an_additive_matrix():
    B, kinds = _matrix(np.random.default_rng(0))
    truth = B.loc['p2', 'i3']
    Bh = B.copy(); Bh.loc['p2', 'i3'] = np.nan
    assert pr.pred_add(Bh, kinds, 'p2', 'i3') == pytest.approx(truth, abs=1e-6)


def test_hard_impute_fits_observed_cells_and_recovers_column_effects():
    # a rank-1 matrix: the rank-2 fit of its column-centred form reproduces every observed cell
    # (the missing cell is not identified there, since centring adds a rank; checked 2026-11-15)
    rng = np.random.default_rng(1)
    M = np.outer(rng.normal(0, 1, 8), rng.normal(0, 1, 6))
    Mh = M.copy(); Mh[3, 2] = np.nan
    L = pr.hard_impute(Mh, rank=2, iters=500)
    assert np.abs((L - M)[~np.isnan(Mh)]).max() < 1e-8
    # pure column effects: the missing cell is its column's value
    C = np.tile(rng.normal(0, 1, 6), (8, 1))
    Ch = C.copy(); Ch[3, 2] = np.nan
    assert pr.hard_impute(Ch)[3, 2] == pytest.approx(C[3, 2], abs=1e-8)


def test_col_prior_uses_only_the_same_kind_and_skips_the_target():
    B = pd.DataFrame({'x': [0.1, 0.3, 9.0, 0.5]}, index=['a', 'b', 'c', 'd'])
    kinds = {'a': 'k', 'b': 'k', 'c': 'other', 'd': 'k'}
    assert pr.pred_col(B, kinds, 'a', 'x') == pytest.approx(0.4)


def test_priors_never_see_the_target_cell():
    B, kinds = _matrix(np.random.default_rng(2), noise=0.02)
    out1 = pr.priors_for(B, kinds, 'p1', 'i1')
    B2 = B.copy(); B2.loc['p1', 'i1'] = 5.0
    out2 = pr.priors_for(B2, kinds, 'p1', 'i1')
    for name in out1:
        assert out1[name] == pytest.approx(out2[name])


def test_p0_tau2_is_mean_square_of_other_items():
    B = pd.DataFrame({'x': [0.1, 0.2], 'y': [0.3, 0.4]}, index=['a', 'b'])
    kinds = {'a': 'k', 'b': 'k'}
    assert pr.priors_for(B, kinds, 'a', 'x')['P0'][1] == pytest.approx((0.09 + 0.16) / 2)


def test_a_perfect_prior_mean_leaves_only_variance():
    st = pr.group_stats(b=0.1, sd=0.45, n=50, m=0.1, tau2=0.002)
    v = 0.45 ** 2 / 50
    g = 0.002 / (0.002 + v)
    assert st['mse'] == pytest.approx(g ** 2 * v)
