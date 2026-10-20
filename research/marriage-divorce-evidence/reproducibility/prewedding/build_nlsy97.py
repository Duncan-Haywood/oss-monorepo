"""NLSY97 first marriages -> harmonized pre-wedding rows (see SPEC.md).

Reuses the NLSY97 first-marriage lens (../nlsy97_first_marriage): build_marriages.build() makes one
row per first marriage (wedding month, monthly separation/divorce outcome, dated cohabitation and
birth histories, dated credentials) and train_models.prepare() applies its sample restriction
(same-sex couples identified on the household roster are excluded, as in the lens). This script
only adds what the lens does not keep and maps to the SPEC columns.

What is knowable on the wedding day here:
- respondent: age at the wedding (birth month), sex and race (KEY variables, fixed), education
  completed by the wedding month from the dated credentials (CVC_*_DEGREE / _HS_DIPLOMA / _GED
  months) plus college enrolment months (SCH_COLLEGE_STATUS) and the highest grade completed at
  the last interview before the wedding (CV_HGC_EVER_EDT); children born before the wedding month
  (CV_CHILD_BIRTH_DATE); prior marriage = No by construction;
- cohabitation before the wedding with the same partner: the monthly MAR_STATUS / MAR_PARTNER_LINK
  arrays (dated months), Unknown when the month before the wedding is not covered by the array;
- spouse age at the wedding: YMAR-3200A / YMAR-3200 (+ cohabitation months) or the roster birth
  date (fixed by dates, kept even when reported after the wedding);
- spouse race-ethnicity: household roster or partner section (fixed trait, kept);
- spouse education: ONLY the household roster of the last interview BEFORE the wedding, when the
  future spouse was already listed there as the respondent's co-resident partner (HHI_HIGHGRADE,
  linked through PARTNERS_ID / PARTNERS_UID). The lens's post-wedding roster schooling (median 7
  months after) and the partner-section schooling (asked only of partners no longer current, i.e.
  mostly already separated) are NOT used -> Unknown;
- spouse prior marriage / prior children: YMAR-4310 / 4315 (asked of partners first listed in 2011
  or later, at the interview where they are first listed; in practice 99% of such spouses have an
  answer, so availability does not depend on the outcome) are kept only when that listing
  interview precedes the wedding month (a cohabiting partner listed before the wedding). Listed
  after the wedding, or before 2011 -> Unknown;
- intact family: CV_YTH_REL_HH_AGE_12 (1997) and CV_YTH_REL_HH_CURRENT at every round 1997-2003
  that precedes the wedding and the respondent's 19th birthday;
- religion raised: own religious preference in 1997 (ages 12-16), the lens's proxy.

Usage:
  python3 -I build_nlsy97.py extract WORK   # once: streams the few extra columns out of the zip
  python3 -I build_nlsy97.py build WORK [--refit]
WORK is the lens's work directory (download.sh with NLSY97_WORK=WORK). Writes work/nlsy97.csv.gz
here; with --refit also leakage_nlsy97.csv and leakage_refit_nlsy97.csv.
"""
from pathlib import Path
import io, re, subprocess, sys, zipfile
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
LENS = HERE.parent / 'nlsy97_first_marriage'
ZIPNAME = 'nlsy97_all_1997-2023.zip'
EXTRA = 'extract_prewedding_nlsy97.csv'

COLUMNS = ['dataset', 'id', 'weight', 'duration_years', 'event', 'event_definition', 'wedding_year',
           'respondent_sex', 'wife_age', 'husband_age', 'wife_educ', 'husband_educ', 'wife_prior_marriage',
           'husband_prior_marriage', 'wife_prior_children', 'husband_prior_children', 'cohabited_first',
           'wife_race', 'husband_race', 'intact_family', 'religion_raised', 'country']
EVENT_DEF = ('first month after the wedding in which the monthly marital-status array reads separated or '
             'divorced (created divorce date in 4 marriages the array never closes); widowhood and the last '
             'interview censor; monthly clock')


# ------------------------------------------------------------------ extra columns from the zip
EXTRA_PATTERNS = [(r'PUBID', r'1997'), (r'KEY!RACE', r'1997'),
                  (r'CV_YTH_REL_HH_CURRENT', r'(1997|1998|1999|2000|2001|2002|2003)'),
                  (r'HHI_RACE\.\d\d', r'(1997|1998|1999|2000)')]


def extract(work):
    work = Path(work)
    zp = work / ZIPNAME
    z = zipfile.ZipFile(zp)
    hdr = re.compile(r'^(\S+)\s+\[(\S+)\]\s+Survey Year: (\S+)')
    pats = [(re.compile(a), re.compile(b)) for a, b in EXTRA_PATTERNS]
    out = []
    for line in io.TextIOWrapper(z.open('nlsy97_all_1997-2023.cdb'), encoding='latin-1'):
        m = hdr.match(line)
        if m and any(a.fullmatch(m.group(2)) and b.fullmatch(m.group(3)) for a, b in pats):
            out.append(f'{m.group(1)} {m.group(2)}@{m.group(3)}')
    vf = work / 'vars_prewedding_nlsy97.txt'
    vf.write_text('\n'.join(out) + '\n')
    print('extra columns', len(out), flush=True)
    subprocess.run([sys.executable, '-I', str(LENS / 'extract.py'), str(zp), str(vf), str(work / EXTRA)], check=True)


# ------------------------------------------------------------------ lens imports
def lens():
    sys.path[:0] = [str(LENS), str(HERE.parent), str(HERE.parent.parent / 'app' / 'tools')]
    import build_marriages as bm  # noqa: E402
    import train_models as tm  # noqa: E402
    return bm, tm


def hgc_educ(x):
    if np.isnan(x) or x == 95:
        return 'Unknown'
    return ('Less than high school' if x < 12 else 'High school' if x == 12 else
            'Some college' if x < 16 else 'Bachelor+')


def race_from_codes(hisp, single, multi):
    """hisp: 1/0/nan; single: 1997-2000 one-code race (1 White, 2 Black, 3 AIAN, 4 API, 5 other,
    6 refuses except Hispanic, 7 mixed); multi: dict code->0/1 (2001+: 1 White, 2 Black, 3 Asian,
    4 NHPI, 5 AIAN, 6 other, 7 Hispanic, 8 unknown, 9 multiracial)."""
    if hisp == 1 or multi.get(7) == 1 or single == 6:
        return 'Hispanic'
    if multi and any(v == v for v in multi.values()) and any(multi.get(c) == 1 for c in (1, 2, 3, 4, 5, 6, 9)):
        if multi.get(2) == 1:
            return 'Black'
        if multi.get(1) == 1 and not any(multi.get(c) == 1 for c in (3, 4, 5, 6, 9)):
            return 'White' if hisp == 0 else 'Unknown'
        return 'Other' if hisp == 0 else 'Unknown'
    if single == single and single is not None and 1 <= single <= 7:
        if single == 2:
            return 'Black'
        return ('White' if single == 1 else 'Other') if hisp == 0 else 'Unknown'
    return 'Unknown'


def build(work):
    bm, tm = lens()
    work = Path(work)
    pkl = work / 'marriages.pkl'
    raw = pd.read_pickle(pkl) if pkl.exists() else bm.build(work)
    if not pkl.exists():
        raw.to_pickle(pkl)
    d = bm.load(work)
    x = pd.read_csv(work / EXTRA, low_memory=False)
    assert (x['PUBID@1997'].to_numpy() == d['PUBID@1997'].to_numpy()).all()
    d = pd.concat([d, x.drop(columns='PUBID@1997')], axis=1)
    m = raw[~raw.same_sex_marriage].reset_index(drop=True)      # the lens's sample restriction
    row = {int(p): k for k, p in enumerate(d['PUBID@1997'])}
    ix = m.id.map(row).to_numpy()
    R = bm.ROUND_YEARS
    IV = bm.per_round(d, 'CV_INTERVIEW_CMONTH')
    S = bm.monthly(d, 'MAR_STATUS')
    COL = bm.monthly(d, 'SCH_COLLEGE_STATUS')
    HGC = bm.per_round(d, 'CV_HGC_EVER_EDT')
    birth = bm.cm(bm._clean(d['KEY!BDATE_Y@1997']), bm._clean(d['KEY!BDATE_M@1997'])).to_numpy()

    def val(i, c):
        if c not in d.columns:
            return np.nan
        v = pd.to_numeric(d.at[i, c], errors='coerce')
        return float(v) if v == v and v >= 0 else np.nan

    audit = dict(spouse_educ_pre_roster=0, cohab_unknown=0, educ_unknown=0)
    recs = []
    for k, r in enumerate(m.itertuples(index=False)):
        i, w = ix[k], int(r.wedding_cm)
        pre = [j for j in range(len(R)) if IV[i, j] == IV[i, j] and IV[i, j] < w]
        r0 = pre[-1] if pre else None

        # Respondent education completed by the wedding month.
        e = r.education_at_marriage
        if e in ('Graduate degree', 'Bachelor'):
            own = 'Bachelor+'
        elif e == 'Associate':
            own = 'Some college'
        elif e == 'High school or GED':
            col_before = np.isin(COL[i, 1:min(w, COL.shape[1])], (2, 3, 4)).any()
            hg = HGC[i, r0] if r0 is not None else np.nan
            own = 'Some college' if col_before or (hg == hg and 13 <= hg < 95) else 'High school'
        else:
            # No dated credential by the wedding. CVC dates are blank both for "never earned" and
            # for "earned, date unknown"; a degree reported as held at the pre-wedding interview with
            # no date is Unknown rather than Less than high school.
            hg = HGC[i, r0] if r0 is not None else np.nan
            own = 'Unknown' if (hg == hg and 12 < hg < 95) else 'Less than high school'
        audit['educ_unknown'] += own == 'Unknown'

        # Cohabitation before the wedding (dated monthly arrays).
        if r.cohab_months_before > 0:
            cohab = 'Yes'
        elif w - 1 >= 1 and S[i, w - 1] == S[i, w - 1]:
            cohab = 'No'
        else:
            cohab = 'Unknown'
        audit['cohab_unknown'] += cohab == 'Unknown'

        # Spouse education: pre-wedding roster only, partner co-resident at that interview.
        sp_educ = 'Unknown'
        link = r.partner_link
        if r0 is not None and link == link and cohab == 'Yes' and IV[i, r0] >= w - r.cohab_months_before:
            y = R[r0]
            uid = np.nan
            for j in range(1, 21):
                if val(i, f'PARTNERS_ID.{j:02d}@{y}') == link:
                    uid = val(i, f'PARTNERS_UID.{j:02d}@{y}')
                    break
            if uid == uid:
                for h in range(1, 31):
                    if val(i, f'HHI_UID.{h:02d}@{y}') == uid:
                        sp_educ = hgc_educ(val(i, f'HHI_HIGHGRADE.{h:02d}@{y}'))
                        break
        audit['spouse_educ_pre_roster'] += sp_educ != 'Unknown'

        # Spouse race-ethnicity (fixed): roster of the first post-wedding interview with a
        # husband/wife listed (the lens's choice), else the partner section.
        sp_race = 'Unknown'
        for j, y in enumerate(R):
            if IV[i, j] != IV[i, j] or IV[i, j] < w:
                continue
            for h in range(1, 31):
                if val(i, f'HHI_RELY.{h:02d}@{y}') in (1.0, 2.0):
                    multi = {c: val(i, f'HHI_RACE.{h:02d}~{c:06d}@{y}') for c in range(1, 10)}
                    multi = {c: v for c, v in multi.items() if v == v}
                    sp_race = race_from_codes(val(i, f'HHI_ETHNICITY.{h:02d}@{y}'),
                                              val(i, f'HHI_RACE.{h:02d}@{y}'), multi)
                    break
            break
        if sp_race == 'Unknown' and link == link:
            Rr, kk = int(link) // 100, int(link) % 100
            if 1 <= Rr <= len(R):
                y = R[Rr - 1]
                for suf in ('', 'A'):
                    hisp = val(i, f'YMAR-4250{suf}.{kk:02d}@{y}')
                    single = val(i, f'YMAR-4300{suf}.{kk:02d}@{y}')
                    multi = {c: val(i, f'YMAR-4300{suf}.{kk:02d}~{c:06d}@{y}') for c in range(1, 8)}
                    multi = {c: v for c, v in multi.items() if v == v}
                    # partner-section single code (1997-2000): 1 White, 2 Black, 3 Hispanic, 4 AIAN, 5 API, 6 other
                    if single == 3:
                        hisp = 1.0
                    s2 = {1: 1, 2: 2, 4: 3, 5: 4, 6: 5}.get(single, np.nan) if single == single else np.nan
                    got = race_from_codes(hisp, s2, multi)
                    if got != 'Unknown':
                        sp_race = got
                        break

        # Respondent race-ethnicity (KEY variables).
        re_ = bm._clean(d['KEY!RACE_ETHNICITY@1997'])[i]
        kr = val(i, 'KEY!RACE@1997')
        own_race = ('Black' if re_ == 1 else 'Hispanic' if re_ == 2 else 'Other' if re_ == 3 else
                    ('White' if kr == 1 else 'Other' if kr in (3.0, 4.0, 5.0) else 'Unknown') if re_ == 4 else 'Unknown')

        # Intact family: both biological parents at 12 and at every pre-wedding round 1997-2003
        # interview before the 19th birthday (adoptive parents count as intact per SPEC).
        a12 = val(i, 'CV_YTH_REL_HH_AGE_12@1997')
        obs = [a12] if a12 == a12 else []
        for j, y in enumerate(R[:7]):
            if IV[i, j] == IV[i, j] and IV[i, j] < w and IV[i, j] < birth[i] + 19 * 12:
                v = val(i, f'CV_YTH_REL_HH_CURRENT@{y}')
                if v == v:
                    obs.append(v)
        intact = 'Unknown' if not obs else ('Yes' if all(v in (1.0, 6.0) for v in obs) else 'No')

        sex = 'Woman' if r.sex == 'Female' else 'Man'
        sp_age = r.spouse_age_at_marriage if r.spouse_age_at_marriage == r.spouse_age_at_marriage else np.nan
        own_kids = 'Yes' if r.children_before > 0 else 'No'
        own_side = dict(age=r.age_at_marriage, educ=own, prior_marriage='No', prior_children=own_kids, race=own_race)
        # Spouse prior marriage / children: only when the partner-section listing preceded the wedding.
        sp_pm = sp_pc = 'Unknown'
        if link == link and 1 <= int(link) // 100 <= len(R):
            li = IV[i, int(link) // 100 - 1]
            if li == li and li < w:
                yn = {1.0: 'Yes', 0.0: 'No'}
                sp_pm = yn.get(r.spouse_prior_marriage, 'Unknown')
                sp_pc = yn.get(r.spouse_prior_children, 'Unknown')
        audit['spouse_prior_pre_listing'] = audit.get('spouse_prior_pre_listing', 0) + (sp_pm != 'Unknown')
        sp_side = dict(age=sp_age, educ=sp_educ, prior_marriage=sp_pm, prior_children=sp_pc, race=sp_race)
        wife, husb = (own_side, sp_side) if sex == 'Woman' else (sp_side, own_side)
        recs.append(dict(dataset='nlsy97', id=f'nlsy97:{int(r.id)}', weight=r.weight97, duration_years=r.years,
                         event=int(r.event), event_definition=EVENT_DEF, wedding_year=int(r.wedding_year),
                         respondent_sex=sex, wife_age=wife['age'], husband_age=husb['age'],
                         wife_educ=wife['educ'], husband_educ=husb['educ'],
                         wife_prior_marriage=wife['prior_marriage'], husband_prior_marriage=husb['prior_marriage'],
                         wife_prior_children=wife['prior_children'], husband_prior_children=husb['prior_children'],
                         cohabited_first=cohab, wife_race=wife['race'], husband_race=husb['race'],
                         intact_family=intact, religion_raised=r.religion_raised, country='US'))
    out = pd.DataFrame(recs)[COLUMNS]
    out['weight'] = out.weight / out.weight.mean()
    assert (out.duration_years > 0).all() and out.id.is_unique and out.weight.notna().all()
    return out, m, audit


PRE = 'last interview before the wedding month'
LEAKAGE = [
    # ---- predictors of the existing lens's models (train_models.GROUPS)
    ('marriage_years', 'yes', 'after wedding', 'time since the wedding (the Poisson interval clock)', 'no',
     'the time axis of the hazard model, not a wedding-day trait; every model including the constant-rate baseline conditions on it'),
    ('sex', 'yes', 'fixed at birth', 'KEY!SEX', 'no', ''),
    ('race_ethnicity', 'yes', 'fixed at birth', 'KEY!RACE_ETHNICITY', 'no', ''),
    ('age_at_marriage', 'yes', 'at wedding', 'wedding month - KEY birth month', 'no', ''),
    ('region', 'yes', 'before wedding', f'CV_CENSUS_REGION, {PRE}', 'no', 'Unknown for the 5 weddings before the round-1 interview'),
    ('urban', 'yes', 'before wedding', f'CV_URBAN-RURAL, {PRE}', 'no', ''),
    ('cohabited_first', 'yes', 'before wedding', 'monthly MAR_STATUS / MAR_PARTNER_LINK, month before the wedding', 'no',
     'dated monthly event history (filled in at later interviews but describing pre-wedding months)'),
    ('cohab_months_before', 'yes', 'before wedding', 'monthly arrays counted back from the wedding', 'no', ''),
    ('prior_cohabitations_band', 'yes', 'before wedding', 'monthly arrays, distinct earlier cohabiting partners', 'no', ''),
    ('children_before_marriage', 'yes', 'before wedding', 'CV_CHILD_BIRTH_DATE birth months before the wedding month', 'no', ''),
    ('pregnant_at_wedding', 'yes', 'after wedding', 'a birth in the wedding month or the 7 months after', 'possible',
     'defined by a birth observed after the wedding (607 marriages Yes); the pregnancy usually existed at the wedding, but '
     'pregnancies that did not end in a live birth are No and the information is dated after the wedding'),
    ('parent_max_grade', 'yes', 'before wedding', 'CV_HGC_BIO/RES_MOM/DAD, 1997', 'no', '5 weddings precede the round-1 interview'),
    ('family_at_12', 'yes', 'before wedding', 'CV_YTH_REL_HH_AGE_12, 1997 (refers to age 12)', 'no', ''),
    ('poverty_ratio_1997', 'yes', 'before wedding', 'CV_HH_POV_RATIO 1997 (income of 1996)', 'no', '5 weddings precede the round-1 interview'),
    ('religion_raised', 'yes', 'before wedding', 'YINF-3600 own religious preference, 1997, ages 12-16', 'no',
     'current preference at 12-16 used as religion raised (the lens\'s proxy)'),
    ('parent_attendance_1997', 'yes', 'before wedding', 'P2-015 parent questionnaire 1997', 'no', ''),
    ('afqt_percentile', 'yes', 'before wedding', 'ASVAB math-verbal percentile, tests 1997-98', 'no',
     '51 weddings before 1999 may precede the test; content is a test score, not marital'),
    ('delinquency_1997', 'yes', 'before wedding', 'FP_YYCRIMI 1997', 'no', ''),
    ('substance_1997', 'yes', 'before wedding', 'FP_YYSUBSI 1997', 'no', ''),
    ('first_sex', 'yes', 'before wedding', 'FP_SEXAGE (2000) / YSAQ-300 (2001): age at first sex', 'no',
     'reported in 2000-01 (after 264 weddings before 2001) but dated by age; bands are under 15 / 15-16 / 17+'),
    ('attendance_before', 'yes', 'before wedding', f'YSAQ-282A, {PRE}', 'no', ''),
    ('mhi5_before', 'yes', 'before wedding', f'YSAQ-282C-G, latest pre-wedding round', 'no', ''),
    ('education_at_marriage', 'yes', 'before wedding', 'dated credentials CVC_GED/HS_DIPLOMA/AA/BA/MA/PHD/PROF on or before the wedding month', 'no', ''),
    ('enrolled_at_marriage', 'yes', 'at wedding', 'monthly SCH_COLLEGE_STATUS in the wedding month', 'no', ''),
    ('hours_year_before', 'yes', 'before wedding', 'CVC_HOURS_WK_YR_ALL, calendar year before the wedding year', 'no', 'created from dated weekly work arrays'),
    ('earnings_year_before_k', 'yes', 'before wedding', 'YINC-1700, calendar year before (or two before) the wedding year', 'no',
     'content pre-wedding; often reported at an interview after the wedding (recall), valid skip taken as 0'),
    ('net_worth_before_k', 'yes', 'before wedding', 'CVC_HH_NET_WORTH_20/25 only if that interview preceded the wedding', 'no', ''),
    ('spouse_age_gap', 'yes', 'fixed at birth', 'YMAR-3200A/3200 (+cohabitation months) or post-wedding roster birth date', 'no',
     'value fixed by dates; missing (6.6%) median-imputed; missingness is outcome-related (41% vs 37% dissolved). Removed only in the strict variant'),
    ('spouse_education', 'yes', 'after wedding', 'household roster HHI_HIGHGRADE at the first interview at/after the wedding (median 7 months after); '
     'else partner-section YMAR-3500', 'yes',
     'roster schooling measured after the wedding (spouse may finish school in between); partner-section schooling exists only for partners '
     'not current at listing, i.e. mostly already separated (59% dissolved vs 35% for roster spouses); Unknown (6.7%, 61% dissolved) imputed by own education'),
    ('spouse_race_ethnicity', 'yes', 'fixed at birth', 'post-wedding household roster, else partner section (non-current partners)', 'no',
     'trait fixed, but where it is observed depends on post-wedding co-residence; Unknown imputed by own group (lens). Removed only in the strict variant'),
    ('same_race_ethnicity', 'yes', 'fixed at birth', 'derived from the two race-ethnicities', 'no', 'as spouse_race_ethnicity; removed only in the strict variant'),
    ('spouse_married_before', 'yes', 'after wedding', 'YMAR-4310/4310A at the interview where the partner is first listed (2011+ listings only)', 'possible',
     'reported at the listing interview, after the wedding unless the couple cohabited across an interview; 99% answered among 2011+ listings, so '
     'availability is not outcome-driven, but "Unknown" = listed before 2011 = earlier wedding cohort with longer follow-up (44% vs 17-29% dissolved)'),
    ('spouse_has_children', 'yes', 'after wedding', 'YMAR-4315/4315A at the partner listing interview (2011+ only)', 'possible',
     'children with someone else, reported after the wedding for most; could in principle include post-wedding births; same Unknown pattern as above'),
    ('wedding_year', 'no', 'at wedding', 'wedding month', 'no', 'dropped by the lens (collinear with birth year + age)'),
    # ---- harmonized columns (work/nlsy97.csv.gz)
    ('wife_age / husband_age', 'yes', 'at wedding', 'respondent: birth month; spouse: YMAR-3200A/3200 or roster birth date', 'no',
     'spouse age blank 3.1-3.5% of rows, disproportionately couples who split before the next interview'),
    ('wife_educ / husband_educ', 'yes', 'before wedding',
     'respondent: dated credentials + college enrolment months before the wedding + highest grade at the last pre-wedding interview; '
     'spouse: HHI_HIGHGRADE of the cohabiting partner on the last PRE-wedding roster only', 'no',
     'spouse education known for 2,093 marriages (cohabiting partners present at a pre-wedding interview); a lower bound if schooling continued until the '
     'wedding. Post-wedding roster and partner-section schooling deliberately NOT used -> Unknown. Grade 16+ mapped to Bachelor+, 13-15 to Some college'),
    ('wife_prior_marriage / husband_prior_marriage', 'yes', 'before wedding', 'respondent No by construction; spouse YMAR-4310 only if listed before the wedding', 'no', ''),
    ('wife_prior_children / husband_prior_children', 'yes', 'before wedding', 'respondent: child birth months before the wedding; spouse: YMAR-4315 only if listed before the wedding', 'no', ''),
    ('cohabited_first', 'yes', 'before wedding', 'monthly MAR_STATUS cohabiting with the same partner link in the month(s) before the wedding', 'no',
     'Unknown when the month before the wedding is not covered by the array'),
    ('wife_race / husband_race', 'yes', 'fixed at birth', 'respondent: KEY!RACE_ETHNICITY + KEY!RACE; spouse: roster HHI_ETHNICITY/HHI_RACE (first post-wedding '
     'roster) else partner section YMAR-4250/4300', 'no',
     'fixed trait; but spouse Unknown is outcome-related (61% dissolved vs 37% overall) because it marks couples apart by the next interview'),
    ('intact_family', 'yes', 'before wedding', 'CV_YTH_REL_HH_AGE_12 and CV_YTH_REL_HH_CURRENT at rounds 1997-2003 before the wedding and the 19th birthday', 'no',
     'Yes = both biological (or adoptive) parents at 12 and at every such round; the lens uses only the age-12 item (family_at_12)'),
    ('religion_raised', 'yes', 'before wedding', 'YINF-3600, 1997 (ages 12-16)', 'no', 'current preference at 12-16 as proxy for religion raised'),
    ('weight', 'yes', 'before wedding', 'SAMPLING_WEIGHT_CC 1997, mean 1 over rows', 'no', 'round-1 weight; attrition not reweighted'),
]
# Lens predictors flagged yes/possible (the harmonized rows are all 'no').
REMOVED = [row[0] for row in LEAKAGE if row[4] in ('yes', 'possible')]
STRICT = ['spouse_age_gap', 'spouse_race_ethnicity', 'same_race_ethnicity']


def summary(out):
    print(f'rows {len(out)}  events {int(out.event.sum())}  person-years {out.duration_years.sum():.1f}  '
          f'weighted events {np.dot(out.weight, out.event):.1f}')
    for c in COLUMNS[6:]:
        if c in ('wife_age', 'husband_age'):
            share = out[c].isna().mean()
        elif out[c].dtype == object:
            share = (out[c] == 'Unknown').mean()
        else:
            continue
        print(f'  {c:24s} unknown/blank {100 * share:5.1f}%  dissolved if unknown '
              f'{out.event[(out[c] == "Unknown") | out[c].isna()].mean() if share else float("nan"):.3f}')
    for c in COLUMNS[10:21]:
        print(' ', c, out[c].value_counts().to_dict())


LEAK_COLS = ['dataset', 'predictor', 'existing_lens_uses', 'measured_when', 'source', 'leaks', 'note']


def refit(raw, tm, removed, strict_removed, repeats=3):
    """The lens's own models (train_models.fit), its own person folds (SEED + repeat shuffle of ids,
    k % 5), held-out weighted Poisson deviance gain vs the training-fold constant rate."""
    m = tm.prepare(raw)
    iv = tm.intervals(m)
    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    variants = {'published': tm.FEATURES,
                'without': [c for c in tm.FEATURES if c not in removed],
                'strict': [c for c in tm.FEATURES if c not in removed + strict_removed]}
    res = {}
    for r in range(repeats):
        ids = m.id.to_numpy().copy()
        np.random.default_rng(tm.SEED + r).shuffle(ids)
        fold_of = {i: k % 5 for k, i in enumerate(ids)}
        ivf = iv.id.map(fold_of).to_numpy()
        base = np.zeros(len(iv))
        pr = {(k, v): np.zeros(len(iv)) for k in ('additive_spline', 'gradient_boosting') for v in variants}
        for f in range(5):
            trn, te = iv[ivf != f], iv[ivf == f]
            base[ivf == f] = (trn.weight * trn.event).sum() / (trn.weight * trn.exposure).sum()
            for (k, v) in pr:
                pr[(k, v)][ivf == f] = tm.fit(k, trn, variants[v], tm.ALPHA).predict(te)
        b = tm.deviance(y, e, w, base)
        for key, p in pr.items():
            res[(r,) + key] = 100 * (1 - tm.deviance(y, e, w, p) / b)
        print(f'refit repeat {r}:', {f'{k}/{v}': round(res[(r, k, v)], 3) for (k, v) in pr}, flush=True)
    rows = []
    for k, pub in (('additive_spline', 4.6799), ('gradient_boosting', 4.91284)):
        for v, rem in (('without', removed), ('strict', removed + strict_removed)):
            label = 'flagged yes/possible' if v == 'without' else 'flagged + all remaining spouse traits (strict)'
            g0, g1 = res[(0, k, 'published')], res[(0, k, v)]
            rows.append(dict(dataset='nlsy97', model=f'{k} (first split, as published; METHODS {pub:.2f})',
                             predictors_removed=f'{label}: ' + ';'.join(rem),
                             gain_with_percent=g0, gain_without_percent=g1, change_points=g1 - g0))
            if repeats > 1:
                g0 = np.mean([res[(r, k, 'published')] for r in range(repeats)])
                g1 = np.mean([res[(r, k, v)] for r in range(repeats)])
                rows.append(dict(dataset='nlsy97', model=f'{k} (mean of {repeats} seeded splits)',
                                 predictors_removed=f'{label}: ' + ';'.join(rem),
                                 gain_with_percent=g0, gain_without_percent=g1, change_points=g1 - g0))
    return pd.DataFrame(rows), dict(marriages=len(m), events=int(m.event.sum()), intervals=len(iv),
                                    person_years=float(e.sum()))


if __name__ == '__main__':
    mode, work = sys.argv[1], sys.argv[2]
    if mode == 'extract':
        extract(work)
    else:
        out, m, audit = build(work)
        (HERE / 'work').mkdir(exist_ok=True)
        out.to_csv(HERE / 'work' / 'nlsy97.csv.gz', index=False, float_format='%.6g')
        print(len(out), 'rows', audit)
        summary(out)
        if '--refit' in sys.argv[3:]:
            pd.DataFrame(LEAKAGE, columns=LEAK_COLS[1:]).assign(dataset='nlsy97')[LEAK_COLS].to_csv(
                HERE / 'leakage_nlsy97.csv', index=False)
            _, tm = lens()
            raw = pd.read_pickle(Path(work) / 'marriages.pkl')
            res, info = refit(raw, tm, REMOVED, STRICT)
            res.to_csv(HERE / 'leakage_refit_nlsy97.csv', index=False, float_format='%.5f')
            print(info)
            print(res.to_string(index=False))
