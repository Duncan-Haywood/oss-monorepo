"""NSFG 1995-2023 pooled first marriages -> harmonized pre-wedding rows (see SPEC.md).

Reuses the pooled lens (../nsfg_pooled_first_marriage): train_pooled.people_table() runs
harmonise.build(), which reads every cycle with nsfgio, applies the lens's sample rules and
timing (one row per ever-married respondent's FIRST marriage; women from all 8 cycles 1995 to
2022-2023, men from 2002 on; rows with no usable wedding date dropped as the lens does; the
2022-2023 husband-age bands filled with the lens's band mid-points). This script reads only
the few items the lens does not keep, so it can date them against the wedding:

- education BY THE WEDDING (respondent only): bachelor's degree date (1995 WHENEAR1,
  2006-2015 CMBAGRAD, 2015+ EARNBA_Y), high-school diploma date (1995 EARNDIP, 2002-2015
  CMHSGRAD, 2015+ EARNHS_Y), diploma/GED type (DIPGED; 2022-2023 HIEDUC = 3 is GED) and
  interview education HIEDUC used ONLY as an upper bound (no diploma at interview means none
  at the wedding; a diploma at interview and nothing beyond it, dated before the wedding,
  means High school). A degree dated in the same calendar year as the wedding (year-only
  cycles) is ambiguous -> Unknown; a bachelor's degree at interview without a date -> Unknown.
  "Some college by the wedding" cannot be dated (no college-entry date), so those people are
  Unknown. The spouse's education is never dated -> Unknown.
- children born before the wedding: raw B1PREMAR (1 yes, 2 no, blank = no live birth -> No,
  other codes Unknown); 1995 first-birth date BABY1MO vs the wedding month (same month ->
  Unknown).

Husband/wife fields follow the respondent's sex: women report on their first husband (age at
marriage, earlier marriage, children from before, race-ethnicity); the men's files are not
harmonised for the first wife by the lens, so the wife's fields are blank/Unknown for men.

Usage: python3 -I build_nsfg_pooled.py [--refit]
  (--refit --audit-only rewrites the audit without refitting.)
  Raw files in $NSFG_RAW or ../nsfg_pooled_first_marriage/raw (its download.sh). Writes
  work/nsfg_pooled.csv.gz (gitignored, person-level); with --refit also leakage_nsfg_pooled.csv
  and leakage_refit_nsfg_pooled.csv (the lens's additive spline Poisson GLM, its own 5 person
  folds).
"""
from pathlib import Path
import sys, types
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
LENS = HERE.parent / 'nsfg_pooled_first_marriage'
sys.path[:0] = [str(LENS)]
# train_pooled imports the app's bundle exporter and OOD helper at module level; they only
# write the browser bundle, which this script never does.
sys.modules.setdefault('bundle_export', types.SimpleNamespace(export=None))
sys.modules.setdefault('ood', types.SimpleNamespace())
import harmonise  # noqa: E402
import nsfgio  # noqa: E402
import train_pooled as tp  # noqa: E402

COLUMNS = ['dataset', 'id', 'weight', 'duration_years', 'event', 'event_definition', 'wedding_year',
           'respondent_sex', 'wife_age', 'husband_age', 'wife_educ', 'husband_educ', 'wife_prior_marriage',
           'husband_prior_marriage', 'wife_prior_children', 'husband_prior_children', 'cohabited_first',
           'wife_race', 'husband_race', 'intact_family', 'religion_raised', 'country']
EVENT_DEFINITION = ('first marriage ended in divorce, annulment or separation (MAREND01 1-2), whichever '
                    'came first; widowhood and interview censored')

# Items the lens does not keep, per cycle: (BA date, BA is year-only, HS date, HS is year-only,
# diploma/GED type variable or None).
EDUC_VARS = {
    '1995': ('WHENEAR1', False, 'EARNDIP', False, 'DIPGED'),
    '2002': (None, False, 'CMHSGRAD', False, 'DIPGED'),
    '2006_2010': ('CMBAGRAD', False, 'CMHSGRAD', False, 'DIPGED'),
    '2011_2013': ('CMBAGRAD', False, 'CMHSGRAD', False, 'DIPGED'),
    '2013_2015': ('CMBAGRAD', False, 'CMHSGRAD', False, 'DIPGED'),
    '2015_2017': ('EARNBA_Y', True, 'EARNHS_Y', True, 'DIPGED'),
    '2017_2019': ('EARNBA_Y', True, 'EARNHS_Y', True, 'DIPGED'),
    '2022_2023': ('EARNBA_Y', True, 'EARNHS_Y', True, None),
}


def interview_level(h, cycle):
    """HIEDUC at interview -> lt_hs / ged / hs / some / ba (codebooks: 1995-2019 codes 1-8 no
    diploma, 9 HS diploma or GED, 10-11 some college / associate, 12+ bachelor's or more;
    2022-2023 1-2 no diploma, 3 GED, 4 HS, 5-7 some college / associate, 8+ bachelor's)."""
    if h is None or np.isnan(h):
        return None
    if cycle == '2022_2023':
        return 'lt_hs' if h <= 2 else 'ged' if h == 3 else 'hs' if h == 4 else 'some' if h <= 7 else 'ba'
    return 'lt_hs' if h <= 8 else 'hs' if h == 9 else 'some' if h <= 11 else 'ba'


def compare(date, year_only, wed_cm, wed_year):
    """'before' (on or before the wedding), 'after', 'same_year' (ambiguous) or None (no valid date)."""
    if date is None or np.isnan(date) or date >= 9000 or date <= 0:
        return None
    if year_only:
        return 'before' if date < wed_year else 'after' if date > wed_year else 'same_year'
    return 'before' if date <= wed_cm else 'after'


def educ_at_wedding(r, cycle):
    """Respondent's education completed by the wedding from dated items only (docstring above)."""
    ba_v, ba_y, hs_v, hs_y, dg_v = EDUC_VARS[cycle]
    lvl = interview_level(r['HIEDUC'], cycle)
    ba = compare(r.get(ba_v), ba_y, r['wedding_cm'], r['wedding_year']) if ba_v else None
    if lvl == 'ba':
        if ba == 'before':
            return 'Bachelor+'
        ba_by = 'No' if ba == 'after' else 'Unknown'      # undated (incl. 2002) or same year
    else:
        ba_by = 'No'                                      # no BA at interview -> none at the wedding
    if lvl == 'lt_hs':
        return 'Less than high school'
    # High-school diploma by the wedding.
    hs = compare(r.get(hs_v), hs_y, r['wedding_cm'], r['wedding_year'])
    dg = r.get(dg_v) if dg_v else None
    if cycle == '2022_2023':
        diploma_only = lvl != 'ged'              # EARNHS_Y is the diploma year; GED holders have 9996
    elif cycle == '1995':
        diploma_only = True                      # EARNDIP dates the diploma OR the GED (one of them)
    else:
        diploma_only = dg == 1                   # 3 = both: the GED date is not on the file
    if hs == 'after' and diploma_only:
        return 'Less than high school'
    if ba_by == 'No' and hs == 'before' and lvl == 'hs':
        return 'High school'                     # diploma before, nothing beyond it by interview
    return 'Unknown'


def extra_items():
    """Raw items the lens does not keep, keyed by the lens's person id."""
    parts = []
    for (cycle, sex) in nsfgio.FILES:
        if cycle == '1995' and sex == 'M':
            continue
        ba_v, _, hs_v, _, dg_v = EDUC_VARS[cycle]
        names = ['CASEID', 'HIEDUC', hs_v] + [v for v in (ba_v, dg_v) if v]
        names += ['BABY1MO'] if cycle == '1995' else ['B1PREMAR']
        d = nsfgio.load(cycle, sex, list(dict.fromkeys(names)))
        d['id'] = cycle + sex + d.CASEID.astype(int).astype(str)
        parts.append(d.drop(columns='CASEID'))
    return pd.concat(parts, ignore_index=True)


def prior_children(r, cycle):
    if cycle == '1995':
        b = r.get('BABY1MO')
        if b is None or np.isnan(b):
            return 'No'                          # no live birth by the interview
        if b >= 9000:
            return 'Unknown'
        return 'Yes' if b < r['wedding_cm'] else 'No' if b > r['wedding_cm'] else 'Unknown'
    b = r.get('B1PREMAR')
    if b is None or np.isnan(b):
        return 'No'                              # universe: ever had a live birth
    return {1: 'Yes', 2: 'No'}.get(int(b), 'Unknown')


def ynu(x):
    return x if x in ('Yes', 'No') else 'Unknown'


def build():
    people, _ = tp.people_table()
    both = tp.normalise_weights(people).reset_index(drop=True)
    ex = extra_items()
    assert ex.id.is_unique
    d = both.merge(ex, on='id', how='left', validate='one_to_one')
    assert len(d) == len(both) and d.HIEDUC.notna().all()
    recs = d.to_dict('records')
    resp_educ = np.array([educ_at_wedding(r, r['cycle']) for r in recs], dtype=object)
    resp_kids = np.array([prior_children(r, r['cycle']) for r in recs], dtype=object)
    woman = (d.sex == 'F').to_numpy()

    def race(x):
        return x if x in ('Hispanic', 'White', 'Black', 'Other') else 'Unknown'

    resp_race = d.wife_race_ethnicity.map(race).to_numpy()      # lens column = respondent's own
    out = pd.DataFrame({
        'dataset': 'nsfg_pooled',
        # dataset prefix, cycle, then sex + CASEID (CASEIDs repeat across a cycle's women's and men's files)
        'id': ['nsfg:%s:%s' % (c, i[len(c):]) for c, i in zip(d.cycle, d.id)],
        'weight': d.weight,
        'duration_years': d.t,
        'event': d.event.astype(int),
        'event_definition': EVENT_DEFINITION,
        'wedding_year': d.wedding_year.astype(int),
        'respondent_sex': np.where(woman, 'Woman', 'Man'),
        'wife_age': np.where(woman, d.wife_age_at_marriage, np.nan),
        'husband_age': np.where(woman, d.husband_age_at_marriage, d.wife_age_at_marriage),
        'wife_educ': np.where(woman, resp_educ, 'Unknown'),
        'husband_educ': np.where(woman, 'Unknown', resp_educ),
        'wife_prior_marriage': np.where(woman, 'No', 'Unknown'),
        'husband_prior_marriage': np.where(woman, d.husband_married_before.map(ynu), 'No'),
        'wife_prior_children': np.where(woman, resp_kids, 'Unknown'),
        'husband_prior_children': np.where(woman, d.husband_prior_children.map(ynu), resp_kids),
        'cohabited_first': d.cohabited_first.map(ynu),
        'wife_race': np.where(woman, resp_race, 'Unknown'),
        'husband_race': np.where(woman, d.husband_race_ethnicity.map(race), resp_race),
        'intact_family': d.wife_intact_family.map(ynu),                     # respondent's own
        'religion_raised': d.wife_religion_raised.where(
            d.wife_religion_raised.isin(['None', 'Catholic', 'Protestant', 'Other']), 'Unknown'),
        'country': 'US',
    })
    assert list(out.columns) == COLUMNS and (out.duration_years > 0).all() and out.id.is_unique
    return out, d


# ---------------------------------------------------------------- leakage audit and refit
LEAKAGE = [
    # predictor, existing_lens_uses, measured_when, source, leaks, note
    ('marriage_years', 'yes', 'after wedding', 'derived (time since wedding)', 'no',
     'the time axis of the Poisson model, not a covariate; every model has it'),
    ('wife_age_at_marriage', 'yes', 'at wedding', '(MARDAT01-CMBIRTH)/12; FMAR1AGE+0.5; 2015-17 men AGER + imputed wedding month', 'no',
     'retrospective report of a wedding-day fact (respondent age in the both-sexes model)'),
    ('husband_age_at_marriage', 'yes', 'at wedding', 'HXAGEMAR (1995 H1BORN/CHBORN; 2022-23 5-year bands -> mid-points)', 'no',
     'husband age at the wedding, reported later but fixed. Missing more often for dissolved marriages (women 1995 0.7% vs 8.0%; other cycles 0.2-1.0% vs 0.9-4.4%, printed by --refit), but the lens imputes the training median with no missing indicator, so missingness itself is not a model input'),
    ('wedding_year', 'yes', 'at wedding', 'MARDAT01', 'no', 'cohort term'),
    ('wife_premarital_sex_years', 'yes', 'before wedding', 'VRY1STAG vs age at marriage', 'no',
     'years sexually active before the wedding, floored at 0; first sex after the wedding gives 0, so nothing later enters'),
    ('cohabited_first', 'yes', 'before wedding', 'LVTOGHX (1995 LVTOGH1/LVTOGCH; men PREMARW1)', 'no',
     'lived together before marrying this spouse'),
    ('husband_married_before', 'yes', 'before wedding', 'MARBEFHX (1995 H1MARBEF/CHMARBEF)', 'no',
     'whether the first husband had been married before; true on the wedding day'),
    ('husband_prior_children', 'yes', 'before wedding', 'KIDSHX', 'no',
     'CB-13 "did he have kids from a prior relationship" about the first husband; not asked 1995'),
    ('wife_race_ethnicity', 'yes', 'fixed at birth', 'HISPRACE / HISPRACE2', 'no', ''),
    ('same_race_ethnicity', 'yes', 'fixed at birth', 'husband race (HISPHX/RACEHX1, HSBHRACE1, HSBNRACE1, 1995 H1/CH items) vs wife', 'no',
     'race-ethnicity cannot change; 2022-23 husband race not published'),
    ('wife_intact_family', 'yes', 'before wedding', 'INTACT18 (1995 INTCTFAM)', 'no',
     'birth to 18: for the SHARE_UNDER18 of respondents married before 18 the window runs past the wedding, but it describes the parental household; SPEC defines intact_family as through about 15-18'),
    ('wife_premarital_birth', 'yes', 'before wedding', 'B1PREMAR (1995 BABY1MO < MARDAT01)', 'no',
     'first live birth before the first marriage; the lens maps every non-1 code to No (refused/don\'t know would be No; none observed: CODES_B1PREMAR)'),
    ('wife_premarital_partners', 'yes', 'before wedding', 'PTSB4MAR (1995 PTSB4MAL)', 'no', 'male partners before the first marriage'),
    ('wife_ba_by_wedding', 'yes', 'before wedding', 'CMBAGRAD, EARNBA_Y, WHENEAR1 vs wedding', 'possible',
     'year-only cycles (2015+) count a degree in the SAME calendar year as the wedding as by the wedding (BA_SAME_YEAR marriages), so some are after it; separately BA_UNDATED respondents with a bachelor\'s at interview but no degree date are coded No (misclassification, not leakage)'),
    ('wife_mother_education', 'yes', 'before wedding', 'EDUCMOM', 'no', 'mother\'s education, fixed before the wedding'),
    ('wife_mother_age_first_birth', 'yes', 'fixed at birth', 'AGEMOMB1', 'no', ''),
    ('wife_religion_raised', 'yes', 'before wedding', 'RELRAISD', 'no', 'religion raised in; 2022-23 not asked'),
    ('wife_born_outside_us', 'yes', 'fixed at birth', 'BRNOUT', 'no', ''),
    ('respondent_sex', 'yes', 'fixed at birth', 'file (women/men)', 'no', 'both-sexes model only'),
    ('education_at_interview (HIEDUC)', 'no', 'at interview', 'HIEDUC', 'yes',
     'the lens excludes it on purpose; here used only as an upper bound for education by the wedding'),
]

HARMONIZED = [
    ('wife_age', 'at wedding', 'women: wife_age_at_marriage; men: not harmonised (blank)', 'no', ''),
    ('husband_age', 'at wedding', 'women: husband_age_at_marriage (2022-23 band mid-points); men: own age at marriage', 'no', ''),
    ('wife_educ', 'before wedding', 'women: dated BA/HS items + HIEDUC as upper bound; men: Unknown', 'possible',
     'every known level is dated on or before the wedding (same-year and undated degrees -> Unknown; Some college is never datable). '
     'But the Unknown level is not uninformative: among respondents it collects those whose INTERVIEW education exceeds what can be '
     'dated (college or a BA after the wedding, undated BA), so a model that treats Unknown as its own level reads post-wedding '
     'education; treat it as missing (or use it only across datasets where it means the same)'),
    ('husband_educ', 'before wedding', 'men: dated BA/HS items + HIEDUC as upper bound; women: Unknown (husband education undated)', 'possible',
     'as wife_educ'),
    ('wife_prior_marriage', 'before wedding', 'women: No by construction; men: Unknown (first wife not harmonised)', 'no', ''),
    ('husband_prior_marriage', 'before wedding', 'women: MARBEFHX; men: No by construction', 'no', ''),
    ('wife_prior_children', 'before wedding', 'women: B1PREMAR raw codes (1995 BABY1MO vs wedding, same month Unknown); men: Unknown', 'no', ''),
    ('husband_prior_children', 'before wedding', 'women: KIDSHX; men: B1PREMAR (first biological child before first marriage)', 'no', ''),
    ('cohabited_first', 'before wedding', 'LVTOGHX / PREMARW1', 'no', ''),
    ('wife_race', 'fixed at birth', 'women: HISPRACE/HISPRACE2; men: Unknown', 'no', ''),
    ('husband_race', 'fixed at birth', 'women: husband race items (2022-23 Unknown); men: own HISPRACE/HISPRACE2', 'no', ''),
    ('intact_family', 'before wedding', 'INTACT18 / INTCTFAM (respondent)', 'no', 'see wife_intact_family'),
    ('religion_raised', 'before wedding', 'RELRAISD (respondent; 2022-23 Unknown)', 'no', ''),
    ('wedding_year', 'at wedding', 'MARDAT01', 'no', ''),
    ('respondent_sex', 'fixed at birth', 'file', 'no', ''),
    ('duration_years', 'after wedding', 'MAR1DISS (months, mid-month); year-only cycles imputed months', 'no', 'outcome timing, not a predictor'),
]


def strict_ba(d):
    """wife_ba_by_wedding with the SPEC's strict timing: same calendar year -> Unknown, BA at
    interview without a date -> Unknown (used only for the extra refit row)."""
    out = []
    for r in d.to_dict('records'):
        ba_v, ba_y, *_ = EDUC_VARS[r['cycle']]
        lvl = interview_level(r['HIEDUC'], r['cycle'])
        if lvl != 'ba':
            out.append('No')
            continue
        c = compare(r.get(ba_v), ba_y, r['wedding_cm'], r['wedding_year']) if ba_v else None
        out.append({'before': 'Yes', 'after': 'No'}.get(c, 'Unknown'))
    return np.array(out, dtype=object)


def refit(d):
    """Lens's additive spline Poisson GLM on its own person folds: as published, without the
    flagged predictor, and with a strictly dated replacement."""
    d = d.copy()
    d['wife_ba_strict'] = strict_ba(d)
    d['respondent_ba_strict'] = d['wife_ba_strict']
    women = tp.normalise_weights(d[d.sex == 'F']).reset_index(drop=True)
    both = tp.normalise_weights(d).reset_index(drop=True)
    rows = []
    for name, people, num, cat, flag in [
            ('women additive_spline', women, tp.WOMEN_NUM, tp.WOMEN_CAT, 'wife_ba_by_wedding'),
            ('both_sexes additive_spline', both, tp.BOTH_NUM, tp.BOTH_CAT, 'respondent_ba_by_wedding')]:
        cat_wo = [c for c in cat if c != flag]
        strict = 'wife_ba_strict' if flag.startswith('wife') else 'respondent_ba_strict'
        models = {
            'constant': lambda tr: tp.Model('constant', [], []).fit(tr),
            'with': lambda tr, c=cat: tp.Model('additive_spline', num, c).fit(tr),
            'without': lambda tr, c=cat_wo: tp.Model('additive_spline', num, c).fit(tr),
            'strict': lambda tr, c=cat_wo + [strict]: tp.Model('additive_spline', num, c).fit(tr),
        }
        _, iv, preds, _ = tp._cv(name.split()[0], people, models, 5, 'event')
        y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
        base = tp.deviance(y, e, w, preds['constant'])
        g = {k: 100 * (1 - tp.deviance(y, e, w, preds[k]) / base) for k in ('with', 'without', 'strict')}
        rows.append(dict(dataset='nsfg_pooled', model=name, predictors_removed=flag,
                         gain_with_percent=g['with'], gain_without_percent=g['without'],
                         change_points=g['without'] - g['with']))
        rows.append(dict(dataset='nsfg_pooled', model=name + ' (strict-dated BA replaces it)',
                         predictors_removed=f'{flag} -> {strict.replace("_strict", "_by_wedding_strict")}',
                         gain_with_percent=g['with'], gain_without_percent=g['strict'],
                         change_points=g['strict'] - g['with']))
        print(name, {k: round(v, 3) for k, v in g.items()}, flush=True)
    return pd.DataFrame(rows)


def audit_numbers(d):
    """Numbers quoted in the leakage notes, from the data."""
    w = d[d.sex == 'F']
    yr = w.cycle.isin(sorted(harmonise.YEAR_CYCLES))
    lvl = np.array([interview_level(h, c) for h, c in zip(w.HIEDUC, w.cycle)], dtype=object)
    by = w.EARNBA_Y if 'EARNBA_Y' in w else pd.Series(np.nan, index=w.index)
    same_year = int(((lvl == 'ba') & yr.to_numpy() & (by == w.wedding_year).to_numpy()).sum())
    undated = int(((lvl == 'ba') & (w.wife_ba_by_wedding == 'No').to_numpy()
                   & ~((w.CMBAGRAD < 9000) | (w.EARNBA_Y < 9000) | (w.WHENEAR1 < 9000)).to_numpy()).sum())
    under18 = float((d.wife_age_at_marriage < 18).mean())
    codes = sorted(d.B1PREMAR.dropna().unique().astype(int).tolist())
    miss = (w.assign(m=w.husband_age_at_marriage.isna()).groupby(['cycle', 'event']).m.mean().unstack())
    return dict(BA_SAME_YEAR=same_year, BA_UNDATED=undated, SHARE_UNDER18=f'{100 * under18:.1f}%',
                CODES_B1PREMAR='/'.join(map(str, codes))), miss


def write_leakage(d):
    nums, miss = audit_numbers(d)
    print('husband age missing share by cycle x event (women):\n', miss.round(3).to_string())
    rows = []
    for p, uses, when, src, leaks, note in LEAKAGE:
        for k, v in nums.items():
            note = note.replace(k, str(v))
        rows.append(dict(dataset='nsfg_pooled', predictor=p, existing_lens_uses=uses, measured_when=when,
                         source=src, leaks=leaks, note=note))
    for p, when, src, leaks, note in HARMONIZED:
        rows.append(dict(dataset='nsfg_pooled', predictor='harmonized:' + p, existing_lens_uses='no',
                         measured_when=when, source=src, leaks=leaks, note=note))
    pd.DataFrame(rows).to_csv(HERE / 'leakage_nsfg_pooled.csv', index=False)
    return nums, miss


def main(do_refit):
    out, d = build()
    (HERE / 'work').mkdir(exist_ok=True)
    out.to_csv(HERE / 'work' / 'nsfg_pooled.csv.gz', index=False, float_format='%.6g')
    print(f'rows {len(out)}, events {int(out.event.sum())}, person-years {out.duration_years.sum():.1f} '
          f'(women {int((out.respondent_sex == "Woman").sum())}, men {int((out.respondent_sex == "Man").sum())})')
    for c in COLUMNS:
        if out[c].dtype == object and c not in ('id', 'dataset', 'event_definition', 'country'):
            vc = out[c].value_counts(normalize=True)
            print(f'  {c}: Unknown {100 * vc.get("Unknown", 0):.1f}%  ', {k: round(100 * v, 1) for k, v in vc.items()})
        elif c in ('wife_age', 'husband_age'):
            print(f'  {c}: blank {100 * out[c].isna().mean():.1f}%')
    print(pd.crosstab([out.respondent_sex, out.id.str.split(':').str[1]], out.wife_educ.where(
        out.respondent_sex == 'Woman', out.husband_educ)).to_string())
    if do_refit:
        nums, _ = write_leakage(d)
        print(nums)
        if '--audit-only' in sys.argv:
            return
        res = refit(d)
        res.to_csv(HERE / 'leakage_refit_nsfg_pooled.csv', index=False, float_format='%.5f')
        print(res.to_string(index=False))


if __name__ == '__main__':
    main('--refit' in sys.argv)
