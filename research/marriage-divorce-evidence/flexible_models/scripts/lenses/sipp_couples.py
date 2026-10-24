"""SIPP married couples 2018->19 to 2024->25: separation or divorce within a year (couple-years).

Couple-years, outcome, weights and household folds (households shuffled with SEED, k % 5) are
train_prospective.py's. Baseline: its best GLM ('demographics': spline additive logistic of both
spouses' ages, marriage length, times married and education; C by inner household CV). Widest set:
demographics + every economic input + the more-predictors blocks (each spouse's occupation, the
husband's race-ethnicity, five wealth components).
Work dir: $SIPP_WORK (default <scratch>/sipp_work) with pu/sipp_pu{Y}.parquet and pu/sipp_ext{Y}.parquet.
"""
import os

import numpy as np
import pandas as pd

from . import _common as c

LENS = 'sipp_marital_history'


def load(sample=None):
    import flex
    work = os.environ.get('SIPP_WORK', str(c.SCRATCH / 'sipp_work'))
    c.lens_path(LENS)
    c.extended_eval()
    import survival_utils as su
    import train_prospective as tp
    ext = c.branch_module(LENS, 'extended_predictors.py', 'sipp_extended_predictors')
    d = ext.couples_ext(work)
    for col in tp.MONEY + ext.WEALTH:
        lo, hi = su.wquantiles(d[col].fillna(d[col].median()).to_numpy(), d.weight.to_numpy(), [0.01, 0.99])
        d[col] = d[col].clip(lo, hi)
    d = d.reset_index(drop=True)
    d['w_norm'] = d.weight / d.weight.mean()
    hh = d.SSUID.unique()
    rng = np.random.default_rng(tp.SEED)
    rng.shuffle(hh)
    fold = d.SSUID.map(pd.Series(np.arange(len(hh)) % 5, index=hh)).to_numpy()
    num = tp.DEMO_NUM + tp.ECON_NUM + ext.WEALTH
    cat = tp.DEMO_CAT + tp.ECON_CAT + ['wife_occupation', 'husband_occupation', 'husband_race_ethnicity']

    class P:
        def __init__(self, dd, kind=None, add=None):
            if add is None:
                self.p = tp.fit(kind, dd)
            else:
                cc, nn = ext.split(add)
                self.p = ext.fit(cc, nn, dd)[0]

        def predict(self, dd):
            return tp.prob(self.p, dd)

    alladd = [x for a, _ in ext.BLOCKS.values() for x in a]
    return flex.Lens(
        name='sipp_couples', family='binary', df=d, num=num, cat=cat, y=d.event.to_numpy(float), w=d.w_norm.to_numpy(float),
        group=c.group_ids(d.SSUID), folds=[fold], baseline=lambda dd: P(dd, 'demographics'), ycol='event',
        baseline_label="spline additive logistic, both spouses' demographics and education (train_prospective.py 'demographics')",
        lens_models={'lens_glm_demographics_wealth': lambda dd: P(dd, 'demographics_wealth'),
                     'baseline_all_inputs': lambda dd: P(dd, add=alladd), 'lens_boosting': lambda dd: P(dd, 'gradient_boosting')},
        metric_label='log-loss gain vs constant; AUC',
        notes=['household folds = train_prospective.py shuffle (seed 20261021)'])
