"""Harmonise first-marriage and first common-law union histories from four Statistics Canada
General Social Survey (GSS) Family cycles: 1995 (Cycle 10), 2006 (Cycle 20), 2011 (Cycle 25) and
2017 (Cycle 31) public-use microdata files (PUMF).

One row per respondent who was ever legally married: their FIRST marriage, followed from the
wedding (respondent's age at marriage) to the first of
  - separation (the respondent's age at the last separation from that spouse) or divorce/annulment
    without a recorded separation  -> event (the NSFG "disruption" outcome),
  - the spouse's death            -> censored (widowhood),
  - the interview                 -> censored.
Ages in the PUMF are in years to one decimal (some cycles cap extreme values; see METHODS.md).

Inputs are kept only when they are fixed at or before the wedding AND asked the same way of
intact and dissolved marriages in a cycle; everything else is flagged as a sensitivity input.
Run through train_models.py; `python3 -I harmonise.py` prints the audit.
"""
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / 'raw'
CYCLES = ['1995', '2006', '2011', '2017']
SURVEY_TIME = {'1995': 1995.5, '2006': 2006.5, '2011': 2011.5, '2017': 2017.5}  # mid-collection year
REGIONS = {1: 'Atlantic', 2: 'Quebec', 3: 'Ontario', 4: 'Prairies', 5: 'British Columbia'}
PROV_REGION = {10: 1, 11: 1, 12: 1, 13: 1, 24: 2, 35: 3, 46: 4, 47: 4, 48: 4, 59: 5}


def age(x):
    """PUMF ages: valid values are below 96 (96-99.9 / 996-999.9 are skip / not stated / don't know)."""
    x = pd.to_numeric(x, errors='coerce').astype(float)
    return x.where(x < 96)


def cat(x, mapping, default='Unknown'):
    return pd.to_numeric(x, errors='coerce').map(mapping).fillna(default)


def lang(x, multi=(4, 5, 6, 7), other=(3,)):
    m = {1: 'English', 2: 'French'}
    m.update({k: 'Other' for k in other})
    m.update({k: 'Multiple' for k in multi})
    return cat(x, m)


def read(name, cols):
    return pd.read_csv(RAW / name, usecols=lambda c: c in set(cols))


# ------------------------------------------------------------------------------------ outcomes
def outcome(df, marr, sep, div, dth, interview, ended):
    """t (years from wedding), event (separation/divorce), widowed, timing_missing.

    `ended`: boolean Series, the marriage is known to have ended (or the respondent is
    separated). Event time is the earlier of separation and divorce; widowhood without an
    earlier separation censors at the spouse's death."""
    s = pd.concat([sep, div], axis=1).min(axis=1)
    ev = s.notna()
    wid = ~ev & dth.notna()
    t = pd.Series(np.where(ev, s - marr, np.where(wid, dth - marr, interview - marr)), index=df.index)
    # An ended marriage with no usable end age cannot be placed in time.
    missing = ended & ~ev & ~wid
    return t, ev.astype(int), wid.astype(int), missing


def prior_union(rank, cu_starts, marr_age):
    """Lived common-law with someone else before this first marriage. The PUMF rank of the first
    marriage among all unions is used when stated; it is recoded 'not stated' whenever ANY union
    date is unknown, including unions after the marriage (more common after a dissolution), so a
    missing rank falls back to the start ages of common-law unions not followed by marriage."""
    before = np.zeros(len(marr_age), bool)
    for a in cu_starts:
        before |= (age(a) < marr_age).to_numpy()
    r = pd.to_numeric(rank, errors='coerce')
    return pd.Series(np.select([r == 1, r.between(2, 8)], ['No', 'Yes'], np.where(before, 'Yes', 'No')), index=marr_age.index)


def premarital_birth(child_ages, kinds, marr_age, birth_code=1):
    """'Yes' when any biological child's recorded birth age is below the age at marriage.
    Children whose birth age is not given count as not premarital (documented)."""
    yes = np.zeros(len(marr_age), bool)
    for a, k in zip(child_ages, kinds):
        a = age(a).to_numpy()
        bio = np.ones(len(a), bool) if k is None else (pd.to_numeric(k, errors='coerce').to_numpy() == birth_code)
        yes |= bio & (a < marr_age.to_numpy())
    return pd.Series(np.where(yes, 'Yes', 'No'), index=marr_age.index)


# ------------------------------------------------------------------------------------ cycles
def cycle_1995():
    main = read('gss1995_main.csv', ['RECID', 'WGHTFNL', 'PROV', 'DVSEX', 'DVAGEDCC', 'A2', 'A3', 'DVA75', 'DVR17',
                                     'DVR18CAP', 'DVR25', 'DVR27', 'R28', 'DVL30CO', 'DVH9', 'DVEVERMA', 'M1CURREN',
                                     'M1AGERES', 'M1MSSPOU', 'M1ASPDIF', 'M1CLRSSP', 'M1AGECL', 'M1END', 'M1AGESEP',
                                     'M1AGEDIV', 'M1AGDTHC', 'C1AGERES'])
    union = pd.read_csv(RAW / 'gss1995_union.csv')
    child = pd.read_csv(RAW / 'gss1995_child.csv', usecols=['RECID', 'CHDTYPE', 'DVD21'])
    assert len(main) == 10749 and len(union) == 10938 and len(child) == 19542, (len(main), len(union), len(child))
    m = main[main.M1CURREN.isin([1, 2])].copy()             # had a first marriage (7,468 in the codebook)
    out = pd.DataFrame(index=m.index)
    out['recid'] = m.RECID
    out['cycle'] = '1995'
    out['weight_raw'] = m.WGHTFNL
    out['respondent_sex'] = cat(m.DVSEX, {1: 'Male', 2: 'Female'})
    out['age_interview'] = age(m.DVAGEDCC).where(age(m.DVAGEDCC) < 80)   # 80.0 means 80 or older
    marr = age(m.M1AGERES)
    out['age_at_marriage'] = marr
    ended = m.M1END.isin([1, 2, 3, 4, 7])
    t, ev, wid, miss = outcome(m, marr, age(m.M1AGESEP), age(m.M1AGEDIV), age(m.M1AGDTHC), out.age_interview, ended)
    out['t'], out['event'], out['widowed'], out['end_timing_missing'] = t, ev, wid, miss
    out['end_not_stated'] = m.M1END.isin([96, 99])
    out['divorced_only'] = (m.M1END.isin([1, 4]) & ev.astype(bool)).astype(int)
    # Cohabitation with this spouse: asked only of people who ever lived common-law (DVH9 = 1).
    out['cohabited_first'] = np.select([m.M1CLRSSP == 1, m.M1CLRSSP == 2, m.DVH9 == 2], ['Yes', 'No', 'No'], 'Unknown')
    # Prior common-law union with someone else: the first marriage is not the respondent's first union.
    fm = union[union.UNIONTYP.isin([1, 2])].sort_values(['RECID', 'UNIONRNK'])
    first_rank = fm.groupby('RECID').UNIONRNK.first()
    rank = m.RECID.map(first_rank)
    clo = union[union.UNIONTYP == 3].copy()
    clo['k'] = clo.groupby('RECID').cumcount()
    wide = clo.pivot(index='RECID', columns='k', values='DVUNAGE')
    out['prior_union'] = prior_union(rank, [m.RECID.map(wide[k]) for k in wide.columns], marr)
    out['premarital_birth'] = premarital_birth(*_child_lists_1995(child, m.RECID), marr)
    out['intact_family_15'] = np.select([m.A3 == 1, m.A3 == 2, m.A2 == 3], ['Yes', 'No', 'No'], 'Unknown')
    out['born_outside_canada'] = cat(m.DVR17, {1: 'No', 2: 'Yes', 3: 'Yes', 4: 'Yes', 5: 'Yes', 6: 'Yes', 9: 'Yes'})
    out['first_language'] = lang(m.DVR25)
    out['region'] = m.PROV.map(PROV_REGION).map(REGIONS).fillna('Unknown')
    # Sensitivity / descriptive inputs.
    out['partner_age_gap'] = _gap_from_groups(m.M1ASPDIF)
    out['partner_prev_married'] = cat(m.M1MSSPOU, {1: 'Yes', 2: 'Yes', 3: 'No'})
    out['education_at_interview'] = cat(m.DVL30CO, {1: 'Bachelor+', 2: 'College/trade', 3: 'College/trade', 4: 'High school',
                                                    5: 'High school', 6: 'High school', 7: 'High school',
                                                    8: 'Less than high school', 9: 'Less than high school',
                                                    10: 'Less than high school'})
    out['religion_at_interview'] = cat(m.DVR27, {1: 'No affiliation', **{k: 'Affiliated' for k in range(2, 13)}})
    att = cat(m.R28, {1: 'Weekly', 2: 'Monthly', 3: 'Less than monthly', 4: 'Less than monthly', 5: 'Not at all'})
    out['attendance_at_interview'] = np.where(m.DVR27 == 1, 'Not at all', att)   # R28 not asked of "no religion"
    out['parents_ever_separated'] = cat(m.DVA75, {1: 'Yes', 2: 'No'})
    return out, None


def _child_lists_1995(child, recid):
    c = child.copy()
    c['k'] = c.groupby('RECID').cumcount()
    wide_age = c.pivot(index='RECID', columns='k', values='DVD21')
    wide_typ = c.pivot(index='RECID', columns='k', values='CHDTYPE')
    ages = [recid.map(wide_age[k]) for k in wide_age.columns]
    kinds = [recid.map(wide_typ[k]) for k in wide_typ.columns]
    return ages, kinds


def _gap_from_groups(code):
    """GSS 15-group respondent-vs-spouse age difference -> spouse minus respondent, in years
    (group mid-points: 11+ = 13, 6-10 = 8)."""
    older = {1: 13, 2: 8, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 0}   # respondent older by ...
    m = {k: -v for k, v in older.items()}
    m.update({9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 8, 15: 13})
    return pd.to_numeric(code, errors='coerce').map(m).astype(float)


def _gap_from_ages(resp_age, spouse_age):
    g = (age(spouse_age) - age(resp_age)).round()
    a = g.abs()
    return np.sign(g) * np.where(a >= 11, 13, np.where(a >= 6, 8, a))


def cycle_2006():
    cols = ['RECID', 'WGHT_PER', 'AGEC', 'SEX', 'MARSTAT', 'LEG_MARSTAT', 'REGION', 'EVER_CL', 'EVER_LEGMARR',
            'MA0_Q220', 'MA0_RANK', 'AGE_MA0C', 'AGE_SEP_MA0C', 'MA0_Q120', 'AGEDIFGR_MA0', 'MA0_Q150', 'AGE_CL_MA0',
            'MA1_RANK', 'AGE_MA1', 'AGE_CL_MA1', 'AGE_SEP_MA1', 'AGE_DIV_MA1', 'AGE_DTH_MA1C', 'GU_Q110', 'GU_Q120',
            'BRTHREGC', 'LANCH', 'RELIG6', 'RELIGATT', 'EDU5', 'AGE_CU1', 'AGE_CU2', 'AGE_CU3', 'AGE_CU4'] + \
           [f'AGE_CHDBORN_{k}' for k in range(1, 9)] + [f'RCI_Q130_0{k}' for k in range(1, 9)] + \
           [f'WTBS_{i:03d}' for i in range(1, 501)]
    d = read('gss2006.csv', cols)
    assert len(d) == 23608, len(d)
    first_is_current = d.MA0_Q220 == 1
    has_ma1 = age(d.AGE_MA1).notna() | d.AGE_MA1.isin([999.8, 999.9]) | d.MA1_RANK.between(1, 98)
    keep = d.EVER_LEGMARR.eq(1) & (first_is_current | (d.MA0_Q220 != 1) & has_ma1)
    d = d[keep].copy()
    cur = d.MA0_Q220 == 1
    out = pd.DataFrame(index=d.index)
    out['recid'], out['cycle'], out['weight_raw'] = d.RECID, '2006', d.WGHT_PER
    out['respondent_sex'] = cat(d.SEX, {1: 'Male', 2: 'Female'})
    ai = pd.to_numeric(d.AGEC, errors='coerce').astype(float)
    out['age_interview'] = (ai + 0.5).where(ai < 80)            # whole years in this cycle
    marr = age(d.AGE_MA0C).where(cur, age(d.AGE_MA1))
    out['age_at_marriage'] = marr
    sep = age(d.AGE_SEP_MA0C).where(cur, age(d.AGE_SEP_MA1))
    div = age(d.AGE_DIV_MA1).where(~cur)
    dth = age(d.AGE_DTH_MA1C).where(~cur)
    ended = (~cur) | (d.LEG_MARSTAT == 2)
    t, ev, wid, miss = outcome(d, marr, sep, div, dth, out.age_interview, ended)
    out['t'], out['event'], out['widowed'], out['end_timing_missing'] = t, ev, wid, miss
    out['end_not_stated'] = False
    out['divorced_only'] = (div.notna() & ev.astype(bool)).astype(int)
    # Cohabited with this spouse: MA0_Q150 for a current first marriage; for an ended first marriage
    # the PUMF has only the age at the start of that common-law (present = Yes, not asked = No).
    cl1 = pd.to_numeric(d.AGE_CL_MA1, errors='coerce')
    co_ma1 = np.select([age(cl1).notna(), cl1 == 999.7], ['Yes', 'No'], 'Unknown')
    co_ma0 = np.select([d.MA0_Q150 == 1, d.MA0_Q150 == 2, (d.MA0_Q150 == 7) & (d.EVER_CL == 2)], ['Yes', 'No', 'No'], 'Unknown')
    out['cohabited_first'] = np.where(cur, co_ma0, co_ma1)
    rank = pd.to_numeric(d.MA0_RANK.where(cur, d.MA1_RANK), errors='coerce').where(lambda r: r < 90)
    out['prior_union'] = prior_union(rank, [d[f'AGE_CU{k}'] for k in range(1, 5)], marr)
    out['premarital_birth'] = premarital_birth([d[f'AGE_CHDBORN_{k}'] for k in range(1, 9)],
                                               [d[f'RCI_Q130_0{k}'] for k in range(1, 9)], marr)
    out['intact_family_15'] = np.select([d.GU_Q120 == 1, d.GU_Q120 == 2, d.GU_Q110 == 3], ['Yes', 'No', 'No'], 'Unknown')
    out['born_outside_canada'] = cat(d.BRTHREGC, {1: 'No', 2: 'No', 3: 'No', 4: 'Yes', 5: 'Yes', 6: 'Yes'})
    out['first_language'] = lang(d.LANCH)
    out['region'] = cat(d.REGION, REGIONS)
    out['partner_age_gap'] = np.nan              # asked only for the current marriage in 2006
    out['partner_prev_married'] = 'Not asked'
    out['education_at_interview'] = cat(d.EDU5, {1: 'Bachelor+', 2: 'College/trade', 3: 'High school', 4: 'High school',
                                                 5: 'Less than high school'})
    out['religion_at_interview'] = cat(d.RELIG6, {1: 'No affiliation', 2: 'Affiliated', 3: 'Affiliated', 4: 'Affiliated', 5: 'Affiliated'})
    out['attendance_at_interview'] = cat(d.RELIGATT, {1: 'Weekly', 2: 'Monthly', 3: 'Less than monthly',
                                                      4: 'Less than monthly', 5: 'Not at all'})
    out['parents_ever_separated'] = 'Not asked'
    return out, d[[f'WTBS_{i:03d}' for i in range(1, 501)]].to_numpy(np.float64)


def cycle_2011():
    cols = ['RECID', 'WGHT_PER', 'AGEDC', 'SEX', 'MARSTAT', 'REGION', 'EVER_CL', 'EVER_LEGMARR', 'MA0_Q108',
            'MA0_Q220', 'MA0_RANKC', 'AGE_MA0C', 'AGE_SEP_MA0C', 'AGEDIFGR_MA0', 'MA0_Q150',
            'MA1_RANKC', 'AGE_MA1C', 'AGEDIFGR_MA1', 'MA1_Q150', 'MA1_Q170', 'AGE_SEP_MA1C', 'AGE_DIV_MA1C',
            'GU_Q110', 'GU_Q120', 'BRTHREGC', 'LANCH', 'RELIG6C', 'RELIGATT', 'EDU5',
            'AGE_CU1C', 'AGE_CU2C', 'AGE_CU3C'] + \
           [f'AGE_CHDBORN_{k}C' for k in range(1, 8)] + [f'WTBS_{i:03d}' for i in range(1, 501)]
    d = read('gss2011.csv', cols)
    assert len(d) == 22435, len(d)
    cur = d.MA0_Q220 == 1
    keep = d.EVER_LEGMARR.eq(1) & (cur | ((d.MA0_Q220 != 1) & d.MA1_Q170.between(1, 9)))
    d = d[keep].copy()
    cur = d.MA0_Q220 == 1
    out = pd.DataFrame(index=d.index)
    out['recid'], out['cycle'], out['weight_raw'] = d.RECID, '2011', d.WGHT_PER
    out['respondent_sex'] = cat(d.SEX, {1: 'Male', 2: 'Female'})
    out['age_interview'] = age(d.AGEDC).where(age(d.AGEDC) < 80)
    marr = age(d.AGE_MA0C).where(cur, age(d.AGE_MA1C))
    out['age_at_marriage'] = marr
    typ = d.MA1_Q170.where(~cur)
    sep = age(d.AGE_SEP_MA0C).where(cur, age(d.AGE_SEP_MA1C).where(typ.isin([1, 2])))
    div = age(d.AGE_DIV_MA1C).where(~cur & typ.isin([1, 4]))
    # 2011 PUMF gives no age at the first spouse's death; widowhood (type 3) cannot be timed.
    dth = pd.Series(np.nan, index=d.index)
    ended = (~cur & typ.isin([1, 2, 4, 5])) | (cur & (d.MARSTAT == 4))
    t, ev, wid, miss = outcome(d, marr, sep, div, dth, out.age_interview, ended)
    out['t'], out['event'], out['widowed'], out['end_timing_missing'] = t, ev, wid, miss
    out['widowed_untimed'] = (~cur & (typ == 3))
    out['end_not_stated'] = ~cur & typ.isin([5, 8, 9])
    out['divorced_only'] = (div.notna() & ev.astype(bool)).astype(int)
    co_ma1 = np.select([d.MA1_Q150 == 1, d.MA1_Q150 == 2, (d.MA1_Q150 == 7) & (d.EVER_CL == 2)], ['Yes', 'No', 'No'], 'Unknown')
    co_ma0 = np.select([d.MA0_Q150 == 1, d.MA0_Q150 == 2, (d.MA0_Q150 == 7) & (d.EVER_CL == 2)], ['Yes', 'No', 'No'], 'Unknown')
    out['cohabited_first'] = np.where(cur, co_ma0, co_ma1)
    rank = pd.to_numeric(d.MA0_RANKC.where(cur, d.MA1_RANKC), errors='coerce').where(lambda r: r < 90)
    out['prior_union'] = prior_union(rank, [d[f'AGE_CU{k}C'] for k in range(1, 4)], marr)
    out['premarital_birth'] = premarital_birth([d[f'AGE_CHDBORN_{k}C'] for k in range(1, 8)], [None] * 7, marr)
    out['intact_family_15'] = np.select([d.GU_Q120 == 1, d.GU_Q120 == 2, d.GU_Q110 == 3], ['Yes', 'No', 'No'], 'Unknown')
    out['born_outside_canada'] = cat(d.BRTHREGC, {1: 'No', 2: 'No', 3: 'No', 4: 'Yes', 5: 'Yes', 6: 'Yes', 99: 'Yes'})
    out['first_language'] = lang(d.LANCH)
    out['region'] = cat(d.REGION, REGIONS)
    out['partner_age_gap'] = _gap_from_groups(d.AGEDIFGR_MA0.where(cur, d.AGEDIFGR_MA1))
    out['partner_prev_married'] = 'Not asked'
    out['education_at_interview'] = cat(d.EDU5, {1: 'Bachelor+', 2: 'College/trade', 3: 'High school', 4: 'High school',
                                                 5: 'Less than high school'})
    out['religion_at_interview'] = cat(d.RELIG6C, {1: 'No affiliation', 2: 'Affiliated', 3: 'Affiliated', 4: 'Affiliated', 5: 'Affiliated'})
    out['attendance_at_interview'] = cat(d.RELIGATT, {1: 'Weekly', 2: 'Monthly', 3: 'Less than monthly',
                                                      4: 'Less than monthly', 5: 'Not at all'})
    out['parents_ever_separated'] = 'Not asked'
    return out, d[[f'WTBS_{i:03d}' for i in range(1, 501)]].to_numpy(np.float64)


def cycle_2017():
    cols = ['PUMFID', 'WGHT_PER', 'AGEDC', 'SEX', 'MARSTAT', 'REGION', 'EVERCL', 'EVERMAR',
            'MA0_220', 'MA0RNKC', 'AGEMA0C', 'ASEPMA0C', 'APRMA0C', 'MA0_150',
            'MA1RNKC', 'AGEMA1C', 'APRMA1C', 'MA1_150', 'MA1_170', 'ASEPMA1C', 'ADIVMA1C', 'ADTHMA1C',
            'GU_110', 'GU_120', 'APARSEPC', 'APARDIVC', 'BRTHCAN', 'LANMT', 'RELIGFLG', 'REE_02', 'EHG3_01B', 'ACU1C', 'ACU2C', 'ACU3C'] + \
           [f'ACHB{k}C' for k in range(1, 8)] + [f'RCI30_{k}' for k in range(1, 8)] + [f'WTBS_{i:03d}' for i in range(1, 501)]
    d = read('gss2017.csv', cols)
    assert len(d) == 20602, len(d)
    cur = d.MA0_220 == 1
    keep = d.EVERMAR.eq(1) & (cur | ((d.MA0_220 != 1) & d.MA1_170.between(1, 9)))
    d = d[keep].copy()
    cur = d.MA0_220 == 1
    out = pd.DataFrame(index=d.index)
    out['recid'], out['cycle'], out['weight_raw'] = d.PUMFID, '2017', d.WGHT_PER
    out['respondent_sex'] = cat(d.SEX, {1: 'Male', 2: 'Female'})
    out['age_interview'] = age(d.AGEDC).where(age(d.AGEDC) < 80)
    marr = age(d.AGEMA0C).where(cur, age(d.AGEMA1C))
    out['age_at_marriage'] = marr
    typ = d.MA1_170.where(~cur)
    sep = age(d.ASEPMA0C).where(cur, age(d.ASEPMA1C).where(typ.isin([1, 2])))
    div = age(d.ADIVMA1C).where(~cur & typ.isin([1, 4]))
    dth = age(d.ADTHMA1C).where(~cur & typ.isin([2, 3]))
    ended = (~cur & typ.isin([1, 2, 3, 4, 5])) | (cur & (d.MARSTAT == 4))
    t, ev, wid, miss = outcome(d, marr, sep, div, dth, out.age_interview, ended)
    out['t'], out['event'], out['widowed'], out['end_timing_missing'] = t, ev, wid, miss
    out['end_not_stated'] = ~cur & typ.isin([5, 7, 8, 9])
    out['divorced_only'] = (div.notna() & ev.astype(bool)).astype(int)
    co_ma1 = np.select([d.MA1_150 == 1, d.MA1_150 == 2, (d.MA1_150 == 6) & (d.EVERCL == 2)], ['Yes', 'No', 'No'], 'Unknown')
    co_ma0 = np.select([d.MA0_150 == 1, d.MA0_150 == 2, (d.MA0_150 == 6) & (d.EVERCL == 2)], ['Yes', 'No', 'No'], 'Unknown')
    out['cohabited_first'] = np.where(cur, co_ma0, co_ma1)
    rank = pd.to_numeric(d.MA0RNKC.where(cur, d.MA1RNKC), errors='coerce').where(lambda r: r < 90)
    out['prior_union'] = prior_union(rank, [d[f'ACU{k}C'] for k in range(1, 4)], marr)
    out['premarital_birth'] = premarital_birth([d[f'ACHB{k}C'] for k in range(1, 8)],
                                               [d[f'RCI30_{k}'] for k in range(1, 8)], marr)
    out['intact_family_15'] = np.select([d.GU_120 == 1, d.GU_120 == 2, d.GU_110 == 3], ['Yes', 'No', 'No'], 'Unknown')
    out['born_outside_canada'] = cat(d.BRTHCAN, {1: 'No', 2: 'Yes'})
    out['first_language'] = lang(d.LANMT, multi=(4, 5, 6, 7), other=(3, 8))
    out['region'] = cat(d.REGION, REGIONS)
    out['partner_age_gap'] = _gap_from_ages(d.AGEMA0C.where(cur, d.AGEMA1C), d.APRMA0C.where(cur, d.APRMA1C))
    out['partner_prev_married'] = 'Not asked'
    out['education_at_interview'] = cat(d.EHG3_01B, {1: 'Less than high school', 2: 'High school', 3: 'College/trade',
                                                     4: 'College/trade', 5: 'College/trade', 6: 'Bachelor+', 7: 'Bachelor+'})
    out['religion_at_interview'] = cat(d.RELIGFLG, {1: 'Affiliated', 2: 'No affiliation'})
    out['attendance_at_interview'] = cat(d.REE_02, {1: 'Weekly', 2: 'Monthly', 3: 'Less than monthly',
                                                    4: 'Less than monthly', 5: 'Not at all'})
    ps = age(d.APARSEPC)
    out['parents_ever_separated'] = np.where(ps.notna() | age(d.APARDIVC).notna(), 'Yes', 'No')
    return out, d[[f'WTBS_{i:03d}' for i in range(1, 501)]].to_numpy(np.float64)


SHIPPED_NUMERIC = ['marriage_years', 'age_at_marriage', 'wedding_year']
SHIPPED_CATEGORICAL = ['respondent_sex', 'cohabited_first', 'prior_union', 'premarital_birth', 'intact_family_15',
                       'born_outside_canada', 'first_language', 'region', 'survey_cycle']


BOOT_GROUPS = {'1995': 'A', '2017': 'A', '2006': 'B', '2011': 'B'}
BOOT_FACTOR = {'A': 1.0, 'B': 25.0}


def impute_2011_widowhood(df, donors, rng):
    """2011 PUMF gives no age at the first spouse's death. A widowed first marriage is censored at
    an imputed death time: the share of the wedding-to-interview span at which donors (widowed
    first marriages in 2006 and 2017, same sex and wedding decade) lost their spouse. Only the
    censoring time of non-events is imputed; no event is created or removed."""
    rec = df.widowed_untimed.astype(bool) & df.age_interview.notna() & df.age_at_marriage.notna()
    span = (df.age_interview - df.age_at_marriage)
    dec = lambda x: (np.floor(x / 10) * 10).astype(int)
    d = donors.assign(ratio=(donors.t / (donors.age_interview - donors.age_at_marriage)).clip(0, 1),
                      dec=dec(donors.wedding_year))
    wy = SURVEY_TIME['2011'] - df.age_interview + df.age_at_marriage
    out_t = df.t.copy()
    for i in np.where(rec)[0]:
        idx = df.index[i]
        pool = d[(d.respondent_sex == df.respondent_sex.iat[i]) & (d.dec == dec(pd.Series([wy.iat[i]])).iat[0])]
        if len(pool) < 20:
            pool = d[d.respondent_sex == df.respondent_sex.iat[i]]
        out_t.at[idx] = float(pool.ratio.iat[rng.integers(len(pool))]) * span.iat[i]
    df = df.copy()
    df.loc[rec, 't'] = out_t[rec]
    df.loc[rec, 'widowed'] = 1
    df['widow_death_imputed'] = rec
    df['widowed_untimed'] = df.widowed_untimed & ~rec
    return df


def first_marriages(min_wedding_year=1950, n_boot=500, seed=20261020):
    """Pooled analysis file and the matching bootstrap replicate weights (rows x n_boot).

    Weights are rescaled to mean 1 within each cycle (each cycle counts by its sample size).
    Replicate weights are returned on the same scale, with `boot_group` saying how to combine
    them (see bootstrap_variance): 2006 and 2011 ship MEAN bootstrap weights (each the average
    of R=25 bootstrap samples), 2017 ships standard bootstrap weights, and 1995 ships none, so
    it gets a with-replacement person resample (Poisson(1) multipliers) of its final weight,
    which ignores its design."""
    rng = np.random.default_rng(seed)
    raw = {c: fn() for c, fn in zip(CYCLES, [cycle_1995, cycle_2006, cycle_2011, cycle_2017])}
    parts, boots, audit = [], [], {}
    donors = []
    for c in CYCLES:
        df, bw = raw[c]
        df['wedding_year'] = SURVEY_TIME[c] - df.age_interview + df.age_at_marriage
        if c in ('2006', '2017'):
            ok = df.widowed.astype(bool) & df.age_interview.notna() & df.age_at_marriage.notna() & (df.t > 0)
            donors.append(df[ok])
    donors = pd.concat(donors)
    for c in CYCLES:
        df, bw = raw[c]
        a = dict(first_marriages_in_file=len(df), events_raw=int(df.event.sum()))
        if c == '2011':
            df = impute_2011_widowhood(df, donors, rng)
            a['widowed_death_age_imputed'] = int(df.widow_death_imputed.sum())
        drop = {}
        bad_age = df.age_interview.isna()
        drop['age_80_plus_or_unknown'] = int(bad_age.sum())
        no_marr = ~bad_age & df.age_at_marriage.isna()
        drop['age_at_marriage_unknown'] = int(no_marr.sum())
        nostate = df.end_not_stated.astype(bool) | df.end_timing_missing.astype(bool)
        if 'widowed_untimed' in df:
            nostate |= df.widowed_untimed.astype(bool)
        nostate &= ~bad_age & ~no_marr
        drop['end_type_or_end_age_unknown'] = int(nostate.sum())
        ok = ~bad_age & ~no_marr & ~nostate
        neg = ok & (df.t < -0.15)
        drop['end_before_wedding'] = int(neg.sum())
        ok &= ~neg
        early = ok & (df.wedding_year < min_wedding_year)
        drop[f'wedding_before_{min_wedding_year}'] = int(early.sum())
        ok &= ~early
        df = df[ok].copy()
        df['t'] = df.t.clip(lower=0.05)
        df['birth_year'] = SURVEY_TIME[c] - df.age_interview
        w = df.weight_raw.to_numpy(float)
        if bw is None:
            b = w[:, None] * rng.poisson(1.0, size=(len(df), n_boot))
        else:
            b = bw[ok.to_numpy()][:, :n_boot]
        mean_w = w.mean()
        df['weight'] = w / mean_w
        df['boot_group'] = BOOT_GROUPS[c]
        a.update(dropped=drop, analysed=len(df), events=int(df.event.sum()),
                 divorced=int(df.divorced_only.sum()), widowed_censored=int(df.widowed.sum()),
                 weighted_population_millions=round(float(w.sum()) / 1e6, 3))
        audit[c] = a
        parts.append(df)
        boots.append((b / mean_w).astype(np.float32))
    p = pd.concat(parts, ignore_index=True)
    p['survey_cycle'] = p.cycle
    p['id'] = p.cycle + '_' + p.recid.astype(str)
    return p, np.vstack(boots), audit


def bootstrap_variance(theta, rep_a, rep_b):
    """Design variance of a pooled estimate. rep_a[b]: estimate with group-A rows (1995, 2017)
    at replicate b and group-B rows at full weight; rep_b[b]: the reverse. Group B (2006, 2011)
    are mean-bootstrap replicates, so their spread is scaled by R = 25 (user guides)."""
    rep_a, rep_b = np.asarray(rep_a), np.asarray(rep_b)
    return np.nanmean((rep_a - theta) ** 2, axis=0) + 25.0 * np.nanmean((rep_b - theta) ** 2, axis=0)


def replicate_weights(p, B, b, group):
    """Weights for replicate b with only `group` rows perturbed."""
    w = p.weight.to_numpy().copy()
    sel = (p.boot_group == group).to_numpy()
    w[sel] = B[sel, b]
    return w


if __name__ == '__main__':
    import json
    p, B, audit = first_marriages()
    print(json.dumps(audit, indent=1))
    print(p.groupby('cycle').agg(n=('id', 'size'), events=('event', 'sum'), wy_min=('wedding_year', 'min'),
                                 wy_max=('wedding_year', 'max'), t_mean=('t', 'mean')))
    for c in SHIPPED_CATEGORICAL + ['partner_prev_married', 'education_at_interview', 'religion_at_interview',
                                    'attendance_at_interview', 'parents_ever_separated']:
        print(pd.crosstab(p[c], p.cycle))
