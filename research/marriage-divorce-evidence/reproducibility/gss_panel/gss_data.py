"""Read the official NORC GSS panel files and build married-at-wave-t transition records.

Each record is one respondent married at wave t of a GSS panel, with predictors measured at
wave t and the marital status reported at a later wave. Shared recodes are also used by
cross_section.py on the cumulative 1972-2024 file.

Files (NORC, https://gss.norc.org/get-the-data/stata.html; see download.sh and SHA256SUMS):
  GSS_panel06w123_R6a - Stata.dta   2006-2008-2010 panel, 2,000 / 1,536 / 1,276 respondents
  GSS_panel08w123_R6 - stata.dta    2008-2010-2012 panel, 2,023 / 1,581 / 1,295
  GSS_panel2010w123_R6 - stata.dta  2010-2012-2014 panel, 2,044 / 1,551 / 1,304
  gss2020panel_r1a.dta              2016-2020 panel: 2,867 (2016) + 2,348 (2018) wave-1, 1,823 re-interviewed in 2020
"""
from pathlib import Path
import os
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = Path(os.environ.get('GSS_RAW', HERE / 'raw'))

PANELS = {
    '2006': dict(file='GSS_panel06w123_R6a - Stata.dta', years={'1': 2006, '2': 2008, '3': 2010},
                 counts={'1': 2000, '2': 1536, '3': 1276}),
    '2008': dict(file='GSS_panel08w123_R6 - stata.dta', years={'1': 2008, '2': 2010, '3': 2012},
                 counts={'1': 2023, '2': 1581, '3': 1295}),
    '2010': dict(file='GSS_panel2010w123_R6 - stata.dta', years={'1': 2010, '2': 2012, '3': 2014},
                 counts={'1': 2044, '2': 1551, '3': 1304}),
    '2020': dict(file='gss2020panel_r1a.dta', years={'1a': 2016, '1b': 2018, '2': 2020},
                 counts={'1a': 2867, '1b': 2348, '2': 1823}),
}

# Transitions: (panel, from-wave, to-wave, horizon in years, weight column, sample restriction).
# Weights follow NORC's release notes: WTPANNR12 for analyses of waves 1-2 only, WTPANNR123 for
# anything that uses wave 3; WTSSNR_2 is the recommended weight for the 2016-2020 panel.
TRANSITIONS = [
    *[(p, '1', '2', 2, 'wtpannr12') for p in ('2006', '2008', '2010')],
    *[(p, '2', '3', 2, 'wtpannr123') for p in ('2006', '2008', '2010')],
    ('2020', '1b', '2', 2, 'wtssnr_2'),
    *[(p, '1', '3', 4, 'wtpannr123') for p in ('2006', '2008', '2010')],
    ('2020', '1a', '2', 4, 'wtssnr_2'),
]

HAPPY3 = {1: 'Very happy', 2: 'Pretty happy', 3: 'Not too happy'}
DEGREE = {0: 'Less than high school', 1: 'High school', 2: 'Junior college', 3: 'Bachelor', 4: 'Graduate'}
WORK = {1: 'Full-time', 2: 'Part-time', 3: 'Not working', 4: 'Not working', 5: 'Retired',
        6: 'Other', 7: 'Keeping house', 8: 'Other'}
RELIG = {1: 'Protestant', 2: 'Catholic', 4: 'None', 3: 'Other', 5: 'Other', 6: 'Other', 7: 'Other',
         8: 'Other', 9: 'Other', 10: 'Other', 11: 'Other', 12: 'Other', 13: 'Other'}
HEALTH = {1: 'Excellent', 2: 'Good', 3: 'Fair', 4: 'Poor'}
AGREE4 = {1: 'Strongly agree', 2: 'Agree', 3: 'Disagree', 4: 'Strongly disagree'}
SEXFREQ = {0: 'Not at all', 1: 'Once a month or less', 2: 'Once a month or less',
           3: '2-3 times a month to weekly', 4: '2-3 times a month to weekly',
           5: '2+ times a week', 6: '2+ times a week'}
SATFIN = {1: 'Satisfied', 2: 'More or less', 3: 'Not at all'}
REGION = {1: 'Northeast', 2: 'Northeast', 3: 'Midwest', 4: 'Midwest', 5: 'South', 6: 'South', 7: 'South',
          8: 'West', 9: 'West'}
PLACE = {1: 'Large central city', 2: 'Large central city', 3: 'Suburb', 4: 'Suburb', 5: 'Other urban', 6: 'Rural'}
XMARSEX = {1: 'Always wrong', 2: 'Almost always wrong', 3: 'Sometimes or not wrong', 4: 'Sometimes or not wrong'}
YESNO = {1: 'Yes', 2: 'No'}

# Reference level first (OneHotEncoder drops it); 'Unknown' = not asked (split ballot), refused or don't know.
CATEGORIES = {
    'hapmar': ['Very happy', 'Pretty happy', 'Not too happy', 'Unknown'],
    'happy': ['Very happy', 'Pretty happy', 'Not too happy', 'Unknown'],
    'sex': ['Male', 'Female'],
    'race': ['White', 'Black', 'Other'],
    'degree': ['High school', 'Less than high school', 'Junior college', 'Bachelor', 'Graduate', 'Unknown'],
    'spouse_degree': ['High school', 'Less than high school', 'Junior college', 'Bachelor', 'Graduate', 'Unknown'],
    'work': ['Full-time', 'Part-time', 'Not working', 'Retired', 'Keeping house', 'Other', 'Unknown'],
    'spouse_work': ['Full-time', 'Part-time', 'Not working', 'Retired', 'Keeping house', 'Other', 'Unknown'],
    'family_income': ['$40k-$75k', 'Under $20k', '$20k-$40k', '$75k+', 'Unknown'],
    'religion': ['Protestant', 'Catholic', 'None', 'Other', 'Unknown'],
    'spouse_religion': ['Protestant', 'Catholic', 'None', 'Other', 'Unknown'],
    'same_religion': ['Same', 'Different', 'Unknown'],
    'divorced_before': ['No', 'Yes', 'Unknown'],
    'family_at_16': ['Both parents', 'Parents divorced or separated', 'Parent died', 'Other', 'Unknown'],
    'health': ['Excellent', 'Good', 'Fair', 'Poor', 'Unknown'],
    'fefam': ['Strongly agree', 'Agree', 'Disagree', 'Strongly disagree', 'Unknown'],
    'sexfreq': ['2-3 times a month to weekly', 'Not at all', 'Once a month or less', '2+ times a week', 'Unknown'],
    'evstray': ['No', 'Yes', 'Unknown'],
    'satfin': ['Satisfied', 'More or less', 'Not at all', 'Unknown'],
    'xmarsex': ['Always wrong', 'Almost always wrong', 'Sometimes or not wrong', 'Unknown'],
    'region': ['South', 'Northeast', 'Midwest', 'West'],
    'place': ['Suburb', 'Large central city', 'Other urban', 'Rural', 'Unknown'],
}
NUMERIC = ['age', 'childs', 'attend']


def lab(s, mapping):
    return s.map(mapping).fillna('Unknown')


def family_at_16(fam, dif):
    out = pd.Series('Other', index=fam.index)
    out[fam == 1] = 'Both parents'
    out[(fam != 1) & (dif == 2)] = 'Parents divorced or separated'
    out[(fam != 1) & (dif == 1)] = 'Parent died'
    out[fam.isna()] = 'Unknown'
    return out


def income_band(coninc):
    """CONINC is NORC's inflation-adjusted family income in constant 2000 dollars (2024 codebook)."""
    b = pd.cut(coninc, [-np.inf, 20000, 40000, 75000, np.inf], right=False,
               labels=['Under $20k', '$20k-$40k', '$40k-$75k', '$75k+'])
    return b.astype(object).where(coninc.notna(), 'Unknown')


def features(d, w):
    """Predictors measured at wave w (suffix), as model-ready columns."""
    g = lambda v: d[f'{v}_{w}'] if f'{v}_{w}' in d else pd.Series(np.nan, index=d.index)
    rel, sprel = g('relig'), g('sprel')
    f = pd.DataFrame(index=d.index)
    f['hapmar'] = lab(g('hapmar'), HAPPY3)
    f['happy'] = lab(g('happy'), HAPPY3)
    f['age'] = g('age').astype(float)
    f['sex'] = g('sex').map({1: 'Male', 2: 'Female'})
    f['race'] = g('race').map({1: 'White', 2: 'Black', 3: 'Other'})
    f['degree'] = lab(g('degree'), DEGREE)
    f['spouse_degree'] = lab(g('spdeg'), DEGREE)
    f['work'] = lab(g('wrkstat'), WORK)
    f['spouse_work'] = lab(g('spwrksta'), WORK)
    f['family_income'] = income_band(g('coninc'))
    f['religion'] = lab(rel, RELIG)
    f['spouse_religion'] = lab(sprel, RELIG)
    f['same_religion'] = np.where(rel.notna() & sprel.notna(), np.where(rel == sprel, 'Same', 'Different'), 'Unknown')
    f['attend'] = g('attend').astype(float)
    f['childs'] = g('childs').astype(float)
    f['divorced_before'] = lab(g('divorce'), YESNO)
    f['family_at_16'] = family_at_16(g('family16'), g('famdif16'))
    f['health'] = lab(g('health'), HEALTH)
    f['fefam'] = lab(g('fefam'), AGREE4)
    f['sexfreq'] = lab(g('sexfreq'), SEXFREQ)
    f['evstray'] = lab(g('evstray'), YESNO)
    f['satfin'] = lab(g('satfin'), SATFIN)
    f['xmarsex'] = lab(g('xmarsex'), XMARSEX)
    f['region'] = lab(g('region'), REGION)
    f['place'] = lab(g('srcbelt'), PLACE)
    return f


def read_panel(key):
    p = PANELS[key]
    d = pd.read_stata(RAW / p['file'], convert_categoricals=False)
    d.columns = [c.lower() for c in d.columns]
    return d


def respondents(d, key):
    """Check the file against NORC's documented wave counts."""
    c = PANELS[key]['counts']
    if key == '2020':
        n = dict(zip(['1a', '1b'], [(d.samptype == 2016).sum(), (d.samptype == 2018).sum()]))
        n['2'] = (d.panstat == 1).sum()
        by_cohort = d[d.panstat == 1].samptype.value_counts().to_dict()
        assert by_cohort == {2018: 1014, 2016: 809}, by_cohort  # codebook Table 2
    else:
        n = {'1': len(d), '2': (d.panstat_2 == 1).sum(), '3': (d.panstat_3 == 1).sum()}
        assert ((d.panstat_3 == 1) <= (d.panstat_2 == 1)).all()  # nobody skips wave 2
    n = {k: int(v) for k, v in n.items()}
    assert n == c, (key, n, c)
    return n


def transitions():
    """One record per (respondent married at wave t, follow-up wave). All attrition categories kept."""
    out, audit = [], {}
    cache = {}
    for panel, wf, wt, horizon, wcol in TRANSITIONS:
        if panel not in cache:
            cache[panel] = read_panel(panel)
            audit[f'panel_{panel}_documented_counts_verified'] = respondents(cache[panel], panel)
        d = cache[panel]
        married = d[f'marital_{wf}'] == 1
        if panel == '2020':
            pid = panel + '-' + d.yearid.astype(int).astype(str)
            reint = d.panstat == 1
            selected = d.panstat != 0
            died = d.panstat == 33
        else:
            pid = panel + '-' + d.id_1.astype(int).astype(str)
            ps = d[f'panstat_{wt}']
            reint = ps == 1
            selected = pd.Series(True, index=d.index)
            # Wave-3 status is 0 ("attrited") for people already lost at wave 2; take the first loss.
            died = (d.panstat_2 == 33) | (ps == 33)
            if wf == '2':
                married = married & (d.panstat_2 == 1)
        rec = features(d, wf)
        rec['pid'] = pid
        rec['panel'] = panel
        rec['from_year'] = PANELS[panel]['years'][wf]
        rec['to_year'] = PANELS[panel]['years'][wt]
        rec['horizon'] = horizon
        rec['transition'] = f'{panel}:{wf}->{wt}'
        rec['selected'] = selected
        rec['reinterviewed'] = reint
        rec['died'] = died
        m_to = d[f'marital_{wt}']
        m_mid = d['marital_2'] if (panel != '2020' and wf == '1' and wt == '3') else pd.Series(np.nan, index=d.index)
        dissolved = m_to.isin([3, 4]) | m_mid.isin([3, 4])
        rec['marital_to'] = m_to
        rec['status_to'] = np.select(
            [~reint, dissolved, m_to == 1, m_to == 2, m_to == 5],
            ['not re-interviewed', 'divorced or separated', 'married', 'widowed', 'never married (inconsistent)'],
            'marital status missing')
        rec['event'] = dissolved.astype(int)
        rec['divorced_only'] = ((m_to == 3) | (m_mid == 3)).astype(int)
        # Married at both waves but the "ever divorced or separated" item flips from no to yes:
        # a divorce and remarriage within the interval, or a reporting inconsistency.
        rec['flip_divorce_item'] = ((m_to == 1) & (d[f'divorce_{wf}'] == 2) & (d[f'divorce_{wt}'] == 1)).astype(int)
        rec['weight'] = d[wcol] if wcol in d else d[wcol.upper()]
        if wcol not in d and wcol.upper() not in d:
            raise KeyError(wcol)
        if panel == '2020':
            cohort = 2016 if wf == '1a' else 2018
            keep = married & (d.samptype == cohort)
        else:
            keep = married
        out.append(rec[keep])
    t = pd.concat(out, ignore_index=True)
    return t, audit


def analysis_sample(t, horizon):
    """Re-interviewed, married at t, with a usable follow-up status (widowhood and inconsistent reports excluded)."""
    s = t[(t.horizon == horizon) & (t.status_to.isin(['divorced or separated', 'married']))].copy()
    assert s.weight.notna().all() and (s.weight > 0).all()
    s['weight'] = s.weight / s.weight.mean()
    return s.reset_index(drop=True)
