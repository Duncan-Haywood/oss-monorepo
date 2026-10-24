"""Pre-wedding harmonized feature set for the Statistics Canada GSS Families first-marriage lens.

Reads the four GSS Family PUMF cycles (1995, 2006, 2011, 2017) fetched by
`../canada_gss_family/download.sh` and reuses that lens's harmoniser
(`canada_gss_family/harmonise.py: first_marriages`) for the sample, outcome and pre-wedding
inputs, so the sample restrictions are exactly the lens's: ever-married respondents aged 15-79,
their FIRST marriage, weddings 1950+, age at marriage known, end type/age known, end not before
the wedding (sample_audit.json). The 2011 widowhood censoring times are the lens's imputed ones.

Writes (person-level, gitignored):  work/canada_gss.csv.gz   (SPEC.md columns, one row per first marriage)
Writes (aggregate, committed):      leakage_canada_gss.csv, leakage_refit_canada_gss.csv

Run:  python3 build_canada_gss.py            (build + leakage refit, ~5-15 min)
      python3 build_canada_gss.py --no-refit (build and audit only)

Harmonization decisions (see leakage_canada_gss.csv for the audit):
  - wife_age / husband_age: the respondent's age at marriage (lens `age_at_marriage`); the
    spouse's age at the start of the first marriage only in 2017 (APRMA0C / APRMA1C, "Age of
    respondent's spouse - Start of current/first marriage"). 1995 and 2011 give only a grouped
    age difference and 2006 asks it only for the current marriage, so the spouse's age is blank
    there. Spouse age is missing far more often for dissolved marriages (printed below).
  - education: every cycle measures it at interview (EDUYR is years of schooling, not a date),
    so all four education columns are `Unknown`.
  - spouse previously married: 1995 asks it of every first marriage (M1MSSPOU, H14/H29); 2006 and
    2011 ask it only of a CURRENT marriage (MA0_Q120), i.e. only of marriages still intact, so
    those cycles and 2017 are `Unknown` (using them would encode the outcome).
  - prior children: the respondent's own birth children born before the wedding (lens
    `premarital_birth`; a child with an unknown birth age counts as not premarital, as in the
    lens). The spouse's prior children are not asked: `Unknown`.
  - race: GSS records visible-minority status and ethnic origin at interview, which do not map
    defensibly onto Hispanic / White / Black / Other; both race columns are `Unknown`.
  - religion_raised: no cycle asks the religion the respondent was raised in (the PUMFs have
    only current affiliation and attendance), so `Unknown`; current religion is not used.
  - intact_family: lens `intact_family_15` (lived with both parents to age 15; 2017 "mostly").
  - wedding_year: floor of the lens's derived wedding time (survey mid-year - age at interview
    + age at marriage; can be off by up to a year).
"""
from pathlib import Path
import sys
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
LENS = HERE.parent / 'canada_gss_family'
sys.path.insert(0, str(LENS))
import harmonise as H  # noqa: E402

DATASET = 'canada_gss'
OUT = HERE / 'work' / 'canada_gss.csv.gz'
EVENT_DEF = ('first marriage ended in separation, or divorce/annulment without a recorded separation '
             '(earliest); censored at spouse death or interview')
COLUMNS = ['dataset', 'id', 'weight', 'duration_years', 'event', 'event_definition', 'wedding_year',
           'respondent_sex', 'wife_age', 'husband_age', 'wife_educ', 'husband_educ', 'wife_prior_marriage',
           'husband_prior_marriage', 'wife_prior_children', 'husband_prior_children', 'cohabited_first',
           'wife_race', 'husband_race', 'intact_family', 'religion_raised', 'country']


def spouse_extras(p):
    """Spouse age at the wedding (2017 only) and spouse previously married (1995 only), by row."""
    sp_age = pd.Series(np.nan, index=p.index)
    sp_prev = pd.Series('Unknown', index=p.index, dtype=object)
    d17 = H.read('gss2017.csv', ['PUMFID', 'MA0_220', 'APRMA0C', 'APRMA1C']).set_index('PUMFID')
    a17 = H.age(d17.APRMA0C).where(d17.MA0_220 == 1, H.age(d17.APRMA1C))
    s = p.cycle == '2017'
    sp_age[s] = p.loc[s, 'recid'].map(a17).to_numpy()
    d95 = H.read('gss1995_main.csv', ['RECID', 'M1MSSPOU']).set_index('RECID')
    prev95 = H.cat(d95.M1MSSPOU, {1: 'Yes', 2: 'Yes', 3: 'No'})   # widowed / divorced / single; 6,7,9 missing
    s = p.cycle == '1995'
    sp_prev[s] = p.loc[s, 'recid'].map(prev95).fillna('Unknown').to_numpy()
    return sp_age, sp_prev


def build():
    p, _, audit = H.first_marriages()
    p = p.reset_index(drop=True)
    sp_age, sp_prev = spouse_extras(p)
    woman = p.respondent_sex == 'Female'
    o = pd.DataFrame(index=p.index)
    o['dataset'] = DATASET
    o['id'] = DATASET + ':' + p.cycle + ':' + p.recid.astype(str)
    o['weight'] = p.weight / p.weight.mean()
    o['duration_years'] = p.t.round(2)
    o['event'] = p.event.astype(int)
    o['event_definition'] = EVENT_DEF
    o['wedding_year'] = np.floor(p.wedding_year).astype(int)
    o['respondent_sex'] = np.where(woman, 'Woman', 'Man')
    o['wife_age'] = np.where(woman, p.age_at_marriage, sp_age).round(1)
    o['husband_age'] = np.where(woman, sp_age, p.age_at_marriage).round(1)
    o['wife_educ'] = 'Unknown'
    o['husband_educ'] = 'Unknown'
    o['wife_prior_marriage'] = np.where(woman, 'No', sp_prev)
    o['husband_prior_marriage'] = np.where(woman, sp_prev, 'No')
    o['wife_prior_children'] = np.where(woman, p.premarital_birth, 'Unknown')
    o['husband_prior_children'] = np.where(woman, 'Unknown', p.premarital_birth)
    o['cohabited_first'] = p.cohabited_first
    o['wife_race'] = 'Unknown'
    o['husband_race'] = 'Unknown'
    o['intact_family'] = p.intact_family_15
    o['religion_raised'] = 'Unknown'
    o['country'] = 'Canada'
    assert (o.duration_years > 0).all() and o.respondent_sex.isin(['Woman', 'Man']).all()
    return p, o[COLUMNS], audit, sp_age


LEAKAGE = [
    # predictor, existing_lens_uses, measured_when, source, leaks, note
    ('marriage_years', 'yes', 'after wedding', 'derived (time since wedding)', 'no',
     'the time axis of the Poisson model, not a covariate; every model has it'),
    ('age_at_marriage', 'yes', 'at wedding', '1995 M1AGERES; 2006 AGE_MA0C/AGE_MA1; 2011 AGE_MA0C/AGE_MA1C; 2017 AGEMA0C/AGEMA1C', 'no',
     'retrospective report of a wedding-day fact'),
    ('wedding_year', 'yes', 'at wedding', 'derived: survey mid-year - age at interview + age at marriage', 'no',
     'fixed fact; uses age at interview only to date the wedding'),
    ('respondent_sex', 'yes', 'fixed at birth', '1995 DVSEX; 2006-2017 SEX', 'no', ''),
    ('cohabited_first', 'yes', 'before wedding', '1995 M1CLRSSP; 2006 MA0_Q150 / AGE_CL_MA1; 2011-2017 MA0/MA1 Q150', 'no',
     'pre-wedding fact; in 2006 ended marriages are coded from the presence of AGE_CL_MA1, current ones from MA0_Q150 (wording differs by marriage status)'),
    ('prior_union', 'yes', 'before wedding', 'union rank of the first marriage; fallback to start ages of common-law unions not followed by marriage', 'no',
     'the PUMF rank is "not stated" when ANY union date is unknown (more common after a dissolution); the lens uses the age fallback so there is no Unknown level'),
    ('premarital_birth', 'yes', 'before wedding', '1995 child file DVD21; 2006 AGE_CHDBORN_k; 2011 AGE_CHDBORN_kC; 2017 ACHBkC', 'no',
     'birth child born before the wedding (from dated birth histories); unknown birth age counts as No'),
    ('intact_family_15', 'yes', 'before wedding', '1995 A2/A3; 2006-2011 GU_Q110/120; 2017 GU_110/120', 'no',
     'childhood living arrangement to age 15'),
    ('born_outside_canada', 'yes', 'fixed at birth', '1995 DVR17; 2006-2011 BRTHREGC; 2017 BRTHCAN', 'no', ''),
    ('first_language', 'yes', 'before wedding', '1995 DVR25; 2006-2011 LANCH; 2017 LANMT', 'no',
     'language first learned in childhood (2017 mother tongue)'),
    ('region', 'yes', 'at interview', '1995 PROV; 2006-2017 REGION', 'yes',
     'region of residence at interview; people move after a separation, so it can postdate and follow the outcome'),
    ('survey_cycle', 'yes', 'at interview', 'cycle of the survey (1995/2006/2011/2017)', 'possible',
     'not a trait of the couple: a design term that, with wedding year, encodes time to interview and survivor/recall selection; the app fixes it at 2017'),
    ('education_at_interview', 'no', 'at interview', '1995 DVL30CO; 2006-2011 EDU5; 2017 EHG3_01B', 'yes',
     'lens sensitivity only; highest level at interview; harmonized education columns are Unknown'),
    ('religion_at_interview', 'no', 'at interview', '1995 DVR27; 2006 RELIG6; 2011 RELIG6C; 2017 RELIGFLG', 'yes',
     'lens sensitivity only; current affiliation is not religion raised; religion_raised is Unknown'),
    ('attendance_at_interview', 'no', 'at interview', '1995 R28; 2006-2011 RELIGATT; 2017 REE_02', 'yes',
     'lens sensitivity only; can change with a divorce'),
    ('partner_age_gap', 'no', 'at wedding', '1995 M1ASPDIF; 2011 AGEDIFGR; 2017 AGEMA vs APRMA', 'possible',
     'lens sensitivity only; a wedding-day fact but missing far more often for dissolved marriages (missingness_by_outcome.csv)'),
    ('partner_prev_married', 'no', 'before wedding', '1995 M1MSSPOU', 'no',
     'lens 1995-only sensitivity; harmonized as spouse prior marriage for 1995 only'),
    ('parents_ever_separated', 'no', 'before wedding', '1995 DVA75; 2017 APARSEPC/APARDIVC', 'possible',
     'lens 1995-only sensitivity; 2017 dates of parental separation can fall after the wedding'),
]


def harmonized_audit(o, p, sp_age):
    ev = o.event == 1
    s17 = p.cycle == '2017'
    miss_d = float(sp_age[s17 & ev].isna().mean() * 100)
    miss_i = float(sp_age[s17 & ~ev].isna().mean() * 100)
    sp_note = (f'spouse age only in 2017 (APRMA0C/APRMA1C, spouse age at the start of the marriage); blank in 1995/2006/2011 '
               f'(grouped gap or current marriage only). In 2017 it is missing for {miss_d:.1f}% of dissolved vs {miss_i:.1f}% '
               f'of intact marriages, so its missingness encodes the outcome; the respondent own age is the lens age_at_marriage')
    prev95 = o[p.cycle == '1995']
    sp = np.where(prev95.respondent_sex == 'Woman', prev95.husband_prior_marriage, prev95.wife_prior_marriage)
    pm_d = float((sp[prev95.event.to_numpy() == 1] == 'Unknown').mean() * 100)
    pm_i = float((sp[prev95.event.to_numpy() == 0] == 'Unknown').mean() * 100)
    rows = [
        ('duration_years', 'yes', 'after wedding', 'lens t (wedding to separation/divorce, spouse death or interview)', 'no',
         'outcome; not capped at 30 years here (the lens caps follow-up at 30 when it models)'),
        ('event', 'yes', 'after wedding', 'lens event', 'no', 'outcome'),
        ('weight', 'yes', 'at interview', 'WGHTFNL / WGHT_PER, mean 1 within cycle', 'no', 'design weight'),
        ('wedding_year', 'yes', 'at wedding', 'floor of the lens wedding_year', 'no', 'can be off by up to one year'),
        ('respondent_sex', 'yes', 'fixed at birth', 'lens respondent_sex', 'no', ''),
        ('wife_age', 'yes', 'at wedding', 'respondent: lens age_at_marriage; spouse: 2017 APRMA0C/APRMA1C', 'possible', sp_note),
        ('husband_age', 'yes', 'at wedding', 'respondent: lens age_at_marriage; spouse: 2017 APRMA0C/APRMA1C', 'possible', sp_note),
        ('wife_educ', 'no', 'at interview', 'none dated before the wedding', 'no', 'all Unknown: education is measured only at interview'),
        ('husband_educ', 'no', 'at interview', 'none dated before the wedding', 'no', 'all Unknown: education is measured only at interview'),
        ('wife_prior_marriage', 'no', 'before wedding', 'respondent No by construction; spouse 1995 M1MSSPOU', 'no',
         f'spouse value known only in 1995 (all first marriages asked; Unknown {pm_d:.1f}% dissolved vs {pm_i:.1f}% intact); 2006/2011 MA0_Q120 asks only current marriages, so Unknown'),
        ('husband_prior_marriage', 'no', 'before wedding', 'respondent No by construction; spouse 1995 M1MSSPOU', 'no',
         f'spouse value known only in 1995 (Unknown {pm_d:.1f}% dissolved vs {pm_i:.1f}% intact); other cycles Unknown'),
        ('wife_prior_children', 'yes', 'before wedding', 'respondent: lens premarital_birth; spouse not asked', 'no',
         'respondent own birth children; spouse rows Unknown'),
        ('husband_prior_children', 'yes', 'before wedding', 'respondent: lens premarital_birth; spouse not asked', 'no',
         'respondent own birth children; spouse rows Unknown'),
        ('cohabited_first', 'yes', 'before wedding', 'lens cohabited_first', 'no', 'see the lens predictor row'),
        ('wife_race', 'no', 'at interview', 'VISMIN/ETHNIC (not mapped)', 'no', 'all Unknown: visible-minority status does not map onto the US categories'),
        ('husband_race', 'no', 'at interview', 'VISMIN/ETHNIC (not mapped)', 'no', 'all Unknown'),
        ('intact_family', 'yes', 'before wedding', 'lens intact_family_15', 'no', 'both parents to age 15 (2017 "mostly")'),
        ('religion_raised', 'no', 'before wedding', 'not asked in any cycle', 'no', 'all Unknown; current religion is not used'),
    ]
    return rows


def write_leakage(o, p, sp_age):
    rows = [dict(dataset=DATASET, predictor=r[0], existing_lens_uses=r[1], measured_when=r[2], source=r[3], leaks=r[4], note=r[5])
            for r in LEAKAGE]
    rows += [dict(dataset=DATASET, predictor='harmonized:' + r[0], existing_lens_uses=r[1], measured_when=r[2], source=r[3],
                  leaks=r[4], note=r[5]) for r in harmonized_audit(o, p, sp_age)]
    pd.DataFrame(rows).to_csv(HERE / 'leakage_canada_gss.csv', index=False)


def refit(p):
    """Lens additive spline Poisson (train_models.Model('additive_spline')), lens 5 person folds
    (train_models.assign_folds, same seed and person order), held-out weighted Poisson deviance
    gain vs a constant rate fitted in the same training folds."""
    import train_models as T
    people = p.reset_index(drop=True).copy()
    people['fold'] = T.assign_folds(people)
    iv = T.intervals(people)
    iv['fold'] = people.fold.to_numpy()[iv.person.to_numpy()]
    variants = {
        'published': ([], T.NUM, T.CAT),
        'no_region': (['region'], T.NUM, [c for c in T.CAT if c != 'region']),
        'no_region_no_survey_cycle': (['region', 'survey_cycle'], T.NUM, [c for c in T.CAT if c not in ('region', 'survey_cycle')]),
    }
    preds = {k: np.zeros(len(iv)) for k in ['constant', *variants]}
    for f in range(5):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        ix = te.index.to_numpy()
        preds['constant'][ix] = T.Model('constant').fit(tr).predict(te)
        for k, (_, num, cat) in variants.items():
            preds[k][ix] = T.Model('additive_spline', num, cat).fit(tr).predict(te)
        print(f'  refit fold {f} done', flush=True)
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    base = T.deviance(y, e, w, preds['constant'])
    gain = {k: 100 * (1 - T.deviance(y, e, w, preds[k]) / base) for k in variants}
    rows = []
    for k in ['no_region_no_survey_cycle', 'no_region']:
        rows.append(dict(dataset=DATASET, model='additive_spline (lens spec, 5 person folds)',
                         predictors_removed=';'.join(variants[k][0]), gain_with_percent=round(gain['published'], 3),
                         gain_without_percent=round(gain[k], 3), change_points=round(gain[k] - gain['published'], 3)))
    out = pd.DataFrame(rows)
    out.to_csv(HERE / 'leakage_refit_canada_gss.csv', index=False)
    return out, len(iv), float(e.sum()), int(y.sum())


def main():
    p, o, audit, sp_age = build()
    OUT.parent.mkdir(exist_ok=True)
    o.to_csv(OUT, index=False, compression='gzip')
    write_leakage(o, p, sp_age)
    print(f'rows {len(o)}  events {int(o.event.sum())}  person-years {o.duration_years.sum():.0f} '
          f'(capped at 30: {np.minimum(o.duration_years, 30).sum():.0f})')
    print(o.groupby(p.cycle).agg(rows=('id', 'size'), events=('event', 'sum')).to_string())
    print('Unknown / blank share by harmonized column (%):')
    for c in COLUMNS[6:-1]:
        v = o[c]
        share = v.isna().mean() if v.dtype.kind in 'fi' else (v == 'Unknown').mean()
        print(f'  {c:24s} {100 * share:6.2f}')
    print('Unknown share by outcome (dissolved / intact), %:')
    for c in ['cohabited_first', 'intact_family', 'wife_age', 'husband_age', 'wife_prior_marriage', 'husband_prior_marriage']:
        v = o[c]
        miss = v.isna() if v.dtype.kind in 'fi' else (v == 'Unknown')
        print(f'  {c:24s} {100 * miss[o.event == 1].mean():6.2f} / {100 * miss[o.event == 0].mean():6.2f}')
    if '--no-refit' not in sys.argv:
        r, n_iv, py, ev30 = refit(p)
        print(f'refit on {n_iv} marriage-year intervals, {py:.0f} person-years, {ev30} events within 30 years')
        print(r.to_string(index=False))


if __name__ == '__main__':
    main()
