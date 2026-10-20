"""Small additive GLMs used for the extra specifications (dyadic actor-partner variants, all-input
baselines) where a lens's own code has no ready pipeline: quantile splines for numerics, one-hot
categoricals, L2 logistic with C chosen by an inner grouped CV on the training rows only."""
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler


def pipe(num, cat, C):
    nump = Pipeline([('impute', SimpleImputer(strategy='median', add_indicator=True)),
                     ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False,
                                                  extrapolation='linear')),
                     ('scale', StandardScaler())])
    parts = [('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), cat)]
    if num:
        parts.insert(0, ('num', nump, num))
    return Pipeline([('prep', ColumnTransformer(parts)), ('fit', LogisticRegression(C=C, max_iter=5000))])


class LogitAdditive:
    def __init__(self, d, num, cat, ycol, groups, weight=None, grid=(0.03, 0.1, 0.3, 1.0), seed=20261020):
        y = d[ycol].to_numpy()
        w = np.ones(len(d)) if weight is None else d[weight].to_numpy(float)
        best = None
        for C in grid:
            ll = 0.0
            for tr, te in GroupKFold(4, shuffle=True, random_state=seed).split(d, groups=d[groups]):
                p = pipe(num, cat, C).fit(d.iloc[tr], y[tr], fit__sample_weight=w[tr]).predict_proba(d.iloc[te])[:, 1]
                p = np.clip(p, 1e-12, 1 - 1e-12)
                ll -= np.dot(w[te], y[te] * np.log(p) + (1 - y[te]) * np.log1p(-p))
            if best is None or ll < best[0]:
                best = (ll, C)
        self.C = best[1]
        self.p = pipe(num, cat, self.C).fit(d, y, fit__sample_weight=w)

    def predict(self, d):
        return self.p.predict_proba(d)[:, 1]
