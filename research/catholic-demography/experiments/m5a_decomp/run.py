#!/usr/bin/env python3
"""Milestone 5a: GSS-only decomposition of the change in the Catholic share of US adults.

    GSS_RAW=/tmp/gssraw python3 experiments/m5a_decomp/run.py

Identity (adults 18+ with relig and relig16 observed):  S = R*r + (1-R)*c
  S share Catholic now, R share raised Catholic, r retention (raised Catholic, still Catholic),
  c conversion in (not raised Catholic, Catholic now).  Change between periods is split by the
  two-point midpoint (Shapley) rule: dS = dR*(r1+r0)/2 - dR*(c1+c0)/2 + dr*(R1+R0)/2 + dc*((1-R1)+(1-R0))/2.
R mixes fertility, immigration and earlier retention of the parents' generation, so it is the
"inflow" channel; H4 proper (fertility vs immigration) needs outside series (milestone 5b).
Intervals: stratified PSU bootstrap (resample PSUs within strata), 500 reps, seed 1.
"""
import sys, os
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode  # noqa: E402

PER = {'1990-99': (1990, 1999), '2000-09': (2000, 2009), '2010-18': (2010, 2018), '2021-24': (2021, 2024)}
PAIRS = [('1990-99', '2010-18'), ('1990-99', '2021-24'), ('2010-18', '2021-24')]


def comps(w, raised, cath):
    W = w.sum()
    R = (w * raised).sum() / W
    r = (w * raised * cath).sum() / (w * raised).sum()
    c = (w * (1 - raised) * cath).sum() / (w * (1 - raised)).sum()
    return R, r, c


def decomp(a, b):
    (R0, r0, c0), (R1, r1, c1) = a, b
    S0, S1 = R0 * r0 + (1 - R0) * c0, R1 * r1 + (1 - R1) * c1
    inflow = (R1 - R0) * ((r1 + r0) / 2 - (c1 + c0) / 2)
    ret = (r1 - r0) * (R1 + R0) / 2
    conv = (c1 - c0) * ((1 - R1) + (1 - R0)) / 2
    assert abs(inflow + ret + conv - (S1 - S0)) < 1e-12
    return dict(S0=S0, S1=S1, dS=S1 - S0, inflow_raised=inflow, retention=ret, conversion_in=conv)


def prep(d, sel):
    s = d[sel & d['rel'].notna() & d['rel16'].notna() & (d['w'] > 0)]
    return (s['w'].to_numpy(float), (s['rel16'] == 'Catholic').to_numpy(float), (s['rel'] == 'Catholic').to_numpy(float),
            s['strat'].to_numpy(), s['psu'].to_numpy())


def boot_idx(strat, psu, rng):
    """Resample PSUs within strata; return row weights multiplier (count of times each row's PSU drawn)."""
    key = pd.Series(list(zip(strat, psu)))
    codes, uniq = pd.factorize(key)
    st_of = np.array([u[0] for u in uniq])
    mult = np.zeros(len(uniq))
    for s in np.unique(st_of):
        ids = np.where(st_of == s)[0]
        draw = rng.choice(ids, size=len(ids), replace=True)
        np.add.at(mult, draw, 1)
    return mult[codes]


def main():
    d = recode.recode(recode.load(os.environ.get('GSS_RAW') and Path(os.environ['GSS_RAW']) / 'GSS_stata' / 'gss7224_r3a.dta'))
    d = d[d['age'] >= 18]
    data = {k: prep(d, d['year'].between(*v)) for k, v in PER.items()}
    pt = {k: comps(*v[:3]) for k, v in data.items()}
    rng = np.random.default_rng(1)
    B = 500
    mults = {k: [boot_idx(v[3], v[4], rng) for _ in range(B)] for k, v in data.items()}
    out, lines = [], []
    print('Component levels (weighted) with 95% bootstrap intervals')
    for k, v in data.items():
        bs = np.array([comps(v[0] * m, v[1], v[2]) for m in mults[k]])
        lo, hi = np.percentile(bs, [2.5, 97.5], axis=0)
        row = dict(period=k, n=len(v[0]))
        for i, nme in enumerate(['raised_catholic', 'retention', 'conversion_in']):
            row[nme] = pt[k][i]; row[nme + '_lo'] = lo[i]; row[nme + '_hi'] = hi[i]
        out.append(row)
        print(f"{k}: n={len(v[0])}  raised Catholic {pt[k][0]:.3f} [{lo[0]:.3f},{hi[0]:.3f}]  retention {pt[k][1]:.3f} [{lo[1]:.3f},{hi[1]:.3f}]  conversion in {pt[k][2]:.3f} [{lo[2]:.3f},{hi[2]:.3f}]")
    pd.DataFrame(out).to_csv(HERE / 't11_components.csv', index=False, float_format='%.4f')
    rows = []
    print('\nMidpoint decomposition of the change in the Catholic share (percentage points)')
    for a, b in PAIRS:
        p = decomp(pt[a], pt[b])
        bs = []
        for i in range(B):
            ca = comps(data[a][0] * mults[a][i], data[a][1], data[a][2])
            cb = comps(data[b][0] * mults[b][i], data[b][1], data[b][2])
            bs.append(decomp(ca, cb))
        bdf = pd.DataFrame(bs)
        row = dict(from_=a, to=b)
        msg = f'{a} -> {b}: S {100*p["S0"]:.1f} -> {100*p["S1"]:.1f}'
        for k in ['dS', 'inflow_raised', 'retention', 'conversion_in']:
            lo, hi = np.percentile(bdf[k], [2.5, 97.5])
            row[k] = p[k] * 100; row[k + '_lo'] = lo * 100; row[k + '_hi'] = hi * 100
            msg += f'; {k} {100*p[k]:+.1f} [{100*lo:+.1f},{100*hi:+.1f}]'
        rows.append(row); print(msg)
    pd.DataFrame(rows).to_csv(HERE / 't12_decomposition.csv', index=False, float_format='%.3f')
    # Immigration descriptives: foreign-born share of Catholics and of those raised Catholic
    print('\nForeign-born share of current Catholics (weighted)')
    for k, (lo_, hi_) in PER.items():
        s = d[d['year'].between(lo_, hi_) & (d['rel'] == 'Catholic') & d['gen'].notna() & (d['w'] > 0)]
        print(f"{k}: {100*np.average(s['gen']=='1st gen (foreign-born)', weights=s['w']):.1f}% (n={len(s)})")


if __name__ == '__main__':
    main()
