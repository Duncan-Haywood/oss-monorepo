#!/usr/bin/env python3
"""Summarise results/mice.csv against the earlier held-out-year variants (same item-years).

    python3 experiments/m3_mice/summarise.py      # writes results/summary.md, prints it

Joins plain logit, plain hgb and hgb_shift from m3_period_shift, hgb_w5 from m3_local_window, and
the decade and interpolation baselines. Errors are absolute differences between the imputed and the
observed weighted share of the held-out year, in percentage points.
"""
from pathlib import Path
import pandas as pd

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def table():
    m = pd.read_csv(HERE / 'results' / 'mice.csv')
    ps = pd.read_csv(EXP / 'm3_period_shift' / 'results' / 'period_shift.csv')
    lw = pd.read_csv(EXP / 'm3_local_window' / 'results' / 'local_window.csv')
    k = ['target', 'year']
    d = m.merge(ps[k + ['decade', 'interp', 'logit_plain', 'hgb_plain', 'hgb_shift']], on=k, how='inner')
    d = d.merge(lw[k + ['hgb_w5']], on=k, how='inner')
    return d


METHODS = ['mice_logreg', 'mice_norm', 'logit_plain', 'hgb_plain', 'hgb_shift', 'hgb_w5', 'decade', 'interp']


def errors(d):
    return pd.DataFrame({c: (d[c] - d.observed).abs() * 100 for c in METHODS}).assign(target=d.target, year=d.year)


def main():
    d = table()
    e = errors(d)
    out = [f'# Milestone 3: MICE on held-out survey years (Catholics, {len(d)} item-years)', '',
           'Mean absolute error of the imputed share against the held-out year\'s observed weighted share, points.', '',
           '| method | mean | median |', '|---|---:|---:|']
    for c in METHODS:
        out.append(f'| {c} | {e[c].mean():.2f} | {e[c].median():.2f} |')
    out += ['', f'mice_logreg closer than interp on {(e.mice_logreg < e.interp).mean():.0%} of item-years; '
            f'closer than plain hgb on {(e.mice_logreg < e.hgb_plain).mean():.0%}.', '',
            'Rubin 95% interval covers the observed share:', '']
    for c in ('mice_logreg', 'mice_norm'):
        out.append(f'- {c}: {d[c + "_covers"].mean():.1%} of item-years; median interval half-width '
                   f'{(1.96 * d[c + "_se"]).median() * 100:.1f} points, median between-imputation sd '
                   f'{d[c + "_sd_between"].median() * 100:.2f} points')
    out += ['', '| item | n years | mice_logreg | mice_norm | logit | hgb | interp | logreg covers |',
            '|---|---:|---:|---:|---:|---:|---:|---:|']
    for g, x in e.groupby('target'):
        cov = d.loc[d.target == g, 'mice_logreg_covers'].mean()
        out.append(f'| {g} | {len(x)} | {x.mice_logreg.mean():.1f} | {x.mice_norm.mean():.1f} | '
                   f'{x.logit_plain.mean():.1f} | {x.hgb_plain.mean():.1f} | {x.interp.mean():.1f} | {cov:.0%} |')
    txt = '\n'.join(out) + '\n'
    (HERE / 'results' / 'summary.md').write_text(txt)
    print(txt)


if __name__ == '__main__':
    main()
