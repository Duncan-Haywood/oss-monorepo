"""NLSY79 first marriages from the wedding: do detailed race/origin, a finer family at 14,
siblings, attendance at full detail, religion in 1979, occupation and family net wealth before
the wedding add held-out skill?

Same marriages, delayed-entry intervals, person folds (folds_for, 3 repeats) and additive spline
Poisson GLM (alpha 1e-4) as train_first_marriage.py; paired person-bootstrap CIs of the held-out
difference (extended_eval). New inputs (all measured before the wedding; every wedding is 1981 or
later):
  race_detail       screener race-ethnicity, with non-Black non-Hispanic respondents split by first
                    racial/ethnic origin (FAM-30_1, 1979): Asian origins (Chinese, Filipino,
                    Japanese, Korean, Vietnamese, Asian Indian, Hawaiian/Pacific Islander) and
                    'American Indian' origin (NLS notes this origin was overstated in 1979)
  family_at_14_detail  FAM-7 at full detail: both parents / mother and stepfather / father and
                    stepmother / mother only / father only / relatives / other. NLSY79 did not ask
                    why a parent was absent, so divorce, death and never-married parents cannot be
                    separated.
  siblings          number of siblings (FAM-28A, 1979), 0-15
  attendance6       attendance at full detail incl. "more than once a week" (R_REL-3, 1982 if before
                    the wedding else 1979; the same answer the current 4-level input uses)
  religion_1979     current religious affiliation in 1979 (R_REL-2_COL)
  occupation_group  current or last job at the last interview before the wedding (CPS item, 1980
                    Census codes from 1982, 1970 codes before), Census major group
  net_worth_before_k  family net wealth (TNFW, from 1985) at the last interview before the wedding,
                    $1,000s nominal clipped to -50..500, with 'Not measured' for weddings before 1986
Writes extended_heldout.csv, extended_rate_ratios.csv, `models_extended` in the bundle (+ test
vectors) and the harmonized extract (outside the repository).
Run: python3 extended_predictors.py WORKDIR
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
import train_first_marriage as tf  # noqa: E402  (reads WORKDIR from sys.argv[1])
import survmetrics as sm  # noqa: E402
from extended_eval import cluster_gain_table, poisson_deviance_rows, write_harmonized  # noqa: E402

warnings.simplefilter('ignore')
WORK = tf.WORK
SEED = tf.SEED
BOOT = 1000
RR_BOOT = int(os.environ.get('NLSY79_RR_BOOT', 150))
JOBS = int(os.environ.get('NLSY79_JOBS', 3))
NOT_MEASURED = 'Not measured before wedding'
ATT6 = {1: 'Not at all', 2: 'Infrequently', 3: 'Once a month', 4: '2-3 times a month', 5: 'Once a week',
        6: 'More than once a week'}
REL = {0: 'None', 1: 'Protestant', 2: 'Baptist', 3: 'Protestant', 4: 'Protestant', 5: 'Protestant', 6: 'Protestant',
       7: 'Catholic', 8: 'Jewish', 9: 'Other'}
ASIAN = {2, 4, 8, 10, 13, 14, 26}
NEW_NUMERIC = ['siblings', 'net_worth_before_k']
BLOCKS = {
    'race detail (replaces race)': (['race_detail'], ['race']),
    'family at 14, full detail (replaces the 4-level version)': (['family_at_14_detail'], ['family_at_14']),
    'siblings': (['siblings'], []),
    'religion detail (6-level attendance replaces the 4-level; affiliation in 1979)': (['attendance6', 'religion_1979'], ['attendance']),
    'occupation before the wedding': (['occupation_group'], []),
    'family net wealth before the wedding': (['net_worth_before_k', 'net_worth_measured'], []),
}
INPUTS = {
    'race_detail': 'Hispanic / Black (screener) / Asian or Pacific Islander origin / American Indian origin (overstated in 1979 per NLS) / White and other non-Black non-Hispanic',
    'family_at_14_detail': 'who the respondent lived with at 14 (FAM-7): Both parents / Mother and stepfather / Father and stepmother / Mother only / Father only / Relatives / Other. The reason a parent was absent was not asked.',
    'siblings': 'number of brothers and sisters (1979), 0-15',
    'attendance6': 'religious attendance, six answers: Not at all / Infrequently / Once a month / 2-3 times a month / Once a week / More than once a week',
    'religion_1979': 'religious affiliation in 1979: None / Catholic / Baptist / Protestant / Jewish / Other',
    'occupation_group': 'current or last job before the wedding, Census major group (or No job reported)',
    'net_worth_before_k': 'family net wealth before the wedding, $1,000s (nominal), -50..500; median-imputed when not measured',
    'net_worth_measured': 'Yes if a net-wealth interview (1985 onward) preceded the wedding, else Not measured before wedding',
}


def occ70(c):
    if np.isnan(c) or c <= 0:
        return None
    for lo, hi, g in [(1, 245, 'Management, business, science and arts'), (260, 395, 'Sales and office'),
                      (401, 575, 'Natural resources, construction and maintenance'), (580, 590, 'Military'),
                      (601, 785, 'Production, transportation and material moving'),
                      (801, 824, 'Natural resources, construction and maintenance'), (901, 984, 'Service')]:
        if lo <= c <= hi:
            return g
    return None


def occ80(c):
    if np.isnan(c) or c <= 0:
        return None
    for lo, hi, g in [(3, 235, 'Management, business, science and arts'), (243, 389, 'Sales and office'),
                      (403, 469, 'Service'), (473, 499, 'Natural resources, construction and maintenance'),
                      (503, 699, 'Natural resources, construction and maintenance'),
                      (703, 889, 'Production, transportation and material moving'), (900, 999, 'Military')]:
        if lo <= c <= hi:
            return g
    return None


def fam14_detail(v):
    if v < 0 or np.isnan(v):
        return 'Unknown'
    v = int(v)
    if v == 11:
        return 'Both parents'
    if v == 21:
        return 'Mother and stepfather'
    if v == 12:
        return 'Father and stepmother'
    if v in (51, 91):
        return 'Mother only'
    if v == 15:
        return 'Father only'
    if v in (13, 31, 33, 35, 53, 93):
        return 'Relatives'
    return 'Other'


def new_features(m):
    cb = json.loads((WORK / 'ext_codebook.json').read_text())
    x = pd.read_csv(WORK / 'ext_extract.csv')
    L = {(v['year'], v['name']): k for k, v in cb.items()}
    lcb = json.loads((WORK / 'lens_codebook.json').read_text())
    lens = pd.read_csv(WORK / 'lens_extract.csv', usecols=['R0000100', 'R0001900'])
    x = x.merge(lens, on='R0000100', how='left').set_index('R0000100')
    x = x.loc[m.id.to_numpy()].reset_index()
    col = lambda y, n: x[L[(str(y), n)]].to_numpy(dtype=float) if (str(y), n) in L else np.full(len(x), np.nan)
    f = pd.DataFrame(index=m.index)
    origin = col(1979, 'FAM-30_1')
    nbnh = (m.race == 'Non-Black non-Hispanic').to_numpy()
    rd = m.race.astype(object).to_numpy().copy()
    rd[nbnh] = 'White and other'
    rd[nbnh & np.isin(origin, list(ASIAN))] = 'Asian or Pacific Islander'
    rd[nbnh & (origin == 9)] = 'American Indian'
    f['race_detail'] = rd
    f['family_at_14_detail'] = [fam14_detail(v) for v in x.R0001900.to_numpy(dtype=float)]
    sib = col(1979, 'FAM-28A')
    f['siblings'] = np.where(sib >= 0, np.minimum(sib, 15), np.nan)
    a82, a79 = col(1982, 'R_REL-3'), col(1979, 'R_REL-3')
    src = pd.to_numeric(m.attendance_year, errors='coerce').to_numpy()
    att = np.where(src == 1982, a82, np.where(src == 1979, a79, np.nan))
    f['attendance6'] = [ATT6.get(v, 'Unknown') if v == v else 'Unknown' for v in att]
    rel = col(1979, 'R_REL-2_COL')
    f['religion_1979'] = [REL.get(int(v), 'Unknown') if v == v and v >= 0 else 'Unknown' for v in rel]
    pre = m.pre_round.to_numpy()
    occ, nw = [], []
    nw_years = sorted(int(y) for (y, n) in L if n == 'TNFW_TRUNC')
    for i in range(len(m)):
        g = None
        for y in [y for y in range(1979, 2001) if y <= pre[i]][::-1]:
            g = occ80(col(y, 'CPSOCC80')[i]) if y >= 1982 else None
            g = g or occ70(col(y, 'CPSOCC70')[i])
            if g:
                break
        occ.append(g or 'No job reported')
        v = np.nan
        for y in [y for y in nw_years if y <= pre[i]][::-1]:
            z = col(y, 'TNFW_TRUNC')[i]
            if z == z and z not in (-1, -2, -3, -4, -5):
                v = z
                break
        nw.append(v)
    f['occupation_group'] = occ
    nw = np.array(nw, float)
    f['net_worth_before_k'] = np.clip(nw / 1000, -50, 500)
    f['net_worth_measured'] = np.where(np.isnan(nw), NOT_MEASURED, 'Yes')
    return f


def fit(cats, nums, d):
    oh = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    prep = ColumnTransformer([('num', tf.num_pipe('spline'), nums), ('cat', oh, cats)])
    p = Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-4, max_iter=2000, tol=1e-9, solver='newton-cholesky'))])
    return p.fit(d, d.y / d.exposure, fit__sample_weight=d.weight * d.exposure)


def split(feats):
    return [c for c in feats if c not in tf.NUMERIC + NEW_NUMERIC], [c for c in tf.NUMERIC + NEW_NUMERIC if c in feats]


def variants():
    base = tf.NUMERIC + tf.CATEGORICAL
    v = {'current model': base}
    for name, (add, drop) in BLOCKS.items():
        v[f'current + {name}'] = [c for c in base if c not in drop] + add
    adds = [c for a, _ in BLOCKS.values() for c in a]
    drops = [c for _, d in BLOCKS.values() for c in d]
    v['current + all new blocks'] = [c for c in base if c not in drops] + adds
    return v


def one_repeat(m, iv, V, r):
    fold = tf.folds_for(m, r)
    ivf = fold[iv.person.to_numpy()]
    P = {k: np.zeros(len(iv)) for k in ['constant'] + list(V)}
    for f in range(tf.FOLDS):
        tr, te = iv[ivf != f], iv[ivf == f]
        P['constant'][te.index] = (tr.weight * tr.y).sum() / (tr.weight * tr.exposure).sum()
        for k, feats in V.items():
            cats, nums = split(feats)
            P[k][te.index] = fit(cats, nums, tr).predict(te)
    return P


REF = {'race_detail': 'White and other', 'family_at_14_detail': 'Both parents', 'attendance6': 'Not at all',
       'religion_1979': 'Catholic', 'occupation_group': 'Management, business, science and arts',
       'net_worth_measured': 'Yes'}


def rate_ratios(iv, block, add, drop):
    feats = [c for c in tf.NUMERIC + tf.CATEGORICAL if c not in drop] + add
    cats, nums = split(feats)
    nums = [c for c in nums if c != 'marriage_years']
    levels = {c: sorted(iv[c].astype(str).unique(), key=lambda v: (v != REF.get(c, v), v)) for c in cats}

    def coefs(d):
        prep = ColumnTransformer([('dur', SplineTransformer(n_knots=5, degree=2, include_bias=False), ['marriage_years']),
                                  ('num', SimpleImputer(strategy='median'), nums),
                                  ('cat', OneHotEncoder(categories=[levels[c] for c in cats], drop='first',
                                                        handle_unknown='ignore', sparse_output=False), cats)])
        p = Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9, solver='newton-cholesky'))])
        p.fit(d, d.y / d.exposure, fit__sample_weight=d.weight * d.exposure)
        return p.named_steps['fit'].coef_, p.named_steps['prep'].get_feature_names_out()
    point, names = coefs(iv)
    groups = iv.groupby('person').indices
    keys = list(groups)

    def boot(b):
        pick = np.random.default_rng(SEED + 3000 + b).integers(0, len(keys), len(keys))
        return coefs(iv.iloc[np.concatenate([groups[keys[k]] for k in pick])])[0]
    B = np.array(Parallel(n_jobs=JOBS)(delayed(boot)(b) for b in range(RR_BOOT)))
    lo, hi = np.percentile(B, [2.5, 97.5], axis=0)
    per = iv.drop_duplicates('person')
    rows = []
    for i, n in enumerate(names):
        kind, var = n.split('__', 1)
        base = next((c for c in add if var == c or var.startswith(c + '_')), None)
        if base is None or kind == 'dur':
            continue
        level = var[len(base) + 1:] if kind == 'cat' else ''
        unit = 100.0 if base == 'net_worth_before_k' else 1.0
        sub = per[per[base].astype(str) == level] if level else per
        rows.append(dict(block=block, variable=base, level=level, reference=levels[base][0] if kind == 'cat' else '',
                         per='vs reference' if kind == 'cat' else ('per $100,000' if unit == 100 else 'one unit'),
                         rate_ratio=float(np.exp(point[i] * unit)), ci95_low=float(np.exp(lo[i] * unit)),
                         ci95_high=float(np.exp(hi[i] * unit)), marriages=len(sub), divorces=int(sub.d.sum()),
                         adjusted_for='every current-model input, marriage-length spline; person bootstrap'
                                      + (f'; replaces {", ".join(drop)}' if drop else '')))
    return rows


def harmonize(m, iv):
    h = pd.DataFrame(index=iv.index)
    h['person_id'] = iv.id.astype(str)
    h['cluster_id'] = h.person_id
    h['weight'] = iv.weight
    h['unit'] = 'person_period'
    h['outcome'] = 'first marriage ends in legal divorce (separation is not an end); widowhood and last interview censor; delayed entry at the first interview after the wedding'
    h['t_start'] = np.maximum(iv.marriage_years, iv.a)
    h['t_end'] = h.t_start + iv.exposure
    h['exposure'] = iv.exposure
    h['event'] = iv.y
    h['wedding_year'] = iv.wedding_year
    h['calendar_year'] = iv.wedding_year + iv.marriage_years
    h['marriage_order'] = 'first'
    h['sex'] = iv.sex
    h['age_at_marriage'] = iv.age_at_marriage
    h['age'] = iv.age_at_marriage + iv.marriage_years
    h['race_eth'] = iv.race_detail.map({'Hispanic': 'Hispanic', 'Black': 'Black', 'Asian or Pacific Islander': 'Asian',
                                        'American Indian': 'American Indian or Alaska Native', 'White and other': 'White'})
    h['race_eth_coarse'] = iv.race
    h['education'] = iv.own_education.map({'<12 years': 'Less than high school', '12 years': 'High school',
                                           '13-15 years': 'Some college', '16+ years': 'Bachelor'})
    h['married_before'] = 0
    h['cohabited_first'] = iv.cohabiting_before.map({'Yes': 1.0, 'No': 0.0})
    h['children_before'] = iv.premarital_birth.map({'Yes': 1.0, 'No': 0.0})
    h['family_origin'] = iv.family_at_14_detail.map({'Both parents': 'Both parents', 'Mother and stepfather': 'Stepfamily',
                                                     'Father and stepmother': 'Stepfamily',
                                                     'Mother only': 'Single parent, reason not known',
                                                     'Father only': 'Single parent, reason not known',
                                                     'Relatives': 'Other', 'Other': 'Other'})
    h['intact_family'] = np.where(iv.family_at_14_detail == 'Unknown', np.nan, (iv.family_at_14_detail == 'Both parents').astype(float))
    a6 = {'Not at all': 'Never', 'Infrequently': 'Less than monthly', 'Once a month': 'About monthly',
          '2-3 times a month': '2-3 times a month', 'Once a week': 'Weekly', 'More than once a week': 'More than weekly'}
    h['attend'] = iv.attendance6.map(a6)
    h['attend_weekly'] = h.attend.map(lambda v: np.nan if pd.isna(v) else float(v in ('Weekly', 'More than weekly')))
    h['religion'] = iv.religion_1979.map({'None': 'None', 'Catholic': 'Catholic', 'Baptist': 'Protestant',
                                          'Protestant': 'Protestant', 'Jewish': 'Jewish', 'Other': 'Other'})
    h['religion_raised'] = iv.religion_raised.map({'No religion': 'None', 'Catholic': 'Catholic', 'Baptist': 'Protestant',
                                                   'Other Protestant': 'Protestant', 'Jewish': 'Jewish', 'Other': 'Other'})
    h['occupation_group'] = iv.occupation_group.replace({'No job reported': 'Not working'})
    h['region'] = iv.region
    h['country'] = 'US'
    h['x_net_worth_before_nominal'] = np.where(iv.net_worth_measured == 'Yes', iv.net_worth_before_k * 1000, np.nan)
    h['x_income_percentile'] = iv.income_percentile
    h['x_afqt'] = iv.afqt
    h['x_spouse_age_at_marriage'] = iv.spouse_age_at_marriage
    h['x_spouse_education'] = iv.spouse_education
    h['x_siblings'] = iv.siblings
    measured = ['person_id', 'cluster_id', 'weight', 'unit', 'outcome', 't_start', 't_end', 'exposure', 'event',
                'wedding_year', 'calendar_year', 'marriage_order', 'sex', 'age', 'age_at_marriage', 'race_eth',
                'race_eth_coarse', 'education', 'married_before', 'cohabited_first', 'children_before', 'family_origin',
                'intact_family', 'attend', 'attend_weekly', 'religion', 'religion_raised', 'occupation_group', 'region', 'country']
    write_harmonized(h, 'nlsy79_first_marriage', measured,
                     notes=['outcome is LEGAL divorce (separation not counted), unlike most lenses',
                            "education 'Bachelor' means 16+ years of school (no graduate split)",
                            'race_eth Asian/American Indian from 1979 origin among non-Black non-Hispanic respondents (small; AI overstated)',
                            'family_origin: the reason a parent was absent was not asked'])


def main():
    t0 = time.time()
    m = tf.people()
    m = pd.concat([m, new_features(m)], axis=1)
    iv = tf.intervals(m)
    print(len(m), 'marriages', len(iv), 'intervals', flush=True)
    for c in ['race_detail', 'family_at_14_detail', 'attendance6', 'religion_1979', 'occupation_group', 'net_worth_measured']:
        print(m.groupby(c).agg(n=('d', 'size'), ev=('d', 'sum')).to_string(), flush=True)
    harmonize(m, iv)
    V = variants()
    res = Parallel(n_jobs=JOBS)(delayed(one_repeat)(m, iv, V, r) for r in range(tf.REPEATS))
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    losses = {k: np.mean([poisson_deviance_rows(y, e, w, r[k]) for r in res], axis=0) for k in ['constant'] + list(V)}
    tab = cluster_gain_table(iv.person, losses, reference='current model', reps=BOOT, seed=SEED)
    base = set(tf.NUMERIC + tf.CATEGORICAL)
    tab['inputs_added'] = tab.model.map(lambda k: ', '.join(c for c in V.get(k, []) if c not in base))
    tab['inputs_removed'] = tab.model.map(lambda k: ', '.join(c for c in base if k in V and c not in V[k]))
    tab['marriages'], tab['divorces'], tab['intervals'], tab['repeats'] = len(m), int(m.d.sum()), len(iv), tf.REPEATS
    tab.to_csv(HERE / 'extended_heldout.csv', index=False, float_format='%.4f')
    print(tab.drop(columns=['inputs_added', 'inputs_removed']).round(3).to_string(index=False), flush=True)

    rr = []
    for name, (add, drop) in BLOCKS.items():
        rr += rate_ratios(iv, name, add, drop)
    pd.DataFrame(rr).to_csv(HERE / 'extended_rate_ratios.csv', index=False, float_format='%.4f')
    print(pd.DataFrame(rr)[['variable', 'level', 'rate_ratio', 'ci95_low', 'ci95_high', 'marriages']].round(2).to_string(), flush=True)

    t = tab.set_index('model')
    helpful = [b for b in BLOCKS if t.loc[f'current + {b}', 'diff_ci95_low'] > 0]
    bpath = tf.OUT / 'nlsy79_first_marriage.json'
    bundle = json.loads(bpath.read_text())
    feats = V['current + all new blocks']
    cats, nums = split(feats)
    pipe = fit(cats, nums, iv)
    r = t.loc['current + all new blocks']
    bundle['models_extended'] = [dict(
        key='additive_spline_all_blocks', label='Additive spline Poisson, current inputs + all new blocks',
        heldout=dict(deviance_improvement_percent=round(float(r.gain_percent), 3),
                     deviance_improvement_ci95=[round(float(r.gain_ci95_low), 3), round(float(r.gain_ci95_high), 3)],
                     gain_over_current_points=round(float(r.diff_vs_reference_points), 3),
                     gain_over_current_ci95=[round(float(r.diff_ci95_low), 3), round(float(r.diff_ci95_high), 3)],
                     evaluation=f'train_first_marriage.py person folds (5 x {tf.REPEATS}); paired person bootstrap ({BOOT})'),
        new_inputs=[c for c in feats if c not in base], removed_inputs=[c for c in base if c not in feats],
        **tf.export(pipe))]
    bundle['models_extended_note'] = (
        'Held-out comparison of richer inputs (2026-10-20, extended_predictors.py). Not scored by the app until the form asks '
        f'for them. Blocks whose held-out difference had a 95% CI above zero: {", ".join(helpful) if helpful else "none"}.')
    bundle['inputs_extended'] = INPUTS
    bundle['support_extended'] = {c: [float(np.nanmin(m[c])), float(np.nanmax(m[c]))] for c in NEW_NUMERIC}
    bpath.write_text(json.dumps(bundle, separators=(',', ':')))
    vpath = tf.OUT / 'nlsy79_first_marriage_testvectors.json'
    vec = json.loads(vpath.read_text())
    rng = np.random.default_rng(SEED + 41)
    rows = []
    for i in range(40):
        rw = {c: str(rng.choice(sorted(m[c].astype(str).unique()))) for c in cats}
        for c in nums:
            lo, hi = float(np.nanmin(iv[c])), float(np.nanmax(iv[c]))
            rw[c] = None if (i % 7 == 0 and c != 'marriage_years') else float(rng.uniform(lo - 0.1 * (hi - lo), hi + 0.1 * (hi - lo)))
        rows.append(rw)
    df = pd.DataFrame(rows)
    for c in nums:
        df[c] = df[c].astype(float)
    vec['extended'] = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                           predictions={'additive_spline_all_blocks': pipe.predict(df).tolist()})
    vpath.write_text(json.dumps(vec))
    print('helpful', helpful, f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
