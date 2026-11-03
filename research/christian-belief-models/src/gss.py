"""Load and recode the GSS 1972-2024 cumulative file for the belief-imputation experiments.

The raw file (gss7224_r3a.dta, see data/download.sh and data/SHA256SUMS) is read from
$GSS_DTA, or data/raw/GSS_stata/gss7224_r3a.dta. Only scripts and aggregate results are committed.

Codes are NORC's, checked against the file's own value labels (session 1, 2026-11-03):
  relig     1 protestant, 2 catholic, 10 orthodox-christian, 11 christian, 13 inter-nondenominational
  reltrad   1 evangelical, 2 mainline, 3 black protestant, 4 catholic (Steensland et al. 2000 scheme)
  attend    0 never ... 7 every week, 8 several times a week
  pray      1 several times a day, 2 once a day ... 6 never
  god       6 "know God really exists, no doubts"
  premarsx, xmarsex, homosex   1 always wrong ... 4 not wrong at all
  divlaw    1 easier, 2 more difficult, 3 stay as is
  abany     1 yes, 2 no
  marsame, cohabok   1 strongly agree ... 5 strongly disagree
  born      1 yes (in US), 2 no;  parborn 0 both born in US ... 8 neither
  popespks  1 certainly true ... 5 certainly false (Pope infallible on faith and morals)
"""
from pathlib import Path
import os
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parents[1]
DTA = Path(os.environ.get('GSS_DTA', HERE / 'data' / 'raw' / 'GSS_stata' / 'gss7224_r3a.dta'))

COLS = ('year id wtssps relig reltrad attend pray reliten postlife god bible relig16 premarsx xmarsex '
        'homosex divlaw abany marsame cohabok fefam marital divorce childs age sex educ race hispanic '
        'born parborn region polviews partyid realinc popespks').split()

# Binary targets: 1 = the answer consistent with Catholic teaching (Catechism paragraph in brackets),
# or the practice/belief level named. Built from raw codes; NaN where not asked or not answered.
TARGETS = {
    'attend_weekly':   ('attend',   lambda x: x >= 7,          'attends weekly or more [CCC 2180-2181]'),
    'pray_daily':      ('pray',     lambda x: x <= 2,          'prays daily or more'),
    'god_no_doubt':    ('god',      lambda x: x == 6,          'knows God exists, no doubts'),
    'afterlife':       ('postlife', lambda x: x == 1,          'believes in life after death [CCC 1020]'),
    'premarsx_wrong':  ('premarsx', lambda x: x == 1,          'sex before marriage always wrong [CCC 2353]'),
    'xmarsex_wrong':   ('xmarsex',  lambda x: x == 1,          'adultery always wrong [CCC 2380]'),
    'homosex_wrong':   ('homosex',  lambda x: x == 1,          'same-sex relations always wrong [CCC 2357]'),
    'samesex_marr_no': ('marsame',  lambda x: x >= 4,          'opposes same-sex marriage [CCC 2357, 1601]'),
    'cohab_not_ok':    ('cohabok',  lambda x: x >= 4,          'living together unmarried not acceptable [CCC 2390-2391]'),
    'abortion_no':     ('abany',    lambda x: x == 2,          'opposes abortion for any reason [CCC 2271]'),
    'divorce_harder':  ('divlaw',   lambda x: x == 2,          'divorce should be harder to get [CCC 2382-2384]'),
    'ever_divorced':   ('divorce',  lambda x: x == 1,          'ever divorced or separated (ever-married only; an outcome)'),
}
CATHOLIC_ONLY = {'pope_infallible': ('popespks', lambda x: x <= 2, 'Pope infallible on faith and morals [CCC 891]')}


def load(path=DTA):
    d = pd.read_stata(path, columns=COLS, convert_categoricals=False)
    return recode(d)


def recode(d):
    d = d.copy()
    d['tradition'] = np.select(
        [d.relig == 2, d.relig == 10, d.reltrad == 1, d.reltrad == 2, d.reltrad == 3],
        ['Catholic', 'Orthodox', 'Evangelical Protestant', 'Mainline Protestant', 'Black Protestant'],
        default='Other')
    # Immigrant generation: 1 = born abroad, 2 = US-born with at least one foreign-born parent,
    # 3 = US-born with both parents US-born. born/parborn were first asked in 1977.
    pb = d.parborn
    gen = np.where(d.born == 2, 1,
          np.where((d.born == 1) & (pb == 0), 3,
          np.where((d.born == 1) & pb.isin([1, 2, 4, 6, 8]), 2, np.nan)))
    d['generation'] = gen
    d['hispanic_any'] = np.where(d.hispanic.isna(), np.nan, (d.hispanic >= 2).astype(float))
    d['female'] = (d.sex == 2).astype(float).where(d.sex.notna())
    d['raised_catholic'] = (d.relig16 == 2).astype(float).where(d.relig16.notna())
    d['log_realinc'] = np.log1p(d.realinc)
    d['ever_married'] = d.marital.isin([1, 2, 3, 4])
    for name, (src, f, _) in {**TARGETS, **CATHOLIC_ONLY}.items():
        x = d[src]
        d[name] = np.where(x.isna(), np.nan, f(x).astype(float))
    d.loc[~d.ever_married, 'ever_divorced'] = np.nan
    d['w'] = d.wtssps.fillna(1.0)
    return d


# Features a model may see. A target's own raw source column is dropped when that target is predicted.
DEMOG = ['year', 'age', 'female', 'educ', 'race', 'hispanic_any', 'generation', 'region', 'polviews',
         'partyid', 'marital', 'childs', 'log_realinc', 'raised_catholic', 'reliten']
ITEMS = ['attend', 'pray', 'god', 'postlife', 'bible', 'premarsx', 'xmarsex', 'homosex', 'marsame',
         'cohabok', 'abany', 'divlaw', 'fefam', 'divorce']
CATEGORICAL = {'race', 'region', 'partyid', 'marital', 'generation', 'reliten', 'bible'}


def features_for(target):
    src = {**TARGETS, **CATHOLIC_ONLY}[target][0]
    drop = {src}
    if target == 'ever_divorced':
        drop |= {'marital'}  # current "divorced"/"separated" status is the outcome itself
    return [c for c in DEMOG + ITEMS if c not in drop]
