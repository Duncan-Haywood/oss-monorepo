"""Fair's extramarital-affairs surveys: who reports an affair, and how much does a
self-rated happy marriage tell you? One model bundle per survey for the browser app.

Redbook 1974 (6,366 married women) and Psychology Today 1969 (601 married men and women).
Target: any extramarital affair reported (a probability, not a divorce rate). Each person is
one row, so stratified K-fold is person-held-out. Models: constant prevalence, logistic on
marriage rating alone, additive logistic on every input, and a shallow tree. Writes CSVs
here and ../../app/models/fair_{redbook1974,pt1969}.json plus Python test vectors.

Run from this folder after `sh download.sh`:  python3 train_models.py
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from bundle_export import export  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261019
OUT = HERE.parent.parent / 'app' / 'models'
RAW = HERE / 'raw'


def redbook():
    d = pd.read_csv(RAW / 'fair.csv')
    assert len(d) == 6366
    occ = {1: 'Student', 2: 'Farm, semi- or unskilled', 3: 'White-collar', 4: 'Teacher, nurse, artist, technician, skilled',
           5: 'Managerial or business', 6: 'Professional with advanced degree'}
    d['occupation'] = d.occupation.map(occ)
    d['occupation_husb'] = d.occupation_husb.map(occ)
    d['affair'] = (d.affairs > 0).astype(int)
    return d


def pt():
    a = pd.read_csv(RAW / 'AER_Affairs.csv')
    s = pd.read_csv(RAW / 'fair_pt.csv')
    # The two independent copies must agree row for row.
    assert len(a) == len(s) == 601
    assert (a.affairs.to_numpy() == s.naffairs.to_numpy()).all()
    assert ((a.gender == 'male').astype(int).to_numpy() == s.sex.to_numpy()).all()
    for x, y in [('age', 'age'), ('yearsmarried', 'nmarried'), ('religiousness', 'religious'),
                 ('education', 'education'), ('occupation', 'occupation'), ('rating', 'rate_marriage')]:
        assert np.allclose(a[x].to_numpy(), s[y].to_numpy()), x
    a = a.rename(columns={'rating': 'rate_marriage', 'yearsmarried': 'yrs_married', 'religiousness': 'religious',
                          'education': 'educ', 'occupation': 'occupation_rank'})
    a['affair'] = (a.affairs > 0).astype(int)
    return a


DATASETS = {
    'fair_redbook1974': dict(
        load=redbook, leaf=200,
        numeric=['rate_marriage', 'age', 'yrs_married', 'children', 'religious', 'educ'],
        categorical=['occupation', 'occupation_husb'],
        source='Redbook magazine reader survey, 1974: 6,366 married U.S. women (Fair 1978, Journal of Political Economy); copy bundled with statsmodels 0.14.4',
        population='Married women who answered a 1974 magazine questionnaire (self-selected, not a probability sample)',
        target='Probability of reporting any extramarital affair (cross-sectional; not a divorce rate)'),
    'fair_pt1969': dict(
        load=pt, leaf=40,
        numeric=['rate_marriage', 'age', 'yrs_married', 'religious', 'educ', 'occupation_rank'],
        categorical=['gender', 'children'],
        source='Psychology Today reader survey, 1969: 601 married U.S. men and women (Fair 1978); statsmodels 0.14.4 and Rdatasets AER copies, identical',
        population='Married men and women who answered a 1969 magazine questionnaire (self-selected, not a probability sample)',
        target='Probability of reporting any extramarital affair in the past year (cross-sectional; not a divorce rate)'),
}

INPUTS = dict(
    rate_marriage='self-rated marriage: 1 very poor, 2 poor, 3 fair, 4 good, 5 very good',
    age='age in years (survey bands)', yrs_married='years married (survey bands, e.g. 0.5, 2.5, 6, 9, 13, 16.5, 23)',
    children='number of children (Redbook) or yes/no (Psychology Today)',
    religious='religiousness: 1 not ... 4 strongly (Redbook); 1 anti ... 5 very (Psychology Today)',
    educ='years of schooling (9 grade school ... 20 advanced degree)',
    occupation='own occupation group', occupation_husb="husband's occupation group",
    occupation_rank='Hollingshead occupation rank 1-7 (higher is higher status)', gender='female or male')


def pipeline(kind, cfg):
    cat = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    if kind == 'rating_only':
        num = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, ['rate_marriage'])])
        est = LogisticRegression(C=1.0, max_iter=2000)
    elif kind == 'logistic_additive':
        num = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, cfg['numeric']), ('cat', cat, cfg['categorical'])])
        est = LogisticRegression(C=1.0, max_iter=2000)
    else:
        num = Pipeline([('impute', SimpleImputer(strategy='median'))])
        prep = ColumnTransformer([('num', num, cfg['numeric']), ('cat', cat, cfg['categorical'])])
        est = DecisionTreeRegressor(max_depth=3, min_samples_leaf=cfg['leaf'], random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


MODELS = [('rating_only', 'Logistic, marriage rating only'),
          ('logistic_additive', 'Additive logistic, all inputs'),
          ('tree_depth3', 'Decision tree, depth 3')]


def proba(pipe, X):
    return pipe.predict_proba(X)[:, 1] if hasattr(pipe.named_steps['fit'], 'predict_proba') else np.clip(pipe.predict(X), 1e-6, 1 - 1e-6)


def logloss(y, p):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def run(key, cfg):
    d = cfg['load']()
    y = d.affair.to_numpy()
    X = d[cfg['numeric'] + cfg['categorical']]
    repeats = 20 if len(d) < 1000 else 5
    folds = []
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=repeats, random_state=SEED)
    for i, (tr, te) in enumerate(cv.split(X, y)):
        base = np.full(len(te), y[tr].mean())
        rec = dict(split=i, constant_logloss=logloss(y[te], base))
        for k, _ in MODELS:
            p = proba(pipeline(k, cfg).fit(X.iloc[tr], y[tr]), X.iloc[te])
            rec[f'{k}_logloss'] = logloss(y[te], p)
            rec[f'{k}_auc'] = roc_auc_score(y[te], p)
            rec[f'{k}_brier'] = float(np.mean((p - y[te]) ** 2))
        folds.append(rec)
    f = pd.DataFrame(folds)
    f.to_csv(HERE / f'{key}_folds.csv', index=False, float_format='%.6g')
    comp = [dict(model='constant', logloss_improvement_percent=0.0, auc=0.5,
                 brier=float(np.mean((y - y.mean()) ** 2)))]
    for k, _ in MODELS:
        gain = 100 * (1 - f[f'{k}_logloss'] / f.constant_logloss)
        comp.append(dict(model=k, logloss_improvement_percent=float(gain.mean()),
                         improvement_min=float(gain.min()), improvement_max=float(gain.max()),
                         auc=float(f[f'{k}_auc'].mean()), auc_min=float(f[f'{k}_auc'].min()),
                         auc_max=float(f[f'{k}_auc'].max()), brier=float(f[f'{k}_brier'].mean())))
    comp = pd.DataFrame(comp)
    comp.to_csv(HERE / f'{key}_heldout_comparison.csv', index=False, float_format='%.6g')

    # Descriptive: share reporting an affair by self-rated marriage (aggregate, safe to publish).
    by_rating = d.groupby('rate_marriage').affair.agg(['size', 'sum', 'mean']).reset_index()
    by_rating.columns = ['rate_marriage', 'people', 'any_affair', 'share']
    by_rating.to_csv(HERE / f'{key}_affair_by_rating.csv', index=False, float_format='%.4f')

    pipes = {k: pipeline(k, cfg).fit(X, y) for k, _ in MODELS}
    tree = pipes['tree_depth3']
    (HERE / f'{key}_tree_depth3.txt').write_text(export_text(
        tree.named_steps['fit'], feature_names=tree.named_steps['prep'].get_feature_names_out().tolist(), decimals=3))
    lr = pipes['logistic_additive']
    names = lr.named_steps['prep'].get_feature_names_out()
    coef = lr.named_steps['fit'].coef_[0]
    scale = lr.named_steps['prep'].named_transformers_['num'].named_steps['scale'].scale_
    per_unit = np.concatenate([coef[:len(scale)] / scale, coef[len(scale):]])
    pd.DataFrame(dict(feature=names, coef_standardized=coef, odds_ratio_per_unit_or_vs_reference=np.exp(per_unit))).to_csv(
        HERE / f'{key}_logistic_odds_ratios.csv', index=False, float_format='%.4f')

    held = comp.set_index('model')
    bundle = dict(
        id=key, version=1, source=cfg['source'], population=cfg['population'], target=cfg['target'],
        outcome='probability',
        training=dict(respondents=len(d), events=int(y.sum()), prevalence=round(float(y.mean()), 4)),
        constant_probability=float(y.mean()),
        support={c: [float(d[c].min()), float(d[c].max())] for c in cfg['numeric']},
        inputs={c: INPUTS[c] for c in cfg['numeric'] + cfg['categorical']},
        evaluation=f'5-fold stratified cross-validation repeated {repeats} times; one row per person',
        abstain=['same-sex couples (not asked)', 'any input outside the support',
                 'a divorce estimate: this lens predicts reported affairs, not divorce'],
        models=[dict(key=k, label=lbl,
                     # Bernoulli deviance is 2n x log loss, so the log-loss gain is the deviance gain the
                     # app's lens summary reads.
                     heldout=dict(logloss_improvement_percent=round(float(held.loc[k, 'logloss_improvement_percent']), 3),
                                  deviance_improvement_percent=round(float(held.loc[k, 'logloss_improvement_percent']), 3),
                                  auc=round(float(held.loc[k, 'auc']), 4), brier=round(float(held.loc[k, 'brier']), 5)),
                     **export(pipes[k])) for k, lbl in MODELS],
        affair_by_rating=json.loads(by_rating.to_json(orient='records')),
        sklearn=sklearn.__version__)
    (OUT / f'{key}.json').write_text(json.dumps(bundle, separators=(',', ':')))

    rng = np.random.default_rng(SEED)
    rows = []
    levels = {c: sorted(d[c].astype(str).unique()) for c in cfg['categorical']}
    lo_hi = bundle['support']
    for i in range(50):
        r = {c: str(rng.choice(levels[c])) for c in cfg['categorical']}
        for c in cfg['numeric']:
            lo, hi = lo_hi[c]
            r[c] = None if (i % 11 == 0 and c == 'educ') else float(rng.uniform(lo - 1, hi + 1))
        rows.append(r)
    t = pd.DataFrame(rows)
    (OUT / f'{key}_testvectors.json').write_text(json.dumps(dict(
        rows=json.loads(t.replace({np.nan: None}).to_json(orient='records')),
        predictions={k: [float(v) for v in proba(pipes[k], t)] for k in pipes})))
    print(f'== {key}: {len(d)} people, {int(y.sum())} report an affair ({y.mean():.1%})')
    print(comp.round(4).to_string(index=False))
    print(by_rating.round(3).to_string(index=False))
    return bundle


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for key, cfg in DATASETS.items():
        run(key, cfg)
