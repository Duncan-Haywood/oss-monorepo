"""NSFG 1995-2023 pooled first marriages (women's models): does a richer family of origin and
religious upbringing at full detail add held-out skill?

New inputs, all about childhood (before every wedding), on the 2006-2010 to 2017-2019 files
(1995, 2002 and 2022-2023 lack them: scored at their own 'Not asked' level, so the comparison
is on every woman):
  wife_family_origin   INTACT18 (both parents to 18), LVSIT14F/LVSIT14M (mother and father figure
                       at 14: step-father, other mother figure) and PARMARR (were the biological
                       parents married when she was born): Both parents / Stepfamily /
                       Never-married single parent (parents not married at her birth) / Parents split
                       up or a parent died (married at her birth, not intact; divorce and death are
                       not separated in the public files) / Other / Not asked
  wife_attend14        religious attendance at 14 (ATTND14), all 7 answers incl. "more than once a week"
  wife_religion_raised_detail  RELRAISD at full detail (none, Catholic, Baptist, mainline, fundamentalist,
                       other Protestant, Protestant no denomination, other)

Same people, intervals, person folds (train_pooled._cv's permutation) and additive spline Poisson
GLM (alpha 1e-4) as train_pooled.py; paired person-bootstrap CIs of the held-out difference
(extended_eval). Writes extended_heldout.csv, extended_rate_ratios.csv, adds `models_extended`
to the bundle (+ `extended` test vectors) and the harmonized extract (outside the repository).
Run: NSFG_RAW=<raw dir> python3 extended_predictors.py
"""
import json, os, sys, time, warnings
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
import harmonise, nsfgio  # noqa: E402
import train_pooled as tp  # noqa: E402
from bundle_export import export as export_pipe  # noqa: E402
from extended_eval import cluster_gain_table, poisson_deviance_rows, write_harmonized  # noqa: E402

warnings.simplefilter('ignore')
SEED = tp.SEED
BOOT = 1000
RR_BOOT = int(os.environ.get('NSFG_RR_BOOT', 100))
JOBS = int(os.environ.get('NSFG_JOBS', 3))
EXTRA_CYCLES = ['2006_2010', '2011_2013', '2013_2015', '2015_2017', '2017_2019']
ATTND14 = {1: 'More than once a week', 2: 'Once a week', 3: '2-3 times a month', 4: 'Once a month',
           5: '3-11 times a year', 6: 'Once or twice a year', 7: 'Never'}
RELRAISD = {1: 'None', 2: 'Catholic', 3: 'Baptist/Southern Baptist', 4: 'Methodist, Lutheran, Presbyterian, Episcopal',
            5: 'Fundamentalist Protestant', 6: 'Other Protestant denomination', 7: 'Protestant, no specific denomination',
            8: 'Other religion'}
NOT_ASKED = 'Not asked'
BLOCKS = {
    'family of origin, 6 levels (replaces wife_intact_family)': (['wife_family_origin'], ['wife_intact_family']),
    'attendance at 14, 7 levels': (['wife_attend14'], []),
    'religion raised, full detail (replaces the 4-level version)': (['wife_religion_raised_detail'], ['wife_religion_raised']),
}
INPUTS = {
    'wife_family_origin': ("who the wife grew up with: Both parents (both to 18, INTACT18) / Stepfamily (a step-father or "
                           "another mother figure at 14) / Never-married single parent (biological parents not married when "
                           "she was born, PARMARR) / Parents split up or a parent died (married at her birth but not intact; "
                           "the public files do not separate divorce from death) / Other / Not asked (1995, 2002, 2022-2023)"),
    'wife_attend14': 'how often she attended religious services at 14 (ATTND14), seven answers from Never to More than once a week; Not asked in 1995, 2002 and 2022-2023',
    'wife_religion_raised_detail': 'religion she was raised in (RELRAISD), eight answers; Not asked where the cycle lacks it',
}


def extras():
    out = []
    for cyc in EXTRA_CYCLES:
        names = ['CASEID', 'INTACT18', 'PARMARR', 'LVSIT14F', 'LVSIT14M', 'ATTND14', 'RELRAISD']
        lay = nsfgio.FILES[(cyc, 'F')][1]
        have = nsfgio.dct_layout(nsfgio.RAW / lay)
        d = nsfgio.load(cyc, 'F', [n for n in names if n in have])
        for n in names:
            if n not in d:
                d[n] = np.nan
        d['id'] = [f'{cyc}F{int(v)}' for v in d.CASEID]
        out.append(d)
    x = pd.concat(out, ignore_index=True).set_index('id')
    fo = pd.Series('Other', index=x.index, dtype=object)
    fo[x.PARMARR == 1] = 'Parents split up or a parent died'
    fo[x.PARMARR == 5] = 'Never-married single parent'
    fo[(x.LVSIT14M == 2) | ((x.LVSIT14F == 2) & (x.LVSIT14M == 1))] = 'Stepfamily'
    fo[x.INTACT18 == 1] = 'Both parents'
    fo[x.INTACT18.isna() | (x.INTACT18 > 2)] = 'Unknown'
    x['wife_family_origin'] = fo
    x['wife_attend14'] = x.ATTND14.map(ATTND14).fillna('Unknown')
    x['wife_religion_raised_detail'] = x.RELRAISD.map(RELRAISD).fillna('Unknown')
    return x[['wife_family_origin', 'wife_attend14', 'wife_religion_raised_detail', 'PARMARR', 'INTACT18']]


def model(num, cat, alpha=1e-4):
    prep = ColumnTransformer([('num', tp.spline_num(), num), ('cat', tp.onehot(), cat)])
    return Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=alpha, max_iter=2000, tol=1e-9, solver='newton-cholesky'))])


def fit(num, cat, d):
    return model(num, cat).fit(d[num + cat], d.y / d.exposure, fit__sample_weight=d.weight * d.exposure)


def variants():
    v = {'current model': list(tp.WOMEN_CAT)}
    for name, (add, drop) in BLOCKS.items():
        v[f'current + {name}'] = [c for c in tp.WOMEN_CAT if c not in drop] + add
    adds = [c for a, _ in BLOCKS.values() for c in a]
    drops = [c for _, d in BLOCKS.values() for c in d]
    v['current + all new blocks'] = [c for c in tp.WOMEN_CAT if c not in drops] + adds
    return v


REF = {'wife_family_origin': 'Both parents', 'wife_attend14': 'Never', 'wife_religion_raised_detail': 'Catholic'}


def rate_ratios(iv, block, add, drop):
    cat = [c for c in tp.WOMEN_CAT if c not in drop] + add
    num = [c for c in tp.WOMEN_NUM if c != 'marriage_years']
    cats = {c: sorted(iv[c].astype(str).unique(), key=lambda v: (v != REF.get(c, v), v)) for c in cat}

    def coefs(d):
        prep = ColumnTransformer([('dur', SplineTransformer(n_knots=5, degree=2, include_bias=False), ['marriage_years']),
                                  ('num', SimpleImputer(strategy='median'), num),
                                  ('cat', OneHotEncoder(categories=[cats[c] for c in cat], drop='first',
                                                        handle_unknown='ignore', sparse_output=False), cat)])
        p = Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9, solver='newton-cholesky'))])
        p.fit(d, d.y / d.exposure, fit__sample_weight=d.weight * d.exposure)
        return p.named_steps['fit'].coef_, p.named_steps['prep'].get_feature_names_out()
    point, names = coefs(iv)
    groups = iv.groupby('cluster').indices
    keys = list(groups)

    def boot(b):
        pick = np.random.default_rng(SEED + 2000 + b).integers(0, len(keys), len(keys))
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
        rows.append(dict(block=block, variable=base, level=level, reference=cats[base][0], per='vs reference',
                         rate_ratio=float(np.exp(point[i])), ci95_low=float(np.exp(lo[i])), ci95_high=float(np.exp(hi[i])),
                         marriages=len(sub), dissolutions=int(sub.event.sum()),
                         adjusted_for='every current women-model input (wedding year, ages, cohabitation, ...), marriage-length spline; '
                                      f'design-cluster bootstrap ({RR_BOOT})' + (f'; replaces {", ".join(drop)}' if drop else '')))
    return rows


def harmonize(women, iv):
    h = pd.DataFrame(index=iv.index)
    h['person_id'] = iv.id
    h['cluster_id'] = iv.cluster
    h['weight'] = iv.weight
    h['unit'] = 'person_period'
    h['outcome'] = 'first marriage dissolves (divorce, annulment or separation); widowhood and interview censor'
    h['t_start'] = iv.marriage_years
    h['t_end'] = iv.marriage_years + iv.exposure
    h['exposure'] = iv.exposure
    h['event'] = iv.y
    h['wedding_year'] = iv.wedding_year
    h['calendar_year'] = iv.wedding_year + iv.marriage_years
    h['marriage_order'] = 'first'
    h['sex'] = 'Woman'
    h['age_at_marriage'] = iv.wife_age_at_marriage
    h['age'] = iv.wife_age_at_marriage + iv.marriage_years
    h['race_eth'] = iv.wife_race_ethnicity.replace({'Unknown': np.nan})
    h['race_eth_coarse'] = iv.wife_race_ethnicity
    h['cohabited_first'] = iv.cohabited_first.map({'Yes': 1.0, 'No': 0.0})
    h['children_before'] = iv.wife_premarital_birth.map({'Yes': 1.0, 'No': 0.0})
    fo = iv.wife_family_origin.map({'Both parents': 'Both parents', 'Stepfamily': 'Stepfamily',
                                    'Never-married single parent': 'Never-married single parent',
                                    'Parents split up or a parent died': 'Single parent, reason not known',
                                    'Other': 'Other'})
    h['family_origin'] = fo
    h['intact_family'] = iv.wife_intact_family.map({'Yes': 1.0, 'No': 0.0})
    a6 = {'More than once a week': 'More than weekly', 'Once a week': 'Weekly', '2-3 times a month': '2-3 times a month',
          'Once a month': 'About monthly', '3-11 times a year': 'Less than monthly', 'Once or twice a year': 'Less than monthly',
          'Never': 'Never'}
    h['x_attend_at_14'] = iv.wife_attend14.map(a6)
    h['religion_raised'] = iv.wife_religion_raised.replace({'Unknown': np.nan, 'Not asked': np.nan})
    h['education'] = np.where(iv.wife_ba_by_wedding == 'Yes', 'Bachelor', None)
    h['country'] = 'US'
    h['x_cycle'] = iv.cycle
    h['x_husband_age_at_marriage'] = iv.husband_age_at_marriage
    h['x_husband_married_before'] = iv.husband_married_before
    h['x_husband_prior_children'] = iv.husband_prior_children
    h['x_premarital_partners'] = iv.wife_premarital_partners
    measured = ['person_id', 'cluster_id', 'weight', 'unit', 'outcome', 't_start', 't_end', 'exposure', 'event',
                'wedding_year', 'calendar_year', 'marriage_order', 'sex', 'age', 'age_at_marriage', 'race_eth',
                'race_eth_coarse', 'cohabited_first', 'children_before', 'family_origin', 'intact_family',
                'religion_raised', 'country']
    write_harmonized(h, 'nsfg_pooled_first_marriage', measured,
                     notes=['women only (the both-sexes models are not harmonized here)',
                            "race_eth: NSFG public files give Hispanic / White / Black / Other only (Asian is in 'Other')",
                            'attendance is at age 14 (x_attend_at_14), not current',
                            "education: only 'BA by the wedding' is known (Bachelor where yes, else NaN)",
                            'family_origin and attendance at 14 asked 2006-2019 only'])


def main():
    t0 = time.time()
    people, _ = tp.people_table()
    women = tp.normalise_weights(people[people.sex == 'F']).reset_index(drop=True)
    x = extras()
    women = women.join(x, on='id')
    for c in ['wife_family_origin', 'wife_attend14', 'wife_religion_raised_detail']:
        women[c] = women[c].where(women.cycle.isin(EXTRA_CYCLES), NOT_ASKED).fillna('Unknown')
    # same person folds as train_pooled._cv
    perm = np.random.default_rng(SEED).permutation(len(women))
    fold = np.empty(len(women), int)
    fold[perm] = np.arange(len(women)) % 5
    women['fold'] = fold
    iv = tp.intervals(women)
    iv['fold'] = fold[iv.person.to_numpy()]
    print(len(women), 'women', len(iv), 'intervals', f'{time.time() - t0:.0f}s', flush=True)
    for c in ['wife_family_origin', 'wife_attend14', 'wife_religion_raised_detail']:
        print(women.groupby(c).agg(n=('event', 'size'), ev=('event', 'sum')).to_string(), flush=True)
    harmonize(women, iv)
    num = list(tp.WOMEN_NUM)
    V = variants()
    P = {k: np.zeros(len(iv)) for k in ['constant'] + list(V)}

    def one_fold(f):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        out = {'constant': np.full(len(te), (tr.weight * tr.y).sum() / (tr.weight * tr.exposure).sum())}
        for k, cat in V.items():
            out[k] = fit(num, cat, tr).predict(te[num + cat])
        return te.index.to_numpy(), out
    for ix, out in Parallel(n_jobs=JOBS)(delayed(one_fold)(f) for f in range(5)):
        for k, v in out.items():
            P[k][ix] = v
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    losses = {k: poisson_deviance_rows(y, e, w, P[k]) for k in P}
    tab = cluster_gain_table(iv.person, losses, reference='current model', reps=BOOT, seed=SEED)
    sub = iv.cycle.isin(EXTRA_CYCLES).to_numpy()
    tab2 = cluster_gain_table(iv.person[sub], {k: v[sub] for k, v in losses.items()}, reference='current model',
                              reps=BOOT, seed=SEED)
    tab['subset'] = 'all women (1995-2023)'
    tab2['subset'] = 'women in 2006-2010 to 2017-2019 (items asked)'
    tab = pd.concat([tab, tab2], ignore_index=True)
    tab['women'], tab['dissolutions'], tab['intervals'] = len(women), int(women.event.sum()), len(iv)
    tab.to_csv(HERE / 'extended_heldout.csv', index=False, float_format='%.4f')
    print(tab.round(3).to_string(index=False), flush=True)

    rr = []
    for name, (add, drop) in BLOCKS.items():
        rr += rate_ratios(iv[iv.cycle.isin(EXTRA_CYCLES)], name, add, drop)
    pd.DataFrame(rr).to_csv(HERE / 'extended_rate_ratios.csv', index=False, float_format='%.4f')
    print(pd.DataFrame(rr)[['variable', 'level', 'rate_ratio', 'ci95_low', 'ci95_high', 'marriages']].round(2).to_string(), flush=True)

    t = tab[tab.subset.str.startswith('all')].set_index('model')
    helpful = [b for b in BLOCKS if t.loc[f'current + {b}', 'diff_ci95_low'] > 0]
    bpath = tp.OUT / 'nsfg_pooled_first_marriage.json'
    bundle = json.loads(bpath.read_text())
    cat = V['current + all new blocks']
    pipe = fit(num, cat, iv)
    r = t.loc['current + all new blocks']
    bundle['models_extended'] = [dict(
        key='additive_spline_all_blocks', label='Additive spline Poisson GLM (women), current inputs + all new blocks',
        heldout=dict(deviance_improvement_percent=round(float(r.gain_percent), 3),
                     deviance_improvement_ci95=[round(float(r.gain_ci95_low), 3), round(float(r.gain_ci95_high), 3)],
                     gain_over_current_points=round(float(r.diff_vs_reference_points), 3),
                     gain_over_current_ci95=[round(float(r.diff_ci95_low), 3), round(float(r.diff_ci95_high), 3)],
                     evaluation='train_pooled.py person folds (5); weighted Poisson deviance vs the training-fold constant; '
                                f'paired person bootstrap ({BOOT})'),
        new_inputs=[c for c in cat if c not in tp.WOMEN_CAT], removed_inputs=[c for c in tp.WOMEN_CAT if c not in cat],
        **export_pipe(pipe))]
    bundle['models_extended_note'] = (
        'Held-out comparison of richer childhood inputs (2026-10-20, extended_predictors.py). Not scored by the app until '
        'the form asks for them. Blocks whose held-out difference had a 95% CI above zero: '
        f'{", ".join(helpful) if helpful else "none"}.')
    bundle['inputs_extended'] = INPUTS
    bpath.write_text(json.dumps(tp.clean(bundle), separators=(',', ':'), allow_nan=False))
    vpath = tp.OUT / 'nsfg_pooled_first_marriage_testvectors.json'
    vec = json.loads(vpath.read_text())
    rng = np.random.default_rng(SEED + 31)
    rows = []
    for i in range(40):
        rr_ = {c: str(rng.choice(sorted(women[c].astype(str).unique()))) for c in cat}
        rr_['marriage_years'] = float(rng.uniform(0, 35))
        rr_['wife_age_at_marriage'] = float(rng.uniform(14, 48))
        rr_['husband_age_at_marriage'] = None if i % 9 == 0 else float(rng.uniform(15, 65))
        rr_['wedding_year'] = float(rng.integers(1960, 2030))
        rr_['wife_premarital_sex_years'] = None if i % 11 == 0 else float(rng.uniform(0, 20))
        rows.append(rr_)
    df = pd.DataFrame(rows)
    for c in num:
        df[c] = df[c].astype(float)
    vec['extended'] = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                           predictions={'additive_spline_all_blocks': pipe.predict(df[num + cat]).tolist()})
    vpath.write_text(json.dumps(tp.clean(vec), allow_nan=False))
    print('helpful', helpful, f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
