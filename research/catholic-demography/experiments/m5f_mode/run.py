#!/usr/bin/env python3
"""Milestone 5b (fifth GSS-only part): is the within-cohort rise in the raised-Catholic share a web-mode artefact?

    GSS_RAW=data/raw python3 experiments/m5f_mode/run.py

Population as m5e (third-plus generation, non-Hispanic white, adults, 2000 onward, five birth cohorts). 2021-24 is split by
interview mode (GSS `mode`: 1 in person, 4 self-administered web; codes as in m3_mode). Prediction written before running
(LOG.md): if the within-cohort rise of m5e (+1.33 points, interval including zero) came from who answers by web, the
in-person-only 2021-24 sample shows a within-cohort term near zero and the web-minus-in-person gap in R is positive in
most cohorts. Same weights and stratified PSU bootstrap (500, seed 1) as m5a-m5e.
"""
import sys, os, importlib.util
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parent / 'm5a_decomp'))
from cathdem import recode  # noqa: E402
from run import boot_idx, PER  # noqa: E402  (m5a_decomp)

spec = importlib.util.spec_from_file_location('m5e', HERE.parent / 'm5e_cohort' / 'run.py')
m5e = importlib.util.module_from_spec(spec); spec.loader.exec_module(m5e)
K, BANDS, cohort_idx, comps, split = m5e.K, m5e.BANDS, m5e.cohort_idx, m5e.comps, m5e.split

SAMPLES = {'2000-09': lambda d: d['year'].between(2000, 2009),
           '2010-18': lambda d: d['year'].between(2010, 2018),
           '2021-24 all': lambda d: d['year'].between(2021, 2024),
           '2021-24 in person': lambda d: d['year'].between(2021, 2024) & (d['mode'] == 1),
           '2021-24 web': lambda d: d['year'].between(2021, 2024) & (d['mode'] == 4)}
PAIRS = [('2000-09', '2021-24 all'), ('2000-09', '2021-24 in person'), ('2000-09', '2021-24 web'),
         ('2010-18', '2021-24 in person'), ('2021-24 in person', '2021-24 web')]


def main():
    raw = Path(os.environ['GSS_RAW']) / 'GSS_stata' / 'gss7224_r3a.dta'
    d = recode.recode(recode.load(raw))
    mode = pd.read_stata(raw, columns=['year', 'id', 'mode'], convert_categoricals=False)
    d = d.merge(mode, on=['year', 'id'], how='left', validate='one_to_one')
    d = d[(d['age'] >= 18) & d['rel16'].notna() & d['gen'].notna() & d['eth'].notna() & (d['w'] > 0)]
    d = d[(d['year'] >= 2000) & (d['eth'] == 'NH white') & (d['gen'] == '3rd+ gen') & d['cohort'].notna()].copy()
    d['g'] = d['cohort'].map(cohort_idx)
    d = d[d['g'] >= 0]
    print('2021-24 mode counts (third-plus NH white):', d[d.year >= 2021]['mode'].value_counts(dropna=False).to_dict())
    data = {}
    for k, f in SAMPLES.items():
        s = d[f(d)]
        data[k] = (s['w'].to_numpy(float), s['g'].to_numpy(int), (s['rel16'] == 'Catholic').to_numpy(float),
                   s['strat'].to_numpy(), s['psu'].to_numpy())
    pt = {k: comps(*v[:3]) for k, v in data.items()}
    rng = np.random.default_rng(1)
    B = 500
    mults = {k: [boot_idx(v[3], v[4], rng) for _ in range(B)] for k, v in data.items()}
    print('\nLevels: raised-Catholic share R by cohort and sample')
    rows = []
    for k, v in data.items():
        bs = np.array([comps(v[0] * m, v[1], v[2])[1] for m in mults[k]])
        lo, hi = np.nanpercentile(bs, [2.5, 97.5], axis=0)
        tot = np.array([(comps(v[0] * m, v[1], v[2])[0] * np.nan_to_num(comps(v[0] * m, v[1], v[2])[1])).sum() for m in mults[k]])
        t0 = (pt[k][0] * np.nan_to_num(pt[k][1])).sum()
        print(f'{k}: n={len(v[1])} R overall {100*t0:.1f}% [{100*np.percentile(tot,2.5):.1f},{100*np.percentile(tot,97.5):.1f}]')
        for i, (_, _, lab) in enumerate(BANDS):
            print(f'  {lab}: n={(v[1]==i).sum()} R {pt[k][1][i]:.3f} [{lo[i]:.3f},{hi[i]:.3f}]')
            rows.append(dict(sample=k, cohort=lab, n=int((v[1] == i).sum()), R=pt[k][1][i], R_lo=lo[i], R_hi=hi[i]))
    pd.DataFrame(rows).to_csv(HERE / 't21_levels_by_mode.csv', index=False, float_format='%.4f')
    print('\nChange in share raised Catholic (percentage points), replacement + within-cohort')
    rows = []
    keys = ['dR', 'replacement', 'within']
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
    pd.DataFrame(rows).to_csv(HERE / 't22_mode_split.csv', index=False, float_format='%.3f')


if __name__ == '__main__':
    main()
