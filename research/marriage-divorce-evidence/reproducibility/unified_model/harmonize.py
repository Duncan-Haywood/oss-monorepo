"""Stack every survey with individual-level marriage records into one harmonised table.

Two outputs (person-level, scratch only, never committed):
  units.parquet   one row per union record (a first marriage followed from the wedding, a GSS
                  married respondent followed two years, an HCMST couple, a SIPP couple-year, a
                  Los Angeles newlywed couple), with every harmonised input and its coarsening;
  spells.parquet  the follow-up of each unit: (t0, t1] in years since the wedding (or since the
                  relationship began, for unmarried HCMST couples), event, legal-divorce flag and
                  whether the event time is exact ('exact') or only known to fall in the spell
                  ('interval').

Each survey is read through its lens's committed builder (the lens decides the sample, timing
and outcome; this file only maps names and codes), so nothing about a sample is re-derived here:
  NSFG 1995-2023      nsfg_pooled_first_marriage/harmonise.py build()
  NLSY79              nlsy79_full/build_first_marriages.py -> first_marriages.csv
  NLSY97              nlsy97_first_marriage/build_marriages.py build() -> marriages.pkl
  SIPP retrospective  sipp_marital_history/build_retro.py -> retro.parquet
  SIPP couples        sipp_marital_history/train_prospective.py couples()
  Canada GSS          canada_gss_family/harmonise.py first_marriages()
  GSS panels          gss_panel/gss_data.py transitions() (+ extra wave-1 items read here)
  HCMST 2009          hcmst/hcmst_data.py couples_2009() (+ extra baseline items read here)
  LA newlyweds        newlywed_la_karney/nl_data.py load()

Coarsened answers keep their information as bounds: an ordinal input stores its exact code, or
lo/hi bounds when a survey only reports a band (e.g. NSFG says only "bachelor's degree by the
wedding: yes", i.e. education code 3 or 4); a nominal input stores the allowed set ("Non-Black
non-Hispanic" = White, Asian or Other). The imputer draws within those bounds.

Usage: python3 -I harmonize.py OUT_DIR   (paths to raw/lens outputs: see PATHS / environment)
"""
from pathlib import Path
import json, os, sys
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
REPRO = HERE.parent
SCRATCH = Path(os.environ.get('UNIFIED_SCRATCH', '/tmp/unified_scratch'))

# Where each lens's own builder left its person-level output (or its raw files).
PATHS = dict(
    nsfg_lens=os.environ.get('NSFG_LENS_TABLE', str(SCRATCH / 'nsfg_lens.parquet')),
    nsfg_raw=os.environ.get('NSFG_RAW', ''),
    nlsy79=os.environ.get('NLSY79_FIRST_MARRIAGES', ''),
    nlsy79_work=os.environ.get('NLSY79_WORK', ''),
    nlsy97=os.environ.get('NLSY97_MARRIAGES', ''),
    sipp_retro=os.environ.get('SIPP_RETRO', ''),
    sipp_work=os.environ.get('SIPP_WORK', ''),
    canada=os.environ.get('CANADA_FIRST_MARRIAGES', ''),
    gss_raw=os.environ.get('GSS_RAW', ''),
    hcmst_raw=os.environ.get('HCMST_RAW', ''),
    la_raw=os.environ.get('LA_RAW', ''),
)

# ----------------------------------------------------------------------------- the inputs
# kind: num (continuous), ord (ordered integer codes 0..K-1), bin (0/1), nom (unordered levels).
EDU5 = ['Less than high school', 'High school', 'Some college or associate', "Bachelor's", 'Graduate degree']
VARS = {
    # timing and the union
    'age_at_marriage': dict(kind='num', label='Age at the wedding (or when the relationship began)', lo=14, hi=70),
    'wedding_year': dict(kind='num', label='Year of the wedding', lo=1940, hi=2025),
    'abs_age_gap': dict(kind='num', label='Age difference between the spouses (years, either direction)', lo=0, hi=40),
    # background
    'race': dict(kind='nom', label='Race and ethnicity', levels=['White', 'Black', 'Hispanic', 'Asian', 'Other']),
    'foreign_born': dict(kind='bin', label='Born outside the country of the survey'),
    'educ': dict(kind='ord', label='Education by the wedding (survey baseline for panels)', levels=EDU5),
    'spouse_educ': dict(kind='ord', label="Spouse's education", levels=EDU5),
    'interracial': dict(kind='bin', label='Spouses of different race or ethnicity'),
    # family of origin
    'intact_family': dict(kind='bin', label='Lived with both parents through about age 14-16'),
    'mother_educ': dict(kind='ord', label="Mother's education", levels=['Less than high school', 'High school', 'Some college', "Bachelor's or more"]),
    # religion and politics
    'religion_raised': dict(kind='nom', label='Religion raised in', levels=['Protestant', 'Catholic', 'None', 'Other']),
    'religion_now': dict(kind='nom', label='Religion now (at the survey baseline)', levels=['Protestant', 'Catholic', 'None', 'Other']),
    'attend': dict(kind='ord', label='Religious service attendance',
                   levels=['Never', 'Less than once a year', 'About once or twice a year', 'Several times a year', 'About once a month',
                           '2-3 times a month', 'Nearly every week', 'Every week', 'More than once a week']),
    'pray': dict(kind='ord', label='How often you pray',
                 levels=['Never', 'Less than once a week', 'Once a week', 'Several times a week', 'Once a day', 'Several times a day']),
    'polviews': dict(kind='ord', label='Political views',
                     levels=['Extremely liberal', 'Liberal', 'Slightly liberal', 'Moderate', 'Slightly conservative', 'Conservative', 'Extremely conservative']),
    'party': dict(kind='nom', label='Party identification', levels=['Democrat', 'Independent or other', 'Republican']),
    # relationship history
    'cohab_first': dict(kind='bin', label='Lived together before the wedding'),
    'prior_union_other': dict(kind='bin', label='Lived with a different partner before'),
    'premarital_birth': dict(kind='bin', label='Had a child before the wedding'),
    'married_before': dict(kind='bin', label='Married before (this is not your first marriage)'),
    'spouse_married_before': dict(kind='bin', label='Spouse married before'),
    'spouse_prior_children': dict(kind='bin', label='Spouse had children before'),
    'premarital_sex_years': dict(kind='num', label='Years sexually active before the wedding', lo=0, hi=40),
    'premarital_partners': dict(kind='ord', label='Sexual partners before the wedding', levels=['0', '1', '2', '3-4', '5-9', '10+']),
    # the relationship itself
    'rel_quality': dict(kind='ord', label='Marriage or relationship happiness', levels=['Not too happy', 'Pretty happy', 'Very happy']),
    'satisfaction_z': dict(kind='num', label='Newlywed marital satisfaction (couple mean, SD units)', lo=-6, hi=3),
    'hostility_z': dict(kind='num', label='Self-reported hostility (couple mean, SD units)', lo=-2, hi=8),
    'negativity_z': dict(kind='num', label='Observer-coded negativity in a conflict talk (couple mean, SD units)', lo=-3, hi=6),
    'ever_unfaithful': dict(kind='bin', label='Ever had sex with someone other than the spouse while married'),
    # money and work
    'log_income': dict(kind='num', label='Household income (log, 2020 dollars)', lo=np.log(1000), hi=np.log(1e6)),
    'log_earnings': dict(kind='num', label='Own earnings in the year before (log of 1 + 2020 dollars)', lo=0, hi=np.log(1e6)),
    'net_worth': dict(kind='num', label='Net worth (asinh of 2020 dollars / 10,000)', lo=-6, hi=6),
    'home_owner': dict(kind='bin', label='Owns the home'),
    'employed': dict(kind='bin', label='Working (respondent)'),
    'spouse_employed': dict(kind='bin', label='Spouse working'),
    'prestige': dict(kind='num', label='Occupational prestige (GSS 2010 scores)', lo=10, hi=90),
    # place
    'region': dict(kind='nom', label='Region', levels=['South', 'Northeast', 'Midwest', 'West', 'Canada']),
    'urban': dict(kind='bin', label='Lives in an urban area'),
    # health, cognition, behaviour (measured before the outcome window)
    'health': dict(kind='ord', label='Self-rated health', levels=['Poor', 'Fair', 'Good', 'Excellent']),
    'mental_health': dict(kind='num', label='Mental health, MHI-5 (0-100)', lo=0, hi=100),
    'self_esteem': dict(kind='num', label='Rosenberg self-esteem (6-30)', lo=6, hi=30),
    'afqt': dict(kind='num', label='AFQT percentile (cognitive test)', lo=0, hi=100),
    'delinquency': dict(kind='num', label='Youth delinquency index (SD units within survey)', lo=-2, hi=8),
}
STRUCTURAL = ['female', 'union_type', 'same_sex']   # always known; never imputed
UNION_TYPES = ['Married', 'Cohabiting, unmarried', 'Dating, not living together']

SURVEYS = {
    'nsfg': dict(label='NSFG 1995-2023 first marriages', outcome='separation_or_divorce', timing='exact', country='US'),
    'nlsy79': dict(label='NLSY79 first marriages from 1981', outcome='legal_divorce', timing='exact', country='US'),
    'nlsy97': dict(label='NLSY97 first marriages', outcome='separation_or_divorce', timing='exact', country='US'),
    'sipp_retro': dict(label='SIPP first-marriage histories (2001-2025)', outcome='separation_or_divorce', timing='exact_year', country='US'),
    'sipp_couples': dict(label='SIPP married couples, one year ahead (2018-2025)', outcome='separation_or_divorce', timing='interval', country='US'),
    'canada_gss': dict(label='Statistics Canada GSS Families first marriages', outcome='separation_or_divorce', timing='exact', country='Canada'),
    'gss_panel': dict(label='GSS panels 2006-2020, married respondents', outcome='separation_or_divorce', timing='interval', country='US'),
    'hcmst': dict(label='HCMST 2009 couples (married and unmarried)', outcome='breakup', timing='interval', country='US'),
    'la_newlyweds': dict(label='Los Angeles newlyweds (Karney)', outcome='separation_or_divorce', timing='interval', country='US'),
}

CPI = {1990: 130.7, 1995: 152.4, 2000: 172.2, 2005: 195.3, 2008: 215.3, 2009: 214.5, 2010: 218.1, 2011: 224.9,
       2012: 229.6, 2013: 233.0, 2014: 236.7, 2015: 237.0, 2016: 240.0, 2017: 245.1, 2018: 251.1, 2019: 255.7,
       2020: 258.8, 2021: 271.0, 2022: 292.7, 2023: 304.7, 2024: 313.7}   # BLS CPI-U annual averages


def to2020(dollars, year):
    return dollars * CPI[2020] / CPI[year]


def edu_years(y):
    """Completed years of schooling -> EDU5 code (12 = high school, 16 = bachelor's, 17+ = graduate)."""
    y = pd.to_numeric(y, errors='coerce')
    out = np.select([y < 12, y == 12, y < 16, y == 16, y > 16], [0, 1, 2, 3, 4], np.nan)
    return np.where((y >= 0) & (y <= 25), out, np.nan)


def mother_years(y):
    y = pd.to_numeric(y, errors='coerce')
    out = np.select([y < 12, y == 12, y < 16, y >= 16], [0, 1, 2, 3], np.nan)
    return np.where((y >= 0) & (y <= 25), out, np.nan)


class Frame:
    """Collects one survey's units with exact values and coarsening bounds."""

    def __init__(self, survey, n):
        self.survey, self.n = survey, n
        self.cols = {}

    def set(self, name, values, lo=None, hi=None, allowed=None):
        v = np.asarray(values, dtype=object if VARS[name]['kind'] == 'nom' else float)
        self.cols[name] = v
        if lo is not None:
            self.cols[name + '__lo'] = np.asarray(lo, float)
            self.cols[name + '__hi'] = np.asarray(hi, float)
        if allowed is not None:
            self.cols[name + '__set'] = np.asarray(allowed, dtype=object)

    def frame(self, base):
        d = base.copy()
        for k, v in self.cols.items():
            d[k] = v
        d['survey'] = self.survey
        return d


def yn(s, yes=('Yes',), no=('No',)):
    s = pd.Series(s).astype(object)
    return np.where(s.isin(yes), 1.0, np.where(s.isin(no), 0.0, np.nan))


# ----------------------------------------------------------------------------- NSFG
def nsfg():
    m = pd.read_parquet(PATHS['nsfg_lens'])
    n = len(m)
    F = Frame('nsfg', n)
    F.set('age_at_marriage', m.age_at_marriage.clip(lower=12))
    F.set('wedding_year', m.wedding_year)
    gap = (m.spouse_age_at_marriage - m.age_at_marriage).abs()
    F.set('abs_age_gap', gap.where(gap <= 40))
    race = m.race_ethnicity.map({'White': 'White', 'Black': 'Black', 'Hispanic': 'Hispanic'})
    F.set('race', race, allowed=np.where(m.race_ethnicity == 'Other', 'Asian|Other', None))
    F.set('foreign_born', yn(m.born_outside_us))
    ba = m.ba_by_wedding
    F.set('educ', np.full(n, np.nan), lo=np.where(ba == 'Yes', 3, np.where(ba == 'No', 0, np.nan)),
          hi=np.where(ba == 'Yes', 4, np.where(ba == 'No', 2, np.nan)))
    F.set('interracial', yn(m.same_race_ethnicity, yes=('Different',), no=('Same',)))
    F.set('intact_family', yn(m.intact_family))
    F.set('mother_educ', m.mother_education.map({'<HS': 0, 'HS': 1, 'Some college': 2, 'BA+': 3}))
    F.set('religion_raised', m.religion_raised.map({'Protestant': 'Protestant', 'Catholic': 'Catholic', 'None': 'None', 'Other': 'Other'}))
    F.set('cohab_first', yn(m.cohabited_first))
    F.set('premarital_birth', yn(m.premarital_birth))
    F.set('married_before', np.zeros(n))                      # first marriages by construction
    F.set('spouse_married_before', yn(m.spouse_married_before))
    F.set('spouse_prior_children', yn(m.spouse_prior_children))
    F.set('premarital_sex_years', m.premarital_sex_years)
    F.set('premarital_partners', m.premarital_partners.map({'0': 0, '1': 1, '2': 2, '3-4': 3, '5-9': 4, '10+': 5}))
    base = pd.DataFrame(dict(uid='nsfg:' + m.id, cluster='nsfg:' + m.cluster, weight=m.cycle_weight,
                             female=(m.sex == 'F').astype(float), union_type='Married', same_sex=0.0,
                             sub=m.cycle + m.sex))
    spells = pd.DataFrame(dict(uid=base.uid, t0=0.0, t1=np.maximum(m.months / 12, 1 / 24), event=m.event,
                               divorce_event=m.divorced_only.astype(float), kind='exact'))
    return F.frame(base), spells


# ----------------------------------------------------------------------------- NLSY79
def nlsy79():
    m = pd.read_csv(PATHS['nlsy79'])
    m = m[m.entry_ok].reset_index(drop=True)                  # delayed entry, as in the lens
    n = len(m)
    F = Frame('nlsy79', n)
    F.set('age_at_marriage', m.age_at_marriage)
    F.set('wedding_year', m.wedding_month / 12)
    gap = (m.spouse_age_at_marriage - m.age_at_marriage).abs()
    F.set('abs_age_gap', gap.where(gap <= 40))
    nbnh = m.race == 'Non-Black non-Hispanic'
    F.set('race', m.race.map({'Black': 'Black', 'Hispanic': 'Hispanic'}), allowed=np.where(nbnh, 'White|Asian|Other', None))
    F.set('educ', edu_years(m.grade_completed))
    F.set('spouse_educ', edu_years(m.spouse_grade))
    F.set('intact_family', np.where(m.family_at_14 == 'Unknown', np.nan, (m.family_at_14 == 'Both parents').astype(float)))
    F.set('mother_educ', mother_years(m.mother_grade))
    F.set('religion_raised', m.religion_raised.map({'Catholic': 'Catholic', 'Baptist': 'Protestant', 'Other Protestant': 'Protestant',
                                                    'Jewish': 'Other', 'Other': 'Other', 'No religion': 'None'}))
    # Lens bands of the pre-wedding (1979/1982) attendance item, as bounds on the GSS 0-8 scale.
    lo = m.attendance.map({'Never': 0, 'Several times a year or less': 1, 'Monthly': 4, 'Weekly or more': 7})
    hi = m.attendance.map({'Never': 0, 'Several times a year or less': 3, 'Monthly': 6, 'Weekly or more': 8})
    F.set('attend', np.full(n, np.nan), lo=lo, hi=hi)
    F.set('cohab_first', yn(m.cohabiting_before))
    F.set('premarital_birth', yn(m.premarital_birth))
    F.set('married_before', np.zeros(n))
    F.set('spouse_employed', yn(m.spouse_worked))
    F.set('region', m.region.map({'South': 'South', 'Northeast': 'Northeast', 'North Central': 'Midwest', 'West': 'West'}))
    F.set('urban', yn(m.urban, yes=('Urban',), no=('Rural',)))
    F.set('self_esteem', m.rosenberg)
    F.set('afqt', m.afqt)
    F.set('delinquency', (m.delinquency - m.delinquency.mean()) / m.delinquency.std())
    base = pd.DataFrame(dict(uid='nlsy79:' + m.id.astype(str), cluster='nlsy79:' + m.id.astype(str), weight=m.weight,
                             female=(m.sex == 'Woman').astype(float), union_type='Married', same_sex=0.0, sub='all'))
    t0 = (m.entry_month - m.wedding_month) / 12
    t1 = np.maximum((m.exit_month - m.wedding_month) / 12, t0 + 1 / 24)
    spells = pd.DataFrame(dict(uid=base.uid, t0=t0, t1=t1, event=m.event, divorce_event=m.event.astype(float), kind='exact'))
    return F.frame(base), spells


# ----------------------------------------------------------------------------- NLSY97
def nlsy97():
    m = pd.read_pickle(PATHS['nlsy97'])
    m = m[~m.same_sex_marriage].reset_index(drop=True)        # excluded by the lens
    n = len(m)
    F = Frame('nlsy97', n)
    F.set('age_at_marriage', m.age_at_marriage)
    F.set('wedding_year', 1980 + (m.wedding_cm - 1) / 12)
    F.set('abs_age_gap', m.spouse_age_gap.abs().where(m.spouse_age_gap.abs() <= 40))
    nbnh = m.race_ethnicity == 'Non-Black non-Hispanic'
    F.set('race', m.race_ethnicity.map({'Black': 'Black', 'Hispanic': 'Hispanic'}), allowed=np.where(nbnh, 'White|Asian|Other', None))
    e = m.education_at_marriage
    F.set('educ', e.map({'No high school credential': 0, 'Associate': 2, 'Bachelor': 3, 'Graduate degree': 4}),
          lo=np.where(e == 'High school or GED', 1, np.nan), hi=np.where(e == 'High school or GED', 2, np.nan))
    F.set('spouse_educ', edu_years(m.spouse_hgc))
    F.set('interracial', yn(m.same_race_ethnicity, yes=('Different',), no=('Same',)))
    F.set('intact_family', np.where(m.family_at_12 == 'Unknown', np.nan, (m.family_at_12 == 'Both biological parents').astype(float)))
    F.set('religion_raised', m.religion_raised.map({'Protestant': 'Protestant', 'Catholic': 'Catholic', 'None': 'None', 'Other': 'Other'}))
    a = m.attendance_before
    F.set('attend', np.full(n, np.nan), lo=a.map({'Never': 0, 'Less than monthly': 1, 'About monthly': 4, 'Weekly or more': 7}),
          hi=a.map({'Never': 0, 'Less than monthly': 3, 'About monthly': 6, 'Weekly or more': 8}))
    F.set('cohab_first', yn(m.cohabited_first))
    F.set('premarital_birth', (m.children_before > 0).astype(float))
    F.set('married_before', np.zeros(n))
    F.set('spouse_married_before', yn(m.spouse_married_before))
    F.set('spouse_prior_children', yn(m.spouse_has_children))
    F.set('region', m.region.map({'South': 'South', 'Northeast': 'Northeast', 'North Central': 'Midwest', 'West': 'West'}))
    F.set('urban', yn(m.urban, yes=('Urban',), no=('Rural',)))
    yr = np.clip(m.wedding_year.to_numpy().astype(int) - 1, 1997, 2024)   # money items refer to the year before
    defl = np.array([CPI[2020] / CPI[min(CPI, key=lambda k: abs(k - y))] for y in yr])
    F.set('log_earnings', np.log1p(m.earnings_year_before * defl))
    F.set('net_worth', np.arcsinh(m.net_worth_before * defl / 1e4))
    F.set('employed', np.where(m.hours_year_before.isna(), np.nan, (m.hours_year_before > 0).astype(float)))
    F.set('mental_health', m.mhi5_before)
    F.set('afqt', m.afqt_percentile)
    F.set('delinquency', (m.delinquency_1997 - m.delinquency_1997.mean()) / m.delinquency_1997.std())
    base = pd.DataFrame(dict(uid='nlsy97:' + m.id.astype(str), cluster='nlsy97:' + m.id.astype(str), weight=m.weight97,
                             female=(m.sex == 'Female').astype(float), union_type='Married', same_sex=0.0, sub='all'))
    spells = pd.DataFrame(dict(uid=base.uid, t0=0.0, t1=np.maximum(m.years, 1 / 24), event=m.event,
                               divorce_event=np.where(m.event == 1, m.end_how.str.startswith('divorced').astype(float), 0.0),
                               kind='exact'))
    return F.frame(base), spells


# ----------------------------------------------------------------------------- SIPP retrospective
def sipp_retro():
    sys.path[:0] = [str(REPRO / 'sipp_marital_history'), str(REPRO)]
    import train_retro
    m, _ = train_retro.load(PATHS['sipp_work'])       # the lens's own sample, timing (t) and weights
    m = m[m.same_sex == 0].reset_index(drop=True)
    n = len(m)
    F = Frame('sipp_retro', n)
    F.set('age_at_marriage', m.age_at_marriage.clip(lower=14))
    F.set('wedding_year', m.marriage_year + 0.5)
    F.set('race', m.race_ethnicity)
    F.set('foreign_born', yn(m.nativity, yes=('Foreign-born',), no=('US-born',)))
    e = m.education_at_wedding
    F.set('educ', e.map({'Less than high school': 0, 'High school': 1, 'Some college': 2}),
          lo=np.where(e == 'Bachelor or higher', 3, np.nan), hi=np.where(e == 'Bachelor or higher', 4, np.nan))
    F.set('married_before', np.zeros(n))
    base = pd.DataFrame(dict(uid='sipp_retro:' + m.pid, cluster='sipp_retro:' + m.hh.astype(str), weight=m.weight,
                             female=(m.sex == 'Woman').astype(float), union_type='Married', same_sex=0.0,
                             sub=m.source))
    spells = pd.DataFrame(dict(uid=base.uid, t0=0.0, t1=np.maximum(m.t, 1 / 24), event=m.event,
                               divorce_event=np.nan, kind='exact'))
    return F.frame(base), spells


# ----------------------------------------------------------------------------- SIPP couples
def sipp_couples():
    sys.path[:0] = [str(REPRO / 'sipp_marital_history'), str(REPRO)]
    import train_prospective as tp
    parts = [tp.couples(PATHS['sipp_work'], t, t1)[0] for t, t1 in tp.PAIRS]
    d = pd.concat(parts, ignore_index=True)
    n = len(d)
    F = Frame('sipp_couples', n)
    yrs = d.marriage_years
    F.set('age_at_marriage', (d.wife_age - yrs).where(yrs.notna() & (d.wife_age - yrs >= 14)))
    F.set('wedding_year', (d.baseline_file - 1 - yrs) + 0.5)
    F.set('abs_age_gap', (d.husband_age - d.wife_age).abs().clip(upper=40))
    F.set('race', d.wife_race_ethnicity)
    F.set('foreign_born', yn(d.wife_nativity, yes=('Foreign-born',), no=('US-born',)))
    E = {'Less than high school': 0, 'High school': 1, 'Some college': 2, 'Associate': 2, 'Bachelor': 3, 'Graduate or professional': 4}
    F.set('educ', d.wife_education.map(E))
    F.set('spouse_educ', d.husband_education.map(E))
    F.set('interracial', yn(d.same_race_ethnicity, yes=('Different',), no=('Same',)))
    F.set('married_before', yn(d.wife_times_married, yes=('Twice', 'Three or more'), no=('Once',)))
    F.set('spouse_married_before', yn(d.husband_times_married, yes=('Twice', 'Three or more'), no=('Once',)))
    defl = d.baseline_file.map(lambda t: CPI[2020] / CPI[t - 1])
    F.set('log_income', np.log(np.clip(d.household_income * defl, 1000, 1e6)))
    F.set('log_earnings', np.log1p(np.clip(d.wife_earnings * defl, 0, 1e6)))
    F.set('net_worth', np.arcsinh(d.household_net_worth * defl / 1e4))
    F.set('home_owner', (d.home_owner == 'Yes').astype(float))
    F.set('employed', np.where(d.wife_months_employed.isna(), np.nan, (d.wife_months_employed > 0).astype(float)))
    F.set('spouse_employed', np.where(d.husband_months_employed.isna(), np.nan, (d.husband_months_employed > 0).astype(float)))
    uid = 'sipp_couples:' + d.SSUID.astype(str) + '-' + d.PNUM.astype(str) + '-' + d.baseline_file.astype(str)
    base = pd.DataFrame(dict(uid=uid, cluster='sipp_couples:' + d.SSUID.astype(str), weight=d.weight,
                             female=1.0, union_type='Married', same_sex=0.0, sub=d.baseline_file.astype(str)))
    base['weight'] = base.weight / base.groupby('sub').weight.transform('mean')
    # Marriage duration in December of t-1; unknown for remarried people in 2018-2020 files (imputed).
    spells = pd.DataFrame(dict(uid=uid, t0=yrs.to_numpy(), t1=yrs.to_numpy() + 1.0, event=d.event, divorce_event=np.nan,
                               kind='interval', length=1.0))
    base['obs_year'] = d.baseline_file - 1.0
    base['age_obs'] = d.wife_age.to_numpy(float)
    return F.frame(base), spells


# ----------------------------------------------------------------------------- Canada
def canada():
    sys.path.insert(0, str(REPRO / 'canada_gss_family'))
    p = pd.read_pickle(PATHS['canada'])[0] if PATHS['canada'] else __import__('harmonise').first_marriages()[0]
    n = len(p)
    F = Frame('canada_gss', n)
    F.set('age_at_marriage', p.age_at_marriage)
    F.set('wedding_year', p.wedding_year)
    F.set('abs_age_gap', p.partner_age_gap.abs().where(p.partner_age_gap.abs() <= 40))
    F.set('foreign_born', yn(p.born_outside_canada))
    F.set('intact_family', yn(p.intact_family_15))
    F.set('cohab_first', yn(p.cohabited_first))
    F.set('prior_union_other', yn(p.prior_union))
    F.set('premarital_birth', yn(p.premarital_birth))
    F.set('married_before', np.zeros(n))
    F.set('spouse_married_before', yn(p.partner_prev_married))
    F.set('region', np.full(n, 'Canada', dtype=object))
    # Education, religion and attendance are measured at interview, after many dissolutions: not used.
    base = pd.DataFrame(dict(uid='canada:' + p.id, cluster='canada:' + p.id, weight=p.weight,
                             female=(p.respondent_sex == 'Female').astype(float), union_type='Married', same_sex=0.0,
                             sub=p.cycle))
    spells = pd.DataFrame(dict(uid=base.uid, t0=0.0, t1=p.t.to_numpy(), event=p.event, divorce_event=p.divorced_only.astype(float),
                               kind='exact'))
    return F.frame(base), spells


# ----------------------------------------------------------------------------- GSS panels
def gss():
    os.environ['GSS_RAW'] = PATHS['gss_raw']
    sys.path.insert(0, str(REPRO / 'gss_panel'))
    import gss_data as g
    g.RAW = Path(PATHS['gss_raw'])
    t, _ = g.transitions()
    t = g.analysis_sample(t, 2)
    # Extra items from the same wave-t record (gss_data reads the files; we only add columns).
    extra = []
    for key in g.PANELS:
        d = g.read_panel(key)
        for panel, wf, wt, horizon, wcol in g.TRANSITIONS:
            if panel != key or horizon != 2:
                continue
            gg = lambda v: d[f'{v}_{wf}'] if f'{v}_{wf}' in d else pd.Series(np.nan, index=d.index)
            pid = (panel + '-' + d.yearid.astype(int).astype(str)) if panel == '2020' else (panel + '-' + d.id_1.astype(int).astype(str))
            e = pd.DataFrame(dict(pid=pid, transition=f'{panel}:{wf}->{wt}'))
            for v in ['pray', 'polviews', 'partyid', 'relig', 'relig16', 'attend', 'hispanic', 'racecen1', 'race', 'born', 'coninc',
                      'dwelown', 'prestg10', 'educ', 'speduc', 'maeduc', 'health', 'hapmar', 'evstray', 'wrkstat', 'spwrksta',
                      'divorce', 'age', 'family16', 'srcbelt', 'region', 'sex', 'sprel']:
                e['x_' + v] = pd.to_numeric(gg(v), errors='coerce').to_numpy()
            extra.append(e)
    extra = pd.concat(extra, ignore_index=True)
    t = t.merge(extra, on=['pid', 'transition'], how='left')
    assert t.x_age.notna().mean() > 0.99
    d = pd.DataFrame({k[2:]: t[k] for k in t.columns if k.startswith('x_')})
    for k in ['pid', 'transition', 'event', 'divorced_only', 'weight', 'panel', 'from_year']:
        d[k] = t[k].to_numpy()
    n = len(d)
    F = Frame('gss_panel', n)
    hisp = d.hispanic.between(2, 50)
    asian = d.racecen1.between(4, 10)
    race = np.select([hisp, d.race == 1, d.race == 2, asian], ['Hispanic', 'White', 'Black', 'Asian'], None)
    F.set('race', race, allowed=np.where((race == None) & (d.race == 3), 'Asian|Other', None))   # noqa: E711
    F.set('foreign_born', np.where(d.born == 2, 1.0, np.where(d.born == 1, 0.0, np.nan)))
    F.set('educ', edu_years(d.educ))
    F.set('spouse_educ', edu_years(d.speduc))
    F.set('intact_family', np.where(d.family16.isna(), np.nan, (d.family16 == 1).astype(float)))
    F.set('mother_educ', mother_years(d.maeduc))
    R = {1: 'Protestant', 2: 'Catholic', 4: 'None', 3: 'Other', **{k: 'Other' for k in range(5, 14)}}
    F.set('religion_raised', d.relig16.map(R))
    F.set('religion_now', d.relig.map(R))
    F.set('attend', d.attend.where(d.attend.between(0, 8)))
    F.set('pray', (6 - d.pray).where(d.pray.between(1, 6)))       # 1 several times a day ... 6 never
    F.set('polviews', (d.polviews - 1).where(d.polviews.between(1, 7)))
    F.set('party', d.partyid.map({0: 'Democrat', 1: 'Democrat', 2: 'Democrat', 3: 'Independent or other', 7: 'Independent or other',
                                  4: 'Republican', 5: 'Republican', 6: 'Republican'}))
    F.set('married_before', np.where(d.divorce == 1, 1.0, np.where(d.divorce == 2, 0.0, np.nan)))
    F.set('rel_quality', (3 - d.hapmar).where(d.hapmar.between(1, 3)))
    F.set('ever_unfaithful', np.where(d.evstray == 1, 1.0, np.where(d.evstray == 2, 0.0, np.nan)))
    F.set('log_income', np.log(np.clip(to2020(d.coninc, 2000), 1000, 1e6)))
    F.set('home_owner', np.where(d.dwelown == 1, 1.0, np.where(d.dwelown.between(2, 3), 0.0, np.nan)))
    F.set('employed', np.where(d.wrkstat.between(1, 2), 1.0, np.where(d.wrkstat.between(3, 8), 0.0, np.nan)))
    F.set('spouse_employed', np.where(d.spwrksta.between(1, 2), 1.0, np.where(d.spwrksta.between(3, 8), 0.0, np.nan)))
    F.set('prestige', d.prestg10.where(d.prestg10.between(10, 90)))
    F.set('region', d.region.map({1: 'Northeast', 2: 'Northeast', 3: 'Midwest', 4: 'Midwest', 5: 'South', 6: 'South', 7: 'South', 8: 'West', 9: 'West'}))
    F.set('urban', np.where(d.srcbelt == 6, 0.0, np.where(d.srcbelt.between(1, 5), 1.0, np.nan)))
    F.set('health', (4 - d.health).where(d.health.between(1, 4)))
    base = pd.DataFrame(dict(uid='gss:' + d.pid + ':' + d.transition, cluster='gss:' + d.pid, weight=d.weight,
                             female=(d.sex == 2).astype(float),
                             union_type='Married', same_sex=0.0, sub=d.panel))
    base['obs_year'] = d.from_year.astype(float)
    base['age_obs'] = d.age.astype(float)
    # Marriage duration is not asked: t0 is derived later from the imputed age at marriage.
    spells = pd.DataFrame(dict(uid=base.uid, t0=np.nan, t1=np.nan, event=d.event, divorce_event=d.divorced_only.astype(float),
                               kind='interval', length=2.0))
    return F.frame(base), spells


# ----------------------------------------------------------------------------- HCMST 2009
def hcmst():
    import pyreadstat
    os.environ['HCMST_RAW'] = PATHS['hcmst_raw']
    sys.path.insert(0, str(REPRO / 'hcmst'))
    import hcmst_data as h
    h.RAW = Path(PATHS['hcmst_raw'])
    c, periods, _ = h.couples_2009()
    a, _ = pyreadstat.read_dta(str(Path(PATHS['hcmst_raw']) / 'HCMST_ver_3.04.dta'),
                               usecols=['caseid_new', 'ppage', 'q9', 'ppgender', 'q21b', 'q21c', 'q21d', 'respondent_race', 'partner_race',
                                        'papreligion', 'respondent_relig_16_cat', 'pppartyid3', 'pprent', 'ppwork', 'ppreg9', 'pphispan',
                                        'respondent_yrsed', 'partner_yrsed', 'respondent_mom_yrsed', 'q17a', 'q17b', 'same_sex_couple',
                                        'married', 'coresident', 'ppincimp', 'hhinc', 'how_long_relationship'])
    d = c.merge(a.rename(columns={'caseid_new': 'id'}), on='id', how='left', suffixes=('', '_raw'))
    n = len(d)
    F = Frame('hcmst', n)
    married = d.married_raw == 1 if 'married_raw' in d else d.married == 'Yes'
    age_union = np.where(married & (d.q21d > 0), d.q21d, np.where(d.q21b > 0, d.q21b, np.nan))
    F.set('age_at_marriage', age_union)
    dur = np.where(married & (d.q21d > 0), d.ppage - d.q21d, d.relationship_years)
    dur = np.clip(dur, 0, 80)
    F.set('wedding_year', 2009.1 - dur)
    page = d.q9.where(d.q9 > 0)
    F.set('abs_age_gap', (d.ppage - page).abs().clip(upper=40))
    F.set('race', d.respondent_race.map({1: 'White', 2: 'Black', 4: 'Asian', 6: 'Hispanic', 3: 'Other', 5: 'Other'}))
    F.set('educ', edu_years(d.respondent_yrsed))
    F.set('spouse_educ', edu_years(d.partner_yrsed))
    F.set('interracial', np.where(d.couple_race == 'Interracial', 1.0, np.where(d.couple_race.str.startswith('Both'), 0.0, np.nan)))
    F.set('mother_educ', mother_years(d.respondent_mom_yrsed))
    F.set('religion_raised', d.respondent_relig_16_cat.map({1: 'Protestant', 2: 'Catholic', 3: 'Other', 4: 'Other', 5: 'None'}))
    F.set('religion_now', d.papreligion.map({1: 'Protestant', 2: 'Protestant', 9: 'Protestant', 11: 'Protestant', 3: 'Catholic', 13: 'None',
                                             4: 'Other', 5: 'Other', 6: 'Other', 7: 'Other', 8: 'Other', 10: 'Other', 12: 'Other'}))
    F.set('party', d.pppartyid3.map({1: 'Republican', 2: 'Independent or other', 3: 'Democrat'}))
    ca = d.q21c.where(d.q21c > 0)
    F.set('cohab_first', np.where(married & (d.q21d > 0), np.where(ca.notna() & (ca <= d.q21d), 1.0,
                                                                     np.where(d.q21c == -1, np.nan, 0.0)), np.nan))
    F.set('married_before', yn(d.prior_marriage))
    F.set('rel_quality', d.relationship_quality.map({'Excellent': 2, 'Good': 1, 'Fair': 0, 'Poor or very poor': 0}))
    F.set('log_income', np.log(np.clip(to2020(d.hh_income_k * 1000, 2009), 1000, 1e6)))
    F.set('home_owner', np.where(d.pprent == 1, 1.0, np.where(d.pprent.isin([2, 3]), 0.0, np.nan)))
    F.set('employed', np.where(d.ppwork.isin([1, 2]), 1.0, np.where(d.ppwork.between(3, 7), 0.0, np.nan)))
    F.set('region', d.ppreg9.map({1: 'Northeast', 2: 'Northeast', 3: 'Midwest', 4: 'Midwest', 5: 'South', 6: 'South', 7: 'South', 8: 'West', 9: 'West'}))
    ut = np.where(married, 'Married', np.where(d.cohabiting == 'Yes', 'Cohabiting, unmarried', 'Dating, not living together'))
    base = pd.DataFrame(dict(uid='hcmst:' + d.id.astype(str), cluster='hcmst:' + d.id.astype(str), weight=d.weight,
                             female=(d.ppgender == 2).astype(float), union_type=ut, same_sex=(d.same_sex_couple == 1).astype(float),
                             sub=np.where(married, 'married', 'unmarried')))
    base['obs_year'] = 2009.1
    base['age_obs'] = d.ppage.to_numpy(float)
    # Follow-up periods between waves (dates in hcmst_data.WAVE_MONTHS), from the baseline duration.
    cut = np.array(h.CUT, float)
    per = periods.merge(pd.DataFrame(dict(id=d.id, d0=dur, uid=base.uid)), on='id')
    p = per.period.astype(int)
    per['t0'] = per.d0 + (cut[p - 1] - cut[0]) / 12
    per['t1'] = per.d0 + (cut[p] - cut[0]) / 12
    spells = pd.DataFrame(dict(uid=per.uid, t0=per.t0, t1=per.t1, event=per.event, divorce_event=np.nan, kind='interval',
                               length=per.t1 - per.t0))
    return F.frame(base), spells


# ----------------------------------------------------------------------------- LA newlyweds
def la():
    sys.path.insert(0, str(REPRO / 'newlywed_la_karney'))
    import nl_data as nl
    nl.RAW = Path(PATHS['la_raw'])
    d = nl.load()
    n = len(d)
    F = Frame('la_newlyweds', n)
    F.set('wedding_year', np.full(n, 2009.5))
    F.set('educ', np.full(n, np.nan), lo=np.where(d.W_educ_D == 1, 0, np.where(d.W_educ_D == 0, 3, np.nan)),
          hi=np.where(d.W_educ_D == 1, 2, np.where(d.W_educ_D == 0, 4, np.nan)))
    F.set('spouse_educ', np.full(n, np.nan), lo=np.where(d.H_educ_D == 1, 0, np.where(d.H_educ_D == 0, 3, np.nan)),
          hi=np.where(d.H_educ_D == 1, 2, np.where(d.H_educ_D == 0, 4, np.nan)))
    F.set('intact_family', np.where(d.W_parent_marriage_D.isna(), np.nan, 1 - d.W_parent_marriage_D))
    z = lambda x: (x - x.mean()) / x.std()
    F.set('satisfaction_z', z((d.H_sat_sum + d.W_sat_sum) / 2))
    F.set('hostility_z', z((d.H_Hostility + d.W_Hostility) / 2))
    F.set('negativity_z', z((d.H_Negativity + d.W_Negativity) / 2))
    F.set('log_income', np.log(np.clip(to2020(d.income_avg, 2010), 1000, 1e6)))
    F.set('region', np.full(n, 'West', dtype=object))
    F.set('urban', np.ones(n))
    uid = 'la:' + d.csid.astype(str)
    base = pd.DataFrame(dict(uid=uid, cluster=uid, weight=1.0, female=1.0, union_type='Married', same_sex=0.0, sub='all'))
    rows = nl.rows(d)
    start = {p['period']: p['start_years'] for p in nl.PERIODS}
    end = {p['period']: p['end_years'] for p in nl.PERIODS}
    # Couples married about 0.3 years at baseline (recruited from recent marriage licences).
    spells = pd.DataFrame(dict(uid=uid.to_numpy()[rows.couple], t0=0.3 + rows.period.map(start), t1=0.3 + rows.period.map(end),
                               event=rows.event, divorce_event=np.nan, kind='interval'))
    spells['length'] = spells.t1 - spells.t0
    return F.frame(base), spells


BUILDERS = dict(nsfg=nsfg, nlsy79=nlsy79, nlsy97=nlsy97, sipp_retro=sipp_retro, sipp_couples=sipp_couples,
                canada_gss=canada, gss_panel=gss, hcmst=hcmst, la_newlyweds=la)


def build(only=None):
    units, spells = [], []
    for k, fn in BUILDERS.items():
        if only and k not in only:
            continue
        u, s = fn()
        u['weight'] = u.weight / u.weight.mean()
        units.append(u)
        spells.append(s)
        print(f'{k:14s} units {len(u):7d}  spells {len(s):7d}  events {int(s.event.sum()):6d}', flush=True)
    U = pd.concat(units, ignore_index=True)
    S = pd.concat(spells, ignore_index=True)
    for v, spec in VARS.items():
        if v not in U:
            U[v] = np.nan if spec['kind'] != 'nom' else None
    assert U.uid.is_unique
    return U, S


def availability(U):
    """Share of units with an exact or coarsened answer, per survey and input."""
    out = {}
    for s, g in U.groupby('survey'):
        out[s] = {}
        for v, spec in VARS.items():
            obs = g[v].notna()
            if v + '__lo' in g:
                obs |= g[v + '__lo'].notna()
            if v + '__set' in g:
                obs |= g[v + '__set'].notna()
            out[s][v] = round(float(obs.mean()), 3)
    return pd.DataFrame(out)


if __name__ == '__main__':
    out = Path(sys.argv[1])
    U, S = build(sys.argv[2:] or None)
    U.to_parquet(out / 'units.parquet')
    S.to_parquet(out / 'spells.parquet')
    av = availability(U)
    av.to_csv(out / 'availability.csv')
    pd.set_option('display.width', 250)
    print(av.to_string())
