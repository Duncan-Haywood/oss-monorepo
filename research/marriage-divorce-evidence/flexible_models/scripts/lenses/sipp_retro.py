"""SIPP retrospective first marriages from 1960 (five Census SIPP cross-sections): annual
dissolution rate from the wedding (separation, or divorce without a separation date).

Marriages, intervals, weights and household folds (households shuffled with SEED, k % 5) are
train_retro.py's. The lens records few pre-wedding facts: age at marriage, wedding year, sex,
race-ethnicity, nativity, and (2001-2008 modules only) education at the wedding, which is the
widest set ('Not asked' elsewhere). With 2.7 million marriage-years the benchmark runs on a
seeded HOUSEHOLD subsample (--sample); the learning curve says what the rest would add.
Work dir: $SIPP_WORK (default <scratch>/sipp_work) with retro.parquet.
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
    import train_retro as tr
    m, _ = tr.load(work)
    hh = m.hh.unique()
    rng = np.random.default_rng(tr.SEED)
    rng.shuffle(hh)
    fold_of = pd.Series(np.arange(len(hh)) % 5, index=hh)
    if sample:
        keep = np.random.default_rng(1).choice(hh, int(len(hh) * sample), replace=False)
        m = m[m.hh.isin(keep)].reset_index(drop=True)
        m['id'] = np.arange(len(m))
    m[tr.EDU] = m[tr.EDU].astype(object).where(m.tm2 == 1, 'Not asked').fillna('Unknown')
    iv = tr.intervals(m)
    for col in tr.CATEGORICAL + [tr.EDU]:
        iv[col] = iv[col].astype(str)
    person = iv.id.to_numpy()
    fold = iv.hh.map(fold_of).to_numpy()
    num = list(tr.NUMERIC)
    cat = list(tr.CATEGORICAL) + [tr.EDU]
    m['T'], m['D'], m['W'], m['group'] = m.t, m.event, m.weight, m.hh
    m['marriage_years'] = 0.0
    for col in tr.CATEGORICAL + [tr.EDU]:
        m[col] = m[col].astype(str)

    class P:
        def __init__(self, d, kind):
            self.p = tr.fit(kind, d)

        def predict(self, d):
            return self.p.predict(d)

    L = flex.Lens(
        name='sipp_retro', family='poisson', df=iv, num=num, cat=cat, y=iv.event.to_numpy(float), e=iv.exposure.to_numpy(float),
        w=iv.weight.to_numpy(float), group=iv.hh.to_numpy(), folds=[fold], baseline=lambda d: P(d, 'additive_spline'),
        ycol='event', dur='marriage_years', baseline_label='additive spline Poisson GLM (train_retro.py additive_spline)',
        lens_models={'baseline_all_inputs': lambda d: P(d, 'additive_spline_education'), 'lens_boosting': lambda d: P(d, 'gradient_boosting')},
        person=person, people=m, score_fn=c.grid_score('marriage_years', 10), score_label="Harrell's C (10-year cumulative hazard)",
        metric_label='Poisson deviance gain vs constant; Harrell C',
        notes=['household folds = train_retro.py shuffle'] + ([f'seeded household subsample {sample}'] if sample else []))
    wy = iv.marriage_year.to_numpy()
    L.oot = (wy < 1990, wy >= 1990)
    L.oot_label = 'train weddings 1960-1989, test 1990 and later'
    return L
