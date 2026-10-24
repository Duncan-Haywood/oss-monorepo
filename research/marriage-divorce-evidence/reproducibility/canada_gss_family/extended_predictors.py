"""Statistics Canada GSS first marriages: a richer family of origin (before the wedding) and
religion measured at the interview (can follow the dissolution) — held-out gains.

  family_origin  2017 asks the most: lived with both parents to 15 (GU_120), the respondent's age when
                 the parents separated or divorced (APARSEPC/APARDIVC) and when a parent died
                 (AMDIEDC/AFDIEDC), and whether the parents were married at the birth or ever
                 (GU_190/GU_210). 2006 and 2011 ask GU_Q120/190/210 only, 1995 only whether intact.
                 Levels: Both parents (to 15) / Parents divorced or separated (before 15; 2017) /
                 Parent died (before 15; 2017) / Never-married parents (never married to each other) /
                 Not intact, reason not known / Unknown or not asked.
  attendance, importance, private practice (REE_03, 2017 only: prayer, meditation and the like)
                 and religious affiliation, all AT THE INTERVIEW (2006, 2011, 2017), i.e. possibly years
                 after a dissolution. Reported as associations with that caveat, never exported for scoring.
Same people, intervals, person folds (train_models.assign_folds) and additive spline Poisson GLM as
train_models.py; paired person-bootstrap CIs (extended_eval). Writes extended_heldout.csv,
extended_rate_ratios.csv, `models_extended` (family of origin only) + test vectors, and the
harmonized extract (outside the repository).
Run: CANADA_WORK=<work dir with first_marriages.pkl> CANADA_RAW=<raw dir> python3 extended_predictors.py
"""
import json, os, pickle, sys, time, warnings
from pathlib import Path
from joblib import Parallel, delayed
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.argv = sys.argv[:1]
import train_models as T  # noqa: E402
from bundle_export import export as export_pipe  # noqa: E402
from extended_eval import cluster_gain_table, poisson_deviance_rows, write_harmonized  # noqa: E402

warnings.simplefilter('ignore')
WORK = Path(os.environ.get('CANADA_WORK', HERE / 'work'))
RAW = Path(os.environ.get('CANADA_RAW', HERE / 'raw'))
SEED = T.SEED
BOOT = 1000
RR_BOOT = int(os.environ.get('CANADA_RR_BOOT', 100))
JOBS = int(os.environ.get('CANADA_JOBS', 3))
ATT = {1: 'At least once a week', 2: 'At least once a month', 3: 'At least 3 times a year', 4: 'Once or twice a year',
       5: 'Not at all'}
IMP = {1: 'Very important', 2: 'Somewhat important', 3: 'Not very important', 4: 'Not at all important'}
PRIV = {1: 'At least once a day', 2: 'At least once a week', 3: 'At least once a month', 4: 'At least 3 times a year',
        5: 'Once or twice a year', 6: 'Not at all'}
BLOCKS = {
    'family of origin, detailed (replaces intact_family_15)': (['family_origin'], ['intact_family_15']),
    'religion at interview (attendance, importance, private practice, affiliation; can follow the dissolution)':
        (['attendance_at_interview5', 'importance_at_interview', 'private_practice_at_interview', 'affiliated_at_interview'], []),
}
INPUTS = {'family_origin': ('who the respondent grew up with to 15: Both parents / Parents divorced or separated (before 15; '
                            '2017 only) / Parent died (before 15; 2017 only) / Never-married parents (never married to each '
                            'other; 2006-2017) / Not intact, reason not known / Unknown (incl. 1995)')}


def extras():
    out = []
    d = pd.read_csv(RAW / 'gss2017.csv', usecols=['PUMFID', 'GU_120', 'GU_190', 'GU_210', 'APARSEPC', 'APARDIVC', 'MTHERLIV',
                                                  'AMDIEDC', 'FTHERLIV', 'AFDIEDC', 'REE_02', 'REE_03', 'RLR_110', 'RELIGFLG'])
    sep = np.fmin(d.APARSEPC.where(d.APARSEPC <= 35), d.APARDIVC.where(d.APARDIVC <= 35))
    mdie = d.AMDIEDC.where((d.MTHERLIV == 2) & (d.AMDIEDC <= 70))
    fdie = d.AFDIEDC.where((d.FTHERLIV == 2) & (d.AFDIEDC <= 70))
    die = np.fmin(mdie, fdie)
    fo = np.select([d.GU_120 == 1, sep < 15, die < 15, d.GU_210 == 2, d.GU_120 == 2],
                   ['Both parents', 'Parents divorced or separated', 'Parent died', 'Never-married parents',
                    'Not intact, reason not known'], 'Unknown')
    out.append(pd.DataFrame(dict(id='2017_' + d.PUMFID.astype(str), family_origin=fo,
                                 attendance_at_interview5=d.REE_02.map(ATT).fillna('Unknown'),
                                 importance_at_interview=d.RLR_110.map(IMP).fillna('Unknown'),
                                 private_practice_at_interview=d.REE_03.map(PRIV).fillna('Unknown'),
                                 affiliated_at_interview=d.RELIGFLG.map({1: 'Yes', 2: 'No'}).fillna('Unknown'))))
    for cyc, att, imp, rel in [('2011', 'RELIGATT', 'RLR_Q110', 'RELIG6C'), ('2006', 'RELIGATT', 'RLR_Q110', 'RELIG6')]:
        d = pd.read_csv(RAW / f'gss{cyc}.csv', usecols=['RECID', 'GU_Q120', 'GU_Q190', 'GU_Q210', att, imp, rel])
        fo = np.select([d.GU_Q120 == 1, d.GU_Q210 == 2, d.GU_Q120 == 2],
                       ['Both parents', 'Never-married parents', 'Not intact, reason not known'], 'Unknown')
        out.append(pd.DataFrame(dict(id=f'{cyc}_' + d.RECID.astype(str), family_origin=fo,
                                     attendance_at_interview5=d[att].map(ATT).fillna('Unknown'),
                                     importance_at_interview=d[imp].map(IMP).fillna('Unknown'),
                                     private_practice_at_interview='Not asked',
                                     affiliated_at_interview=d[rel].map(lambda v: 'No' if v == 1 else 'Yes' if v in (2, 3, 4, 5, 6) else 'Unknown'))))
    return pd.concat(out, ignore_index=True).set_index('id')


def fit(num, cat, d):
    prep = ColumnTransformer([('num', T.spline_num(), num), ('cat', T.onehot(), cat)])
    p = Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-4, max_iter=2000, tol=1e-9, solver='newton-cholesky'))])
    return p.fit(d[num + cat], d.y / d.exposure, fit__sample_weight=d.weight * d.exposure)


REF = {'family_origin': 'Both parents', 'attendance_at_interview5': 'Not at all', 'importance_at_interview': 'Not at all important',
       'private_practice_at_interview': 'Not at all', 'affiliated_at_interview': 'No'}


def rate_ratios(iv, block, add, drop, subset_label):
    cat = [c for c in T.CAT if c not in drop] + add
    num = [c for c in T.NUM if c != 'marriage_years']
    lv = {c: sorted(iv[c].astype(str).unique(), key=lambda v: (v != REF.get(c, v), v)) for c in cat}

    def coefs(d):
        prep = ColumnTransformer([('dur', SplineTransformer(n_knots=5, degree=2, include_bias=False), ['marriage_years']),
                                  ('num', SimpleImputer(strategy='median'), num),
                                  ('cat', OneHotEncoder(categories=[lv[c] for c in cat], drop='first', handle_unknown='ignore',
                                                        sparse_output=False), cat)])
        p = Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9, solver='newton-cholesky'))])
        p.fit(d, d.y / d.exposure, fit__sample_weight=d.weight * d.exposure)
        return p.named_steps['fit'].coef_, p.named_steps['prep'].get_feature_names_out()
    point, names = coefs(iv)
    groups = iv.groupby('person').indices
    keys = list(groups)

    def boot(b):
        pick = np.random.default_rng(SEED + 4000 + b).integers(0, len(keys), len(keys))
        return coefs(iv.iloc[np.concatenate([groups[keys[k]] for k in pick])])[0]
    B = np.array(Parallel(n_jobs=JOBS)(delayed(boot)(b) for b in range(RR_BOOT)))
    lo, hi = np.percentile(B, [2.5, 97.5], axis=0)
    per = iv.drop_duplicates('person')
    rows = []
    for i, n in enumerate(names):
        kind, var = n.split('__', 1)
        base = next((c for c in add if var.startswith(c + '_')), None)
        if base is None or kind != 'cat':
            continue
        level = var[len(base) + 1:]
        sub = per[per[base].astype(str) == level]
        rows.append(dict(block=block, sample=subset_label, variable=base, level=level, reference=lv[base][0],
                         per='vs reference', rate_ratio=float(np.exp(point[i])), ci95_low=float(np.exp(lo[i])),
                         ci95_high=float(np.exp(hi[i])), marriages=len(sub), dissolutions=int(sub.event.sum()),
                         timing='before the wedding' if base == 'family_origin' else 'AT THE INTERVIEW (can follow the dissolution)',
                         adjusted_for='every current-model input, marriage-length spline; person bootstrap'
                                      + (f'; replaces {", ".join(drop)}' if drop else '')))
    return rows


def harmonize(iv):
    h = pd.DataFrame(index=iv.index)
    h['person_id'] = iv.id
    h['cluster_id'] = iv.id
    h['weight'] = iv.weight
    h['unit'] = 'person_period'
    h['outcome'] = 'first marriage ends in separation (or divorce without a recorded separation); widowhood and interview censor; follow-up capped at 30 years'
    h['t_start'] = iv.marriage_years
    h['t_end'] = iv.marriage_years + iv.exposure
    h['exposure'] = iv.exposure
    h['event'] = iv.y
    h['wedding_year'] = iv.wedding_year
    h['calendar_year'] = iv.wedding_year + iv.marriage_years
    h['marriage_order'] = 'first'
    h['sex'] = iv.respondent_sex.map({'Female': 'Woman', 'Male': 'Man'})
    h['age_at_marriage'] = iv.age_at_marriage
    h['age'] = iv.age_at_marriage + iv.marriage_years
    h['cohabited_first'] = iv.cohabited_first.map({'Yes': 1.0, 'No': 0.0})
    h['children_before'] = iv.premarital_birth.map({'Yes': 1.0, 'No': 0.0})
    h['family_origin'] = iv.family_origin.map({'Both parents': 'Both parents', 'Parents divorced or separated': 'Parents divorced or separated',
                                               'Parent died': 'Parent died', 'Never-married parents': 'Never-married single parent',
                                               'Not intact, reason not known': 'Single parent, reason not known'})
    h['intact_family'] = iv.intact_family_15.map({'Yes': 1.0, 'No': 0.0})
    h['region'] = iv.region
    h['country'] = 'Canada'
    h['x_cycle'] = iv.cycle
    h['x_prior_union'] = iv.prior_union
    h['x_first_language'] = iv.first_language
    h['x_born_outside_canada'] = iv.born_outside_canada
    h['x_attendance_at_interview'] = iv.attendance_at_interview5
    h['x_importance_at_interview'] = iv.importance_at_interview
    h['x_education_at_interview'] = iv.education_at_interview
    measured = ['person_id', 'cluster_id', 'weight', 'unit', 'outcome', 't_start', 't_end', 'exposure', 'event', 'wedding_year',
                'calendar_year', 'marriage_order', 'sex', 'age', 'age_at_marriage', 'cohabited_first', 'children_before',
                'family_origin', 'intact_family', 'region', 'country']
    write_harmonized(h, 'canada_gss_first_marriage', measured,
                     notes=['religion and education are at the interview (x_ columns), possibly after the dissolution',
                            'region is at the interview', 'race is not on the PUMF (visible-minority flag only)',
                            'the 2006/2011 weights are bootstrap-scaled differently; use cluster_id = person'])


def main():
    t0 = time.time()
    p, _, _ = pickle.loads((WORK / 'first_marriages.pkl').read_bytes())
    p = p.reset_index(drop=True)
    p = p.join(extras(), on='id')
    for c in ['family_origin', 'attendance_at_interview5', 'importance_at_interview', 'private_practice_at_interview',
              'affiliated_at_interview']:
        p[c] = p[c].fillna('Not asked')
    p['fold'] = T.assign_folds(p)
    iv = T.intervals(p)
    iv['fold'] = p.fold.to_numpy()[iv.person.to_numpy()]
    print(len(p), 'people', len(iv), 'intervals', flush=True)
    for c in ['family_origin', 'attendance_at_interview5', 'importance_at_interview']:
        print(p.groupby(['cycle', c]).agg(n=('event', 'size'), ev=('event', 'sum')).to_string(), flush=True)
    harmonize(iv)
    V = {'current model': list(T.CAT)}
    for name, (add, drop) in BLOCKS.items():
        V[f'current + {name}'] = [c for c in T.CAT if c not in drop] + add
    V['current, intact to 15 as yes/no (current)'] = list(T.CAT)
    num = list(T.NUM)

    def one_fold(f):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        out = {'constant': np.full(len(te), (tr.weight * tr.y).sum() / (tr.weight * tr.exposure).sum())}
        for k, cat in V.items():
            if k.startswith('current, intact'):
                continue
            out[k] = fit(num, cat, tr).predict(te[num + cat])
        return te.index.to_numpy(), out
    P = {k: np.zeros(len(iv)) for k in ['constant'] + [k for k in V if not k.startswith('current, intact')]}
    for ix, out in Parallel(n_jobs=JOBS)(delayed(one_fold)(f) for f in range(5)):
        for k, v in out.items():
            P[k][ix] = v
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    losses = {k: poisson_deviance_rows(y, e, w, P[k]) for k in P}
    tabs = []
    for label, mask in [('all cycles (1995-2017)', np.ones(len(iv), bool)), ('2017 cycle (most detail)', (iv.cycle == '2017').to_numpy()),
                        ('2006-2017 (items asked)', iv.cycle.isin(['2006', '2011', '2017']).to_numpy())]:
        t = cluster_gain_table(iv.person[mask], {k: v[mask] for k, v in losses.items()}, reference='current model', reps=BOOT, seed=SEED)
        t['subset'] = label
        tabs.append(t)
    tab = pd.concat(tabs, ignore_index=True)
    tab['people'], tab['dissolutions'], tab['intervals'] = len(p), int(p.event.sum()), len(iv)
    tab.to_csv(HERE / 'extended_heldout.csv', index=False, float_format='%.4f')
    print(tab.round(3).to_string(index=False), flush=True)

    rr = []
    for name, (add, drop) in BLOCKS.items():
        s17 = iv[iv.cycle == '2017']
        rr += rate_ratios(s17, name, add, drop, '2017 cycle')
    rr += rate_ratios(iv[iv.cycle.isin(['2006', '2011', '2017'])], list(BLOCKS)[0], *BLOCKS[list(BLOCKS)[0]], '2006-2017')
    pd.DataFrame(rr).to_csv(HERE / 'extended_rate_ratios.csv', index=False, float_format='%.4f')
    print(pd.DataFrame(rr)[['sample', 'variable', 'level', 'rate_ratio', 'ci95_low', 'ci95_high', 'marriages']].round(2).to_string(), flush=True)

    ta = tab[tab.subset.str.startswith('all')].set_index('model')
    name = list(BLOCKS)[0]
    add, drop = BLOCKS[name]
    cat = [c for c in T.CAT if c not in drop] + add
    pipe = fit(num, cat, iv)
    r = ta.loc[f'current + {name}']
    bpath = T.OUT / 'canada_gss_first_marriage.json'
    bundle = json.loads(bpath.read_text())
    bundle['models_extended'] = [dict(
        key='additive_spline_family_origin', label='Additive spline Poisson, current inputs with the detailed family of origin',
        heldout=dict(deviance_improvement_percent=round(float(r.gain_percent), 3),
                     deviance_improvement_ci95=[round(float(r.gain_ci95_low), 3), round(float(r.gain_ci95_high), 3)],
                     gain_over_current_points=round(float(r.diff_vs_reference_points), 3),
                     gain_over_current_ci95=[round(float(r.diff_ci95_low), 3), round(float(r.diff_ci95_high), 3)],
                     evaluation=f'train_models.py person folds (5); paired person bootstrap ({BOOT})'),
        new_inputs=add, removed_inputs=drop, **export_pipe(pipe))]
    helpful = [b for b in BLOCKS if ta.loc[f'current + {b}', 'diff_ci95_low'] > 0]
    bundle['models_extended_note'] = (
        'Held-out comparison (2026-10-20, extended_predictors.py). Only the family-of-origin model is exported: religion is '
        'measured at the interview, after many dissolutions, so it is never a scoring input. Blocks whose held-out difference '
        f'had a 95% CI above zero: {", ".join(helpful) if helpful else "none"} (a gain from religion at the interview is not '
        'a valid prospective gain: it is reported after many dissolutions).')
    bundle['inputs_extended'] = INPUTS
    bpath.write_text(json.dumps(T.clean(bundle), separators=(',', ':'), allow_nan=False))
    vpath = T.OUT / 'canada_gss_first_marriage_testvectors.json'
    vec = json.loads(vpath.read_text())
    rng = np.random.default_rng(SEED + 51)
    rows = []
    for i in range(40):
        rw = {c: str(rng.choice(sorted(p[c].astype(str).unique()))) for c in cat}
        rw['marriage_years'] = float(rng.uniform(0, 40))
        rw['age_at_marriage'] = None if i % 13 == 0 else float(rng.uniform(14, 60))
        rw['wedding_year'] = float(rng.integers(1945, 2030))
        rows.append(rw)
    df = pd.DataFrame(rows)
    df['age_at_marriage'] = df.age_at_marriage.astype(float)
    vec['extended'] = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                           predictions={'additive_spline_family_origin': pipe.predict(df[num + cat]).tolist()})
    vpath.write_text(json.dumps(vec))
    print('helpful', helpful, f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
