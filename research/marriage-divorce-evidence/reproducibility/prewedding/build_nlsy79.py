"""NLSY79 first marriages on the harmonized pre-wedding feature set (SPEC.md).

Reuses the NLSY79 first-marriage lens (../nlsy79_full): its extract (extract_nlsy79_full.py) and
its builder (build_first_marriages.py, executed unchanged except that its aggregate audit is written
here instead of over the committed copy), then adds what the SPEC needs and the lens lacks:

- separation dates (the SPEC event is divorce, annulment or separation, whichever comes first; the
  lens counts legal divorce only), from the marital-status-change records of every round
  1981-2022 and the marital status at each interview;
- the 1979 interviewer's observation of the respondent's race (Q15-1), to split the screener's
  "non-Black non-Hispanic" group into White and Other;

and recodes everything to the SPEC columns with the SPEC's timing rule: a value counts only if it
was true on the wedding day and is known from information dated on or before it (or cannot change).

Sample: the lens's from-the-wedding sample, unchanged: every respondent first marriage begun
January 1981 or later with a dated start, a known end year if it ended, an interview before the
wedding (for predictors) and one after it (6,768 marriages). Nothing is dropped for missing
predictors.

Inputs: ../nlsy79_full/raw/nlsy79_all_1979-2022.zip (../nlsy79_full/download.sh, SHA-256 checked).
Outputs (gitignored, person-level): work/nlsy79.csv.gz, plus work/nlsy79_lens/ (the lens's
extracts and first_marriages.csv, the extra extract, and the lens builder's audit JSON).

Usage: python3 build_nlsy79.py [ZIP]
"""
import csv, gzip, io, json, re, subprocess, sys, zipfile
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
LENS = HERE.parent / 'nlsy79_full'
ZIP = Path(sys.argv[1]) if len(sys.argv) > 1 else LENS / 'raw' / 'nlsy79_all_1979-2022.zip'
WORK = HERE / 'work' / 'nlsy79_lens'
WORK.mkdir(parents=True, exist_ok=True)
OUT = HERE / 'work' / 'nlsy79.csv.gz'

# ------------------------------------------------------------------ 1. the lens's own extract
if not (WORK / 'lens_extract.csv').exists():
    subprocess.run([sys.executable, '-I', str(LENS / 'extract_nlsy79_full.py'), str(ZIP), str(WORK)], check=True)

# ------------------------------------------------------------------ 2. the extra extract
# Marital-status changes since the last interview, 1981-1994 (1996+ are in the lens extract as
# MARST-CHNG#-TYPE/DATE): the type of the 1st/2nd/3rd change and its month and year. Names drift
# across rounds (and 1993-94 consolidate several paths into one item), so items are chosen by their
# codebook title. Plus the interviewer's 1979 remark on the respondent's race.
EXTRA = WORK / 'prewedding_nlsy79_extract.csv'
ORD = {'1ST': 1, '2ND': 2, '3RD': 3}


def extra_items(cdb_text):
    items = {}
    for b in re.split(r'\n-{30,}\n', cdb_text):
        m = re.match(r'([A-Z]\d{5}\.\d{2})\s+\[([^]]+)\].*?Survey Year: (\S+)', b)
        if not m:
            continue
        ref, name, year = m[1].replace('.', ''), m[2], m[3]
        if ref == 'R0172700':  # Q15-1, 1979: INT REMARKS - RACE OF R (1 white, 2 black, 3 other)
            items[ref] = 'race_observed_1979'
            continue
        if not (year.isdigit() and int(year) >= 1981):
            continue
        title = ' '.join(l.strip() for l in b.split('\n')[1:6] if l.strip() and 'PRIMARY' not in l)
        # the new spouse's birth month and year, asked at the first interview after any marriage
        sb = re.match(r'(?:(MONTH|YEAR) OF BIRTH OF (?:MOST RECENT|NEW) SPOUSE|DATE OF BIRTH OF NEW SPOUSE)', title)
        if sb:
            mo = sb[1] == 'MONTH' if sb[1] else name.endswith('~M')
            items[ref] = f"sdob{year}_{'m' if mo else 'y'}"
            continue
        if int(year) > 1994:
            continue
        t = re.match(r'(1ST|2ND|3RD) CHANGE IN MARITAL STATUS SINCE LAST INT( \(B\))?(?: ORIGINAL| Since|$)', title)
        if t:
            # 1993-94: the "(B)" item is consolidated into the main one, except 1994's 3rd change,
            # which exists only as Q2-5A2.03.
            if t[2] and not (year == '1994' and t[1] == '3RD'):
                continue
            items[ref] = f'chg{year}_{ORD[t[1]]}_type'
            continue
        d = re.match(r'(MONTH|YEAR) OF (1ST|2ND|3RD) CHANGE IN MARITAL STATUS SINCE LAST INT', title)
        if d:
            items[ref] = f"chg{year}_{ORD[d[2]]}_{'m' if d[1] == 'MONTH' else 'y'}"
            continue
        d = re.match(r'DATE OF (1ST|2ND|3RD) CHANGE IN MARITAL STATUS SINCE LAST INT(:MO|:YR)?(?: ORIGINAL| When|$)', title)
        if d:
            items[ref] = f"chg{year}_{ORD[d[1]]}_{'m' if name.endswith('~M') else 'y'}"
    return items


if not EXTRA.exists():
    with zipfile.ZipFile(ZIP) as z:
        items = extra_items(z.read('nlsy79_all_1979-2022.cdb').decode())
        items['R0000100'] = 'id'
        with z.open('nlsy79_all_1979-2022.csv') as raw, open(EXTRA, 'w', newline='') as f:
            rd = csv.reader(io.TextIOWrapper(raw))
            h = next(rd)
            ix = [i for i, k in enumerate(h) if k in items]
            wr = csv.writer(f)
            wr.writerow([items[h[i]] for i in ix])
            for row in rd:
                wr.writerow([row[i] for i in ix])
    (WORK / 'prewedding_nlsy79_items.json').write_text(json.dumps(items, indent=1, sort_keys=True))

# ------------------------------------------------------------------ 3. the lens's builder
# Executed as written; only HERE is redirected so its aggregate audit lands in WORK rather than
# over ../nlsy79_full/first_marriage_sample_audit.json. Its globals (interview calendar, column
# accessor, wedding/end/second-marriage months) are reused below.
src = (LENS / 'build_first_marriages.py').read_text()
anchor = "HERE = Path(__file__).resolve().parent"
assert src.count(anchor) == 1
src = src.replace(anchor, f"HERE = Path({str(WORK)!r})")
ns = {'__name__': 'nlsy79_lens_builder', '__file__': str(LENS / 'build_first_marriages.py')}
_argv = sys.argv
sys.argv = ['build_first_marriages.py', str(WORK)]
exec(compile(src, str(LENS / 'build_first_marriages.py'), 'exec'), ns)
sys.argv = _argv
m = ns['m'].copy()
col, xr, ref, ROUNDS, iv_month, mdate = ns['col'], ns['xr'], ns['ref'], ns['ROUNDS'], ns['iv_month'], ns['mdate']
W, E, second, kids = ns['W'], ns['E'], ns['second'], ns['kids']
pid = ref('R0000100').astype(int)
row_of = {p: i for i, p in enumerate(pid)}
ex = pd.read_csv(EXTRA)
assert (ex.id.to_numpy() == pid).all()
X = {c: ex[c].to_numpy(dtype=float) for c in ex.columns}

# change records per person: (month, type), type 1 married 2 separated 3 divorced 4 reunited 5 remarried 6 widowed
chg = []
for y in range(1981, 1995):
    for j in (1, 2, 3):
        if f'chg{y}_{j}_type' in X:
            chg.append((X[f'chg{y}_{j}_type'], mdate(X[f'chg{y}_{j}_m'], X[f'chg{y}_{j}_y'])))
for y in range(1996, 2023, 2):
    for j in (1, 2, 3):
        chg.append((col(y, f'MARST-CHNG{j}-TYPE'), mdate(col(y, f'MARST-CHNG{j}-DATE~M'), col(y, f'MARST-CHNG{j}-DATE~Y'))))


def separation(i, w, upper):
    """Start of the separation that is never followed by a reconciliation within the first
    marriage, from dated change records and interview statuses in (w, upper]. Returns
    (month or nan, source). An interview reporting 'separated' with no dated separation record
    places the start midway between the previous observation and that interview."""
    obs = []
    for t, d in chg:
        if t[i] in (2, 4) and np.isfinite(d[i]) and w <= d[i] <= upper:
            obs.append((d[i], 0, 'sep' if t[i] == 2 else 'married', 'record'))
    for y in ROUNDS:
        mo = iv_month[y][i]
        if np.isfinite(mo) and w < mo <= upper:
            s = col(y, 'MARSTAT-KEY')[i]
            if s in (1, 2):
                obs.append((mo, 1, 'sep' if s == 2 else 'married', 'interview'))
    obs.sort()
    start, src, prev = np.nan, '', w
    for mo, _, state, how in obs:
        if state == 'sep' and not np.isfinite(start):
            start, src = (mo, 'record') if how == 'record' else (np.floor((prev + mo) / 2), 'interview_midpoint')
        elif state == 'married' and np.isfinite(start) and mo > start:
            start, src = np.nan, ''
        prev = mo
    return start, src


def band(g):
    if not np.isfinite(g):
        return 'Unknown'
    return 'Less than high school' if g < 12 else ('High school' if g == 12 else ('Some college' if g < 16 else 'Bachelor+'))


RELIGION = {'No religion': 'None', 'Catholic': 'Catholic', 'Baptist': 'Protestant', 'Other Protestant': 'Protestant',
            'Jewish': 'Other', 'Other': 'Other', 'Unknown': 'Unknown'}
SLOTS = range(1, 31)
rows, audit = [], {'separation_from_record': 0, 'separation_from_interview_midpoint': 0, 'spouse_educ_from_prewedding_partner': 0,
                   'separation_before_divorce': 0, 'separation_without_divorce_by_last_interview': 0}
for r in m.itertuples(index=False):
    i = row_of[r.id]
    w = r.wedding_month
    months = {y: iv_month[y][i] for y in ROUNDS if np.isfinite(iv_month[y][i])}
    last = r.last_interview_month
    upper = min(v for v in (E[i], second[i], last) if np.isfinite(v))
    sep, sep_src = separation(i, w, upper)
    if np.isfinite(sep) and (not r.ended or sep < r.exit_month):
        end, event = sep, 1
        audit['separation_from_' + sep_src] += 1
        audit['separation_before_divorce' if (r.ended and not r.widowed) else 'separation_without_divorce_by_last_interview'] += 1
    else:
        end, event = r.exit_month, int(r.event)
    # race: screener cohort (fixed); non-Black non-Hispanic split by the 1979 interviewer remark
    rc = ref('R0214700')[i]
    obsr = X['race_observed_1979'][i]
    race = 'Hispanic' if rc == 1 else 'Black' if rc == 2 else ('White' if obsr == 1 else 'Other' if obsr == 3 else 'Unknown')
    # children born before the wedding (with anyone): C1 is the first-born
    c1 = kids[0][i]
    nk = xr('NUMKID')[i]
    prior_kids = 'Yes' if r.premarital_birth == 'Yes' else ('No' if (np.isfinite(c1) and c1 >= w) or nk == 0 else 'Unknown')
    own_age = r.age_at_marriage
    # partner's age at the wedding from the partner's birth month and year, asked of everyone who
    # married since the last interview, at the first interview after the wedding (whatever the
    # couple's state by then); skipped when a second marriage began before that interview, since
    # "new spouse" would then be the second one.
    post = sorted((mo, y) for y, mo in months.items() if mo > w)
    sp_age, entry_round = np.nan, post[0][1]
    if entry_round >= 1981 and not (np.isfinite(second[i]) and second[i] <= post[0][0]) and f'sdob{entry_round}_y' in X:
        by, bm = X[f'sdob{entry_round}_y'][i], X[f'sdob{entry_round}_m'][i]
        by = by + 1900 if 0 <= by < 100 else by
        if 1900 <= by <= 2010 and 1 <= bm <= 12:
            a = (w - (by * 12 + bm - 1)) / 12
            if 14 <= a <= 99:
                sp_age = a
    sp_roster = r.spouse_age_at_marriage
    audit.setdefault('partner_age_from_birth_date', 0)
    audit.setdefault('partner_age_birth_date_vs_roster_abs_diff_le_1y', [0, 0])
    if np.isfinite(sp_age):
        audit['partner_age_from_birth_date'] += 1
        if np.isfinite(sp_roster):
            audit['partner_age_birth_date_vs_roster_abs_diff_le_1y'][0] += int(abs(sp_age - sp_roster) <= 1)
            audit['partner_age_birth_date_vs_roster_abs_diff_le_1y'][1] += 1
    # spouse education: only if dated before the wedding -- the partner co-resident at the
    # pre-wedding interview, when that partner is evidently the spouse (opposite sex, and the
    # partner's roster age then agrees within a year with the spouse's age from the birth date).
    sp_educ = 'Unknown'
    if r.cohabiting_before == 'Yes' and np.isfinite(sp_age):
        P = r.pre_round
        cands = []
        for s in SLOTS:
            if col(P, f'HHI_FINAL_RELCODE.{s:02d}')[i] == 33:
                g = col(P, f'HHI_FINAL_GENCODE.{s:02d}')[i]
                if (r.sex == 'Man' and g == 2) or (r.sex == 'Woman' and g == 1):
                    cands.append(s)
        if len(cands) == 1:
            s = cands[0]
            age_p = col(P, f'HHI_FINAL_AGE.{s:02d}')[i]
            gr = col(P, f'HHI_FINAL_GRADECODE.{s:02d}')[i]
            if 14 <= age_p <= 99 and abs(age_p + (w - r.pre_round_month) / 12 - sp_age) <= 1.0 and 0 <= gr <= 20:
                sp_educ = band(gr)
                audit['spouse_educ_from_prewedding_partner'] += 1
    woman = r.sex == 'Woman'
    own_educ = band(r.grade_completed)
    fam = r.family_at_14
    rows.append(dict(
        dataset='nlsy79', id=f'nlsy79:{r.id}', weight=r.weight,
        duration_years=(end - w + 0.5) / 12, event=event,
        event_definition=('first divorce, annulment or separation (start of the separation never followed by a '
                          'reconciliation, from dated marital-change records or midway between interviews); '
                          'widowhood, death and attrition censored'),
        wedding_year=int(r.wedding_year), respondent_sex=r.sex,
        wife_age=round(own_age if woman else sp_age, 2), husband_age=round(sp_age if woman else own_age, 2),
        wife_educ=own_educ if woman else sp_educ, husband_educ=sp_educ if woman else own_educ,
        wife_prior_marriage='No' if woman else 'Unknown', husband_prior_marriage='Unknown' if woman else 'No',
        wife_prior_children=prior_kids if woman else 'Unknown', husband_prior_children='Unknown' if woman else prior_kids,
        cohabited_first=r.cohabiting_before,
        wife_race=race if woman else 'Unknown', husband_race='Unknown' if woman else race,
        intact_family='Yes' if fam == 'Both parents' else ('Unknown' if fam == 'Unknown' else 'No'),
        religion_raised=RELIGION[r.religion_raised], country='US'))

d = pd.DataFrame(rows)
d['weight'] = d.weight / d.weight.mean()
assert (d.duration_years > 0).all() and d.id.is_unique
COLS = ['dataset', 'id', 'weight', 'duration_years', 'event', 'event_definition', 'wedding_year', 'respondent_sex',
        'wife_age', 'husband_age', 'wife_educ', 'husband_educ', 'wife_prior_marriage', 'husband_prior_marriage',
        'wife_prior_children', 'husband_prior_children', 'cohabited_first', 'wife_race', 'husband_race',
        'intact_family', 'religion_raised', 'country']
d[COLS].to_csv(OUT, index=False, compression='gzip', float_format='%.6g')

# ------------------------------------------------------------------ summary
print(f'\nwrote {OUT}: {len(d)} rows, {int(d.event.sum())} events, {d.duration_years.sum():.0f} person-years '
      f'(lens legal-divorce events: {int(m.event.sum())})')
print(json.dumps(audit, indent=1))
for c in COLS[6:]:
    if d[c].dtype == object:
        print(f'  {c:24s} Unknown {100 * (d[c] == "Unknown").mean():5.1f}%   ', d[c].value_counts().to_dict())
    else:
        print(f'  {c:24s} blank   {100 * d[c].isna().mean():5.1f}%')
# Missingness that tracks the outcome would leak through a model: compare partner fields'
# known/unknown groups on the crude event rate and the share ending within 2 years.
woman = d.respondent_sex == 'Woman'
for name, unknown in [('partner age blank', np.isnan(np.where(woman, d.husband_age, d.wife_age))),
                      ('partner educ Unknown', np.where(woman, d.husband_educ, d.wife_educ) == 'Unknown')]:
    for flag in (True, False):
        s = unknown == flag
        print(f'  {name}={flag}: n={s.sum()} events/yr={d.event[s].sum() / d.duration_years[s].sum():.4f} '
              f'ended<2y={((d.duration_years < 2) & (d.event == 1))[s].mean():.3f}')
