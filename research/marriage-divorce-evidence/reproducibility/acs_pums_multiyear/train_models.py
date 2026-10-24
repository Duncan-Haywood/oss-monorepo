"""ACS one-year divorce incidence: additive logistic/Poisson, a tree and gradient boosting.

Pooled 2019 and 2021-2024 ACS person records of people married at some point in the past 12
months (derive.py). Outcome: reported a divorce in those 12 months (MARHD = 1). This is a
CROSS-SECTIONAL one-year incidence, not a prospective hazard: every input is measured at the
interview, after any divorce. Two input sets are compared:

- "background": age, sex, years since the (last) wedding, times married, education,
  race-ethnicity, nativity, state. Age, sex, race-ethnicity, nativity and times married are fixed or
  predate the divorce; education and state usually do but can change after it.
- "+ economic (after the event)": adds personal-income percentile within the survey year,
  employment status and occupation group, all of which can be consequences of a divorce.

Held out by HOUSEHOLD (10% of households; spouses and other members share a split). Metrics:
weighted Bernoulli deviance gain vs a constant rate, AUC, top-decile lift and decile
calibration, with household-bootstrap 95% CIs. People who divorced and remarried within the
same 12 months are left out of the models (their MARHYP dates the new marriage).

Usage: python3 -I train_models.py WORK_DIR
Writes app/models/acs_one_year_divorce.json (+ test vectors), CSVs here, and the
model_predicted_risk block of app/data/acs_divorce_baselines.json.
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn, pyarrow.parquet as pq
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path[:0] = [str(HERE), str(HERE.parent), str(HERE.parent / 'sipp_marital_history')]
import derive  # noqa: E402
from bundle_export import export as export_pipe  # noqa: E402
import survival_utils as su  # noqa: E402
from train_retro import boosted_export  # noqa: E402

warnings.simplefilter('ignore')
assert sklearn.__version__ == '1.7.2'
SEED = 20261022
POOLED = [2019, 2021, 2022, 2023, 2024]
TRAIN_ROWS = 800_000
NUM = ['age', 'marriage_years']
CAT = ['sex', 'times_married', 'education', 'race_ethnicity', 'nativity', 'state']
POST_NUM = ['income_percentile']
POST_CAT = ['employment', 'occupation_group']
OUT = ROOT / 'app' / 'models'
BASE_JSON = ROOT / 'app' / 'data' / 'acs_divorce_baselines.json'
GROUPS = ['sex', 'age_band', 'education', 'duration_band', 'times_married', 'race_ethnicity', 'nativity']


KEEP = ['year', 'hh', 'event', 'weight', 'remarried_within_year', 'age_band', 'duration_band', 'income_quintile'] + NUM + CAT + POST_NUM + POST_CAT


def load(work):
    """Per year: derive, assign a seeded random 10% of households to the test set (households are
    nested within survey year), keep every test row and a random share of training rows, then pool. Returns the
    pooled frame and the full pooled counts."""
    cols = [c for c in pq.read_schema(Path(work) / 'acs_2024.parquet').names if not (c.startswith('PWGTP') and c != 'PWGTP')]
    rng = np.random.default_rng(SEED)
    parts, n_all, ev_all = [], 0, 0
    total = sum(pq.ParquetFile(Path(work) / f'acs_{y}.parquet').metadata.num_rows for y in POOLED)
    frac = min(1.0, TRAIN_ROWS / (0.9 * total))
    for y in POOLED:
        names = pq.read_schema(Path(work) / f'acs_{y}.parquet').names
        d = pd.read_parquet(Path(work) / f'acs_{y}.parquet', columns=[c for c in cols if c in names])
        a = derive.derive(d)[KEEP]
        del d
        a['weight'] = a.weight / a.weight.mean()  # mean 1 within each survey year
        n_all += len(a)
        ev_all += int(a.event.sum())
        hh = a.hh.unique()
        test_hh = pd.Index(rng.choice(hh, size=len(hh) // 10, replace=False))
        a['is_test'] = a.hh.isin(test_hh)
        keep = a.is_test.to_numpy() | (rng.random(len(a)) < frac)
        parts.append(a[keep].copy())
        del a
        print('loaded', y, flush=True)
    a = pd.concat(parts, ignore_index=True)
    return a, n_all, ev_all


def spline(n):
    return Pipeline([('impute', SimpleImputer(strategy='median')),
                     ('spline', SplineTransformer(n_knots=n, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                     ('scale', StandardScaler())])


def cat():
    return OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False, min_frequency=None)


def raw():
    return Pipeline([('impute', SimpleImputer(strategy='median'))])


def make(kind):
    post = kind.endswith('_post')
    num, cats = (NUM + POST_NUM, CAT + POST_CAT) if post else (NUM, CAT)
    if kind.startswith('logistic'):
        prep = ColumnTransformer([('num', spline(6), num), ('cat', cat(), cats)])
        est = LogisticRegression(C=1.0, max_iter=3000, tol=1e-8)
    elif kind.startswith('poisson'):
        prep = ColumnTransformer([('num', spline(6), num), ('cat', cat(), cats)])
        est = PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    elif kind.startswith('tree'):
        prep = ColumnTransformer([('num', raw(), num), ('cat', cat(), cats)])
        est = DecisionTreeRegressor(criterion='poisson', max_depth=5, min_samples_leaf=5000, random_state=SEED)
    else:
        prep = ColumnTransformer([('num', raw(), num), ('cat', cat(), cats)])
        est = HistGradientBoostingRegressor(loss='poisson', max_depth=4, max_iter=200, learning_rate=0.1,
                                            min_samples_leaf=2000, l2_regularization=1.0, early_stopping=False,
                                            random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


MODELS = [('logistic_additive', 'Additive logistic (splines in age and marriage length), background inputs'),
          ('poisson_additive', 'Additive Poisson (log link), background inputs'),
          ('tree_depth5', 'Poisson tree, depth 5, background inputs'),
          ('gradient_boosting', 'Poisson gradient boosting (200 trees, depth 4), background inputs'),
          ('logistic_additive_post', 'Additive logistic + income percentile, employment, occupation (measured after the event)'),
          ('gradient_boosting_post', 'Poisson gradient boosting + income, employment, occupation (measured after the event)')]


def fit(kind, d):
    p = make(kind)
    p.fit(d, d.event, fit__sample_weight=d.weight)
    return p


def prob(p, d):
    if hasattr(p.named_steps['fit'], 'predict_proba'):
        return p.predict_proba(d)[:, 1]
    return np.clip(p.predict(d), 1e-9, 1 - 1e-9)


def main(work):
    a, n_all, ev_all = load(work)
    a = a[a.remarried_within_year == 0].reset_index(drop=True)
    is_test = a.is_test.to_numpy()
    tr, te = a[~is_test], a[is_test]
    print('train', len(tr), 'test', len(te), flush=True)
    y, w = te.event.to_numpy(), te.weight.to_numpy()
    codes, uni = pd.factorize(te.hh)
    counts = su.cluster_counts(codes, len(uni), 200, SEED)
    per = lambda p: np.bincount(codes, weights=su.bernoulli_unit_dev(y, w, p), minlength=len(uni))
    const = np.average(tr.event, weights=tr.weight)
    base = per(np.full(len(te), const))
    overall = np.average(y, weights=w)
    pipes, preds, res = {}, {}, {}
    for k, _ in MODELS:
        pipes[k] = fit(k, tr)
        p = preds[k] = prob(pipes[k], te)
        mk = per(p)
        # Deciles of weight in order of predicted risk (ties split by a stable sort).
        order = np.argsort(p, kind='stable')
        dec = np.empty(len(p), int)
        dec[order] = np.minimum((np.cumsum(w[order]) / w.sum() * 10).astype(int), 9)
        cal = [dict(decile=b + 1, people=int((dec == b).sum()), divorces=int(y[dec == b].sum()),
                    predicted_per_1000=1000 * float(np.average(p[dec == b], weights=w[dec == b])),
                    observed_per_1000=1000 * float(np.average(y[dec == b], weights=w[dec == b]))) for b in range(10)]
        res[k] = dict(deviance_improvement_percent=100 * (1 - mk.sum() / base.sum()),
                      ci95=list(np.quantile(100 * (1 - counts @ mk / (counts @ base)), [0.025, 0.975])),
                      auc=su.weighted_auc(p, y, w),
                      auc_ci95=list(np.quantile(su.auc_by_cluster_weights(p, y, w, codes, counts[:100]), [0.025, 0.975])),
                      top_decile_lift=cal[-1]['observed_per_1000'] / (1000 * overall),
                      observed_expected_ratio=float(np.dot(w, y) / np.dot(w, p)), calibration=cal)
        print(k, {kk: vv for kk, vv in res[k].items() if kk != 'calibration'}, flush=True)
    a_, b_ = per(preds['logistic_additive']), per(preds['logistic_additive_post'])
    post_gain = dict(percent=100 * (1 - b_.sum() / a_.sum()),
                     ci95=list(np.quantile(100 * (1 - counts @ b_ / (counts @ a_)), [0.025, 0.975])))
    comp = pd.DataFrame([dict(model=k, **{kk: vv for kk, vv in v.items() if not isinstance(vv, list)},
                              ci95_low=v['ci95'][0], ci95_high=v['ci95'][1], auc_low=v['auc_ci95'][0], auc_high=v['auc_ci95'][1])
                         for k, v in res.items()])
    comp.to_csv(HERE / 'model_heldout_comparison.csv', index=False, float_format='%.6g')
    pd.DataFrame([dict(model=k, **c) for k, v in res.items() for c in v['calibration']]).to_csv(
        HERE / 'model_heldout_calibration.csv', index=False, float_format='%.6g')
    (HERE / 'tree_depth5.txt').write_text(export_text(pipes['tree_depth5'].named_steps['fit'],
                                                      feature_names=pipes['tree_depth5'].named_steps['prep'].get_feature_names_out().tolist(),
                                                      decimals=5))
    pd.DataFrame(dict(feature=pipes['logistic_additive'].named_steps['prep'].get_feature_names_out(),
                      coef=pipes['logistic_additive'].named_steps['fit'].coef_[0])).to_csv(HERE / 'coefficients_logistic_additive.csv', index=False, float_format='%.6g')

    # Population reference: weighted quantiles of held-out predicted one-year risk (background model).
    best = max(['logistic_additive', 'poisson_additive', 'tree_depth5', 'gradient_boosting'],
               key=lambda k: res[k]['deviance_improvement_percent'])
    ps = [i / 100 for i in range(1, 100)]
    p = preds[best]
    subs = []
    for c in GROUPS:
        for v in sorted(te[c].unique()):
            s_ = (te[c] == v).to_numpy()
            if s_.sum() >= 200:
                subs.append((c, v, int(s_.sum()), [su.wquantiles(p[s_], w[s_], ps)]))
    risk = su.standard_reference(
        [1], (len(te), [su.wquantiles(p, w, ps)]), subs, model=best, unit='probability',
        method=('Weighted percentiles (p1..p99) of the held-out predicted probability of a divorce within one year '
                '(horizon 1), among test-set people (10% of households, pooled 2019 and 2021-2024); subgroups with '
                'fewer than 200 people omitted. Cross-sectional: inputs are measured at the interview.'))
    if BASE_JSON.exists():
        b = json.loads(BASE_JSON.read_text())
        b['model_predicted_risk'] = risk
        BASE_JSON.write_text(json.dumps(b, separators=(',', ':')))
    else:
        BASE_JSON.parent.mkdir(exist_ok=True)
        BASE_JSON.write_text(json.dumps(dict(model_predicted_risk=risk), separators=(',', ':')))

    def held(k):
        v = res[k]
        return dict(deviance_improvement_percent=round(v['deviance_improvement_percent'], 3), ci95=[round(x, 3) for x in v['ci95']],
                    auc=round(v['auc'], 4), auc_ci95=[round(x, 4) for x in v['auc_ci95']],
                    top_decile_lift=round(v['top_decile_lift'], 3), observed_expected_ratio=round(v['observed_expected_ratio'], 4),
                    calibration=[{kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in c.items()} for c in v['calibration']],
                    inputs_measured_after_event=k.endswith('_post'))

    def exp(k):
        return boosted_export(pipes[k]) if k.startswith('gradient') else export_pipe(pipes[k])

    support = {c: [float(tr[c].quantile(0.005)), float(tr[c].quantile(0.995))] for c in NUM + POST_NUM}
    bundle = dict(
        id='acs_one_year_divorce', version=1,
        source=('U.S. Census Bureau, American Community Survey 1-year PUMS person files 2019 and 2021-2024 (2020 '
                'experimental weights excluded), people married at some point in the 12 months before the interview'),
        target=('Probability of reporting a divorce in the past 12 months (MARHD), among people married at some point in '
                'those months: a CROSS-SECTIONAL one-year incidence from one interview, not a prospective forecast'),
        population=('U.S. household and group-quarters population aged 15+, both sexes, any marriage order, married at some '
                    'point in the past 12 months; the person’s own report. Same-sex and opposite-sex marriages alike'),
        weights='ACS person weight PWGTP, normalised to mean 1 within each survey year',
        timing=('Everything is measured at the interview, AFTER any divorce. Income, employment and occupation (the "_post" '
                'models) can be consequences of the divorce; education and state of residence can change after it too. '
                'Do not read these models as forecasts for an intact marriage.'),
        training=dict(train_people=len(tr), test_people=len(te), test_households=int(len(uni)),
                      train_divorces=int(tr.event.sum()), test_divorces=int(y.sum()),
                      pooled_people=n_all, pooled_divorces=ev_all,
                      note='train is a random sample of rows from the 90% of households not held out'),
        constant_rate=float(const),
        support=support,
        inputs=dict(
            age='age in years at the interview',
            marriage_years='years since the most recent wedding (survey year minus year last married)',
            sex='Woman/Man', times_married='Once, Twice, Three or more',
            education='Less than high school, High school or GED, Some college, Associate, Bachelor, Graduate or professional (at the interview)',
            race_ethnicity='Hispanic, White, Black, Asian, Other', nativity='US-born/Foreign-born',
            state='two-letter state code of residence at the interview (50 states and DC)',
            income_percentile='"_post" models only: personal income percentile within the survey year among the population (0-100)',
            employment='"_post" models only: Employed, Unemployed, Not in labor force (at the interview)',
            occupation_group='"_post" models only: broad 2018 Census occupation group of the current or most recent job'),
        abstain=['never-married people (no marriage at risk)', 'forecasts for a specific future year: this is cross-sectional incidence'],
        comparison={k: dict(deviance_improvement_percent=round(v['deviance_improvement_percent'], 3),
                            ci95=[round(x, 3) for x in v['ci95']], auc=round(v['auc'], 4)) for k, v in res.items()},
        post_event_gain_over_background=dict(percent=round(post_gain['percent'], 3), ci95=[round(x, 3) for x in post_gain['ci95']],
                                             note='logistic_additive_post vs logistic_additive on the same held-out people'),
        population_reference=risk,
        models=[dict(key=k, label=lbl, heldout=held(k), **exp(k)) for k, lbl in MODELS],
        sklearn=sklearn.__version__)
    OUT.mkdir(exist_ok=True)
    (OUT / 'acs_one_year_divorce.json').write_text(json.dumps(bundle, separators=(',', ':')))

    vrng = np.random.default_rng(SEED + 1)
    levels = {c: sorted(tr[c].unique()) for c in CAT + POST_CAT}
    rows = []
    for i in range(60):
        r = {c: str(vrng.choice(levels[c])) for c in CAT + POST_CAT}
        r['age'] = float(vrng.uniform(14, 95))
        r['marriage_years'] = None if i % 10 == 0 else float(vrng.uniform(0, 75))
        r['income_percentile'] = None if i % 7 == 0 else float(vrng.uniform(0, 100))
        rows.append(r)
    rows.append({**rows[2], 'state': 'Not a state', 'occupation_group': 'Not a group'})
    df = pd.DataFrame(rows)
    for c in NUM + POST_NUM:
        df[c] = df[c].astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: prob(pipes[k], df).tolist() for k in pipes})
    (OUT / 'acs_one_year_divorce_testvectors.json').write_text(json.dumps(vectors))
    print(comp.round(4).to_string(index=False))
    print('post-event gain', post_gain, 'reference model', best)


if __name__ == '__main__':
    main(sys.argv[1])
