#!/usr/bin/env python3
"""Milestone 3: is the 2010-18 -> 2021-24 fall in Catholic weekly attendance real or a mode effect (H3)?

    python3 experiments/m3_mode/run.py     # needs data/raw (data/download.sh), or GSS_RAW=<dir>

GSS `mode` codes as used here: 1 in person, 2 telephone, 3 video, 4 self-administered web
(the .dta carries no value labels; the assignment is the GSS 2021/2022/2024 documentation
reading, and is consistent with the counts: 2021 was a web-push year, 3,521 of 4,032 coded 4;
2016 and 2018 contain only codes 1 and 2). Outputs t1-t3 CSV and results.txt.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode, survey  # noqa: E402

COLS = recode.COLS + ['mode', 'modesequence']


def arr(d):
    return d['w'].to_numpy(float), d['strat'].to_numpy(float), d['psu'].to_numpy(float)


def mean(d, y, dom, **k):
    w, s, p = arr(d)
    m, se, n = survey.domain_mean(d[y].to_numpy(float), w, dom.to_numpy(bool), s, p)
    lo, hi = survey.ci(m, se)
    return dict(**k, outcome=y, estimate=m, lo=lo, hi=hi, n=n)


def contr(d, y, a, b, **k):
    w, s, p = arr(d)
    e, se, na, nb = survey.contrast(d[y].to_numpy(float), w, a.to_numpy(bool), b.to_numpy(bool), s, p)
    lo, hi = survey.ci(e, se)
    return dict(**k, outcome=y, estimate=e, lo=lo, hi=hi, n_a=na, n_b=nb)


def wls_cluster(X, y, w, strat, psu):
    """Weighted least squares; stratified-cluster (PSU) robust covariance. Returns beta, se."""
    XtWX = X.T @ (X * w[:, None])
    beta = np.linalg.solve(XtWX, X.T @ (w * y))
    u = X * (w * (y - X @ beta))[:, None]
    key = pd.Series(list(zip(strat, psu)))
    codes, _ = pd.factorize(key)
    S = pd.DataFrame(u).groupby(codes).sum()
    st = pd.Series(strat).groupby(codes).first()
    # centre PSU totals within strata (as survey.py does), pooling singleton strata
    cnt = st.map(st.value_counts())
    st = st.where(cnt > 1, -1)
    nh = st.map(st.value_counts()).to_numpy(float)
    Sc = S.to_numpy() - S.groupby(st.to_numpy()).transform('mean').to_numpy()
    meat = ((nh / np.maximum(nh - 1, 1))[:, None] * Sc).T @ Sc
    inv = np.linalg.inv(XtWX)
    return beta, np.sqrt(np.diag(inv @ meat @ inv))


def main():
    d = recode.recode(pd.read_stata(recode.RAW / recode.DTA, columns=COLS, convert_categoricals=False))
    d = d[d['year'] >= 2010].copy()
    d['m'] = d['mode'].map({1: 'In person', 2: 'Phone', 3: 'Video', 4: 'Web'})
    cath = d['rel'] == 'Catholic'
    out = []

    # T1: Catholic attendance by year and mode.
    for y in ('weekly', 'monthly', 'never'):
        for yr in (2010, 2012, 2014, 2016, 2018, 2021, 2022, 2024):
            Y = d['year'] == yr
            out.append(mean(d, y, cath & Y, year=yr, mode='All'))
            for m in ('In person', 'Phone', 'Video', 'Web'):
                if (Y & cath & (d['m'] == m)).sum() >= 30:
                    out.append(mean(d, y, cath & Y & (d['m'] == m), year=yr, mode=m))
    t1 = pd.DataFrame(out)
    t1.to_csv(HERE / 't1_attendance_by_mode.csv', index=False, float_format='%.4f')

    # T2: the H3 contrasts (Catholic weekly attendance).
    rows = []
    ip = d['m'] == 'In person'
    y18 = (d['year'] == 2018)
    y1618 = d['year'].isin([2016, 2018])
    late = d['year'].isin([2022, 2024])
    for label, a, b in [
        ('All modes 2021-24 minus all modes 2016-18', d['year'] >= 2021, y1618),
        ('All modes 2021-24 minus 2018', d['year'] >= 2021, y18),
        ('In person 2022-24 minus in person 2016-18', late & ip, y1618 & ip),
        ('In person 2022 minus in person 2018', (d['year'] == 2022) & ip, y18 & ip),
        ('In person 2024 minus in person 2018', (d['year'] == 2024) & ip, y18 & ip),
        ('Web minus in person, 2022-24', late & (d['m'] == 'Web'), late & ip),
        ('Web minus in person, 2022', (d['year'] == 2022) & (d['m'] == 'Web'), (d['year'] == 2022) & ip),
        ('Web minus in person, 2024', (d['year'] == 2024) & (d['m'] == 'Web'), (d['year'] == 2024) & ip),
        ('Web 2021 minus in person 2018', (d['year'] == 2021) & (d['m'] == 'Web'), y18 & ip),
    ]:
        for grp, g in (('Catholics', cath), ('Non-Catholics with a religion/none', d['rel'].notna() & ~cath)):
            rows.append(contr(d, 'weekly', a & g, b & g, contrast=label, group=grp))
    t2 = pd.DataFrame(rows)
    t2.to_csv(HERE / 't2_contrasts.csv', index=False, float_format='%.4f')

    # T3: adjusted web-minus-in-person gap, Catholics, 2022 and 2024, weighted LPM, PSU-robust.
    sub = d[cath & late & d['m'].isin(['In person', 'Web']) & d['weekly'].notna() & d['age'].notna()
            & d['eth'].notna()].copy()
    sub['web'] = (sub['m'] == 'Web').astype(float)
    sub['y24'] = (sub['year'] == 2024).astype(float)
    cols = {'const': np.ones(len(sub)), 'web': sub['web'], 'y2024': sub['y24'],
            'age_c': (sub['age'] - 50) / 10, 'female': (sub['sex'] == 2).astype(float),
            'hispanic': (sub['eth'] == 'Hispanic').astype(float),
            'ba': sub['ba'].fillna(0.0)}
    X = pd.DataFrame(cols)
    rows3 = []
    for name, cs in (('unadjusted', ['const', 'web', 'y2024']),
                     ('+ age, sex, ethnicity, degree', list(cols))):
        b, se = wls_cluster(X[cs].to_numpy(float), sub['weekly'].to_numpy(float),
                            sub['w'].to_numpy(float), sub['strat'].to_numpy(float), sub['psu'].to_numpy(float))
        i = cs.index('web')
        rows3.append(dict(model=name, web_minus_inperson=b[i], lo=b[i] - 1.96 * se[i], hi=b[i] + 1.96 * se[i], n=len(sub)))
    t3 = pd.DataFrame(rows3)
    t3.to_csv(HERE / 't3_adjusted_gap.csv', index=False, float_format='%.4f')

    # Mode mix of respondents by year (all adults, weighted), to show who changed.
    mix = d.groupby(['year', 'm']).size().unstack().fillna(0).astype(int)
    mix = mix.reset_index()
    mix.to_csv(HERE / 't0_mode_counts.csv', index=False)

    pd.set_option('display.width', 200, 'display.max_columns', 20)
    with open(HERE / 'results.txt', 'w') as f:
        for name, t in (('T0 respondents by year and mode (all adults)', mix),
                        ('T1 Catholic attendance by year and mode', t1[t1.outcome == 'weekly']),
                        ('T2 contrasts in weekly attendance (percentage points = x100)', t2),
                        ('T3 adjusted web minus in-person gap (Catholics, 2022 and 2024)', t3)):
            f.write(f'== {name}\n{t.to_string(index=False, float_format=lambda v: f"{v:.3f}")}\n\n')
    print(open(HERE / 'results.txt').read())


if __name__ == '__main__':
    main()
