#!/usr/bin/env python3
"""Summarise results/mixture.csv against the earlier held-out-year variants (same item-years).

    python3 experiments/m3_mixture/summarise.py      # writes results/summary.md, prints it

Joins plain logit/hgb, hgb_shift, decade and interpolation (m3_period_shift), mice_logreg and its
Rubin intervals (m3_mice), then puts the drift-aware leave-one-item-out conformal interval of
m3_drift_intervals around the mixture's share, with the same scales. Errors are absolute
differences from the held-out year's observed weighted share, in percentage points.
"""
import importlib.util, sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
_sp = importlib.util.spec_from_file_location('m3_drift', EXP / 'm3_drift_intervals' / 'run.py')
di = importlib.util.module_from_spec(_sp); sys.modules['m3_drift'] = di; _sp.loader.exec_module(di)

METHODS = ['dpmpm', 'dpmpm_rb', 'mice_logreg', 'logit_plain', 'hgb_plain', 'hgb_shift', 'decade', 'interp',
           'combo', 'combo_dpmpm']
FAST = di.FAST


def table():
    x = pd.read_csv(HERE / 'results' / 'mixture.csv')
    ps = pd.read_csv(EXP / 'm3_period_shift' / 'results' / 'period_shift.csv')
    mi = pd.read_csv(EXP / 'm3_mice' / 'results' / 'mice.csv')
    k = ['target', 'year']
    d = x.merge(ps[k + ['decade', 'interp', 'logit_plain', 'hgb_plain', 'hgb_shift']], on=k, how='inner')
    d = d.merge(mi[k + ['mice_logreg', 'mice_logreg_se', 'mice_logreg_covers']], on=k, how='inner')
    d['combo'] = (d.interp + d.hgb_shift) / 2
    d['combo_dpmpm'] = (d.interp + d.dpmpm) / 2
    return di.add_scales(d.sort_values(k).reset_index(drop=True))


def conformal(d, m, sc, alpha=di.ALPHA):
    err = (d[m] - d.observed).abs()
    score = err / d['scale_' + sc]
    hw = np.empty(len(d))
    for g in d.target.unique():
        own = (d.target == g).values
        hw[own] = di.conformal_q(score[~own], alpha) * d.loc[own, 'scale_' + sc].values
    return hw, (err <= hw).astype(int)


def main():
    d = table()
    e = pd.DataFrame({c: (d[c] - d.observed).abs() * 100 for c in METHODS}).assign(target=d.target)
    out = [f'# Milestone 3: Bayesian mixture (DPMPM) imputation of held-out survey years '
           f'(Catholics, {len(d)} item-years, {d.target.nunique()} items)', '',
           f'K = {d.K.iloc[0]} classes; occupied classes per run: median {d.occupied_mean.median():.0f}, '
           f'max {d.occupied_max.max()}; m = {d.m.iloc[0]} imputations; total sampler time '
           f'{d.seconds.sum() / 60:.0f} CPU-minutes.', '',
           'Mean absolute error of the imputed share against the held-out year\'s observed weighted share, points.', '',
           '| method | mean | median | closer than interp |', '|---|---:|---:|---:|']
    for c in METHODS:
        out.append(f'| {c} | {e[c].mean():.2f} | {e[c].median():.2f} | {(e[c] < e.interp).mean():.0%} |')
    out += ['', f'dpmpm closer than mice_logreg on {(e.dpmpm < e.mice_logreg).mean():.0%} of item-years, '
            f'than plain hgb on {(e.dpmpm < e.hgb_plain).mean():.0%}. Mean signed error of dpmpm '
            f'{((d.dpmpm - d.observed) * 100).mean():+.2f} points.', '',
            '95% intervals (coverage overall, worst item, same-sex marriage, same-sex relations; median half-width; '
            'mean Winkler score, points):', '',
            '| interval | coverage | worst item | same-sex marriage | same-sex relations | half-width | Winkler |',
            '|---|---:|---:|---:|---:|---:|---:|']

    def row(name, hw, cov, centre):
        per = cov.groupby(d.target).mean()
        wk = di.winkler(centre - hw, centre + hw, d.observed).mean() * 100
        out.append(f'| {name} | {cov.mean():.1%} | {per.min():.0%} ({per.idxmin()}) | {per[FAST[0]]:.0%} | '
                   f'{per[FAST[1]]:.0%} | {np.median(hw) * 100:.1f} | {wk:.1f} |')

    row('dpmpm, Rubin', 1.96 * d.dpmpm_se, d.dpmpm_covers, d.dpmpm)
    row('mice_logreg, Rubin (m3_mice)', 1.96 * d.mice_logreg_se, d.mice_logreg_covers, d.mice_logreg)
    for m in ('dpmpm', 'combo_dpmpm', 'hgb_shift', 'combo'):
        for sc in ('const', 'drift'):
            hw, cov = conformal(d, m, sc)
            row(f'{m}, conformal {sc}', pd.Series(hw), cov, d[m])
    out += ['', '| item | n years | dpmpm | dpmpm_rb | mice_logreg | hgb | interp | dpmpm Rubin covers | '
            'median Rubin half-width |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for g, x in e.groupby('target'):
        dd = d[d.target == g]
        out.append(f'| {g} | {len(x)} | {x.dpmpm.mean():.1f} | {x.dpmpm_rb.mean():.1f} | {x.mice_logreg.mean():.1f} | '
                   f'{x.hgb_plain.mean():.1f} | {x.interp.mean():.1f} | {dd.dpmpm_covers.mean():.0%} | '
                   f'{(1.96 * dd.dpmpm_se).median() * 100:.1f} |')
    txt = '\n'.join(out) + '\n'
    (HERE / 'results' / 'summary.md').write_text(txt)
    print(txt)


if __name__ == '__main__':
    main()
