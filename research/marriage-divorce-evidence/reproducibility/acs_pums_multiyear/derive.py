"""Derived analysis variables for the ACS one-year divorce incidence (see METHODS.md).

The population is everyone aged 15+ who was married at some point in the 12 months before the
interview: now married (MAR 1) or separated (MAR 4), or divorced (MARHD 1) or widowed (MARHW 1)
within those months. The event is MARHD = 1, "divorced in the past 12 months".
"""
import numpy as np, pandas as pd

STATES = {1: 'AL', 2: 'AK', 4: 'AZ', 5: 'AR', 6: 'CA', 8: 'CO', 9: 'CT', 10: 'DE', 11: 'DC', 12: 'FL', 13: 'GA',
          15: 'HI', 16: 'ID', 17: 'IL', 18: 'IN', 19: 'IA', 20: 'KS', 21: 'KY', 22: 'LA', 23: 'ME', 24: 'MD',
          25: 'MA', 26: 'MI', 27: 'MN', 28: 'MS', 29: 'MO', 30: 'MT', 31: 'NE', 32: 'NV', 33: 'NH', 34: 'NJ',
          35: 'NM', 36: 'NY', 37: 'NC', 38: 'ND', 39: 'OH', 40: 'OK', 41: 'OR', 42: 'PA', 44: 'RI', 45: 'SC',
          46: 'SD', 47: 'TN', 48: 'TX', 49: 'UT', 50: 'VT', 51: 'VA', 53: 'WA', 54: 'WV', 55: 'WI', 56: 'WY',
          72: 'PR'}
AGE_BANDS = [(15, 24), (25, 29), (30, 34), (35, 39), (40, 44), (45, 49), (50, 54), (55, 64), (65, 120)]
DUR_BANDS = [(0, 2), (3, 5), (6, 10), (11, 20), (21, 30), (31, 200)]
# Broad occupation groups of the 2018 Census occupation codes (ACS 2018 onward).
OCC = [(10, 440, 'Management'), (500, 960, 'Business and financial'), (1005, 1240, 'Computer and math'),
       (1305, 1560, 'Architecture and engineering'), (1600, 1980, 'Science'),
       (2001, 2060, 'Community and social service'), (2100, 2180, 'Legal'), (2205, 2555, 'Education'),
       (2600, 2920, 'Arts, media and sports'), (3000, 3550, 'Healthcare practitioners'),
       (3601, 3655, 'Healthcare support'), (3700, 3960, 'Protective service'), (4000, 4160, 'Food service'),
       (4200, 4255, 'Building and grounds'), (4330, 4655, 'Personal care'), (4700, 4965, 'Sales'),
       (5000, 5940, 'Office and administrative'), (6005, 6130, 'Farming, fishing, forestry'),
       (6200, 6950, 'Construction and extraction'), (7000, 7640, 'Installation and repair'),
       (7700, 8990, 'Production'), (9005, 9760, 'Transportation'), (9800, 9830, 'Military'),
       (9920, 9920, 'No work in 5 years')]


def band(x, bands, fmt):
    out = pd.Series(pd.NA, index=x.index, dtype='object')
    for lo, hi in bands:
        out[(x >= lo) & (x <= hi)] = fmt(lo, hi)
    return out


def derive(d):
    """Analysis columns for one survey year's extract (rows: married in the past 12 months)."""
    y = int(d.YEAR.iloc[0])
    keys = d[['YEAR', 'SERIALNO']]
    d = d[[c for c in d.columns if c not in ('SERIALNO',) and not c.startswith('PWGTP') or c == 'PWGTP']]
    d = d.astype('float64')  # nullable integers -> float with NaN, so comparisons are plain booleans
    d['SERIALNO'] = keys.SERIALNO
    out = pd.DataFrame(index=d.index)
    out['year'] = y
    out['hh'] = str(y) + '-' + d.SERIALNO.astype(str)
    out['event'] = (d.MARHD == 1).astype(np.int8)
    out['sex'] = np.where(d.SEX == 2, 'Woman', 'Man')
    out['age'] = d.AGEP.astype(float)
    out['age_band'] = band(d.AGEP, AGE_BANDS, lambda a, b: f'{a}+' if b > 100 else f'{a}-{b}')
    # Years since the (last) wedding. For someone who divorced AND remarried within the 12
    # months, MARHYP dates the new marriage, not the one that ended: duration unknown.
    remarried = (d.MARHD == 1) & (d.MARHM == 1) & (d.MAR == 1)
    dur = (y - d.MARHYP).astype(float)
    dur[remarried | (d.MARHYP <= 0)] = np.nan
    out['marriage_years'] = dur.clip(lower=0)
    out['duration_band'] = band(out.marriage_years, DUR_BANDS, lambda a, b: f'{a}+ years' if b > 100 else f'{a}-{b} years')
    out['duration_band'] = out.duration_band.fillna('Unknown')
    out['remarried_within_year'] = remarried.astype(np.int8)
    out['times_married'] = d.MARHT.map({1: 'Once', 2: 'Twice', 3: 'Three or more'}).fillna('Unknown')
    s = d.SCHL
    out['education'] = np.select([s <= 15, s <= 17, s <= 19, s == 20, s == 21, s >= 22],
                                 ['Less than high school', 'High school or GED', 'Some college', 'Associate',
                                  'Bachelor', 'Graduate or professional'], 'Unknown')
    hisp = d.HISP > 1
    r = d.RAC1P
    out['race_ethnicity'] = np.select([hisp, r == 1, r == 2, r == 6], ['Hispanic', 'White', 'Black', 'Asian'], 'Other')
    out['nativity'] = np.where(d.NATIVITY == 2, 'Foreign-born', 'US-born')
    out['state'] = d.ST.map(lambda v: STATES.get(int(v)) if v == v else None).fillna('Unknown')
    # Personal income in survey-year dollars (ADJINC), as a weighted percentile within the
    # survey year so pooled years need no price index.
    inc = d.PINCP.astype(float) * d.ADJINC.astype(float) / 1e6
    w = d.PWGTP.astype(float)
    order = np.argsort(inc.fillna(-1e12).to_numpy(), kind='stable')
    cw = np.cumsum(w.to_numpy()[order])
    pct = np.empty(len(d))
    pct[order] = 100 * (cw - w.to_numpy()[order] / 2) / cw[-1]
    out['income_percentile'] = np.where(inc.isna(), np.nan, pct)
    out['income_quintile'] = pd.cut(out.income_percentile, [0, 20, 40, 60, 80, 100.0001], right=False,
                                    labels=['Q1 (lowest)', 'Q2', 'Q3', 'Q4', 'Q5 (highest)']).astype(str).replace('nan', 'Unknown')
    e = d.ESR
    out['employment'] = np.select([e.isin([1, 2, 4, 5]), e == 3, e == 6], ['Employed', 'Unemployed', 'Not in labor force'], 'Unknown')
    occ = pd.Series('None or not in universe', index=d.index, dtype='object')
    if 'OCCP' in d and y >= 2019:
        for lo, hi, name in OCC:
            occ[(d.OCCP >= lo) & (d.OCCP <= hi)] = name
    else:
        occ[:] = 'Unknown'
    out['occupation_group'] = occ
    out['weight'] = w
    return out


def replicate_matrix(d):
    return np.column_stack([d.PWGTP.to_numpy(dtype=np.float32)] +
                           [d[f'PWGTP{i}'].to_numpy(dtype=np.float32) for i in range(1, 81)])
