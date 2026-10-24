"""Harmonise first marriages across NSFG 1995-2023 into one person-level table.

One row per ever-married respondent (her or his FIRST marriage), with:
- timing: wedding century-month (exact or imputed), months from wedding to dissolution or
  interview, event codes (divorce/annulment, separation, widowhood);
- predictors fixed at or before the wedding, harmonised to common categories;
- design: cycle, sex, weight (cycle-adjusted), stratum, cluster.

Every per-cycle choice is in CYCLES below and in METHODS.md. Run directly to print the
audit (record counts, weighted totals, MAR1DISS consistency) and write cycle_audit.csv.
"""
from pathlib import Path
import sys
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import nsfgio  # noqa: E402

SEED = 20261020
CM_CYCLES = {'1995', '2002', '2006_2010', '2011_2013', '2013_2015'}   # exact century-month dates
YEAR_CYCLES = {'2015_2017', '2017_2019', '2022_2023'}                # public dates are years only
CYCLE_ORDER = ['1995', '2002', '2006_2010', '2011_2013', '2013_2015', '2015_2017', '2017_2019', '2022_2023']

# Official public-use sample sizes (NCHS user guides / codebooks) used as hard checks.
OFFICIAL_N = {('1995', 'F'): 10847, ('2002', 'F'): 7643, ('2002', 'M'): 4928,
              ('2006_2010', 'F'): 12279, ('2006_2010', 'M'): 10403,
              ('2011_2013', 'F'): 5601, ('2011_2013', 'M'): 4815,
              ('2013_2015', 'F'): 5699, ('2013_2015', 'M'): 4506,
              ('2015_2017', 'F'): 5554, ('2015_2017', 'M'): 4540,
              ('2017_2019', 'F'): 6141, ('2017_2019', 'M'): 5206,
              ('2022_2023', 'F'): 5586, ('2022_2023', 'M'): 4371}

WEIGHT = {'1995': 'POST_WT', '2002': 'FINALWGT', '2006_2010': 'WGTQ1Q16', '2011_2013': 'WGT2011_2013',
          '2013_2015': 'WGT2013_2015', '2015_2017': 'WGT2015_2017', '2017_2019': 'WGT2017_2019',
          '2022_2023': 'WGT2022_2023'}


def design_vars(cycle, sex):
    if cycle == '1995':
        return dict(stratum='COL_STR', cluster=None)   # no PSU on the 1995 public file
    if cycle == '2002':
        return dict(stratum='SEST', cluster='SECU_R' if sex == 'F' else 'SECU')
    if cycle == '2022_2023':
        return dict(stratum='VEST', cluster='VECL')
    return dict(stratum='SEST', cluster='SECU')


def yesno(x, yes=1, no=(2, 5)):
    if x == yes:
        return 'Yes'
    if x in no:
        return 'No'
    return 'Unknown'


def race4(x):
    return {1: 'Hispanic', 2: 'White', 3: 'Black', 4: 'Other'}.get(x, 'Unknown')


def educ_mom(x, cycle):
    if cycle == '1995':   # years of schooling, 95 = no mother figure
        if x == 95:
            return 'No mother figure'
        if x is None or np.isnan(x) or x > 20:
            return 'Unknown'
        return '<HS' if x < 12 else 'HS' if x == 12 else 'Some college' if x < 16 else 'BA+'
    return {1: '<HS', 2: 'HS', 3: 'Some college', 4: 'BA+', 95: 'No mother figure'}.get(x, 'Unknown')


def mom_age_band(x, cycle):
    if cycle == '1995':   # years; 91-94 are the respondent's best guesses of a band
        if x == 95:
            return 'No mother figure'
        if x in (91, 92, 93, 94):
            return {91: '<18', 92: '18-19', 93: '20-24', 94: '25+'}[x]
        if x is None or np.isnan(x) or x > 60:
            return 'Unknown'
        return '<18' if x < 18 else '18-19' if x < 20 else '20-24' if x < 25 else '25+'
    return {1: '<18', 2: '18-19', 3: '20-24', 4: '25+', 5: '25+', 6: '25+',
            95: 'No mother figure', 96: 'No mother figure'}.get(x, 'Unknown')


def religion_raised(x, cycle):
    if cycle == '2022_2023':
        return 'Not asked'
    if cycle == '1995':
        return {0: 'None', 1: 'Protestant', 2: 'Catholic', 3: 'Other', 4: 'Other', 5: 'Protestant'}.get(x, 'Unknown')
    return {1: 'None', 2: 'Catholic', 3: 'Protestant', 4: 'Protestant', 5: 'Protestant', 6: 'Protestant',
            7: 'Protestant', 8: 'Other'}.get(x, 'Unknown')


def partners_band(x):
    if x is None or np.isnan(x) or x >= 997:
        return 'Unknown'
    return '0' if x == 0 else '1' if x == 1 else '2' if x == 2 else '3-4' if x <= 4 else '5-9' if x <= 9 else '10+'


# Variables read per cycle and sex. Keys are harmonised roles; values the file's names.
def spec(cycle, sex):
    s = dict(id='CASEID', weight=WEIGHT[cycle], evrmarry='EVRMARRY' if cycle != '1995' else 'FMARNO',
             mardat='MARDAT01', mardis='MARDIS01', marend='MAREND01', mar1diss='MAR1DISS',
             race='HISPRACE' if cycle in ('1995', '2002', '2006_2010', '2011_2013', '2013_2015', '2015_2017') else 'HISPRACE2',
             educmom='EDUCMOM', agemomb1='AGEMOMB1', brnout='BRNOUT', vry1stag='VRY1STAG',
             intvw='CMINTVW' if cycle != '1995' else 'A_DOI', hieduc='HIEDUC')
    s.update({k: v for k, v in design_vars(cycle, sex).items() if v})
    if cycle != '2022_2023':
        s['relraisd'] = 'RELRAISD'
    s['intact'] = 'INTCTFAM' if cycle == '1995' else 'INTACT18'
    if cycle in CM_CYCLES:
        s['cmbirth'] = 'BDAYCENM' if cycle == '1995' else 'CMBIRTH'
    else:
        s['fmar1age'] = 'FMAR1AGE'
    if sex == 'M' and cycle == '2002':
        s['marend'] = 'MAREND1'
    if sex == 'M' and cycle == '2015_2017':
        del s['fmar1age']
        s.update(ager='AGER')
    # Bachelor's degree date (for "BA before the wedding"); 2002 has none.
    if cycle == '1995':
        s['badate'] = 'WHENEAR1'
    elif cycle in ('2006_2010', '2011_2013', '2013_2015'):
        s['badate'] = 'CMBAGRAD'
    elif cycle in YEAR_CYCLES:
        s['bayear'] = 'EARNBA_Y'
    if sex == 'F':
        s['ptsb4'] = 'PTSB4MAL' if cycle == '1995' else 'PTSB4MAR'
        if cycle == '1995':
            s.update(fmarno='FMARNO', baby1='BABY1MO',
                     h1born='H1BORN', h1marbef='H1MARBEF', h1lvtog='LVTOGH1', h1hisp='H1HISP', h1race0='H1RACE0', h1bstrac='H1BSTRAC',
                     chborn='CHBORN', chmarbef='CHMARBEF', chlvtog='LVTOGCH', chhisp='CHHISP', chrace0='CHRACE0', chbstrac='CHBSTRAC')
        else:
            suf = '_1' if cycle == '2022_2023' else ''
            s.update(b1premar='B1PREMAR', hxagemar='HXAGEMAR' + suf, lvtoghx='LVTOGHX' + suf,
                     marbefhx='MARBEFHX' + suf, kidshx='KIDSHX' + suf)
            if cycle == '2002':
                s.update(hisphx='HISPHX', racehx1='RACEHX1')
            elif cycle in ('2006_2010', '2011_2013', '2013_2015'):
                s['hsbrace'] = 'HSBHRACE1'
            elif cycle in ('2015_2017', '2017_2019'):
                s['hsbrace'] = 'HSBNRACE1'
                s['race'] = 'HISPRACE2'   # compare like with like: husband's 1997-standard recode
    else:
        s.update(b1premar='B1PREMAR', premarw1='PREMARW1')
    return s


def impute_months(rng, wed_year, end_year, intvw_cm, group, dissolved):
    """Year-only cycles: draw wedding and end months uniformly among the (month, month) pairs
    consistent with the public years, the exact interview month and the MAR1DISS duration
    group (1: 0-12, 2: 13-24, 3: 25-36, 4: 37-48, 5: >48 months). Returns (wedding CM, months)."""
    lo, hi = {1: (0, 12), 2: (13, 24), 3: (25, 36), 4: (37, 48), 5: (49, 10**6)}.get(group, (0, 10**6))
    w = (wed_year - 1900) * 12 + np.arange(1, 13)
    if dissolved:
        e = (end_year - 1900) * 12 + np.arange(1, 13)
        W, E = np.meshgrid(w, e, indexing='ij')
        ok = (E >= W) & (E <= intvw_cm) & (E - W >= lo) & (E - W <= hi)
        if not ok.any():                      # inconsistent record: relax the group constraint
            ok = (E >= W) & (E <= intvw_cm)
        if not ok.any():
            ok = E >= W
        i = rng.integers(ok.sum())
        return int(W[ok][i]), int((E - W)[ok][i]), True
    d = intvw_cm - w
    ok = (d >= lo) & (d <= hi)
    if not ok.any():
        ok = d >= 0
    if not ok.any():
        return int(w[0]), 0, False
    i = rng.integers(ok.sum())
    return int(w[ok][i]), int(d[ok][i]), True


def husband_group_2002(hisp, race):
    if hisp == 1:
        return 'Hispanic'
    if hisp == 5:
        return {4: 'Black', 5: 'White', 1: 'Other', 2: 'Other', 3: 'Other'}.get(race, 'Unknown')
    return 'Unknown'


def husband_group_1995(hisp, race0, bstrac):
    if hisp == 1:
        return 'Hispanic'
    if hisp == 2:
        r = bstrac if bstrac in (1, 2, 3, 4) else race0
        return {3: 'Black', 4: 'White', 1: 'Other', 2: 'Other'}.get(r, 'Unknown')
    return 'Unknown'


def nan_to_none(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else x


def build_cycle(cycle, sex, rng, audit):
    s = spec(cycle, sex)
    d = nsfgio.load(cycle, sex, list(dict.fromkeys(s.values())))
    raw = pd.DataFrame({k: d[v] for k, v in s.items()})
    n_file = len(raw)
    assert n_file == OFFICIAL_N[(cycle, sex)], (cycle, sex, n_file)
    a = dict(cycle=cycle, sex=sex, records=n_file, official_records=OFFICIAL_N[(cycle, sex)],
             weighted_total_millions=round(float(raw.weight.sum()) / 1e6, 2))
    ever = raw[raw.evrmarry >= 1]
    a['ever_married'] = len(ever)
    rows, dropped, mismatch, relaxed = [], 0, 0, 0
    for r in ever.to_dict('records'):
        r = {k: nan_to_none(v) for k, v in r.items()}
        if r['mardat'] is None or r['mardat'] >= 9997:
            dropped += 1
            continue
        marend = r['marend']
        ended = marend in (1, 2, 3)
        if cycle in CM_CYCLES:
            wed_cm = int(r['mardat'])
            months = r['mar1diss']
            if months is None or months > 900:
                dropped += 1
                continue
            end_cm = int(r['mardis']) if ended and r['mardis'] is not None and r['mardis'] < 9000 else int(r['intvw'])
            if wed_cm + months != end_cm:
                mismatch += 1
            age = (wed_cm - r['cmbirth']) / 12
            imputed = False
        else:
            wy = int(r['mardat'])
            ey = int(r['mardis']) if ended and r['mardis'] is not None and r['mardis'] < 9000 else None
            if ended and ey is None:
                dropped += 1
                continue
            wed_cm, months, consistent = impute_months(rng, wy, ey, int(r['intvw']), r['mar1diss'], ended)
            relaxed += not consistent
            imputed = True
            if 'fmar1age' in r:
                fa = r['fmar1age']
                age = fa + 0.5 if fa is not None and fa < 90 else np.nan
            else:
                # 2015-2017 men: the public file suppresses age at marriage (HISAGEM/AGEMARRN are
                # blank for nearly everyone) and birth dates. Use age at interview (completed
                # years, so birth is ~6 months before CMINTVW - 12*AGER - 6 on average) and the
                # imputed wedding month.
                age = (wed_cm - (int(r['intvw']) - 12 * r['ager'] - 6)) / 12
        wedding_year = 1900 + (wed_cm - 1) // 12
        out = dict(id=f'{cycle}{sex}{int(r["id"])}', cycle=cycle, sex=sex, raw_weight=r['weight'],
                   stratum=f'{cycle}{sex}:{int(r["stratum"])}',
                   cluster=f'{cycle}{sex}:{int(r["stratum"])}:{int(r["cluster"])}' if 'cluster' in r else f'{cycle}{sex}:{int(r["id"])}',
                   wedding_cm=wed_cm, months=months, dates_imputed=imputed,
                   event=int(marend in (1, 2)), divorced_only=int(marend == 1), widowed=int(marend == 3),
                   age_at_marriage=age, wedding_year=wedding_year, interview_cm=int(r['intvw']))
        out['race_ethnicity'] = race4(r['race'])
        out['born_outside_us'] = yesno(r['brnout'])
        out['intact_family'] = ({1: 'Yes', 2: 'Yes', 3: 'No'}.get(r['intact'], 'Unknown') if cycle == '1995'
                                else yesno(r['intact']))
        out['mother_education'] = educ_mom(r['educmom'], cycle)
        out['mother_age_first_birth'] = mom_age_band(r['agemomb1'], cycle)
        out['religion_raised'] = religion_raised(r.get('relraisd'), cycle)
        # Years sexually active before the wedding (0 if first sex at or after it).
        fs = r['vry1stag']
        if fs is None or fs >= 90 or np.isnan(age):
            out['premarital_sex_years'] = np.nan
        else:
            out['premarital_sex_years'] = float(max(0.0, age - (fs + 0.5)))
        # Bachelor's degree completed by the wedding (dates); unknown when no date exists.
        hieduc = r.get('hieduc')
        if cycle == '2002':
            out['ba_by_wedding'] = 'Unknown'
        else:
            bd = r.get('badate')
            by = r.get('bayear')
            if bd is not None and bd < 9000:
                out['ba_by_wedding'] = 'Yes' if bd <= wed_cm else 'No'
            elif by is not None and by < 9000:
                out['ba_by_wedding'] = 'Yes' if by <= wedding_year else 'No'
            elif bd is not None or by is not None:
                out['ba_by_wedding'] = 'Unknown'      # had a BA but the date was not given
            else:
                out['ba_by_wedding'] = 'No'            # no bachelor's degree at interview
        out['education_at_interview'] = hieduc        # leakage-flagged; sensitivity only
        if sex == 'F':
            if cycle == '1995':
                first_is_h1 = (r['fmarno'] or 0) > 1
                p = 'h1' if first_is_h1 else 'ch'
                born = r[p + 'born']
                sa = (wed_cm - born) / 12 if born is not None and born < 9000 else np.nan
                out['spouse_age_at_marriage'] = sa if 14 <= sa <= 80 else np.nan   # drops impossible birth dates
                out['spouse_married_before'] = yesno(r[p + 'marbef'])
                out['cohabited_first'] = yesno(r[p + 'lvtog'])
                out['spouse_prior_children'] = 'Not asked'
                hus = husband_group_1995(r[p + 'hisp'], r[p + 'race0'], r[p + 'bstrac'])
                b = r['baby1']
                out['premarital_birth'] = 'Yes' if b is not None and b < 9000 and b < wed_cm else 'No'
            else:
                hx = r['hxagemar']
                if cycle == '2022_2023':
                    out['spouse_age_at_marriage'] = np.nan   # public file has 5-year bands only
                    out['spouse_age_band_2022'] = hx
                else:
                    out['spouse_age_at_marriage'] = hx if hx is not None and hx < 90 else np.nan
                out['spouse_married_before'] = yesno(r['marbefhx'], no=(5,))
                out['cohabited_first'] = yesno(r['lvtoghx'], no=(5,))
                out['spouse_prior_children'] = yesno(r['kidshx'], no=(5,))
                if cycle == '2002':
                    hus = husband_group_2002(r['hisphx'], r['racehx1'])
                elif cycle == '2022_2023':
                    hus = 'Not asked'
                else:
                    hus = race4(r['hsbrace'])
                out['premarital_birth'] = 'Yes' if r['b1premar'] == 1 else 'No'
            out['husband_race_ethnicity'] = hus
            out['same_race_ethnicity'] = (hus if hus in ('Not asked', 'Unknown') else
                                          'Same' if hus == out['race_ethnicity'] else 'Different')
            out['premarital_partners'] = partners_band(r['ptsb4'])
        else:
            out['spouse_age_at_marriage'] = np.nan
            out['spouse_married_before'] = 'Not asked'
            out['spouse_prior_children'] = 'Not asked'
            out['same_race_ethnicity'] = 'Not asked'
            out['husband_race_ethnicity'] = 'Not asked'
            out['premarital_partners'] = 'Not asked'
            out['cohabited_first'] = yesno(r['premarw1'])
            out['premarital_birth'] = 'Yes' if r['b1premar'] == 1 else 'No'
        rows.append(out)
    m = pd.DataFrame(rows)
    a.update(first_marriages=len(m), dropped_missing_dates=dropped, cm_mismatch_mar1diss=mismatch,
             year_cycle_group_inconsistent=relaxed, dissolutions=int(m.event.sum()),
             divorce_or_annulment=int(m.divorced_only.sum()), separations=int((m.event - m.divorced_only).sum()),
             widowed_censored=int(m.widowed.sum()),
             wedding_years=[int(m.wedding_year.min()), int(m.wedding_year.max())])
    # Cycle-adjusted weight: each file's weights rescaled to average 1 over ALL its respondents,
    # so a cycle counts in proportion to its sample size while keeping its internal weighting.
    m['cycle_weight'] = m.raw_weight / raw.weight.mean()
    audit.append(a)
    return m


def build(cycles=CYCLE_ORDER, sexes=('F', 'M')):
    rng = np.random.default_rng(SEED)
    audit, parts = [], []
    for c in cycles:
        for sx in sexes:
            if (c, sx) not in nsfgio.FILES or (c == '1995' and sx == 'M'):
                continue
            parts.append(build_cycle(c, sx, rng, audit))
    m = pd.concat(parts, ignore_index=True)
    return m, pd.DataFrame(audit)


if __name__ == '__main__':
    m, audit = build()
    pd.set_option('display.width', 250)
    print(audit.to_string(index=False))
    audit.to_csv(HERE / 'cycle_audit.csv', index=False)
    for c in ['race_ethnicity', 'born_outside_us', 'intact_family', 'mother_education', 'mother_age_first_birth',
              'religion_raised', 'ba_by_wedding', 'cohabited_first', 'premarital_birth', 'spouse_married_before',
              'spouse_prior_children', 'same_race_ethnicity', 'premarital_partners']:
        print(pd.crosstab(m.cycle + m.sex, m[c]).to_string(), '\n')
    print(m.groupby(['cycle', 'sex'])[['age_at_marriage', 'spouse_age_at_marriage', 'premarital_sex_years', 'months']].describe().round(1).to_string())


def validate_imputation(m, n_draws=1):
    """Coarsen the exact-date cycles to what the 2015+ public files show (wedding and end
    years, exact interview month, MAR1DISS group) and re-impute months with impute_months.
    Returns per-marriage exact and imputed durations so the error can be summarised."""
    rng = np.random.default_rng(SEED + 7)
    ex = m[(m.cycle.isin(['2006_2010', '2011_2013', '2013_2015']))]
    out = []
    for r in ex.itertuples(index=False):
        wy = 1900 + (r.wedding_cm - 1) // 12
        end_cm = r.wedding_cm + int(r.months)
        ended = bool(r.event or r.widowed)
        ey = 1900 + (end_cm - 1) // 12 if ended else None
        g = 1 if r.months <= 12 else 2 if r.months <= 24 else 3 if r.months <= 36 else 4 if r.months <= 48 else 5
        _, mi, _ = impute_months(rng, wy, ey, r.interview_cm if not ended else max(r.interview_cm, end_cm), g, ended)
        out.append(dict(cycle=r.cycle, sex=r.sex, event=r.event, exact_months=r.months, imputed_months=mi))
    return pd.DataFrame(out)


def validate_age_from_ager(cycle='2013_2015', sex='M'):
    """Check the 2015-2017 men's age-at-marriage proxy on a cycle with exact birth dates."""
    d = nsfgio.load(cycle, sex, ['EVRMARRY', 'CMBIRTH', 'MARDAT01', 'CMINTVW', 'AGER'])
    d = d[(d.EVRMARRY == 1) & (d.MARDAT01 < 9000)]
    exact = (d.MARDAT01 - d.CMBIRTH) / 12
    proxy = (d.MARDAT01 - (d.CMINTVW - 12 * d.AGER - 6)) / 12
    return (proxy - exact).describe()
