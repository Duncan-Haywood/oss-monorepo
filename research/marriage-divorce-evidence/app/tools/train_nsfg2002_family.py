"""The classical model family on the NSFG 2002 first-marriage data (ROADMAP section B).

Uses the marriage-year intervals, folds and deviance that reproducibility/nsfg2002_first_marriage
/train_models.py builds, adds four more model families, and compares all of them held out by
person against a constant rate, with person-bootstrap intervals and calibration:

- discrete-time logistic hazard (spline-additive, logit link), exact per-input log-odds;
- categorical naive Bayes on binned inputs, exact per-input log-odds;
- random forest of shallow Poisson trees, exact path attributions (Saabas) in rate units;
- Poisson gradient boosting with small trees, exact path attributions in log-rate units.

It also fits the bundle's distance-to-training-data score (tools/ood.py) so the app can
abstain on couples unlike anyone in the data.

Writes app/models/nsfg2002_family.json (+ test vectors) and
reproducibility/nsfg2002_first_marriage/family_*.csv. Needs scikit-learn 1.7.2 and the raw
NSFG file: `sh ../../reproducibility/nsfg2002_first_marriage/download.sh` first.
Run: python3 app/tools/train_nsfg2002_family.py   (from research/marriage-divorce-evidence)
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import CategoricalNB
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

warnings.simplefilter('ignore')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / 'reproducibility' / 'nsfg2002_first_marriage'
OUT = HERE.parent / 'models'
sys.path.insert(0, str(SRC))
import train_models as tm  # noqa: E402  (the dataset's own builder: intervals, folds, deviance)
sys.path.insert(0, str(HERE))
import ood  # noqa: E402

assert sklearn.__version__ == '1.7.2', 'use scikit-learn 1.7.2 (reproducibility/nsfg2002_first_marriage/requirements.txt)'
NUMERIC, CATEGORICAL, SEED = tm.NUMERIC, tm.CATEGORICAL, tm.SEED

# Naive Bayes bins: left-closed intervals [edge_i, edge_{i+1}); a missing value is its own bin.
NB_BINS = dict(marriage_years=[0, 1, 2, 3, 5, 8, 12, 17],
               wife_age_at_marriage=[0, 18, 20, 22, 24, 27, 31],
               husband_age_at_marriage=[0, 20, 22, 24, 26, 29, 34],
               wedding_year=[0, 1980, 1985, 1990, 1995, 1999])


def nb_codes(d, levels):
    cols = []
    for c, edges in NB_BINS.items():
        x = d[c].to_numpy(dtype=float)
        code = np.searchsorted(edges, x, side='right') - 1
        code = np.where(np.isnan(x), len(edges), np.clip(code, 0, len(edges) - 1))
        cols.append(code)
    for c in CATEGORICAL:
        cols.append(d[c].map({v: i for i, v in enumerate(levels[c])}).to_numpy())
    return np.column_stack(cols).astype(int)


class NaiveBayesHazard:
    """CategoricalNB on (event, no event) per marriage-year; rate = -log(1 - P(event))."""

    def __init__(self, levels):
        self.levels = levels
        self.nb = CategoricalNB(alpha=1.0, min_categories=[len(e) + 1 for e in NB_BINS.values()] + [len(levels[c]) for c in CATEGORICAL])

    def fit(self, d):
        self.nb.fit(nb_codes(d, self.levels), d.event.to_numpy(), sample_weight=d.weight.to_numpy())
        return self

    def predict(self, d):
        p = self.nb.predict_proba(nb_codes(d, self.levels))[:, 1]
        return -np.log1p(-p)


def tree_prep():
    return ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), NUMERIC),
                              ('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), CATEGORICAL)])


def spline_prep():
    num = Pipeline([('impute', SimpleImputer(strategy='median')),
                    ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                    ('scale', StandardScaler())])
    return ColumnTransformer([('num', num, NUMERIC),
                              ('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), CATEGORICAL)])


class LogisticHazard:
    """Discrete-time hazard: P(dissolution in this marriage-year); rate = -log(1 - p)."""

    def __init__(self):
        self.pipe = Pipeline([('prep', spline_prep()), ('fit', LogisticRegression(C=1.0, max_iter=5000, tol=1e-10))])

    def fit(self, d):
        self.pipe.fit(d, d.event, fit__sample_weight=d.weight)
        return self

    def predict(self, d):
        return -np.log1p(-self.pipe.predict_proba(d)[:, 1])


class RateModel:
    def __init__(self, est):
        self.pipe = Pipeline([('prep', tree_prep()), ('fit', est)])

    def fit(self, d):
        self.pipe.fit(d, d.event / d.exposure, fit__sample_weight=d.weight * d.exposure)
        return self

    def predict(self, d):
        return self.pipe.predict(d)


def make(key, levels):
    if key == 'logistic_hazard':
        return LogisticHazard()
    if key == 'naive_bayes':
        return NaiveBayesHazard(levels)
    if key == 'random_forest':
        return RateModel(RandomForestRegressor(n_estimators=40, criterion='poisson', max_depth=4, min_samples_leaf=800,
                                               max_features=0.5, random_state=SEED, n_jobs=1))
    if key == 'gradient_boosting':
        return RateModel(HistGradientBoostingRegressor(loss='poisson', max_depth=3, max_iter=60, learning_rate=0.1,
                                                       min_samples_leaf=800, l2_regularization=1.0,
                                                       early_stopping=False, random_state=SEED))
    raise KeyError(key)


FAMILY = [('logistic_hazard', 'Discrete-time logistic hazard (spline additive)'),
          ('naive_bayes', 'Categorical naive Bayes'),
          ('random_forest', 'Random forest of 40 Poisson trees (depth 4)'),
          ('gradient_boosting', 'Poisson gradient boosting (60 trees, depth 3)')]


def prep_spec(prep):
    num, cat = None, dict(columns=[], categories=[], drop_first=[])
    for name, tr, cols in prep.transformers_:
        if name == 'num':
            steps = dict(tr.steps)
            num = dict(columns=list(cols), impute=steps['impute'].statistics_.tolist())
            if 'spline' in steps:
                sp = steps['spline']
                num['spline'] = dict(degree=int(sp.degree), extrapolation=sp.extrapolation,
                                     knots=[b.t.tolist() for b in sp.bsplines_], include_bias=bool(sp.include_bias))
            if 'scale' in steps:
                num['scale'] = dict(mean=steps['scale'].mean_.tolist(), scale=steps['scale'].scale_.tolist())
        elif name == 'cat':
            cat = dict(columns=list(cols), categories=[list(map(str, c)) for c in tr.categories_],
                       drop_first=[int(i) == 0 for i in tr.drop_idx_])
    return dict(numeric=num, categorical=cat, feature_names=prep.get_feature_names_out().tolist())


def sk_tree(t):
    return dict(left=t.children_left.tolist(), right=t.children_right.tolist(), feature=t.feature.tolist(),
                threshold=t.threshold.tolist(), value=t.value[:, 0, 0].tolist(), n_node_samples=t.n_node_samples.tolist())


def export(key, model):
    if key == 'naive_bayes':
        nb = model.nb
        lv = model.levels
        return dict(kind='naive_bayes', bins=NB_BINS, categorical={c: lv[c] for c in CATEGORICAL},
                    features=list(NB_BINS) + CATEGORICAL, class_log_prior=nb.class_log_prior_.tolist(),
                    feature_log_prob=[f.tolist() for f in nb.feature_log_prob_])
    pipe = model.pipe
    out = prep_spec(pipe.named_steps['prep'])
    est = pipe.named_steps['fit']
    if key == 'logistic_hazard':
        out.update(kind='logistic_hazard', intercept=float(est.intercept_[0]), coef=est.coef_[0].tolist())
    elif key == 'random_forest':
        out.update(kind='forest', trees=[sk_tree(e.tree_) for e in est.estimators_])
    else:
        trees = []
        for (pred,) in est._predictors:
            n = pred.nodes
            assert not n['is_categorical'].any()
            trees.append(dict(left=[int(v) if not l else -1 for v, l in zip(n['left'], n['is_leaf'])],
                              right=[int(v) if not l else -1 for v, l in zip(n['right'], n['is_leaf'])],
                              feature=n['feature_idx'].astype(int).tolist(), threshold=n['num_threshold'].tolist(),
                              missing_left=n['missing_go_to_left'].astype(bool).tolist(),
                              value=n['value'].tolist(), n_node_samples=n['count'].astype(int).tolist()))
        out.update(kind='boosted', baseline=float(np.ravel(est._baseline_prediction)[0]), trees=trees)
    return out


def person_bootstrap(iv, preds, ref, reps=1000):
    """Paired person-resampling of held-out deviance improvement (%), folds held fixed."""
    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()

    def unit_dev(rate):
        mu = e * rate
        t = np.zeros(len(y))
        ok = y > 0
        t[ok] = y[ok] * np.log(y[ok] / mu[ok])
        return 2 * w * (t - y + mu)
    codes, uniq = pd.factorize(iv.id)
    per = lambda r: np.bincount(codes, weights=unit_dev(r), minlength=len(uniq))
    base = per(preds[ref])
    rng = np.random.default_rng(SEED)
    draws = rng.integers(0, len(uniq), size=(reps, len(uniq)))
    counts = np.stack([np.bincount(d, minlength=len(uniq)) for d in draws])
    out = {}
    for k, p in preds.items():
        m = per(p)
        imp = 100 * (1 - counts @ m / (counts @ base))
        out[k] = [float(np.quantile(imp, 0.025)), float(np.quantile(imp, 0.975))]
    return out


def main():
    m = tm.marriages()
    iv = tm.intervals(m)
    rng = np.random.default_rng(SEED)  # identical fold assignment to train_models.py
    ids = m.id.to_numpy().copy()
    rng.shuffle(ids)
    fold_of = {i: k % 5 for k, i in enumerate(ids)}
    iv['fold'] = iv.id.map(fold_of)
    levels = {c: sorted(m[c].unique()) for c in CATEGORICAL}

    keys = ['constant', 'duration_only', 'additive_spline'] + [k for k, _ in FAMILY]
    preds = {k: np.zeros(len(iv)) for k in keys}
    for f in range(5):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        ix = te.index.to_numpy()
        preds['constant'][ix] = (tr.weight * tr.event).sum() / (tr.weight * tr.exposure).sum()
        for k in ['duration_only', 'additive_spline']:
            preds[k][ix] = tm.fit(k, tr).predict(te)
        for k, _ in FAMILY:
            preds[k][ix] = make(k, levels).fit(tr).predict(te)
        print('fold', f, 'done', flush=True)

    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    base = tm.deviance(y, e, w, preds['constant'])
    ci = person_bootstrap(iv, preds, 'constant')
    rows = []
    for k in keys:
        d = tm.deviance(y, e, w, preds[k])
        rows.append(dict(model=k, heldout_mean_deviance=d, deviance_improvement_percent=100 * (1 - d / base),
                         ci95_low=ci[k][0], ci95_high=ci[k][1],
                         observed_expected_ratio=float(np.dot(w, y) / np.dot(w, e * preds[k]))))
    comp = pd.DataFrame(rows)
    comp.to_csv(SRC / 'family_heldout_comparison.csv', index=False, float_format='%.6g')

    cal = []
    for k, _ in FAMILY:
        p = preds[k]
        order = np.argsort(p, kind='stable')
        cw = np.cumsum((w * e)[order]) / (w * e).sum()
        bins = np.empty(len(p), int)
        bins[order] = np.minimum((cw * 10).astype(int), 9)
        for b in range(10):
            s = bins == b
            cal.append(dict(model=k, bin=b + 1, intervals=int(s.sum()), events=int(y[s].sum()),
                            observed_rate=float(np.dot(w[s], y[s]) / np.dot(w[s], e[s])),
                            predicted_rate=float(np.dot(w[s], e[s] * p[s]) / np.dot(w[s], e[s]))))
    cal = pd.DataFrame(cal)
    cal.to_csv(SRC / 'family_heldout_calibration.csv', index=False, float_format='%.6g')

    finals = {k: make(k, levels).fit(iv) for k, _ in FAMILY}

    # Out-of-distribution score on the couple's fixed inputs (marriage length is the
    # projection axis and has its own support range).
    OOD_NUM = ['wife_age_at_marriage', 'husband_age_at_marriage', 'wedding_year']
    ood_spec, ood_held, ood_fit = ood.build(m, m.id.map(fold_of).to_numpy(), OOD_NUM, CATEGORICAL, levels)
    pd.DataFrame(dict(percentile=ood_spec['heldout_quantiles']['p'], heldout_d2=ood_spec['heldout_quantiles']['d2'])).to_csv(
        SRC / 'family_ood_heldout_quantiles.csv', index=False, float_format='%.6g')
    held = comp.set_index('model')
    lens = json.loads((OUT / 'nsfg2002_first_marriage.json').read_text())
    bundle = dict(
        id='nsfg2002_family', version=1, source=lens['source'], target=lens['target'], population=lens['population'],
        weights=lens['weights'], training=lens['training'], constant_rate=lens['constant_rate'], support=lens['support'],
        inputs=lens['inputs'], abstain=lens['abstain'],
        note=('Same data, target, folds and inputs as nsfg2002_first_marriage.json; a different set of model families. '
              'The logistic and naive Bayes models give a probability per marriage-year, converted to a rate as -log(1-p).'),
        comparison={k: dict(deviance_improvement_percent=round(float(held.loc[k, 'deviance_improvement_percent']), 3),
                            ci95=[round(v, 3) for v in ci[k]]) for k in keys},
        models=[dict(key=k, label=lbl,
                     heldout=dict(deviance_improvement_percent=round(float(held.loc[k, 'deviance_improvement_percent']), 3),
                                  ci95=[round(v, 3) for v in ci[k]],
                                  observed_expected_ratio=round(float(held.loc[k, 'observed_expected_ratio']), 4),
                                  calibration=cal[cal.model == k].drop(columns='model').round(6).to_dict(orient='records')),
                     **export(k, finals[k])) for k, lbl in FAMILY],
        ood=ood_spec,
        sklearn=sklearn.__version__)
    (OUT / 'nsfg2002_family.json').write_text(json.dumps(bundle, separators=(',', ':')))

    vrng = np.random.default_rng(SEED + 1)
    rows = []
    for i in range(60):
        r = {c: str(vrng.choice(levels[c])) for c in CATEGORICAL}
        r['marriage_years'] = float(vrng.uniform(0, 35))
        r['wife_age_at_marriage'] = float(vrng.uniform(14, 46))
        r['husband_age_at_marriage'] = None if i % 9 == 0 else float(vrng.uniform(15, 60))
        r['wedding_year'] = float(vrng.integers(1965, 2030))
        rows.append(r)
    # Exact bin edges and split thresholds are the riskiest inputs; include them.
    for c, edges in NB_BINS.items():
        for v in edges[1:3]:
            rows.append({**rows[0], c: float(v)})
    df = pd.DataFrame(rows)
    df['husband_age_at_marriage'] = df.husband_age_at_marriage.astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: finals[k].predict(df).tolist() for k in finals},
                   ood_d2=ood.score(ood_fit, df, OOD_NUM, CATEGORICAL, levels).tolist())
    (OUT / 'nsfg2002_family_testvectors.json').write_text(json.dumps(vectors))
    print(comp.round(4).to_string(index=False))
    examples = pd.DataFrame([
        dict(name='typical: wife 24, husband 26, 1995, no prior marriage', wife_age_at_marriage=24, husband_age_at_marriage=26, wedding_year=1995),
        dict(name='wife 17, husband 45, 1995', wife_age_at_marriage=17, husband_age_at_marriage=45, wedding_year=1995),
        dict(name='wife 38, husband 40, 2002', wife_age_at_marriage=38, husband_age_at_marriage=40, wedding_year=2002),
        dict(name='wife 30, husband 31, wedding 2024', wife_age_at_marriage=30, husband_age_at_marriage=31, wedding_year=2024)])
    for c in CATEGORICAL:
        examples[c] = {'wife_race_ethnicity': 'White', 'same_race_ethnicity': 'Same'}.get(c, 'No')
    q = ood_spec['heldout_quantiles']
    for name, d2 in zip(examples.name, ood.score(ood_fit, examples, OOD_NUM, CATEGORICAL, levels)):
        print(f'OOD {name}: d2 {d2:.1f}, held-out percentile {100 * np.interp(d2, q["d2"], q["p"]):.1f}')


if __name__ == '__main__':
    main()
