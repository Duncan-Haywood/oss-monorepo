"""The paper's figures plot the same numbers the text quotes (paper/figures.py --check).

Reads only committed experiment CSVs; no GSS download and no matplotlib needed."""
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('paper_figures', HERE / 'paper' / 'figures.py')
fg = importlib.util.module_from_spec(_sp); sys.modules['paper_figures'] = fg; _sp.loader.exec_module(fg)


def test_every_figure_number_matches_the_paper():
    assert fg.run_checks() == []


def test_decomposition_is_exact_in_every_cell():
    _, ch = fg.data_decomposition()
    assert ch['max |A + B - b|'] < 1e-9


def test_crossover_interpolates_where_the_ratio_crosses_one():
    import pandas as pd
    g = pd.DataFrame({'n': [25, 50, 100], 'rmse_D': [0.2, 0.1, 0.05], 'abs_bias_E0': [0.1] * 3})
    assert abs(fg.crossover(g) - 50) < 1e-9
    g2 = g.assign(rmse_D=[0.05, 0.04, 0.03])
    assert fg.crossover(g2) is None


def test_every_figure_has_both_formats_committed():
    for stem in ('fig1_decomposition', 'fig2_nstar', 'fig3_budget', 'fig4_coverage', 'fig5_priors',
                 'fig6_design'):
        for ext in ('pdf', 'svg'):
            assert (HERE / 'paper' / 'figures' / f'{stem}.{ext}').stat().st_size > 5000
