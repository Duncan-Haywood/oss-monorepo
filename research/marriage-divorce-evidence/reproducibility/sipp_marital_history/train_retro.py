"""SIPP retrospective first-marriage dissolution: per-year models from the wedding year.

Pools five independent weighted cross-sections (2001, 2004 and 2008 panels' wave-2 marital
history modules; the 2021 and 2025 annual files), builds marriage-year intervals, compares a
constant rate, a duration-only curve, an additive spline Poisson model, a Poisson tree and
Poisson gradient boosting with 5-fold household-held-out deviance, Harrell's C, decile lift and
calibration (household-bootstrap 95% CIs), and exports the fitted models to
../../app/models/sipp_first_marriage.json with test vectors for the JS engine.

Inputs are fixed at the wedding: marriage length, age at marriage, wedding year, sex,
race-ethnicity and nativity. Education at the wedding exists only for the 2001-2008 modules
(dated by the year of the diploma / first college / bachelor's degree), so its model is fitted on
that subset and compared with the same model without it. Spouse traits are not used: the files
describe only the current spouse, which would leak the outcome (an intact marriage has one).

Usage: python3 -I train_retro.py WORK_DIR   (WORK_DIR/retro.parquet from build_retro.py)
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path[:0] = [str(HERE), str(HERE.parent), str(ROOT / 'app' / 'tools')]
from bundle_export import export as export_pipe  # noqa: E402
import survival_utils as su  # noqa: E402

warnings.simplefilter('ignore')
assert sklearn.__version__ == '1.7.2'
SEED = 20261020
OUT = ROOT / 'app' / 'models'
MAX_YEARS = 30          # administrative censoring: follow each marriage for at most 30 years
FIRST_COHORT = 1960     # weddings from 1960 (older ones are seen only through surviving respondents)
# Interview timing within the interview year (fraction of the year elapsed, documented calendars):
# 2001/2004 wave 2 June-September; 2008 wave 2 January-April 2009; 2021/2025 February-June.
INTERVIEW_FRAC = {'tm2_2001': 0.6, 'tm2_2004': 0.6, 'tm2_2008': 0.2, 'pu': 0.33}
NUMERIC = ['marriage_years', 'age_at_marriage', 'marriage_year']
CATEGORICAL = ['sex', 'race_ethnicity', 'nativity']
EDU = 'education_at_wedding'
HORIZONS = (5, 10, 20)


def load(work):
    m = pd.read_parquet(Path(work) / 'retro.parquet')
    audit = dict(read=len(m), read_by_source=m.groupby('source').size().to_dict())
    m = m[(m.marriage_year >= FIRST_COHORT) & m.age_at_marriage.between(15, 60) & (m.end_year >= m.marriage_year)]
    audit['kept_after_cohort_age_order_filters'] = len(m)
    key = np.where(m.source.str.contains('wave 2'), 'tm2_' + m.panel.astype(str), 'pu')
    f = pd.Series(key, index=m.index).map(INTERVIEW_FRAC).to_numpy()
    D = (m.end_year - m.marriage_year).to_numpy(float)
    censored_at_interview = (m.event == 0) & (m.widowed == 0)
    # Wedding and dissolution placed mid-year; interview at its documented point in the year.
    t = np.where(censored_at_interview, np.where(D >= 1, D + f - 0.5, f / 2), np.maximum(D, 0) + 0.5)
    m = m.assign(t=t)
    over = m.t > MAX_YEARS
    m.loc[over, 'event'] = 0
    m.loc[over, 't'] = MAX_YEARS
    m['weight'] = m.weight / m.groupby('source').weight.transform('mean')  # mean 1 within each survey
    m = m.reset_index(drop=True)
    m['id'] = np.arange(len(m))
    m['hh'] = pd.factorize(m.hh)[0]          # integer household codes (memory)
    m['tm2'] = m.source.str.contains('wave 2').astype(np.int8)
    return m, audit


def intervals(m):
    k_max = np.ceil(m.t.to_numpy()).astype(int)
    rep = np.repeat(np.arange(len(m)), k_max)
    k = np.concatenate([np.arange(n) for n in k_max])
    t = m.t.to_numpy()[rep]
    iv = pd.DataFrame(dict(id=rep, marriage_years=k.astype(float), exposure=np.minimum(t, k + 1) - k))
    iv['event'] = ((m.event.to_numpy()[rep] == 1) & (k == k_max[rep] - 1)).astype(int)
    for c in ['age_at_marriage', 'marriage_year', 'weight', 'hh', 'tm2']:
        iv[c] = m[c].to_numpy()[rep]
    for c in CATEGORICAL + [EDU]:
        cat = pd.Categorical(m[c])
        iv[c] = pd.Categorical.from_codes(cat.codes[rep], cat.categories)
    return iv


def spline(n_knots):
    return Pipeline([('impute', SimpleImputer(strategy='median')),
                     ('spline', SplineTransformer(n_knots=n_knots, degree=2, knots='quantile', include_bias=False,
                                                  extrapolation='linear')),
                     ('scale', StandardScaler())])


def cat():
    return OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)


def pipeline(kind):
    if kind == 'duration_only':
        prep = ColumnTransformer([('num', spline(6), ['marriage_years'])])
        est = PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    elif kind in ('additive_spline', 'additive_spline_tm2'):
        prep = ColumnTransformer([('num', spline(5), NUMERIC), ('cat', cat(), CATEGORICAL)])
        est = PoissonRegressor(alpha=1e-5, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    elif kind == 'additive_spline_education':
        prep = ColumnTransformer([('num', spline(5), NUMERIC), ('cat', cat(), CATEGORICAL + [EDU])])
        est = PoissonRegressor(alpha=1e-5, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    elif kind == 'tree_depth4':
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), NUMERIC),
                                  ('cat', cat(), CATEGORICAL)])
        est = DecisionTreeRegressor(criterion='poisson', max_depth=4, min_samples_leaf=20000, random_state=SEED)
    elif kind == 'gradient_boosting':
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), NUMERIC),
                                  ('cat', cat(), CATEGORICAL)])
        est = HistGradientBoostingRegressor(loss='poisson', max_depth=3, max_iter=120, learning_rate=0.1,
                                            min_samples_leaf=5000, l2_regularization=1.0, early_stopping=False,
                                            random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


MODELS = [('duration_only', 'Marriage length only (baseline curve)'),
          ('additive_spline', 'Additive spline Poisson'),
          ('tree_depth4', 'Poisson tree, depth 4'),
          ('gradient_boosting', 'Poisson gradient boosting (120 trees, depth 3)')]
EDU_MODELS = [('additive_spline_tm2', 'Additive spline Poisson, 2001-2008 panels only (comparator)'),
              ('additive_spline_education', 'Additive spline Poisson + education at the wedding (2001-2008 panels)')]


def fit(kind, d):
    p = pipeline(kind)
    p.fit(d, d.event / d.exposure, fit__sample_weight=d.weight * d.exposure)
    return p


def boosted_export(pipe):
    """Same JSON as app/tools/train_nsfg2002_family.py's gradient-boosting export."""
    est = pipe.named_steps['fit']
    prep = pipe.named_steps['prep']
    base = dict(numeric=None, categorical=dict(columns=[], categories=[], drop_first=[]),
                feature_names=prep.get_feature_names_out().tolist())
    for name, tr, cols in prep.transformers_:
        if name == 'num':
            base['numeric'] = dict(columns=list(cols), impute=dict(tr.steps)['impute'].statistics_.tolist())
        elif name == 'cat':
            base['categorical'] = dict(columns=list(cols), categories=[list(map(str, c)) for c in tr.categories_],
                                       drop_first=[int(i) == 0 for i in tr.drop_idx_])
    trees = []
    for (pred,) in est._predictors:
        n = pred.nodes
        assert not n['is_categorical'].any()
        trees.append(dict(left=[int(v) if not l else -1 for v, l in zip(n['left'], n['is_leaf'])],
                          right=[int(v) if not l else -1 for v, l in zip(n['right'], n['is_leaf'])],
                          feature=n['feature_idx'].astype(int).tolist(), threshold=n['num_threshold'].tolist(),
                          missing_left=n['missing_go_to_left'].astype(bool).tolist(),
                          value=n['value'].tolist(), n_node_samples=n['count'].astype(int).tolist()))
    base.update(kind='boosted', baseline=float(np.ravel(est._baseline_prediction)[0]), trees=trees)
    return base


def export_model(kind, pipe):
    return boosted_export(pipe) if kind == 'gradient_boosting' else export_pipe(pipe)


def horizon_risk(pipe, people, horizons=HORIZONS):
    """P(dissolution by year h) = 1 - exp(-sum_{k<h} rate_k) for each person's fixed inputs."""
    hmax = max(horizons)
    rows = people.loc[people.index.repeat(hmax)].copy()
    rows['marriage_years'] = np.tile(np.arange(hmax, dtype=float), len(people))
    rate = pipe.predict(rows).reshape(len(people), hmax)
    cum = np.cumsum(rate, axis=1)
    return {h: 1 - np.exp(-cum[:, h - 1]) for h in horizons}


def evaluate(iv, m, preds, risk10, keys, fold_people_mask=None, reps=200):
    """Held-out metrics with household-bootstrap 95% CIs."""
    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    hh_codes_iv, hh_uni = pd.factorize(iv.hh)
    hh_codes_m = pd.Index(hh_uni).get_indexer(m.hh)
    counts = su.cluster_counts(hh_codes_iv, len(hh_uni), reps, SEED)
    per_hh = lambda r: np.bincount(hh_codes_iv, weights=su.poisson_unit_dev(y, e, w, r), minlength=len(hh_uni))
    base_hh, dur_hh = per_hh(preds['constant']), per_hh(preds['duration_only'])
    t10 = np.minimum(m.t.to_numpy(), 10.0)
    ev10 = ((m.event.to_numpy() == 1) & (m.t.to_numpy() <= 10)).astype(int)
    wm = m.weight.to_numpy()
    res = {}
    km_all = su.weighted_km(m.t.to_numpy(), m.event.to_numpy(), wm, [10])[10]
    for k in keys:
        mh = per_hh(preds[k])
        gain = 100 * (1 - mh.sum() / base_hh.sum())
        boot = 100 * (1 - counts @ mh / (counts @ base_hh))
        over_dur = 100 * (1 - mh.sum() / dur_hh.sum())
        boot_dur = 100 * (1 - counts @ mh / (counts @ dur_hh))
        r = dict(deviance_improvement_percent=gain, ci95=list(np.quantile(boot, [0.025, 0.975])),
                 improvement_over_duration_only_percent=over_dur,
                 improvement_over_duration_only_ci95=list(np.quantile(boot_dur, [0.025, 0.975])),
                 observed_expected_ratio=float(np.dot(w, y) / np.dot(w, e * preds[k])))
        if k in risk10:
            rk = risk10[k]
            c = su.harrell_c(t10, ev10, rk, wm)
            cb = []
            for cnt in counts[:100]:
                cb.append(su.harrell_c(t10, ev10, rk, wm * cnt[hh_codes_m]))
            r.update(c_index_10y=c, c_index_10y_ci95=list(np.quantile(cb, [0.025, 0.975])))
            dec = np.minimum((su.wquantiles(rk, wm, np.linspace(0, 1, 11))[None, :-1] <= rk[:, None]).sum(1) - 1, 9)
            cal = []
            for b in range(10):
                s = dec == b
                obs = 1 - su.weighted_km(m.t.to_numpy()[s], m.event.to_numpy()[s], wm[s], [10])[10]
                cal.append(dict(decile=b + 1, people=int(s.sum()), predicted_10y=float(np.average(rk[s], weights=wm[s])),
                                observed_10y_km=float(obs)))
            r.update(calibration_10y=cal, top_decile_lift_10y=cal[-1]['observed_10y_km'] / (1 - km_all),
                     bottom_decile_ratio_10y=cal[0]['observed_10y_km'] / (1 - km_all))
        res[k] = r
    return res


def main(work):
    m, audit = load(work)
    iv = intervals(m)
    assert abs(iv.exposure.sum() - m.t.sum()) < 1e-6 * len(m) and iv.event.sum() == m.event.sum()
    hh = m.hh.unique()
    rng = np.random.default_rng(SEED)
    rng.shuffle(hh)
    fold_of = pd.Series(np.arange(len(hh)) % 5, index=hh)
    m['fold'] = m.hh.map(fold_of).to_numpy()
    iv['fold'] = iv.hh.map(fold_of).to_numpy()
    tm2 = m.tm2.to_numpy() == 1
    tm2_iv = iv.tm2.to_numpy() == 1

    keys = ['constant'] + [k for k, _ in MODELS]
    preds = {k: np.zeros(len(iv)) for k in keys}
    epreds = {k: np.full(len(iv), np.nan) for k in ['constant', 'duration_only'] + [k for k, _ in EDU_MODELS]}
    risk = {k: {h: np.zeros(len(m)) for h in HORIZONS} for k, _ in MODELS[1:] + EDU_MODELS}
    for f in range(5):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        ix = te.index.to_numpy()
        mte = m[m.fold == f]
        preds['constant'][ix] = (tr.weight * tr.event).sum() / (tr.weight * tr.exposure).sum()
        for k, _ in MODELS:
            p = fit(k, tr)
            preds[k][ix] = p.predict(te)
            if k != 'duration_only':
                for h, v in horizon_risk(p, mte).items():
                    risk[k][h][mte.index] = v
        # Education model: 2001-2008 modules only, compared on the same people.
        tr2, te2 = tr[tm2_iv[tr.index]], te[tm2_iv[te.index]]
        mte2 = mte[tm2[mte.index]]
        ix2 = te2.index.to_numpy()
        epreds['constant'][ix2] = (tr2.weight * tr2.event).sum() / (tr2.weight * tr2.exposure).sum()
        epreds['duration_only'][ix2] = fit('duration_only', tr2).predict(te2)
        for k, _ in EDU_MODELS:
            p = fit(k, tr2)
            epreds[k][ix2] = p.predict(te2)
            for h, v in horizon_risk(p, mte2).items():
                risk[k][h][mte2.index] = v
        print('fold', f, 'done', flush=True)

    res = evaluate(iv, m, preds, {k: risk[k][10] for k, _ in MODELS[1:]}, keys)
    sub_iv, sub_m = iv[tm2_iv].reset_index(drop=True), m[tm2].reset_index(drop=True)
    eres = evaluate(sub_iv, sub_m, {k: v[tm2_iv] for k, v in epreds.items()},
                    {k: risk[k][10][tm2] for k, _ in EDU_MODELS}, list(epreds))
    # Paired gain of education over the same model without it (same people, same folds).
    hh_codes, hh_uni = pd.factorize(sub_iv.hh)
    y, e, w = sub_iv.event.to_numpy(), sub_iv.exposure.to_numpy(), sub_iv.weight.to_numpy()
    a = np.bincount(hh_codes, weights=su.poisson_unit_dev(y, e, w, epreds['additive_spline_tm2'][tm2_iv]))
    b = np.bincount(hh_codes, weights=su.poisson_unit_dev(y, e, w, epreds['additive_spline_education'][tm2_iv]))
    cnt = su.cluster_counts(hh_codes, len(hh_uni), 200, SEED + 7)
    edu_gain = dict(percent=100 * (1 - b.sum() / a.sum()), ci95=list(np.quantile(100 * (1 - cnt @ b / (cnt @ a)), [0.025, 0.975])))

    comp = pd.DataFrame([dict(model=k, sample='all five surveys', **{kk: vv for kk, vv in v.items() if not isinstance(vv, list)},
                              ci95_low=v['ci95'][0], ci95_high=v['ci95'][1]) for k, v in res.items()] +
                        [dict(model=k, sample='2001-2008 modules', **{kk: vv for kk, vv in v.items() if not isinstance(vv, list)},
                              ci95_low=v['ci95'][0], ci95_high=v['ci95'][1]) for k, v in eres.items()])
    comp.to_csv(HERE / 'retro_heldout_comparison.csv', index=False, float_format='%.6g')
    cal = [dict(model=k, **c) for k, v in {**res, **eres}.items() for c in v.get('calibration_10y', [])]
    pd.DataFrame(cal).to_csv(HERE / 'retro_heldout_calibration_10y.csv', index=False, float_format='%.6g')

    # Descriptive weighted Kaplan-Meier by subgroup (aggregate; safe to publish).
    m['age_band'] = pd.cut(m.age_at_marriage, [0, 20, 25, 30, 35, 100], right=False,
                           labels=['under 20', '20-24', '25-29', '30-34', '35+']).astype(str)
    m['cohort'] = pd.cut(m.marriage_year, [1960, 1970, 1980, 1990, 2000, 2010, 2030], right=False,
                         labels=['1960s', '1970s', '1980s', '1990s', '2000s', '2010s+']).astype(str)
    groups = [('All first marriages', np.ones(len(m), bool))]
    for c, lab in [('sex', 'Respondent'), ('age_band', 'Age at marriage'), ('cohort', 'Wedding decade'),
                   ('race_ethnicity', 'Race-ethnicity'), ('nativity', 'Nativity'), ('source', 'Survey'),
                   (EDU, 'Education at the wedding (2001-2008 modules)'), ('education_now', 'Education at interview (after the marriage began)')]:
        for v in sorted(m[c].unique()):
            if v in ('Not timed',):
                continue
            groups.append((f'{lab}: {v}', (m[c] == v).to_numpy()))
    lt = []
    for name, s in groups:
        g = m[s]
        if len(g) < 100:
            continue
        km = su.weighted_km(g.t.to_numpy(), g.event.to_numpy(), g.weight.to_numpy(), [1, 3, 5, 10, 15, 20, 25])
        lt.append(dict(group=name, marriages=len(g), dissolutions=int(g.event.sum()),
                       **{f'still_married_{h}y': km[h] for h in km}))
    lt = pd.DataFrame(lt)
    lt.to_csv(HERE / 'retro_weighted_survival.csv', index=False, float_format='%.4f')

    # Population reference: weighted quantiles of held-out predicted dissolution by 5/10/20 years,
    # in the standard shape app/population.js reads (see survival_utils.standard_reference).
    ps = [i / 100 for i in range(1, 100)]
    wts = m.weight.to_numpy()
    qs = lambda k, s: [su.wquantiles(risk[k][h][s], wts[s], ps) for h in HORIZONS]
    labels = {'sex': 'Respondent', 'age_band': 'Age at marriage', 'cohort': 'Wedding decade',
              'race_ethnicity': 'Race-ethnicity', 'nativity': 'Nativity', 'source': 'Survey'}
    subs, flat = [], []
    for c in labels:
        for v in sorted(m[c].unique()):
            s = (m[c] == v).to_numpy()
            if s.sum() >= 100:
                subs.append((c, v, int(s.sum()), qs('additive_spline', s)))
    for v in sorted(m.loc[tm2, EDU].unique()):
        s = (m[EDU] == v).to_numpy() & tm2
        if s.sum() >= 100:
            subs.append((EDU, v, int(s.sum()), qs('additive_spline_education', s)))
    pop = su.standard_reference(
        HORIZONS, (len(m), qs('additive_spline', np.ones(len(m), bool))), subs, unit='probability',
        models={'default': 'additive_spline', EDU: 'additive_spline_education (2001-2008 modules only)'},
        method=('Weighted percentiles (p1..p99) of HELD-OUT predicted probability of first-marriage dissolution by 5, 10 '
                'and 20 years from the wedding, from each person\u2019s own inputs (5-fold household cross-fitting). '
                'Subgroups with fewer than 100 people are omitted.'))
    pd.DataFrame([dict(variable=c, level=v, n=n, **{f'{h}y_p{q}': round(float(vals[i][q - 1]), 5)
                                                       for i, h in enumerate(HORIZONS) for q in (10, 25, 50, 75, 90)})
                  for c, v, n, vals in [('all', 'All first marriages', len(m), qs('additive_spline', np.ones(len(m), bool)))] + subs]
                 ).to_csv(HERE / 'retro_population_reference_summary.csv', index=False)

    # Final fits on everyone, exported for the browser.
    pipes = {k: fit(k, iv) for k, _ in MODELS}
    pipes['additive_spline_education'] = fit('additive_spline_education', iv[tm2_iv])
    (HERE / 'retro_tree_depth4.txt').write_text(export_text(
        pipes['tree_depth4'].named_steps['fit'],
        feature_names=pipes['tree_depth4'].named_steps['prep'].get_feature_names_out().tolist(), decimals=4))
    for k in ('additive_spline', 'additive_spline_education'):
        pd.DataFrame(dict(feature=pipes[k].named_steps['prep'].get_feature_names_out(),
                          coef=pipes[k].named_steps['fit'].coef_)).to_csv(HERE / f'retro_coefficients_{k}.csv', index=False, float_format='%.6g')

    support = {c: [float(m[c].quantile(0.005)), float(m[c].quantile(0.995))] for c in ['age_at_marriage', 'marriage_year']}
    at_risk = iv.groupby('marriage_years').size()
    support = {'marriage_years': [0.0, float(min(MAX_YEARS - 1, at_risk[at_risk >= 200].index.max()))], **support}
    audit.update(marriages=len(m), dissolutions=int(m.event.sum()), widowed_censored=int(m.widowed.sum()),
                 intervals=len(iv), person_years=float(iv.exposure.sum()), households=int(len(hh)),
                 by_source=m.groupby('source').agg(marriages=('id', 'size'), dissolutions=('event', 'sum')).to_dict(orient='index'),
                 unknown_counts={c: int((m[c] == 'Unknown').sum()) for c in CATEGORICAL + [EDU]},
                 education_at_wedding_tm2=m[tm2][EDU].value_counts().to_dict(),
                 wedding_years=[int(m.marriage_year.min()), int(m.marriage_year.max())],
                 education_gain_over_same_model_percent=edu_gain,
                 folds='5 folds by household (SSUID within survey), seeded shuffle', python_sklearn=sklearn.__version__)
    for k in audit['by_source']:
        audit['by_source'][k] = {kk: int(vv) for kk, vv in audit['by_source'][k].items()}
    (HERE / 'retro_sample_audit.json').write_text(json.dumps(audit, indent=1, default=float) + '\n')

    def held(k, src):
        v = src[k]
        out = dict(deviance_improvement_percent=round(v['deviance_improvement_percent'], 3), ci95=[round(x, 3) for x in v['ci95']],
                   improvement_over_duration_only_percent=round(v['improvement_over_duration_only_percent'], 3),
                   improvement_over_duration_only_ci95=[round(x, 3) for x in v['improvement_over_duration_only_ci95']],
                   observed_expected_ratio=round(v['observed_expected_ratio'], 4))
        if 'c_index_10y' in v:
            out.update(c_index_10y=round(v['c_index_10y'], 4), c_index_10y_ci95=[round(x, 4) for x in v['c_index_10y_ci95']],
                       top_decile_lift_10y=round(v['top_decile_lift_10y'], 3),
                       bottom_decile_ratio_10y=round(v['bottom_decile_ratio_10y'], 3),
                       calibration_10y=[{kk: (round(vv, 5) if isinstance(vv, float) else vv) for kk, vv in c.items()} for c in v['calibration_10y']])
        return out

    models = [dict(key=k, label=lbl, heldout=held(k, res), **export_model(k, pipes[k])) for k, lbl in MODELS]
    models.append(dict(key='additive_spline_education', label=EDU_MODELS[1][1],
                       heldout=dict(**held('additive_spline_education', eres), sample='2001-2008 modules only',
                                    gain_over_same_model_without_education_percent=round(edu_gain['percent'], 3),
                                    gain_over_same_model_without_education_ci95=[round(x, 3) for x in edu_gain['ci95']]),
                       **export_model('additive_spline_education', pipes['additive_spline_education'])))
    bundle = dict(
        id='sipp_first_marriage', version=1,
        source=('U.S. Census Bureau, Survey of Income and Program Participation: 2001, 2004 and 2008 panels, wave-2 '
                'marital history topical modules (interviews 2001, 2004, 2009), and the 2021 and 2025 annual public-use '
                'files; five independent weighted cross-sections, first marriages begun 1960 or later'),
        target=('Annual rate of first-marriage dissolution (separation or divorce, dated by the year of separation) per '
                'marriage-year from the wedding year; widowhood censored; retrospective histories reported at one '
                'interview (Poisson rate, not a probability)'),
        population='U.S. household population aged 15+ who have ever married, men and women, each person’s own FIRST marriage (any spouse)',
        weights='SIPP final person weights, normalised to mean 1 within each survey, times exposure',
        timing=('Years only (months are suppressed). Weddings and separations are placed mid-year, interviews at their '
                'documented point in the year; marriages followed at most 30 years. Inputs are fixed at the wedding.'),
        panels=sorted(m.source.unique().tolist()),
        training=dict(intervals=len(iv), people=len(m), households=int(len(hh)), events=int(m.event.sum()),
                      person_years=round(float(iv.exposure.sum()), 1)),
        constant_rate=float((iv.weight * iv.event).sum() / (iv.weight * iv.exposure).sum()),
        support=support,
        inputs=dict(
            marriage_years='completed years since the wedding at the start of the year being scored (0 = wedding year)',
            age_at_marriage='age in years in the wedding year (age at interview minus years since the wedding; +/-1 year)',
            marriage_year='calendar year of the wedding (1960-2025 in the data); later years are extrapolation',
            sex='Woman/Man: the respondent whose first marriage it is',
            race_ethnicity='Hispanic, White, Black, Asian, Other (non-Hispanic unless Hispanic; 2001 codes Asian with Pacific Islander)',
            nativity='US-born (including U.S. territories), Foreign-born, Unknown',
            education_at_wedding=('Only the education model: highest level reached by the end of the wedding year, from the '
                                  'year of the diploma, first college enrolment or bachelor’s degree (2001-2008 modules); '
                                  'Less than high school, High school, Some college, Bachelor or higher, Unknown')),
        abstain=['marriages other than the first (a remarriage gets no number from this lens)',
                 'age at the wedding outside the support', 'spouse characteristics are not inputs: the data hold only the current spouse'],
        leakage_note=('Spouse traits are excluded: SIPP records the spouse only while the marriage is intact, so using them '
                      'would encode the outcome. Education at interview is shown only descriptively; it can be completed after '
                      'the wedding or after a divorce.'),
        comparison={k: dict(deviance_improvement_percent=round(v['deviance_improvement_percent'], 3), ci95=[round(x, 3) for x in v['ci95']])
                    for k, v in res.items()},
        models=models,
        population_reference=pop,
        weighted_survival=json.loads(lt.to_json(orient='records')),
        sklearn=sklearn.__version__)
    OUT.mkdir(exist_ok=True)
    (OUT / 'sipp_first_marriage.json').write_text(json.dumps(bundle, separators=(',', ':')))

    vrng = np.random.default_rng(SEED + 1)
    levels = {c: sorted(m[c].unique()) for c in CATEGORICAL + [EDU]}
    rows = []
    for i in range(60):
        r = {c: str(vrng.choice(levels[c])) for c in CATEGORICAL + [EDU]}
        r['marriage_years'] = float(vrng.uniform(0, 35))
        r['age_at_marriage'] = None if i % 11 == 0 else float(vrng.uniform(14, 65))
        r['marriage_year'] = float(vrng.integers(1955, 2031))
        rows.append(r)
    rows.append({**rows[1], 'race_ethnicity': 'Not a category', EDU: 'Not timed'})
    df = pd.DataFrame(rows)
    df['age_at_marriage'] = df.age_at_marriage.astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: pipes[k].predict(df).tolist() for k in pipes})
    (OUT / 'sipp_first_marriage_testvectors.json').write_text(json.dumps(vectors))
    print(json.dumps({k: v for k, v in audit.items() if k != 'by_source'}, default=float, indent=0))
    print(comp.round(4).to_string(index=False))
    print(lt.round(3).to_string(index=False))
    print('education gain', edu_gain)


if __name__ == '__main__':
    main(sys.argv[1])
