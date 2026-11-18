#!/usr/bin/env python3
"""Milestone 3b (randomised arms): is the fall in Catholic weekly Mass attendance (2010-18 -> 2021-24) a survey-mode artefact?

    python3 experiments/m3b_randomised/run.py            # needs data/raw (data/download.sh)

The 2022 and 2024 GSS randomly assigned sample cases to a face-to-face-first (modesequence 1) or a
mail-push-to-web-first (modesequence 2) sequence, which identifies the effect of the data-collection
system on reported attendance. Writes t5_arms.csv and t6_vs_2018.csv and prints the numbers logged.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode, survey  # noqa: E402


def arr(d):
    return d['w'].to_numpy(float), d['strat'].to_numpy(float), d['psu'].to_numpy(float)


def contrast(d, y, a, b, **keys):
    w, s, p = arr(d)
    est, se, na, nb = survey.contrast(d[y].to_numpy(float), w, a.to_numpy(bool), b.to_numpy(bool), s, p)
    lo, hi = survey.ci(est, se)
    ma, sea, _ = survey.domain_mean(d[y].to_numpy(float), w, a.to_numpy(bool), s, p)
    mb, seb, _ = survey.domain_mean(d[y].to_numpy(float), w, b.to_numpy(bool), s, p)
    return dict(**keys, outcome=y, mean_a=ma, mean_b=mb, diff=est, se=se, lo=lo, hi=hi, n_a=na, n_b=nb)


def main():
    d = recode.recode(pd.read_stata(recode.RAW / recode.DTA, columns=recode.COLS + ['mode', 'modesequence'], convert_categoricals=False))
    d['is_cath'] = np.where(d['rel'].notna(), (d['rel'] == 'Catholic').astype(float), np.nan)
    d['is_hisp'] = np.where(d['eth'].notna(), (d['eth'] == 'Hispanic').astype(float), np.nan)
    cath = d['rel'] == 'Catholic'
    seq1 = d['modesequence'] == 1
    seq2 = d['modesequence'] == 2

    rows = []
    for label, yrs in (('2022', [2022]), ('2024', [2024]), ('2022+2024', [2022, 2024])):
        Y = d['year'].isin(yrs)
        for grp, G in (('Catholics', cath), ('Non-Catholics', ~cath & d['rel'].notna()), ('All adults', d['rel'].notna())):
            for y in ('weekly', 'monthly', 'never'):
                rows.append(contrast(d, y, Y & seq1 & G, Y & seq2 & G, years=label, group=grp, arm_a='F2F-first', arm_b='web-first'))
        for y in ('is_cath', 'is_hisp', 'age', 'ba'):
            rows.append(contrast(d.assign(age=d['age'].astype(float)), y, Y & seq1, Y & seq2, years=label, group='All adults', arm_a='F2F-first', arm_b='web-first'))
    t5 = pd.DataFrame(rows)
    t5.to_csv(HERE / 't5_arms.csv', index=False, float_format='%.4f')

    rows = []
    ref = {'2018': d['year'] == 2018, '2014-18': d['year'].between(2014, 2018), '2010-18': d['period'] == '2010-18'}
    yrs2224 = d['year'].isin([2022, 2024])
    new = {
        '2021 (all web)': (d['year'] == 2021),
        '2022+24 F2F-first arm': yrs2224 & seq1,
        '2022+24 web-first arm': yrs2224 & seq2,
        '2022+24 completed in person': yrs2224 & (d['mode'] == 1),
        '2022+24 completed web': yrs2224 & (d['mode'] == 4),
        '2022+24 all': yrs2224,
    }
    for rl, R in ref.items():
        for nl, N in new.items():
            for y in ('weekly', 'never'):
                rows.append(contrast(d, y, N & cath, R & cath, new=nl, reference=rl, group='Catholics'))
                rows.append(contrast(d, y, N & ~cath & d['rel'].notna(), R & ~cath & d['rel'].notna(), new=nl, reference=rl, group='Non-Catholics'))
    t6 = pd.DataFrame(rows)
    t6.to_csv(HERE / 't6_vs_2018.csv', index=False, float_format='%.4f')

    # Completed-mode table (descriptive; completed mode is chosen by the respondent).
    rows = []
    for yr in (2021, 2022, 2024):
        for m, ml in ((1, 'in person'), (2, 'phone'), (3, 'multimode'), (4, 'web')):
            D = (d['year'] == yr) & (d['mode'] == m) & cath
            if D.sum() < 2:
                continue
            w, s, p = arr(d)
            mean, se, n = survey.domain_mean(d['weekly'].to_numpy(float), w, D.to_numpy(bool), s, p)
            lo, hi = survey.ci(mean, se)
            rows.append(dict(year=yr, completed_mode=ml, weekly=mean, lo=lo, hi=hi, n=n))
    pd.DataFrame(rows).to_csv(HERE / 't7_completed_mode.csv', index=False, float_format='%.4f')

    pd.set_option('display.width', 200)
    f = lambda t: t.round(3)
    print('== Randomised arms: F2F-first minus web-first ==')
    print(f(t5[(t5.group != 'All adults') | t5.outcome.isin(['weekly'])][['years', 'group', 'outcome', 'mean_a', 'mean_b', 'diff', 'lo', 'hi', 'n_a', 'n_b']]).to_string(index=False))
    print(f(t5[t5.outcome.isin(['is_cath', 'is_hisp', 'age', 'ba'])][['years', 'outcome', 'mean_a', 'mean_b', 'diff', 'lo', 'hi', 'n_a', 'n_b']]).to_string(index=False))
    print('== Catholic weekly attendance: new minus reference ==')
    s = t6[(t6.group == 'Catholics') & (t6.outcome == 'weekly')]
    print(f(s[['new', 'reference', 'mean_a', 'mean_b', 'diff', 'lo', 'hi', 'n_a', 'n_b']]).to_string(index=False))
    print('== Non-Catholic weekly attendance: new minus reference ==')
    s = t6[(t6.group == 'Non-Catholics') & (t6.outcome == 'weekly') & (t6.reference == '2018')]
    print(f(s[['new', 'reference', 'mean_a', 'mean_b', 'diff', 'lo', 'hi', 'n_a', 'n_b']]).to_string(index=False))
    print('== Completed mode, Catholics ==')
    print(pd.read_csv(HERE / 't7_completed_mode.csv').round(3).to_string(index=False))


if __name__ == '__main__':
    main()
