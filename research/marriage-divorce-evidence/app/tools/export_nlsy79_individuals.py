"""Export the saved NLSY79 individual-level pipelines (reproducibility/ml_individuals) to
plain JSON for in-browser inference, plus Python-computed test vectors the JS engine must
match. Two populations, four models each (additive Poisson, spline additive Poisson,
depth-2 and depth-3 Poisson trees), with the held-out metrics, paired bootstrap intervals
and grouped calibration that reproducibility/ml_individuals already saved.

These pipelines add one transform the couple bundle lacks: SimpleImputer(add_indicator=True),
which appends a 0/1 "was missing" column for each input that had missing values in training.

Needs the pinned environment in reproducibility/ml_couples/requirements.txt (sklearn 1.7.2).
Only load checkpoints whose provenance you trust; these are the repository's own.
Run: python3 app/tools/export_nlsy79_individuals.py   (from research/marriage-divorce-evidence)
"""
from pathlib import Path
import json, warnings
import numpy as np, pandas as pd, joblib, sklearn

warnings.simplefilter('ignore')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / 'reproducibility' / 'ml_individuals'
CUTS = ROOT / 'reproducibility' / 'annual_nlsy' / 'legally_married_primary' / 'income_quartile_cutpoints.json'
OUT = HERE.parent / 'models'
assert sklearn.__version__ == '1.7.2', 'checkpoints need scikit-learn 1.7.2'

POPULATIONS = [
    ('currently_married_only', 'Currently married (not separated) at the interview'),
    ('legally_married_including_separated', 'Legally married, including already separated'),
]
MODELS = [
    ('additive_poisson', 'Additive Poisson'),
    ('spline_additive_poisson', 'Spline additive Poisson'),
    ('tree_depth2', 'Poisson tree, depth 2'),
    ('tree_depth3', 'Poisson tree, depth 3'),
]


def export(pipe):
    prep, est = pipe.named_steps['preprocess'], pipe.named_steps['model']
    num, cat = None, None
    for name, tr, cols in prep.transformers_:
        if name == 'num':
            steps = dict(tr.steps)
            imp = steps['impute']
            num = dict(columns=list(cols), impute=imp.statistics_.tolist())
            if imp.indicator_ is not None:
                # Indicator columns follow the imputed columns, in this order.
                num['indicator'] = [int(i) for i in imp.indicator_.features_]
            if 'spline' in steps:
                sp = steps['spline']
                num['spline'] = dict(degree=int(sp.degree), extrapolation=sp.extrapolation,
                                     knots=[b.t.tolist() for b in sp.bsplines_],
                                     include_bias=bool(sp.include_bias))
            if 'scale' in steps:
                num['scale'] = dict(mean=steps['scale'].mean_.tolist(), scale=steps['scale'].scale_.tolist())
        elif name == 'cat':
            cat = dict(columns=list(cols), categories=[list(map(str, c)) for c in tr.categories_],
                       drop_first=[int(i) == 0 for i in tr.drop_idx_])
    out = dict(numeric=num, categorical=cat, feature_names=prep.get_feature_names_out().tolist())
    if hasattr(est, 'coef_'):
        out['kind'] = 'poisson_glm'
        out['intercept'] = float(est.intercept_)
        out['coef'] = est.coef_.tolist()
    else:
        t = est.tree_
        out['kind'] = 'tree'
        out['tree'] = dict(left=t.children_left.tolist(), right=t.children_right.tolist(),
                           feature=t.feature.tolist(), threshold=t.threshold.tolist(),
                           value=t.value[:, 0, 0].tolist(), n_node_samples=t.n_node_samples.tolist())
    return out


manifest = {m['sample']: m for m in json.loads((SRC / 'feature_manifest.json').read_text())}
metrics = pd.read_csv(SRC / 'heldout_metrics.csv')
boot = pd.read_csv(SRC / 'heldout_improvement.csv')
calib = pd.read_csv(SRC / 'calibration.csv')
leaf_support = pd.read_csv(SRC / 'tree_leaf_support.csv')
settings = json.loads((SRC / 'settings.json').read_text())

populations, pipes = [], {}
for pop, pop_label in POPULATIONS:
    man = manifest[pop]
    met = metrics[metrics['sample'] == pop].set_index('model')
    models = []
    for key, label in MODELS:
        pipe = joblib.load(SRC / f'{pop}_{key}.joblib')
        pipes[(pop, key)] = pipe
        b = boot[(boot['sample'] == pop) & (boot.model == key) & (boot.reference == 'constant')].iloc[0]
        cal = calib[(calib['sample'] == pop) & (calib.model == key) & calib.group.str.startswith('Prediction quintile')]
        heldout = dict(
            deviance_improvement_percent=round(100 * float(met.loc[key, 'relative_deviance_improvement_vs_constant']), 3),
            deviance_improvement_per_person_year=float(b.deviance_improvement_per_person_year),
            ci95=[float(b.ci95_low), float(b.ci95_high)],
            ci_method=str(b.bootstrap),
            observed_expected_ratio=round(float(met.loc[key, 'observed_weighted_event_pseudocount'] / met.loc[key, 'predicted_weighted_event_pseudocount']), 4),
            calibration=[dict(group=r.group, intervals=int(r.intervals), events=int(r.events),
                              observed_per_1000=round(float(r.observed_per_1000), 4),
                              predicted_per_1000=round(float(r.predicted_per_1000), 4),
                              observed_ci95=[round(float(r.observed_ci95_low), 4), round(float(r.observed_ci95_high), 4)])
                         for r in cal.itertuples()])
        m = dict(key=key, label=label, heldout=heldout, **export(pipe))
        if m['kind'] == 'tree':
            ls = leaf_support[(leaf_support['sample'] == pop) & (leaf_support.model == key)]
            m['leaf_support'] = {str(int(r.leaf_id)): dict(intervals=int(r.intervals), respondents=int(r.respondents), events=int(r.events))
                                 for r in ls.itertuples()}
        models.append(m)
    const = met.loc['constant']
    populations.append(dict(
        key=pop, label=pop_label,
        training=dict(intervals=int(man['n']), respondents=int(man['respondents']), events=int(man['events']),
                      person_years=round(float(const.person_years), 1)),
        # Survey-weighted training-average annual rate (the constant baseline).
        constant_rate=float(calib[(calib['sample'] == pop) & (calib.model == 'constant')].observed_per_1000.iloc[0]) / 1000,
        support={c: [v['min'], v['max']] for c, v in man['numeric_support'].items()},
        categories=man['categories'],
        models=models))

bundle = dict(
    id='nlsy79_individuals', version=1,
    source='NLSY79 (U.S. Bureau of Labor Statistics), respondents born 1957-1964, baseline waves 2000-2020, followed to 2022',
    target='Annual legal-divorce rate per person-year from one married person\'s own traits (Poisson rate, not a probability). The spouse\'s traits are not inputs.',
    inputs=dict(numeric=settings['numeric'], categorical=settings['categorical'],
                notes=dict(age='Current age at the interview (trained 35-64)',
                           first_marriage_age='Age at the person\'s FIRST marriage, not necessarily this one',
                           education_model='Highest degree; Master, PhD and Professional are pooled as Graduate',
                           work='Own work hours in the prior calendar year',
                           income_quartile='Combined family income in the prior calendar year, as a within-wave quartile (see income_cutpoints)',
                           religion_2000='Own religious attendance reported in 2000 (may be stale)',
                           baseline_status='Married, or already separated (only in the including-separated population)',
                           start_wave='Interview year; projections hold it at the latest wave')),
    income_cutpoints=json.loads(CUTS.read_text()),
    populations=populations,
    sklearn=sklearn.__version__,
)
OUT.mkdir(exist_ok=True)
(OUT / 'nlsy79_individuals.json').write_text(json.dumps(bundle, separators=(',', ':')))

# Test vectors: rows spanning every category (plus an unseen one), ages inside and outside
# training support (spline extrapolation) and missing first-marriage ages (the indicator).
rng = np.random.default_rng(20261019)
cats = manifest['legally_married_including_separated']['categories']
rows = []
for i in range(80):
    r = {c: str(rng.choice(levels)) for c, levels in cats.items()}
    if i % 11 == 0:
        r['education_model'] = 'Not a category'
    r['age'] = float(rng.uniform(25, 75))
    r['first_marriage_age'] = None if i % 6 == 0 else float(rng.uniform(15, 50))
    rows.append(r)
df = pd.DataFrame(rows)
df['first_marriage_age'] = df.first_marriage_age.astype(float)
vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
               predictions={f'{p}/{k}': pipes[(p, k)].predict(df).tolist() for p, k in pipes})
(OUT / 'nlsy79_individuals_testvectors.json').write_text(json.dumps(vectors))
print('exported', {p['key']: [m['key'] for m in p['models']] for p in populations})
