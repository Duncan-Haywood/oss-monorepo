"""NLSY79 married couples observed 2000-2022: annual legal-divorce rate per two-year interval.

Rows, weights and respondent folds are ml_couples/train_models.py's (GroupKFold by respondent,
shuffled, seed 20261019). That script runs at import, so its helper functions (cutpoints learned
on the training fold, `prepare`, `pipeline`) are executed from its source text without its
top-level I/O. Baseline: its 'Additive enriched' Poisson GLM. Flexible models see the RAW
inputs behind its bands (husband's and wife's wages, couple wages, family income, wife's wage
share, ages, marriage length) plus every categorical input.
Dyadic specifications (additive spline Poisson GLMs, same other inputs):
  dyad_separate_glm   husband's and wife's schooling and wages as separate terms
  dyad_apim_glm       + schooling direction (match) and wife's wage share
  dyad_summary_glm    couple wages, earnings pair and schooling direction only
Input: ml_couple_input.csv and respondent_folds.csv from reproduce_ml_couples.py's scratch tree
($NLSY79_COUPLES_DIR, default <scratch>/repro/reproducibility/ml_couples).
"""
import ast
import os
from pathlib import Path

import numpy as np
import pandas as pd

from . import _common as c

SHARED_NUM = ['age', 'current_marriage_years', 'first_marriage_age', 'family_income']
SHARED_CAT = ['sex', 'marriage_order_group', 'wave', 'education', 'work', 'religion_refresh']


def helpers():
    src = (c.REPRO / 'ml_couples' / 'train_models.py').read_text()
    tree = ast.parse(src)
    keep = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.FunctionDef))
            or (isinstance(n, ast.Assign) and all(isinstance(t, ast.Name) and t.id in
                                                  ('SEED', 'core_cat', 'extra_cat', 'core_num', 'extra_num', 'models')
                                                  for t in n.targets))]
    ns = {}
    exec(compile(ast.Module(body=keep, type_ignores=[]), 'ml_couples_helpers', 'exec'), ns)
    return ns


def load(sample=None):
    import flex
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import PoissonRegressor
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
    d = Path(os.environ.get('NLSY79_COUPLES_DIR', c.SCRATCH / 'repro' / 'reproducibility' / 'ml_couples'))
    f = pd.read_csv(d / 'ml_couple_input.csv')
    folds = pd.read_csv(d / 'respondent_folds.csv')
    assert (folds.id.to_numpy() == f.id.to_numpy()).all() and (folds.start_wave.to_numpy() == f.start_wave.to_numpy()).all()
    H = helpers()
    f['wave'] = f.start_wave.astype(str)
    f['abs_wage_gap'] = (f.husband_wages - f.wife_wages).abs()
    for col in ['education', 'work', 'religion_refresh', 'husband_school', 'wife_school', 'earnings_pair', 'sex',
                'marriage_order_group', 'education_direction']:
        f[col] = f[col].fillna('Unknown').astype(str)
    num = SHARED_NUM + ['husband_wages', 'wife_wages', 'couple_wages', 'wife_wage_share']
    cat = SHARED_CAT + ['husband_school', 'wife_school', 'earnings_pair', 'education_direction']

    class Base:
        def __init__(self, tr):
            self.cuts = H['fit_cutpoints'](tr)
            self.p = H['pipeline']('Additive enriched')
            self.p.fit(H['prepare'](tr, self.cuts), (tr.event / tr.exposure).to_numpy(), fit__sample_weight=(tr.weight * tr.exposure).to_numpy())

        def predict(self, df):
            return np.maximum(self.p.predict(H['prepare'](df, self.cuts)), 1e-12)

    class G:
        def __init__(self, tr, nn, cc):
            sp = Pipeline([('impute', SimpleImputer(strategy='median')),
                           ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                           ('scale', StandardScaler())])
            self.p = Pipeline([('prep', ColumnTransformer([('num', sp, nn), ('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), cc)])),
                               ('fit', PoissonRegressor(alpha=1e-4, max_iter=2000, tol=1e-9, solver='newton-cholesky'))])
            self.p.fit(tr, (tr.event / tr.exposure).to_numpy(), fit__sample_weight=(tr.weight * tr.exposure).to_numpy())

        def predict(self, df):
            return self.p.predict(df)

    sep = (SHARED_NUM + ['husband_wages', 'wife_wages'], SHARED_CAT + ['husband_school', 'wife_school'])
    apim = (sep[0] + ['wife_wage_share', 'abs_wage_gap'], sep[1] + ['education_direction'])
    summ = (SHARED_NUM + ['couple_wages'], SHARED_CAT + ['earnings_pair', 'education_direction'])
    return flex.Lens(
        name='nlsy79_couples', family='poisson', df=f, num=num, cat=cat, y=f.event.to_numpy(float), e=f.exposure.to_numpy(float),
        w=(f.weight / f.weight.mean()).to_numpy(float), group=f.id.to_numpy(), folds=[folds.fold.to_numpy() - 1],
        baseline=Base, ycol='event', baseline_label="additive enriched Poisson GLM (ml_couples/train_models.py 'Additive enriched')",
        lens_models={'dyad_separate_glm': lambda tr: G(tr, *sep), 'dyad_apim_glm': lambda tr: G(tr, *apim),
                     'dyad_summary_glm': lambda tr: G(tr, *summ), 'baseline_all_inputs': lambda tr: G(tr, num, cat)},
        metric_label='Poisson deviance gain vs constant; AUC on intervals',
        notes=['respondent folds = ml_couples respondent_folds.csv (GroupKFold, seed 20261019)',
               'weights rescaled to mean 1 (gains are scale-free)'])
