"""NLSY79 first marriages followed from the wedding: one row per marriage, predictors timed explicitly.

Input: lens_extract.csv and lens_codebook.json from extract_nlsy79_full.py (person-level; not in git).
Output (in the same work folder, not in git): first_marriages.csv. Aggregate counts go to
first_marriage_sample_audit.json in this folder.

Timing rules (METHODS.md has the full table):
- the wedding month W is the cross-round first-marriage start (MOBG1M/YRBG1M);
- "pre-wedding round" P = the last interview strictly before the wedding month; every time-varying
  respondent predictor (schooling, enrolment, family income, poverty, region, urban residence,
  household roster: a co-resident partner or parents) is read from round P;
- fixed early measures (1979: family at 14, parents' schooling, religion raised, attendance, Rotter;
  1980: Rosenberg, delinquency; 1980 ASVAB: AFQT; 1982: attendance) precede every wedding in the
  sample because it starts with weddings in January 1981 or later; the 1982 attendance answer is
  used only when that interview came before the wedding;
- the spouse (age, schooling, worked last year) is read from the household roster at the first
  interview after the wedding, which is when the marriage enters the risk set (delayed entry), so
  a missing spouse cannot leak a dissolution that happened before it was observed.

Usage: python3 build_first_marriages.py WORKDIR
"""
import json, sys
from collections import Counter
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
WORK = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'work'
ROUNDS = list(range(1979, 1995)) + list(range(1996, 2023, 2))
FIRST_WEDDING = 1981 * 12  # month index of January 1981: after the 1980 interview and ASVAB testing
SLOTS = range(1, 31)

cb = json.loads((WORK / 'lens_codebook.json').read_text())
L = {(v['year'], v['name']): k for k, v in cb.items()}
raw = pd.read_csv(WORK / 'lens_extract.csv')
A = {k: raw[k].to_numpy(dtype=float) for k in raw.columns}
N = len(raw)
MISSING = np.full(N, -999.0)


def col(year, name):
    k = L.get((str(year), name))
    return A[k] if k is not None else MISSING


def ref(k):
    return A[k]


# ---------------------------------------------------------------- interview calendar
iv_month = {}
for y in ROUNDS:
    m = col(y, 'CURDATE~M')
    yy = col(y, 'CURDATE~Y')
    year = np.where((yy >= 1979) & (yy <= 2025), yy, y)  # before 1993 only the month is released
    ok = (m >= 1) & (m <= 12)
    iv_month[y] = np.where(ok, year * 12 + m - 1, np.nan)

# Weighted percentile of family income within each round (everyone interviewed with a valid amount).
income_pct = {}
for y in ROUNDS:
    inc, w = col(y, 'TNFI_TRUNC'), col(y, 'SAMPWEIGHT')
    ok = (inc >= 0) & (w > 0)
    pct = np.full(N, np.nan)
    if ok.sum() > 100:
        order = np.argsort(inc[ok], kind='stable')
        xs, ws = inc[ok][order], w[ok][order]
        cw = np.cumsum(ws)
        # mid-rank percentile: share of weight strictly below plus half the weight at the value
        uniq, first = np.unique(xs, return_index=True)
        last = np.r_[first[1:], len(xs)]
        below = np.r_[0, cw][first]
        at = cw[last - 1] - below
        mid = dict(zip(uniq, 100 * (below + at / 2) / cw[-1]))
        pct[ok] = [mid[v] for v in inc[ok]]
    income_pct[y] = pct

birth = (ref('R0000500') + 1900) * 12 + ref('R0000300') - 1
sex = np.where(ref('R0214800') == 1, 'Man', 'Woman')
race = np.select([ref('R0214700') == 1, ref('R0214700') == 2], ['Hispanic', 'Black'], 'Non-Black non-Hispanic')


def mdate(mo, yr):
    ok = (mo >= 1) & (mo <= 12) & (yr >= 1900) & (yr <= 2025)
    return np.where(ok, yr * 12 + mo - 1, np.nan)


def xr(n):
    return col('XRND', n)


W = mdate(xr('MOBG1M'), xr('YRBG1M'))
E = mdate(xr('MOEN1M'), xr('YREN1M'))
# 76 ends among post-1980 weddings have a valid year but no month: placed at mid-year (July),
# or at the wedding month + 6 when that July would fall before the wedding; flagged.
end_month_imputed = ~np.isfinite(E) & (xr('YREN1M') >= 1900) & (xr('YREN1M') <= 2025)
E = np.where(end_month_imputed, xr('YREN1M') * 12 + 6, E)
never_ended = xr('YREN1M') == -998
second = mdate(xr('MOBG2M'), xr('YRBG2M'))
kids = [mdate(xr(f'C{i}DOB~M'), xr(f'C{i}DOB~Y')) for i in range(1, 12)]


def fam14(v):
    if v == 11:
        return 'Both parents'
    if v in (12, 21, 22):
        return 'Parent and step-parent'
    if v in (15, 51):
        return 'Single parent'
    if v < 0:
        return 'Unknown'
    return 'Other arrangement'


def religion_raised(v):
    return {0: 'No religion', 7: 'Catholic', 2: 'Baptist', 1: 'Other Protestant', 3: 'Other Protestant', 4: 'Other Protestant',
            5: 'Other Protestant', 6: 'Other Protestant', 8: 'Jewish', 9: 'Other'}.get(int(v), 'Unknown') if v >= 0 else 'Unknown'


def attendance(v):
    # 1979 and 1982 share one coding: 1 not at all ... 6 more than once a week.
    if v in (5, 6):
        return 'Weekly or more'
    if v in (3, 4):
        return 'Monthly'
    if v == 2:
        return 'Several times a year or less'
    if v == 1:
        return 'Never'
    return 'Unknown'


def band_grade(g):
    if not np.isfinite(g):
        return 'Unknown'
    return '<12 years' if g < 12 else ('12 years' if g == 12 else ('13-15 years' if g < 16 else '16+ years'))


delin = np.column_stack([col(1980, f'DELIN-{i}') for i in range(4, 22)])
delin_answered = (delin >= 0).sum(axis=1)
delin_count = np.where(delin_answered >= 15, ((delin > 0) & (delin <= 6)).sum(axis=1), np.nan)

audit = Counter()
rows = []
for i in range(N):
    audit['respondents'] += 1
    w = W[i]
    if not np.isfinite(w):
        audit['no_dated_first_marriage' if xr('YRBG1M')[i] != -999 else 'never_married'] += 1
        continue
    if w < FIRST_WEDDING:
        audit['wedding_before_1981'] += 1
        continue
    if not never_ended[i] and not np.isfinite(E[i]):
        audit['first_marriage_end_date_missing'] += 1
        continue
    if end_month_imputed[i] and E[i] < w:
        E[i] = w + 6 if (w + 6) // 12 == E[i] // 12 else w
    if np.isfinite(E[i]) and E[i] < w:
        audit['end_before_start'] += 1
        continue
    months = {y: iv_month[y][i] for y in ROUNDS if np.isfinite(iv_month[y][i])}
    pre = [y for y, m in months.items() if m < w]
    if not pre:
        audit['no_interview_before_wedding'] += 1
        continue
    P = max(pre, key=lambda y: months[y])
    last_round = max(months, key=lambda y: months[y])
    last = months[last_round]
    if last <= w:
        audit['no_interview_after_wedding'] += 1
        continue
    weight = col(P, 'SAMPWEIGHT')[i] / 100
    if not weight > 0:
        audit['no_weight_in_pre_wedding_round'] += 1
        continue
    # Outcome: first marriage ends (other than by widowhood) at E; otherwise censored at the last interview.
    ended = np.isfinite(E[i]) and E[i] <= last
    widowed = False
    if ended:
        after = sorted((m, y) for y, m in months.items() if m >= E[i])
        if after and col(after[0][1], 'MARSTAT-KEY')[i] == 6:
            widowed = True
        for y in ROUNDS:
            if y < 1996:
                continue
            for j in (1, 2, 3, 4):
                t = col(y, f'MARST-CHNG{j}-TYPE')[i]
                d = mdate(col(y, f'MARST-CHNG{j}-DATE~M')[i:i + 1], col(y, f'MARST-CHNG{j}-DATE~Y')[i:i + 1])[0]
                if t == 6 and np.isfinite(d) and abs(d - E[i]) <= 1:
                    widowed = True
    exit_m = E[i] if ended else last
    # Delayed entry at the first interview after the wedding at which the first marriage is still current.
    post = sorted((m, y) for y, m in months.items() if m > w)
    entry_m, entry_round = post[0]
    if ended and E[i] < entry_m:
        entry_ok = False
    else:
        entry_ok = not (np.isfinite(second[i]) and second[i] <= entry_m)
    # Spouse in the household roster at the entry round.
    spouse = dict(spouse_in_household='No', spouse_age_at_marriage=np.nan, spouse_grade=np.nan, spouse_worked='Unknown')
    stat = []
    for s in SLOTS:
        if col(entry_round, f'HHI_FINAL_RELCODE.{s:02d}')[i] == 1:
            sc = col(entry_round, f'HHI_FINAL_STATCODE.{s:02d}')[i]
            if sc in (-999,) or sc in (0, 1):
                stat.append(s)
    if len(stat) == 1:
        s = stat[0]
        g = col(entry_round, f'HHI_FINAL_GENCODE.{s:02d}')[i]
        if (sex[i] == 'Man' and g == 2) or (sex[i] == 'Woman' and g == 1):
            age = col(entry_round, f'HHI_FINAL_AGE.{s:02d}')[i]
            gr = col(entry_round, f'HHI_FINAL_GRADECODE.{s:02d}')[i]
            wk = col(entry_round, f'HHI_FINAL_WORK.{s:02d}')[i]
            spouse = dict(spouse_in_household='Yes',
                          spouse_age_at_marriage=age - (entry_m - w) / 12 if 14 <= age <= 99 else np.nan,
                          spouse_grade=gr if 0 <= gr <= 20 else np.nan,
                          spouse_worked={1: 'Yes', 0: 'No'}.get(int(wk), 'Unknown') if wk >= 0 else 'Unknown')
        else:
            spouse['spouse_in_household'] = 'Same-sex or unconfirmed'
    elif len(stat) > 1:
        spouse['spouse_in_household'] = 'Ambiguous roster'
    # Pre-wedding household roster (round P).
    rel = [col(P, f'HHI_FINAL_RELCODE.{s:02d}')[i] for s in SLOTS]
    roster_ok = any(r >= 0 for r in rel)
    partner = 'Yes' if 33 in rel else ('No' if roster_ok else 'Unknown')
    parents = 'Yes' if any(r in (4, 5, 37, 38) for r in rel) else ('No' if roster_ok else 'Unknown')
    att82_m = months.get(1982)
    att = attendance(col(1982, 'R_REL-3')[i]) if att82_m is not None and att82_m < w and col(1982, 'R_REL-3')[i] > 0 else 'Unknown'
    att_src = '1982'
    if att == 'Unknown':
        att, att_src = attendance(col(1979, 'R_REL-3')[i]), '1979'
    grade = col(P, f'HGCREV{str(P)[2:]}')[i]
    enr = col(P, f'ENROLLMTREV{str(P)[2:]}')[i]
    pov = col(P, 'POVSTATUS')[i]
    reg = col(P, 'REGION')[i]
    urb = col(P, 'URBAN-RURAL')[i]
    afqt = col(1981, 'AFQT-3')[i]
    rot = col(1979, 'ROTTER_SCORE')[i]
    ros = col(1980, 'ROSENBERG_ESTEEM_SCORE')[i]
    mg, fg = col(1979, 'HGC-MOTHER')[i], col(1979, 'HGC-FATHER')[i]
    births_before = sum(1 for k in kids if np.isfinite(k[i]) and k[i] < w)
    rows.append(dict(
        id=int(ref('R0000100')[i]), weight=weight, sex=sex[i], race=race[i],
        wedding_month=int(w), wedding_year=int(w // 12), pre_round=P, pre_round_month=int(months[P]),
        entry_round=entry_round, entry_month=int(entry_m), entry_ok=bool(entry_ok),
        exit_month=int(exit_m), ended=bool(ended), end_month_imputed=bool(end_month_imputed[i]), widowed=bool(widowed), event=int(ended and not widowed),
        last_interview_month=int(last),
        age_at_marriage=(w - birth[i]) / 12,
        grade_completed=grade if 0 <= grade <= 20 else np.nan,
        enrolled={1: 'Not enrolled', 4: 'Not enrolled', 2: 'Enrolled', 3: 'Enrolled'}.get(int(enr), 'Unknown') if enr > 0 else 'Unknown',
        afqt=afqt / 1000 if afqt >= 0 else np.nan,
        mother_grade=mg if 0 <= mg <= 20 else np.nan, father_grade=fg if 0 <= fg <= 20 else np.nan,
        family_at_14=fam14(col(1979, 'FAM-7')[i]),
        religion_raised=religion_raised(col(1979, 'R_REL-1_COL')[i]),
        attendance=att, attendance_year=att_src if att != 'Unknown' else '',
        rotter=rot if 4 <= rot <= 16 else np.nan, rosenberg=ros if 6 <= ros <= 30 else np.nan,
        delinquency=delin_count[i],
        income_percentile=income_pct[P][i],
        poverty={1: 'In poverty', 0: 'Not in poverty'}.get(int(pov), 'Unknown') if pov >= 0 else 'Unknown',
        region={1: 'Northeast', 2: 'North Central', 3: 'South', 4: 'West'}.get(int(reg), 'Unknown') if reg > 0 else 'Unknown',
        urban={1: 'Urban', 0: 'Rural'}.get(int(urb), 'Unknown') if urb >= 0 else 'Unknown',
        premarital_birth='Yes' if births_before > 0 else 'No',
        cohabiting_before=partner, lived_with_parents=parents,
        **spouse))
    audit['first_marriages_from_1981'] += 1

m = pd.DataFrame(rows)
m['own_education'] = m.grade_completed.map(band_grade)
m['spouse_education'] = m.spouse_grade.map(band_grade)
m.to_csv(WORK / 'first_marriages.csv', index=False)
agg = dict(audit)
agg.update(
    with_delayed_entry=int(m.entry_ok.sum()),
    ended_before_first_post_wedding_interview=int((~m.entry_ok).sum()),
    end_month_imputed=int(m.end_month_imputed.sum()),
    events_from_wedding=int(m.event.sum()), widowed_from_wedding=int(m.widowed.sum()),
    events_after_entry=int(m[m.entry_ok].event.sum()),
    wedding_years=[int(m.wedding_year.min()), int(m.wedding_year.max())],
    months_from_pre_round_to_wedding_median=float((m.wedding_month - m.pre_round_month).median()),
    months_from_wedding_to_entry_median=float((m.entry_month - m.wedding_month).median()),
    spouse_in_household=m.spouse_in_household.value_counts().to_dict())
(HERE / 'first_marriage_sample_audit.json').write_text(json.dumps(agg, indent=1, default=int) + '\n')
print(json.dumps(agg, indent=1, default=int))
