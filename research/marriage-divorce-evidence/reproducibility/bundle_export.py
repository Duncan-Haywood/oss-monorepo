"""Export fitted scikit-learn pipelines to the plain-JSON model format app/engine.js reads.

Pipelines are Pipeline([('prep', ColumnTransformer([('num', ...), ('cat', ...)])), ('fit', est)])
where 'num' is SimpleImputer(median) -> [SplineTransformer] -> [StandardScaler] and 'cat' is
OneHotEncoder(drop='first', handle_unknown='ignore'). Estimators: PoissonRegressor
(kind 'poisson_glm'), LogisticRegression (kind 'logistic_glm', binary) and
DecisionTreeRegressor (kind 'tree'; leaf value = mean outcome, a rate or a probability).
"""


def export(pipe):
    prep, est = pipe.named_steps['prep'], pipe.named_steps['fit']
    num, cat = None, dict(columns=[], categories=[], drop_first=[])
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
    out = dict(numeric=num, categorical=cat, feature_names=prep.get_feature_names_out().tolist())
    if type(est).__name__ == 'LogisticRegression':
        assert list(est.classes_) == [0, 1], est.classes_
        out.update(kind='logistic_glm', intercept=float(est.intercept_[0]), coef=est.coef_[0].tolist())
    elif hasattr(est, 'coef_'):
        out.update(kind='poisson_glm', intercept=float(est.intercept_), coef=est.coef_.tolist())
    else:
        t = est.tree_
        out.update(kind='tree', tree=dict(left=t.children_left.tolist(), right=t.children_right.tolist(),
                                          feature=t.feature.tolist(), threshold=t.threshold.tolist(),
                                          value=t.value[:, 0, 0].tolist(), n_node_samples=t.n_node_samples.tolist()))
    return out
