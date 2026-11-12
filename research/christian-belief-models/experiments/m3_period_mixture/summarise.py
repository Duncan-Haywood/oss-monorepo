#!/usr/bin/env python3
"""Summarise results/period_mixture_<period>.csv against the year-free mixture and the earlier variants.

    python3 experiments/m3_period_mixture/summarise.py      # writes results/summary.md, prints it

Joins each available arm (decade, half) onto m3_mixture's table (year-free dpmpm, MICE, plain models,
hgb_shift, decade mean, interpolation) on the same item-years. Errors are absolute differences from the
held-out year's observed weighted share, in percentage points. `same_period_n` is how many other asked
years of the item fall in the held-out year's period: where it is 0 the period variable carries nothing.
"""
import importlib.util, sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
_sp = importlib.util.spec_from_file_location('m3_mixture_sum', EXP / 'm3_mixture' / 'summarise.py')
ms = importlib.util.module_from_spec(_sp); sys.modules['m3_mixture_sum'] = ms; _sp.loader.exec_module(ms)
di, FAST = ms.di, ms.FAST
ARMS = [a for a in ('decade', 'half') if (HERE / 'results' / f'period_mixture_{a}.csv').exists()]


def table():
    d = ms.table()
    k = ['target', 'year']
    for a in ARMS:
        x = pd.read_csv(HERE / 'results' / f'period_mixture_{a}.csv')
        x = x[k + ['pmix', 'pmix_se', 'pmix_covers', 'pmix_rb', 'same_period_class_share', 'occupied_mean', 'seconds']]
        x = x.rename(columns={c: f'{c}_{a}' for c in x.columns if c not in k})
        d = d.merge(x, on=k, how='inner')
        width = 10 if a == 'decade' else 5
        p = d.year // width
        d[f'same_period_n_{a}'] = [int(((d.target == g) & (p == pp)).sum() - 1) for g, pp in zip(d.target, p)]
        d[f'combo_pmix_{a}'] = (d.interp + d[f'pmix_{a}']) / 2
    return d


def main():
    d = table()
    methods = [f'pmix_{a}' for a in ARMS] + [f'pmix_rb_{a}' for a in ARMS] + \
        ['dpmpm', 'mice_logreg', 'hgb_plain', 'hgb_shift', 'decade', 'interp', 'combo'] + [f'combo_pmix_{a}' for a in ARMS]
    e = pd.DataFrame({c: (d[c] - d.observed).abs() * 100 for c in methods}).assign(target=d.target)
    out = [f'# Milestone 3: period-aware mixture (DPMPM + survey period) on held-out survey years '
           f'(Catholics, {len(d)} item-years, {d.target.nunique()} items)', '']
    for a in ARMS:
        out.append(f'- `{a}` arm: occupied classes median {d[f"occupied_mean_{a}"].median():.0f}; sampler time '
                   f'{d[f"seconds_{a}"].sum() / 60:.0f} CPU-minutes; median share of the held-out year\'s respondents in '
                   f'classes mostly from their own period {d[f"same_period_class_share_{a}"].median():.0%}; '
                   f'{(d[f"same_period_n_{a}"] == 0).sum()} item-years have no other asked year in their period.')
    out += ['', 'Mean absolute error of the imputed share, points.', '',
            '| method | mean | median | closer than interp | closer than year-free dpmpm |', '|---|---:|---:|---:|---:|']
    for c in methods:
        out.append(f'| {c} | {e[c].mean():.2f} | {e[c].median():.2f} | {(e[c] < e.interp).mean():.0%} | '
                   f'{(e[c] < e.dpmpm).mean():.0%} |')
    for a in ARMS:
        s = d[f'same_period_n_{a}'] > 0
        out += ['', f'`{a}`, item-years with at least one other asked year in the period ({s.sum()}): pmix '
                f'{e.loc[s, f"pmix_{a}"].mean():.2f}, year-free dpmpm {e.loc[s, "dpmpm"].mean():.2f}, interp '
                f'{e.loc[s, "interp"].mean():.2f}; without ({(~s).sum()}): pmix {e.loc[~s, f"pmix_{a}"].mean():.2f}, '
                f'dpmpm {e.loc[~s, "dpmpm"].mean():.2f}.']
        diff = (e[f'pmix_{a}'] - e.dpmpm).values
        rng = np.random.default_rng(0)
        bs = [diff[rng.integers(0, len(diff), len(diff))].mean() for _ in range(2000)]
        out.append(f'Paired difference pmix_{a} minus year-free dpmpm: {diff.mean():+.2f} points '
                   f'(item-year bootstrap 95% interval {np.percentile(bs, 2.5):+.2f} to {np.percentile(bs, 97.5):+.2f}).')
    out += ['', '95% intervals (coverage overall, worst item, same-sex marriage, same-sex relations; median half-width; '
            'mean Winkler score, points):', '',
            '| interval | coverage | worst item | same-sex marriage | same-sex relations | half-width | Winkler |',
            '|---|---:|---:|---:|---:|---:|---:|']

    def row(name, hw, cov, centre):
        per = cov.groupby(d.target).mean()
        wk = di.winkler(centre - hw, centre + hw, d.observed).mean() * 100
        out.append(f'| {name} | {cov.mean():.1%} | {per.min():.0%} ({per.idxmin()}) | {per[FAST[0]]:.0%} | '
                   f'{per[FAST[1]]:.0%} | {np.median(hw) * 100:.1f} | {wk:.1f} |')

    row('dpmpm (year-free), Rubin', 1.96 * d.dpmpm_se, d.dpmpm_covers, d.dpmpm)
    for a in ARMS:
        row(f'pmix_{a}, Rubin', 1.96 * d[f'pmix_se_{a}'], d[f'pmix_covers_{a}'], d[f'pmix_{a}'])
    for m in [f'pmix_{a}' for a in ARMS] + [f'combo_pmix_{a}' for a in ARMS] + ['combo']:
        hw, cov = ms.conformal(d, m, 'drift')
        row(f'{m}, conformal drift', pd.Series(hw), cov, d[m])
    hdr = ' | '.join(f'pmix_{a}' for a in ARMS)
    out += ['', f'| item | n years | {hdr} | dpmpm | mice_logreg | hgb_shift | interp |',
            '|---|---:|' + '---:|' * (len(ARMS) + 4)]
    for g, x in e.groupby('target'):
        cells = ' | '.join(f'{x[f"pmix_{a}"].mean():.1f}' for a in ARMS)
        out.append(f'| {g} | {len(x)} | {cells} | {x.dpmpm.mean():.1f} | {x.mice_logreg.mean():.1f} | '
                   f'{x.hgb_shift.mean():.1f} | {x.interp.mean():.1f} |')
    txt = '\n'.join(out) + '\n'
    (HERE / 'results' / 'summary.md').write_text(txt)
    print(txt)


if __name__ == '__main__':
    main()
