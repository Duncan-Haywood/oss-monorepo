"""NLSY79 first marriages from the wedding: annual legal-divorce rate (delayed entry at the first
interview after the wedding).

Marriages, intervals, weights and person folds (folds_for, seeds SEED + repeat) are
train_first_marriage.py's; features are its inputs plus every block of the more-predictors
extended_predictors.py (race detail, family at 14 in detail, siblings, 6-level attendance,
religion in 1979, occupation and family net wealth before the wedding).
Work dir: $NLSY79_WORK (default <scratch>/nlsy79_work) holding first_marriages.csv and the extracts.
"""
import os
import sys

import numpy as np

from . import _common as c

LENS = 'nlsy79_full'
REPEATS = int(os.environ.get('FLEX_NLSY79_REPEATS', 1))


def load(sample=None):
    import flex
    work = os.environ.get('NLSY79_WORK', str(c.SCRATCH / 'nlsy79_work'))
    c.lens_path(LENS)
    c.extended_eval()
    argv, sys.argv = sys.argv, ['train_first_marriage.py', work]
    try:
        import train_first_marriage as tf
        ext = c.branch_module(LENS, 'extended_predictors.py', 'nlsy79_extended_predictors')
    finally:
        sys.argv = argv
    m = tf.people()
    m = m.join(ext.new_features(m))
    if sample:
        m = m.sample(frac=sample, random_state=1).reset_index(drop=True)
    iv = tf.intervals(m)
    person = iv.person.to_numpy()
    num = list(tf.NUMERIC) + list(ext.NEW_NUMERIC)
    cat = list(tf.CATEGORICAL) + [x for add, _ in ext.BLOCKS.values() for x in add if x not in num]
    folds = [tf.folds_for(m, r)[person] for r in range(REPEATS)]
    m['T'], m['D'], m['W'], m['group'] = m.t, m.d, m.weight, np.arange(len(m))
    m['marriage_years'] = 0.0

    class P:
        def __init__(self, key, d, feats=None):
            if feats is None:
                self.p = tf.fit(key, d)
            else:
                cc, nn = ext.split(feats)
                self.p = ext.fit(cc, nn, d)

        def predict(self, d):
            return self.p.predict(d)

    allfeats = ext.variants()['current + all new blocks']
    return flex.Lens(
        name='nlsy79_full', family='poisson', df=iv, num=num, cat=cat, y=iv.y.to_numpy(float), e=iv.exposure.to_numpy(float),
        w=iv.weight.to_numpy(float), group=person, folds=folds, baseline=lambda d: P('additive_spline', d), ycol='y',
        dur='marriage_years', baseline_label='additive spline Poisson GLM (train_first_marriage.py additive_spline)',
        lens_models={'baseline_all_inputs': lambda d: P(None, d, allfeats), 'lens_boosting': lambda d: P('gradient_boosting', d),
                     'lens_spline_pairs': lambda d: P('spline_pairs', d)},
        person=person, people=m, score_fn=c.grid_score('marriage_years', 10),
        score_label="Harrell's C (10-year cumulative hazard; delayed entry ignored in pairing)",
        metric_label='Poisson deviance gain vs constant; Harrell C',
        notes=[f'person folds = train_first_marriage.folds_for, {REPEATS} repeat(s)'])
