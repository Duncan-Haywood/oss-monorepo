#!/usr/bin/env python3
"""Milestone 5b (sixth GSS-only part): does the randomised 2022/2024 mode sequence move the raised-Catholic share?

    python3 experiments/m5g_randomised/run.py            # needs data/raw (data/download.sh)

m5f found web respondents report raised-Catholic more often than in-person respondents in 2021-24, but completed mode is
chosen by the respondent. In 2022 and 2024 sample cases were randomly assigned to a face-to-face-first (modesequence 1) or a
mail-push-to-web-first (modesequence 2) sequence (as m3b). Prediction written before running: if the web-minus-in-person gap
of m5f were a measurement effect of mode, the web-first arm would show a higher raised-Catholic share than the F2F-first arm;
if it is who chooses to answer by web, the arm difference is near zero (the arms differ only in how respondents are reached).
Outcome: relig16 == Catholic among adults. Populations: all adults, and third-plus-generation non-Hispanic whites (m5e).
Design-based variance (stratified PSU linearisation, cathdem.survey), 95% normal intervals.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode, survey  # noqa: E402


def contrast(d, y, a, b, **keys):
    w, s, p = d['w'].to_numpy(float), d['strat'].to_numpy(float), d['psu'].to_numpy(float)
    yy = d[y].to_numpy(float)
    est, se, na, nb = survey.contrast(yy, w, a.to_numpy(bool), b.to_numpy(bool), s, p)
    lo, hi = survey.ci(est, se)
    ma, _, _ = survey.domain_mean(yy, w, a.to_numpy(bool), s, p)
    mb, _, _ = survey.domain_mean(yy, w, b.to_numpy(bool), s, p)
    return dict(**keys, outcome=y, mean_a=ma, mean_b=mb, diff=est, se=se, lo=lo, hi=hi, n_a=na, n_b=nb)


def main():
    d = recode.recode(pd.read_stata(recode.RAW / recode.DTA, columns=recode.COLS + ['mode', 'modesequence'],
                                    convert_categoricals=False))
    d = d[(d['age'] >= 18) & d['rel16'].notna() & (d['w'] > 0)].copy()
    d['raised_cath'] = (d['rel16'] == 'Catholic').astype(float)
    d['is_cath'] = np.where(d['rel'].notna(), (d['rel'] == 'Catholic').astype(float), np.nan)
    pops = {'all adults': d['year'] > 0,
            '3rd+ gen NH white': (d['eth'] == 'NH white') & (d['gen'] == '3rd+ gen')}
    rows = []
    for yl, yrs in (('2022', [2022]), ('2024', [2024]), ('2022+2024', [2022, 2024])):
        Y = d['year'].isin(yrs)
        for pl, P in pops.items():
            for y in ('raised_cath', 'is_cath'):
                rows.append(contrast(d, y, Y & P & (d['modesequence'] == 1), Y & P & (d['modesequence'] == 2),
                                     years=yl, population=pl, arm_a='F2F-first', arm_b='web-first'))
    # Completed mode (non-randomised) for comparison, same populations, 2022+24.
    Y = d['year'].isin([2022, 2024])
    for pl, P in pops.items():
        rows.append(contrast(d, 'raised_cath', Y & P & (d['mode'] == 1), Y & P & (d['mode'] == 4),
                             years='2022+2024', population=pl, arm_a='completed in person', arm_b='completed web'))
    t = pd.DataFrame(rows)
    t.to_csv(HERE / 't23_randomised_raised_catholic.csv', index=False, float_format='%.4f')
    pd.set_option('display.width', 220)
    print('Arm-a minus arm-b (percentage points are x100); randomised arms and completed mode')
    print(t.round(4)[['years', 'population', 'outcome', 'arm_a', 'arm_b', 'mean_a', 'mean_b', 'diff', 'lo', 'hi', 'n_a', 'n_b']].to_string(index=False))
    for yr in (2022, 2024):
        print(yr, 'modesequence counts:', d[d.year == yr]['modesequence'].value_counts(dropna=False).to_dict())


if __name__ == '__main__':
    main()
