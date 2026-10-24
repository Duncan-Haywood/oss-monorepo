"""NLSY97 first marriages: one row per first marriage, outcome from the monthly marital arrays and
predictors fixed at or before the wedding month.

Reads the two column extracts that extract.py streams out of the official zip (see download.sh)
and returns a pandas DataFrame. Person-level output stays in the work directory (never in git).

Calendar: NLSY97 "continuous months" (CM), 1 = January 1980. Every date below is a CM.
"""
from pathlib import Path
import re
import numpy as np
import pandas as pd

ROUND_YEARS = list(range(1997, 2012)) + [2013, 2015, 2017, 2019, 2021, 2023]   # rounds 1..21
N_RESPONDENTS = 8984                    # NLSY97 round-1 sample (BLS)


def cm(year, month):
    return (year - 1980) * 12 + month


def _clean(s, keep_negative=False):
    s = pd.to_numeric(s, errors='coerce').astype(float)
    if keep_negative:      # money: -1..-5 are NLSY reserve codes, other negatives are real values
        return s.where(~s.isin([-1, -2, -3, -4, -5]))
    return s.where(s >= 0)


def load(work):
    work = Path(work)
    a = pd.read_csv(work / 'extract.csv', low_memory=False)
    b = pd.read_csv(work / 'extract_hhi.csv', low_memory=False)
    assert len(a) == len(b) == N_RESPONDENTS, (len(a), len(b))
    assert (a['PUBID@1997'].to_numpy() == b['PUBID@1997'].to_numpy()).all()
    return pd.concat([a, b.drop(columns='PUBID@1997')], axis=1)


def monthly(d, stem):
    """Matrix (people x CM) of a monthly array; column j is CM j (0 unused)."""
    pat = re.compile(rf'^{stem}_(\d{{4}})\.(\d\d)@XRND$')
    cols = {cm(int(m.group(1)), int(m.group(2))): c for c in d.columns if (m := pat.match(c))}
    M = np.full((len(d), max(cols) + 2), np.nan)
    for k, c in cols.items():
        M[:, k] = _clean(d[c]).to_numpy()
    return M


def col(d, name, year, keep_negative=False):
    c = f'{name}@{year}'
    return _clean(d[c], keep_negative) if c in d.columns else pd.Series(np.nan, index=d.index)


def per_round(d, name, keep_negative=False):
    """(people x 21) matrix of a round-specific variable; NaN where the round lacks it."""
    return np.column_stack([col(d, name, y, keep_negative).to_numpy() for y in ROUND_YEARS])


def attendance_band(x):
    if np.isnan(x):
        return 'Unknown'
    return {1: 'Never', 2: 'Less than monthly', 3: 'Less than monthly', 4: 'About monthly', 5: 'About monthly'}.get(int(x), 'Weekly or more')


def religion_raised(x):
    if np.isnan(x):
        return 'Unknown'
    x = int(x)
    if x == 1:
        return 'Catholic'
    if 2 <= x <= 13:
        return 'Protestant'
    if x in (25, 26, 27):
        return 'None'
    return 'Other'


def family12(x):
    if np.isnan(x):
        return 'Unknown'
    x = int(x)
    return 'Both biological parents' if x == 1 else ('Biological parent and step or other parent' if x in (2, 3)
                                                     else ('Single biological parent' if x in (4, 5) else 'Other arrangement'))


def race_key(x):
    return {1: 'Black', 2: 'Hispanic', 3: 'Non-Black non-Hispanic', 4: 'Non-Black non-Hispanic'}.get(x, 'Unknown')


def hgc_band(x):
    if x is None or np.isnan(x) or x == 95:
        return 'Unknown'
    return 'Less than 12 years' if x < 12 else ('12 years' if x == 12 else ('13-15 years' if x < 16 else '16+ years'))


def build(work):
    d = load(work)
    n = len(d)
    pub = d['PUBID@1997'].to_numpy()
    sex = _clean(d['KEY!SEX@1997']).map({1: 'Male', 2: 'Female'}).fillna('Unknown').to_numpy()
    birth = (cm(_clean(d['KEY!BDATE_Y@1997']), _clean(d['KEY!BDATE_M@1997']))).to_numpy()
    wed = _clean(d['CVC_FIRST_MARRY_MONTH@XRND']).to_numpy()
    S = monthly(d, 'MAR_STATUS')
    L = monthly(d, 'MAR_PARTNER_LINK')
    COL = monthly(d, 'SCH_COLLEGE_STATUS')
    IV = per_round(d, 'CV_INTERVIEW_CMONTH')
    weight97 = _clean(d['SAMPLING_WEIGHT_CC@1997']).to_numpy() / 100

    # Child birth months: the latest round's report for each child slot.
    kids = []
    for k in range(1, 20):
        best = np.full(n, np.nan)
        for y in ROUND_YEARS:
            for sep in ('~', '_'):
                cm_ = f'CV_CHILD_BIRTH_DATE.{k:02d}{sep}M@{y}'
                cy_ = f'CV_CHILD_BIRTH_DATE.{k:02d}{sep}Y@{y}'
                if cm_ in d.columns:
                    v = cm(_clean(d[cy_]), _clean(d[cm_])).to_numpy()
                    best = np.where(np.isnan(v), best, v)
        kids.append(best)
    kids = np.column_stack(kids)

    degree_dates = {k: _clean(d[f'CVC_{v}@XRND']).to_numpy() for k, v in
                    [('GED', 'GED'), ('HS', 'HS_DIPLOMA'), ('AA', 'AA_DEGREE'), ('BA', 'BA_DEGREE'),
                     ('MA', 'MA_DEGREE'), ('PHD', 'PHD_DEGREE'), ('PROF', 'PROF_DEGREE')]}
    region = per_round(d, 'CV_CENSUS_REGION')
    urban = per_round(d, 'CV_URBAN-RURAL')
    attend = per_round(d, 'YSAQ-282A')
    mhi = {q: per_round(d, f'YSAQ-282{q}') for q in 'CDEFG'}
    wages = per_round(d, 'YINC-1700')
    hours = {}
    for c in d.columns:
        m = re.match(r'^CVC_HOURS_WK_YR_ALL\.(\d\d)@XRND$', c)
        if m:
            yy = int(m.group(1))
            hours[(1900 if yy >= 80 else 2000) + yy] = _clean(d[c]).to_numpy()
    nw = {a: (_clean(d[f'CVC_HH_NET_WORTH_{a}@XRND'], keep_negative=True).to_numpy(),
              _clean(d[f'CVC_ASSETS_RND_{a}@XRND']).to_numpy()) for a in (20, 25)}

    # Partner roster items (round of first listing, partner slot k).
    def pitem(name, y, k, i):
        c = f'{name}.{k:02d}@{y}'
        if c not in d.columns:
            return np.nan
        v = pd.to_numeric(d.at[i, c], errors='coerce')
        return float(v) if v is not None and v >= 0 else np.nan

    hh_cols = {}
    for c in d.columns:
        m = re.match(r'^HHI_(RELY|UID|HIGHGRADE|ETHNICITY|SEX|BDATE)\.(\d\d)(~[MY])?@(\d{4})$', c)
        if m:
            hh_cols.setdefault(int(m.group(4)), {}).setdefault(int(m.group(2)), {})[m.group(1) + (m.group(3) or '')] = c
        m = re.match(r'^HHI_RACE\.(\d\d)~(\d{6})@(\d{4})$', c)
        if m:
            hh_cols.setdefault(int(m.group(3)), {}).setdefault(int(m.group(1)), {})[f'RACE{int(m.group(2))}'] = c

    def hval(i, c):
        v = pd.to_numeric(d.at[i, c], errors='coerce')
        return float(v) if v is not None and not np.isnan(v) and v >= 0 else np.nan

    def household_spouse(i, w):
        """First interview at or after the wedding where a husband/wife is on the household roster."""
        for r, y in enumerate(ROUND_YEARS):
            if np.isnan(IV[i, r]) or IV[i, r] < w or y not in hh_cols:
                continue
            for k, cs in hh_cols[y].items():
                if 'RELY' in cs and hval(i, cs['RELY']) in (1.0, 2.0):
                    out = dict(round_year=y, interview=IV[i, r], rel=hval(i, cs['RELY']))
                    out['hgc'] = hval(i, cs['HIGHGRADE']) if 'HIGHGRADE' in cs else np.nan
                    out['hisp'] = hval(i, cs['ETHNICITY']) if 'ETHNICITY' in cs else np.nan
                    out['sex'] = hval(i, cs['SEX']) if 'SEX' in cs else np.nan
                    if 'BDATE~M' in cs and 'BDATE~Y' in cs:
                        bm, by = hval(i, cs['BDATE~M']), hval(i, cs['BDATE~Y'])
                        out['birth'] = cm(by, bm) if not (np.isnan(bm) or np.isnan(by)) else np.nan
                    else:
                        out['birth'] = np.nan
                    out['black'] = hval(i, cs['RACE2']) if 'RACE2' in cs else np.nan
                    return out
            return None   # interviewed after the wedding but no spouse in the household
        return None

    rows, dropped_dates = [], []
    for i in range(n):
        w = wed[i]
        if np.isnan(w):
            continue
        w = int(w)
        w_cvc = w
        if not (w < S.shape[1] and S[i, w] == 2):
            # 158 created dates disagree with the monthly array (MAR_IMPUTE_FIRST_MARRY); the array's
            # first married month is used when it lies within 12 months, otherwise the marriage is dropped.
            idx = np.where(S[i] == 2)[0]
            if len(idx) == 0 or abs(idx[0] - w) > 12:
                dropped_dates.append(int(pub[i]))
                continue
            w = int(idx[0])
        rec = dict(wedding_cm_created=w_cvc, id=int(pub[i]), weight97=weight97[i], sex=sex[i], wedding_cm=w,
                   wedding_year=1980 + (w - 1) // 12, age_at_marriage=(w - birth[i]) / 12,
                   race_ethnicity=race_key(_clean(d['KEY!RACE_ETHNICITY@1997'])[i]))
        rec['status_at_wedding'] = S[i, w] if w < S.shape[1] else np.nan
        # Outcome: first month after the wedding in separated (3) or divorced (4); widowhood (5) censors.
        event, end, how = 0, None, 'censored'
        last_valid = w
        for t in range(w + 1, S.shape[1]):
            s = S[i, t]
            if np.isnan(s):
                continue
            if s in (3, 4):
                event, end, how = 1, t, ('separated' if s == 3 else 'divorced')
                break
            if s == 5:
                end, how = t, 'widowed'
                break
            last_valid = t
        cvc_end = _clean(d['CVC_FIRST_MARRY_END@XRND'])[i]
        cvc_end_cm = _clean(d['CVC_FIRST_MARRY_END_MONTH@XRND'])[i]
        if end is None and cvc_end == 1 and w < cvc_end_cm <= last_valid:
            # The created divorce date falls inside the observed marriage but the array never leaves
            # "married": count the created divorce.
            event, end, how = 1, int(cvc_end_cm), 'divorced (created variable only)'
        if end is None:
            end = last_valid
            years = (end - w + 0.5) / 12
        else:
            years = (end - w) / 12
        rec.update(event=event, end_how=how, end_cm=end, years=years, cvc_end=cvc_end, cvc_end_cm=cvc_end_cm)
        rec['last_interview_cm'] = np.nanmax(IV[i])

        # Cohabitation before the wedding with this spouse, and with others.
        link = L[i, w] if w < L.shape[1] else np.nan
        rec['partner_link'] = link
        t, months = w - 1, 0
        while t > 0 and S[i, t] == 1 and (np.isnan(link) or np.isnan(L[i, t]) or L[i, t] == link):
            months += 1
            t -= 1
        rec['cohab_months_before'] = months
        rec['cohabited_first'] = 'Yes' if months > 0 else 'No'
        cohab_start = w - months
        others, prev, run_links = set(), False, []
        for t in range(1, cohab_start):
            on = S[i, t] == 1
            if on:
                run_links.append(L[i, t])
            if prev and not on:
                ls = [x for x in run_links if not np.isnan(x)]
                key = ls[-1] if ls else ('spell', t)
                if not (ls and ls[-1] == link):
                    others.add(key)
                run_links = []
            prev = on
        rec['prior_cohabitations'] = len(others)

        b = kids[i][~np.isnan(kids[i])]
        rec['children_before'] = int((b < w).sum())
        rec['pregnant_at_wedding'] = 'Yes' if ((b >= w) & (b <= w + 7)).any() else 'No'

        dd = {k: v[i] for k, v in degree_dates.items()}
        have = lambda k: not np.isnan(dd[k]) and dd[k] <= w
        rec['education_at_marriage'] = ('Graduate degree' if any(have(k) for k in ('MA', 'PHD', 'PROF')) else
                                        'Bachelor' if have('BA') else 'Associate' if have('AA') else
                                        'High school or GED' if have('HS') or have('GED') else 'No high school credential')
        cs_ = COL[i, w] if w < COL.shape[1] else np.nan
        rec['enrolled_at_marriage'] = 'Unknown' if np.isnan(cs_) else ('Yes' if cs_ in (2, 3, 4) else 'No')

        # Last interview strictly before the wedding month.
        pre = [r for r in range(len(ROUND_YEARS)) if not np.isnan(IV[i, r]) and IV[i, r] < w]
        r0 = pre[-1] if pre else None
        rec['pre_round_year'] = ROUND_YEARS[r0] if r0 is not None else np.nan
        rec['months_since_pre_interview'] = (w - IV[i, r0]) if r0 is not None else np.nan
        reg = region[i, r0] if r0 is not None else np.nan
        rec['region'] = {1: 'Northeast', 2: 'North Central', 3: 'South', 4: 'West'}.get(reg, 'Unknown')
        ur = urban[i, r0] if r0 is not None else np.nan
        rec['urban'] = {0: 'Rural', 1: 'Urban'}.get(ur, 'Unknown')
        att = [attend[i, r] for r in pre if not np.isnan(attend[i, r])]
        rec['attendance_before'] = attendance_band(att[-1]) if att else 'Not measured before wedding'
        mh = np.nan
        for r in reversed(pre):
            v = [mhi[q][i, r] for q in 'CDEFG']
            if not any(np.isnan(v)):
                # better-oriented 1..4 items: nervous, down and depressed as coded; calm and happy reversed
                score = v[0] + (5 - v[1]) + v[2] + (5 - v[3]) + v[4]
                mh = (score - 5) / 15 * 100
                break
        rec['mhi5_before'] = mh

        wy = rec['wedding_year']
        rec['hours_year_before'] = hours.get(wy - 1, np.full(n, np.nan))[i]
        earn = np.nan
        for cal in (wy - 1, wy - 2):
            ry = cal + 1
            if ry in ROUND_YEARS:
                r = ROUND_YEARS.index(ry)
                if not np.isnan(IV[i, r]):
                    v = wages[i, r]
                    raw = pd.to_numeric(d.at[i, f'YINC-1700@{ry}'], errors='coerce')
                    earn = v if not np.isnan(v) else (0.0 if raw == -4 else np.nan)   # -4: no wage income
                    break
        rec['earnings_year_before'] = earn
        net = np.nan
        for a in (25, 20):
            val, rnd = nw[a][0][i], nw[a][1][i]
            if not np.isnan(val) and not np.isnan(rnd) and 1 <= rnd <= len(ROUND_YEARS):
                ivm = IV[i, int(rnd) - 1]
                if not np.isnan(ivm) and ivm < w:
                    net = val
                    break
        rec['net_worth_before'] = net

        # Spouse traits.
        rec.update(spouse_age_at_marriage=np.nan, spouse_hgc=np.nan, spouse_hispanic=np.nan, spouse_black=np.nan,
                   spouse_prior_marriage=np.nan, spouse_prior_children=np.nan, spouse_source='none', spouse_sex=np.nan)
        if not np.isnan(link):
            R, k = int(link) // 100, int(link) % 100
            if 1 <= R <= len(ROUND_YEARS) and 1 <= k <= 20:
                y = ROUND_YEARS[R - 1]
                age_start = pitem('YMAR-3200', y, k, i)
                age_wed = pitem('YMAR-3200A', y, k, i)
                if not np.isnan(age_wed):
                    rec['spouse_age_at_marriage'] = age_wed + 0.5
                elif not np.isnan(age_start):
                    rec['spouse_age_at_marriage'] = age_start + 0.5 + months / 12
                rec['spouse_prior_marriage'] = pitem('YMAR-4310', y, k, i)
                if np.isnan(rec['spouse_prior_marriage']):
                    rec['spouse_prior_marriage'] = pitem('YMAR-4310A', y, k, i)
                rec['spouse_prior_children'] = pitem('YMAR-4315', y, k, i)
                if np.isnan(rec['spouse_prior_children']):
                    rec['spouse_prior_children'] = pitem('YMAR-4315A', y, k, i)
                rec['partner_round_year'] = y
                # Non-current or non-resident partners: the partner section asks schooling and ethnicity.
                for suf in ('', 'A'):
                    if np.isnan(rec['spouse_hgc']):
                        rec['spouse_hgc'] = pitem(f'YMAR-3500{suf}', y, k, i)
                    if np.isnan(rec['spouse_hispanic']):
                        rec['spouse_hispanic'] = pitem(f'YMAR-4250{suf}', y, k, i)
                # Race: one code in 1997-2000 (2 = Black), select-all-that-apply from 2001 (~000002 = Black).
                for suf in ('', 'A'):
                    if not np.isnan(rec['spouse_black']):
                        break
                    single = pitem(f'YMAR-4300{suf}', y, k, i)
                    multi = f'YMAR-4300{suf}.{k:02d}~000002@{y}'
                    if not np.isnan(single) and 1 <= single <= 7:
                        rec['spouse_black'] = float(single == 2)
                    elif multi in d.columns:
                        v = pd.to_numeric(d.at[i, multi], errors='coerce')
                        if v is not None and v >= 0:
                            rec['spouse_black'] = float(v)
                if not (np.isnan(rec['spouse_hgc']) and np.isnan(rec['spouse_hispanic'])):
                    rec['spouse_source'] = 'partner section'
        hs = household_spouse(i, w)
        if hs is not None:
            # A co-resident spouse: the household roster is the source for current spouses.
            rec['spouse_source'] = 'household roster'
            if not np.isnan(hs['hgc']):
                rec['spouse_hgc'] = hs['hgc']
            if not np.isnan(hs['hisp']):
                rec['spouse_hispanic'] = hs['hisp']
            if not np.isnan(hs['black']):
                rec['spouse_black'] = hs['black']
            rec['spouse_sex'] = hs['sex']
            rec['spouse_roster_months_after_wedding'] = hs['interview'] - w
            if np.isnan(rec['spouse_age_at_marriage']) and not np.isnan(hs['birth']):
                rec['spouse_age_at_marriage'] = (w - hs['birth']) / 12
        rows.append(rec)

    m = pd.DataFrame(rows)
    i_of = {int(p): k for k, p in enumerate(pub)}
    ix = m.id.map(i_of).to_numpy()
    first = lambda name, y='1997': col(d, name, y).to_numpy()[ix]
    m['afqt_percentile'] = col(d, 'ASVAB_MATH_VERBAL_SCORE_PCT', 'XRND').to_numpy()[ix]
    hg = np.column_stack([first(c) for c in ('CV_HGC_BIO_MOM', 'CV_HGC_BIO_DAD')])
    hg[hg == 95] = np.nan
    hr = np.column_stack([first(c) for c in ('CV_HGC_RES_MOM', 'CV_HGC_RES_DAD')])
    hr[hr == 95] = np.nan
    with np.errstate(all='ignore'):
        pmax = np.nanmax(hg, axis=1)
        pmax = np.where(np.isnan(pmax), np.nanmax(hr, axis=1), pmax)
    m['parent_max_grade'] = pmax
    m['family_at_12'] = [family12(x) for x in first('CV_YTH_REL_HH_AGE_12')]
    m['poverty_ratio_1997'] = first('CV_HH_POV_RATIO') / 100
    m['religion_raised'] = [religion_raised(x) for x in first('YINF-3600')]
    m['parent_attendance_1997'] = [attendance_band(x) for x in first('P2-015')]
    m['delinquency_1997'] = first('FP_YYCRIMI')
    m['substance_1997'] = first('FP_YYSUBSI')
    sexage = col(d, 'FP_SEXAGE', 2000).to_numpy()[ix]
    s01 = col(d, 'YSAQ-300', 2001).to_numpy()[ix]
    fs = np.where(np.isnan(sexage), s01, sexage)
    iv2000 = col(d, 'CV_INTERVIEW_CMONTH', 2000).to_numpy()[ix]
    m['first_sex'] = np.where(np.isnan(fs), np.where(np.isnan(iv2000), 'Unknown', '17 or older, or not by 2001'),
                              np.where(fs < 15, 'Under 15', np.where(fs < 17, '15-16', '17 or older, or not by 2001')))
    m['children_before_marriage'] = np.where(m.children_before >= 2, '2+', m.children_before.astype(str))
    m['prior_cohabitations_band'] = np.where(m.prior_cohabitations >= 2, '2+', m.prior_cohabitations.astype(str))
    m['spouse_education'] = [hgc_band(x) for x in m.spouse_hgc]
    sh, sb = m.spouse_hispanic.to_numpy(), m.spouse_black.to_numpy()
    m['spouse_race_ethnicity'] = np.where(sh == 1, 'Hispanic', np.where(sb == 1, 'Black',
                                          np.where((sh == 0) & (sb == 0), 'Non-Black non-Hispanic', 'Unknown')))
    m['same_race_ethnicity'] = np.where(m.spouse_race_ethnicity == 'Unknown', 'Unknown',
                                        np.where(m.spouse_race_ethnicity == m.race_ethnicity, 'Same', 'Different'))
    yn = lambda v: np.where(v == 1, 'Yes', np.where(v == 0, 'No', 'Unknown'))
    m['spouse_married_before'] = yn(m.spouse_prior_marriage.to_numpy())
    m['spouse_has_children'] = yn(m.spouse_prior_children.to_numpy())
    m.loc[(m.spouse_age_at_marriage < 15) | (m.spouse_age_at_marriage > 70), 'spouse_age_at_marriage'] = np.nan
    m['spouse_age_gap'] = m.spouse_age_at_marriage - m.age_at_marriage
    # Household-roster relationship code: 1 wife, 2 husband (roster sex as a fallback).
    rel_sex = np.where(m.spouse_sex == 1, 'Male', np.where(m.spouse_sex == 2, 'Female', 'Unknown'))
    m['same_sex_marriage'] = (rel_sex != 'Unknown') & (rel_sex == m.sex.to_numpy())
    m['afqt_percentile'] = m.afqt_percentile / 1000      # 3 implied decimal places
    m.attrs['weighted_total_1997'] = float(np.nansum(weight97))
    m.attrs['dropped_inconsistent_dates'] = len(dropped_dates)
    m.attrs['ever_married_created'] = int((_clean(d['CVC_MARRIAGES_TTL@XRND']) > 0).sum())
    m.attrs['first_marriage_date_known'] = int((~np.isnan(wed)).sum())
    m.attrs['respondents'] = n
    return m
