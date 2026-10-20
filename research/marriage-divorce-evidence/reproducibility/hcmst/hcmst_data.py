"""Read the official HCMST Stata files and build one row per couple (wave-1 inputs) plus
person-period rows (discrete-time break-up hazard) for two cohorts:

- HCMST 2009 (waves 1-3 public version 3.04, wave 4 supplement 1.02, wave 5 supplement 1.0,
  wave 6 supplement 1.0): partnered respondents at wave 1 (Feb-Apr 2009), followed to 2017.
- HCMST 2017-2022 (combined public version 2.2): partnered respondents in July 2017, followed
  in 2020 and 2022. Used only as an external validation cohort.

Every input is measured at (or before) wave 1. The respondent reports for both partners.
"""
from pathlib import Path
import os
import numpy as np
import pandas as pd
import pyreadstat

HERE = Path(__file__).resolve().parent
RAW = Path(os.environ.get('HCMST_RAW', HERE / 'raw'))

# Follow-up periods of the 2009 cohort. Period p runs from the median completion month of wave p
# to that of wave p+1 (HCMST user guide v5 and the *_yrmo variables): 2009-02, 2010-03, 2011-04,
# 2013-03, 2014-12, 2017-07.
WAVE_MONTHS = [(2009, 2), (2010, 3), (2011, 4), (2013, 3), (2014, 12), (2017, 7)]
CUT = [y * 12 + m - 1 for y, m in WAVE_MONTHS]
PERIODS = [dict(period=str(p + 1), start=f'{WAVE_MONTHS[p][0]}-{WAVE_MONTHS[p][1]:02d}',
                end=f'{WAVE_MONTHS[p + 1][0]}-{WAVE_MONTHS[p + 1][1]:02d}',
                years=round((CUT[p + 1] - CUT[p]) / 12, 3),
                years_since_start_at_end=round((CUT[p + 1] - CUT[0]) / 12, 3)) for p in range(5)]

RQ = {5: 'Excellent', 4: 'Good', 3: 'Fair', 2: 'Poor or very poor', 1: 'Poor or very poor'}
CPI_U = {2009: 214.537, 2017: 245.120}  # BLS CPI-U annual averages (1982-84=100)


def read(name, **kw):
    return pyreadstat.read_dta(str(RAW / name), **kw)


def race4(code):
    """HCMST 2009 respondent_race / partner_race (6 categories) -> 4 groups."""
    return {1: 'White', 2: 'Black', 6: 'Hispanic', 3: 'Other', 4: 'Other', 5: 'Other'}.get(code, 'Unknown')


def couple_race(a, b):
    if 'Unknown' in (a, b):
        return 'Unknown'
    return f'Both {a}' if a == b else 'Interracial'


def couple_type(same_sex, gender):
    if same_sex != same_sex:
        return 'Unknown'
    if same_sex == 0:
        return 'Man-woman'
    return 'Two men' if gender == 1 else 'Two women'


def party_pair(r, p):
    """r, p in {'Republican', 'Democrat', 'Other'}."""
    if r == p and r in ('Republican', 'Democrat'):
        return f'Both {r}s'
    if {r, p} == {'Republican', 'Democrat'}:
        return 'One Republican, one Democrat'
    return 'Other or independent'


def edu_years_2009(code):
    """ppeduc / q10 codes (1-14) to years, as in HCMST's own respondent_yrsed recode."""
    return {1: 0, 2: 2.5, 3: 5.5, 4: 7.5, 5: 9, 6: 10, 7: 11, 8: 12, 9: 12, 10: 13, 11: 14, 12: 16,
            13: 18, 14: 20}.get(code, np.nan)


def how_met(online, friends, family, cowork, school, college, bar, church, answered):
    if online == 1:
        return 'Online'
    if not answered:
        return 'Unknown'
    for flag, name in [(friends, 'Through friends'), (family, 'Through family'), (cowork, 'Work or coworkers'),
                       (school, 'School or college'), (college, 'School or college'), (bar, 'Bar or restaurant'),
                       (church, 'Church')]:
        if flag == 1:
            return name
    return 'Other'


NUMERIC = ['mean_age', 'age_gap', 'relationship_years', 'edu_years_mean', 'edu_gap', 'hh_income_k', 'children_in_hh']
CORE_CATEGORICAL = ['relationship_quality', 'married', 'cohabiting', 'couple_type', 'couple_race', 'party_pair',
                    'how_met', 'prior_marriage', 'earnings']
FULL_CATEGORICAL = CORE_CATEGORICAL + ['religion_pair', 'parental_approval']


def couples_2009():
    a, ma = read('HCMST_ver_3.04.dta')
    b, _ = read('wave_4_supplement_v1_2.dta')
    c, _ = read('HCMST_wave_5_supplement_ver_1.dta')
    d, md = read('HCMST_wave_6_public_v1.dta')
    assert len(a) == 4002 and len(b) == 4002 and len(c) == 4002 and len(d) == 640
    df = a.merge(b, on='caseid_new').merge(c, on='caseid_new').merge(d, on='caseid_new', how='left')
    audit = dict(respondents=len(df), partnered_qflag=int((df.qflag == 1).sum()),
                 wave2_completed=int((df.w2_f1complete == 1).sum()), wave3_completed=int((df.w3_complete == 1).sum()),
                 wave4_completed=int((df.w4_complete == 1).sum()), wave5_completed=int((df.w5_complete == 1).sum()),
                 wave6_records=int(df.w6_broke_up.notna().sum()))
    df = df[df.qflag == 1].copy()

    def year_from(col, meta):
        lab = meta.variable_value_labels.get(col, {})
        return df[col].map(lambda v: float(lab[v]) if v in lab and str(lab[v]).isdigit() else v)

    df['w3_mby'] = year_from('w3_mbtiming_year', ma)
    df['w6_mby'] = year_from('w6_mbtiming_Year', md)
    df['w6_nmby'] = year_from('w6_nonmbtiming_Year', md)

    hhinc = df.groupby('ppincimp').hhinc.first()  # dollar value HCMST assigns to each income code
    rows = []
    for r in df.itertuples(index=False):
        rr, pr = race4(r.respondent_race), race4(r.partner_race)
        rparty = {1: 'Republican', 3: 'Democrat'}.get(r.pppartyid3, 'Other')
        pparty = {1: 'Republican', 2: 'Democrat'}.get(r.q12, 'Other')
        rrel, prel = r.papreligion, r.q7b
        if rrel != rrel or prel != prel or prel < 0:
            religion = 'Unknown'
        elif rrel == 13 and prel == 13:
            religion = 'Both no religion'
        elif 13 in (rrel, prel):
            religion = 'One no religion'
        else:
            religion = 'Same religion' if rrel == prel else 'Different religions'
        if r.married == 1:
            prior = {1: 'No', 2: 'Yes', 3: 'Yes', 4: 'Yes'}.get(r.q17a, 'Unknown')
        else:
            prior = {1: 'No', 2: 'Yes', 3: 'Yes', 4: 'Yes', 5: 'Yes'}.get(r.q17b, 'Unknown')
        page = r.q9 if r.q9 == r.q9 and r.q9 >= 0 else np.nan
        redu, pedu = edu_years_2009(r.ppeduc), edu_years_2009(r.q10)
        rows.append(dict(
            id=int(r.caseid_new), weight=r.weight2,
            relationship_quality=RQ.get(r.relationship_quality, 'Unknown'),
            married='Yes' if r.married == 1 else 'No',
            cohabiting={1: 'Yes', 0: 'No'}.get(r.coresident, 'Unknown'),
            couple_type=couple_type(r.same_sex_couple, r.ppgender),
            couple_race=couple_race(rr, pr),
            party_pair=party_pair(rparty, pparty),
            how_met=how_met(r.either_internet_adjusted, r.met_through_friends, r.met_through_family,
                            r.met_through_as_coworkers, r.q24_school, r.q24_college, r.q24_bar_restaurant,
                            r.q24_church, r.q24_met_online == r.q24_met_online),
            prior_marriage=prior,
            earnings={1: 'One earned more', 3: 'One earned more', 2: 'About equal'}.get(r.q23, 'Unknown'),
            religion_pair=religion,
            parental_approval=({1: 'Approve', 2: 'Neutral or unsure', 4: 'Neutral or unsure', 3: 'Disapprove'}.get(r.q30, 'Unknown')
                               if r.q30 == r.q30 else 'Not asked (no living parent)'),
            mean_age=(r.ppage + page) / 2 if page == page else np.nan,
            age_gap=abs(r.ppage - page) if page == page else np.nan,
            relationship_years=r.how_long_relationship,
            edu_years_mean=(redu + pedu) / 2 if pedu == pedu else np.nan,
            edu_gap=abs(redu - pedu) if pedu == pedu else np.nan,
            hh_income_k=hhinc[r.ppincimp] / 1000,
            children_in_hh=float(r.children_in_hh),
        ))
    couples = pd.DataFrame(rows)
    couples['weight'] = couples.weight / couples.weight.mean()

    # Outcomes. w{k}_broke_up: 0 still together, 1 broke up (divorce, separation or break-up),
    # 2 partner died; missing when not interviewed at wave k.
    st = {k: df[f'w{k}_broke_up'].to_numpy() for k in range(2, 7)}
    timing = {3: [('w3_mby', 'w3_mbtiming_month'), ('w3_nonmbtiming_year', 'w3_nonmbtiming_month')],
              4: [('w4_mbtiming_year', 'w4_mbtiming_month'), ('w4_nonmbtiming_year', 'w4_nonmbtiming_month')],
              5: [('w5_mbtiming_year', 'w5_mbtiming_month'), ('w5_nonmbtiming_year', 'w5_nonmbtiming_month')],
              6: [('w6_mby', 'w6_mbtiming_Month'), ('w6_nmby', 'w6_nonmbtiming_Month')]}
    pp, info = [], []
    for i, cid in enumerate(couples.id):
        last_together = max([k for k in range(2, 7) if st[k][i] == 0], default=1)
        end = next((k for k in range(2, 7) if st[k][i] in (1, 2)), None)
        assert end is None or end > last_together, cid
        kind, period, dated = 'censored', None, False
        if end is not None and st[end][i] == 1:
            kind, period = 'breakup', end - 1
            for ycol, mcol in timing.get(end, []):
                y, m = df[ycol].iat[i], df[mcol].iat[i]
                if y == y and 1990 < y < 2030:
                    month = y * 12 + ((m - 1) if m == m and 1 <= m <= 12 else 6)
                    p = next((q for q in range(1, 6) if month <= CUT[q]), 5)
                    period, dated = min(max(p, last_together), end - 1), True
                    break
        elif end is not None:
            kind = 'partner_died'
        last = period if kind == 'breakup' else last_together - 1
        for p in range(1, last + 1):
            pp.append((cid, str(p), int(kind == 'breakup' and p == last)))
        info.append(dict(id=cid, outcome=kind, last_period=last, reported_wave=end if end else last_together,
                         dated=dated, skipped_wave=bool(end and end - last_together > 1)))
    info = pd.DataFrame(info)
    periods = pd.DataFrame(pp, columns=['id', 'period', 'event'])
    couples = couples.merge(info, on='id')
    return couples, periods, audit


def couples_2017():
    """HCMST 2017 partnered respondents with harmonised wave-1 inputs and break-ups by 2020 and 2022."""
    df, m = read('hcmst2017_2022_v2.2.dta', encoding='cp1252')
    audit = dict(respondents=len(df), partnered_2017=int((df.w1_section == 1).sum()),
                 surveyed_2020=int((df.w2_surveyed == 1).sum()), surveyed_2022=int((df.w3_surveyed == 1).sum()))
    df = df[df.w1_section == 1].copy()
    # Household income: category midpoints in 2017 dollars, deflated to 2009 dollars and top-coded
    # where the 2009 file top-codes ($175,000+, valued by HCMST 2009 at its own midpoint).
    a, _ = read('HCMST_ver_3.04.dta', usecols=['ppincimp', 'hhinc'])
    top2009 = a.loc[a.ppincimp == 19, 'hhinc'].iloc[0]
    mids2009 = a.groupby('ppincimp').hhinc.first().to_dict()
    mids2017 = {k: v for k, v in mids2009.items() if k <= 18}
    mids2017.update({19: 187500, 20: 225000, 21: 275000})
    rows = []
    for r in df.itertuples(index=False):
        rr = {1: 'White', 2: 'Black', 4: 'Hispanic', 3: 'Other', 5: 'Other'}.get(r.w1_ppethm, 'Unknown')
        if r.w1_q6a == r.w1_q6a and r.w1_q6a >= 2:
            pr = 'Hispanic'
        elif r.w1_q6a == 1:
            pr = {1: 'White', 2: 'Black', 3: 'Other', 4: 'Other', 5: 'Other'}.get(r.w1_q6b, 'Unknown')
        else:
            pr = 'Unknown'
        rparty = 'Republican' if r.w1_partyid7 in (1, 2, 3) else 'Democrat' if r.w1_partyid7 in (5, 6, 7) else 'Other'
        pparty = 'Republican' if r.w1_q12 in (1, 2, 3) else 'Democrat' if r.w1_q12 in (5, 6, 7) else 'Other'
        married = r.w1_partnership_status == 1
        q17 = r.w1_q17
        prior = 'Unknown' if q17 != q17 else ('Yes' if q17 >= (2 if married else 1) else 'No')
        page = r.w1_q9 if r.w1_q9 == r.w1_q9 and r.w1_q9 >= 15 else np.nan
        redu = r.w1_subject_yrsed
        pedu = r.w1_partner_yrsed if r.w1_partner_yrsed == r.w1_partner_yrsed and r.w1_partner_yrsed >= 0 else np.nan
        inc = min(mids2017[r.w1_ppincimp] * CPI_U[2009] / CPI_U[2017], top2009) if r.w1_ppincimp == r.w1_ppincimp else np.nan
        kids = sum(getattr(r, c) for c in ['w1_PPT01', 'w1_PPT25', 'w1_PPT612', 'w1_PPT1317'])
        rows.append(dict(
            id=int(r.caseid_new), weight=r.w1_weight_combo,
            relationship_quality={1: 'Excellent', 2: 'Good', 3: 'Fair', 4: 'Poor or very poor', 5: 'Poor or very poor'}.get(r.w1_q34, 'Unknown'),
            married='Yes' if married else 'No',
            cohabiting={1: 'Yes', 2: 'No'}.get(r.w1_q19, 'Unknown'),
            couple_type=couple_type(r.w1_same_sex_couple, r.w1_ppgender),
            couple_race=couple_race(rr, pr),
            party_pair=party_pair(rparty, pparty),
            how_met=how_met(r.w1_either_internet_adjusted, r.w1_q24_met_through_friend, r.w1_q24_met_through_family,
                            r.w1_q24_met_as_through_cowork, r.w1_q24_school, r.w1_q24_college, r.w1_q24_bar_restaurant,
                            r.w1_q24_church, r.w1_q24_met_online == r.w1_q24_met_online),
            prior_marriage=prior,
            earnings={1: 'One earned more', 3: 'One earned more', 4: 'One earned more', 2: 'About equal'}.get(r.w1_q23, 'Unknown'),
            mean_age=(r.w1_ppage + page) / 2 if page == page else np.nan,
            age_gap=abs(r.w1_ppage - page) if page == page else np.nan,
            relationship_years=r.w1_relate_duration_in2017_years,
            edu_years_mean=(redu + pedu) / 2 if pedu == pedu else np.nan,
            edu_gap=abs(redu - pedu) if pedu == pedu else np.nan,
            hh_income_k=inc / 1000,
            children_in_hh=float(kids),
            end_2020=r.w2_relationship_end, end_2022=r.w3_relationship_end_combo, src_2022=r.w3_breakup_source,
            surveyed_2020=r.w2_surveyed, surveyed_2022=r.w3_surveyed,
        ))
    c = pd.DataFrame(rows)
    # By 2020: break-up (divorce, separation or other break-up) reported in the 2020 wave; partner
    # deaths excluded. By 2022: a break-up reported in 2020 or 2022; partner deaths and couples not
    # observed at the end of the window excluded. w3_breakup_source is the wave in which the
    # ended relationship's partner was first reported, so 1 means the 2017 partner.
    brk20 = c.end_2020.isin([1, 2])
    brk22 = c.end_2022.isin([1, 2]) & (c.src_2022 == 1)
    died = (c.end_2020 == 3) | ((c.end_2022 == 3) & (c.src_2022 == 1))
    c['breakup_by_2020'] = np.where((c.surveyed_2020 == 1) & ~died, brk20.astype(float), np.nan)
    c['breakup_by_2022'] = np.where(~died & (brk20 | brk22 | (c.surveyed_2022 == 1)), (brk20 | brk22).astype(float), np.nan)
    return c, audit
