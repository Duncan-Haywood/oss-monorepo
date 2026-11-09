#!/usr/bin/env python3
"""Milestone 5b (fourth GSS-only part): is the third-plus-generation non-Hispanic white rise in the
raised-Catholic share cohort replacement or a rise within birth cohorts?

    GSS_RAW=data/raw python3 experiments/m5e_cohort/run.py

Population: adults 18+, third-plus generation, non-Hispanic white, 2000 onward. R_c is the share raised Catholic
in birth cohort c. R = sum_c f_c R_c; midpoint split into a replacement (cohort composition) term plus one
within-cohort rate term per cohort, summing exactly to the change (asserted). Same weights and stratified PSU
bootstrap (500, seed 1) as m5a-m5d. Hypothesis written before running (see LOG.md): raised-Catholic is fixed at
age 16, so a genuine flow cannot rise within a cohort; I expect most of the rise to be replacement, with
within-cohort terms near zero (a non-zero within-cohort term would point to recall, mortality selection or
panel/mode artefacts).
"""
import sys, os
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parent / 'm5a_decomp'))
from cathdem import recode  # noqa: E402
from run import boot_idx, PER  # noqa: E402

PERS = {k: PER[k] for k in ['2000-09', '2010-18', '2021-24']}
PAIRS = [('2000-09', '2010-18'), ('2000-09', '2021-24'), ('2010-18', '2021-24')]
BANDS = [(1880, 1929, 'before 1930'), (1930, 1944, '1930-44'), (1945, 1959, '1945-59'),
         (1960, 1974, '1960-74'), (1975, 2006, '1975 and later')]
K = len(BANDS)


def cohort_idx(c):
    for i, (lo, hi, _) in enumerate(BANDS):
        if lo <= c <= hi:
            return i
    return -1


def comps(w, g, rc):
    f = np.array([(w * (g == k)).sum() / w.sum() for k in range(K)])
    R = np.array([(w * (g == k) * rc).sum() / max((w * (g == k)).sum(), 1e-12) if (g == k).any() else np.nan
                  for k in range(K)])
    return f, R


def split(a, b):
    (f0, R0), (f1, R1) = a, b
    # A cohort empty in one period (f = 0, R undefined) takes the other period's rate: its rate term is 0 and the
    # composition term carries its whole contribution, so the totals match the m5d series.
    R0, R1 = np.where(np.isnan(R0), R1, R0), np.where(np.isnan(R1), R0, R1)
    R0, R1 = np.nan_to_num(R0), np.nan_to_num(R1)
    tot0, tot1 = (f0 * R0).sum(), (f1 * R1).sum()
    comp = ((f1 - f0) * (R0 + R1) / 2).sum()
    rate = (R1 - R0) * (f0 + f1) / 2
    assert abs(comp + rate.sum() - (tot1 - tot0)) < 1e-12
    out = dict(R0=tot0, R1=tot1, dR=tot1 - tot0, replacement=comp, within=rate.sum())
    for k in range(K):
        out[f'rate_{k}'] = rate[k]
    return out


def main():
    d = recode.recode(recode.load(Path(os.environ['GSS_RAW']) / 'GSS_stata' / 'gss7224_r3a.dta'))
    d = d[(d['age'] >= 18) & d['rel16'].notna() & d['gen'].notna() & d['eth'].notna() & (d['w'] > 0)]
    d = d[(d['year'] >= 2000) & (d['eth'] == 'NH white') & (d['gen'] == '3rd+ gen') & d['cohort'].notna()].copy()
    d['g'] = d['cohort'].map(cohort_idx)
    d = d[d['g'] >= 0]
    data = {}
    for k, (lo, hi) in PERS.items():
        s = d[d['year'].between(lo, hi)]
        data[k] = (s['w'].to_numpy(float), s['g'].to_numpy(int), (s['rel16'] == 'Catholic').to_numpy(float),
                   s['strat'].to_numpy(), s['psu'].to_numpy())
    pt = {k: comps(*v[:3]) for k, v in data.items()}
    rng = np.random.default_rng(1)
    B = 500
    mults = {k: [boot_idx(v[3], v[4], rng) for _ in range(B)] for k, v in data.items()}
    print('Levels: cohort share f and raised-Catholic share R within cohort (third-plus NH white)')
    rows = []
    for k, v in data.items():
        bs = np.array([np.concatenate(comps(v[0] * m, v[1], v[2])) for m in mults[k]])
        lo, hi = np.nanpercentile(bs, [2.5, 97.5], axis=0)
        for i, (_, _, lab) in enumerate(BANDS):
            print(f"{k} {lab}: n={(v[1]==i).sum()} f {pt[k][0][i]:.3f} [{lo[i]:.3f},{hi[i]:.3f}]  R {pt[k][1][i]:.3f} [{lo[K+i]:.3f},{hi[K+i]:.3f}]")
            rows.append(dict(period=k, cohort=lab, n=int((v[1] == i).sum()), f=pt[k][0][i], f_lo=lo[i], f_hi=hi[i],
                             R=pt[k][1][i], R_lo=lo[K + i], R_hi=hi[K + i]))
    pd.DataFrame(rows).to_csv(HERE / 't19_levels.csv', index=False, float_format='%.4f')
    print('\nChange in share raised Catholic (percentage points), third-plus NH white')
    rows = []
    keys = ['dR', 'replacement', 'within'] + [f'rate_{k}' for k in range(K)]
    for a, b in PAIRS:
        p = split(pt[a], pt[b])
        bdf = pd.DataFrame([split(comps(data[a][0] * mults[a][i], data[a][1], data[a][2]),
                                  comps(data[b][0] * mults[b][i], data[b][1], data[b][2])) for i in range(B)])
        row = dict(from_=a, to=b)
        msg = f'{a} -> {b}: R {100*p["R0"]:.1f} -> {100*p["R1"]:.1f}'
        for k in keys:
            lo, hi = np.percentile(bdf[k], [2.5, 97.5])
            row[k] = p[k] * 100; row[k + '_lo'] = lo * 100; row[k + '_hi'] = hi * 100
            msg += f'; {k} {100*p[k]:+.2f} [{100*lo:+.2f},{100*hi:+.2f}]'
        rows.append(row); print(msg)
    pd.DataFrame(rows).to_csv(HERE / 't20_cohort_split.csv', index=False, float_format='%.3f')


if __name__ == '__main__':
    main()
