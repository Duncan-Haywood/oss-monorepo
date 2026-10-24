"""Export fitted scikit-learn pipelines to the plain-JSON model format app/engine.js reads.

Pipelines are Pipeline([('prep', ColumnTransformer([('num', ...), ('cat', ...)])), ('fit', est)])
where 'num' is SimpleImputer(median) -> [SplineTransformer] -> [StandardScaler] and 'cat' is
OneHotEncoder(drop='first', handle_unknown='ignore'). Estimators: PoissonRegressor
(kind 'poisson_glm'), LogisticRegression (kind 'logistic_glm', binary) and
DecisionTreeRegressor (kind 'tree'; leaf value = mean outcome, a rate or a probability),
HistGradientBoostingRegressor(loss='poisson') (kind 'boosted': exp(baseline + sum of tree
leaf values), the format app/tools/train_nsfg2002_family.py introduced) and
RandomForestRegressor of Poisson trees (kind 'forest': mean of tree leaf rates).
Pipelines whose estimator is none of these raise rather than export something the engine
cannot reproduce.
"""
import numpy as np


def export(pipe):
    prep, est = pipe.named_steps['prep'], pipe.named_steps['fit']
    num, cat = None, dict(columns=[], categories=[], drop_first=[])
    for name, tr, cols in prep.transformers_:
        if len(cols) == 0:
            continue
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
    if num is None:
        num = dict(columns=[], impute=[])
    out = dict(numeric=num, categorical=cat, feature_names=prep.get_feature_names_out().tolist())
    if type(est).__name__ == 'LogisticRegression':
        assert list(est.classes_) == [0, 1], est.classes_
        out.update(kind='logistic_glm', intercept=float(est.intercept_[0]), coef=est.coef_[0].tolist())
    elif hasattr(est, 'coef_'):
        out.update(kind='poisson_glm', intercept=float(est.intercept_), coef=est.coef_.tolist())
    elif type(est).__name__ == 'HistGradientBoostingRegressor':
        assert est.loss == 'poisson', est.loss
        trees = []
        for (pred,) in est._predictors:
            n = pred.nodes
            assert not n['is_categorical'].any()
            trees.append(dict(left=[int(v) if not leaf else -1 for v, leaf in zip(n['left'], n['is_leaf'])],
                              right=[int(v) if not leaf else -1 for v, leaf in zip(n['right'], n['is_leaf'])],
                              feature=n['feature_idx'].astype(int).tolist(), threshold=n['num_threshold'].tolist(),
                              missing_left=n['missing_go_to_left'].astype(bool).tolist(),
                              value=n['value'].tolist(), n_node_samples=n['count'].astype(int).tolist()))
        out.update(kind='boosted', baseline=float(np.ravel(est._baseline_prediction)[0]), trees=trees)
    elif type(est).__name__ == 'RandomForestRegressor':
        out.update(kind='forest', trees=[_tree(e.tree_) for e in est.estimators_])
    elif hasattr(est, 'tree_'):
        out.update(kind='tree', tree=_tree(est.tree_))
    else:
        raise TypeError(f'no engine format for {type(est).__name__}')
    return out


def _tree(t):
    return dict(left=t.children_left.tolist(), right=t.children_right.tolist(),
                feature=t.feature.tolist(), threshold=t.threshold.tolist(),
                value=t.value[:, 0, 0].tolist(), n_node_samples=t.n_node_samples.tolist())
