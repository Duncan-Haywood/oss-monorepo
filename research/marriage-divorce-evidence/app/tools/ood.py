"""Distance-to-training-data score for abstention (ROADMAP section B, item 3).

A profile's squared Mahalanobis distance from the training profiles, computed on the inputs
a model sees about the couple (numeric inputs median-imputed; categories one-hot with the
first level dropped). The distance is turned into a percentile against HELD-OUT people: for
each person fold, the mean and covariance are fitted on the other folds and the held-out
people's distances are recorded. A percentile of 99 means only 1% of real held-out
couples were as far from the people the model was trained on. The app can abstain above a
threshold instead of extrapolating.

Unweighted on purpose: this measures how many people in the data resemble a profile (data
support), not how common the profile is in the population.
"""
import numpy as np


def _design(d, numeric, categorical, medians, levels):
    cols = [d[c].astype(float).fillna(medians[c]).to_numpy() for c in numeric]
    for c in categorical:
        v = d[c].astype(str).to_numpy()
        cols += [(v == lv).astype(float) for lv in levels[c][1:]]
    return np.column_stack(cols)


def _fit(d, numeric, categorical, levels):
    medians = {c: float(d[c].median()) for c in numeric}
    X = _design(d, numeric, categorical, medians, levels)
    mean = X.mean(axis=0)
    cov = np.cov(X, rowvar=False)
    # A pseudo-inverse copes with one-hot columns that are (nearly) collinear.
    return dict(medians=medians, mean=mean, precision=np.linalg.pinv(cov, rcond=1e-10, hermitian=True))


def _d2(fit, d, numeric, categorical, levels):
    X = _design(d, numeric, categorical, fit['medians'], levels) - fit['mean']
    return np.einsum('ij,jk,ik->i', X, fit['precision'], X)


def build(people, fold, numeric, categorical, levels, n_quantiles=201):
    """`people`: one row per person; `fold`: array of fold ids. Returns the JSON spec and the
    held-out distances (for reporting)."""
    held = np.empty(len(people))
    for f in np.unique(fold):
        tr, te = people[fold != f], people[fold == f]
        held[fold == f] = _d2(_fit(tr, numeric, categorical, levels), te, numeric, categorical, levels)
    final = _fit(people, numeric, categorical, levels)
    qs = np.linspace(0, 1, n_quantiles)
    spec = dict(
        method='squared Mahalanobis distance on the model inputs; percentile against held-out people (5 person folds)',
        numeric=numeric, categorical=categorical, levels={c: levels[c] for c in categorical},
        medians=final['medians'], mean=final['mean'].tolist(), precision=final['precision'].tolist(),
        heldout_quantiles=dict(p=qs.tolist(), d2=np.quantile(held, qs).tolist()),
        people=int(len(people)), abstain_above_percentile=99.0)
    return spec, held, final


def score(spec_fit, d, numeric, categorical, levels):
    return _d2(spec_fit, d, numeric, categorical, levels)
