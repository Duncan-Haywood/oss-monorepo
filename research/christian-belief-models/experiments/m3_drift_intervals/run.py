#!/usr/bin/env python3
"""Milestone 3 (part): can an interval for an unseen ballot's share be made honest by pricing in drift?

    python3 experiments/m3_drift_intervals/run.py     # writes results/intervals.csv, results/summary.md

Needs no GSS microdata: it reads the committed per-item-year results of the held-out-year design
(m3_period_shift/results/period_shift.csv for interp and hgb_shift, m3_mice/results/mice.csv for
mice_logreg and its Rubin intervals). Each row is one Catholic item and one survey year whose answers
were removed and imputed from the other years; `observed` is that year's weighted share.

For each point imputation (interp, hgb_shift, mice_logreg and combo = (interp + hgb_shift) / 2) it builds
leave-one-item-out split-conformal 95% intervals: the scores of the other items' item-years set the
width for the item being scored (Vovk, Gammerman and Shafer 2005; Lei, G'Sell, Rinaldo, Tibshirani and
Wasserman 2018, doi:10.1080/01621459.2017.1307116). Three scores, from least to most informed:

  const  |error|                         a fixed width for every item-year
  samp   |error| / s                     s = sqrt(p (1 - p) / n), the year's binomial sampling sd
  drift  |error| / sqrt(s^2 + d^2)       d = drift scale from the item's *other* asked years (below)

The drift scale uses only years other than the held-out one, so it is available before the year is
seen: the per-year change between the two neighbouring asked years (one on each side when the year is
interior; the two nearest on the same side at the ends of a run) times the distance to the nearest
asked year. "Asked years" here are the item-years in the CSV (>= 150 respondents), a subset of the
years interp itself used.

Interval score: Gneiting and Raftery 2007, doi:10.1198/016214506000001437. Both DOIs were written from
the papers' JASA records but could not be looked up this session (Crossref refused the proxy); check them.
Plan and predictions: LOG.md, 2026-11-11.
"""
import math
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
OUT = HERE / 'results'
ALPHA = 0.05
METHODS = ['interp', 'hgb_shift', 'mice_logreg', 'combo']
SCORES = ['const', 'samp', 'drift']
FAST = ('samesex_marr_no', 'homosex_wrong')


def load():
    ps = pd.read_csv(EXP / 'm3_period_shift' / 'results' / 'period_shift.csv')
    mi = pd.read_csv(EXP / 'm3_mice' / 'results' / 'mice.csv')
    k = ['target', 'year']
    d = ps[k + ['n', 'observed', 'interp', 'hgb_shift', 'hgb_shift_bias_lo', 'hgb_shift_bias_hi']].merge(
        mi[k + ['mice_logreg', 'mice_logreg_se', 'mice_logreg_covers']], on=k, how='inner')
    d['combo'] = (d.interp + d.hgb_shift) / 2
    return d.sort_values(k).reset_index(drop=True)


def drift_scale(years, shares, t):
    """Drift scale for year t from the other years' shares (years, shares exclude t)."""
    years, shares = np.asarray(years, float), np.asarray(shares, float)
    lo, hi = years < t, years > t
    if lo.any() and hi.any():
        ia, ib = np.where(lo)[0][years[lo].argmax()], np.where(hi)[0][years[hi].argmin()]
        a, b = years[ia], years[ib]
        rate = abs(shares[ib] - shares[ia]) / (b - a)
        dist = min(t - a, b - t)
    else:
        side = lo if lo.any() else hi
        idx = np.where(side)[0][np.argsort(np.abs(years[side] - t))]
        if len(idx) < 2:
            return 0.0
        y1, y2 = years[idx[0]], years[idx[1]]
        rate = abs(shares[idx[0]] - shares[idx[1]]) / abs(y1 - y2)
        dist = abs(t - y1)
    return rate * dist


def add_scales(d):
    d = d.copy()
    d['s'] = np.sqrt(d.observed * (1 - d.observed) / d.n)
    dd = []
    for _, r in d.iterrows():
        o = d[(d.target == r.target) & (d.year != r.year)]
        dd.append(drift_scale(o.year.values, o.observed.values, r.year))
    d['d'] = dd
    d['scale_const'] = 1.0
    d['scale_samp'] = d.s
    d['scale_drift'] = np.sqrt(d.s ** 2 + d.d ** 2)
    return d


def conformal_q(cal, alpha=ALPHA):
    """Split-conformal quantile: the ceil((N + 1)(1 - alpha))-th smallest calibration score."""
    cal = np.sort(np.asarray(cal, float))
    k = math.ceil((len(cal) + 1) * (1 - alpha))
    return math.inf if k > len(cal) else cal[k - 1]


def intervals(d, alpha=ALPHA):
    """Leave-one-item-out half-widths for every method x score."""
    d = d.copy()
    for m in METHODS:
        err = (d[m] - d.observed).abs()
        for sc in SCORES:
            score = err / d['scale_' + sc]
            hw = np.empty(len(d))
            for g in d.target.unique():
                own = (d.target == g).values
                hw[own] = conformal_q(score[~own], alpha) * d.loc[own, 'scale_' + sc].values
            d[f'{m}_{sc}_hw'] = hw
            d[f'{m}_{sc}_covers'] = (err <= hw).astype(int)
    return d


def winkler(lo, hi, y, alpha=ALPHA):
    """Interval score (Gneiting and Raftery 2007): width plus 2/alpha times the miss distance."""
    return (hi - lo) + (2 / alpha) * (np.maximum(lo - y, 0) + np.maximum(y - hi, 0))


def summary(d):
    out = [f'# Milestone 3: drift-aware conformal intervals (Catholics, {len(d)} item-years, {d.target.nunique()} items)', '',
           'Leave-one-item-out split-conformal 95% intervals around each point imputation of a held-out year\'s share. '
           'Coverage = share of item-years whose observed share lies inside; width = median half-width, points; '
           'Winkler = mean interval score, points (lower is better).', '',
           '| method | MAE | score | coverage | worst item | same-sex marriage | same-sex relations | median half-width | Winkler |',
           '|---|---:|---|---:|---:|---:|---:|---:|---:|']
    for m in METHODS:
        mae = (d[m] - d.observed).abs().mean() * 100
        for sc in SCORES:
            c, hw = d[f'{m}_{sc}_covers'], d[f'{m}_{sc}_hw']
            per = d.groupby('target')[f'{m}_{sc}_covers'].mean()
            wk = winkler(d[m] - hw, d[m] + hw, d.observed).mean() * 100
            out.append(f'| {m} | {mae:.2f} | {sc} | {c.mean():.1%} | {per.min():.0%} ({per.idxmin()}) | '
                       f'{per[FAST[0]]:.0%} | {per[FAST[1]]:.0%} | {hw.median() * 100:.1f} | {wk:.1f} |')
    rb = d.groupby('target').mice_logreg_covers.mean()
    wr = winkler(d.mice_logreg - 1.96 * d.mice_logreg_se, d.mice_logreg + 1.96 * d.mice_logreg_se, d.observed).mean() * 100
    out.append(f'| mice_logreg | {(d.mice_logreg - d.observed).abs().mean() * 100:.2f} | Rubin (m3_mice) | '
               f'{d.mice_logreg_covers.mean():.1%} | {rb.min():.0%} ({rb.idxmin()}) | {rb[FAST[0]]:.0%} | {rb[FAST[1]]:.0%} | '
               f'{(1.96 * d.mice_logreg_se).median() * 100:.1f} | {wr:.1f} |')
    bz = ((d.hgb_shift_bias_lo <= 0) & (d.hgb_shift_bias_hi >= 0)).astype(int)
    bp = bz.groupby(d.target).mean()
    out.append(f'| hgb_shift | {(d.hgb_shift - d.observed).abs().mean() * 100:.2f} | bootstrap (m3_period_shift) | '
               f'{bz.mean():.1%} | {bp.min():.0%} ({bp.idxmin()}) | {bp[FAST[0]]:.0%} | {bp[FAST[1]]:.0%} | '
               f'{((d.hgb_shift_bias_hi - d.hgb_shift_bias_lo) / 2).median() * 100:.1f} | n/a |')
    out += ['', 'Per-item coverage of `hgb_shift` intervals:', '',
            '| item | n years | MAE | const | samp | drift | median drift half-width |', '|---|---:|---:|---:|---:|---:|---:|']
    for g, x in d.groupby('target'):
        out.append(f'| {g} | {len(x)} | {(x.hgb_shift - x.observed).abs().mean() * 100:.1f} | '
                   f'{x.hgb_shift_const_covers.mean():.0%} | {x.hgb_shift_samp_covers.mean():.0%} | '
                   f'{x.hgb_shift_drift_covers.mean():.0%} | {x.hgb_shift_drift_hw.median() * 100:.1f} |')
    out += ['', 'Coverage at other nominal levels (`hgb_shift`; overall / worst item):', '',
            '| nominal | const | samp | drift |', '|---:|---|---|---|']
    for a in (0.2, 0.1, 0.05):
        e = intervals(d[['target', 'year', 'n', 'observed', 'scale_const', 'scale_samp', 'scale_drift'] + METHODS], a)
        cells = []
        for sc in SCORES:
            c = e[f'hgb_shift_{sc}_covers']
            cells.append(f'{c.mean():.1%} / {c.groupby(e.target).mean().min():.0%}')
        out.append(f'| {1 - a:.0%} | ' + ' | '.join(cells) + ' |')
    out += ['', f'Drift scale d: median {d.d.median() * 100:.1f} points, 90th percentile {d.d.quantile(0.9) * 100:.1f}; '
            f'sampling sd s: median {d.s.median() * 100:.1f} points. Spearman correlation of d with |hgb_shift error|: '
            f'{d.d.corr((d.hgb_shift - d.observed).abs(), method="spearman"):.2f}.']
    return '\n'.join(out) + '\n'


def main():
    OUT.mkdir(exist_ok=True)
    d = intervals(add_scales(load()))
    cols = ['target', 'year', 'n', 'observed', 's', 'd'] + METHODS + [c for c in d.columns if c.endswith(('_hw', '_covers')) and not c.startswith('mice_logreg_covers')]
    d[cols].to_csv(OUT / 'intervals.csv', index=False)
    txt = summary(d)
    (OUT / 'summary.md').write_text(txt)
    print(txt)


if __name__ == '__main__':
    main()
