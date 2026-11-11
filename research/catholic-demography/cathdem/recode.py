"""Recodes of the GSS 1972-2024 cumulative file (release 3a) for Catholic subgroup analysis.

Codes are from the GSS 2024 codebook R3a (NORC). Stata extended missing values (don't
know, IAP, no answer, skipped on web, not asked this year) are read as NaN by pandas.
"""
from pathlib import Path
import os
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parents[1]
RAW = Path(os.environ.get('GSS_RAW', HERE / 'data' / 'raw'))
DTA = 'GSS_stata/gss7224_r3a.dta'
RDA = 'gssr/gss_all.rda'  # fallback: the same cumulative file as shipped in the gssr R package (data/download_gssr.sh)

COLS = ['year', 'id', 'relig', 'relig16', 'attend', 'childs', 'age', 'cohort', 'hispanic',
        'race', 'born', 'parborn', 'wtssps', 'vpsu', 'vstrat', 'sex', 'degree', 'marital',
        'polviews', 'partyid', 'abany', 'postlife', 'bible', 'pray', 'reliten']

RELIG = {1: 'Protestant', 2: 'Catholic', 3: 'Jewish', 4: 'None'}  # 5-13 -> 'Other'
COHORTS = [(1900, 1924, 'Born 1900-24'), (1925, 1944, 'Born 1925-44'),
           (1945, 1964, 'Born 1945-64'), (1965, 1980, 'Born 1965-80'),
           (1981, 1996, 'Born 1981-96'), (1997, 2006, 'Born 1997-2006')]
PERIODS = [(1972, 1979, '1972-79'), (1980, 1989, '1980-89'), (1990, 1999, '1990-99'),
           (2000, 2009, '2000-09'), (2010, 2018, '2010-18'), (2021, 2024, '2021-24')]


def load(path=None, cols=None):
    """Read the cumulative file. Uses NORC's .dta when present, else gssr's gss_all.rda.

    A path given explicitly that does not exist also falls back to the .rda, so every experiment script runs
    from either source. pyreadr is needed only for the .rda."""
    cols = cols or COLS
    path = Path(path) if path else RAW / DTA
    if path.suffix == '.dta' and path.exists():
        return pd.read_stata(path, columns=cols, convert_categoricals=False)
    rda = path if path.suffix == '.rda' else RAW / RDA
    if not rda.exists():
        raise FileNotFoundError(f'neither {path} nor {rda}: run data/download.sh (NORC) or data/download_gssr.sh')
    return read_rda(rda, cols)


def read_rda(path, cols=None):
    """One data frame from an .rda file, numeric columns as float with NaN for every missing code.

    gssr stores the GSS's labelled missing codes (IAP, don't know, no answer, skipped on web) as R NA, as
    pandas.read_stata does with Stata's extended missing values, so codes match the .dta read."""
    import pyreadr
    (df,) = pyreadr.read_r(str(path)).values()
    if cols is not None:
        df = df[[c for c in cols if c in df.columns]]
    return df.apply(lambda c: pd.to_numeric(c, errors='coerce') if c.dtype == object else c)


def _band(x, bands):
    out = pd.Series(pd.NA, index=x.index, dtype='object')
    for lo, hi, lab in bands:
        out[(x >= lo) & (x <= hi)] = lab
    return out


def relig_label(code):
    s = code.map(RELIG)
    s[code.between(5, 13)] = 'Other'
    return s


def recode(d):
    """Add analysis columns. Indicator columns are float with NaN where the item is missing."""
    d = d.copy()
    d['rel'] = relig_label(d['relig'])
    d['rel16'] = relig_label(d['relig16'])
    # Ethnicity: hispanic is asked from 2000; non-Hispanic white / Black / other otherwise.
    hisp = d['hispanic']
    eth = pd.Series(pd.NA, index=d.index, dtype='object')
    eth[hisp >= 2] = 'Hispanic'
    eth[(hisp == 1) & (d['race'] == 1)] = 'NH white'
    eth[(hisp == 1) & (d['race'] == 2)] = 'NH Black'
    eth[(hisp == 1) & (d['race'] == 3)] = 'NH other'
    d['eth'] = eth
    # Immigrant generation (born asked from 1977, parborn likewise).
    gen = pd.Series(pd.NA, index=d.index, dtype='object')
    gen[d['born'] == 2] = '1st gen (foreign-born)'
    gen[(d['born'] == 1) & d['parborn'].isin([1, 2, 8])] = '2nd gen'
    gen[(d['born'] == 1) & (d['parborn'] == 0)] = '3rd+ gen'
    d['gen'] = gen
    d['cohort_band'] = _band(d['cohort'], COHORTS)
    d['period'] = _band(d['year'], PERIODS)

    def ind(cond, valid):
        v = cond.astype(float)
        v[~valid] = np.nan
        return v

    a = d['attend']
    d['weekly'] = ind(a >= 7, a.notna())
    d['monthly'] = ind(a >= 4, a.notna())
    d['never'] = ind(a == 0, a.notna())
    d['ba'] = ind(d['degree'] >= 3, d['degree'].notna())
    d['conservative'] = ind(d['polviews'] >= 5, d['polviews'].notna())
    p = d['partyid']
    d['republican'] = ind(p.between(4, 6), p.between(0, 6))
    d['abany_yes'] = ind(d['abany'] == 1, d['abany'].isin([1, 2]))
    d['bible_literal'] = ind(d['bible'] == 1, d['bible'].isin([1, 2, 3]))
    d['ever_married'] = ind(d['marital'] != 5, d['marital'].notna())
    d['strong'] = ind(d['reliten'] == 1, d['reliten'].isin([1, 2, 3]))
    d['pray_daily'] = ind(d['pray'] <= 2, d['pray'].notna())  # 1 several/day, 2 once a day
    d['childs_f'] = d['childs'].astype(float)  # top-coded at 8
    d['still_catholic'] = ind(d['relig'] == 2, d['relig16'].notna() & d['relig'].notna())
    d['convert'] = ind(d['relig16'] != 2, d['relig16'].notna())
    # Design: weights wtssps (all years, release 3a); strata/PSU from 1975. Stratum ids are
    # made unique per year; years without design codes are treated as one stratum with each
    # respondent its own PSU (simple random sampling approximation).
    d['w'] = d['wtssps'].astype(float).fillna(0.0)
    has = d['vstrat'].notna() & d['vpsu'].notna()
    d['strat'] = np.where(has, d['year'] * 10000 + d['vstrat'].fillna(0), d['year'] * 10000)
    d['psu'] = np.where(has, d['vpsu'].fillna(0), d['id'])
    return d
