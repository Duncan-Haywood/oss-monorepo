"""Load the OSF hxn84 couple file and build discrete-time (wave-interval) survival rows.

One row per couple in Divorce_Data.csv (368 couples whose status at the final follow-up is
known). T2AGG_STATUS..T10AGG_STATUS are couple-level status at each follow-up (0 together,
1 divorced). Couple-level assessment dates are not in the public file, so each interval is
placed at the sample's mean years since baseline from the supplement's study timeline.
"""
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path(__file__).resolve().parent / 'raw'
WAVES = list(range(2, 11))
STATUS = [f'T{w}AGG_STATUS' for w in WAVES]
# Supplement, "Study Timeline": mean years since baseline at each follow-up, and field dates.
END_YEARS = [0.82, 1.57, 2.34, 4.15, 8.77, 9.94, 10.76, 11.44, 12.04]
FIELD_DATES = ['2010-01 to 2012-01', '2012-03 to 2012-09', '2012-06 to 2013-06', '2014-02 to 2014-03 (phone)',
               '2018-06 to 2019-04', '2019-07 to 2020-05', '2020-07 to 2021-01 (phone)', '2021-03 to 2021-09',
               '2021-11 to 2022-03']
PERIODS = []
for i, w in enumerate(WAVES):
    start = 0.0 if i == 0 else END_YEARS[i - 1]
    PERIODS.append(dict(period=f'{w:02d}', wave=w, start_years=start, end_years=END_YEARS[i],
                        length_years=round(END_YEARS[i] - start, 2), follow_up_fieldwork=FIELD_DATES[i]))
PERIOD_LABELS = [p['period'] for p in PERIODS]
PERIOD_YEARS = {p['period']: p['length_years'] for p in PERIODS}
# 0/1 indicator of the interval being scored (period 02 is the reference: all zero).
PERIOD_COLS = [f'period_{p}' for p in PERIOD_LABELS[1:]]

SES = ['H_educ_D', 'W_educ_D', 'income_k', 'Household_comp', 'Low_income_D', 'Couple_unemployment_D',
       'Couple_fin_strain_D', 'Neighborhood_unemploy', 'Neighborhood_income_k']
VUL = [f'{s}_{v}' for s in 'HW' for v in ['substance_D', 'ACE_D', 'abuse_D', 'neg_affect_D', 'parent_marriage_D']]
SAT = ['H_sat_sum', 'W_sat_sum']
OBS = ['H_Positivity', 'W_Positivity', 'H_Negativity', 'W_Negativity', 'H_Effective', 'W_Effective']
HOST = ['H_Hostility', 'W_Hostility']
ALL = SES + VUL + SAT + OBS + HOST


def load():
    d = pd.read_csv(RAW / 'Divorce_Data.csv', na_values=[' ', ''], skipinitialspace=True)
    assert d.shape == (368, 60), d.shape
    assert d.csid.is_unique
    d['income_k'] = d.income_avg / 1000
    d['Neighborhood_income_k'] = d.Neighborhood_income / 1000
    s = d[STATUS].to_numpy(float)
    first = np.full(len(d), np.nan)
    for i in range(len(d)):
        hit = np.where(s[i] == 1)[0]
        if len(hit):
            first[i] = WAVES[hit[0]]
    d['event_wave'] = first                      # first follow-up reporting divorce; NaN = together at T10
    d['divorced'] = d.event_wave.notna().astype(int)
    # Event wave is ambiguous when the follow-up just before it was missed.
    amb = np.zeros(len(d), bool)
    for i in range(len(d)):
        if d.divorced.iat[i]:
            k = WAVES.index(int(first[i]))
            amb[i] = k > 0 and np.isnan(s[i, k - 1])
    d['event_after_missed_wave'] = amb
    d['status_reversal'] = [bool(np.any(np.diff(r[~np.isnan(r)]) < 0)) for r in s]
    return d


def rows(d):
    """Person-period rows: each couple is at risk from period 02 until its event period (or 10).

    Missed follow-ups before the event (or before a later 'together' report) are treated as
    at-risk 'together' periods; divorce is absorbing; an event first reported after a missed
    wave is placed at the wave that first reports it.
    """
    out = []
    for i, r in enumerate(d.itertuples(index=False)):
        last = int(r.event_wave) if r.divorced else 10
        for w in range(2, last + 1):
            out.append((i, f'{w:02d}', int(r.divorced and w == last)))
    idx, per, ev = map(np.array, zip(*out))
    x = d.iloc[idx].reset_index(drop=True)
    x['period'] = per
    x['period_years'] = [PERIOD_YEARS[p] for p in per]
    add_period_indicators(x)
    x['event'] = ev
    x['couple'] = idx
    return x


def expand(d):
    """Every couple x every period (for cumulative predictions)."""
    e = d.loc[d.index.repeat(len(PERIODS))].copy()
    e['period'] = np.tile(PERIOD_LABELS, len(d))
    e['period_years'] = [PERIOD_YEARS[p] for p in e.period]
    add_period_indicators(e)
    return e


def add_period_indicators(x):
    for c in PERIOD_COLS:
        x[c] = (x.period == c[len('period_'):]).astype(float)
    return x
