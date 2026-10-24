"""NLSY97 first marriages from the wedding: annual dissolution (separation or divorce) rate.

Marriages, intervals, weights and person folds (ids shuffled with SEED + repeat, k % 5) are
train_models.py's; features are its inputs plus every block of the more-predictors
extended_predictors.py (race detail, 6-level family of origin, religion detail, political
interest, occupation, wealth components).
Work dir: $NLSY97_WORK (default <scratch>/nlsy97_work) with marriages.pkl, extract.csv, extract_ext.csv.
"""
import os

import numpy as np
import pandas as pd

from . import _common as c

LENS = 'nlsy97_first_marriage'
REPEATS = int(os.environ.get('FLEX_NLSY97_REPEATS', 1))


def load(sample=None):
    import flex
    os.environ.setdefault('NLSY97_WORK', str(c.SCRATCH / 'nlsy97_work'))
    c.lens_path(LENS)
    c.extended_eval()
    import train_models as tm
    ext = c.branch_module(LENS, 'extended_predictors.py', 'nlsy97_extended_predictors')
    raw = c.SCRATCH / 'flex_data' / 'nlsy97_marriages.parquet'  # marriages.pkl re-saved as parquet (pickles are pandas-version bound)
    m = tm.prepare(pd.read_parquet(raw) if raw.exists() else pd.read_pickle(tm.WORK / 'marriages.pkl'))
    m = pd.concat([m, ext.new_features(m)], axis=1)
    if sample:
        m = m.sample(frac=sample, random_state=1).reset_index(drop=True)
    iv = tm.intervals(m)
    pos = pd.Series(np.arange(len(m)), index=m.id)
    person = pos.loc[iv.id].to_numpy()
    allfeats = ext.variants()['current + all new blocks']
    feats = list(dict.fromkeys(list(tm.FEATURES) + allfeats))
    numall = tm.NUMERIC_ALL + ext.NEW_NUMERIC
    num = ['marriage_years'] + [x for x in feats if x in numall and x != 'marriage_years']
    cat = [x for x in feats if x not in numall]
    folds = []
    for r in range(REPEATS):
        ids = m.id.to_numpy().copy()
        np.random.default_rng(tm.SEED + r).shuffle(ids)
        fold_of = {i: k % 5 for k, i in enumerate(ids)}
        folds.append(iv.id.map(fold_of).to_numpy())
    m['T'], m['D'], m['W'], m['group'] = m.years, m.event, m.weight, np.arange(len(m))
    m['marriage_years'] = 0.0

    class P:
        def __init__(self, d, kind=None, feats=None):
            self.p = tm.fit(kind, d, tm.FEATURES, tm.ALPHA) if feats is None else ext.fitp(feats, d)

        def predict(self, d):
            return self.p.predict(d)

    return flex.Lens(
        name='nlsy97', family='poisson', df=iv, num=num, cat=cat, y=iv.event.to_numpy(float), e=iv.exposure.to_numpy(float),
        w=iv.weight.to_numpy(float), group=person, folds=folds, baseline=lambda d: P(d, 'additive_spline'), ycol='event',
        dur='marriage_years', baseline_label='additive spline Poisson GLM (train_models.py additive_spline, alpha 1e-3)',
        lens_models={'baseline_all_inputs': lambda d: P(d, feats=allfeats), 'lens_boosting': lambda d: P(d, 'gradient_boosting'),
                     'lens_spline_pairs': lambda d: P(d, 'spline_pairs')},
        person=person, people=m, score_fn=c.grid_score('marriage_years', 10), score_label="Harrell's C (10-year cumulative hazard)",
        metric_label='Poisson deviance gain vs constant; Harrell C',
        notes=[f'person folds = train_models.cross_validate shuffle, {REPEATS} repeat(s)'])
