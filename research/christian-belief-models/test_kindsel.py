"""Checks of the milestone-6 per-kind prior selection on synthetic matrices (no GSS download)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_kindsel', HERE / 'experiments' / 'm6_kindsel' / 'run.py')
ks = importlib.util.module_from_spec(_sp); sys.modules['m6_kindsel'] = ks; _sp.loader.exec_module(ks)


def _two_kinds(rng):
    """Kind 'a': a shared item effect (column mean predicts each cell). Kind 'b': pure noise around 0."""
    items = [f'i{j}' for j in range(6)]
    c = rng.normal(0, .1, len(items))
    a = pd.DataFrame(c[None, :] + .005 * rng.standard_normal((4, 6)), index=[f'a{i}' for i in range(4)], columns=items)
    b = pd.DataFrame(.01 * rng.standard_normal((4, 6)), index=[f'b{i}' for i in range(4)], columns=items)
    B = pd.concat([a, b])
    return B, {p: p[0] for p in B.index}


def test_loo_errors_never_include_the_held_out_column_and_p0_error_is_b_squared():
    B, kinds = _two_kinds(np.random.default_rng(1))
    e = ks.loo_errors(B, kinds, 'i2')
    assert 'i2' not in set(e.item)
    assert len(e) == B.shape[0] * (B.shape[1] - 1)
    r = e.iloc[0]
    assert np.isclose(r['err_P0'], B.loc[r['pair'], r['item']] ** 2)


def test_choose_picks_an_informative_prior_for_shared_effects_and_p0_for_noise():
    B, kinds = _two_kinds(np.random.default_rng(2))
    ch = ks.choose(ks.loo_errors(B, kinds, 'i0'))
    assert ch['a'] in ('COL', 'ADD', 'LR')
    assert ch['b'] == 'P0'


def test_apply_choice_copies_the_chosen_columns():
    g = pd.DataFrame({'item': ['x', 'x'], 'kind': ['a', 'b']})
    for key in ('m', 'tau2', 'mse', 'cov_naive', 'cov_robust', 'hw_robust'):
        for a in ks.CANDIDATES:
            g[f'{key}_{a}'] = [hash((key, a, 0)) % 97, hash((key, a, 1)) % 97]
    out = ks.apply_choice(g, {('x', 'a'): 'ADD', ('x', 'b'): 'P0'})
    assert list(out.ksel) == ['ADD', 'P0']
    assert out.mse_KSEL.tolist() == [g.mse_ADD[0], g.mse_P0[1]]
