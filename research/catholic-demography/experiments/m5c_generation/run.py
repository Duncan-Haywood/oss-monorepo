#!/usr/bin/env python3
"""Milestone 5b (second GSS-only part): split the change in the raised-Catholic share by immigrant generation.

    GSS_RAW=data/raw python3 experiments/m5c_generation/run.py

R = sum_g f_g R_g over g in {1st gen (foreign-born), 2nd gen, 3rd+ gen}. Midpoint split:
  dR = sum_g df_g * Rbar_g       [generation composition]
     + sum_g dR_g * fbar_g       [raised-Catholic rate within each generation]
The three rate terms and the composition term sum exactly to dR (asserted). Same samples, weights and
stratified PSU bootstrap (500 reps, seed 1) as m5a/m5b. 2nd gen = US-born with at least one foreign-born
parent (`parborn` 1, 2, 8); 3rd+ = US-born, both parents US-born.
"""
import sys, os
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parent / 'm5a_decomp'))
from cathdem import recode  # noqa: E402
from run import boot_idx, PER, PAIRS  # noqa: E402

GENS = ['1st gen (foreign-born)', '2nd gen', '3rd+ gen']


def comps(w, g, rc):
    f = np.array([(w * (g == k)).sum() / w.sum() for k in range(3)])
    R = np.array([(w * (g == k) * rc).sum() / (w * (g == k)).sum() for k in range(3)])
    return f, R


def split(a, b):
    (f0, R0), (f1, R1) = a, b
    tot0, tot1 = (f0 * R0).sum(), (f1 * R1).sum()
    comp = ((f1 - f0) * (R0 + R1) / 2).sum()
    rate = (R1 - R0) * (f0 + f1) / 2
    assert abs(comp + rate.sum() - (tot1 - tot0)) < 1e-12
    return dict(R0=tot0, R1=tot1, dR=tot1 - tot0, composition=comp, rate_1st=rate[0], rate_2nd=rate[1],
                rate_3rd=rate[2], immigrant_family=comp + rate[0] + rate[1])


def main():
    d = recode.recode(recode.load(Path(os.environ['GSS_RAW']) / 'GSS_stata' / 'gss7224_r3a.dta'))
    d = d[(d['age'] >= 18) & d['rel16'].notna() & d['gen'].notna() & (d['w'] > 0)]
    data = {}
    for k, (lo, hi) in PER.items():
        s = d[d['year'].between(lo, hi)]
        data[k] = (s['w'].to_numpy(float), s['gen'].map({g: i for i, g in enumerate(GENS)}).to_numpy(int),
                   (s['rel16'] == 'Catholic').to_numpy(float), s['strat'].to_numpy(), s['psu'].to_numpy())
    pt = {k: comps(*v[:3]) for k, v in data.items()}
    rng = np.random.default_rng(1)
    B = 500
    mults = {k: [boot_idx(v[3], v[4], rng) for _ in range(B)] for k, v in data.items()}
    print('Levels: generation share f and raised-Catholic share R within generation')
    rows = []
    for k, v in data.items():
        bs = np.array([np.concatenate(comps(v[0] * m, v[1], v[2])) for m in mults[k]])
        lo, hi = np.percentile(bs, [2.5, 97.5], axis=0)
        for i, g in enumerate(GENS):
            print(f"{k} {g}: n={(v[1]==i).sum()} f {pt[k][0][i]:.3f} [{lo[i]:.3f},{hi[i]:.3f}]  R {pt[k][1][i]:.3f} [{lo[3+i]:.3f},{hi[3+i]:.3f}]")
            rows.append(dict(period=k, generation=g, n=int((v[1] == i).sum()), f=pt[k][0][i], f_lo=lo[i], f_hi=hi[i],
                             R=pt[k][1][i], R_lo=lo[3 + i], R_hi=hi[3 + i]))
    pd.DataFrame(rows).to_csv(HERE / 't15_levels.csv', index=False, float_format='%.4f')
    print('\nChange in share raised Catholic (percentage points), split by immigrant generation')
    rows = []
    keys = ['dR', 'composition', 'rate_1st', 'rate_2nd', 'rate_3rd', 'immigrant_family']
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
    pd.DataFrame(rows).to_csv(HERE / 't16_generation_split.csv', index=False, float_format='%.3f')


if __name__ == '__main__':
    main()
