"""Export the saved NLSY79 couple pipelines (reproducibility/ml_couples) to plain JSON
for in-browser inference, plus Python-computed test vectors the JS engine must match.

Needs the pinned environment in reproducibility/ml_couples/requirements.txt (sklearn 1.7.2).
Only load checkpoints whose provenance you trust; these are the repository's own.
Run: python3 app/tools/export_nlsy79_couples.py   (from research/marriage-divorce-evidence)
"""
from pathlib import Path
import json, warnings
import numpy as np, pandas as pd, joblib, sklearn

warnings.simplefilter('ignore')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / 'reproducibility' / 'ml_couples'
OUT = HERE.parent / 'models'
assert sklearn.__version__ == '1.7.2', 'checkpoints need scikit-learn 1.7.2'

MODELS = [
    ('additive_core', 'Additive Poisson (core)', 'final_additive_core.joblib'),
    ('additive_enriched', 'Additive Poisson (enriched)', 'final_additive_enriched.joblib'),
    ('spline_pairs', 'Spline + pair-interaction Poisson', 'final_spline_and_pair_interactions.joblib'),
    ('tree_depth2', 'Poisson tree, depth 2', 'final_poisson_tree_depth_2.joblib'),
    ('tree_depth3', 'Poisson tree, depth 3', 'final_poisson_tree_depth_3.joblib'),
]


def export(pipe):
    prep, est = pipe.named_steps['prep'], pipe.named_steps['fit']
    num, cat = None, None
    for name, tr, cols in prep.transformers_:
        if name == 'num':
            steps = dict(tr.steps)
            num = dict(columns=list(cols), impute=steps['impute'].statistics_.tolist())
            if 'spline' in steps:
                sp = steps['spline']
                num['spline'] = dict(degree=int(sp.degree), extrapolation=sp.extrapolation,
                                     knots=[b.t.tolist() for b in sp.bsplines_],
                                     n_basis=int(sp.bsplines_[0].c.shape[0]) - (0 if sp.include_bias else 1),
                                     include_bias=bool(sp.include_bias))
            if 'scale' in steps:
                num['scale'] = dict(mean=steps['scale'].mean_.tolist(), scale=steps['scale'].scale_.tolist())
        elif name == 'cat':
            cat = dict(columns=list(cols), categories=[list(map(str, c)) for c in tr.categories_],
                       drop_first=[int(i) == 0 for i in tr.drop_idx_])
    names = prep.get_feature_names_out().tolist()
    out = dict(numeric=num, categorical=cat, feature_names=names)
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


def support(models):
    # Uniform spline knots are the training min/max of each numeric input.
    sp = models['spline_pairs']['numeric']
    d = sp['spline']['degree']
    return {c: [k[d], k[-d - 1]] for c, k in zip(sp['columns'], sp['spline']['knots'])}


pipes = {key: joblib.load(SRC / f) for key, _, f in MODELS}
models = {key: export(pipes[key]) for key in pipes}
cuts = json.loads((SRC / 'final_training_cutpoints.json').read_text())
comparison = pd.read_csv(SRC / 'heldout_model_comparison.csv')
heldout = {r.model: dict(deviance_improvement_percent=round(float(r.deviance_improvement_percent), 3),
                         observed_expected_ratio=round(float(r.observed_expected_ratio), 4))
           for r in comparison.itertuples()}
label_to_csv = {'additive_core': 'Additive core', 'additive_enriched': 'Additive enriched',
                'spline_pairs': 'Spline + pair interactions', 'tree_depth2': 'Poisson tree depth 2',
                'tree_depth3': 'Poisson tree depth 3'}
audit = json.loads((SRC / 'sample_audit.json').read_text())
bundle = dict(
    id='nlsy79_couples', version=1,
    source='NLSY79 (U.S. Bureau of Labor Statistics), respondents born 1957-1964, baseline waves 2000-2020, followed to 2022',
    target='Annual legal-divorce rate per person-year among intact co-resident opposite-sex married couples (Poisson rate, not a probability)',
    training=dict(intervals=audit['intervals'], respondents=audit['respondents'], events=audit['events'],
                  person_years=round(audit['person_years'], 1)),
    constant_rate=float(comparison.loc[comparison.model == 'Constant', 'observed_rate_per_1000'].iloc[0]) / 1000,
    support=support(models),
    cutpoints=cuts,
    models=[dict(key=k, label=lbl, heldout=heldout[label_to_csv[k]], **models[k]) for k, lbl, _ in MODELS],
    sklearn=sklearn.__version__,
)
OUT.mkdir(exist_ok=True)
(OUT / 'nlsy79_couples.json').write_text(json.dumps(bundle, separators=(',', ':')))

# Test vectors: raw prepared rows spanning categories, numeric ranges and missing values.
rng = np.random.default_rng(20261019)
cat_cols = models['spline_pairs']['categorical']['columns']
cat_levels = dict(zip(cat_cols, models['spline_pairs']['categorical']['categories']))
rows = []
for i in range(60):
    r = {c: str(rng.choice(cat_levels[c])) for c in cat_cols if not c.endswith('_missing') and c not in ('school_pair', 'role_total_pair')}
    r['age'] = float(rng.uniform(30, 70))
    r['current_marriage_years'] = float(rng.uniform(0, 45))
    r['first_marriage_age'] = None if i % 7 == 0 else float(rng.uniform(17, 45))
    r['wife_wage_share'] = None if i % 5 == 0 else float(rng.uniform(0, 1))
    rows.append(r)
df = pd.DataFrame(rows)
for c in ['age', 'current_marriage_years', 'first_marriage_age', 'wife_wage_share']:
    df[c + '_missing'] = np.where(df[c].isna(), 'Missing', 'Observed')
df['school_pair'] = df.husband_school + ' | ' + df.wife_school
df['role_total_pair'] = df.earnings_pair + ' | ' + df.total_wage_band
vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
               predictions={k: pipes[k].predict(df).tolist() for k in pipes})
(OUT / 'nlsy79_couples_testvectors.json').write_text(json.dumps(vectors))
print('exported', [m['key'] for m in bundle['models']], 'support', bundle['support'])
