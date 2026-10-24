"""NLSY97 first marriages: do detailed race, a richer family of origin, religion at full detail,
political interest, occupation before the wedding and wealth components add held-out skill?

Same marriages, marriage-year intervals, weights and person folds as train_models.py (5 folds x
REPEATS seeds, the first REPEATS of its seeds). Every variant is the additive spline Poisson GLM of
train_models.py (alpha 1e-3) with inputs added or replaced; gains are weighted Poisson deviance vs
the training-fold constant rate, averaged over repeats, with paired person-bootstrap 95% CIs of
each variant's difference from the current model (extended_eval.cluster_gain_table).

Every new input is fixed at or before the wedding month:
  race_detail       KEY!RACE x KEY!ETHNICITY (1997)
  family_origin     parent figures at ages 2 and 12 (CV_YTH_REL_HH_AGE_2/12, 1997) and whether a
                    biological parent had died (YSAQ-057/146, 1997)
  attend8           worship attendance, all 8 answers (YSAQ-282A), last pre-wedding round (2000+)
  prays_often, obey_teachings, asks_god, no_need_religion   YSAQ-282A6/A3/A4/A2 (2002/05/06/08/11),
                    last pre-wedding round with an answer
  faith_importance  YSAQ-282A7 (2008, 2011) before the wedding
  parent_religiosity FP_PPRELIG (parent report, 1997)
  political_interest YPOL-105 (2004-2010) before the wedding
  occupation_group  YEMP_OCCODE-2002 of employer 01, last pre-wedding round with a job
  financial_assets_k, debts_k, home_owner   age-20/25 assets module if that interview preceded the wedding

Writes extended_heldout.csv, extended_rate_ratios.csv; adds `models_extended` to
../../app/models/nlsy97_first_marriage.json and `extended` test vectors; harmonized extract to
$HARMONIZED_DIR (outside the repository) when set.
Run: NLSY97_WORK=<work> python3 extended_predictors.py   (needs extract_ext.csv from select_vars_ext.py)
"""
import json, os, sys, time, warnings
from pathlib import Path
from joblib import Parallel, delayed
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import build_marriages as bm  # noqa: E402
import train_models as tm  # noqa: E402
from bundle_export import export as export_pipe  # noqa: E402
from extended_eval import cluster_gain_table, poisson_deviance_rows, write_harmonized  # noqa: E402

warnings.simplefilter('ignore')
SEED = tm.SEED
REPEATS = int(os.environ.get('NLSY97_EXT_REPEATS', 3))
BOOT = 1000
RR_BOOT = int(os.environ.get('NLSY97_RR_BOOT', 200))
JOBS = int(os.environ.get('NLSY97_JOBS', 4))
WORK = tm.WORK
OUT = tm.OUT

ATTEND8 = {1: 'Never', 2: 'Once or twice a year', 3: 'Less than once a month', 4: 'About once a month',
           5: 'About twice a month', 6: 'About once a week', 7: 'Several times a week', 8: 'Every day'}
FAITH = {1: 'Extremely important', 2: 'Very important', 3: 'Somewhat important', 4: 'Not very important',
         5: 'Not important at all'}
POLINT = {1: 'Most of the time', 2: 'Some of the time', 3: 'Only now and then', 4: 'Hardly at all'}
NOT_BEFORE = 'Not measured before wedding'
OCC_GROUPS = [(10, 3540, 'Management, business, science and arts'), (3600, 4650, 'Service'),
              (4700, 5940, 'Sales and office'), (6000, 7630, 'Natural resources, construction and maintenance'),
              (7700, 9750, 'Production, transportation and material moving'), (9800, 9840, 'Military')]
NEW_NUMERIC = ['parent_religiosity', 'financial_assets_k', 'debts_k']
CLIP = dict(financial_assets_k=(0, 100), debts_k=(0, 100))
BLOCKS = {
    'race detail (replaces race_ethnicity)': (['race_detail'], ['race_ethnicity']),
    'family of origin, 6 levels (replaces family_at_12)': (['family_origin'], ['family_at_12']),
    'religion detail (8-level attendance replaces the 4-level band; beliefs, importance, parent religiosity)':
        (['attend8', 'prays_often', 'obey_teachings', 'asks_god', 'no_need_religion', 'faith_importance',
          'parent_religiosity'], ['attendance_before']),
    'political interest': (['political_interest'], []),
    'occupation before the wedding': (['occupation_group'], []),
    'wealth components (financial assets, debts, home owner)': (['financial_assets_k', 'debts_k', 'home_owner'], []),
}
INPUTS = {
    'race_detail': 'race and Hispanic origin (KEY!RACE, KEY!ETHNICITY): Hispanic; non-Hispanic White, Black, American '
                   'Indian or Alaska Native, Asian or Pacific Islander (one category in NLSY97), Other',
    'family_origin': 'who raised the respondent: Both parents (both biological parents at 12) / Parent died (a '
                     'biological parent deceased by 1997) / Stepfamily (a biological parent and another parent at 12) / '
                     'Single parent, reason not known (one biological parent at 12; NLSY97 cannot separate divorce, '
                     'separation and never-married parents) / Other (adoptive, foster, other adults) / Unknown',
    'attend8': 'worship attendance in the past 12 months, all eight answers (Never ... Several times a week / Every '
               'day), last interview before the wedding; asked from 2000',
    'prays_often': "'I pray more than once a day' (True/False), last answer before the wedding (asked 2002-2011)",
    'obey_teachings': "'Religious teachings should be obeyed exactly as written' (True/False)",
    'asks_god': "'I ask God to help me make decisions' (True/False)",
    'no_need_religion': "'I don't need religion to have good values' (True/False)",
    'faith_importance': 'importance of religious faith in daily life, 5 points (asked 2008 and 2011 only)',
    'parent_religiosity': "parent's religiosity index 0-6 (parent report, 1997)",
    'political_interest': 'follows government and public affairs: most of the time ... hardly at all (2004-2010)',
    'occupation_group': 'occupation of the first-listed employer at the last interview before the wedding (2002 Census '
                        'codes), major group; "No job reported" if none',
    'financial_assets_k': 'financial assets ($1,000s, 0-100) at the age-20/25 assets interview, if before the wedding',
    'debts_k': 'debts other than mortgage ($1,000s, 0-100) at that interview',
    'home_owner': 'owned a home at that interview (Yes / No / Not measured before wedding)',
}


def occ_group(code):
    if np.isnan(code):
        return 'No job reported'
    for lo, hi, name in OCC_GROUPS:
        if lo <= code <= hi:
            return name
    return 'No job reported'


def tf(v):
    return NOT_BEFORE if np.isnan(v) else ('True' if v == 1 else 'False')


def new_features(m):
    d = pd.read_csv(WORK / 'extract.csv', usecols=lambda c: c == 'PUBID@1997' or c.startswith(
        ('CV_INTERVIEW_CMONTH@', 'YSAQ-282A@', 'CVC_ASSETS_RND_', 'FP_PPRELIG@')), low_memory=False)
    x = pd.read_csv(WORK / 'extract_ext.csv', low_memory=False)
    assert (d['PUBID@1997'].to_numpy() == x['PUBID@1997'].to_numpy()).all()
    x = pd.concat([x, d.drop(columns='PUBID@1997')], axis=1).set_index('PUBID@1997')
    x = x.loc[m.id.to_numpy()].reset_index(drop=True)
    R = bm.ROUND_YEARS
    IV = bm.per_round(x, 'CV_INTERVIEW_CMONTH')
    att = bm.per_round(x, 'YSAQ-282A')
    bel = {k: bm.per_round(x, f'YSAQ-282{k}') for k in ['A2', 'A3', 'A4', 'A6', 'A7']}
    pol = bm.per_round(x, 'YPOL-105')
    occ = bm.per_round(x, 'YEMP_OCCODE-2002.01')
    c = lambda n: bm._clean(x[n]).to_numpy()
    eth, race = c('KEY!ETHNICITY@1997'), c('KEY!RACE@1997')
    a12, a2 = c('CV_YTH_REL_HH_AGE_12@1997'), c('CV_YTH_REL_HH_AGE_2@1997')
    momdead, daddead = c('YSAQ-057@1997') == 2, c('YSAQ-146@1997') == 2
    prel = c('FP_PPRELIG@1997') / 100 if 'FP_PPRELIG@1997' in x else np.full(len(x), np.nan)
    fin = {a: bm._clean(x[f'CVC_ASSETS_FINANCIAL_{a}@XRND'], True).to_numpy() for a in (20, 25)}
    debt = {a: bm._clean(x[f'CVC_ASSETS_DEBTS_{a}@XRND'], True).to_numpy() for a in (20, 25)}
    htype = {a: c(f'CVC_HOUSE_TYPE_{a}@XRND') for a in (20, 25)}
    arnd = {a: c(f'CVC_ASSETS_RND_{a}@XRND') for a in (20, 25)}
    out = []
    for i, w in enumerate(m.wedding_cm.to_numpy()):
        pre = [r for r in range(len(R)) if not np.isnan(IV[i, r]) and IV[i, r] < w]
        last = lambda M: next((M[i, r] for r in reversed(pre) if not np.isnan(M[i, r])), np.nan)
        rec = {}
        rec['race_detail'] = ('Unknown' if np.isnan(eth[i]) and np.isnan(race[i]) else 'Hispanic' if eth[i] == 1 else
                              {1: 'White', 2: 'Black', 3: 'American Indian or Alaska Native',
                               4: 'Asian or Pacific Islander', 5: 'Other'}.get(race[i], 'Unknown'))
        f12, f2 = a12[i], a2[i]
        if f12 == 1:
            fo = 'Both parents'
        elif momdead[i] or daddead[i]:
            fo = 'Parent died'
        elif f12 in (2, 3):
            fo = 'Stepfamily'
        elif f12 in (4, 5):
            # one biological parent at 12: divorce, separation and never-married parents cannot be told
            # apart (the age-2 parent-figure variable almost never differs from the age-12 one)
            fo = 'Single parent, reason not known'
        elif np.isnan(f12):
            fo = 'Unknown'
        else:
            fo = 'Other'
        rec['family_origin'] = fo
        v = last(att)
        rec['attend8'] = ATTEND8.get(v, NOT_BEFORE)
        rec['prays_often'] = tf(last(bel['A6']))
        rec['obey_teachings'] = tf(last(bel['A3']))
        rec['asks_god'] = tf(last(bel['A4']))
        rec['no_need_religion'] = tf(last(bel['A2']))
        rec['faith_importance'] = FAITH.get(last(bel['A7']), NOT_BEFORE)
        rec['parent_religiosity'] = prel[i]
        rec['political_interest'] = POLINT.get(last(pol), NOT_BEFORE)
        rec['occupation_group'] = occ_group(last(occ)) if pre else NOT_BEFORE
        fa = db = np.nan
        ho = NOT_BEFORE
        for a in (25, 20):
            rnd = arnd[a][i]
            if not np.isnan(rnd) and 1 <= rnd <= len(R) and not np.isnan(IV[i, int(rnd) - 1]) and IV[i, int(rnd) - 1] < w:
                fa, db = fin[a][i], debt[a][i]
                ho = 'Unknown' if np.isnan(htype[a][i]) else ('No' if htype[a][i] == 6 else 'Yes')
                break
        rec['financial_assets_k'] = fa / 1000 if fa == fa else np.nan
        rec['debts_k'] = db / 1000 if db == db else np.nan
        rec['home_owner'] = ho
        out.append(rec)
    f = pd.DataFrame(out, index=m.index)
    for k, (lo, hi) in CLIP.items():
        f[k] = f[k].clip(lo, hi)
    return f


def make(features, alpha=1e-3):
    num = [c for c in tm.NUMERIC_ALL + NEW_NUMERIC if c in features or c == 'marriage_years']
    cat = [c for c in features if c not in tm.NUMERIC_ALL + NEW_NUMERIC]
    prep = ColumnTransformer([tm.spline_num(num), ('cat', OneHotEncoder(drop='first', handle_unknown='ignore',
                                                                         sparse_output=False), cat)])
    return Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=alpha, max_iter=3000, tol=1e-9,
                                                               solver='newton-cholesky'))])


def fitp(features, d, alpha=1e-3):
    return make(features, alpha).fit(d, d.event / d.exposure, fit__sample_weight=d.weight * d.exposure)


def variants():
    base = list(tm.FEATURES)
    v = {'current model': base}
    for name, (add, drop) in BLOCKS.items():
        v[f'current + {name}'] = [c for c in base if c not in drop] + add
    adds = [c for a, _ in BLOCKS.values() for c in a]
    drops = [c for _, d in BLOCKS.values() for c in d]
    v['current + all new blocks'] = [c for c in base if c not in drops] + adds
    v['current, family at 12 as yes/no'] = [c if c != 'family_at_12' else 'intact12' for c in base]
    return v


def one_split(iv, m, V, r):
    ids = m.id.to_numpy().copy()
    np.random.default_rng(SEED + r).shuffle(ids)
    fold_of = {i: k % 5 for k, i in enumerate(ids)}
    ivf = iv.id.map(fold_of).to_numpy()
    P = {k: np.zeros(len(iv)) for k in ['constant'] + list(V)}
    for f in range(5):
        tr, te = iv[ivf != f], iv[ivf == f]
        ix = np.where(ivf == f)[0]
        P['constant'][ix] = (tr.weight * tr.event).sum() / (tr.weight * tr.exposure).sum()
        for k, feats in V.items():
            P[k][ix] = fitp(feats, tr).predict(te)
    return P


def rate_ratios(iv, block, add, drop):
    """Adjusted rate ratios for the new inputs: linear numerics + one-hot, every current input, a
    marriage-length spline; person-bootstrap refits for the CI."""
    feats = [c for c in tm.FEATURES if c not in drop] + add
    num = [c for c in tm.NUMERIC_ALL + NEW_NUMERIC if c in feats]
    cat = [c for c in feats if c not in num]
    cats = {c: sorted(iv[c].astype(str).unique(), key=lambda v: (v not in REF.get(c, [v]), v)) for c in cat}

    def pipe():
        prep = ColumnTransformer([('dur', SplineTransformer(n_knots=5, degree=2, include_bias=False), ['marriage_years']),
                                  ('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), num),
                                  ('cat', OneHotEncoder(categories=[cats[c] for c in cat], drop='first',
                                                        handle_unknown='ignore', sparse_output=False), cat)])
        return Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9,
                                                                  solver='newton-cholesky'))])

    def coefs(d):
        p = pipe().fit(d, d.event / d.exposure, fit__sample_weight=d.weight * d.exposure)
        return p.named_steps['fit'].coef_, p.named_steps['prep'].get_feature_names_out()
    point, names = coefs(iv)
    groups = iv.groupby('id').indices
    keys = list(groups)
    rng = np.random.default_rng(SEED + 5)

    def boot(b):
        pick = np.random.default_rng(SEED + 1000 + b).integers(0, len(keys), len(keys))
        idx = np.concatenate([groups[keys[k]] for k in pick])
        return coefs(iv.iloc[idx])[0]
    B = np.array(Parallel(n_jobs=JOBS)(delayed(boot)(b) for b in range(RR_BOOT)))
    lo, hi = np.percentile(B, [2.5, 97.5], axis=0)
    rows = []
    per_person = iv.drop_duplicates('id')
    for i, n in enumerate(names):
        kind, var = n.split('__', 1)
        base = next((c for c in add if var == c or var.startswith(c + '_')), None)
        if base is None or kind == 'dur':
            continue
        level = var[len(base) + 1:] if kind == 'cat' else ''
        sub = per_person[per_person[base].astype(str) == level] if level else per_person
        unit = 1.0
        rows.append(dict(block=block, variable=base, level=level, reference=cats[base][0] if kind == 'cat' else '',
                         per='vs reference' if kind == 'cat' else 'one unit', rate_ratio=float(np.exp(point[i] * unit)),
                         ci95_low=float(np.exp(lo[i] * unit)), ci95_high=float(np.exp(hi[i] * unit)),
                         marriages=len(sub), dissolutions=int(sub.event_any.sum()),
                         adjusted_for='every current-model input, a marriage-length spline' +
                                      (f'; replaces {", ".join(drop)}' if drop else '')))
    return rows


REF = {'race_detail': ['White'], 'family_origin': ['Both parents'], 'attend8': ['Never'],
       'prays_often': ['False'], 'obey_teachings': ['False'], 'asks_god': ['False'], 'no_need_religion': ['False'],
       'faith_importance': ['Somewhat important'], 'political_interest': ['Some of the time'],
       'occupation_group': ['Management, business, science and arts'], 'home_owner': ['No'], 'intact12': ['Yes']}


def harmonize(m, iv):
    h = pd.DataFrame(index=iv.index)
    h['person_id'] = iv.id.astype(str)
    h['cluster_id'] = h.person_id
    h['weight'] = iv.weight
    h['unit'] = 'person_period'
    h['outcome'] = 'first marriage ends in separation or divorce (monthly marital status array); widowhood and last interview censor'
    h['t_start'] = iv.marriage_years
    h['t_end'] = iv.marriage_years + iv.exposure
    h['exposure'] = iv.exposure
    h['event'] = iv.event
    h['wedding_year'] = iv.wedding_year
    h['calendar_year'] = iv.wedding_year + iv.marriage_years
    h['marriage_order'] = 'first'
    h['sex'] = iv.sex.map({'Female': 'Woman', 'Male': 'Man'})
    h['age_at_marriage'] = iv.age_at_marriage
    h['age'] = iv.age_at_marriage + iv.marriage_years
    h['race_eth'] = iv.race_detail.replace({'Asian or Pacific Islander': 'Asian', 'Unknown': np.nan})
    h['race_eth_coarse'] = iv.race_ethnicity
    h['education'] = iv.education_at_marriage.map({'No high school credential': 'Less than high school',
                                                   'High school or GED': 'High school', 'Associate': 'Some college',
                                                   'Bachelor': 'Bachelor', 'Graduate degree': 'Graduate'})
    h['married_before'] = 0
    h['cohabited_first'] = (iv.cohabited_first == 'Yes').astype(float)
    h['children_before'] = (iv.children_before_marriage.astype(str) != '0').astype(float)
    h['premarital_conception'] = (iv.pregnant_at_wedding == 'Yes').astype(float)
    h['family_origin'] = iv.family_origin.replace({'Unknown': np.nan})
    h['intact_family'] = np.where(iv.family_origin == 'Unknown', np.nan, (iv.family_origin == 'Both parents').astype(float))
    a6 = {'Never': 'Never', 'Once or twice a year': 'Less than monthly', 'Less than once a month': 'Less than monthly',
          'About once a month': 'About monthly', 'About twice a month': '2-3 times a month', 'About once a week': 'Weekly',
          'Several times a week': 'More than weekly', 'Every day': 'More than weekly'}
    h['attend'] = iv.attend8.map(a6)
    h['attend_weekly'] = h.attend.map(lambda v: np.nan if pd.isna(v) else float(v in ('Weekly', 'More than weekly')))
    h['religion_raised'] = iv.religion_raised.replace({'Unknown': np.nan})
    h['religion_importance'] = iv.faith_importance.map({'Extremely important': 'Very important', 'Very important': 'Very important',
                                                        'Somewhat important': 'Somewhat important',
                                                        'Not very important': 'Not important', 'Not important at all': 'Not important'})
    h['occupation_group'] = iv.occupation_group.replace({'No job reported': 'Not working', NOT_BEFORE: np.nan})
    h['home_owner'] = iv.home_owner.map({'Yes': 1.0, 'No': 0.0})
    h['region'] = iv.region
    h['country'] = 'US'
    h['x_earnings_year_before_nominal'] = iv.earnings_year_before_k * 1000
    h['x_net_worth_before_nominal'] = iv.net_worth_before_k * 1000
    h['x_prays_more_than_once_a_day'] = iv.prays_often
    h['x_afqt_percentile'] = iv.afqt_percentile
    h['x_spouse_age_gap'] = iv.spouse_age_gap
    h['x_spouse_education'] = iv.spouse_education
    measured = ['person_id', 'cluster_id', 'weight', 'unit', 'outcome', 't_start', 't_end', 'exposure', 'event',
                'wedding_year', 'calendar_year', 'marriage_order', 'sex', 'age', 'age_at_marriage', 'race_eth',
                'race_eth_coarse', 'education', 'married_before', 'cohabited_first', 'children_before',
                'premarital_conception', 'family_origin', 'intact_family', 'attend', 'attend_weekly', 'religion_raised',
                'religion_importance', 'occupation_group', 'home_owner', 'region', 'country']
    write_harmonized(h, 'nlsy97_first_marriage', measured,
                     notes=['Asian and Pacific Islander are one category in NLSY97 (race_eth = Asian covers both)',
                            "family_origin 'Single parent, reason not known': divorce, separation and never-married parents are not separable",
                            'money columns are nominal (x_ columns); the survey year varies by person',
                            'spouse traits partly imputed in the lens (see METHODS.md)'])


def main():
    t0 = time.time()
    raw = pd.read_pickle(WORK / 'marriages.pkl')
    m = tm.prepare(raw)
    m = pd.concat([m, new_features(m)], axis=1)
    m['intact12'] = np.where(m.family_at_12 == 'Unknown', 'Unknown', np.where(m.family_at_12 == 'Both biological parents', 'Yes', 'No'))
    m['event_any'] = m.event
    iv = tm.intervals(m)
    print(len(m), 'marriages', len(iv), 'intervals', f'{time.time() - t0:.0f}s', flush=True)
    harmonize(m, iv)
    for c in ['family_origin', 'race_detail', 'attend8', 'occupation_group', 'home_owner']:
        print(m.groupby(c).agg(n=('event', 'size'), ev=('event', 'sum')).to_string(), flush=True)
    V = variants()
    res = Parallel(n_jobs=JOBS)(delayed(one_split)(iv, m, V, r) for r in range(REPEATS))
    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    losses = {k: np.mean([poisson_deviance_rows(y, e, w, r[k]) for r in res], axis=0) for k in ['constant'] + list(V)}
    tab = cluster_gain_table(iv.id, losses, reference='current model', reps=BOOT, seed=SEED)
    base = set(tm.FEATURES)
    tab['inputs_added'] = tab.model.map(lambda k: ', '.join(c for c in V.get(k, []) if c not in base))
    tab['inputs_removed'] = tab.model.map(lambda k: ', '.join(c for c in base if k in V and c not in V[k]))
    tab['marriages'], tab['dissolutions'], tab['intervals'], tab['repeats'] = len(m), int(m.event.sum()), len(iv), REPEATS
    tab.to_csv(HERE / 'extended_heldout.csv', index=False, float_format='%.4f')
    print(tab.drop(columns=['inputs_added', 'inputs_removed']).round(3).to_string(index=False), flush=True)

    rr = []
    for name, (add, drop) in BLOCKS.items():
        rr += rate_ratios(iv, name, add, drop)
    rr += rate_ratios(iv, 'family at 12, yes/no (replaces family_at_12)', ['intact12'], ['family_at_12'])
    pd.DataFrame(rr).to_csv(HERE / 'extended_rate_ratios.csv', index=False, float_format='%.4f')
    print(pd.DataFrame(rr)[['variable', 'level', 'rate_ratio', 'ci95_low', 'ci95_high', 'marriages']].round(2).to_string(), flush=True)

    # Export: current inputs + every block (transparency), and current + the blocks whose CI of the
    # difference lies above zero (if any).
    t = tab.set_index('model')
    helpful = [b for b in BLOCKS if t.loc[f'current + {b}', 'diff_ci95_low'] > 0]
    sets = {'additive_spline_all_blocks': ('Additive spline Poisson GLM, current inputs + all new blocks',
                                           'current + all new blocks')}
    if helpful:
        feats = list(tm.FEATURES)
        for b in helpful:
            add, drop = BLOCKS[b]
            feats = [c for c in feats if c not in drop] + add
        V['current + helpful blocks'] = feats
        sets['additive_spline_helpful_blocks'] = ('Additive spline Poisson GLM, current inputs + blocks that helped '
                                                  'held out: ' + '; '.join(helpful), 'current + helpful blocks')
    bpath = OUT / 'nlsy97_first_marriage.json'
    bundle = json.loads(bpath.read_text())
    pipes, ext = {}, []
    for key, (label, vname) in sets.items():
        feats = V[vname]
        pipes[key] = fitp(feats, iv)
        held = {}
        if vname in t.index:
            r = t.loc[vname]
            held = dict(deviance_improvement_percent=round(float(r.gain_percent), 3),
                        deviance_improvement_ci95=[round(float(r.gain_ci95_low), 3), round(float(r.gain_ci95_high), 3)],
                        gain_over_current_points=round(float(r.diff_vs_reference_points), 3),
                        gain_over_current_ci95=[round(float(r.diff_ci95_low), 3), round(float(r.diff_ci95_high), 3)])
        held['evaluation'] = (f'5 person folds x {REPEATS} seeds (train_models.py splits), weighted Poisson deviance vs '
                              f'the training-fold constant; paired person bootstrap ({BOOT})')
        ext.append(dict(key=key, label=label, heldout=held, new_inputs=[c for c in feats if c not in base],
                        removed_inputs=[c for c in base if c not in feats], **export_pipe(pipes[key])))
    bundle['models_extended'] = ext
    bundle['models_extended_note'] = (
        'Held-out comparison of richer inputs (2026-10-20, extended_predictors.py). Not scored by the app until the form '
        'asks for the new inputs. Blocks whose held-out difference over the current additive model had a 95% CI above '
        f'zero: {", ".join(helpful) if helpful else "none"}.')
    bundle['inputs_extended'] = INPUTS
    bundle['support_extended'] = {c: [float(np.nanmin(m[c])), float(np.nanmax(m[c]))] for c in NEW_NUMERIC}
    bpath.write_text(json.dumps(bundle, separators=(',', ':'), default=float))

    vpath = OUT / 'nlsy97_first_marriage_testvectors.json'
    vec = json.loads(vpath.read_text())
    rng = np.random.default_rng(SEED + 21)
    allf = sorted({c for k in sets.values() for c in V[k[1]]})
    rows = []
    for i in range(40):
        r = {}
        for c in allf:
            if c in tm.NUMERIC_ALL + NEW_NUMERIC:
                lo, hi = np.nanmin(m[c]), np.nanmax(m[c])
                r[c] = None if i % 7 == 0 else float(rng.uniform(lo - 0.1 * (hi - lo), hi + 0.1 * (hi - lo)))
            else:
                r[c] = str(rng.choice(sorted(m[c].astype(str).unique())))
        r['marriage_years'] = float(rng.uniform(0, 30))
        rows.append(r)
    df = pd.DataFrame(rows)
    for c in df.columns:
        if c in tm.NUMERIC_ALL + NEW_NUMERIC:
            df[c] = df[c].astype(float)
    vec['extended'] = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                           predictions={k: p.predict(df).tolist() for k, p in pipes.items()})
    vpath.write_text(json.dumps(vec))
    print('helpful', helpful, f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
