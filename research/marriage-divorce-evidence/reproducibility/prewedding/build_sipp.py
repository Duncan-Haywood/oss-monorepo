"""SIPP retrospective first marriages -> harmonized pre-wedding rows (see SPEC.md).

Reuses the SIPP lens (../sipp_marital_history): build_retro.build() makes one row per
ever-married person's first marriage, train_retro.load() applies the lens's own sample
filters (weddings 1960+, age at marriage 15-60, end year not before the wedding, follow-up
capped at 30 years) and timing rules. This script only adds what the lens does not read
(fertility items that date a birth before the wedding) and maps to the SPEC columns.

What is knowable on the wedding day here (SIPP histories are retrospective, asked once):
- respondent's age at the wedding, wedding year, sex, race-ethnicity (fixed);
- respondent's education BY THE WEDDING only where the 2001-2008 modules date the diploma,
  first college enrolment and bachelor's degree (the lens's rule; audited as `possible`);
  the 2021/2025 files have only interview education -> Unknown;
- respondent's children born before the wedding: no children ever by the interview
  (TMOMCHL/TFRCHL = 0, or TCEB = 0 in 2021/2025) -> No; first-birth year (TFBRTHYR, women
  15-64 in 2001-2008; TYEAR_FB, both sexes, 2021/2025) before / after the wedding year ->
  Yes / No; same year -> Census's recode RPREMAR (2001-2008) or Unknown (2021/2025); men and
  women 65+ with children in 2001-2008 have no birth date -> Unknown (prior_children_tm2);
- the first spouse's traits are never observed (the files describe only the current spouse)
  -> Unknown; no religion, family-structure or premarital-cohabitation items -> Unknown.

Usage: python3 -I build_sipp.py WORK_DIR [--refit]
  WORK_DIR holds raw/ (download.sh) and pu/sipp_pu2021.parquet, pu/sipp_pu2025.parquet
  (extract_pu.py). Writes work/sipp.csv.gz here; with --refit also leakage_sipp.csv and
  leakage_refit_sipp.csv (the lens's additive spline Poisson, its own household folds).
"""
from pathlib import Path
import sys, types, zipfile
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
LENS = HERE.parent / 'sipp_marital_history'
sys.path[:0] = [str(LENS)]
# train_retro imports the app's bundle exporter at module level; it is only used to write the
# browser bundle, which this script never does.
sys.modules.setdefault('bundle_export', types.SimpleNamespace(export=None))
import build_retro as br  # noqa: E402
import train_retro as tr  # noqa: E402
import survival_utils as su  # noqa: E402

COLUMNS = ['dataset', 'id', 'weight', 'duration_years', 'event', 'event_definition', 'wedding_year',
           'respondent_sex', 'wife_age', 'husband_age', 'wife_educ', 'husband_educ', 'wife_prior_marriage',
           'husband_prior_marriage', 'wife_prior_children', 'husband_prior_children', 'cohabited_first',
           'wife_race', 'husband_race', 'intact_family', 'religion_raised', 'country']
EVENT_DEF = ('first dissolution of the first marriage: separation (year of separation) or, if none '
             'recorded, divorce; widowhood and the interview censor; at most 30 years; years only')
EDU_MAP = {'Less than high school': 'Less than high school', 'High school': 'High school',
           'Some college': 'Some college', 'Bachelor or higher': 'Bachelor+'}
RACE_MAP = {'Hispanic': 'Hispanic', 'White': 'White', 'Black': 'Black', 'Asian': 'Other', 'Other': 'Other'}
FERT_TM2 = ['SSUID', 'EPPPNUM', 'ESEX', 'TAGE', 'TMOMCHL', 'TFRCHL', 'TFBRTHYR', 'RPREMAR']


def fertility_tm2(raw):
    out = []
    for panel, cfg in br.TM2.items():
        lay = br.sas_layout(f'{raw}/{cfg["sas"]}')
        names = [v for v in FERT_TM2 if v in lay]
        assert names == FERT_TM2, (panel, names)
        with zipfile.ZipFile(f'{raw}/{cfg["zip"]}') as zf:
            member = [n for n in zf.namelist() if n.lower().endswith('.dat')][0]
            with zf.open(member) as fh:
                d = pd.read_fwf(fh, colspecs=[lay[v][:2] for v in names], names=names, dtype=str, header=None)
        for v in names[1:]:
            d[v] = pd.to_numeric(d[v], errors='coerce')
        d['pid'] = f'{panel}-' + d.SSUID + '-' + d.EPPPNUM.astype(int).astype(str)
        out.append(d)
    d = pd.concat(out, ignore_index=True)
    d['kids'] = np.where(d.ESEX == 2, d.TMOMCHL, d.TFRCHL)  # children ever born / fathered by the interview
    return d.set_index('pid')[['ESEX', 'TAGE', 'kids', 'TFBRTHYR', 'RPREMAR']]


def prior_children_tm2(f, wed):
    """No children ever by the interview -> No. Women 15-64 with children (the universe of TFBRTHYR and
    RPREMAR): first-birth year before / after the wedding year -> Yes / No; same year -> Census's recode
    RPREMAR (first child born before the first marriage, from unsuppressed months). RPREMAR is coded 2
    outside its universe (all men, childless women), so it is never read there. Men and women 65+ with
    children: no birth date -> Unknown."""
    univ = (f.ESEX == 2) & f.TAGE.between(15, 64) & (f.kids >= 1) & (f.TFBRTHYR > 0)
    fb = f.TFBRTHYR.to_numpy()
    return np.select([f.kids == 0, univ & (fb < wed), univ & (fb > wed), univ & (f.RPREMAR == 1), univ & (f.RPREMAR == 2)],
                     ['No', 'Yes', 'No', 'Yes', 'No'], 'Unknown')


def fertility_pu(pu_dir, years):
    out = []
    for y in years:
        p = pd.read_parquet(f'{pu_dir}/sipp_pu{y}.parquet', columns=['SSUID', 'PNUM', 'SPANEL', 'TCEB', 'TYEAR_FB'])
        p['pid'] = p.SPANEL.astype(int).astype(str) + '-' + p.SSUID + '-' + p.PNUM.astype(int).astype(str)
        out.append(p)
    return pd.concat(out, ignore_index=True).set_index('pid')[['TCEB', 'TYEAR_FB']]


def harmonize(m, fert_tm2, fert_pu):
    pc = pd.Series('Unknown', index=m.index)
    tm2 = m.tm2 == 1
    pc[tm2] = prior_children_tm2(fert_tm2.reindex(m.loc[tm2, 'pid']), m.loc[tm2, 'marriage_year'].to_numpy())
    f = fert_pu.reindex(m.loc[~tm2, 'pid'])
    fb, ceb, wy = f.TYEAR_FB.to_numpy(), f.TCEB.to_numpy(), m.loc[~tm2, 'marriage_year'].to_numpy()
    pc[~tm2] = np.select([ceb == 0, (fb > 0) & (fb < wy), (fb > 0) & (fb > wy)], ['No', 'Yes', 'No'], 'Unknown')
    woman = (m.sex == 'Woman').to_numpy()
    educ = m.education_at_wedding.map(EDU_MAP).fillna('Unknown')
    race = m.race_ethnicity.map(RACE_MAP).fillna('Unknown')
    U = 'Unknown'
    side = lambda own, other=U: (np.where(woman, own, other), np.where(woman, other, own))
    wa, ha = np.where(woman, m.age_at_marriage, np.nan), np.where(woman, np.nan, m.age_at_marriage)
    we, he = side(educ)
    wpc, hpc = side(pc)
    wr, hr = side(race)
    wpm, hpm = side('No')
    out = pd.DataFrame(dict(
        dataset='sipp', id='sipp:' + m.pid, weight=m.weight / m.weight.mean(), duration_years=m.t,
        event=m.event.astype(int), event_definition=EVENT_DEF, wedding_year=m.marriage_year.astype(int),
        respondent_sex=m.sex, wife_age=wa, husband_age=ha, wife_educ=we, husband_educ=he,
        wife_prior_marriage=wpm, husband_prior_marriage=hpm, wife_prior_children=wpc,
        husband_prior_children=hpc, cohabited_first=U, wife_race=wr, husband_race=hr,
        intact_family=U, religion_raised=U, country='US'))
    assert list(out.columns) == COLUMNS and (out.duration_years > 0).all() and out.id.is_unique
    return out


LEAKAGE = [  # predictor, existing_lens_uses, measured_when, source, leaks, note
    ('marriage_years', 'yes', 'after wedding', 'wedding year to end/interview year', 'no',
     'time axis of the Poisson model (years since the wedding), not a baseline input'),
    ('age_at_marriage', 'yes', 'fixed at birth', 'TAGE at interview minus years since the wedding', 'no',
     'computed from age at interview and the wedding year (+/-1 year); equals age on the wedding day'),
    ('marriage_year', 'yes', 'at wedding', 'TLMYEAR/TFMYEAR (2001-2008), TMAR1_YR (2021/2025)', 'no',
     'retrospective report of the wedding year; recall error only'),
    ('sex', 'yes', 'fixed at birth', 'ESEX', 'no', 'respondent sex'),
    ('race_ethnicity', 'yes', 'fixed at birth', 'ERACE, EORIGIN (reported at interview)', 'no',
     'treated as fixed; self-identification can change, but not plausibly because of the marriage outcome'),
    ('nativity', 'yes', 'fixed at birth', 'TBRSTATE (2001-2008), EBORNUS (2021/2025)', 'no', 'place of birth'),
    ('education_at_wedding', 'yes', 'before wedding', 'EEDUCATE at interview + THSYR, TCOLLSTR, TBACHYR (2001-2008)',
     'possible', 'education model only (2001-2008): level dated by the year of diploma / first college / '
     'bachelor by the end of the wedding year (a completion in the wedding year counts even if after the wedding); '
     'the universe and the Unknown level (attained by interview, year missing) come from interview attainment'),
    ('education_now', 'no', 'at interview', 'EEDUCATE / EEDUC', 'yes',
     'descriptive only in the lens; can follow the wedding or the divorce; never used here'),
    ('times_married', 'no', 'at interview', 'EXMAR', 'yes', 'counts remarriages after the first marriage ended; not used'),
    ('spouse traits', 'no', 'at interview', 'current-spouse pointers', 'yes',
     'only the current spouse is described (exists for intact marriages); not used; all spouse columns Unknown'),
    # harmonized columns
    ('weight', 'yes', 'at interview', 'WPFINWGT, normalised to mean 1 within each survey, then within dataset', 'no',
     'survey weight, not a predictor'),
    ('duration_years', 'yes', 'after wedding', 'lens timing rules (train_retro.load)', 'no', 'outcome time'),
    ('event', 'yes', 'after wedding', 'EMS / EWIDIV1 / separation and end years', 'no', 'outcome'),
    ('wedding_year', 'yes', 'at wedding', 'marriage_year', 'no', 'same as marriage_year'),
    ('respondent_sex', 'yes', 'fixed at birth', 'ESEX', 'no', 'same as sex'),
    ('wife_age / husband_age', 'yes', 'fixed at birth', 'age_at_marriage', 'no',
     "respondent's slot only (by respondent sex; assumes an opposite-sex first marriage); spouse age blank"),
    ('wife_educ / husband_educ', 'yes', 'before wedding', 'education_at_wedding', 'possible',
     "respondent's slot: lens's dated-completion rule (2001-2008), Unknown for 2021/2025 (interview education "
     'only); spouse Unknown'),
    ('wife_prior_marriage / husband_prior_marriage', 'no', 'at wedding', 'construction', 'no',
     'respondent No by construction (first marriage); spouse Unknown'),
    ('wife_prior_children / husband_prior_children', 'no', 'before wedding',
     'RPREMAR, TMOMCHL, TFRCHL (2001-2008); TCEB, TYEAR_FB (2021/2025)', 'no',
     "respondent's slot: No if no children ever born/fathered by the interview; else Yes / No if the first birth "
     'year (TFBRTHYR, women 15-64, 2001-2008; TYEAR_FB, both sexes, 2021/2025) is before / after the wedding year; '
     "same year: Census's month-based recode RPREMAR (2001-2008, agrees with the years in ~99% of women whose years "
     'differ) or Unknown (2021/2025); men and women 65+ with children in 2001-2008 Unknown (no birth date); spouse Unknown'),
    ('cohabited_first', 'no', 'before wedding', 'not collected', 'no', 'Unknown for everyone'),
    ('wife_race / husband_race', 'yes', 'fixed at birth', 'race_ethnicity', 'no',
     "respondent's slot (Asian -> Other); spouse Unknown"),
    ('intact_family', 'no', 'before wedding', 'not collected', 'no', 'Unknown for everyone'),
    ('religion_raised', 'no', 'before wedding', 'not collected', 'no', 'Unknown for everyone'),
    ('country', 'no', 'fixed at birth', 'constant', 'no', 'US'),
]


def refit(m):
    """Lens's additive spline Poisson with its own 5 household folds: (a) as published,
    (b) without every predictor flagged yes/possible."""
    iv = tr.intervals(m)
    hh = m.hh.unique()
    rng = np.random.default_rng(tr.SEED)
    rng.shuffle(hh)
    fold_of = pd.Series(np.arange(len(hh)) % 5, index=hh)
    iv['fold'] = iv.hh.map(fold_of).to_numpy()
    tm2_iv = iv.tm2.to_numpy() == 1
    keys = ['additive_spline', 'additive_spline_tm2', 'additive_spline_education']
    pr = {k: np.full(len(iv), np.nan) for k in ['constant', 'constant_tm2'] + keys}
    for f in range(5):
        trn, te = iv[iv.fold != f], iv[iv.fold == f]
        pr['constant'][te.index] = (trn.weight * trn.event).sum() / (trn.weight * trn.exposure).sum()
        pr['additive_spline'][te.index] = tr.fit('additive_spline', trn).predict(te)
        tr2, te2 = trn[tm2_iv[trn.index]], te[tm2_iv[te.index]]
        pr['constant_tm2'][te2.index] = (tr2.weight * tr2.event).sum() / (tr2.weight * tr2.exposure).sum()
        for k in keys[1:]:
            pr[k][te2.index] = tr.fit(k, tr2).predict(te2)
        print('refit fold', f, 'done', flush=True)
    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    dev = lambda r, s: su.poisson_unit_dev(y[s], e[s], w[s], r[s]).sum()
    allr = np.ones(len(iv), bool)
    gain = lambda k, base, s: 100 * (1 - dev(pr[k], s) / dev(pr[base], s))
    g_all = gain('additive_spline', 'constant', allr)
    g_edu = gain('additive_spline_education', 'constant_tm2', tm2_iv)
    g_tm2 = gain('additive_spline_tm2', 'constant_tm2', tm2_iv)
    rows = [dict(dataset='sipp', model='additive_spline (all five surveys; published 4.07229)', predictors_removed='none',
                 gain_with_percent=g_all, gain_without_percent=g_all, change_points=0.0),
            dict(dataset='sipp', model='additive_spline_education (2001-2008 modules; published 4.41039)',
                 predictors_removed='education_at_wedding', gain_with_percent=g_edu, gain_without_percent=g_tm2,
                 change_points=g_tm2 - g_edu)]
    return pd.DataFrame(rows), dict(intervals=len(iv), person_years=float(e.sum()))


def main(work, do_refit):
    work = Path(work)
    retro = work / 'retro.parquet'
    if not retro.exists():
        br.build(str(work / 'raw'), str(work / 'pu'), [2021, 2025]).to_parquet(retro, index=False)
    m, audit = tr.load(work)
    out = harmonize(m, fertility_tm2(work / 'raw'), fertility_pu(work / 'pu', [2021, 2025]))
    (HERE / 'work').mkdir(exist_ok=True)
    out.to_csv(HERE / 'work' / 'sipp.csv.gz', index=False, float_format='%.6g')
    print(f'rows {len(out)}  events {int(out.event.sum())}  person-years {out.duration_years.sum():.1f}  '
          f'weighted events {np.dot(out.weight, out.event):.1f}')
    print('by survey:', m.groupby('source').agg(n=('pid', 'size'), events=('event', 'sum')).to_dict(orient='index'))
    for c in COLUMNS[7:-1]:
        share = out[c].isna().mean() if c.endswith('_age') else (out[c].astype(str) == 'Unknown').mean()
        print(f'  {c:24s} unknown/blank {100 * share:5.1f}%')
    for c in ['wife_educ', 'husband_educ', 'wife_prior_children', 'husband_prior_children', 'wife_race', 'husband_race']:
        print(c, out[c].value_counts().to_dict())
    tm2 = (m.tm2 == 1).to_numpy()
    print('respondent educ Unknown share, 2001-2008 rows:',
          round(100 * (m.education_at_wedding[tm2].map(EDU_MAP).isna()).mean(), 2), '%; 2021/2025 rows: 100%')
    if do_refit:
        pd.DataFrame(LEAKAGE, columns=['predictor', 'existing_lens_uses', 'measured_when', 'source', 'leaks', 'note']
                     ).assign(dataset='sipp')[['dataset', 'predictor', 'existing_lens_uses', 'measured_when', 'source',
                                               'leaks', 'note']].to_csv(HERE / 'leakage_sipp.csv', index=False)
        res, info = refit(m)
        res.to_csv(HERE / 'leakage_refit_sipp.csv', index=False, float_format='%.5f')
        print(info)
        print(res.to_string(index=False))


if __name__ == '__main__':
    main(sys.argv[1], '--refit' in sys.argv[2:])
