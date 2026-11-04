#!/usr/bin/env python3
"""Milestone 5b (GSS-only part): split the change in the share of US adults raised Catholic by nativity.

    GSS_RAW=data/raw python3 experiments/m5b_nativity/run.py

R = f*Rf + (1-f)*Ru   (f share foreign-born, Rf / Ru share raised Catholic among foreign-born / US-born).
Midpoint split: dR = df*(Rf-Ru)_mid  [immigrant composition]
              + dRf*f_mid            [raised-Catholic rate among immigrants]
              + dRu*(1-f)_mid        [raised-Catholic rate among US-born: fertility, earlier retention]
The first two are "immigration"; the third is the "domestic" channel. Adults 18+, wtssps, `born` observed
(asked from 1977). Stratified PSU bootstrap, 500 reps, seed 1 (same scheme as m5a).
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


def comps(w, fb, rc):
    f = (w * fb).sum() / w.sum()
    Rf = (w * fb * rc).sum() / (w * fb).sum()
    Ru = (w * (1 - fb) * rc).sum() / (w * (1 - fb)).sum()
    return f, Rf, Ru


def split(a, b):
    (f0, Rf0, Ru0), (f1, Rf1, Ru1) = a, b
    R0, R1 = f0 * Rf0 + (1 - f0) * Ru0, f1 * Rf1 + (1 - f1) * Ru1
    comp = (f1 - f0) * ((Rf1 + Rf0) / 2 - (Ru1 + Ru0) / 2)
    rate_f = (Rf1 - Rf0) * (f1 + f0) / 2
    rate_u = (Ru1 - Ru0) * ((1 - f1) + (1 - f0)) / 2
    assert abs(comp + rate_f + rate_u - (R1 - R0)) < 1e-12
    return dict(R0=R0, R1=R1, dR=R1 - R0, composition=comp, rate_foreign=rate_f, rate_usborn=rate_u,
                immigration=comp + rate_f, usborn_share_of_dR=rate_u / (R1 - R0) if abs(R1 - R0) > 1e-9 else np.nan)


def main():
    d = recode.recode(recode.load(Path(os.environ['GSS_RAW']) / 'GSS_stata' / 'gss7224_r3a.dta'))
    d = d[(d['age'] >= 18) & d['rel16'].notna() & d['gen'].notna() & (d['w'] > 0)]
    data = {}
    for k, (lo, hi) in PER.items():
        s = d[d['year'].between(lo, hi)]
        data[k] = (s['w'].to_numpy(float), (s['gen'] == '1st gen (foreign-born)').to_numpy(float),
                   (s['rel16'] == 'Catholic').to_numpy(float), s['strat'].to_numpy(), s['psu'].to_numpy())
    pt = {k: comps(*v[:3]) for k, v in data.items()}
    rng = np.random.default_rng(1)
    B = 500
    mults = {k: [boot_idx(v[3], v[4], rng) for _ in range(B)] for k, v in data.items()}
    print('Levels: foreign-born share f, raised-Catholic share among foreign-born Rf and US-born Ru')
    rows = []
    for k, v in data.items():
        bs = np.array([comps(v[0] * m, v[1], v[2]) for m in mults[k]])
        lo, hi = np.percentile(bs, [2.5, 97.5], axis=0)
        print(f"{k}: n={len(v[0])} f {pt[k][0]:.3f} [{lo[0]:.3f},{hi[0]:.3f}]  Rf {pt[k][1]:.3f} [{lo[1]:.3f},{hi[1]:.3f}]  Ru {pt[k][2]:.3f} [{lo[2]:.3f},{hi[2]:.3f}]")
        rows.append(dict(period=k, n=len(v[0]), f=pt[k][0], f_lo=lo[0], f_hi=hi[0], Rf=pt[k][1], Rf_lo=lo[1], Rf_hi=hi[1], Ru=pt[k][2], Ru_lo=lo[2], Ru_hi=hi[2]))
    pd.DataFrame(rows).to_csv(HERE / 't13_levels.csv', index=False, float_format='%.4f')
    print('\nChange in share raised Catholic (percentage points), split by nativity')
    rows = []
    for a, b in PAIRS:
        p = split(pt[a], pt[b])
        bdf = pd.DataFrame([split(comps(data[a][0] * mults[a][i], data[a][1], data[a][2]),
                                  comps(data[b][0] * mults[b][i], data[b][1], data[b][2])) for i in range(B)])
        row = dict(from_=a, to=b)
        msg = f'{a} -> {b}: R {100*p["R0"]:.1f} -> {100*p["R1"]:.1f}'
        for k in ['dR', 'composition', 'rate_foreign', 'rate_usborn', 'immigration']:
            lo, hi = np.percentile(bdf[k], [2.5, 97.5])
            row[k] = p[k] * 100; row[k + '_lo'] = lo * 100; row[k + '_hi'] = hi * 100
            msg += f'; {k} {100*p[k]:+.2f} [{100*lo:+.2f},{100*hi:+.2f}]'
        rows.append(row); print(msg)
    pd.DataFrame(rows).to_csv(HERE / 't14_nativity_split.csv', index=False, float_format='%.3f')


if __name__ == '__main__':
    main()
