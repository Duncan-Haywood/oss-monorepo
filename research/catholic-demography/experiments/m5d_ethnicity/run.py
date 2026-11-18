#!/usr/bin/env python3
"""Milestone 5b (third GSS-only part): split the third-plus-generation term of the raised-Catholic share by ethnicity.

    GSS_RAW=data/raw python3 experiments/m5d_ethnicity/run.py

Groups (adults, 2000 onward, when `hispanic` is asked): foreign-born; 2nd gen; 3rd+ gen non-Hispanic white;
3rd+ gen Hispanic; 3rd+ gen NH Black or other. R = sum_g f_g R_g; midpoint split into composition plus one rate
term per group, summing exactly to the change (asserted). Same weights and stratified PSU bootstrap (500, seed 1)
as m5a-m5c. Periods 2000-09, 2010-18, 2021-24. No directional prediction was written before running.
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
GROUPS = ['foreign-born', '2nd gen', '3rd+ NH white', '3rd+ Hispanic', '3rd+ NH Black/other']
K = len(GROUPS)


def group(r):
    if r['gen'] == '1st gen (foreign-born)':
        return 0
    if r['gen'] == '2nd gen':
        return 1
    return 2 if r['eth'] == 'NH white' else 3 if r['eth'] == 'Hispanic' else 4


def comps(w, g, rc):
    f = np.array([(w * (g == k)).sum() / w.sum() for k in range(K)])
    R = np.array([(w * (g == k) * rc).sum() / (w * (g == k)).sum() for k in range(K)])
    return f, R


def split(a, b):
    (f0, R0), (f1, R1) = a, b
    tot0, tot1 = (f0 * R0).sum(), (f1 * R1).sum()
    comp = ((f1 - f0) * (R0 + R1) / 2).sum()
    rate = (R1 - R0) * (f0 + f1) / 2
    assert abs(comp + rate.sum() - (tot1 - tot0)) < 1e-12
    out = dict(R0=tot0, R1=tot1, dR=tot1 - tot0, composition=comp)
    for k, name in enumerate(['rate_fb', 'rate_2nd', 'rate_3rd_white', 'rate_3rd_hisp', 'rate_3rd_other']):
        out[name] = rate[k]
    out['rate_3rd_all'] = rate[2:].sum()
    return out


def main():
    d = recode.recode(recode.load(Path(os.environ['GSS_RAW']) / 'GSS_stata' / 'gss7224_r3a.dta'))
    d = d[(d['age'] >= 18) & d['rel16'].notna() & d['gen'].notna() & d['eth'].notna() & (d['w'] > 0)]
    d = d[d['year'] >= 2000].copy()
    d['g'] = d.apply(group, axis=1)
    data = {}
    for k, (lo, hi) in PERS.items():
        s = d[d['year'].between(lo, hi)]
        data[k] = (s['w'].to_numpy(float), s['g'].to_numpy(int), (s['rel16'] == 'Catholic').to_numpy(float),
                   s['strat'].to_numpy(), s['psu'].to_numpy())
    pt = {k: comps(*v[:3]) for k, v in data.items()}
    rng = np.random.default_rng(1)
    B = 500
    mults = {k: [boot_idx(v[3], v[4], rng) for _ in range(B)] for k, v in data.items()}
    print('Levels: group share f and raised-Catholic share R within group')
    rows = []
    for k, v in data.items():
        bs = np.array([np.concatenate(comps(v[0] * m, v[1], v[2])) for m in mults[k]])
        lo, hi = np.nanpercentile(bs, [2.5, 97.5], axis=0)
        for i, g in enumerate(GROUPS):
            print(f"{k} {g}: n={(v[1]==i).sum()} f {pt[k][0][i]:.3f} [{lo[i]:.3f},{hi[i]:.3f}]  R {pt[k][1][i]:.3f} [{lo[K+i]:.3f},{hi[K+i]:.3f}]")
            rows.append(dict(period=k, group=g, n=int((v[1] == i).sum()), f=pt[k][0][i], f_lo=lo[i], f_hi=hi[i],
                             R=pt[k][1][i], R_lo=lo[K + i], R_hi=hi[K + i]))
    pd.DataFrame(rows).to_csv(HERE / 't17_levels.csv', index=False, float_format='%.4f')
    print('\nChange in share raised Catholic (percentage points), by group')
    rows = []
    keys = ['dR', 'composition', 'rate_fb', 'rate_2nd', 'rate_3rd_white', 'rate_3rd_hisp', 'rate_3rd_other', 'rate_3rd_all']
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
    pd.DataFrame(rows).to_csv(HERE / 't18_ethnicity_split.csv', index=False, float_format='%.3f')


if __name__ == '__main__':
    main()
