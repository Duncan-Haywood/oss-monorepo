"""Checks of the milestone-6 fresh-item test's helpers on synthetic data (no GSS download)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_fresh', HERE / 'experiments' / 'm6_fresh_items' / 'run.py')
fi = importlib.util.module_from_spec(_sp); sys.modules['m6_fresh'] = fi; _sp.loader.exec_module(fi)


def test_no_fresh_item_is_an_old_target_or_a_model_feature():
    srcs = {v[0] for v in fi.ALL_FRESH.values()}
    old = {v[0] for v in {**fi.gss.TARGETS, **fi.gss.CATHOLIC_ONLY}.values()}
    assert not srcs & old
    assert not srcs & set(fi.gss.DEMOG + fi.gss.ITEMS)
    assert not set(fi.ALL_FRESH) & set(fi.gss.DEMOG + fi.gss.ITEMS)


def test_recode_keeps_missing_and_codes_teaching_consistent_answer():
    d = pd.DataFrame({c: [np.nan] * 5 for c in {v[0] for v in fi.ALL_FRESH.values()}})
    d['cappun'] = [1, 2, np.nan, 1, 2]
    d['pillok'] = [1, 2, 3, 4, np.nan]
    d['teensex'] = [1, 2, 5, 4, 1]
    r = fi.recode_fresh(d)
    assert r.deathpen_oppose.tolist()[:2] == [0.0, 1.0] and np.isnan(r.deathpen_oppose[2])
    assert r.teen_pill_no.tolist()[:4] == [0.0, 0.0, 1.0, 1.0]
    assert np.isnan(r.teensex_wrong[2])  # 'other' is not an answer
    assert r.teensex_wrong[0] == 1.0 and r.teensex_wrong[3] == 0.0


def test_eligible_needs_two_cells_and_every_cell_big_enough():
    cells = pd.DataFrame({'family': ['f', 'f', 'g'], 'item': ['i', 'i', 'i'], 'pair': ['a', 'b', 'c'],
                          'N': [1000, 150, 5000]})
    el = fi.eligible(cells, (50, 100))
    assert ('a', 'i', 50) in el and ('b', 'i', 50) in el
    assert not [e for e in el if e[2] == 100]  # b has N // 2 = 75 < 100, so the whole family drops
    assert not [e for e in el if e[0] == 'c']  # family g has one cell


def test_rule_copies_the_kinds_prior():
    g = pd.DataFrame({'kind': ['period', 'generation', 'tradition']})
    for a in ('P0', 'COL', 'ADD'):
        for key in ('m', 'tau2', 'mse', 'cov_naive', 'cov_robust', 'hw_robust'):
            g[f'{key}_{a}'] = {'P0': 0.0, 'COL': 1.0, 'ADD': 2.0}[a]
    r = fi.apply_rule(g)
    assert r.mse_RULE.tolist() == [1.0, 0.0, 2.0]
