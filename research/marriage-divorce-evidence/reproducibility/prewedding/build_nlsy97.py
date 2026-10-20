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
- spouse prior marriage / prior children: YMAR-4310 / 4315 are asked only of partners who are not
  the current spouse/partner at the interview where they are first listed (codebook universe), so
  a known value mostly means the couple had already split -> Unknown for every spouse;
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
        sp_side = dict(age=sp_age, educ=sp_educ, prior_marriage='Unknown', prior_children='Unknown', race=sp_race)
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


if __name__ == '__main__':
    mode, work = sys.argv[1], sys.argv[2]
    if mode == 'extract':
        extract(work)
    else:
        out, m, audit = build(work)
        (HERE / 'work').mkdir(exist_ok=True)
        out.to_csv(HERE / 'work' / 'nlsy97.csv.gz', index=False, float_format='%.6g')
        print(len(out), 'rows', audit)
