"""ACS one-year divorce incidence (2019, 2021-2024 pooled; cross-sectional): reported a divorce in
the past 12 months among people married at some point in them.

Split and rows are train_models.py's: a seeded 10% of households per year held out (every test
row kept) and a random sample of training rows (TRAIN_ROWS = 800,000); people who divorced and
remarried within the year are dropped. One outer split (the lens has no repeats), evaluated on the
held-out households only. Features: the lens's background inputs (age, years since the wedding,
sex, times married, education, race-ethnicity, nativity, state); the after-the-event economic
inputs are excluded, as in the lens's headline comparison.
Work dir: $ACS_WORK (default <scratch>/acs_work) with acs_{year}.parquet; the derived rows are
cached in <scratch>/flex_data/acs_rows.parquet.
"""
import os

import numpy as np
import pandas as pd

from . import _common as c

LENS = 'acs_pums_multiyear'


def load(sample=None):
    import flex
    work = os.environ.get('ACS_WORK', str(c.SCRATCH / 'acs_work'))
    c.lens_path(LENS)
    import train_models as tm
    cache = c.SCRATCH / 'flex_data' / 'acs_rows.parquet'
    if cache.exists():
        a = pd.read_parquet(cache)
    else:
        a, _, _ = tm.load(work)
        a = a[a.remarried_within_year == 0].reset_index(drop=True)
        a.to_parquet(cache)
    if sample:  # subsample TRAINING rows only; the held-out households stay complete
        keep = a.is_test.to_numpy() | (np.random.default_rng(2).random(len(a)) < sample)
        a = a[keep].reset_index(drop=True)
    for col in tm.CAT:
        a[col] = a[col].astype(str)
    fold = np.where(a.is_test.to_numpy(), 0, 1)

    class P:
        def __init__(self, d, kind):
            self.p = tm.fit(kind, d)

        def predict(self, d):
            return tm.prob(self.p, d)

    L = flex.Lens(
        name='acs', family='binary', df=a, num=list(tm.NUM), cat=list(tm.CAT), y=a.event.to_numpy(float),
        w=a.weight.to_numpy(float), group=c.group_ids(a.year.astype(str) + '_' + a.hh.astype(str)), folds=[fold],
        baseline=lambda d: P(d, 'logistic_additive'), ycol='event',
        baseline_label='additive logistic, splines in age and marriage length, background inputs (train_models.py logistic_additive)',
        lens_models={'lens_boosting': lambda d: P(d, 'gradient_boosting'), 'lens_poisson_additive': lambda d: P(d, 'poisson_additive')},
        metric_label='log-loss gain vs constant on held-out households; AUC',
        notes=['single household hold-out (10% per year) as in train_models.py; training rows sampled'] +
              ([f'training rows subsampled to {sample} of the lens sample'] if sample else []))
    L.eval_folds = [0]
    return L
